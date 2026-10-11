-- =============================================================================
-- ROLLBACK for loan_payments_restrict_select_rls.sql
-- Puts back the old "any logged-in user can read every row" SELECT policies.
-- Use only if the fix breaks a screen and you need the old behaviour back
-- while it's investigated. This RE-OPENS the privacy leak.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS loan_payments_select_staff_or_owner ON public.loan_payments;
DROP POLICY IF EXISTS loan_payments_authenticated_select ON public.loan_payments;
CREATE POLICY loan_payments_authenticated_select
ON public.loan_payments
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS loan_payment_ledger_select_staff_or_owner ON public.loan_payment_ledger;
DROP POLICY IF EXISTS loan_payment_ledger_authenticated_select ON public.loan_payment_ledger;
CREATE POLICY loan_payment_ledger_authenticated_select
ON public.loan_payment_ledger
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS loan_payments_legacy_select_staff_or_owner ON public.loan_payments_legacy;
DROP POLICY IF EXISTS loan_payments_legacy_authenticated_select ON public.loan_payments_legacy;
CREATE POLICY loan_payments_legacy_authenticated_select
ON public.loan_payments_legacy
FOR SELECT
TO authenticated
USING (true);

-- Left in place on purpose (harmless): RLS stays enabled on
-- loan_payments_legacy, its service_role policy, the
-- current_member_loan_ids() helper function, and security_invoker on
-- member_statement_of_account (it's what the repo's view file intends).

COMMIT;
