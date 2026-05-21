-- Disbursement confirmation records.
-- Persists a snapshot of every cashier-initiated loan disbursement for audit, validation,
-- and transaction history (replaces a printed receipt with an in-system evidence trail).
--
-- Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.disbursement_confirmations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_number text NOT NULL UNIQUE,
    loan_id text NOT NULL,
    member_id text,
    member_name text NOT NULL,
    loan_type text,
    loan_amount numeric(14, 2) NOT NULL,
    disbursed_at timestamptz NOT NULL,
    first_due_date date,
    cashier_id text,
    cashier_name text,
    loan_status text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disbursement_confirmations_loan_id
    ON public.disbursement_confirmations (loan_id);

CREATE INDEX IF NOT EXISTS idx_disbursement_confirmations_disbursed_at
    ON public.disbursement_confirmations (disbursed_at DESC);
