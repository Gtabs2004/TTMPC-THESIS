-- ============================================================================
-- loan_fee_policies — add max_loan_amount and penalty_rate.
-- ----------------------------------------------------------------------------
-- Purpose:
--   BOD's Loan Policies editor needs two fields that loan_fee_policies didn't
--   carry yet:
--     - max_loan_amount: a per-type ceiling on the principal a member may
--       apply for (e.g. Emergency's ₱20,000 cap). NULL means "no cap set" —
--       the editor and any consumer must treat NULL as unenforced, not as 0.
--     - penalty_rate: a per-type monthly penalty rate on the outstanding/
--       overdue balance (Bonus's failure-to-renew penalty, Non-member
--       Bonus's default penalty). Stored as a decimal fraction, same
--       convention as cbu_rate (0.01 for 1%, 0.02 for 2%), so existing
--       formatting/parsing helpers (formatWithCommas et al. for the *100
--       display) can be reused as-is.
--
--   This migration only adds columns + a safe default. It does NOT wire any
--   loan-computation or application-validation logic to these fields — no
--   endpoint enforces max_loan_amount yet, and no payment/penalty job reads
--   penalty_rate yet. That is deliberately out of scope until the business
--   process for Bonus renewal/penalty is finalized (see
--   memory:project_bonus_loan_policy.md — "still being studied by the team").
--
--   Idempotent. Safe to re-run.
--
-- Run in Supabase SQL editor.
-- ============================================================================

BEGIN;

ALTER TABLE public.loan_fee_policies
    ADD COLUMN IF NOT EXISTS max_loan_amount numeric(14, 2),
    ADD COLUMN IF NOT EXISTS penalty_rate numeric(6, 4);

COMMENT ON COLUMN public.loan_fee_policies.max_loan_amount IS
    'Per-loan-type ceiling on applied principal. NULL = no cap enforced. Not yet read by any compute/validation endpoint — display/editing only as of this migration.';
COMMENT ON COLUMN public.loan_fee_policies.penalty_rate IS
    'Per-loan-type monthly penalty rate on overdue/unrenewed balance, as a decimal fraction (0.01 = 1%). NULL = no penalty configured. Not yet read by any payment/penalty computation as of this migration.';

COMMIT;
