-- =============================================================================
-- Restrict who can READ loan payment records.
-- Tables: loan_payments, loan_payment_ledger, loan_payments_legacy
-- View:   member_statement_of_account (security_invoker)
-- Run AFTER loan_payments_schema.sql and loan_form_policies.sql. Safe to re-run.
-- Run on TEST first, then loan_payments_restrict_select_rls_test.sql, then LIVE.
-- Undo: loan_payments_restrict_select_rls_rollback.sql
-- =============================================================================
-- Before: each table had a SELECT policy for `authenticated` with USING (true),
-- so any logged-in member could read every member's payments.
--
-- After: a row is readable only by
--   * staff (manager, bod, bookkeeper, treasurer, cashier) - same role check as
--     the "staff read all loans" policy on loans (has_portal_role), or
--   * the member who owns the loan - same ownership rule as the
--     "authenticated read own loans" policy on loans (loans.user_email matches,
--     or a member_account row links the login to loans.member_id).
--
-- The backend (FastAPI) uses the service-role key and is not affected.
-- INSERT/UPDATE policies are not touched.
--
-- Performance: auth.uid()/auth.email() and the role check are wrapped in
-- (SELECT ...) so they run once per query, not once per row (Supabase advisor
-- auth_rls_initplan). The member's own loan list is also computed once.
-- =============================================================================

BEGIN;

-- 1. The member's own loans, computed once per query ---------------------------
-- SECURITY DEFINER so it reads loans/member_account directly instead of going
-- through their RLS again for every payment row.
CREATE OR REPLACE FUNCTION public.current_member_loan_ids()
RETURNS SETOF varchar
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT l.control_number
    FROM public.loans l
    WHERE lower(coalesce(l.user_email, '')) = lower(auth.email())
       OR EXISTS (
            SELECT 1
            FROM public.member_account ma
            WHERE (ma.auth_user_id = auth.uid() OR ma.user_id = auth.uid())
              AND ma.user_id = l.member_id
       );
$$;

REVOKE ALL ON FUNCTION public.current_member_loan_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_member_loan_ids() TO authenticated, service_role;

-- 2. loan_payments -------------------------------------------------------------
DROP POLICY IF EXISTS loan_payments_authenticated_select ON public.loan_payments;
DROP POLICY IF EXISTS loan_payments_select_staff_or_owner ON public.loan_payments;
CREATE POLICY loan_payments_select_staff_or_owner
ON public.loan_payments
FOR SELECT
TO authenticated
USING (
    (SELECT public.has_portal_role(
        (SELECT auth.uid()), (SELECT auth.email()),
        ARRAY['manager', 'bod', 'bookkeeper', 'treasurer', 'cashier']))
    OR loan_id IN (SELECT public.current_member_loan_ids())
);

-- 3. loan_payment_ledger -------------------------------------------------------
DROP POLICY IF EXISTS loan_payment_ledger_authenticated_select ON public.loan_payment_ledger;
DROP POLICY IF EXISTS loan_payment_ledger_select_staff_or_owner ON public.loan_payment_ledger;
CREATE POLICY loan_payment_ledger_select_staff_or_owner
ON public.loan_payment_ledger
FOR SELECT
TO authenticated
USING (
    (SELECT public.has_portal_role(
        (SELECT auth.uid()), (SELECT auth.email()),
        ARRAY['manager', 'bod', 'bookkeeper', 'treasurer', 'cashier']))
    OR loan_id IN (SELECT public.current_member_loan_ids())
);

-- 4. loan_payments_legacy (table created outside this repo) ---------------------
ALTER TABLE public.loan_payments_legacy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loan_payments_legacy_service_role_all ON public.loan_payments_legacy;
CREATE POLICY loan_payments_legacy_service_role_all
ON public.loan_payments_legacy
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS loan_payments_legacy_authenticated_select ON public.loan_payments_legacy;
DROP POLICY IF EXISTS loan_payments_legacy_select_staff_or_owner ON public.loan_payments_legacy;
CREATE POLICY loan_payments_legacy_select_staff_or_owner
ON public.loan_payments_legacy
FOR SELECT
TO authenticated
USING (
    (SELECT public.has_portal_role(
        (SELECT auth.uid()), (SELECT auth.email()),
        ARRAY['manager', 'bod', 'bookkeeper', 'treasurer', 'cashier']))
    OR loan_id IN (SELECT public.current_member_loan_ids())
);

-- 5. Statement of account view must obey the rules above ------------------------
-- member_statement_of_account_view_v2.sql sets security_invoker = on, but the
-- deployed view was found without it (TEST, 2026-10-11): it then reads the
-- payment tables as its owner, skipping RLS, and any logged-in user could read
-- every member's statement. Turning it on makes the view use the caller's
-- rights. loan_schedules and loan_penalties (also read by the view) are
-- readable by authenticated, so no column goes blank for members.
ALTER VIEW public.member_statement_of_account SET (security_invoker = on);

COMMIT;

-- 6. Check: every SELECT policy left on the three tables -----------------------
-- Expect exactly: the three *_select_staff_or_owner policies, plus any
-- service_role policies. Any OTHER row here that applies to authenticated or
-- public would re-open the leak (permissive policies are OR-ed) - drop it.
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('loan_payments', 'loan_payment_ledger', 'loan_payments_legacy')
  AND cmd IN ('SELECT', 'ALL')
ORDER BY tablename, policyname;
