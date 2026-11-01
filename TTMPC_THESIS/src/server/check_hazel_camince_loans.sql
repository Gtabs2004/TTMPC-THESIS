-- Diagnostic: why does Hazel Cris C Camince (TTMPC-021) have 3 loans
-- (Emergency TTMPCL-077, Consolidated TTMPCL-075, Bonus
-- BL-20251114827932-122504) in the termination/settlement modal, if only an
-- Emergency loan was actually submitted?
--
-- Read-only. Run in Supabase SQL editor and share the output.

-- 1) Every loan row on record for this member, in application order.
SELECT control_number, loan_type, principal_amount, loan_amount, loan_status,
       application_date, disbursal_date, remaining_balance, member_id
FROM public.loans
WHERE member_id = (SELECT id FROM public.member WHERE membership_id = 'TTMPC-021')
ORDER BY application_date;

-- 2) Cross-check against loan applications (member-submitted) to see which
--    of the 3 loans above actually has a matching application row, vs. one
--    that was created some other way (e.g. a legacy import, test/demo data,
--    or a renewal that generated a new control_number).
SELECT application_id, loan_type, status, created_at, member_id
FROM public.loan_applications
WHERE member_id = (SELECT id FROM public.member WHERE membership_id = 'TTMPC-021')
ORDER BY created_at;

-- 3) The Bonus loan's control_number (BL-20251114827932-122504) has a
--    different format than the other two (TTMPCL-0xx) -- worth comparing
--    its audit trail separately in case it's test/seed data rather than a
--    real application.
SELECT *
FROM public.audit_log
WHERE entity_type = 'loan'
  AND (context->>'control_number' = 'BL-20251114827932-122504'
       OR entity_id::text = 'BL-20251114827932-122504')
ORDER BY occurred_at;
