-- LOAN_PAYMENTS schema migration (aligned with existing repo SQL)
-- Existing conventions in this codebase:
-- - public.loan_payments primary key is `id` (not `payment_id`)
-- - public.loans key is `control_number` (varchar)
-- - schedules table is `public.loan_schedules` with key `id`

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.loan_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        loan_id VARCHAR NOT NULL REFERENCES public.loans(control_number) ON DELETE CASCADE,
        schedule_id UUID NOT NULL REFERENCES public.loan_schedules(id) ON DELETE RESTRICT,
        transaction_id UUID,
    payment_reference TEXT,
    transaction_reference TEXT,
        amount_paid NUMERIC(14,2) NOT NULL CHECK (amount_paid > 0),
        payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        penalties NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (penalties >= 0),
        deficiency NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (deficiency >= 0),
    confirmation_status TEXT NOT NULL DEFAULT 'pending_bookkeeper',
    confirmed_at TIMESTAMPTZ,
    confirmed_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT loan_payments_schedule_loan_fk
            FOREIGN KEY (schedule_id, loan_id)
            REFERENCES public.loan_schedules (id, loan_id)
            ON DELETE RESTRICT
);

-- If table already exists from older scripts, ensure required columns are present.
ALTER TABLE public.loan_payments
    ADD COLUMN IF NOT EXISTS transaction_id UUID,
    ADD COLUMN IF NOT EXISTS payment_reference TEXT,
    ADD COLUMN IF NOT EXISTS transaction_reference TEXT,
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS penalties NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS deficiency NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS confirmation_status TEXT,
    ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS confirmed_by UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE public.loan_payments
    ALTER COLUMN amount_paid SET NOT NULL,
    ALTER COLUMN payment_date SET DEFAULT NOW(),
    ALTER COLUMN payment_date SET NOT NULL,
    ALTER COLUMN penalties SET DEFAULT 0,
    ALTER COLUMN penalties SET NOT NULL,
    ALTER COLUMN deficiency SET DEFAULT 0,
    ALTER COLUMN deficiency SET NOT NULL,
    ALTER COLUMN confirmation_status SET DEFAULT 'pending_bookkeeper',
    ALTER COLUMN confirmation_status SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_payments_amount_paid_chk'
            AND conrelid = 'public.loan_payments'::regclass
    ) THEN
        ALTER TABLE public.loan_payments
            ADD CONSTRAINT loan_payments_amount_paid_chk CHECK (amount_paid > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_payments_penalties_chk'
            AND conrelid = 'public.loan_payments'::regclass
    ) THEN
        ALTER TABLE public.loan_payments
            ADD CONSTRAINT loan_payments_penalties_chk CHECK (penalties >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_payments_deficiency_chk'
            AND conrelid = 'public.loan_payments'::regclass
    ) THEN
        ALTER TABLE public.loan_payments
            ADD CONSTRAINT loan_payments_deficiency_chk CHECK (deficiency >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_payments_confirmation_status_chk'
            AND conrelid = 'public.loan_payments'::regclass
    ) THEN
        ALTER TABLE public.loan_payments
            ADD CONSTRAINT loan_payments_confirmation_status_chk
            CHECK (lower(coalesce(confirmation_status, '')) IN ('pending_bookkeeper', 'confirmed', 'rejected'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id
    ON public.loan_payments (loan_id);

CREATE INDEX IF NOT EXISTS idx_loan_payments_schedule_id
    ON public.loan_payments (schedule_id);

CREATE INDEX IF NOT EXISTS idx_loan_payments_transaction_id
    ON public.loan_payments (transaction_id);

CREATE INDEX IF NOT EXISTS idx_loan_payments_confirmation_status
    ON public.loan_payments (confirmation_status);

CREATE INDEX IF NOT EXISTS idx_loan_payments_payment_date
    ON public.loan_payments (payment_date);

COMMENT ON TABLE public.loan_payments IS 'Stores loan amortization payments and penalties.';
COMMENT ON COLUMN public.loan_payments.id IS 'PaymentID (PK).';
COMMENT ON COLUMN public.loan_payments.loan_id IS 'LoanID FK -> public.loans(control_number).';
COMMENT ON COLUMN public.loan_payments.schedule_id IS 'Internal schedule UUID FK -> public.loan_schedules(id); UI schedule code is public.loan_schedules.schedule_id (e.g., TTMPCLP_SI_001).';
COMMENT ON COLUMN public.loan_payments.transaction_id IS 'TransactionID for audit trace (ledger or loan app reference).';
COMMENT ON COLUMN public.loan_payments.payment_reference IS 'Display PaymentID format for cashier UI (e.g., TTMPCLP-001).';
COMMENT ON COLUMN public.loan_payments.transaction_reference IS 'Display TransactionID format for cashier UI.';
COMMENT ON COLUMN public.loan_payments.amount_paid IS 'AmountPaid: monthly amortization payment amount.';
COMMENT ON COLUMN public.loan_payments.payment_date IS 'PaymentDate timestamp.';
COMMENT ON COLUMN public.loan_payments.penalties IS 'Penalties: actual cash collected as late-payment fine.';
COMMENT ON COLUMN public.loan_payments.deficiency IS 'Deficiency: number/score of missed due dates.';
COMMENT ON COLUMN public.loan_payments.confirmation_status IS 'Cashier-created payments remain pending_bookkeeper until Bookkeeper confirms.';
COMMENT ON COLUMN public.loan_payments.confirmed_at IS 'Timestamp when Bookkeeper confirms payment.';
COMMENT ON COLUMN public.loan_payments.confirmed_by IS 'User id of Bookkeeper who confirmed payment.';

COMMIT;
