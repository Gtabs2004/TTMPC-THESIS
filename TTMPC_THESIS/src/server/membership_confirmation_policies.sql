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

DO $$
BEGIN
  IF to_regclass('public.membership_application') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "service role read applications" ON membership_application';
    EXECUTE 'CREATE POLICY "service role read applications" ON membership_application FOR SELECT USING (auth.role() = ''service_role'')';

    EXECUTE 'DROP POLICY IF EXISTS "service role update applications" ON membership_application';
    EXECUTE 'CREATE POLICY "service role update applications" ON membership_application FOR UPDATE USING (auth.role() = ''service_role'')';
  END IF;

  IF to_regclass('public.member_applications') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "service role read applications" ON member_applications';
    EXECUTE 'CREATE POLICY "service role read applications" ON member_applications FOR SELECT USING (auth.role() = ''service_role'')';

    EXECUTE 'DROP POLICY IF EXISTS "service role update applications" ON member_applications';
    EXECUTE 'CREATE POLICY "service role update applications" ON member_applications FOR UPDATE USING (auth.role() = ''service_role'')';
  END IF;
END $$;

DROP POLICY IF EXISTS "bod_insert_member" ON member;
CREATE POLICY "bod_insert_member"
ON member
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM member_account ma
    WHERE ma.user_id = auth.uid()
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

CREATE OR REPLACE FUNCTION public.seed_cbu_on_membership_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  old_status text;
  new_status text;
BEGIN
  old_status := lower(coalesce(OLD.application_status, ''));
  new_status := lower(coalesce(NEW.application_status, ''));

  IF old_status IN ('approved', 'member', 'official member') THEN
    RETURN NEW;
  END IF;

  IF new_status NOT IN ('approved', 'member', 'official member') THEN
    RETURN NEW;
  END IF;

  IF NEW.membership_id IS NULL OR btrim(NEW.membership_id) = '' THEN
    RETURN NEW;
  END IF;

  SELECT m.id
  INTO v_member_id
  FROM public.member m
  WHERE m.membership_id = NEW.membership_id
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.capital_build_up c
    WHERE c.member_id = v_member_id
  ) THEN
    INSERT INTO public.capital_build_up (
      member_id,
      transaction_date,
      starting_share_capital,
      capital_added,
      deposit_account,
      ending_share_capital
    )
    VALUES (
      v_member_id,
      now(),
      0,
      300,
      'CBU Opening Balance',
      300
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_cbu_on_member_applications ON public.member_applications;
CREATE CONSTRAINT TRIGGER trg_seed_cbu_on_member_applications
AFTER UPDATE OF application_status, membership_id ON public.member_applications
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.seed_cbu_on_membership_approval();

DO $$
BEGIN
  IF to_regclass('public.membership_application') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_seed_cbu_on_membership_application ON public.membership_application';
    EXECUTE '
      CREATE CONSTRAINT TRIGGER trg_seed_cbu_on_membership_application
      AFTER UPDATE OF application_status, membership_id ON public.membership_application
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION public.seed_cbu_on_membership_approval()
    ';
  END IF;
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
       OR lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
    LIMIT 1;

    IF v_role IN ('bod', 'manager') THEN
      RETURN true;
    END IF;
  END IF;

  IF to_regclass('public.member_accounts') IS NOT NULL THEN
    SELECT lower(btrim(coalesce(ma.role, '')))
    INTO v_role
    FROM public.member_accounts ma
    WHERE ma.user_id = auth.uid()
       OR lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
    LIMIT 1;

    IF v_role IN ('bod', 'manager') THEN
      RETURN true;
    END IF;
  END IF;

  v_role := lower(btrim(coalesce(
    auth.jwt() ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  )));

  RETURN v_role IN ('bod', 'manager');
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
USING (member_id = auth.uid());

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
      USING (user_id = auth.uid())
    ';

    EXECUTE 'DROP POLICY IF EXISTS "authenticated update own account" ON public.member_account';
    EXECUTE '
      CREATE POLICY "authenticated update own account"
      ON public.member_account
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())
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
      USING (user_id = auth.uid())
    ';

    EXECUTE 'DROP POLICY IF EXISTS "authenticated update own accounts" ON public.member_accounts';
    EXECUTE '
      CREATE POLICY "authenticated update own accounts"
      ON public.member_accounts
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())
    ';
  END IF;
END $$;
