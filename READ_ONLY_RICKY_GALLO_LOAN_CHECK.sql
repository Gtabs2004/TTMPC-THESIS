-- READ-ONLY inspection for Ricky D. Gallo.
-- Run in Supabase SQL Editor. Every statement is SELECT-only.
-- These queries do not create or modify loan, payment, schedule, or ledger rows.
--
-- Intended scenario context: the user described a May 2026 consolidated loan
-- with June-August installments paid, September missed, and October next due.
-- This script checks the existing production records against that description.

-- 1) Resolve the member and check for duplicate name matches before reviewing loans.
SELECT
    m.id AS member_id,
    m.membership_id,
    m.first_name,
    m.middle_initial,
    m.last_name,
    m.member_status
FROM public.member m
WHERE lower(btrim(m.first_name)) = 'ricky'
  AND lower(btrim(m.last_name)) = 'gallo'
ORDER BY m.membership_id;

-- 2) List all of Ricky's consolidated loans and their installment schedules.
WITH target_members AS (
    SELECT m.id
    FROM public.member m
    WHERE lower(btrim(m.first_name)) = 'ricky'
      AND lower(btrim(m.last_name)) = 'gallo'
)
SELECT
    m.membership_id,
    btrim(concat_ws(' ', m.first_name, nullif(btrim(m.middle_initial), ''), m.last_name)) AS member_name,
    l.control_number,
    lt.code AS loan_type_code,
    lt.name AS loan_type,
    l.loan_status,
    l.application_status,
    l.application_date,
    l.disbursal_date,
    l.payment_start_date,
    l.principal_amount,
    l.loan_amount,
    l.interest_rate,
    l.term,
    l.monthly_amortization,
    l.total_interest,
    s.installment_no,
    s.due_date,
    s.expected_principal,
    s.expected_interest,
    s.expected_amount,
    s.penalty AS schedule_penalty_rate,
    s.carried_arrears,
    s.applied_credit,
    s.remaining_principal,
    s.schedule_status
FROM target_members tm
JOIN public.member m ON m.id = tm.id
JOIN public.loans l ON l.member_id = m.id
JOIN public.loan_types lt ON lt.id = l.loan_type_id
LEFT JOIN public.loan_schedules s ON s.loan_id = l.control_number
WHERE lower(coalesce(lt.code, '')) LIKE '%consolidated%'
   OR lower(coalesce(lt.name, '')) LIKE '%consolidated%'
ORDER BY l.application_date DESC NULLS LAST, l.control_number, s.installment_no;

-- 3) Show payment workflow records and corresponding Bookkeeper ledger rows.
WITH target_members AS (
    SELECT m.id
    FROM public.member m
    WHERE lower(btrim(m.first_name)) = 'ricky'
      AND lower(btrim(m.last_name)) = 'gallo'
),
target_loans AS (
    SELECT l.control_number
    FROM target_members tm
    JOIN public.loans l ON l.member_id = tm.id
    JOIN public.loan_types lt ON lt.id = l.loan_type_id
    WHERE lower(coalesce(lt.code, '')) LIKE '%consolidated%'
       OR lower(coalesce(lt.name, '')) LIKE '%consolidated%'
)
SELECT
    p.loan_id AS control_number,
    s.installment_no,
    s.due_date,
    p.id AS payment_id,
    p.payment_reference,
    p.transaction_reference,
    p.payment_date,
    p.amount_paid,
    p.penalties,
    p.deficiency,
    p.confirmation_status,
    p.entered_by_role,
    p.validation_notes,
    pl.amount_paid AS ledger_amount_paid,
    pl.penalties AS ledger_penalties,
    pl.total_collected AS ledger_total_collected,
    pl.posted_at AS ledger_posted_at,
    pl.notes AS ledger_notes
FROM target_loans tl
JOIN public.loan_payments p ON p.loan_id = tl.control_number
LEFT JOIN public.loan_schedules s ON s.id = p.schedule_id
LEFT JOIN public.loan_payment_ledger pl ON pl.payment_id = p.id
ORDER BY p.payment_date, p.created_at, p.id;

-- 4) Show the exact validated payment rows that feed Member Statement of Account.
WITH target_members AS (
    SELECT m.id, m.membership_id
    FROM public.member m
    WHERE lower(btrim(m.first_name)) = 'ricky'
      AND lower(btrim(m.last_name)) = 'gallo'
)
SELECT
    tm.membership_id,
    soa.control_number,
    soa.payment_date,
    soa.reference_id,
    soa.principal_paid,
    soa.interest_paid,
    soa.deficiency,
    soa.penalty,
    soa.total_amount_paid,
    soa.outstanding_balance,
    soa.confirmation_status
