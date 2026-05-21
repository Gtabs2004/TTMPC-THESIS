-- ============================================================================
-- Member self-service policies for personal_data_sheet
-- ----------------------------------------------------------------------------
-- Purpose:
--   Allow an authenticated member to read and update *their own* Personal
--   Data Sheet row from the Member Portal. Staff and service_role policies
--   defined in personal_data_sheet_staff_read_policy.sql are preserved.
--
-- Identity link:
--   personal_data_sheet.membership_number_id  <->  member_account.membership_id
--   member_account.user_id = auth.uid()
--
-- The update policy intentionally allows the member to update any column on
-- their own row. The Member Portal UI surfaces only the appropriate inputs
-- and runs client-side validation. Financial / membership columns
-- (number_of_shares, initial_paid_up_capital, etc.) are rendered read-only
-- in the UI so they remain controlled by the back-office workflow.
--
-- Run in Supabase SQL editor.
-- ============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.personal_data_sheet ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.personal_data_sheet TO authenticated;

CREATE OR REPLACE FUNCTION public.is_pds_owner(p_membership_number_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_email text := lower(coalesce(auth.email(), ''));
    v_found boolean := false;
BEGIN
    IF p_membership_number_id IS NULL OR btrim(p_membership_number_id) = '' THEN
        RETURN false;
    END IF;

    IF to_regclass('public.member_account') IS NOT NULL THEN
        EXECUTE '
            SELECT EXISTS (
                SELECT 1
                FROM public.member_account ma
                WHERE (ma.user_id = $1 OR ma.auth_user_id = $1
                       OR (lower(coalesce(ma.email, '''')) = $2 AND $2 <> ''''))
                  AND ma.membership_id = $3
            )
        '
        INTO v_found
        USING v_uid, v_email, p_membership_number_id;

        IF v_found THEN
            RETURN true;
        END IF;
    END IF;

    IF to_regclass('public.member_accounts') IS NOT NULL THEN
        EXECUTE '
            SELECT EXISTS (
                SELECT 1
                FROM public.member_accounts ma
                WHERE (ma.user_id = $1 OR ma.auth_user_id = $1
                       OR (lower(coalesce(ma.email, '''')) = $2 AND $2 <> ''''))
                  AND ma.membership_id = $3
            )
        '
        INTO v_found
        USING v_uid, v_email, p_membership_number_id;

        IF v_found THEN
            RETURN true;
        END IF;
    END IF;

    RETURN false;
END;
$$;

DROP POLICY IF EXISTS personal_data_sheet_member_select_own
    ON public.personal_data_sheet;

CREATE POLICY personal_data_sheet_member_select_own
ON public.personal_data_sheet
FOR SELECT
TO authenticated
USING (public.is_pds_owner(membership_number_id));

DROP POLICY IF EXISTS personal_data_sheet_member_update_own
    ON public.personal_data_sheet;

CREATE POLICY personal_data_sheet_member_update_own
ON public.personal_data_sheet
FOR UPDATE
TO authenticated
USING (public.is_pds_owner(membership_number_id))
WITH CHECK (public.is_pds_owner(membership_number_id));

COMMIT;
