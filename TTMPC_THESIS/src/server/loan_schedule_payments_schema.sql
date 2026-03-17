-- Execution-ready schema update for unified loans + schedules/payments.
-- Run in Supabase SQL editor.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Update existing loans table (no loan_application table is created).
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS net_proceeds numeric,
  ADD COLUMN IF NOT EXISTS total_interest numeric,
  ADD COLUMN IF NOT EXISTS service_fee numeric,
  ADD COLUMN IF NOT EXISTS cbu_deduction numeric,
  ADD COLUMN IF NOT EXISTS insurance_fee numeric,
  ADD COLUMN IF NOT EXISTS notarial_fee numeric;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.loans'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%loan_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.loans DROP CONSTRAINT %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.loans
  ADD CONSTRAINT loans_loan_status_chk
  CHECK (
    lower(coalesce(loan_status, '')) IN (
      'pending',
      'recommended for approval',
      'approved',
      'rejected',
      'cancelled',
      'released',
      'to be disbursed'
    )
  );

-- 2) Create loan_schedules table.
CREATE TABLE IF NOT EXISTS public.loan_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id varchar NOT NULL REFERENCES public.loans(control_number) ON DELETE CASCADE,
  installment_no int NOT NULL CHECK (installment_no > 0),
  due_date date NOT NULL,
  expected_amount numeric NOT NULL CHECK (expected_amount >= 0),
  principal_component numeric NOT NULL CHECK (principal_component >= 0),
  interest_component numeric NOT NULL CHECK (interest_component >= 0),
  schedule_status text NOT NULL DEFAULT 'Pending'
    CHECK (lower(schedule_status) IN ('pending', 'paid', 'overdue')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loan_schedules_loan_installment_uk UNIQUE (loan_id, installment_no),
  CONSTRAINT loan_schedules_id_loan_uk UNIQUE (id, loan_id)
);

CREATE INDEX IF NOT EXISTS idx_loan_schedules_loan_id
  ON public.loan_schedules (loan_id);

CREATE INDEX IF NOT EXISTS idx_loan_schedules_due_date
  ON public.loan_schedules (due_date);

CREATE INDEX IF NOT EXISTS idx_loan_schedules_status
  ON public.loan_schedules (schedule_status);

-- 3) Create loan_payments table.
CREATE TABLE IF NOT EXISTS public.loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id varchar NOT NULL REFERENCES public.loans(control_number) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.loan_schedules(id) ON DELETE RESTRICT,
  transaction_id uuid,
  amount_paid numeric NOT NULL CHECK (amount_paid >= 0),
  payment_date timestamptz NOT NULL DEFAULT now(),
  penalties numeric NOT NULL DEFAULT 0 CHECK (penalties >= 0),
  deficiency numeric NOT NULL DEFAULT 0 CHECK (deficiency >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loan_payments_schedule_loan_fk
    FOREIGN KEY (schedule_id, loan_id)
    REFERENCES public.loan_schedules (id, loan_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id
  ON public.loan_payments (loan_id);

CREATE INDEX IF NOT EXISTS idx_loan_payments_schedule_id
  ON public.loan_payments (schedule_id);

CREATE INDEX IF NOT EXISTS idx_loan_payments_payment_date
  ON public.loan_payments (payment_date);

COMMIT;
