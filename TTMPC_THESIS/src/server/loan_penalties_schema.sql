-- Persisted, accumulating loan penalties (spec sections 10 & 11).
--
-- Penalty used to be recomputed on the fly as rate x balance x months_overdue,
-- which produced a running total but left no record of WHEN it was charged,
-- WHICH period it belonged to, or WHETHER it had been paid.
--
-- One row per loan per billing period, each holding that single month's charge
-- (rate x balance for that month -- NOT multiplied by months_overdue, which
-- would double-count against the other rows). Accumulated penalty is therefore
-- SUM(amount) WHERE NOT paid, and it keeps growing for every month the loan
-- stays unpaid, exactly as section 10 describes.
--
-- The unique constraint on (loan_id, period_due_date) is what stops duplicate
-- penalty rows when the cashier screen or member portal is refreshed.

CREATE TABLE IF NOT EXISTS public.loan_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id varchar NOT NULL REFERENCES public.loans(control_number) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.loan_schedules(id) ON DELETE SET NULL,

  -- Which billing period this charge belongs to.
  period_due_date date NOT NULL,
  installment_no int,

  -- The charge for THIS period only.
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  basis_balance numeric(14,2) NOT NULL DEFAULT 0,
  rate_percent numeric(6,4) NOT NULL DEFAULT 0,

  -- Settlement tracking.
  is_paid boolean NOT NULL DEFAULT false,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  paid_at timestamptz,
  paid_by_payment_id uuid REFERENCES public.loan_payments(id) ON DELETE SET NULL,

  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- One penalty charge per loan per period. Re-running accrual is idempotent.
  CONSTRAINT loan_penalties_loan_period_uk UNIQUE (loan_id, period_due_date)
);

CREATE INDEX IF NOT EXISTS idx_loan_penalties_loan_id
  ON public.loan_penalties (loan_id);

CREATE INDEX IF NOT EXISTS idx_loan_penalties_unpaid
  ON public.loan_penalties (loan_id)
  WHERE is_paid = false;

ALTER TABLE public.loan_penalties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loan_penalties_service_role_all ON public.loan_penalties;
CREATE POLICY loan_penalties_service_role_all
ON public.loan_penalties
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS loan_penalties_authenticated_select ON public.loan_penalties;
CREATE POLICY loan_penalties_authenticated_select
ON public.loan_penalties
FOR SELECT
TO authenticated
USING (true);


-- Payment allocation breakdown (spec section 13).
--
-- There was no allocation logic at all: a payment was a lump sum. These
-- columns record how each payment was split, so the SOA and the member portal
-- can show why a balance moved the way it did. Priority is
--   penalty -> arrears -> current installment -> credit
-- and is applied in the FastAPI approve path.

ALTER TABLE public.loan_payments
  ADD COLUMN IF NOT EXISTS applied_to_penalty numeric(14,2) NOT NULL DEFAULT 0
    CHECK (applied_to_penalty >= 0),
  ADD COLUMN IF NOT EXISTS applied_to_arrears numeric(14,2) NOT NULL DEFAULT 0
    CHECK (applied_to_arrears >= 0),
  ADD COLUMN IF NOT EXISTS applied_to_current numeric(14,2) NOT NULL DEFAULT 0
    CHECK (applied_to_current >= 0),
  ADD COLUMN IF NOT EXISTS applied_to_credit numeric(14,2) NOT NULL DEFAULT 0
    CHECK (applied_to_credit >= 0);

COMMENT ON COLUMN public.loan_payments.applied_to_penalty IS
  'Portion of this payment that settled accrued penalties.';
COMMENT ON COLUMN public.loan_payments.applied_to_arrears IS
  'Portion that settled arrears carried from earlier installments.';
COMMENT ON COLUMN public.loan_payments.applied_to_current IS
  'Portion applied to the current installment.';
COMMENT ON COLUMN public.loan_payments.applied_to_credit IS
  'Excess left over, carried forward as credit against the next installment.';


-- Idempotency guard (spec section 19) lives in
-- loan_payments_dedupe_references.sql, which clears the duplicate
-- payment_reference values first and then creates the unique index.
--
-- It is deliberately NOT created here: Supabase runs this file as a single
-- transaction, so a unique-violation on pre-existing duplicates would roll
-- back the whole migration -- the table and columns above included.
