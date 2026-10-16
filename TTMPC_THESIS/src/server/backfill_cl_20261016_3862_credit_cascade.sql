-- One-off backfill for loan CL-20261016-3862 (test/demo loan, Juan Dela Cruz).
--
-- This loan's installment #1 was paid with a ₱5,000 payment validated BEFORE
-- the multi-installment credit cascade fix existed in approve_bookkeeper_payment
-- (main.py). At that time, the code only ever carried credit onto ONE next
-- row: installment #2 got applied_credit = 1,499.00 (fully covering it), but
-- the remaining ₱2,002.00 of credit (₱3,501 total credit − ₱1,499 consumed by
-- #2) was silently dropped instead of cascading to #3 and #4.
--
-- This script brings the schedule to the state the FIXED code would have
-- produced: #2 closed Paid (it already has its correct applied_credit),
-- #3 inserted as Paid (fully covered by credit), #4 inserted as the new open
-- row carrying the ₱503.00 remainder of credit.
--
-- This is a one-off manual correction for this one already-validated payment.
-- It does not need to be repeated: every payment validated from now on goes
-- through the fixed cascade loop automatically.

BEGIN;

-- 1) Close installment #2 as Paid -- its applied_credit (1,499.00) already
--    fully covers its expected_amount (1,499.00), so nothing further to pay.
UPDATE public.loan_schedules
SET schedule_status = 'Paid'
WHERE loan_id = 'CL-20261016-3862'
  AND installment_no = 2;

-- 2) Insert installment #3, fully covered by the remaining credit
--    (3,501.00 total credit − 1,499.00 consumed by #2 = 2,002.00 remaining;
--    #3's own expected_amount of 1,499.00 consumes 1,499.00 of it, same cap
--    build_single_schedule_row applies: row_credit = min(row_credit, expected_amount)).
INSERT INTO public.loan_schedules (
    loan_id, installment_no, due_date, expected_amount,
    principal_component, interest_component, schedule_status,
    schedule_id, expected_principal, expected_interest, penalty,
    remaining_principal, carried_arrears, applied_credit
) VALUES (
    'CL-20261016-3862', 3, '2027-01-16', 1499.00,
    1250.00, 249.00, 'Paid',
    'TTMPCLP_SI_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    1250.00, 249.00, 2.00,
    26250.00, 0.00, 1499.00
);

-- 3) Insert installment #4, the new open row, carrying the final 503.00 of
--    credit (2,002.00 remaining after #3 − 1,499.00 consumed by #3).
--    Its real amount still due is 1,499.00 − 503.00 = 996.00.
INSERT INTO public.loan_schedules (
    loan_id, installment_no, due_date, expected_amount,
    principal_component, interest_component, schedule_status,
    schedule_id, expected_principal, expected_interest, penalty,
    remaining_principal, carried_arrears, applied_credit
) VALUES (
    'CL-20261016-3862', 4, '2027-02-16', 1499.00,
    1250.00, 249.00, 'Unpaid',
    'TTMPCLP_SI_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    1250.00, 249.00, 2.00,
    25000.00, 0.00, 503.00
);

COMMIT;

-- Verify afterward:
--   SELECT installment_no, due_date, expected_amount, applied_credit, schedule_status
--   FROM public.loan_schedules
--   WHERE loan_id = 'CL-20261016-3862'
--   ORDER BY installment_no;
-- Expect: #1 Paid, #2 Paid, #3 Paid, #4 Unpaid with applied_credit 503.00.
