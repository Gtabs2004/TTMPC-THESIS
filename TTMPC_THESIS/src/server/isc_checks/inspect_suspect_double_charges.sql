-- Read-only. Investigate the two suspected double charges before deciding
-- whether either is a real duplicate or two legitimate same-day payments.

-- 1) Full detail on every row involved, including exact timestamps.
--    Seconds apart  => almost certainly a double-click duplicate.
--    Hours apart    => plausibly two genuine payments.
SELECT
    p.loan_id,
    p.id,
    p.payment_reference,
    p.transaction_reference,
    p.amount_paid,
    p.penalties,
    p.payment_date,
    p.created_at,
    p.confirmation_status,
    p.entered_by_role,
    p.entered_by,
    p.schedule_id,
    p.validation_notes
FROM public.loan_payments p
WHERE p.loan_id IN ('CL-20260427-1273', 'CL-20260509-4759')
ORDER BY p.loan_id, p.payment_date, p.created_at;

-- 2) Gap between the two rows in each pair. A gap measured in seconds is the
--    signature of a double-submit; a gap in hours is not.
WITH pairs AS (
    SELECT
        loan_id,
        amount_paid,
        payment_date::date AS day,
        id,
        COALESCE(created_at, payment_date) AS ts,
        LAG(COALESCE(created_at, payment_date)) OVER (
            PARTITION BY loan_id, amount_paid, payment_date::date
            ORDER BY COALESCE(created_at, payment_date)
        ) AS prev_ts
    FROM public.loan_payments
    WHERE loan_id IN ('CL-20260427-1273', 'CL-20260509-4759')
)
SELECT
    loan_id, amount_paid, day, id,
    ts,
    prev_ts,
    ts - prev_ts AS gap
FROM pairs
WHERE prev_ts IS NOT NULL
ORDER BY loan_id;

-- 3) Did BOTH rows post to the balance? Only 'validated' rows reduce it.
--    Two validated rows = the member was charged twice.
SELECT
    loan_id,
    confirmation_status,
    COUNT(*)          AS rows_with_status,
    SUM(amount_paid)  AS amount_at_status
FROM public.loan_payments
WHERE loan_id IN ('CL-20260427-1273', 'CL-20260509-4759')
GROUP BY loan_id, confirmation_status
ORDER BY loan_id, confirmation_status;

-- 4) Loan-level impact: expected total vs what has actually been posted.
SELECT
    l.control_number,
    COALESCE(l.principal_amount, l.loan_amount, 0) AS principal,
    COALESCE(l.total_interest, 0)                  AS total_interest,
    COALESCE(l.principal_amount, l.loan_amount, 0)
      + COALESCE(l.total_interest, 0)              AS total_payable,
    l.monthly_amortization,
    l.term,
    l.loan_status,
    (SELECT COALESCE(SUM(amount_paid), 0)
       FROM public.loan_payments x
      WHERE x.loan_id = l.control_number
        AND lower(COALESCE(x.confirmation_status,'')) = 'validated') AS validated_paid
FROM public.loans l
WHERE l.control_number IN ('CL-20260427-1273', 'CL-20260509-4759');

-- 5) Schedule state for these loans -- did the extra payment close an
--    installment that should still be open?
SELECT
    loan_id, installment_no, due_date, expected_amount,
    schedule_status, created_at
FROM public.loan_schedules
WHERE loan_id IN ('CL-20260427-1273', 'CL-20260509-4759')
ORDER BY loan_id, installment_no;

-- 6) Is either row already in the ledger (i.e. it really did post)?
SELECT
    lpl.loan_id, lpl.payment_id, lpl.amount_paid,
    lpl.total_collected, lpl.posted_at
FROM public.loan_payment_ledger lpl
WHERE lpl.loan_id IN ('CL-20260427-1273', 'CL-20260509-4759')
ORDER BY lpl.loan_id, lpl.posted_at;
