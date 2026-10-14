-- Bonus loan window enforcement (DB source of truth).
--
-- Policy (Q6, BONUS_LOAN_PLAN.md, updated 2026-10-14): Bonus loan
-- applications are open Dec-Apr (targets the Mid-Year May bonus) and Jun-Oct
-- (targets the Year-End November bonus); closed in May and November
-- themselves, since those are repayment months, not application months.
-- Frontend and FastAPI both check the window, but a determined actor could
-- POST directly to Supabase, so this trigger is the last line of defense.
--
-- Fires: BEFORE INSERT on `loans` and `non_member_loans`.
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
      'Bonus loan applications are accepted Dec-Apr (Mid-Year bonus) and Jun-Oct (Year-End bonus), not in May or November. Current month: %',
      v_month
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_bonus_loan_window_loans ON public.loans;
CREATE TRIGGER enforce_bonus_loan_window_loans
BEFORE INSERT ON public.loans
FOR EACH ROW
EXECUTE FUNCTION public.enforce_bonus_loan_window();

-- non_member_loans holds NONMEMBER_BONUS applications per src/LOANFORMS/loanSubmission.js.
DO $$
BEGIN
  IF to_regclass('public.non_member_loans') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_bonus_loan_window_non_member ON public.non_member_loans';
    EXECUTE 'CREATE TRIGGER enforce_bonus_loan_window_non_member
             BEFORE INSERT ON public.non_member_loans
             FOR EACH ROW
             EXECUTE FUNCTION public.enforce_bonus_loan_window()';
  END IF;
END $$;
