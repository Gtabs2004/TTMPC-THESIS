-- =============================================================================
-- Non-Member Bonus Loan: Cashier intake (replaces the public kiosk)
-- =============================================================================
-- A walk-in non-member's Bonus Loan is now keyed in by the Cashier at the
-- front desk (route /Cashier_NonMember_Bonus), then follows the same
-- Bookkeeper -> Manager -> Treasurer approval flow, which already reads
-- koica_loans.
--
-- Two identities on every row, kept apart:
--   full_name / credentials / user_email  = the APPLICANT (typed into the form)
--   submitted_by_*                         = the STAFF member who keyed it in,
--                                            stamped here from auth.uid(), so the
--                                            browser cannot forge it.
--
-- Also:
--   * The ABFF/KOICA product is retired: koica_loans now only takes new
--     NONMEMBER_BONUS rows (the table keeps its name; existing KOICA rows stay
--     as history).
--   * Only a Cashier may insert, and only NONMEMBER_BONUS. Anonymous inserts
--     and the "insert own KOICA loan" path are removed.
--   * The Bookkeeper gets a bell notification for each new NONMEMBER_BONUS
--     application, created here so client RLS on loan_notifications can't
--     silently drop it.
--
-- NOTE: loan_form_policies.sql re-creates the old, looser policies. Do not
-- re-run it after this file, or run this file again afterwards.
--
-- Safe to run multiple times.
-- =============================================================================

BEGIN;

-- 1. Columns -------------------------------------------------------------------
ALTER TABLE public.koica_loans
  ADD COLUMN IF NOT EXISTS submitted_by_staff_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by_role     text,
  ADD COLUMN IF NOT EXISTS submitted_by_email    text;

COMMENT ON COLUMN public.koica_loans.submitted_by_staff_id IS
  'auth.users id of the staff member who keyed in this application (stamped by trigger). NULL for anonymous/kiosk rows.';
COMMENT ON COLUMN public.koica_loans.submitted_by_role IS
  'member_account.role of the submitter at submission time.';
COMMENT ON COLUMN public.koica_loans.submitted_by_email IS
  'Email of the submitter at submission time.';

-- 2. Stamp the submitter server-side ------------------------------------------
-- Always overwrites whatever the client sent, so the browser can't claim to
-- be someone else.
CREATE OR REPLACE FUNCTION public.koica_loans_stamp_submitter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
BEGIN
  NEW.submitted_by_staff_id := v_uid;
  NEW.submitted_by_email    := CASE WHEN v_uid IS NULL THEN NULL ELSE lower(auth.email()) END;
  NEW.submitted_by_role     := NULL;

  IF v_uid IS NOT NULL THEN
    SELECT lower(ma.role) INTO v_role
    FROM public.member_account ma
    WHERE ma.auth_user_id = v_uid OR ma.user_id = v_uid
    LIMIT 1;
    NEW.submitted_by_role := v_role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_koica_loans_stamp_submitter ON public.koica_loans;
CREATE TRIGGER trg_koica_loans_stamp_submitter
BEFORE INSERT ON public.koica_loans
FOR EACH ROW EXECUTE FUNCTION public.koica_loans_stamp_submitter();

-- 3. Bookkeeper bell notification ---------------------------------------------
CREATE OR REPLACE FUNCTION public.koica_loans_notify_bookkeeper()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF upper(coalesce(NEW.loan_type_code, '')) <> 'NONMEMBER_BONUS' THEN
    RETURN NEW;
  END IF;

  -- A notification failure must never roll back the application itself.
  BEGIN
    INSERT INTO public.loan_notifications (
      recipient_role, notification_type, severity, loan_id,
      title, message, redirect_url, dedup_key, is_read, created_by
    ) VALUES (
      'bookkeeper', 'new_application', 'info', NEW.control_number,
      'New non-member Bonus Loan application',
      coalesce(nullif(btrim(NEW.full_name), ''), 'A non-member')
        || ' submitted a non-member Bonus Loan application (entered at the cashier). Please review and process it.',
      '/bookkeeper-loan-approval/' || NEW.control_number || '?source=koica',
      'bookkeeper|' || NEW.control_number || '|new_application',
      false,
      NEW.submitted_by_staff_id
    );
  EXCEPTION WHEN others THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_koica_loans_notify_bookkeeper ON public.koica_loans;
CREATE TRIGGER trg_koica_loans_notify_bookkeeper
AFTER INSERT ON public.koica_loans
FOR EACH ROW EXECUTE FUNCTION public.koica_loans_notify_bookkeeper();

-- 4. Insert policies -------------------------------------------------------------
-- ABFF/KOICA retired: no anonymous or self-service inserts at all.
DROP POLICY IF EXISTS "anon insert koica loans" ON public.koica_loans;
DROP POLICY IF EXISTS "authenticated insert own koica loans" ON public.koica_loans;
REVOKE INSERT ON public.koica_loans FROM anon;

-- NONMEMBER_BONUS: Cashier only.
DROP POLICY IF EXISTS "authenticated insert nonmember bonus loans" ON public.koica_loans;
CREATE POLICY "authenticated insert nonmember bonus loans"
ON public.koica_loans
FOR INSERT
TO authenticated
WITH CHECK (
  upper(coalesce(loan_type_code, '')) = 'NONMEMBER_BONUS'
  AND public.has_portal_role(auth.uid(), auth.email(), ARRAY['cashier'])
);

COMMIT;

-- Check (run separately): should list the two triggers and exactly one INSERT
-- policy ("authenticated insert nonmember bonus loans").
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.koica_loans'::regclass AND tgname LIKE 'trg_koica_loans_%'
-- UNION ALL
-- SELECT policyname FROM pg_policies WHERE tablename = 'koica_loans' AND cmd = 'INSERT';
