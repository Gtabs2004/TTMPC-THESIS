select control_number, loan_status, loan_amount from public.loans
where control_number = 'CL-20260210-9308';
-- If this returns 0 rows, the loan insert never committed either -- meaning
-- DEMO_LOAN_SEED_MEMBER5_LOAN_AND_SCHEDULE_ONLY.sql also failed silently or
-- you haven't run it yet.
