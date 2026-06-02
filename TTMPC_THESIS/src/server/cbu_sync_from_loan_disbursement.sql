-- ============================================================================
-- Capital Build-Up synchronization from consolidated loan disbursement
-- ----------------------------------------------------------------------------
-- Purpose:
--   When a Consolidated Loan transitions to loan_status = 'released',
--   automatically credit 2% of the principal to the borrower's capital_build_up
--   ledger (policy: "2% of the amount applied for capital build up").
--
--   This complements the existing logic that DEDUCTS the 2% from the
--   borrower's net proceeds at disbursement: the deduction is already enforced
--   in loanComputeApi.js / main.py, but the offsetting credit to the member's
--   share capital was never written. This migration closes that gap.
--
--   Idempotent and duplicate-safe: re-running the trigger or backfill will
--   not produce duplicate capital_build_up rows for the same loan.
--
--   Scope: only fires for the CONSOLIDATED loan type. Other loan types do not
--   carry a CBU retention under current policy.
--
-- Run in Supabase SQL editor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Schema addition: track which loan a capital_build_up row originated from.
--    NULL for rows created by the cashier deposit flow or membership signup.
-- ----------------------------------------------------------------------------
ALTER TABLE public.capital_build_up
    ADD COLUMN IF NOT EXISTS source_loan_id varchar;

-- Unique constraint so each released loan can only ever produce ONE CBU
-- credit row. ON CONFLICT inference in the trigger/backfill relies on this.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'capital_build_up_source_loan_id_uk'
          AND conrelid = 'public.capital_build_up'::regclass
    ) THEN
        ALTER TABLE public.capital_build_up
            ADD CONSTRAINT capital_build_up_source_loan_id_uk
            UNIQUE (source_loan_id);
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Trigger function: credit 2% of principal to capital_build_up when a
--    consolidated loan flips to 'released'.
--    Idempotent — guarded by the unique constraint above and an explicit
--    existence check (the existence check avoids a noisy ON CONFLICT error
--    when the same loan is updated multiple times after release).
-- ----------------------------------------------------------------------------
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

    -- Only act on the transition INTO 'released'. Ignore status churn that
    -- isn't a fresh release event (e.g., released -> partially paid -> ...).
    IF v_new_status <> 'released' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND v_old_status = 'released' THEN
        RETURN NEW;
    END IF;

    -- Skip if a CBU row was already created for this loan (idempotency belt
    -- and suspenders, in addition to the unique constraint).
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

    -- Only consolidated loans carry a CBU retention.
    SELECT upper(btrim(coalesce(lt.code, '')))
    INTO v_loan_type_code
    FROM public.loan_types lt
    WHERE lt.id = NEW.loan_type_id
    LIMIT 1;

    IF v_loan_type_code <> 'CONSOLIDATED' THEN
        RETURN NEW;
    END IF;

    v_principal := coalesce(NEW.principal_amount, NEW.loan_amount, 0);
    IF v_principal <= 0 THEN
        RETURN NEW;
    END IF;

    -- Prefer the value the compute layer already calculated and persisted on
    -- the loan; fall back to the policy table (loan_fee_policies.cbu_rate)
    -- if the column is empty; final fallback to the literal 2% if the policy
    -- table is unavailable (e.g., during a partial rollout).
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

    -- Continue the member's running ledger so the dashboard balance stays
    -- consistent with the cashier-deposit flow.
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

DROP TRIGGER IF EXISTS trg_sync_cbu_from_loan_disbursement
    ON public.loans;

CREATE TRIGGER trg_sync_cbu_from_loan_disbursement
AFTER UPDATE OF loan_status
    ON public.loans
FOR EACH ROW
WHEN (
    lower(btrim(coalesce(NEW.loan_status, ''))) = 'released'
    AND lower(btrim(coalesce(OLD.loan_status, ''))) IS DISTINCT FROM 'released'
)
EXECUTE FUNCTION public.sync_cbu_from_loan_disbursement();

-- ----------------------------------------------------------------------------
-- 3. Backfill: credit any consolidated loans that were already released
--    before this migration ran. Safe to re-run — the unique constraint and
--    the existence check both prevent duplicates.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    rec record;
    v_existing_balance numeric;
    v_cbu_credit numeric;
    v_transaction_date timestamptz;
BEGIN
    FOR rec IN
        SELECT
            l.control_number,
            l.member_id,
            l.principal_amount,
            l.loan_amount,
            l.cbu_deduction,
            l.disbursal_date
        FROM public.loans l
        JOIN public.loan_types lt ON lt.id = l.loan_type_id
        WHERE lower(btrim(coalesce(l.loan_status, ''))) = 'released'
          AND upper(btrim(coalesce(lt.code, ''))) = 'CONSOLIDATED'
          AND l.member_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM public.capital_build_up cbu
              WHERE cbu.source_loan_id = l.control_number
          )
        ORDER BY l.disbursal_date NULLS LAST, l.control_number
    LOOP
        v_cbu_credit := coalesce(
            NULLIF(rec.cbu_deduction, 0),
            round(
                coalesce(rec.principal_amount, rec.loan_amount, 0)
                * coalesce(NULLIF(public.get_cbu_rate_for_loan_type('CONSOLIDATED'), 0), 0.02),
                2
            )
        );

        IF v_cbu_credit IS NULL OR v_cbu_credit <= 0 THEN
            CONTINUE;
        END IF;

        SELECT coalesce(ending_share_capital, 0)
        INTO v_existing_balance
        FROM public.capital_build_up
        WHERE member_id = rec.member_id
        ORDER BY transaction_date DESC NULLS LAST, id DESC
        LIMIT 1;

        IF v_existing_balance IS NULL THEN
            v_existing_balance := 0;
        END IF;

        v_transaction_date := coalesce(rec.disbursal_date, now());

        INSERT INTO public.capital_build_up (
            member_id,
            transaction_date,
            starting_share_capital,
            capital_added,
            deposit_account,
            ending_share_capital,
            source_loan_id
        ) VALUES (
            rec.member_id,
            v_transaction_date,
            v_existing_balance,
            v_cbu_credit,
            'LOAN_CBU_RETENTION',
            v_existing_balance + v_cbu_credit,
            rec.control_number
        )
        ON CONFLICT (source_loan_id) DO NOTHING;
    END LOOP;
END $$;

COMMIT;
