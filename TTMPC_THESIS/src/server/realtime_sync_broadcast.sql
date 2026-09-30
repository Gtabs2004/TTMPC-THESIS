-- Workspace-wide realtime sync: every write to a public table broadcasts a
-- small "something changed" event so open screens refetch in place.
-- Run in Supabase SQL editor.
--
-- Why a DB trigger rather than a FastAPI publisher: writes reach the database
-- three ways — FastAPI on the service-role key, direct supabase-js calls from
-- the browser, and Postgres RPCs/triggers (isc_post, approve_bookkeeper_payment,
-- the CBU sync triggers, ...). Only the database sees all three, so this is
-- the one place that can't miss a mutation.
--
-- Transport: Supabase Realtime "Broadcast from Database" (realtime.send) on the
-- private topic 'db-changes'. The frontend's <RealtimeSync /> holds one
-- WebSocket for the session and invalidates/refetches whatever is on screen.
--
-- Payload is deliberately slim — no row data:
--   { "type": "MUTATION_EVENT", "entity": "<table>", "action": "CREATE|UPDATE|DELETE",
--     "timestamp": <epoch ms> }
-- Clients refetch through their normal RLS-guarded queries / FastAPI calls, so
-- a broadcast never exposes a row the receiver couldn't already read.
--
-- Statement-level triggers: one event per statement, not per row, so a bulk
-- UPDATE of 700 rows is one event (the client also coalesces bursts).
--
-- New tables are NOT covered automatically — re-run
--   SELECT public.realtime_sync_attach_all();
-- after creating one. Idempotent: safe to re-run this whole file.
--
-- Rollback:
--   SELECT public.realtime_sync_detach_all();
--   DROP POLICY IF EXISTS "db-changes: signed-in users receive" ON realtime.messages;

BEGIN;

DO $$
BEGIN
    IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
        RAISE EXCEPTION 'realtime.send() not found — this project''s Realtime does not support Broadcast from Database.';
    END IF;
END $$;

-- 1) The publisher. Never lets a broadcast failure roll back the write.
CREATE OR REPLACE FUNCTION public.realtime_broadcast_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM realtime.send(
        jsonb_build_object(
            'type', 'MUTATION_EVENT',
            'entity', TG_TABLE_NAME,
            'action', CASE TG_OP
                          WHEN 'INSERT' THEN 'CREATE'
                          WHEN 'UPDATE' THEN 'UPDATE'
                          ELSE 'DELETE'          -- DELETE and TRUNCATE
                      END,
            'timestamp', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
        ),
        'mutation',     -- broadcast event name the client listens for
        'db-changes',   -- topic
        true            -- private: only receivers allowed by the policy below
    );
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'realtime_broadcast_mutation(%): %', TG_TABLE_NAME, SQLERRM;
    RETURN NULL;
END;
$$;

-- 2) Attach / detach on every base table in public.
--    Excluded by default: tables no screen shows, whose writes would only make
--    every open dashboard refetch (OTP codes, kiosk sign-ins, the outbound
--    email log, import staging, one-off backup/remap tables). Excluded tables
--    have the trigger removed if a previous run attached it.
DROP FUNCTION IF EXISTS public.realtime_sync_attach_all(text[]);
CREATE OR REPLACE FUNCTION public.realtime_sync_attach_all(
    p_exclude text[] DEFAULT ARRAY[
        'account_change_otp',
        'kiosk_auth',
        'loan_email_log',
        'member_import_stage',
        'loans_member_id_backup_20260730',
        'loan_payment_reference_remap'
    ]::text[]
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    r record;
    n integer := 0;
BEGIN
    FOR r IN
        SELECT c.relname, (c.relname = ANY (p_exclude)) AS excluded
        FROM pg_class c
        JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND NOT c.relispartition
        ORDER BY c.relname
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS zz_realtime_sync ON public.%I', r.relname);
        CONTINUE WHEN r.excluded;
        EXECUTE format(
            'CREATE TRIGGER zz_realtime_sync
                 AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I
                 FOR EACH STATEMENT EXECUTE FUNCTION public.realtime_broadcast_mutation()',
            r.relname
        );
        n := n + 1;
    END LOOP;
    RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.realtime_sync_detach_all()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    r record;
    n integer := 0;
BEGIN
    FOR r IN
        SELECT c.relname
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public'
          AND t.tgname = 'zz_realtime_sync'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS zz_realtime_sync ON public.%I', r.relname);
        n := n + 1;
    END LOOP;
    RETURN n;
END;
$$;

-- Admin utilities, not for the browser.
REVOKE ALL ON FUNCTION public.realtime_sync_attach_all(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.realtime_sync_detach_all() FROM PUBLIC, anon, authenticated;

-- 3) Who may receive on the private topic: any signed-in user. No INSERT
--    policy, so browsers can listen but can't forge events.
DROP POLICY IF EXISTS "db-changes: signed-in users receive" ON realtime.messages;
CREATE POLICY "db-changes: signed-in users receive"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
    (SELECT realtime.topic()) = 'db-changes'
    AND realtime.messages.extension IN ('broadcast')
);

SELECT public.realtime_sync_attach_all() AS tables_attached;

COMMIT;

-- Check: tables now carrying the trigger (should be every public table).
SELECT c.relname AS table_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE t.tgname = 'zz_realtime_sync'
ORDER BY 1;
