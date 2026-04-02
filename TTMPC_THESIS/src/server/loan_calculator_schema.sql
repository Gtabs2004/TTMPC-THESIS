-- Loan calculator decision snapshot schema
-- Purpose:
-- 1) Persist every loan pre-evaluation result for audit/reporting.
-- 2) Link the evaluation to member and (optionally) an approved loan record.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.loan_calculator (
    calculator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.member(id) ON DELETE CASCADE,

    -- Optional link once a real loan row exists.
    loan_id VARCHAR NULL REFERENCES public.loans(control_number) ON DELETE SET NULL,

    principal_amount NUMERIC(14,2) NOT NULL CHECK (principal_amount > 0),
    net_proceeds NUMERIC(14,2) NOT NULL CHECK (net_proceeds >= 0 AND net_proceeds <= principal_amount),
    latest_net_pay NUMERIC(14,2) NOT NULL CHECK (latest_net_pay > 0),

    -- 3.00 = 300% cap for non-MIGS, 5.00 = 500% cap for MIGS.
    multiplier NUMERIC(5,2) NOT NULL CHECK (multiplier IN (3.00, 5.00)),

    monthly_amortization NUMERIC(14,2) NOT NULL CHECK (monthly_amortization > 0),

    -- DTI ratio (0.2500 means 25.00%).
    stress_index NUMERIC(7,4)
        GENERATED ALWAYS AS (ROUND(monthly_amortization / NULLIF(latest_net_pay, 0), 4)) STORED,

    risk_category TEXT
        GENERATED ALWAYS AS (
            CASE
                WHEN (monthly_amortization / NULLIF(latest_net_pay, 0)) <= 0.20 THEN 'Safe'
                WHEN (monthly_amortization / NULLIF(latest_net_pay, 0)) <= 0.30 THEN 'Low Risk'
                WHEN (monthly_amortization / NULLIF(latest_net_pay, 0)) <= 0.35 THEN 'Moderate Risk'
                WHEN (monthly_amortization / NULLIF(latest_net_pay, 0)) <= 0.40 THEN 'High Risk'
                ELSE 'Extreme Risk'
            END
        ) STORED,

    -- 40% take-home-pay eligibility rule.
    is_eligible BOOLEAN
        GENERATED ALWAYS AS (monthly_amortization <= latest_net_pay * 0.40) STORED,

    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backward-compatible upgrade path if the table already exists from older drafts.
ALTER TABLE public.loan_calculator
    ADD COLUMN IF NOT EXISTS loan_id VARCHAR,
    ADD COLUMN IF NOT EXISTS principal_amount NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS net_proceeds NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS latest_net_pay NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS multiplier NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS monthly_amortization NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS computed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'loan_calculator_loan_id_fkey'
          AND conrelid = 'public.loan_calculator'::regclass
    ) THEN
        ALTER TABLE public.loan_calculator
            ADD CONSTRAINT loan_calculator_loan_id_fkey
            FOREIGN KEY (loan_id)
            REFERENCES public.loans(control_number)
            ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE public.loan_calculator
    ALTER COLUMN computed_at SET DEFAULT NOW(),
    ALTER COLUMN created_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_loan_calculator_member_id
    ON public.loan_calculator (member_id);

CREATE INDEX IF NOT EXISTS idx_loan_calculator_loan_id
    ON public.loan_calculator (loan_id);

CREATE INDEX IF NOT EXISTS idx_loan_calculator_computed_at
    ON public.loan_calculator (computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_loan_calculator_is_eligible
    ON public.loan_calculator (is_eligible);

ALTER TABLE public.loan_calculator ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loan_calculator_authenticated_select ON public.loan_calculator;
CREATE POLICY loan_calculator_authenticated_select
ON public.loan_calculator
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS loan_calculator_authenticated_insert ON public.loan_calculator;
CREATE POLICY loan_calculator_authenticated_insert
ON public.loan_calculator
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS loan_calculator_service_role_all ON public.loan_calculator;
CREATE POLICY loan_calculator_service_role_all
ON public.loan_calculator
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT ON public.loan_calculator TO authenticated;
GRANT ALL ON public.loan_calculator TO service_role;

COMMENT ON TABLE public.loan_calculator IS 'Stores loan pre-evaluation calculator outputs and eligibility decisions.';
COMMENT ON COLUMN public.loan_calculator.calculator_id IS 'Primary key for each evaluation run.';
COMMENT ON COLUMN public.loan_calculator.member_id IS 'FK to public.member(id) - applicant/member evaluated.';
COMMENT ON COLUMN public.loan_calculator.loan_id IS 'Optional FK to public.loans(control_number) once evaluation becomes an actual loan.';
COMMENT ON COLUMN public.loan_calculator.principal_amount IS 'Requested principal amount.';
COMMENT ON COLUMN public.loan_calculator.net_proceeds IS 'Disbursable amount after fees and deductions.';
COMMENT ON COLUMN public.loan_calculator.latest_net_pay IS 'Latest monthly net pay used for DTI rule.';
COMMENT ON COLUMN public.loan_calculator.multiplier IS 'Policy multiplier cap: 3.00 (non-MIGS) or 5.00 (MIGS).';
COMMENT ON COLUMN public.loan_calculator.monthly_amortization IS 'Computed monthly amortization.';
COMMENT ON COLUMN public.loan_calculator.stress_index IS 'DTI ratio: monthly_amortization/latest_net_pay.';
COMMENT ON COLUMN public.loan_calculator.risk_category IS 'Derived risk band from stress index.';
COMMENT ON COLUMN public.loan_calculator.is_eligible IS 'True if monthly amortization is <= 40% of latest net pay.';

COMMIT;