FROM target_members tm
JOIN public.member_statement_of_account soa ON soa.member_id = tm.id
JOIN public.loans l ON l.control_number = soa.control_number
JOIN public.loan_types lt ON lt.id = l.loan_type_id
WHERE lower(coalesce(lt.code, '')) LIKE '%consolidated%'
   OR lower(coalesce(lt.name, '')) LIKE '%consolidated%'
ORDER BY soa.payment_date, soa.control_number;

-- 5) Hypothetical payment projection only. This does NOT create a loan,
--    payment, schedule, SOA, or Bookkeeper ledger entry.
--    Assumptions: ₱100,000 principal; 12 months; first due date June 26, 2026;
--    June-August paid in full; September unpaid; October is the next due date.
--    Dates/rate may be adjusted below to match the intended example.
--    Penalties are intentionally excluded; this projects installment and arrears only.
WITH scenario AS (
    SELECT
        'TTMPC-306'::text AS membership_id,
        100000::numeric AS principal,
        12::integer AS term_months,
        DATE '2026-06-26' AS first_due_date,
        3::integer AS paid_installments,
        DATE '2026-10-26' AS as_of_date
),
target_member AS (
    SELECT
        m.id AS member_id,
        m.membership_id,
        btrim(concat_ws(' ', m.first_name, nullif(btrim(m.middle_initial), ''), m.last_name)) AS member_name
    FROM public.member m
    JOIN scenario sc ON sc.membership_id = m.membership_id
),
consolidated_rate AS (
    SELECT lt.interest_rate AS monthly_rate_percent
    FROM public.loan_types lt
    WHERE lower(coalesce(lt.code, '')) LIKE '%consolidated%'
       OR lower(coalesce(lt.name, '')) LIKE '%consolidated%'
    ORDER BY lt.id
    LIMIT 1
),
installments AS (
    SELECT
        sc.*,
        tm.member_id,
        tm.member_name,
        cr.monthly_rate_percent,
        gs.installment_no,
        (sc.first_due_date + ((gs.installment_no - 1) * INTERVAL '1 month'))::date AS due_date,
        CASE
            WHEN gs.installment_no = sc.term_months THEN
                sc.principal - ROUND(sc.principal / sc.term_months, 2) * (sc.term_months - 1)
            ELSE ROUND(sc.principal / sc.term_months, 2)
        END AS expected_principal,
        ROUND(sc.principal * cr.monthly_rate_percent / 100, 2) AS expected_interest
    FROM scenario sc
    JOIN target_member tm ON true
    CROSS JOIN consolidated_rate cr
    CROSS JOIN LATERAL generate_series(1, sc.term_months) AS gs(installment_no)
),
bills AS (
    SELECT
        i.*,
        i.expected_principal + i.expected_interest AS installment_amount,
        CASE WHEN i.installment_no <= i.paid_installments
             THEN i.expected_principal + i.expected_interest
             ELSE 0::numeric
        END AS assumed_payment
    FROM installments i
    WHERE i.due_date <= i.as_of_date
),
arrears AS (
    SELECT
        b.*,
        COALESCE(
            SUM(b.installment_amount - b.assumed_payment) OVER (
                ORDER BY b.installment_no
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
        ) AS arrears_brought_forward
    FROM bills b
)
SELECT
    membership_id,
    member_name,
    'HYPOTHETICAL ONLY - NOT SAVED TO DATABASE' AS record_type,
    installment_no,
    due_date,
    ROUND(monthly_rate_percent, 4) AS monthly_rate_percent,
    expected_principal,
    expected_interest,
    installment_amount,
    assumed_payment,
    arrears_brought_forward,
    CASE
        WHEN installment_no <= paid_installments THEN 0::numeric
        ELSE arrears_brought_forward + installment_amount
    END AS amount_due_after_assumed_payment,
    CASE
        WHEN installment_no <= paid_installments THEN 'Assumed paid'
        WHEN due_date < as_of_date THEN 'Missed'
        WHEN due_date = as_of_date THEN 'Due today'
        ELSE 'Upcoming'
    END AS scenario_status
FROM arrears
ORDER BY installment_no;
