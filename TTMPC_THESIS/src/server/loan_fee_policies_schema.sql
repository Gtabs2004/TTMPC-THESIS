-- ============================================================================
-- Loan Fee Policies — single source of truth for all loan-type deductions.
-- ----------------------------------------------------------------------------
-- Purpose:
--   Replaces the hard-coded fee numbers scattered across loanComputeApi.js,
--   main.py, and the cbu_sync_from_loan_disbursement trigger with a single
--   editable table. BOD can change a policy value (e.g., bump CBU from 2% to
--   2.5%) without a code deploy — all callers read from this table.
--
--   Interest rate continues to live in public.loan_types.interest_rate (the
--   existing source of truth). This table only holds the four deduction
--   parameters: service fee, CBU %, insurance per ₱1,000, and notarial fee.
--
--   Idempotent. Safe to re-run.
--
-- Run in Supabase SQL editor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Table: one row per loan type (CONSOLIDATED, EMERGENCY, BONUS, ...).
--    Any NULL fee column means "do not charge that fee for this loan type".
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_fee_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_type_code text NOT NULL UNIQUE,

    -- Service fee: ₱{service_fee_per_bracket} per ₱{service_fee_bracket_size}
    -- of principal (ceiling). For a flat fee, set bracket_size to a value
    -- larger than any expected principal and per_bracket to the flat amount.
    service_fee_mode text NOT NULL DEFAULT 'bracket'
        CHECK (service_fee_mode IN ('bracket', 'flat', 'none')),
    service_fee_per_bracket numeric(14, 2) NOT NULL DEFAULT 0,
    service_fee_bracket_size numeric(14, 2) NOT NULL DEFAULT 50000,

    -- CBU retention: capital_build_up_rate × principal.
    -- Stored as a decimal fraction (0.02 for 2%, 0.025 for 2.5%).
    cbu_rate numeric(6, 4) NOT NULL DEFAULT 0,

    -- Insurance fee: principal × (insurance_per_thousand / 1000).
    insurance_per_thousand numeric(10, 4) NOT NULL DEFAULT 0,

    -- Notarial fee: flat amount.
    notarial_fee numeric(14, 2) NOT NULL DEFAULT 0,

    effective_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid
);

CREATE INDEX IF NOT EXISTS idx_loan_fee_policies_loan_type_code
    ON public.loan_fee_policies (loan_type_code);

-- Actor + timestamp stamping is now handled by
-- public.stamp_loan_fee_policy_actor in audit_log_triggers.sql, which sets
-- both updated_at and updated_by (from auth.uid()) in one BEFORE trigger.
-- The old touch_loan_fee_policy_updated_at trigger is removed to avoid two
-- BEFORE triggers competing for the same NEW row.
DROP TRIGGER IF EXISTS trg_touch_loan_fee_policies_updated_at
    ON public.loan_fee_policies;

-- ----------------------------------------------------------------------------
-- 2. Seed defaults that match the values currently hard-coded in the codebase
--    (loanComputeApi.js / main.py). Re-running this block is safe — it only
--    inserts when the row for a given loan_type_code is missing.
-- ----------------------------------------------------------------------------
INSERT INTO public.loan_fee_policies (
    loan_type_code, service_fee_mode, service_fee_per_bracket,
    service_fee_bracket_size, cbu_rate, insurance_per_thousand, notarial_fee
)
VALUES
    ('CONSOLIDATED', 'bracket', 100, 50000, 0.0200, 1.3500, 100),
    ('EMERGENCY',    'flat',    100, 999999999, 0.0200, 0,      0),
    ('BONUS',        'flat',    100, 999999999, 0,      0,      0),
    ('NONMEMBER_BONUS','flat',  100, 999999999, 0,      0,      0)
ON CONFLICT (loan_type_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. RLS — read for any authenticated user (compute endpoint, member kiosk),
--    write ONLY for BOD accounts. Loan-Policies.jsx is the only editor and
--    it lives in the BOD portal; tightening this at the DB prevents a
--    manager/treasurer/cashier from POSTing directly to Supabase.
-- ----------------------------------------------------------------------------
ALTER TABLE public.loan_fee_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loan_fee_policies_read_authenticated
    ON public.loan_fee_policies;
CREATE POLICY loan_fee_policies_read_authenticated
ON public.loan_fee_policies
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.is_bod_account()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.member_account ma
    WHERE (ma.auth_user_id = auth.uid() OR ma.user_id = auth.uid())
      AND lower(coalesce(ma.role, '')) = 'bod'
  );
$$;

-- Replace the older permissive staff-wide policy if it exists.
DROP POLICY IF EXISTS loan_fee_policies_write_staff
    ON public.loan_fee_policies;
DROP POLICY IF EXISTS loan_fee_policies_write_bod
    ON public.loan_fee_policies;
CREATE POLICY loan_fee_policies_write_bod
ON public.loan_fee_policies
FOR ALL
TO authenticated
USING (public.is_bod_account())
WITH CHECK (public.is_bod_account());

GRANT SELECT ON public.loan_fee_policies TO authenticated;
GRANT INSERT, UPDATE ON public.loan_fee_policies TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Helper: returns the CBU rate for a given loan type, or 0 if no policy
--    row exists. Used by cbu_sync_from_loan_disbursement so the trigger
--    stays consistent with the table.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cbu_rate_for_loan_type(p_loan_type_code text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_rate numeric;
BEGIN
    SELECT cbu_rate
    INTO v_rate
    FROM public.loan_fee_policies
    WHERE upper(btrim(loan_type_code)) = upper(btrim(coalesce(p_loan_type_code, '')))
    LIMIT 1;

    RETURN coalesce(v_rate, 0);
END;
$$;

COMMIT;
