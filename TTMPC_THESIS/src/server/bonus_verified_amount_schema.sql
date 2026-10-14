-- =============================================================================
-- Bonus Loan: Bookkeeper-verified bonus amount (BONUS_LOAN_PLAN.md Step 5)
-- =============================================================================
-- Q8: the loan amount cap for Bonus is the member's actual bonus amount, not
-- the MIGS CBU x3/5 cap other loan types use. The Bookkeeper checks the
-- borrower's payslip in person (no file is uploaded or stored — same pattern
-- as collateral appraised_value) and types in the verified amount. Safe to
-- run multiple times.
-- =============================================================================

ALTER TABLE IF EXISTS public.loans
  ADD COLUMN IF NOT EXISTS verified_bonus_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS bonus_verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bonus_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.loans.verified_bonus_amount IS
  'Bookkeeper-entered bonus amount after checking the borrower''s payslip in person. Caps loan_amount for Bonus loans (Q8). No file is stored.';
COMMENT ON COLUMN public.loans.bonus_verified_by IS
  'auth.users id of the Bookkeeper who verified the amount.';
COMMENT ON COLUMN public.loans.bonus_verified_at IS
  'When the amount was verified.';
