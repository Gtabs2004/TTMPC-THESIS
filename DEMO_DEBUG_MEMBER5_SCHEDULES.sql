select id, loan_id, installment_no, schedule_status from public.loan_schedules
where loan_id = 'CL-20260210-9308' order by installment_no;
