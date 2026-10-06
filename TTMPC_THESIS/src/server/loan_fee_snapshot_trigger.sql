-- Freeze each loan's deduction breakdown at application time.
--
-- loans.service_fee / cbu_deduction / insurance_fee / notarial_fee / net_proceeds
-- already exist (loan_schedule_payments_schema.sql) but nothing filled them, so
-- the Cashier recomputed fees from the CURRENT loan_fee_policies at release.
-- If BOD changed a fee in between, the member and the Cashier saw different
-- numbers. This trigger computes them once, server-side, from loan_fee_policies
-- (same rules as compute_service_fee / _fee_breakdown_for_principal in main.py).
-- Client-supplied values are always overwritten so they can't be tampered with.
--
-- net_proceeds = principal - fees. A renewal's payoff of the old loan is NOT
-- included; that depends on payments made up to release day and stays live.
--
-- Additive only: existing rows are untouched (the Cashier falls back to a live
-- computation when these columns are NULL). Safe to re-run.

CREATE OR REPLACE FUNCTION public.snapshot_loan_fees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_code       text;
    v_principal  numeric;
    v_policy     public.loan_fee_policies%ROWTYPE;
    v_service    numeric := 0;
    v_cbu        numeric;
    v_insurance  numeric;
    v_notarial   numeric;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Only re-freeze when the amount or type changes before release.
        IF NEW.principal_amount IS NOT DISTINCT FROM OLD.principal_amount
           AND NEW.loan_amount IS NOT DISTINCT FROM OLD.loan_amount
           AND NEW.loan_type_id IS NOT DISTINCT FROM OLD.loan_type_id THEN
            RETURN NEW;
        END IF;
        IF lower(btrim(coalesce(OLD.loan_status, ''))) = 'released' THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT upper(btrim(coalesce(lt.code, ''))) INTO v_code
    FROM public.loan_types lt
    WHERE lt.id = NEW.loan_type_id
    LIMIT 1;

    SELECT * INTO v_policy
    FROM public.loan_fee_policies
    WHERE loan_type_code = v_code
    LIMIT 1;

    v_principal := coalesce(NEW.principal_amount, NEW.loan_amount, 0);

    IF v_policy.loan_type_code IS NULL OR v_principal <= 0 THEN
        NEW.service_fee   := NULL;
        NEW.cbu_deduction := NULL;
        NEW.insurance_fee := NULL;
        NEW.notarial_fee  := NULL;
        NEW.net_proceeds  := NULL;
        RETURN NEW;
    END IF;

    IF lower(coalesce(v_policy.service_fee_mode, 'none')) = 'flat' THEN
        v_service := round(coalesce(v_policy.service_fee_per_bracket, 0), 2);
    ELSIF lower(coalesce(v_policy.service_fee_mode, 'none')) = 'bracket'
          AND coalesce(v_policy.service_fee_bracket_size, 0) > 0
          AND coalesce(v_policy.service_fee_per_bracket, 0) > 0 THEN
        -- Ceiling brackets on the truncated principal: 1..size -> 1x, size+1..2x size -> 2x.
        v_service := round(
            (floor((trunc(v_principal) - 1) / trunc(v_policy.service_fee_bracket_size)) + 1)
            * v_policy.service_fee_per_bracket, 2);
    END IF;

    v_cbu       := round(v_principal * coalesce(v_policy.cbu_rate, 0), 2);
    v_insurance := round(v_principal * coalesce(v_policy.insurance_per_thousand, 0) / 1000, 2);
    v_notarial  := round(coalesce(v_policy.notarial_fee, 0), 2);

    NEW.service_fee   := v_service;
    NEW.cbu_deduction := v_cbu;
    NEW.insurance_fee := v_insurance;
    NEW.notarial_fee  := v_notarial;
    NEW.net_proceeds  := round(v_principal - (v_service + v_cbu + v_insurance + v_notarial), 2);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_loan_fees ON public.loans;
CREATE TRIGGER trg_snapshot_loan_fees
BEFORE INSERT OR UPDATE OF principal_amount, loan_amount, loan_type_id ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.snapshot_loan_fees();
