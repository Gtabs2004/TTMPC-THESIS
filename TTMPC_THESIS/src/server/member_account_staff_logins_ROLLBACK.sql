-- ROLLBACK of member_account_staff_logins.sql
-- Run in Supabase SQL editor.
--
-- Puts member_account back to ONE row per member (PRIMARY KEY membership_id):
--   * the 6 staff members' placeholder member-login rows (ttmpc-xxx@ttmpc.local,
--     no auth user) are deleted and user_id (= member.id) moves back onto
--     their staff row, exactly as before;
--   * the id column and the two new unique indexes are dropped;
--   * handle_new_member() / _restored / _trigger go back to plain
--     ON CONFLICT (membership_id).
--
-- It refuses to run (and changes nothing) if any member has logins the
-- rollback can't fold back into one row -- i.e. someone already used
-- "Create member login" or "Add staff account". Those would each be a real
-- login someone can sign in with; deleting them is your call, not a script's.
--
-- Pair with reverting the code (member_details.jsx + main.py) and restarting
-- uvicorn.

BEGIN;

-- 0) Only fold back the exact shape the migration made: one staff row plus
--    one untouched placeholder member row (auth_user_id NULL).
DO $$
DECLARE
  v_blocked text;
BEGIN
  SELECT string_agg(membership_id || ' (' || n || ' logins)', ', ')
  INTO v_blocked
  FROM (
    SELECT membership_id,
           count(*) AS n,
           count(*) FILTER (WHERE lower(btrim(coalesce(role, ''))) = 'member'
                              AND auth_user_id IS NULL) AS placeholders
    FROM public.member_account
    GROUP BY membership_id
    HAVING count(*) > 1
  ) t
  WHERE NOT (n = 2 AND placeholders = 1);

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback stopped: these members have logins created after the migration: %. Decide which login each keeps, delete the others, then re-run.', v_blocked;
  END IF;
END $$;

-- 1) Move the member link back onto the staff row, drop the placeholder.
ALTER TABLE public.member_profile DROP CONSTRAINT IF EXISTS member_profile_member_account_fk;

CREATE TEMP TABLE _placeholders ON COMMIT DROP AS
SELECT membership_id, user_id
FROM public.member_account
WHERE lower(btrim(coalesce(role, ''))) = 'member'
  AND auth_user_id IS NULL
  AND membership_id IN (
    SELECT membership_id FROM public.member_account GROUP BY membership_id HAVING count(*) = 2
  );

DELETE FROM public.member_account ma
USING _placeholders p
WHERE ma.membership_id = p.membership_id
  AND lower(btrim(coalesce(ma.role, ''))) = 'member'
  AND ma.auth_user_id IS NULL;

UPDATE public.member_account ma
SET user_id = p.user_id
FROM _placeholders p
WHERE ma.membership_id = p.membership_id;

ALTER TABLE public.member_profile
  ADD CONSTRAINT member_profile_member_account_fk
  FOREIGN KEY (member_account)
  REFERENCES public.member_account(user_id)
  ON DELETE SET NULL;

-- 2) Back to PRIMARY KEY (membership_id).
DROP INDEX IF EXISTS public.member_account_one_member_login;
DROP INDEX IF EXISTS public.member_account_auth_user_id_uk;
ALTER TABLE public.member_account DROP CONSTRAINT IF EXISTS member_account_pkey;
ALTER TABLE public.member_account ADD CONSTRAINT member_account_pkey PRIMARY KEY (membership_id);
ALTER TABLE public.member_account DROP COLUMN IF EXISTS id;

-- 3) New-member trigger functions back to plain ON CONFLICT (membership_id).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ~* 'on\s+conflict\s*\(\s*membership_id\s*\)\s*where\s+lower\(btrim\(coalesce\(role'
  LOOP
    EXECUTE regexp_replace(
      pg_get_functiondef(r.oid),
      'on\s+conflict\s*\(\s*membership_id\s*\)\s*where\s+lower\(btrim\(coalesce\(role,\s*''''\)\)\)\s*=\s*''member''',
      'ON CONFLICT (membership_id)',
      'gi'
    );
    RAISE NOTICE 'Restored %', r.oid::regprocedure;
  END LOOP;
END $$;

COMMIT;

-- Check 1: one row per member again (expect 0 rows).
SELECT membership_id, count(*) FROM public.member_account GROUP BY membership_id HAVING count(*) > 1;

-- Check 2: the 6 staff rows hold the member link again (expect 6 rows, all true).
SELECT membership_id, role, email, user_id IS NOT NULL AS holds_member_link
FROM public.member_account
WHERE lower(btrim(coalesce(role, ''))) <> 'member'
ORDER BY membership_id;

-- Check 3: functions back to the plain clause (no WHERE ... 'member').
SELECT p.proname,
       substring(pg_get_functiondef(p.oid) FROM '(?i)on\s+conflict\s*\(\s*membership_id\s*\)[^\n]*') AS on_conflict_clause
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'handle_new_member%';
