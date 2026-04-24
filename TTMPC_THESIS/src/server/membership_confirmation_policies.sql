-- Run this in Supabase SQL editor.
-- It enables RLS and allows backend service role access for membership confirmation.

ALTER TABLE IF EXISTS membership_application ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS member_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS member ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.membership_application ADD COLUMN IF NOT EXISTS membership_id TEXT;
ALTER TABLE IF EXISTS public.membership_application ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.membership_application ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE IF EXISTS public.membership_application ADD COLUMN IF NOT EXISTS approved_by_role TEXT;

ALTER TABLE IF EXISTS public.member_applications ADD COLUMN IF NOT EXISTS membership_id TEXT;
ALTER TABLE IF EXISTS public.member_applications ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.member_applications ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE IF EXISTS public.member_applications ADD COLUMN IF NOT EXISTS approved_by_role TEXT;

CREATE OR REPLACE FUNCTION public.is_membership_staff()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF to_regclass('public.member_account') IS NOT NULL THEN
    SELECT lower(btrim(coalesce(ma.role, '')))
    INTO v_role
    FROM public.member_account ma
     WHERE ma.user_id = auth.uid()
       OR ma.auth_user_id = auth.uid()
       OR lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
    LIMIT 1;

    IF v_role IN ('bod', 'manager', 'secretary') THEN
      RETURN true;
    END IF;
  END IF;

  IF to_regclass('public.member_accounts') IS NOT NULL THEN
    SELECT lower(btrim(coalesce(ma.role, '')))
    INTO v_role
    FROM public.member_accounts ma
     WHERE ma.user_id = auth.uid()
       OR ma.auth_user_id = auth.uid()
       OR lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
    LIMIT 1;

    IF v_role IN ('bod', 'manager', 'secretary') THEN
      RETURN true;
    END IF;
  END IF;

  v_role := lower(btrim(coalesce(
    auth.jwt() ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  )));

  RETURN v_role IN ('bod', 'manager', 'secretary');
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.membership_application') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "service role read applications" ON membership_application';
    EXECUTE 'CREATE POLICY "service role read applications" ON membership_application FOR SELECT USING (auth.role() = ''service_role'')';

    EXECUTE 'DROP POLICY IF EXISTS "staff read applications" ON membership_application';
    EXECUTE 'CREATE POLICY "staff read applications" ON membership_application FOR SELECT TO authenticated USING (public.is_membership_staff())';

    EXECUTE 'DROP POLICY IF EXISTS "service role update applications" ON membership_application';
    EXECUTE 'CREATE POLICY "service role update applications" ON membership_application FOR UPDATE USING (auth.role() = ''service_role'')';
  END IF;

  IF to_regclass('public.member_applications') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "service role read applications" ON member_applications';
    EXECUTE 'CREATE POLICY "service role read applications" ON member_applications FOR SELECT USING (auth.role() = ''service_role'')';

    EXECUTE 'DROP POLICY IF EXISTS "staff read applications" ON member_applications';
    EXECUTE 'CREATE POLICY "staff read applications" ON member_applications FOR SELECT TO authenticated USING (public.is_membership_staff())';

    EXECUTE 'DROP POLICY IF EXISTS "service role update applications" ON member_applications';
    EXECUTE 'CREATE POLICY "service role update applications" ON member_applications FOR UPDATE USING (auth.role() = ''service_role'')';
  END IF;
END $$;

-- Cleanup policy: when an auth user is deleted, remove related membership records.
-- This avoids orphaned rows in membership-related tables.
CREATE OR REPLACE FUNCTION public.cleanup_membership_related_data_on_auth_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := OLD.id;
  v_email text := lower(btrim(coalesce(OLD.email, '')));
  v_membership_id text := NULL;
