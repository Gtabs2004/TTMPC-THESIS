-- Separate staff logins from a member's own login
-- Run in Supabase SQL editor.
--
-- Before: member_account had PRIMARY KEY (membership_id), so a member could
-- have exactly ONE login. Giving someone a staff role rewrote that login, and
-- the person lost their member portal (e.g. cashier@gmail.com IS TTMPC-148's
-- only login).
--
-- After: one row per LOGIN.
--   * role = 'member'  -> the member's own login. At most one per member.
--                         Carries user_id (= member.id), which the member
--                         portal and RLS use to find "my" loans/savings.
--   * any other role   -> a staff login for that same member, with its own
--                         email and password. user_id is NULL: staff actions
--                         are already keyed on auth.uid() / email.
--
-- Every role check (RLS helpers, backend, frontend) looks an account up by
-- auth_user_id / auth.uid() / auth.email(), so each login keeps resolving to
-- its own row and its own role. Nothing that reads roles has to change.
--
-- The 6 existing staff rows keep working exactly as they are (same email,
-- password, role). A member-login row is created for each of them here, with
-- no auth user yet; BOD activates it from Manage Member > member details >
-- "Create member login" (sets its email + password).
--
-- Idempotent: safe to re-run.

BEGIN;

-- 0) Functions that upsert member_account ON CONFLICT (membership_id) -- the
--    live handle_new_member() (trigger on_member_created, fires for every new
--    member) plus the unused handle_new_member_restored/_trigger copies. That
--    target stops matching once membership_id is no longer unique, so each is
--    re-pointed at the new "one MEMBER login per member" index (step 3):
--        ON CONFLICT (membership_id) WHERE lower(btrim(coalesce(role, ''))) = 'member'
--    The live definition is patched in place (only that clause changes), so
--    whatever else the live version does is kept as-is. A function is only
--    patched when every such ON CONFLICT belongs to an INSERT INTO
--    member_account; anything else aborts the whole migration untouched.
DO $$
DECLARE
  r record;
  v_def text;
  v_all int;
  v_ma int;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ~* 'member_account'
      AND p.prosrc ~* 'on\s+conflict\s*\(\s*membership_id\s*\)'
  LOOP
    v_def := pg_get_functiondef(r.oid);

    SELECT count(*) INTO v_all
    FROM regexp_matches(v_def, 'on\s+conflict\s*\(\s*membership_id\s*\)', 'gi');
    SELECT count(*) INTO v_ma
    FROM regexp_matches(v_def, 'insert\s+into\s+(public\.)?member_account\M[^;]*?on\s+conflict\s*\(\s*membership_id\s*\)', 'gi');

    IF v_all <> v_ma THEN
      RAISE EXCEPTION '% has an ON CONFLICT (membership_id) that is not on member_account; update it by hand first.',
        r.oid::regprocedure;
    END IF;

    EXECUTE regexp_replace(
      v_def,
      'on\s+conflict\s*\(\s*membership_id\s*\)',
      'ON CONFLICT (membership_id) WHERE lower(btrim(coalesce(role, ''''))) = ''member''',
      'gi'
    );
    RAISE NOTICE 'Re-pointed % at the one-member-login index', r.oid::regprocedure;
  END LOOP;

  -- Same problem, spelled by constraint name.
  SELECT string_agg(p.oid::regprocedure::text, ', ')
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosrc ~* 'on\s+conflict\s+on\s+constraint\s+member_account_(pkey|membership_id_key)';
  IF v_def IS NOT NULL THEN
    RAISE EXCEPTION 'These functions upsert on the old member_account key by name; update them first: %', v_def;
  END IF;
END $$;

-- 1) A real per-login primary key.
ALTER TABLE public.member_account
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.member_account DROP CONSTRAINT IF EXISTS member_account_pkey;
ALTER TABLE public.member_account DROP CONSTRAINT IF EXISTS member_account_membership_id_key;
DROP INDEX IF EXISTS public.member_account_membership_id_key;
ALTER TABLE public.member_account ADD CONSTRAINT member_account_pkey PRIMARY KEY (id);

-- 2) Move the member link (user_id = member.id) off each staff row onto a new
--    member-login row. member_profile.member_account references user_id with
--    no ON UPDATE rule, so the FK is lifted for the swap and re-added after;
--    the same user_id value exists again by then.
ALTER TABLE public.member_profile DROP CONSTRAINT IF EXISTS member_profile_member_account_fk;

CREATE TEMP TABLE _staff_links ON COMMIT DROP AS
SELECT membership_id, user_id
FROM public.member_account
WHERE lower(btrim(coalesce(role, ''))) <> 'member'
  AND user_id IS NOT NULL;

UPDATE public.member_account ma
SET user_id = NULL
FROM _staff_links s
WHERE ma.membership_id = s.membership_id
  AND lower(btrim(coalesce(ma.role, ''))) <> 'member';

INSERT INTO public.member_account
  (membership_id, user_id, role, email, is_temporary, is_email_dummy, is_active, auth_user_id)
SELECT s.membership_id,
       s.user_id,
       'Member',
       lower(s.membership_id) || '@ttmpc.local',
       true,
       true,
       true,
       NULL
FROM _staff_links s
WHERE NOT EXISTS (
  SELECT 1 FROM public.member_account m
  WHERE m.membership_id = s.membership_id
    AND lower(btrim(coalesce(m.role, ''))) = 'member'
);

ALTER TABLE public.member_profile
  ADD CONSTRAINT member_profile_member_account_fk
  FOREIGN KEY (member_account)
  REFERENCES public.member_account(user_id)
  ON DELETE SET NULL;

-- 3) At most one member login per member; one row per auth user.
CREATE UNIQUE INDEX IF NOT EXISTS member_account_one_member_login
  ON public.member_account (membership_id)
  WHERE lower(btrim(coalesce(role, ''))) = 'member';

CREATE UNIQUE INDEX IF NOT EXISTS member_account_auth_user_id_uk
  ON public.member_account (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMIT;

-- Check 1: no member has two member logins (expect 0 rows).
SELECT membership_id, count(*)
FROM public.member_account
WHERE lower(btrim(coalesce(role, ''))) = 'member'
GROUP BY membership_id
HAVING count(*) > 1;

-- Check 2: the 6 staff members now have both logins. The member login shows
-- auth_user_id NULL until BOD activates it.
SELECT membership_id, role, email, user_id IS NOT NULL AS holds_member_link, auth_user_id
FROM public.member_account
WHERE membership_id IN (
  SELECT membership_id FROM public.member_account
  WHERE lower(btrim(coalesce(role, ''))) <> 'member'
)
ORDER BY membership_id, role;

-- Check 3: the new-member trigger functions now target the member-login
-- index (each row should show the WHERE ... = 'member' clause).
SELECT p.proname,
       substring(pg_get_functiondef(p.oid) FROM '(?i)on\s+conflict\s*\(\s*membership_id\s*\)[^\n]*') AS on_conflict_clause
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'handle_new_member%';
