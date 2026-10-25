-- Loan half of Member5 -- Loan Application Renewal scenario (Ashley Nicole
-- Bulotaolo). Run AFTER you've approved her membership application live in
-- the system (Secretary PMES -> Cashier payments -> BOD Confirm and Complete).
--
-- BEFORE RUNNING: replace both placeholders below with her real values from
-- the approved member row:
--   :MEMBER_UUID     -> member.id (uuid)
--   :MEMBERSHIP_ID   -> member.membership_id (e.g. 'TTMPC-308') -- only used
--                        in comments/control_number here, not a column value
--
-- Scenario: Consolidated loan, ~P100,000, released >6 months ago, more than
-- 6 monthly payments already recorded -- clears RENEWAL_MIN_PAYMENTS (6) so
-- the live Renewal flow (Member_ApplyLoans.jsx / useLoanEligibility /
-- get_loan_eligibility RPC) shows her as eligible without needing an
-- override. You request the actual renewal application live in the system
-- after this seed -- do NOT sql the renewal application itself.
--
-- Numbers: P100,000 @ 0.83% add-on, 24-month term ->
--   interest = 100000 * 0.0083 * 24 = 19,920.00
--   monthly_amortization = (100000 + 19920) / 24 = 4,996.67
--   principal_component = 100000 / 24 = 4,166.67
--   interest_component = 19920 / 24 = 830.00
-- Released 2026-02-10 (>6 months before today, 2026-10-25) with 8 payments
-- made (through Sep 2026) -- comfortably above the 6-payment minimum, one
-- active "next due" row per idx_loan_schedules_one_active_due_per_loan.
--
-- CBU: P90,000.00 (per user decision). Consolidated ceiling check reads
-- member.share_capital_amount first, falling back to capital_build_up's
-- latest ending_share_capital only if that's 0/unset (main.py line
-- 8054-8066) -- confirmed via the same gap found on Ramon/TTMPC-302
-- (DEMO_FIX_RAMON_SHARE_CAPITAL.sql). No MIGS classification seeded, so the
-- backend defaults to Non-MIGS (multiplier 3.0, main.py line 8068):
--   ceiling = 90000 * 3 = 270,000 -- clears her 100,000 loan comfortably.

begin;
set local session_replication_role = 'replica';

-- She already has share_capital_amount = 20,000.00 (initial membership
-- share, seeded at approval). Top up to 90,000.00 with a second CBU row
-- rather than overwriting from 0, matching the Ramon/TTMPC-302 pattern.
insert into public.capital_build_up (
  member_id, transaction_date, capital_added, starting_share_capital,
  ending_share_capital, deposit_account, cbu_deposit_id
) values (
  '43ee8ea8-ed69-4eaf-8428-95de2efa0861', '2026-02-10'::timestamptz,
  70000.00, 20000.00, 90000.00, 'cash', 'CBUD_908'
);

update public.member
set share_capital_amount = 90000.00
where id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861';

insert into public.loans (
  control_number, member_id, loan_type_id, loan_amount, principal_amount,
  interest_rate, term, loan_status, application_status, application_type,
  application_date, disbursal_date, monthly_amortization, created_at, updated_at
) values (
  'CL-20260210-9308', '43ee8ea8-ed69-4eaf-8428-95de2efa0861', 1,
  100000.00, 100000.00, 0.83, 24, 'partially paid', 'released', 'new',
  '2026-02-10'::timestamptz, '2026-02-17'::timestamptz, 4996.67,
  '2026-02-10'::timestamptz, '2026-02-10'::timestamptz
);

insert into public.loan_schedules (
  loan_id, installment_no, due_date, expected_amount, principal_component,
  interest_component, schedule_status, expected_principal, expected_interest,
  remaining_principal
)
select
  'CL-20260210-9308', gs, (date '2026-03-25' + ((gs-1) * interval '1 month'))::date,
  4996.67, 4166.67, 830.00,
  case when gs <= 8 then 'paid' else 'unpaid' end,
  4166.67, 830.00,
  100000.00 - (4166.67 * gs)
from generate_series(1, 9) as gs;
-- Only through installment 9 (8 paid + 1 active "next due") --
-- idx_loan_schedules_one_active_due_per_loan allows just one
-- unpaid/pending/overdue row per loan at a time.

-- loan_payments requires schedule_id (FK to loan_schedules.id, composite with
-- loan_id); confirmation_status must be 'validated' for a payment to count
-- toward loan_status/total_validated (sync_loan_payment_to_ledger trigger) --
-- but that trigger only fires on UPDATE, not INSERT, so inserting directly
-- as 'validated' is safe under session_replication_role = 'replica' (which
-- also skips trg_normalize_loan_payment_workflow's INSERT-time guard that
-- would otherwise reject a non-bookkeeper row starting as 'validated').
insert into public.loan_payments (
  loan_id, schedule_id, payment_date, amount_paid, penalties, deficiency,
  confirmation_status, entered_by_role, confirmed_at
)
select
  'CL-20260210-9308', ls.id, (date '2026-03-25' + ((gs-1) * interval '1 month'))::date,
  4996.67, 0, 0, 'validated', 'cashier', (date '2026-03-25' + ((gs-1) * interval '1 month'))::date
from generate_series(1, 8) as gs
join public.loan_schedules ls
  on ls.loan_id = 'CL-20260210-9308' and ls.installment_no = gs;

commit;

-- Verify:
select control_number, loan_status, loan_amount, monthly_amortization
from public.loans where control_number = 'CL-20260210-9308';

select installment_no, due_date, schedule_status from public.loan_schedules
where loan_id = 'CL-20260210-9308' order by installment_no;
-- Expect 9 rows: 1-8 'paid', 9 'unpaid'.

select count(*) as payments_made from public.loan_payments
where loan_id = 'CL-20260210-9308';
-- Expect 8.

select share_capital_amount from public.member where id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861';
-- Expect 90000.00.
