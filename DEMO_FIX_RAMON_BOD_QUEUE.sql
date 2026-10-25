-- Fix for TTMPC-302 Ramon S. Villanueva's P600,000 Consolidated loan
-- (CL-20261024-9302). DEMO_LOAN_SEED_MEMBERS_TIER1.sql left it at
-- loan_status/application_status = 'pending', but the BOD portal's queue
-- (bod_loan_decision / _BOD_ELIGIBLE_STATUSES in main.py line 18217) only
-- ever reads loans where loan_status = 'recommended for bod approval'.
-- That status is normally set by the Manager after their own review stage,
-- not at submission -- our seed skipped straight to 'pending' so it never
-- reached BOD's queue. loan_amount (600000) already clears the >500000
-- threshold (main.py line 18215), so status is the only thing missing.

begin;
set local session_replication_role = 'replica';

update public.loans
set loan_status = 'recommended for bod approval',
    application_status = 'recommended for bod approval'
where control_number = 'CL-20261024-9302';

commit;

-- Verify:
select control_number, loan_status, application_status, loan_amount
from public.loans where control_number = 'CL-20261024-9302';
