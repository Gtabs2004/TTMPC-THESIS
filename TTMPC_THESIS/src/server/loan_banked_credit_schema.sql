-- Banked credit: holds a partial-installment overpayment credit until the
-- loan's FINAL installment, instead of discounting whichever installment the
-- credit happens to run out on.
--
-- Rule (confirmed 2026-10-17): every installment's amortization is always the
-- full scheduled amount. An overpayment's credit only ever closes a FULL
-- installment outright (that installment becomes Prepaid, 0 due, same as
-- before). The moment the remaining credit is less than one full
-- installment, it is NOT applied to that next installment -- it is banked
-- here on the loan instead, and carried untouched until the loan reaches its
-- last installment, where it finally reduces what's due there.
--
-- banked_credit is a running total per loan (not one column per installment,
-- since it can sit unused for many months). It is read and cleared by the
-- final-installment payoff logic in approve_bookkeeper_payment (main.py).

ALTER TABLE public.loans
    ADD COLUMN IF NOT EXISTS banked_credit numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.loans.banked_credit IS
    'Overpayment credit smaller than one full installment, held until the loan''s final installment (see loan_banked_credit_schema.sql).';

-- One-off correction for CL-20261016-3862 (test/demo loan, Juan Dela Cruz):
-- installment #4 was given 503.00 of applied_credit by the OLD cascade logic
-- (credit capped per-row, applied to whatever installment it reached). Under
-- the new rule that 503.00 must not discount #4 -- it belongs banked on the
-- loan instead, and #4 reverts to requiring its full 1,499.00.
UPDATE public.loan_schedules
SET applied_credit = 0.00
WHERE loan_id = 'CL-20261016-3862'
  AND installment_no = 4;

UPDATE public.loans
SET banked_credit = 503.00
WHERE control_number = 'CL-20261016-3862';

-- Verify afterward:
--   SELECT installment_no, expected_amount, applied_credit, schedule_status
--   FROM public.loan_schedules WHERE loan_id = 'CL-20261016-3862' ORDER BY installment_no;
--   -- Expect #4: applied_credit 0.00, still Unpaid, full 1,499.00 due.
--   SELECT control_number, banked_credit FROM public.loans WHERE control_number = 'CL-20261016-3862';
--   -- Expect banked_credit 503.00.
