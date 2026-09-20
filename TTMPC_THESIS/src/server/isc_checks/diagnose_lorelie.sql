-- Why did the ₱5,000 payment not carry ₱3,247 forward?
-- Loan CL-20260523-8734 (Lorelie Rios): amortization 8,247.00, paid 5,000.00.

-- 1) Schedules. THE key question: how many rows exist, and what status?
--    If there is only ONE schedule row, the approve path had no next
--    installment to carry arrears into.
SELECT
    installment_no,
    due_date,
    schedule_status,
    expected_amount,
    COALESCE(carried_arrears, 0) AS carried_arrears,
    COALESCE(applied_credit, 0)  AS applied_credit,
    id
FROM public.loan_schedules
WHERE loan_id = 'CL-20260523-8734'
ORDER BY installment_no;

-- 2) How many schedule rows vs the loan's term? A 12-month loan that only
--    ever has one schedule row at a time generates the next on approval.
SELECT
    l.control_number,
    l.term                                   AS term_months,
    l.monthly_amortization,
    (SELECT COUNT(*) FROM public.loan_schedules s
      WHERE s.loan_id = l.control_number)    AS schedule_rows
FROM public.loans l
WHERE l.control_number = 'CL-20260523-8734';

-- 3) The validated payment and its allocation. If applied_to_* are all 0,
--    the approve path did not run the new allocation code (stale server?).
SELECT
    payment_reference,
    amount_paid,
    confirmation_status,
    schedule_id,
    COALESCE(applied_to_penalty, 0) AS to_penalty,
    COALESCE(applied_to_arrears, 0) AS to_arrears,
    COALESCE(applied_to_current, 0) AS to_current,
    COALESCE(applied_to_credit, 0)  AS to_credit,
    payment_date
FROM public.loan_payments
WHERE loan_id = 'CL-20260523-8734'
ORDER BY payment_date;

-- 4) Which schedule did the validated ₱5,000 attach to, and is that row
--    still the "next unpaid" one the cashier screen reads?
SELECT
    p.payment_reference,
    p.amount_paid,
    p.confirmation_status,
    s.installment_no,
    s.schedule_status,
    s.expected_amount,
    COALESCE(s.carried_arrears, 0) AS carried_arrears
FROM public.loan_payments p
LEFT JOIN public.loan_schedules s ON s.id = p.schedule_id
WHERE p.loan_id = 'CL-20260523-8734'
ORDER BY p.payment_date;
