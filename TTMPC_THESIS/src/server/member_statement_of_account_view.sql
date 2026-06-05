-- Member Statement of Account view
-- Sources:
--   * loan_payments         -> live cashier/bookkeeper workflow (validated rows only)
--   * loan_payments_legacy  -> historical payments imported from Normalized_Payments.csv
--                              (treated as already-validated; no penalty/deficiency on file)
--   * loans                 -> member_id, principal_amount, total_interest
--   * loan_schedules        -> optional per-installment interest split (live payments only)
--
-- Data-model notes from the bookkeeper -> manager -> treasurer -> cashier -> bookkeeper flow:
--   * Cashier inserts loan_payments with status 'pending_bookkeeper'.
--   * Bookkeeper review flips status to 'validated' (or 'rejected').
--   * Per the loan_payment_ledger trigger, only 'validated' rows reduce the loan's balance.
--   * Interest is NOT recorded per payment; it only exists at the loan level as total_interest.
--     We apportion it pro-rata: interest_paid = amount_paid * total_interest / principal_amount.
--   * Legacy rows are pre-validated history; penalty/deficiency default to 0.

BEGIN;

CREATE OR REPLACE VIEW public.member_statement_of_account AS
WITH validated AS (
    SELECT
        p.id                    AS payment_id,
        p.loan_id               AS control_number,
        l.member_id             AS member_id,
        p.payment_date          AS payment_date,
        COALESCE(
            NULLIF(p.transaction_reference, ''),
            NULLIF(p.payment_reference, ''),
            p.id::text
        )                       AS reference_id,
        p.amount_paid::numeric(14,2)  AS amount_paid,
        p.penalties::numeric(14,2)    AS penalty,
        p.deficiency::numeric(14,2)   AS deficiency,
        COALESCE(l.principal_amount, l.loan_amount, 0)::numeric(14,2) AS loan_principal,
        COALESCE(l.total_interest, 0)::numeric(14,2)                  AS loan_interest,
        s.expected_interest     AS schedule_interest
    FROM public.loan_payments p
    JOIN public.loans l           ON l.control_number = p.loan_id
    LEFT JOIN public.loan_schedules s ON s.id = p.schedule_id
    WHERE lower(coalesce(p.confirmation_status, '')) = 'validated'

    UNION ALL

    SELECT
        lp.id                   AS payment_id,
        lp.loan_id              AS control_number,
        l.member_id             AS member_id,
        lp.payment_date         AS payment_date,
        COALESCE(
            NULLIF(lp.or_cdv_no, ''),
            NULLIF(lp.payment_code, ''),
            lp.id::text
        )                       AS reference_id,
        lp.amount_paid::numeric(14,2)        AS amount_paid,
        0::numeric(14,2)                     AS penalty,
        0::numeric(14,2)                     AS deficiency,
        COALESCE(l.principal_amount, l.loan_amount, 0)::numeric(14,2) AS loan_principal,
        COALESCE(l.total_interest, 0)::numeric(14,2)                  AS loan_interest,
        NULL::numeric                        AS schedule_interest
    FROM public.loan_payments_legacy lp
    JOIN public.loans l ON l.control_number = lp.loan_id
),
with_running AS (
    SELECT
        v.*,
        SUM(v.amount_paid) OVER (
            PARTITION BY v.control_number
            ORDER BY v.payment_date, v.payment_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_principal_paid
    FROM validated v
)
SELECT
    member_id,
    control_number,
    payment_id,
    payment_date,
    reference_id,
    amount_paid::numeric(14,2) AS principal_paid,
    CASE
        WHEN schedule_interest IS NOT NULL AND schedule_interest > 0
            THEN schedule_interest::numeric(14,2)
        WHEN loan_principal > 0
            THEN ROUND(amount_paid * loan_interest / loan_principal, 2)::numeric(14,2)
        ELSE 0::numeric(14,2)
    END                                                  AS interest_paid,
    deficiency,
    penalty,
    (amount_paid + penalty)::numeric(14,2)               AS total_amount_paid,
    GREATEST(loan_principal - cumulative_principal_paid, 0)::numeric(14,2) AS outstanding_balance,
    'validated'::text                                    AS confirmation_status
FROM with_running
ORDER BY member_id, control_number, payment_date ASC;

ALTER VIEW public.member_statement_of_account SET (security_invoker = on);

GRANT SELECT ON public.member_statement_of_account TO authenticated;

COMMIT;
