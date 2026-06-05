-- loan_payments_legacy schema
-- Holds historical payment records imported from Normalized_Payments.csv.
-- Kept separate from public.loan_payments (live cashier/bookkeeper workflow).
--
-- Run once in Supabase SQL Editor.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.loan_payments_legacy (
    id                       UUID PRIMARY KEY,
    payment_code             TEXT,
    loan_id                  VARCHAR NOT NULL REFERENCES public.loans(control_number) ON DELETE CASCADE,
    member_id                UUID NOT NULL REFERENCES public.member(id) ON DELETE CASCADE,
    legacy_loan_uuid         UUID NOT NULL,
    legacy_member_uuid       UUID NOT NULL,
    amount_paid              NUMERIC(14,2) NOT NULL CHECK (amount_paid >= 0),
    payment_date             DATE NOT NULL,
    or_cdv_no                TEXT,
    is_overpayment           BOOLEAN NOT NULL DEFAULT FALSE,
    application_date         DATE,
    delta_days               INTEGER,
    is_advance_payer         BOOLEAN NOT NULL DEFAULT FALSE,
    manual_note_overpayment  BOOLEAN NOT NULL DEFAULT FALSE,
    raw_payload              JSONB,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_payments_legacy_loan_id
    ON public.loan_payments_legacy (loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_legacy_member_id
    ON public.loan_payments_legacy (member_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_legacy_payment_date
    ON public.loan_payments_legacy (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_loan_payments_legacy_legacy_loan_uuid
    ON public.loan_payments_legacy (legacy_loan_uuid);

ALTER TABLE public.loan_payments_legacy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loan_payments_legacy_service_role_all ON public.loan_payments_legacy;
CREATE POLICY loan_payments_legacy_service_role_all
ON public.loan_payments_legacy
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS loan_payments_legacy_authenticated_select ON public.loan_payments_legacy;
CREATE POLICY loan_payments_legacy_authenticated_select
ON public.loan_payments_legacy
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.loan_payments_legacy TO authenticated;
GRANT ALL ON public.loan_payments_legacy TO service_role;

COMMENT ON TABLE public.loan_payments_legacy IS
    'Historical payments imported from Normalized_Payments.csv. Read-only operational data; not part of the live cashier/bookkeeper workflow.';

COMMIT;
