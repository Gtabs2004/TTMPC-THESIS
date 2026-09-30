-- Account Management & termination — Part C: closing a member
-- (ACCOUNT_MANAGEMENT_TERMINATION_PLAN.md §11–§17)
-- Run in Supabase SQL editor AFTER account_management_part_b.sql.
--
-- 1. member_closures — the permanent history row for every closed member
--    (name, membership ID, dates, CBU totals, which fields were cleared —
--    never their values). Also used to spot a returning member when they
--    re-apply (name + date of birth).
-- 2. cleanup_membership_related_data_on_auth_delete() — the AFTER DELETE
--    trigger on auth.users. It used to delete member_account, applications,
--    the personal data sheet and the member row for ANY deleted login; for a
--    real member that either failed on loan/CBU foreign keys (blocking the
--    delete) or silently deleted their personal data sheet. It now only
--    cleans up applicants who never became members. Members are closed by
--    the backend (_close_member), which keeps their financial history.
--
-- Idempotent: safe to re-run.

BEGIN;

-- 1) member_closures --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_closures (
  id                    bigserial PRIMARY KEY,
  membership_id         text        NOT NULL UNIQUE,
  member_id             uuid        NOT NULL,
  first_name            text,
  middle_name           text,
  surname               text,
  date_of_birth         date,
  resolution_no         text,
  termination_date      date,
  closed_at             timestamptz NOT NULL DEFAULT now(),
  cbu_total             numeric(14, 2),
  cbu_applied_to_loans  numeric(14, 2),
  cbu_paid_out          numeric(14, 2),
  cleared_fields        jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- field names only
  auth_user_id          uuid,                                    -- the login that was removed
  auth_deleted_at       timestamptz,                             -- NULL = login removal pending
  auth_delete_error     text,
  closed_by             uuid
);

CREATE INDEX IF NOT EXISTS member_closures_name_dob_idx
  ON public.member_closures (lower(surname), lower(first_name), date_of_birth);

ALTER TABLE public.member_closures ENABLE ROW LEVEL SECURITY;  -- service-role only

-- 2) Applicant-only cleanup when a login is deleted --------------------------
CREATE OR REPLACE FUNCTION public.cleanup_membership_related_data_on_auth_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := OLD.id;
  v_email    text := lower(btrim(coalesce(OLD.email, '')));
  v_is_member boolean := false;
BEGIN
  -- Was this login ever a member's? Then do nothing: a member's records
  -- (account row, personal data sheet, application, loans, CBU) are kept, and
  -- closing a member is handled by the backend.
  IF to_regclass('public.member_account') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.member_account ma
      JOIN public.member m ON m.membership_id = ma.membership_id
      WHERE ma.auth_user_id = v_user_id
         OR ma.user_id = v_user_id
         OR (v_email <> '' AND lower(coalesce(ma.email, '')) = v_email)
    ) INTO v_is_member;
  END IF;

  IF NOT v_is_member AND to_regclass('public.member') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.member WHERE id = v_user_id) INTO v_is_member;
  END IF;

  IF v_is_member THEN
    RETURN OLD;
  END IF;

  -- Applicant who never became a member: remove what the sign-up created.
  IF v_email <> '' THEN
    IF to_regclass('public.member_account') IS NOT NULL THEN
      DELETE FROM public.member_account
      WHERE lower(coalesce(email, '')) = v_email
        AND membership_id NOT IN (SELECT membership_id FROM public.member WHERE membership_id IS NOT NULL);
    END IF;

    IF to_regclass('public.member_applications') IS NOT NULL THEN
      DELETE FROM public.member_applications
      WHERE lower(coalesce(email, '')) = v_email
        AND (membership_id IS NULL
             OR membership_id NOT IN (SELECT membership_id FROM public.member WHERE membership_id IS NOT NULL));
    END IF;

    IF to_regclass('public.personal_data_sheet') IS NOT NULL THEN
      DELETE FROM public.personal_data_sheet
      WHERE lower(coalesce(email, '')) = v_email
        AND membership_number_id NOT IN (SELECT membership_id FROM public.member WHERE membership_id IS NOT NULL);
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

-- The trigger itself is unchanged; re-asserted so this file runs standalone.
DROP TRIGGER IF EXISTS trg_cleanup_membership_data_on_auth_delete ON auth.users;
CREATE TRIGGER trg_cleanup_membership_data_on_auth_delete
AFTER DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_membership_related_data_on_auth_delete();

COMMIT;

-- Check 1: the closures table exists and is empty to start (expect 0).
SELECT count(*) AS member_closures_rows FROM public.member_closures;

-- Check 2: the trigger now calls the applicant-only version (expect 1 row,
-- and the function body to contain "v_is_member").
SELECT tgname, position('v_is_member' in pg_get_functiondef(tgfoid)) > 0 AS applicant_only
FROM pg_trigger
WHERE tgname = 'trg_cleanup_membership_data_on_auth_delete';
