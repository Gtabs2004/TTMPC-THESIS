-- Bonus loan window enforcement (DB source of truth).
--
-- UPDATED (decision 3.3-1, Simulation findings, confirmed 2026-10-23):
-- applications are now open all year -- a member may apply for a Bonus loan
-- in any month, including May/November. The May/November block moves from
-- application time to the Bookkeeper->Manager handoff: a Bonus or
-- NonMemberBonus loan can no longer be recommended for approval (the status
-- transition to 'recommended for approval') while the current month is May
-- or November, since those are the Bonus's own repayment months. There is
-- no override for this -- the Bookkeeper simply waits until the window
-- reopens before recommending. (Superseded policy, for history only: the
-- old rule blocked INSERT in May/November, Q6/BONUS_LOAN_PLAN.md
-- 2026-10-14, with a one-time Bookkeeper override via
-- loan_renewal_override_requests/bonus_window_override.sql -- both the old
-- rule and that override are removed by this file.)
--
-- Fires: BEFORE UPDATE on `loans` and `non_member_loans`, only when the row
--        is transitioning INTO 'recommended for approval' (OLD status
--        wasn't already that -- re-saving other fields on an
--        already-recommended loan must not re-fire this).
-- Blocks: rows whose resolved loan_type code is BONUS or NONMEMBER_BONUS
--         when extract(month from now()) is 5 or 11.
--
-- Safe to re-run. Idempotent (DROP TRIGGER IF EXISTS + CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.enforce_bonus_loan_window()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text;
  v_month int := extract(month from now())::int;
BEGIN
  -- Only the transition INTO 'recommended for approval' is gated -- not
  -- every update to an already-recommended (or any other status) row.
  IF lower(coalesce(NEW.loan_status, '')) IS DISTINCT FROM 'recommended for approval'
     OR lower(coalesce(OLD.loan_status, '')) = 'recommended for approval' THEN
    RETURN NEW;
  END IF;

  -- Resolve the loan type code from the joined loan_types row, falling
  -- back to the code already denormalized on the row itself if present.
  IF NEW.loan_type_id IS NOT NULL THEN
    SELECT upper(coalesce(code, '')) INTO v_code
    FROM public.loan_types
    WHERE id = NEW.loan_type_id;
  END IF;

  IF v_code IS NULL OR v_code = '' THEN
    v_code := upper(coalesce(NEW.loan_type_code, ''));
  END IF;

  IF v_code IN ('BONUS', 'NONMEMBER_BONUS') AND v_month IN (5, 11) THEN
    RAISE EXCEPTION
      'A Bonus loan cannot be recommended for approval in May or November (its own repayment months). Current month: %',
      v_month
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_bonus_loan_window_loans ON public.loans;
CREATE TRIGGER enforce_bonus_loan_window_loans
BEFORE UPDATE ON public.loans
FOR EACH ROW
EXECUTE FUNCTION public.enforce_bonus_loan_window();

-- non_member_loans holds NONMEMBER_BONUS applications per src/LOANFORMS/loanSubmission.js.
DO $$
BEGIN
  IF to_regclass('public.non_member_loans') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_bonus_loan_window_non_member ON public.non_member_loans';
    EXECUTE 'CREATE TRIGGER enforce_bonus_loan_window_non_member
             BEFORE UPDATE ON public.non_member_loans
             FOR EACH ROW
             EXECUTE FUNCTION public.enforce_bonus_loan_window()';
  END IF;
END $$;
