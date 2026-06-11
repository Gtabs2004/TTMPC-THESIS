-- Update trigger: credit CBU on disbursement for any loan type with a CBU rate
-- This is idempotent. Run in Supabase SQL editor.

BEGIN;

-- Replace existing function with a more general version that credits CBU
-- whenever the policy table returns a positive cbu_rate (or the loan row
-- includes a cbu_deduction). This ensures EMERGENCY loans that carry a
-- 2% CBU retention are credited on release, matching client-side deductions.
CREATE OR REPLACE FUNCTION public.sync_cbu_from_loan_disbursement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_status text;
    v_old_status text;
    v_loan_type_code text;
    v_principal numeric;
    v_cbu_credit numeric;
    v_existing_balance numeric := 0;
    v_transaction_date timestamptz;
BEGIN
    v_new_status := lower(btrim(coalesce(NEW.loan_status, '')));
    v_old_status := lower(btrim(coalesce(OLD.loan_status, '')));

    IF v_new_status <> 'released' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND v_old_status = 'released' THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.capital_build_up
        WHERE source_loan_id = NEW.control_number
    ) THEN
        RETURN NEW;
    END IF;

    IF NEW.member_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT upper(btrim(coalesce(lt.code, '')))
    INTO v_loan_type_code
    FROM public.loan_types lt
    WHERE lt.id = NEW.loan_type_id
    LIMIT 1;

    v_principal := coalesce(NEW.principal_amount, NEW.loan_amount, 0);
    IF v_principal <= 0 THEN
        RETURN NEW;
    END IF;

    v_cbu_credit := coalesce(
        NULLIF(NEW.cbu_deduction, 0),
        round(
            v_principal * coalesce(
                NULLIF(public.get_cbu_rate_for_loan_type(v_loan_type_code), 0),
                0.02
            ),
            2
        )
    );

    IF v_cbu_credit <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT coalesce(ending_share_capital, 0)
    INTO v_existing_balance
    FROM public.capital_build_up
    WHERE member_id = NEW.member_id
    ORDER BY transaction_date DESC NULLS LAST, id DESC
    LIMIT 1;

    IF v_existing_balance IS NULL THEN
        v_existing_balance := 0;
    END IF;

    v_transaction_date := coalesce(NEW.disbursal_date, now());

    INSERT INTO public.capital_build_up (
        member_id,
        transaction_date,
        starting_share_capital,
        capital_added,
        deposit_account,
        ending_share_capital,
        source_loan_id
    ) VALUES (
        NEW.member_id,
        v_transaction_date,
        v_existing_balance,
        v_cbu_credit,
        'LOAN_CBU_RETENTION',
        v_existing_balance + v_cbu_credit,
        NEW.control_number
    )
    ON CONFLICT (source_loan_id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- Recreate trigger (idempotent)
DROP TRIGGER IF EXISTS trg_sync_cbu_from_loan_disbursement ON public.loans;
CREATE TRIGGER trg_sync_cbu_from_loan_disbursement
AFTER UPDATE OF loan_status
    ON public.loans
FOR EACH ROW
WHEN (
    lower(btrim(coalesce(NEW.loan_status, ''))) = 'released'
    AND lower(btrim(coalesce(OLD.loan_status, ''))) IS DISTINCT FROM 'released'
)
EXECUTE FUNCTION public.sync_cbu_from_loan_disbursement();

COMMIT;
