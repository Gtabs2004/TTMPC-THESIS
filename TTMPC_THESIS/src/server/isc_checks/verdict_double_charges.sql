-- Read-only. Single query: did either suspected pair actually post twice?
--
-- A payment only moves the balance when it is 'validated' AND has a
-- loan_payment_ledger row. Two such rows for the same pair = real double
-- charge. Anything else is a harmless unposted draft.

SELECT
    p.loan_id,
    p.id                                   AS payment_id,
    p.amount_paid,
    p.payment_reference,
    p.payment_date,
    p.created_at,
    p.confirmation_status,
    CASE WHEN lpl.payment_id IS NULL THEN 'NOT POSTED' ELSE 'POSTED' END AS ledger_state,
    lpl.posted_at,
    -- Seconds between this row and the previous same-amount row on the same
    -- day. A few seconds = double-click signature.
    COALESCE(p.created_at, p.payment_date) - LAG(COALESCE(p.created_at, p.payment_date)) OVER (
        PARTITION BY p.loan_id, p.amount_paid, p.payment_date::date
        ORDER BY COALESCE(p.created_at, p.payment_date)
    ) AS gap_from_previous
FROM public.loan_payments p
LEFT JOIN public.loan_payment_ledger lpl ON lpl.payment_id = p.id
WHERE (p.loan_id = 'CL-20260427-1273' AND p.amount_paid = 9350.00)
   OR (p.loan_id = 'CL-20260509-4759' AND p.amount_paid = 9969.99)
ORDER BY p.loan_id, COALESCE(p.created_at, p.payment_date);


-- VERDICT: counts only the rows that actually moved money.
SELECT
    p.loan_id,
    p.amount_paid,
    COUNT(*) FILTER (
        WHERE lower(COALESCE(p.confirmation_status,'')) = 'validated'
          AND lpl.payment_id IS NOT NULL
    ) AS posted_rows,
    CASE
        WHEN COUNT(*) FILTER (
                WHERE lower(COALESCE(p.confirmation_status,'')) = 'validated'
                  AND lpl.payment_id IS NOT NULL) > 1
            THEN 'REAL DOUBLE CHARGE - needs reversal'
        ELSE 'SAFE - only one row posted'
    END AS verdict
FROM public.loan_payments p
LEFT JOIN public.loan_payment_ledger lpl ON lpl.payment_id = p.id
WHERE (p.loan_id = 'CL-20260427-1273' AND p.amount_paid = 9350.00)
   OR (p.loan_id = 'CL-20260509-4759' AND p.amount_paid = 9969.99)
GROUP BY p.loan_id, p.amount_paid;
