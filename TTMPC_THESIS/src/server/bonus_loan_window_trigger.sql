-- Bonus loan window enforcement (DB source of truth).
--
-- Policy: Bonus loan applications may only be inserted during Mid-year (May)
-- and Year-end (November). Frontend and FastAPI both check the window, but
-- a determined actor could POST directly to Supabase, so this trigger is the
-- last line of defense.
--
-- Fires: BEFORE INSERT on `loans` and `koica_loans`.
-- Blocks: rows whose resolved loan_type code is BONUS or NONMEMBER_BONUS
--         when extract(month from now()) is not in (5, 11).
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

  IF v_code IN ('BONUS', 'NONMEMBER_BONUS') AND v_month NOT IN (5, 11) THEN
    RAISE EXCEPTION
      'Bonus loan applications are accepted only during Mid-year (May) and Year-end (November). Current month: %',
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

-- koica_loans holds NONMEMBER_BONUS applications per src/LOANFORMS/loanSubmission.js.
DO $$
BEGIN
  IF to_regclass('public.koica_loans') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_bonus_loan_window_koica ON public.koica_loans';
    EXECUTE 'CREATE TRIGGER enforce_bonus_loan_window_koica
             BEFORE INSERT ON public.koica_loans
             FOR EACH ROW
             EXECUTE FUNCTION public.enforce_bonus_loan_window()';
  END IF;
END $$;
