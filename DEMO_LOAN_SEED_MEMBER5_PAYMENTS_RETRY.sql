-- Retry: loan_schedules now confirmed to have all 9 rows (installments 1-8
-- 'paid', 9 'unpaid'). The payments insert previously returned 0 rows --
-- likely run before the schedule rows existed yet, so the join found
-- nothing to match. Re-running now that schedules are confirmed present.

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

select id, loan_id, schedule_id, amount_paid, confirmation_status, payment_date
from public.loan_payments where loan_id = 'CL-20260210-9308' order by payment_date;
