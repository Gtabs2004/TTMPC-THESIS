-- SOA test scenarios -- STEP 2: validation (read-only). Run after 01_seed.sql,
-- and again after every action taken in the app during testing.
-- Each check states what to expect right after seeding (as of 2026-10-13).

-- V1  Loan header. Expect:
--   0001  300000  24  0.83  14990.00  59760.00  partially paid
--   0002  200000  24  0.83   9993.33  39840.00  partially paid
--   0003   20000  12  2.00   2033.33   2200.00  partially paid
SELECT control_number, principal_amount, term, interest_rate,
       monthly_amortization, total_interest, loan_status, disbursal_date::date
FROM public.loans WHERE control_number LIKE 'TESTSOA-%' ORDER BY 1;

-- V2  Schedule integrity. Expect paid_rows 9/6/10, open_rows 1 each,
--     open_installment 10/7/11, open_due 2026-10-15 / 2026-08-15 / 2026-10-15,
--     dup_installments 0.
SELECT s.loan_id,
       count(*) FILTER (WHERE lower(s.schedule_status) = 'paid')                       AS paid_rows,
       count(*) FILTER (WHERE lower(s.schedule_status) IN ('unpaid','pending','overdue')) AS open_rows,
       max(s.installment_no) FILTER (WHERE lower(s.schedule_status) <> 'paid')          AS open_installment,
       max(s.due_date)       FILTER (WHERE lower(s.schedule_status) <> 'paid')          AS open_due,
       count(*) - count(DISTINCT s.installment_no)                                       AS dup_installments
FROM public.loan_schedules s WHERE s.loan_id LIKE 'TESTSOA-%'
GROUP BY s.loan_id ORDER BY 1;

-- V3  Payment integrity. Expect validated 9/6/10, sums 134910.00 / 59959.98 / 18833.27,
--     every paid schedule row has exactly one validated payment, no payment on
--     an unpaid row, ledger rows = validated payments.
SELECT p.loan_id,
       count(*) FILTER (WHERE p.confirmation_status = 'validated')                  AS validated,
       sum(p.amount_paid) FILTER (WHERE p.confirmation_status = 'validated')        AS validated_sum,
       count(*) FILTER (WHERE p.confirmation_status = 'pending_bookkeeper')         AS pending,
       count(*) FILTER (WHERE p.confirmation_status = 'validated'
                          AND lower(s.schedule_status) <> 'paid')                   AS validated_on_open_row,
       (SELECT count(*) FROM public.loan_payment_ledger g WHERE g.loan_id = p.loan_id) AS ledger_rows,
       sum(p.applied_to_penalty) AS to_penalty, sum(p.applied_to_arrears) AS to_arrears,
       sum(p.applied_to_current) AS to_current, sum(p.applied_to_credit) AS to_credit
FROM public.loan_payments p
JOIN public.loan_schedules s ON s.id = p.schedule_id
WHERE p.loan_id LIKE 'TESTSOA-%'
GROUP BY p.loan_id ORDER BY 1;

-- V4  Balance reconciliation (the system's definition: principal + total_interest
--     - validated payments). Expect remaining 224850.00 / 179880.02 / 3366.73,
--     remaining_principal_per_schedule 187500.00 / 150000.02 / 3333.40.
SELECT l.control_number,
       l.principal_amount + l.total_interest                                   AS total_payable,
       coalesce(sum(p.amount_paid) FILTER (WHERE p.confirmation_status='validated'), 0) AS paid,
       l.principal_amount + l.total_interest
         - coalesce(sum(p.amount_paid) FILTER (WHERE p.confirmation_status='validated'), 0) AS remaining,
       (SELECT s.remaining_principal + s.expected_principal
          FROM public.loan_schedules s
         WHERE s.loan_id = l.control_number AND lower(s.schedule_status) <> 'paid'
         ORDER BY s.installment_no LIMIT 1)                                    AS remaining_principal_per_schedule
FROM public.loans l
LEFT JOIN public.loan_payments p ON p.loan_id = l.control_number
WHERE l.control_number LIKE 'TESTSOA-%'
GROUP BY l.control_number, l.principal_amount, l.total_interest ORDER BY 1;

-- V5  Overdue state as of today. Expect only 0002 overdue: days_past_due ~59,
--     penalty_start_after 2026-11-15, delayed (warning) true.
SELECT s.loan_id, s.installment_no, s.due_date,
       current_date - s.due_date                       AS days_past_due,
       current_date > (s.due_date + interval '1 month')::date  AS delayed_warning,
       (s.due_date + interval '3 months')::date        AS penalty_start_after
FROM public.loan_schedules s
WHERE s.loan_id LIKE 'TESTSOA-%' AND lower(s.schedule_status) <> 'paid'
ORDER BY 1;

-- V6  Penalty rows. Expect 0 rows at seed time. After 2026-11-15, the first
--     cashier submission on 0002 should create exactly ONE row with
--     period_due_date 2026-11-15, amount = 2% x basis_balance.
SELECT loan_id, period_due_date, installment_no, amount, basis_balance,
       rate_percent, is_paid, paid_amount, generated_at
FROM public.loan_penalties WHERE loan_id LIKE 'TESTSOA-%'
ORDER BY loan_id, period_due_date;

-- V7  Duplicate guards. Expect 0 rows from each.
SELECT 'dup penalty' AS check, loan_id, period_due_date::text AS k, count(*)
FROM public.loan_penalties WHERE loan_id LIKE 'TESTSOA-%'
GROUP BY loan_id, period_due_date HAVING count(*) > 1
UNION ALL
SELECT 'dup open schedule', loan_id, NULL, count(*)
FROM public.loan_schedules
WHERE loan_id LIKE 'TESTSOA-%' AND lower(schedule_status) IN ('unpaid','pending','overdue')
GROUP BY loan_id HAVING count(*) > 1
UNION ALL
SELECT 'dup payment ref', loan_id, payment_reference, count(*)
FROM public.loan_payments WHERE loan_id LIKE 'TESTSOA-%'
GROUP BY loan_id, payment_reference HAVING count(*) > 1;

-- V8  Renewal eligibility as the member portal sees it.
--     Expect consolidated can_renew = true for accounts 1 and 2 (note: 2 is
--     delinquent -- the RPC has no delinquency gate), emergency can_renew = true
--     for account 3.
SELECT ma.email, public.get_loan_eligibility(ma.user_id) AS eligibility
FROM public.member_account ma
WHERE lower(ma.email) IN ('lynxridao@gmail.com','erdenjhed.teope@wvsu.edu.ph','serevee7@gmail.com');

-- V9  What the member SOA actually reads. Expect one row per validated payment.
--     KNOWN DEFECT: outstanding_balance = principal - cumulative amount_paid
--     (interest included), so the last row reads 165090.00 / 140040.02 / 1166.73
--     instead of the true remaining figures in V4.
SELECT control_number, installment_no, payment_date::date, due_date,
       principal_paid, interest_paid, penalty, accumulated_penalty,
       total_amount_due, outstanding_balance, payment_status
FROM public.member_statement_of_account
WHERE control_number LIKE 'TESTSOA-%'
ORDER BY control_number, payment_date;

-- V10 Restructure requests raised during testing (expect none at seed time).
SELECT * FROM public.loan_restructure_requests
WHERE loan_id LIKE 'TESTSOA-%' ORDER BY created_at;
