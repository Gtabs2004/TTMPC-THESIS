-- Read-only: did the partial payment behave correctly end to end?
--
-- Set the loan once, then run. Expected for Lorelie Rios's loan:
--   amortization 8,247.00, paid 5,000.00  ->  3,247.00 carried forward,
--   next installment billing 11,494.00.

\set loan_id 'PUT-CONTROL-NUMBER-HERE'

-- If your SQL editor does not support \set, replace :'loan_id' below with the
-- control number in quotes, e.g. 'CL-20260925-1234'.


-- 1) SCHEDULES -- the heart of the test.
--    Expect: the paid installment = 'partially_paid' (NOT 'Paid'),
--            and the NEXT installment carrying the shortfall.
SELECT
    installment_no,
    due_date,
    schedule_status,
    expected_amount,
    carried_arrears,
    applied_credit,
    (expected_amount + carried_arrears - applied_credit) AS amount_due_this_period
FROM public.loan_schedules
WHERE loan_id = :'loan_id'
ORDER BY installment_no;


-- 2) THE PAYMENT and how it was allocated.
--    The four applied_to_* columns must sum to amount_paid.
SELECT
    payment_reference,
    amount_paid,
    penalties,
    confirmation_status,
    applied_to_penalty,
    applied_to_arrears,
    applied_to_current,
    applied_to_credit,
    (applied_to_penalty + applied_to_arrears + applied_to_current + applied_to_credit)
        AS allocation_total,
    payment_date
FROM public.loan_payments
WHERE loan_id = :'loan_id'
ORDER BY payment_date DESC;


-- 3) DID IT POST? A payment only moves the balance once it is in the ledger.
SELECT
    lpl.payment_id,
    lpl.amount_paid,
    lpl.penalties,
    lpl.total_collected,
    lpl.posted_at
FROM public.loan_payment_ledger lpl
WHERE lpl.loan_id = :'loan_id'
ORDER BY lpl.posted_at DESC;


-- 4) LOAN BALANCE -- validated payments vs total payable.
SELECT
    l.control_number,
    l.loan_status,
    l.monthly_amortization,
    l.term,
    COALESCE(l.principal_amount, l.loan_amount, 0) + COALESCE(l.total_interest, 0)
        AS total_payable,
    (SELECT COALESCE(SUM(amount_paid), 0) FROM public.loan_payments x
      WHERE x.loan_id = l.control_number
        AND lower(COALESCE(x.confirmation_status,'')) = 'validated') AS validated_paid,
    COALESCE(l.principal_amount, l.loan_amount, 0) + COALESCE(l.total_interest, 0)
      - (SELECT COALESCE(SUM(amount_paid), 0) FROM public.loan_payments x
          WHERE x.loan_id = l.control_number
            AND lower(COALESCE(x.confirmation_status,'')) = 'validated') AS remaining_balance
FROM public.loans l
WHERE l.control_number = :'loan_id';


-- 5) PENALTIES -- should be EMPTY for a loan still inside the grace period.
SELECT period_due_date, amount, basis_balance, rate_percent, is_paid, paid_amount
FROM public.loan_penalties
WHERE loan_id = :'loan_id'
ORDER BY period_due_date;


-- 6) SOA -- what the member will see.
SELECT
    payment_date, due_date, installment_no,
    amortization, principal_paid, carried_arrears, applied_credit,
    total_amount_due, penalty, accumulated_penalty,
    outstanding_balance, payment_status
FROM public.member_statement_of_account
WHERE control_number = :'loan_id'
ORDER BY payment_date;
