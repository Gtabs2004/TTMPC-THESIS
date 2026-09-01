-- Add 'bookkeeper' to the is_cbu_staff() role allow-list.
--
-- is_cbu_staff() gates the RLS policies on public.capital_build_up
-- (cbu_staff_select_all / cbu_staff_insert_all / cbu_staff_update_all,
-- defined in membership_confirmation_policies.sql). It currently allows
-- bod, manager, cashier, treasurer — bookkeeper was left out, even though
-- the Bookkeeper portal now has its own read-only Capital Build-Up view
-- (Bookkeeper_CBU.jsx) and may need direct-Supabase access to this table
-- going forward.
--
-- This CREATE OR REPLACE supersedes whichever of the two prior
-- definitions (cbu_cashier_policy_and_trigger.sql,
-- membership_confirmation_policies.sql) is currently live — both are
-- functionally identical to this one aside from the role list, so no
-- other behavior changes.
--
-- Run in Supabase SQL editor.

BEGIN;

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

    IF v_role IN ('bod', 'manager', 'cashier', 'treasurer', 'bookkeeper') THEN
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

    IF v_role IN ('bod', 'manager', 'cashier', 'treasurer', 'bookkeeper') THEN
      RETURN true;
    END IF;
  END IF;

  v_role := lower(btrim(coalesce(
    auth.jwt() ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  )));

  RETURN v_role IN ('bod', 'manager', 'cashier', 'treasurer', 'bookkeeper');
END;
$$;

COMMIT;
