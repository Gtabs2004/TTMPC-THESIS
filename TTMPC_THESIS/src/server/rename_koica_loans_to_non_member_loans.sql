-- =============================================================================
-- Rename koica_loans -> non_member_loans
-- =============================================================================
-- koica_loans was originally the ABFF/KOICA product's table. The ABFF/KOICA
-- product is retired (see koica_loans_staff_submitted_by.sql); the table now
-- only holds non-member Bonus Loan applications, so the name is a leftover
-- misnomer. This renames the table itself plus every dependent constraint,
-- index, trigger, and trigger function so nothing in the schema still says
-- "koica" after this runs. The historical migration files (loan_form_policies.sql,
-- koica_loans_staff_submitted_by.sql, bod_high_value_loan_schema.sql,
-- bookkeeper_manager_review_schema.sql, bookkeeper_comaker_payload_schema.sql,
-- rescheduled_loans_and_vault_hardening.sql, loan_email_notifications_schema.sql,
-- bod_loan_update_policy.sql, bonus_loan_window_trigger.sql,
-- nonmember_bonus_payments_schema.sql, normalize_consolidated_interest_rate.sql)
-- are left as-is since they document what was actually run; this file is the
-- current source of truth for the table's name going forward. Run this AFTER
-- all of those (i.e. on a DB that already has koica_loans fully set up).
--
-- Safe to run multiple times.
-- =============================================================================

BEGIN;

-- 1. Rename the table itself --------------------------------------------------
-- Postgres automatically repoints every FK, RLS policy, view, and the
-- information_schema entry to the new name; it does NOT rename constraint,
-- index, trigger, or function identifiers (handled explicitly below).
ALTER TABLE IF EXISTS public.koica_loans RENAME TO non_member_loans;

-- 2. Rename indexes -------------------------------------------------------------
ALTER INDEX IF EXISTS idx_koica_loans_user_email RENAME TO idx_non_member_loans_user_email;
ALTER INDEX IF EXISTS idx_koica_loans_manager_queue RENAME TO idx_non_member_loans_manager_queue;
ALTER INDEX IF EXISTS idx_koica_loans_raw_payload_gin RENAME TO idx_non_member_loans_raw_payload_gin;

-- 3. Rename the loan_status CHECK constraint ------------------------------------
-- Three migration files (bod_high_value_loan_schema.sql, bookkeeper_manager_review_schema.sql,
-- rescheduled_loans_and_vault_hardening.sql) each dropped-and-recreated this
-- constraint in sequence; only the latest one (koica_loans_loan_status_chk,
-- from rescheduled_loans_and_vault_hardening.sql) exists on the live table.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.non_member_loans'::regclass
      AND conname LIKE 'koica_loans%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.non_member_loans RENAME CONSTRAINT %I TO %I',
      rec.conname,
      replace(rec.conname, 'koica_loans', 'non_member_loans')
    );
  END LOOP;
END $$;

-- 4. Rename trigger functions + recreate triggers on the new names -------------
-- Postgres has no "ALTER FUNCTION ... RENAME" shortcut that also updates
-- triggers referencing it by old name cleanly here, so: rename the functions,
-- then drop+recreate the triggers (which already point at the table's new
-- name automatically since the table was renamed in step 1).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'koica_loans_stamp_submitter'
  ) THEN
    ALTER FUNCTION public.koica_loans_stamp_submitter() RENAME TO non_member_loans_stamp_submitter;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'koica_loans_notify_bookkeeper'
  ) THEN
    ALTER FUNCTION public.koica_loans_notify_bookkeeper() RENAME TO non_member_loans_notify_bookkeeper;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_koica_loans_stamp_submitter ON public.non_member_loans;
CREATE TRIGGER trg_non_member_loans_stamp_submitter
BEFORE INSERT ON public.non_member_loans
FOR EACH ROW EXECUTE FUNCTION public.non_member_loans_stamp_submitter();

DROP TRIGGER IF EXISTS trg_koica_loans_notify_bookkeeper ON public.non_member_loans;
CREATE TRIGGER trg_non_member_loans_notify_bookkeeper
AFTER INSERT ON public.non_member_loans
FOR EACH ROW EXECUTE FUNCTION public.non_member_loans_notify_bookkeeper();

DROP TRIGGER IF EXISTS trg_prevent_manager_edit_bookkeeper_notes_koica_loans ON public.non_member_loans;
CREATE TRIGGER trg_prevent_manager_edit_bookkeeper_notes_non_member_loans
BEFORE UPDATE ON public.non_member_loans
FOR EACH ROW EXECUTE FUNCTION public.prevent_manager_edit_bookkeeper_notes();

DROP TRIGGER IF EXISTS enforce_bonus_loan_window_koica ON public.non_member_loans;
CREATE TRIGGER enforce_bonus_loan_window_non_member
BEFORE INSERT ON public.non_member_loans
FOR EACH ROW EXECUTE FUNCTION public.enforce_bonus_loan_window();

-- 5. Also fix the loan_notifications redirect_url built by the notify trigger --
-- The old function body hardcoded "?source=koica" in the bell-notification
-- deep link; the renamed function must point the link at the new source tag
-- used by the frontend/backend after the application-code rename
-- (source=non_member, see staffLoanPrint.js / LoanApprovalDetails.jsx / main.py changes).
CREATE OR REPLACE FUNCTION public.non_member_loans_notify_bookkeeper()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF upper(coalesce(NEW.loan_type_code, '')) <> 'NONMEMBER_BONUS' THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.loan_notifications (
      recipient_role, notification_type, severity, loan_id,
      title, message, redirect_url, dedup_key, is_read, created_by
    ) VALUES (
      'bookkeeper', 'new_application', 'info', NEW.control_number,
      'New non-member Bonus Loan application',
      coalesce(nullif(btrim(NEW.full_name), ''), 'A non-member')
        || ' submitted a non-member Bonus Loan application (entered at the cashier). Please review and process it.',
      '/bookkeeper-loan-approval/' || NEW.control_number || '?source=non_member',
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

-- 6. Rename RLS policies ---------------------------------------------------------
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'non_member_loans'
  LOOP
    IF rec.policyname LIKE '%koica%' THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.non_member_loans RENAME TO %I',
        rec.policyname,
        replace(rec.policyname, 'koica', 'non member')
      );
    END IF;
  END LOOP;
END $$;

-- 7. Grants (re-stated explicitly since GRANTs follow the table, but re-run for clarity) ---
GRANT SELECT, INSERT, UPDATE ON public.non_member_loans TO authenticated;

COMMIT;

-- Verify (run separately):
-- SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%koica%';          -- expect 0 rows
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.non_member_loans'::regclass;       -- expect non_member_loans_* names
-- SELECT indexname FROM pg_indexes WHERE tablename = 'non_member_loans';                        -- expect idx_non_member_loans_*
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.non_member_loans'::regclass AND NOT tgisinternal;
-- SELECT policyname FROM pg_policies WHERE tablename = 'non_member_loans';
-- SELECT proname FROM pg_proc WHERE proname ILIKE '%koica%';                                    -- expect 0 rows
