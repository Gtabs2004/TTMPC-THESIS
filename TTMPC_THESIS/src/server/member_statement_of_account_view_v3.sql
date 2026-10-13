-- SOA v3: correct balances + loan position (overdue / remaining schedule).
--
-- Fixes found by the TESTSOA audit (test_data/soa_scenarios, 2026-10-13):
--
-- 1. outstanding_balance was principal - cumulative amount_paid. amount_paid
--    includes interest, so every balance was understated by the loan's total
--    interest (TESTSOA-CL-0001 showed 165,090 instead of 224,850). It is now
--    (principal + total_interest) - cumulative payments, the same definition
--    the Bookkeeper ledger and the payment approval path use.
-- 2. principal_paid was the whole payment, and interest_paid the full scheduled
--    interest on top of it, so interest was counted twice. A payment's loan
--    portion is now split by its own installment's interest share
--    (expected_interest / expected_amount); legacy rows with no schedule use
--    the loan-wide share. principal_paid + interest_paid = loan portion.
-- 3. penalty was p.penalties, a SNAPSHOT of the loan's whole unpaid penalty at
--    entry time -- two payments made while a penalty was outstanding showed it
--    twice in the totals. Payments with an allocation on file now report
--    applied_to_penalty (what that payment actually paid toward penalty).
--    Older payments with no allocation keep the old behaviour (penalties
--    collected on top of amount_paid), so historical totals don't change.
--    amount_paid is always the loan portion; penalty is never inside it.
--
-- Adds a second view, member_loan_schedule_position: one row per installment
-- still owed on each open loan. The app keeps only ONE open schedule row, so
-- installments after it (including missed ones) are projected from that row
-- with the same formulas build_single_schedule_row uses. is_projected marks
-- them. The last row absorbs rounding so the rows sum to remaining_balance.
--
-- Column names and order of member_statement_of_account are unchanged (two
-- columns appended), so the current page keeps working before the frontend
-- update ships.
--
-- Rollback: re-run member_statement_of_account_view_v2.sql, then
--   DROP VIEW IF EXISTS public.member_loan_schedule_position;

BEGIN;

DROP VIEW IF EXISTS public.member_statement_of_account;

