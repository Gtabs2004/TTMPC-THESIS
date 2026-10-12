-- =============================================================================
-- Let the BOD edit loan_types.interest_rate from BOD -> Loan Policies.
-- =============================================================================
-- loan_types only had SELECT for authenticated users and FOR ALL for the
-- service role, so the Loan Policies page's rate update matched 0 rows under
-- RLS and returned no error: the fees saved (loan_fee_policies already has
-- loan_fee_policies_write_bod) but the interest rate silently didn't.
--
-- Scope: UPDATE of the interest_rate column only, BOD only (same
-- is_bod_account() check loan_fee_policies uses). No insert/delete, and no
-- other loan_types column becomes writable.
--
-- Safe to run multiple times.
-- =============================================================================

BEGIN;

GRANT UPDATE (interest_rate) ON public.loan_types TO authenticated;

DROP POLICY IF EXISTS "bod update loan type rate" ON public.loan_types;
CREATE POLICY "bod update loan type rate"
ON public.loan_types
FOR UPDATE
TO authenticated
USING (public.is_bod_account())
WITH CHECK (public.is_bod_account());

COMMIT;

-- Then set the Bonus rates once (or do it from the Loan Policies page after
-- this file is applied):
--   UPDATE public.loan_types SET interest_rate = 2 WHERE code = 'BONUS';
--   UPDATE public.loan_types SET interest_rate = 3 WHERE code = 'NONMEMBER_BONUS';
--   SELECT code, interest_rate FROM public.loan_types WHERE code IN ('BONUS', 'NONMEMBER_BONUS');
