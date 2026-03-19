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
      'ready for disbursement',
      'to be disbursed'
    )
  );

-- 2) Create/upgrade loan_schedules table.
CREATE TABLE IF NOT EXISTS public.loan_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id text UNIQUE,
  loan_id varchar NOT NULL REFERENCES public.loans(control_number) ON DELETE CASCADE,
  installment_no int NOT NULL CHECK (installment_no > 0),
  due_date date NOT NULL,
  expected_principal numeric NOT NULL DEFAULT 0 CHECK (expected_principal >= 0),
  expected_interest numeric NOT NULL DEFAULT 0 CHECK (expected_interest >= 0),
  penalty numeric NOT NULL DEFAULT 0 CHECK (penalty >= 0),
  salary_schedule_id uuid,
  remaining_principal numeric NOT NULL DEFAULT 0 CHECK (remaining_principal >= 0),
  expected_amount numeric NOT NULL CHECK (expected_amount >= 0),
  principal_component numeric NOT NULL CHECK (principal_component >= 0),
  interest_component numeric NOT NULL CHECK (interest_component >= 0),
  schedule_status text NOT NULL DEFAULT 'Unpaid'
    CHECK (lower(schedule_status) IN ('unpaid', 'paid', 'overdue')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loan_schedules_loan_installment_uk UNIQUE (loan_id, installment_no),
  CONSTRAINT loan_schedules_id_loan_uk UNIQUE (id, loan_id)
);

ALTER TABLE public.loan_schedules
  ADD COLUMN IF NOT EXISTS schedule_id text,
  ADD COLUMN IF NOT EXISTS expected_principal numeric,
  ADD COLUMN IF NOT EXISTS expected_interest numeric,
  ADD COLUMN IF NOT EXISTS penalty numeric,
  ADD COLUMN IF NOT EXISTS salary_schedule_id uuid,
  ADD COLUMN IF NOT EXISTS remaining_principal numeric;

ALTER TABLE public.loan_schedules
  ALTER COLUMN expected_principal SET DEFAULT 0,
  ALTER COLUMN expected_principal SET NOT NULL,
  ALTER COLUMN expected_interest SET DEFAULT 0,
  ALTER COLUMN expected_interest SET NOT NULL,
  ALTER COLUMN penalty SET DEFAULT 0,
  ALTER COLUMN penalty SET NOT NULL,
  ALTER COLUMN remaining_principal SET DEFAULT 0,
  ALTER COLUMN remaining_principal SET NOT NULL;

-- Keep legacy columns synchronized for compatibility with older code paths.
UPDATE public.loan_schedules
SET
  expected_principal = COALESCE(expected_principal, principal_component, 0),
  expected_interest = COALESCE(expected_interest, interest_component, 0),
  principal_component = COALESCE(principal_component, expected_principal, 0),
  interest_component = COALESCE(interest_component, expected_interest, 0)
WHERE expected_principal IS NULL
   OR expected_interest IS NULL
   OR principal_component IS NULL
   OR interest_component IS NULL;

UPDATE public.loan_schedules
SET schedule_status = 'Unpaid'
WHERE lower(coalesce(schedule_status, '')) = 'pending';

DO $$
DECLARE
  rec record;
BEGIN
  -- Remove old/duplicate schedule_status checks to avoid conflicting constraints.
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.loan_schedules'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%schedule_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.loan_schedules DROP CONSTRAINT %I', rec.conname);
  END LOOP;

  -- Canonical schedule status check for the updated version.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'loan_schedules_schedule_status_v2_chk'
      AND conrelid = 'public.loan_schedules'::regclass
  ) THEN
    ALTER TABLE public.loan_schedules
      ADD CONSTRAINT loan_schedules_schedule_status_v2_chk
      CHECK (lower(coalesce(schedule_status, '')) IN ('unpaid', 'paid', 'overdue', 'pending'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'loan_schedules_expected_principal_check'
      AND conrelid = 'public.loan_schedules'::regclass
  ) THEN
    ALTER TABLE public.loan_schedules
      ADD CONSTRAINT loan_schedules_expected_principal_check CHECK (expected_principal >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'loan_schedules_expected_interest_check'
      AND conrelid = 'public.loan_schedules'::regclass
  ) THEN
    ALTER TABLE public.loan_schedules
      ADD CONSTRAINT loan_schedules_expected_interest_check CHECK (expected_interest >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'loan_schedules_penalty_check'
      AND conrelid = 'public.loan_schedules'::regclass
  ) THEN
    ALTER TABLE public.loan_schedules
      ADD CONSTRAINT loan_schedules_penalty_check CHECK (penalty >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'loan_schedules_remaining_principal_check'
      AND conrelid = 'public.loan_schedules'::regclass
  ) THEN
    ALTER TABLE public.loan_schedules
      ADD CONSTRAINT loan_schedules_remaining_principal_check CHECK (remaining_principal >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS loan_schedules_schedule_id_uk
  ON public.loan_schedules (schedule_id)
  WHERE schedule_id IS NOT NULL;

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
