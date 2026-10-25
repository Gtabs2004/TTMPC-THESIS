-- Does the loans table actually expose application_type to a normal
-- SELECT the way the frontend's PostgREST query would see it?
select control_number, application_type, loan_status, application_status
from public.loans
where control_number in (
  'CL-20261025-2287','CL-20261020-4850','BL-20261022133155-82',
  'CL-20261024-9304','EL-20261024-9297'
);
