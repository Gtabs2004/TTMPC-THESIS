select id, loan_id, schedule_id, amount_paid, confirmation_status, payment_date
from public.loan_payments
where loan_id = 'CL-20260210-9308'
order by payment_date;

select id, installment_no, due_date, schedule_status, remaining_principal
from public.loan_schedules
where loan_id = 'CL-20260210-9308'
order by installment_no;

select member_id from public.loans where control_number = 'CL-20260210-9308';
