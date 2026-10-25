select control_number, member_id, application_type, loan_status, application_status, loan_amount
from public.loans
where control_number in ('CL-20261025-2287', 'CL-20260210-9308')
order by application_date;
