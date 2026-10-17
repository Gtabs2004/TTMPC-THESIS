-- Time Deposit — unattended daily scheduler via pg_cron.
-- Runs entirely inside this database and only calls functions that already
-- run safely today on page load (td_mark_matured + the matured/upcoming
-- notification inserts) -- this just moves WHEN they run, from "whenever a
-- staff/member page loads" to "once a day, every day, even if nobody opens
-- the app." It does not touch savings, loans, or any table outside the
-- existing Time Deposit feature. Apply after time_deposit_08_min_override.sql.
--
-- IMPORTANT: this migration enables the pg_cron extension. If pg_cron is not
-- available on this Supabase project's plan, the `CREATE EXTENSION` line
-- below will fail and the whole transaction rolls back -- nothing is left
-- half-applied. If that happens, tell the developer and the existing
-- page-load sync (_sync_time_deposit_maturities in main.py) keeps working
-- exactly as it does today; this migration is purely additive on top of it.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Mirrors _td_notify() / the matured+upcoming block of
-- _sync_time_deposit_maturities() in main.py, as a SQL-callable function so
-- pg_cron (which can only call SQL, not FastAPI) can run it directly.
-- Email is intentionally NOT sent from here -- pg_cron has no HTTP access by
-- default on most Supabase plans, so this only writes the bell notification
-- (loan_notifications). The bell is the notification of record; email stays
-- a best-effort extra that only fires when a human loads a TD page and hits
-- the FastAPI path (main.py's _send_td_email), same as before this
-- migration. This is a deliberate, smaller scope than the page-load path,
-- not an oversight.
CREATE OR REPLACE FUNCTION public.td_notify_scheduled(p_as_of date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer := 0;
    v_row record;
    v_dedup_key text;
    v_inserted_id bigint;
BEGIN
    FOR v_row IN
        SELECT id, certificate_number, member_id
        FROM public.time_deposits
        WHERE status = 'matured'
    LOOP
        v_dedup_key := 'time_deposit:' || v_row.id::text || ':td_matured';
        INSERT INTO public.loan_notifications (
            recipient_role, recipient_member_id, title, message,
            notification_type, severity, loan_id, redirect_url, dedup_key, is_read
        ) VALUES (
            'member', v_row.member_id, 'Time Deposit matured',
            'Certificate ' || v_row.certificate_number || ' has matured. Visit the branch to withdraw your principal and interest, or renew your principal.',
            'td_matured', 'warning', NULL, '/member-statement-of-account?tab=time-deposits',
            v_dedup_key, false
        )
        ON CONFLICT (dedup_key) WHERE (is_read = false AND dedup_key IS NOT NULL) DO NOTHING
        RETURNING id INTO v_inserted_id;
        IF v_inserted_id IS NOT NULL THEN
            v_count := v_count + 1;
        END IF;
    END LOOP;

    FOR v_row IN
        SELECT id, certificate_number, member_id, maturity_date
        FROM public.time_deposits
        WHERE status = 'locked'
          AND maturity_date = p_as_of + 3
    LOOP
        v_dedup_key := 'time_deposit:' || v_row.id::text || ':td_maturity_upcoming';
        INSERT INTO public.loan_notifications (
            recipient_role, recipient_member_id, title, message,
            notification_type, severity, loan_id, redirect_url, dedup_key, is_read
        ) VALUES (
            'member', v_row.member_id, 'Time Deposit maturing soon',
            'Certificate ' || v_row.certificate_number || ' matures on ' || v_row.maturity_date::text || '. Decide whether to withdraw or renew.',
            'td_maturity_upcoming', 'info', NULL, '/member-statement-of-account?tab=time-deposits',
            v_dedup_key, false
        )
        ON CONFLICT (dedup_key) WHERE (is_read = false AND dedup_key IS NOT NULL) DO NOTHING
        RETURNING id INTO v_inserted_id;
        IF v_inserted_id IS NOT NULL THEN
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.td_notify_scheduled(date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.td_notify_scheduled(date) TO service_role;

-- One daily job, 1:00 AM Asia/Manila (17:00 UTC the prior day). Runs as the
-- database owner inside this project -- it only ever calls the two TD
-- functions above, nothing else. Safe to re-run this migration: unschedule
-- first so re-applying doesn't create a duplicate job.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'td-daily-maturity-sync') THEN
        PERFORM cron.unschedule('td-daily-maturity-sync');
    END IF;
EXCEPTION WHEN undefined_table THEN
    NULL; -- pg_cron's cron.job doesn't exist yet on first-ever apply; nothing to unschedule.
END;
$$;

SELECT cron.schedule(
    'td-daily-maturity-sync',
    '0 17 * * *',  -- 17:00 UTC = 01:00 Asia/Manila (UTC+8)
    $$
    SELECT public.td_mark_matured(current_date);
    SELECT public.td_notify_scheduled(current_date);
    $$
);

COMMIT;
