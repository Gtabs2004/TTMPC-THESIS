-- Run this alone -- the CBU/loans/loan_schedules inserts from
-- DEMO_LOAN_SEED_MEMBER5_RENEWAL.sql already succeeded. This is just the
-- corrected loan_payments insert (original failed: principal_paid/
-- interest_paid/received_by_role don't exist on loan_payments -- real
-- columns are schedule_id, amount_paid, penalties, deficiency,
-- confirmation_status, entered_by_role, confirmed_at, per
-- loan_payments_schema.sql).

begin;
set local session_replication_role = 'replica';

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
select count(*) as payments_made from public.loan_payments
where loan_id = 'CL-20260210-9308';
-- Expect 8.

select control_number, loan_status, loan_amount from public.loans
where control_number = 'CL-20260210-9308';
