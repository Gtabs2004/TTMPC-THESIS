-- Display-name fix: "Nonmember Bonus Loan" -> "Non-member Bonus Loan".
-- Safe on TEST and LIVE: loanSubmission.js and loan_form_policies.sql already
-- accept both spellings. The KOICA / 'ABFF Loan' row (code KOICA) is left as-is
-- on purpose — it is no longer offered anywhere, and renaming it would make
-- loan_form_policies.sql re-insert a duplicate KOICA row if re-applied.
UPDATE public.loan_types
   SET name = 'Non-member Bonus Loan'
 WHERE code = 'NONMEMBER_BONUS'
   AND name = 'Nonmember Bonus Loan';

SELECT id, code, name FROM public.loan_types ORDER BY id;