CREATE VIEW public.member_statement_of_account AS
WITH loan_totals AS (
    SELECT
        l.control_number,
        l.member_id,
        COALESCE(l.principal_amount, l.loan_amount, 0)::numeric AS loan_principal,
        CASE
            WHEN COALESCE(l.total_interest, 0) > 0 THEN l.total_interest
            ELSE GREATEST(
                COALESCE(l.monthly_amortization, 0) * COALESCE(l.term, 0)
                - COALESCE(l.principal_amount, l.loan_amount, 0), 0)
        END::numeric AS loan_interest
    FROM public.loans l
),
validated AS (
    SELECT
        p.id                    AS payment_id,
        p.loan_id               AS control_number,
        lt.member_id            AS member_id,
        p.payment_date          AS payment_date,
        COALESCE(
            NULLIF(p.transaction_reference, ''),
            NULLIF(p.payment_reference, ''),
            p.id::text
        )                       AS reference_id,
        p.amount_paid::numeric  AS amount_paid,
        -- An allocation is on file when any applied_to_* column is set.
        (COALESCE(p.applied_to_penalty, 0) + COALESCE(p.applied_to_arrears, 0)
         + COALESCE(p.applied_to_current, 0) + COALESCE(p.applied_to_credit, 0)) > 0
                                AS has_allocation,
        COALESCE(p.penalties, 0)::numeric           AS penalty_snapshot,
        p.deficiency::numeric(14,2)                 AS deficiency,
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
        CASE
            WHEN COALESCE(s.expected_amount, 0) > 0
                THEN COALESCE(s.expected_interest, s.interest_component, 0) / s.expected_amount
            WHEN lt.loan_principal + lt.loan_interest > 0
                THEN lt.loan_interest / (lt.loan_principal + lt.loan_interest)
            ELSE 0
        END                     AS interest_share,
        lt.loan_principal,
        lt.loan_interest
    FROM public.loan_payments p
    JOIN loan_totals lt          ON lt.control_number = p.loan_id
    LEFT JOIN public.loan_schedules s ON s.id = p.schedule_id
    WHERE lower(coalesce(p.confirmation_status, '')) = 'validated'

    UNION ALL

    SELECT
        lp.id,
        lp.loan_id,
        lt.member_id,
        lp.payment_date,
        COALESCE(NULLIF(lp.or_cdv_no, ''), NULLIF(lp.payment_code, ''), lp.id::text),
        lp.amount_paid::numeric,
        false,
        0::numeric,
        0::numeric(14,2),
        0::numeric(14,2),
        0::numeric(14,2),
        lp.amount_paid::numeric(14,2),
        0::numeric(14,2),
        0::numeric(14,2),
        0::numeric(14,2),
        0::numeric(14,2),
        lp.payment_date::date,
        NULL::int,
        'Paid'::text,
        CASE WHEN lt.loan_principal + lt.loan_interest > 0
             THEN lt.loan_interest / (lt.loan_principal + lt.loan_interest) ELSE 0 END,
        lt.loan_principal,
        lt.loan_interest
    FROM public.loan_payments_legacy lp
    JOIN loan_totals lt ON lt.control_number = lp.loan_id
),
split AS (
    SELECT
        v.*,
        -- amount_paid is the loan portion; penalty cash is recorded separately
        -- in loan_payments.penalties (updated 2026-10-13: the cashier splits
        -- the cash handed over into penalty first, then the loan).
        v.amount_paid                             AS loan_portion,
        CASE WHEN v.has_allocation THEN v.applied_to_penalty ELSE v.penalty_snapshot END
                                                  AS penalty_paid
    FROM validated v
),
with_running AS (
    SELECT
        s.*,
        ROUND(s.loan_portion * s.interest_share, 2)                 AS interest_part,
        SUM(s.loan_portion) OVER w                                  AS cumulative_paid,
        SUM(s.loan_portion - ROUND(s.loan_portion * s.interest_share, 2)) OVER w
                                                                    AS cumulative_principal
    FROM split s
    WINDOW w AS (
        PARTITION BY s.control_number
        ORDER BY s.payment_date, s.payment_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )
),
penalty_totals AS (
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
    (w.loan_portion - w.interest_part)::numeric(14,2)    AS principal_paid,
    w.interest_part::numeric(14,2)                       AS interest_paid,
    w.deficiency,
    w.penalty_paid::numeric(14,2)                        AS penalty,
    w.applied_to_penalty,
    w.applied_to_arrears,
    w.applied_to_current,
    w.applied_to_credit,
    w.carried_arrears,
    w.applied_credit,
    COALESCE(pt.accumulated_penalty, 0)::numeric(14,2)   AS accumulated_penalty,
    (w.loan_portion + w.penalty_paid)::numeric(14,2)     AS total_amount_paid,
    GREATEST(w.amortization + w.carried_arrears - w.applied_credit, 0)::numeric(14,2)
                                                         AS total_amount_due,
    GREATEST(w.loan_principal + w.loan_interest - w.cumulative_paid, 0)::numeric(14,2)
                                                         AS outstanding_balance,
    COALESCE(w.schedule_status, 'Paid')                  AS payment_status,
    'validated'::text                                    AS confirmation_status,
    -- appended in v3
    GREATEST(w.loan_principal - w.cumulative_principal, 0)::numeric(14,2)
                                                         AS outstanding_principal,
    GREATEST(
        (w.loan_principal + w.loan_interest - w.cumulative_paid)
        - (w.loan_principal - w.cumulative_principal), 0)::numeric(14,2)
                                                         AS outstanding_interest
FROM with_running w
LEFT JOIN penalty_totals pt ON pt.loan_id = w.control_number
ORDER BY w.member_id, w.control_number, w.payment_date ASC;

ALTER VIEW public.member_statement_of_account SET (security_invoker = on);
GRANT SELECT ON public.member_statement_of_account TO authenticated;


DROP VIEW IF EXISTS public.member_loan_schedule_position;

CREATE VIEW public.member_loan_schedule_position AS
WITH loan_base AS (
    SELECT
        l.control_number,
        l.member_id,
        l.term,
        COALESCE(l.principal_amount, l.loan_amount, 0)::numeric AS principal,
        CASE
            WHEN COALESCE(l.total_interest, 0) > 0 THEN l.total_interest
            ELSE GREATEST(
                COALESCE(l.monthly_amortization, 0) * COALESCE(l.term, 0)
                - COALESCE(l.principal_amount, l.loan_amount, 0), 0)
        END::numeric AS total_interest,
        -- Emergency = diminishing; everything else = add-on (build_single_schedule_row).
        (upper(coalesce(lt.code, '')) LIKE '%EMERGENCY%'
         OR lower(coalesce(lt.name, '')) LIKE '%emergency%') AS is_diminishing,
        -- Same guard as sanitize_monthly_rate_percent(): stored rate in PERCENT,
        -- anything above 5 is a corrupted snapshot -> fall back to loan_types.
        (CASE
            WHEN l.interest_rate > 0 AND l.interest_rate <= 5 THEN l.interest_rate
            WHEN lt.interest_rate > 0 AND lt.interest_rate <= 5 THEN lt.interest_rate
            ELSE COALESCE(l.interest_rate, lt.interest_rate, 0)
         END)::numeric / 100 AS monthly_rate
    FROM public.loans l
    JOIN public.loan_types lt ON lt.id = l.loan_type_id
    WHERE lower(coalesce(l.loan_status, '')) IN ('released', 'partially paid')
),
paid AS (
    SELECT loan_id, SUM(amt) AS paid_total
    FROM (
        SELECT p.loan_id, p.amount_paid AS amt
        FROM public.loan_payments p
        WHERE lower(coalesce(p.confirmation_status, '')) = 'validated'
        UNION ALL
        SELECT lp.loan_id, lp.amount_paid FROM public.loan_payments_legacy lp
    ) x
    GROUP BY loan_id
),
open_row AS (
    SELECT DISTINCT ON (s.loan_id)
        s.id, s.loan_id, s.installment_no, s.due_date,
        COALESCE(s.expected_principal, s.principal_component, 0) AS exp_principal,
        COALESCE(s.expected_interest,  s.interest_component,  0) AS exp_interest,
        COALESCE(s.remaining_principal, 0)                        AS remaining_after,
        COALESCE(s.carried_arrears, 0)                            AS carried_arrears,
        COALESCE(s.applied_credit, 0)                             AS applied_credit
    FROM public.loan_schedules s
    WHERE lower(coalesce(s.schedule_status, '')) IN ('unpaid', 'pending', 'overdue')
    ORDER BY s.loan_id, s.installment_no
),
open_paid AS (
    SELECT p.schedule_id, SUM(p.amount_paid) AS paid_on_row
    FROM public.loan_payments p
    WHERE lower(coalesce(p.confirmation_status, '')) = 'validated'
    GROUP BY p.schedule_id
),
penalty_totals AS (
    SELECT loan_id, SUM(GREATEST(amount - COALESCE(paid_amount, 0), 0)) AS unpaid_penalty
    FROM public.loan_penalties
    WHERE is_paid = false
    GROUP BY loan_id
),
projected AS (
    SELECT
        lb.member_id,
        lb.control_number,
        lb.term,
        g.i                                                       AS installment_no,
        (o.due_date + make_interval(months => g.i - o.installment_no))::date AS due_date,
        (g.i > o.installment_no)                                  AS is_projected,
        GREATEST(lb.principal + lb.total_interest - COALESCE(pd.paid_total, 0), 0)
                                                                  AS remaining_balance,
        COALESCE(pt.unpaid_penalty, 0)                            AS unpaid_penalty,
        CASE
            WHEN g.i = o.installment_no THEN o.exp_principal
            WHEN NOT lb.is_diminishing THEN o.exp_principal
            ELSE dim.principal_i
        END                                                       AS principal_due,
        CASE
            WHEN g.i = o.installment_no THEN o.exp_interest
            WHEN NOT lb.is_diminishing THEN o.exp_interest
            ELSE ROUND((dim.balance_before - dim.principal_i) * lb.monthly_rate, 2)
        END                                                       AS interest_base,
        -- Carry-forwards and partial payments only touch the open row. Months
        -- closed by the roll-forward (or a short payment) are NOT listed: their
        -- unpaid amount is already in carried_arrears on this row, i.e. in the
        -- current bill (cooperative rule, 2026-10-13).
        CASE WHEN g.i = o.installment_no
             THEN o.carried_arrears - o.applied_credit - COALESCE(op.paid_on_row, 0)
             ELSE 0 END                                           AS open_adjustment
    FROM loan_base lb
    JOIN open_row o ON o.loan_id = lb.control_number
    LEFT JOIN paid pd ON pd.loan_id = lb.control_number
    LEFT JOIN penalty_totals pt ON pt.loan_id = lb.control_number
    LEFT JOIN open_paid op ON op.schedule_id = o.id
    CROSS JOIN LATERAL generate_series(o.installment_no, GREATEST(lb.term, o.installment_no)) AS g(i)
    CROSS JOIN LATERAL (
        -- Diminishing projection: equal principal in centavos, interest on the
        -- balance AFTER this month's principal, final month clears the rest.
        SELECT
            bb.balance_before,
            CASE WHEN g.i >= lb.term THEN bb.balance_before
                 ELSE LEAST(bb.std_principal, bb.balance_before) END AS principal_i
        FROM (
            SELECT
                floor(lb.principal * 100 / NULLIF(lb.term, 0)) / 100 AS std_principal,
                GREATEST(
                    o.remaining_after + o.exp_principal
                    - (g.i - o.installment_no) * (floor(lb.principal * 100 / NULLIF(lb.term, 0)) / 100),
                    0)                                               AS balance_before
        ) bb
    ) dim
),
amounts AS (
    SELECT
        p.*,
        GREATEST(p.principal_due + p.interest_base + p.open_adjustment, 0) AS raw_amount,
        SUM(GREATEST(p.principal_due + p.interest_base + p.open_adjustment, 0)) OVER (
            PARTITION BY p.control_number ORDER BY p.installment_no
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        )                                                          AS sum_before
    FROM projected p
)
SELECT
    a.member_id,
    a.control_number,
    a.installment_no,
    a.due_date,
    a.is_projected,
    a.principal_due::numeric(14,2)                               AS principal_due,
    a.interest_base::numeric(14,2)                               AS interest_due,
    -- Last installment absorbs rounding so the schedule sums to remaining_balance.
    (CASE
        WHEN a.installment_no >= a.term
            THEN GREATEST(a.remaining_balance - COALESCE(a.sum_before, 0), 0)
        ELSE a.raw_amount
     END)::numeric(14,2)                                         AS amount_due,
    CASE WHEN a.due_date < current_date THEN 'Overdue' ELSE 'Upcoming' END AS status,
    GREATEST(current_date - a.due_date, 0)                       AS days_past_due,
    a.remaining_balance::numeric(14,2)                           AS remaining_balance,
    a.unpaid_penalty::numeric(14,2)                              AS unpaid_penalty
FROM amounts a
ORDER BY a.member_id, a.control_number, a.installment_no;

ALTER VIEW public.member_loan_schedule_position SET (security_invoker = on);
GRANT SELECT ON public.member_loan_schedule_position TO authenticated;

COMMIT;

-- Checks (TESTSOA loans, expected as of 2026-10-13):
-- Latest SOA row per test loan -> outstanding_balance 224850.00 / 179880.02 / 3366.73,
-- outstanding_principal 187500.00 / 150000.02 / 3333.40:
--   SELECT DISTINCT ON (control_number) control_number, outstanding_balance,
--          outstanding_principal, outstanding_interest, principal_paid, interest_paid
--   FROM public.member_statement_of_account
--   WHERE control_number LIKE 'TESTSOA-%'
--   ORDER BY control_number, payment_date DESC;
-- Position -> CL-0002: #7 and #8 Overdue (9993.33 each), sum(amount_due) per
-- loan = remaining_balance:
--   SELECT control_number, count(*) FILTER (WHERE status='Overdue') AS overdue_n,
--          sum(amount_due) FILTER (WHERE status='Overdue') AS overdue_amt,
--          sum(amount_due) AS schedule_total, max(remaining_balance) AS remaining
--   FROM public.member_loan_schedule_position
--   WHERE control_number LIKE 'TESTSOA-%' GROUP BY 1 ORDER BY 1;
