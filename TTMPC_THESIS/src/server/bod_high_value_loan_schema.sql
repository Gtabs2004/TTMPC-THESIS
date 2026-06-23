-- BOD High-Value Loan Approval (Consolidated > 500K)
-- Adds a new approval step between Bookkeeper and Manager.
--
-- Flow:
--   <= 500K: Bookkeeper "recommended for approval" -> Manager (existing).
--   >  500K: Bookkeeper "recommended for bod approval" -> BOD ->
--            on approve: status -> "recommended for approval" (Manager picks up).
--            on reject : status -> "bod rejected" (terminal).

-- 1. Allow new statuses on loans.loan_status check constraint -----------------
-- Strategy: drop ALL existing CHECK constraints that reference loan_status,
-- then recreate one with the full canonical list (from
-- bookkeeper_manager_review_schema.sql) plus the two new BOD statuses.
-- Same for koica_loans (KOICA loans also need to flow through BOD if > 500K
-- in the future; the constraint just needs to allow the values).

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
      'draft',
      'pending',
      'recommended for approval',
      'recommended for bod approval',
      'bod rejected',
      'approved',
      'revision_requested',
      'rejected',
      'cancelled',
      'released',
      'ready for disbursement',
      'to be disbursed',
      'partially paid',
      'fully paid'
    )
  );

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.koica_loans'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%loan_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.koica_loans DROP CONSTRAINT %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.koica_loans
  ADD CONSTRAINT koica_loans_loan_status_chk
  CHECK (
    lower(coalesce(loan_status, '')) IN (
      'draft',
      'pending',
      'recommended for approval',
      'recommended for bod approval',
      'bod rejected',
      'approved',
      'revision_requested',
      'rejected',
      'cancelled',
      'released',
      'ready for disbursement',
      'to be disbursed',
      'partially paid',
      'fully paid'
    )
  );

-- 2. Evidence payload for BOD approval ----------------------------------------
-- Holds: { resolution_no, resolution_date, signed_form_path, remarks,
--          decided_by, decided_at, decision }
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS bod_approval_payload jsonb NULL;

CREATE INDEX IF NOT EXISTS idx_loans_bod_pending
  ON public.loans (loan_status)
  WHERE lower(loan_status) = 'recommended for bod approval';
