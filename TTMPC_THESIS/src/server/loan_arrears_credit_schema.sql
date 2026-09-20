-- Carry-forward arrears and excess-payment credit.
--
-- Before this migration a payment could only ever be a lump sum against one
-- installment: a shortfall stayed owed but was never added to the next month's
-- bill, and an overpayment reduced the balance but never reduced the next
-- month's bill. Both are now carried on the schedule row itself.
--
--   carried_arrears  -- unpaid amount rolled in FROM earlier installments
--   applied_credit   -- excess rolled in FROM earlier installments
--
-- Amount actually due for an installment:
--     expected_amount + carried_arrears - applied_credit
--
-- These two are never both positive on the same row: a period either fell
-- short or ran over, so the builder nets them before writing.

ALTER TABLE public.loan_schedules
  ADD COLUMN IF NOT EXISTS carried_arrears numeric NOT NULL DEFAULT 0
    CHECK (carried_arrears >= 0),
  ADD COLUMN IF NOT EXISTS applied_credit numeric NOT NULL DEFAULT 0
    CHECK (applied_credit >= 0);

COMMENT ON COLUMN public.loan_schedules.carried_arrears IS
  'Unpaid amount carried forward from earlier installments. Adds to the amount due.';
COMMENT ON COLUMN public.loan_schedules.applied_credit IS
  'Excess payment carried forward from earlier installments. Reduces the amount due.';

-- 'partially_paid' is a real state: the installment took money but not enough.
-- It must stay OUT of the single-active-due index below, otherwise a partially
-- paid row and its successor would both be "active" and collide.
ALTER TABLE public.loan_schedules
  DROP CONSTRAINT IF EXISTS loan_schedules_schedule_status_check;

ALTER TABLE public.loan_schedules
  ADD CONSTRAINT loan_schedules_schedule_status_check
  CHECK (lower(schedule_status) IN ('unpaid', 'paid', 'overdue', 'partially_paid'));

-- Rebuild the guardrail so a partially-paid row no longer counts as the one
-- active due. Without this, closing a short installment and opening the next
-- one would violate the unique index.
DROP INDEX IF EXISTS idx_loan_schedules_one_active_due_per_loan;
CREATE UNIQUE INDEX idx_loan_schedules_one_active_due_per_loan
  ON public.loan_schedules (loan_id)
  WHERE lower(coalesce(schedule_status, '')) IN ('unpaid', 'pending', 'overdue');
