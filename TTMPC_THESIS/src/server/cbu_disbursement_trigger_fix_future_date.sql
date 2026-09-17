-- Fix: sync_cbu_from_loan_disbursement() picked the wrong "existing balance"
-- Run in Supabase SQL editor.
--
-- Same class of bug found and fixed today (2026-09-17) in the Python cashier
-- CRJ deposit endpoint (main.py create_cashier_cbu_deposit /
-- get_cashier_cbu_members), now found in this trigger too:
--
--   1. No future-date guard. The yearly historical import pre-creates a
--      Dec-31-of-the-CURRENT-year snapshot row before the year is over
--      (capital_added=0, ending_share_capital = balance at import time).
--      Sorted purely by transaction_date, that future-dated placeholder
--      always outranks a real deposit/retention made earlier the same year
--      -- so v_existing_balance silently drops every real CRJ/CDJ entry made
--      since the placeholder was created, understating the retention's
--      starting balance and corrupting the running-balance chain exactly
--      the way TTMPC-068's chain broke earlier today.
--   2. Same-day tiebreak on raw `id` (gen_random_uuid(), unrelated to
--      insertion order) instead of cbu_deposit_id's numeric suffix -- the
--      original 2026-09-04 running-balance bug (see
--      cbu-running-balance-bug-fixed memory / cbu_backup_*.json), already
--      fixed everywhere else but missed in this trigger.
--
-- Fix: exclude transaction_date > current_date, and tie-break on
-- cbu_deposit_id's numeric suffix -- same ordering already used in
-- isc_v2_02_preview.sql's monthly_balances CTE.
--
-- Idempotent: CREATE OR REPLACE, safe to re-run.

BEGIN;

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

    -- FIX: exclude rows dated after today (the future Dec-31 import
    -- placeholder), and tie-break on cbu_deposit_id's numeric suffix instead
    -- of the random `id` UUID -- was: ORDER BY transaction_date DESC NULLS
    -- LAST, id DESC with no date filter.
    SELECT ending_share_capital
    INTO v_existing_balance
    FROM public.capital_build_up
    WHERE member_id = NEW.member_id
      AND transaction_date::date <= current_date
    ORDER BY
        transaction_date DESC NULLS LAST,
        NULLIF(regexp_replace(coalesce(cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer DESC NULLS LAST,
        id DESC
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

-- Trigger definition is unchanged -- only the function body above changed --
-- but re-asserting it here keeps this file runnable standalone.
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