BEGIN
  -- Resolve membership id before deleting member row.
  IF to_regclass('public.member') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'member'
        AND column_name = 'membership_id'
    ) THEN
      SELECT m.membership_id
      INTO v_membership_id
      FROM public.member m
      WHERE m.id = v_user_id
      LIMIT 1;
    END IF;
  END IF;

  IF v_membership_id IS NULL
     AND to_regclass('public.member_applications') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'member_applications'
         AND column_name = 'membership_id'
     )
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'member_applications'
         AND column_name = 'email'
     )
     AND v_email <> ''
  THEN
    SELECT ma.membership_id
    INTO v_membership_id
    FROM public.member_applications ma
    WHERE lower(coalesce(ma.email, '')) = v_email
      AND ma.membership_id IS NOT NULL
    ORDER BY ma.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- Delete account table rows.
  IF to_regclass('public.member_account') IS NOT NULL THEN
    DELETE FROM public.member_account
    WHERE (v_email <> '' AND lower(coalesce(email, '')) = v_email)
       OR user_id = v_user_id;
  END IF;

  IF to_regclass('public.member_accounts') IS NOT NULL THEN
    DELETE FROM public.member_accounts
    WHERE (v_email <> '' AND lower(coalesce(email, '')) = v_email)
       OR user_id = v_user_id;
  END IF;

  -- Delete application rows.
  IF to_regclass('public.member_applications') IS NOT NULL THEN
    IF v_membership_id IS NOT NULL THEN
      DELETE FROM public.member_applications
      WHERE membership_id = v_membership_id
         OR (v_email <> '' AND lower(coalesce(email, '')) = v_email);
    ELSE
      DELETE FROM public.member_applications
      WHERE v_email <> '' AND lower(coalesce(email, '')) = v_email;
    END IF;
  END IF;

  IF to_regclass('public.membership_application') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'membership_application'
        AND column_name = 'membership_id'
    ) AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'membership_application'
        AND column_name = 'email'
    ) THEN
      IF v_membership_id IS NOT NULL THEN
        DELETE FROM public.membership_application
        WHERE membership_id = v_membership_id
           OR (v_email <> '' AND lower(coalesce(email, '')) = v_email);
      ELSE
        DELETE FROM public.membership_application
        WHERE v_email <> '' AND lower(coalesce(email, '')) = v_email;
      END IF;
    ELSIF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'membership_application'
        AND column_name = 'email'
    ) THEN
      DELETE FROM public.membership_application
      WHERE v_email <> '' AND lower(coalesce(email, '')) = v_email;
    END IF;
  END IF;

  -- Delete personal data sheet rows linked by membership id or email.
  IF to_regclass('public.personal_data_sheet') IS NOT NULL THEN
    IF v_membership_id IS NOT NULL THEN
      DELETE FROM public.personal_data_sheet
      WHERE membership_number_id = v_membership_id
         OR (v_email <> '' AND lower(coalesce(email, '')) = v_email);
    ELSE
      DELETE FROM public.personal_data_sheet
      WHERE v_email <> '' AND lower(coalesce(email, '')) = v_email;
    END IF;
  END IF;

  -- Delete member profile last (after deriving membership id).
  IF to_regclass('public.member') IS NOT NULL THEN
    DELETE FROM public.member WHERE id = v_user_id;
  END IF;

  IF to_regclass('public.members') IS NOT NULL THEN
    DELETE FROM public.members WHERE id = v_user_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_membership_data_on_auth_delete ON auth.users;
CREATE TRIGGER trg_cleanup_membership_data_on_auth_delete
AFTER DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_membership_related_data_on_auth_delete();

DROP POLICY IF EXISTS "bod_insert_member" ON member;
CREATE POLICY "bod_insert_member"
ON member
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM member_account ma
    WHERE (ma.user_id = auth.uid() OR ma.auth_user_id = auth.uid())
      AND lower(coalesce(ma.role, '')) = 'bod'
  )
);

DROP POLICY IF EXISTS "service role insert members" ON member;
CREATE POLICY "service role insert members"
ON member
FOR INSERT
TO public
WITH CHECK (auth.role() = 'service_role');

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.capital_build_up (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid REFERENCES public.member(id) ON DELETE CASCADE,
  transaction_date timestamptz DEFAULT now(),
  starting_share_capital numeric DEFAULT 0,
  capital_added numeric DEFAULT 0,
  deposit_account text,
  ending_share_capital numeric DEFAULT 0
);

-- Policy update: CBU must NOT be auto-seeded at membership approval.
-- CBU rows should be created only after proper post-approval processing.
DROP TRIGGER IF EXISTS trg_seed_cbu_on_member_applications ON public.member_applications;

DO $$
DECLARE
  trig record;
