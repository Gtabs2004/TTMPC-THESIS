-- ============================================================================
-- Repair: loan_schedules.expected_amount drift
-- ----------------------------------------------------------------------------
-- Some legacy schedule rows have expected_amount stored as the loan's TOTAL
-- payable (principal + total_interest) instead of the per-installment
-- amount (principal_component + interest_component). This caused the Member
-- Portal to render absurd values (e.g. 223,022.22 for a 9,380.22/month loan).
--
-- This script:
--   1. Sets expected_amount = principal_component + interest_component for
--      any row where the stored value is more than 1.5x the components sum
--      (clearly inflated) and the components themselves are populated.
--   2. As a secondary heuristic, if the per-row expected_amount is more than
--      1.5x the loan's monthly_amortization, recompute it from the loan.
--
-- Safe to re-run. Idempotent.
-- ============================================================================

BEGIN;

-- 1. Fix rows whose stored expected_amount is clearly inflated relative to
--    the per-installment components.
UPDATE public.loan_schedules AS s
SET expected_amount = (coalesce(s.principal_component, 0) + coalesce(s.interest_component, 0))
WHERE coalesce(s.principal_component, 0) + coalesce(s.interest_component, 0) > 0
  AND coalesce(s.expected_amount, 0)
      > 1.5 * (coalesce(s.principal_component, 0) + coalesce(s.interest_component, 0));

-- 2. Secondary heuristic: align with loan-level monthly_amortization when the
--    schedule row's expected_amount is far above the loan's monthly amount.
UPDATE public.loan_schedules AS s
SET expected_amount = l.monthly_amortization
FROM public.loans AS l
WHERE s.loan_id = l.control_number
  AND coalesce(l.monthly_amortization, 0) > 0
  AND coalesce(s.expected_amount, 0) > 1.5 * coalesce(l.monthly_amortization, 0);

-- 3. Mirror cleanup for the newer principal_component / interest_component
--    columns if they were left null while the legacy expected_* columns are
--    populated.
UPDATE public.loan_schedules
SET principal_component = expected_principal
WHERE principal_component IS NULL AND expected_principal IS NOT NULL;

UPDATE public.loan_schedules
SET interest_component = expected_interest
WHERE interest_component IS NULL AND expected_interest IS NOT NULL;

COMMIT;
