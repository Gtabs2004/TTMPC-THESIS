-- CBU already done (confirmed: member.share_capital_amount / CBU ledger show
-- 90,000.00). This (re)creates just the loan + schedule rows that never
-- landed -- the original combined transaction rolled back entirely when
-- something in it failed, taking the loan/schedule inserts down with it.
-- If this also errors, paste the exact error text (not just the verify
-- query) so we can see what's actually failing.

begin;
set local session_replication_role = 'replica';

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

commit;

-- Verify:
select control_number, loan_status, loan_amount from public.loans
where control_number = 'CL-20260210-9308';

select installment_no, due_date, schedule_status from public.loan_schedules
where loan_id = 'CL-20260210-9308' order by installment_no;
-- Expect 9 rows.
