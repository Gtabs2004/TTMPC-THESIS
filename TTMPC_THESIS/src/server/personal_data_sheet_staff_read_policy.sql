-- Personal Data Sheet staff read policy for co-maker autofill
-- Purpose:
-- 1) Allow authenticated staff (Bookkeeper/Manager/etc.) to read personal_data_sheet
-- 2) Keep RLS enabled and explicit
-- 3) Support co-maker autofill fields: tin_number, permanent_address, contact_number, email

BEGIN;

ALTER TABLE IF EXISTS public.personal_data_sheet ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.personal_data_sheet TO authenticated;

CREATE OR REPLACE FUNCTION public.has_staff_role_for_pds(
  p_user_id uuid,
  p_email text,
  p_roles text[]
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched boolean := false;
BEGIN
  IF to_regclass('public.member_account') IS NOT NULL THEN
    EXECUTE '
      SELECT EXISTS (
        SELECT 1
        FROM public.member_account ma
        WHERE (
          ma.user_id = $1
          OR lower(coalesce(ma.email, '''')) = lower(coalesce($2, ''''))
        )
          AND lower(coalesce(ma.role, '''')) = ANY ($3)
      )
    '
    INTO matched
    USING p_user_id, p_email, p_roles;

    IF matched THEN
      RETURN true;
    END IF;
  END IF;

  IF to_regclass('public.member_accounts') IS NOT NULL THEN
    EXECUTE '
      SELECT EXISTS (
        SELECT 1
        FROM public.member_accounts ma
        WHERE (
          ma.user_id = $1
          OR lower(coalesce(ma.email, '''')) = lower(coalesce($2, ''''))
        )
          AND lower(coalesce(ma.role, '''')) = ANY ($3)
      )
    '
    INTO matched
    USING p_user_id, p_email, p_roles;

    IF matched THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

DROP POLICY IF EXISTS personal_data_sheet_staff_select ON public.personal_data_sheet;
CREATE POLICY personal_data_sheet_staff_select
ON public.personal_data_sheet
FOR SELECT
TO authenticated
USING (
  public.has_staff_role_for_pds(
    auth.uid(),
    auth.email(),
    ARRAY['manager', 'bookkeeper', 'treasurer', 'secretary', 'bod']
  )
);

DROP POLICY IF EXISTS personal_data_sheet_service_role_all ON public.personal_data_sheet;
CREATE POLICY personal_data_sheet_service_role_all
ON public.personal_data_sheet
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_personal_data_sheet_membership_lookup
  ON public.personal_data_sheet (membership_number_id, created_at DESC);

COMMIT;
