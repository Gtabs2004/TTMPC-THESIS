-- Member schema verification report
-- Run this in Supabase SQL Editor after member_schema_repair.sql.
-- Output: one result set with PASS/FAIL per check.

WITH checks AS (
  -- Table existence
  SELECT
    'table.member.exists'::text AS check_name,
    (to_regclass('public.member') IS NOT NULL) AS passed,
    CASE WHEN to_regclass('public.member') IS NOT NULL THEN 'member table exists' ELSE 'member table missing' END AS details

  UNION ALL
  SELECT
    'table.member_account.exists',
    (to_regclass('public.member_account') IS NOT NULL),
    CASE WHEN to_regclass('public.member_account') IS NOT NULL THEN 'member_account table exists' ELSE 'member_account table missing' END

  UNION ALL
  SELECT
    'table.personal_data_sheet.exists',
    (to_regclass('public.personal_data_sheet') IS NOT NULL),
    CASE WHEN to_regclass('public.personal_data_sheet') IS NOT NULL THEN 'personal_data_sheet table exists' ELSE 'personal_data_sheet table missing' END

  -- Key/unique checks
  UNION ALL
  SELECT
    'key.member.id.unique_or_pk',
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = 'public.member'::regclass
        AND c.contype IN ('p', 'u')
        AND a.attname = 'id'
    ),
    'member.id must be unique or primary key'

  UNION ALL
  SELECT
    'key.member.membership_id.unique_or_pk',
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = 'public.member'::regclass
        AND c.contype IN ('p', 'u')
        AND a.attname = 'membership_id'
    ),
    'member.membership_id must be unique or primary key'

  UNION ALL
  SELECT
    'pk.member_account.membership_id',
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = 'public.member_account'::regclass
        AND c.contype = 'p'
        AND a.attname = 'membership_id'
    ),
    'member_account primary key should be membership_id'

  UNION ALL
  SELECT
    'unique.member_account.user_id',
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = 'public.member_account'::regclass
        AND c.contype = 'u'
        AND a.attname = 'user_id'
    ),
    'member_account.user_id should be unique'

  -- FK checks
  UNION ALL
  SELECT
    'fk.member_account.user_id_to_member.id',
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace tn ON tn.oid = t.relnamespace
      JOIN pg_class rt ON rt.oid = c.confrelid
      JOIN pg_namespace rn ON rn.oid = rt.relnamespace
      JOIN pg_attribute src ON src.attrelid = c.conrelid AND src.attnum = ANY (c.conkey)
      JOIN pg_attribute dst ON dst.attrelid = c.confrelid AND dst.attnum = ANY (c.confkey)
      WHERE c.contype = 'f'
        AND tn.nspname = 'public'
        AND t.relname = 'member_account'
        AND rn.nspname = 'public'
        AND rt.relname = 'member'
        AND src.attname = 'user_id'
        AND dst.attname = 'id'
    ),
    'member_account.user_id should reference member(id)'

  UNION ALL
  SELECT
    'fk.member_account.membership_id_to_member.membership_id',
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace tn ON tn.oid = t.relnamespace
      JOIN pg_class rt ON rt.oid = c.confrelid
      JOIN pg_namespace rn ON rn.oid = rt.relnamespace
      JOIN pg_attribute src ON src.attrelid = c.conrelid AND src.attnum = ANY (c.conkey)
      JOIN pg_attribute dst ON dst.attrelid = c.confrelid AND dst.attnum = ANY (c.confkey)
      WHERE c.contype = 'f'
        AND tn.nspname = 'public'
        AND t.relname = 'member_account'
        AND rn.nspname = 'public'
        AND rt.relname = 'member'
        AND src.attname = 'membership_id'
        AND dst.attname = 'membership_id'
    ),
    'member_account.membership_id should reference member(membership_id)'

  -- RLS table state
  UNION ALL
  SELECT
    'rls.member_account.enabled',
    COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.member_account'::regclass), false),
    'member_account row level security should be enabled'

  -- Expected secure policies
  UNION ALL
  SELECT
    'policy.member_account.authenticated_read_own.exists',
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'member_account'
        AND policyname = 'authenticated read own account'
    ),
    'policy authenticated read own account should exist'

  UNION ALL
  SELECT
    'policy.member_account.authenticated_update_own.exists',
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'member_account'
        AND policyname = 'authenticated update own account'
    ),
    'policy authenticated update own account should exist'

  -- Unsafe policies must not exist
  UNION ALL
  SELECT
    'policy.member_account.unsafe_public_lookup.absent',
    NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'member_account'
        AND policyname IN (
          'Allow public read for login lookup',
          'Allow public read',
          'Public_ID_Lookup',
          'Kiosk_Universal_Visibility'
        )
    ),
    'unsafe broad member_account policies should be removed'

  -- Trigger/function checks
  UNION ALL
  SELECT
    'function.handle_new_member.exists',
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'handle_new_member'
    ),
    'public.handle_new_member function should exist'

  UNION ALL
  SELECT
    'trigger.member.on_member_created.exists',
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      WHERE t.tgrelid = 'public.member'::regclass
        AND t.tgname = 'on_member_created'
        AND NOT t.tgisinternal
    ),
    'on_member_created trigger should exist on public.member'

  -- Loan prefill policy sanity check
  UNION ALL
  SELECT
    'policy.member_applications.prefill_read_own.exists',
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'member_applications'
        AND policyname = 'authenticated read own member applications for prefill'
    ),
    'loan prefill policy should exist on member_applications'
)
SELECT
  check_name,
  CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status,
  details
FROM checks
ORDER BY
  CASE WHEN passed THEN 1 ELSE 0 END,
  check_name;
