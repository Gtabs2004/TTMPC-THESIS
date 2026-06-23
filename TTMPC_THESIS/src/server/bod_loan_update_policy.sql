-- Grant BOD update permission on public.loans + public.koica_loans
-- so the BOD chairperson can record approval/rejection decisions on
-- high-value Consolidated loans.
--
-- Mirrors the existing "staff update loan workflow" policy from
-- loan_form_policies.sql, but with 'bod' added to the role list.

DROP POLICY IF EXISTS "staff update loan workflow" ON public.loans;
CREATE POLICY "staff update loan workflow"
ON public.loans
FOR UPDATE
TO authenticated
USING (
  public.has_portal_role(auth.uid(), auth.email(), ARRAY['manager', 'bookkeeper', 'treasurer', 'cashier', 'bod'])
)
WITH CHECK (
  public.has_portal_role(auth.uid(), auth.email(), ARRAY['manager', 'bookkeeper', 'treasurer', 'cashier', 'bod'])
);

DROP POLICY IF EXISTS "staff update koica workflow" ON public.koica_loans;
CREATE POLICY "staff update koica workflow"
ON public.koica_loans
FOR UPDATE
TO authenticated
USING (
  public.has_portal_role(auth.uid(), auth.email(), ARRAY['manager', 'bookkeeper', 'treasurer', 'cashier', 'bod'])
)
WITH CHECK (
  public.has_portal_role(auth.uid(), auth.email(), ARRAY['manager', 'bookkeeper', 'treasurer', 'cashier', 'bod'])
);
