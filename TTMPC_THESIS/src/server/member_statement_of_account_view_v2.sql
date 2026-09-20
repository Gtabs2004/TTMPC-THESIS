-- SOA v2: expose the allocation breakdown and carry-forward (spec section 15).
--
-- Adds, per payment row:
--   amortization        -- what the period asked for
--   applied_to_penalty  -- how this payment was split ...
--   applied_to_arrears
--   applied_to_current
--   applied_to_credit   -- ... and what was left as credit
--   carried_arrears     -- outstanding carried INTO that period
--   applied_credit      -- credit carried INTO that period
--   accumulated_penalty -- unpaid penalty on the loan as a whole
--   payment_status
--
-- so a member can see WHY the amount due moved. Legacy rows keep zeros: they
-- are pre-validated history with no allocation on file.
--
-- Depends on loan_penalties_schema.sql and loan_arrears_credit_schema.sql.

BEGIN;

-- DROP, not CREATE OR REPLACE: the new column list inserts due_date and
-- installment_no in the middle, and REPLACE can only append columns -- it
-- cannot rename or reorder existing ones ("cannot change name of view column").
-- Nothing depends on this view but the member SOA screen, which reads it by
-- name, so dropping and recreating is safe. No table data is touched: a view
-- holds no rows of its own.
DROP VIEW IF EXISTS public.member_statement_of_account;

CREATE VIEW public.member_statement_of_account AS
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
        COALESCE(p.applied_to_penalty, 0)::numeric(14,2) AS applied_to_penalty,
        COALESCE(p.applied_to_arrears, 0)::numeric(14,2) AS applied_to_arrears,
        COALESCE(p.applied_to_current, 0)::numeric(14,2) AS applied_to_current,
        COALESCE(p.applied_to_credit, 0)::numeric(14,2)  AS applied_to_credit,
        COALESCE(s.expected_amount, 0)::numeric(14,2)    AS amortization,
        COALESCE(s.carried_arrears, 0)::numeric(14,2)    AS carried_arrears,
        COALESCE(s.applied_credit, 0)::numeric(14,2)     AS applied_credit,
        s.due_date              AS due_date,
        s.installment_no        AS installment_no,
        s.schedule_status       AS schedule_status,
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
        0::numeric(14,2)                     AS applied_to_penalty,
        0::numeric(14,2)                     AS applied_to_arrears,
        lp.amount_paid::numeric(14,2)        AS applied_to_current,
        0::numeric(14,2)                     AS applied_to_credit,
        0::numeric(14,2)                     AS amortization,
        0::numeric(14,2)                     AS carried_arrears,
        0::numeric(14,2)                     AS applied_credit,
        lp.payment_date::date                AS due_date,
        NULL::int                            AS installment_no,
        'Paid'::text                         AS schedule_status,
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
),
penalty_totals AS (
    -- Accumulated unpaid penalty per loan (spec section 10).
    SELECT
        loan_id,
        SUM(GREATEST(amount - COALESCE(paid_amount, 0), 0))::numeric(14,2) AS accumulated_penalty
    FROM public.loan_penalties
    WHERE is_paid = false
    GROUP BY loan_id
)
SELECT
    w.member_id,
    w.control_number,
    w.payment_id,
    w.payment_date,
    w.due_date,
    w.installment_no,
    w.reference_id,
    w.amortization,
    w.amount_paid::numeric(14,2) AS principal_paid,
    CASE
        WHEN w.schedule_interest IS NOT NULL AND w.schedule_interest > 0
            THEN w.schedule_interest::numeric(14,2)
        WHEN w.loan_principal > 0
            THEN ROUND(w.amount_paid * w.loan_interest / w.loan_principal, 2)::numeric(14,2)
        ELSE 0::numeric(14,2)
    END                                                  AS interest_paid,
    w.deficiency,
    w.penalty,
    w.applied_to_penalty,
    w.applied_to_arrears,
    w.applied_to_current,
    w.applied_to_credit,
    w.carried_arrears,
    w.applied_credit,
    COALESCE(pt.accumulated_penalty, 0)::numeric(14,2)   AS accumulated_penalty,
    (w.amount_paid + w.penalty)::numeric(14,2)           AS total_amount_paid,
    GREATEST(w.amortization + w.carried_arrears - w.applied_credit, 0)::numeric(14,2)
                                                         AS total_amount_due,
    GREATEST(w.loan_principal - w.cumulative_principal_paid, 0)::numeric(14,2) AS outstanding_balance,
    COALESCE(w.schedule_status, 'Paid')                  AS payment_status,
    'validated'::text                                    AS confirmation_status
FROM with_running w
LEFT JOIN penalty_totals pt ON pt.loan_id = w.control_number
ORDER BY w.member_id, w.control_number, w.payment_date ASC;

ALTER VIEW public.member_statement_of_account SET (security_invoker = on);

GRANT SELECT ON public.member_statement_of_account TO authenticated;

COMMIT;
