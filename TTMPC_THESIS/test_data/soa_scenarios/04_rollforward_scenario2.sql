-- SOA test scenarios -- STEP 4: roll TESTSOA-CL-0002 forward to installment #10.
--
-- Run AFTER 03_shift_scenario2.sql. Does by hand, for this one test loan, what
-- the planned backend roll-forward will do automatically:
--   #7 (Jul 15), #8 (Aug 15), #9 (Sep 15) -> closed as 'partially_paid' with
--   nothing paid (= missed); each one's amount carries into the next row as
--   carried_arrears.
--   #10 (Oct 15) -> new open row (Unpaid), carried_arrears = 29,979.99, so
--   the bill on it is 9,993.33 + 29,979.99 = 39,973.32 (+ penalty).
--
-- No payments, no balances, no penalties are written. Refuses to run twice.
-- Undo: 99_rollback.sql (removes the whole test loan).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.loan_schedules
    WHERE loan_id = 'TESTSOA-CL-0002' AND installment_no = 7
      AND lower(schedule_status) = 'unpaid' AND due_date = DATE '2026-07-15'
  ) OR EXISTS (
    SELECT 1 FROM public.loan_schedules
    WHERE loan_id = 'TESTSOA-CL-0002' AND installment_no > 7
  ) THEN
    RAISE EXCEPTION 'TESTSOA-CL-0002 is not at "#7 open, due 2026-07-15" (run 03 first, or 04 already ran / testing changed it). Stopping.';
  END IF;
END $$;

-- Close #7 first: only one open row per loan is allowed.
UPDATE public.loan_schedules
SET schedule_status = 'partially_paid'
WHERE loan_id = 'TESTSOA-CL-0002' AND installment_no = 7;

-- #8, #9 missed (closed) and #10 open, each carrying the missed amounts before it.
INSERT INTO public.loan_schedules (
  schedule_id, loan_id, installment_no, due_date,
  expected_amount, expected_principal, expected_interest, penalty,
  remaining_principal, principal_component, interest_component,
  carried_arrears, applied_credit, schedule_status
)
SELECT
  'TESTSOA_SI_2_' || lpad(k::text, 2, '0'), 'TESTSOA-CL-0002', k,
  (DATE '2026-07-15' + make_interval(months => k - 7))::date,
  9993.33, 8333.33, 1660.00, 2,
  greatest(200000 - k * 8333.33, 0), 8333.33, 1660.00,
  9993.33 * (k - 7), 0,
  CASE WHEN k < 10 THEN 'partially_paid' ELSE 'Unpaid' END
FROM generate_series(8, 10) AS k;

-- Expect: #1-#6 Paid, #7-#9 partially_paid (carried 0 / 9993.33 / 19986.66),
-- #10 Unpaid due 2026-10-15 carried 29979.99, bill 39973.32.
SELECT installment_no, due_date, schedule_status, expected_amount, carried_arrears,
       expected_amount + carried_arrears AS bill
FROM public.loan_schedules
WHERE loan_id = 'TESTSOA-CL-0002'
ORDER BY installment_no;

COMMIT;
