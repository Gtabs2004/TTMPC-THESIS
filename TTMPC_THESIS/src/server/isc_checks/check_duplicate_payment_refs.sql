-- Read-only: how bad is the payment_reference duplication?
-- Run this BEFORE the dedup migration. Changes nothing.

-- 1) Which references are duplicated, and how many rows share each.
SELECT
    payment_reference,
    COUNT(*)                         AS row_count,
    COUNT(DISTINCT loan_id)          AS distinct_loans,
    SUM(amount_paid)                 AS total_amount,
    MIN(payment_date)                AS first_payment,
    MAX(payment_date)                AS last_payment
FROM public.loan_payments
WHERE payment_reference IS NOT NULL
GROUP BY payment_reference
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, payment_reference;

-- 2) Summary.
SELECT
    COUNT(*)                                      AS duplicated_reference_values,
    SUM(row_count)                                AS rows_involved,
    SUM(row_count) - COUNT(*)                     AS rows_needing_a_new_reference
FROM (
    SELECT payment_reference, COUNT(*) AS row_count
    FROM public.loan_payments
    WHERE payment_reference IS NOT NULL
    GROUP BY payment_reference
    HAVING COUNT(*) > 1
) d;

-- 3) The rows themselves, so you can eyeball whether any are genuine
--    double-charges rather than just reference collisions.
--    Same loan + same amount + same day = worth a closer look.
SELECT
    p.payment_reference,
    p.id,
    p.loan_id,
    p.amount_paid,
    p.payment_date,
    p.confirmation_status
FROM public.loan_payments p
JOIN (
    SELECT payment_reference
    FROM public.loan_payments
    WHERE payment_reference IS NOT NULL
    GROUP BY payment_reference
    HAVING COUNT(*) > 1
) dup ON dup.payment_reference = p.payment_reference
ORDER BY p.payment_reference, p.payment_date, p.id;

-- 4) Possible REAL duplicate charges (not just reference reuse):
--    same loan, same amount, same calendar day, more than one row.
SELECT
    loan_id,
    amount_paid,
    payment_date::date AS day,
    COUNT(*)           AS rows_that_day,
    array_agg(id)      AS payment_ids
FROM public.loan_payments
GROUP BY loan_id, amount_paid, payment_date::date
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, loan_id;