BEGIN
  IF to_regclass('public.membership_application') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_seed_cbu_on_membership_application ON public.membership_application';
  END IF;

  -- Safety cleanup: remove any trigger on membership tables that appears to auto-seed CBU.
  FOR trig IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      t.tgname AS trigger_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public'
      AND c.relname IN ('member_applications', 'membership_application')
      AND (
        lower(t.tgname) LIKE '%cbu%'
        OR lower(t.tgname) LIKE '%capital%'
        OR lower(p.proname) LIKE '%cbu%'
        OR lower(p.proname) LIKE '%capital_build%'
      )
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I.%I',
      trig.trigger_name,
      trig.schema_name,
      trig.table_name
    );
  END LOOP;

  EXECUTE 'DROP FUNCTION IF EXISTS public.seed_cbu_on_membership_approval()';
  EXECUTE 'DROP FUNCTION IF EXISTS public.seed_cbu_on_member_approval()';
  EXECUTE 'DROP FUNCTION IF EXISTS public.seed_cbu_on_membership_application()';
END $$;

CREATE OR REPLACE FUNCTION public.is_cbu_staff()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF to_regclass('public.member_account') IS NOT NULL THEN
    SELECT lower(btrim(coalesce(ma.role, '')))
    INTO v_role
    FROM public.member_account ma
     WHERE ma.user_id = auth.uid()
       OR ma.auth_user_id = auth.uid()
       OR lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
    LIMIT 1;

    IF v_role IN ('bod', 'manager', 'cashier', 'treasurer') THEN
      RETURN true;
    END IF;
  END IF;

  IF to_regclass('public.member_accounts') IS NOT NULL THEN
    SELECT lower(btrim(coalesce(ma.role, '')))
    INTO v_role
    FROM public.member_accounts ma
     WHERE ma.user_id = auth.uid()
       OR ma.auth_user_id = auth.uid()
       OR lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
    LIMIT 1;

    IF v_role IN ('bod', 'manager', 'cashier', 'treasurer') THEN
      RETURN true;
    END IF;
  END IF;

  v_role := lower(btrim(coalesce(
    auth.jwt() ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  )));

  RETURN v_role IN ('bod', 'manager', 'cashier', 'treasurer');
END;
$$;

ALTER TABLE public.capital_build_up ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.capital_build_up TO authenticated;

DROP POLICY IF EXISTS cbu_staff_select_all ON public.capital_build_up;
CREATE POLICY cbu_staff_select_all
ON public.capital_build_up
FOR SELECT
TO authenticated
USING (public.is_cbu_staff());

DROP POLICY IF EXISTS cbu_staff_insert_all ON public.capital_build_up;
CREATE POLICY cbu_staff_insert_all
ON public.capital_build_up
FOR INSERT
TO authenticated
WITH CHECK (public.is_cbu_staff());

DROP POLICY IF EXISTS cbu_staff_update_all ON public.capital_build_up;
CREATE POLICY cbu_staff_update_all
ON public.capital_build_up
FOR UPDATE
TO authenticated
USING (public.is_cbu_staff())
WITH CHECK (public.is_cbu_staff());

DROP POLICY IF EXISTS cbu_member_select_own ON public.capital_build_up;
CREATE POLICY cbu_member_select_own
ON public.capital_build_up
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.member_account ma
    WHERE (ma.auth_user_id = auth.uid() OR ma.user_id = auth.uid())
      AND ma.user_id = member_id
  )
);

DO $$
BEGIN
  IF to_regclass('public.member_account') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.member_account ENABLE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, UPDATE ON public.member_account TO authenticated';

    EXECUTE 'DROP POLICY IF EXISTS "authenticated read own account" ON public.member_account';
    EXECUTE '
      CREATE POLICY "authenticated read own account"
      ON public.member_account
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid() OR auth_user_id = auth.uid())
    ';

    EXECUTE 'DROP POLICY IF EXISTS "authenticated update own account" ON public.member_account';
    EXECUTE '
      CREATE POLICY "authenticated update own account"
      ON public.member_account
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid() OR auth_user_id = auth.uid())
      WITH CHECK (user_id = auth.uid() OR auth_user_id = auth.uid())
    ';
  END IF;

  IF to_regclass('public.member_accounts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.member_accounts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, UPDATE ON public.member_accounts TO authenticated';

    EXECUTE 'DROP POLICY IF EXISTS "authenticated read own accounts" ON public.member_accounts';
    EXECUTE '
      CREATE POLICY "authenticated read own accounts"
      ON public.member_accounts
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid() OR auth_user_id = auth.uid())
    ';

    EXECUTE 'DROP POLICY IF EXISTS "authenticated update own accounts" ON public.member_accounts';
    EXECUTE '
      CREATE POLICY "authenticated update own accounts"
      ON public.member_accounts
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid() OR auth_user_id = auth.uid())
      WITH CHECK (user_id = auth.uid() OR auth_user_id = auth.uid())
    ';
  END IF;
END $$;
