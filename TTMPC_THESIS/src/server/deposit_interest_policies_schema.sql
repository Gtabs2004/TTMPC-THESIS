-- ============================================================================
-- deposit_interest_policies — BOD-editable interest rates for deposit products.
-- ----------------------------------------------------------------------------
-- Purpose:
--   The BOD "Interest Policies" page (formerly Loan Policies) edits the
--   interest paid ON deposits, alongside the interest charged on loans:
--     SAVINGS  — regular savings; interest credited on crediting_frequency
--                (monthly for now) to balances at/above minimum_balance.
--     TD_6M    — time deposit, 6-month term, one-time placement.
--     TD_12M   — time deposit, 1-year term, one-time placement.
--   The cooperative has not fixed the real rates yet, so every value is
--   editable and the seed rates below are placeholders.
--
--   annual_rate is WHOLE PERCENT PER YEAR (3.0 = 3% p.a.), matching the
--   whole-percent convention of loan_types.interest_rate. A time-deposit
--   placement must copy the rate onto itself when opened so later edits here
--   don't change existing placements.
--
--   Nothing computes savings interest or opens time deposits yet; this table
--   is the source those features will read.
--
--   Idempotent. Safe to re-run. Run AFTER loan_fee_policies_schema.sql
--   (is_bod_account) and audit_log_schema.sql (audit_write).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.deposit_interest_policies (
    product_code        text PRIMARY KEY
        CHECK (product_code IN ('SAVINGS', 'TD_6M', 'TD_12M')),
    product_name        text NOT NULL,
    annual_rate         numeric(7, 4) NOT NULL DEFAULT 0
        CHECK (annual_rate >= 0 AND annual_rate < 100),
    term_months         integer CHECK (term_months IS NULL OR term_months > 0),
    crediting_frequency text NOT NULL DEFAULT 'monthly'
        CHECK (crediting_frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual', 'at_maturity')),
    minimum_balance     numeric(14, 2) CHECK (minimum_balance IS NULL OR minimum_balance >= 0),
    updated_by          uuid,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.deposit_interest_policies.annual_rate IS
    'Whole percent per year (3.0 = 3% p.a.). Placeholder until the cooperative confirms rates.';
COMMENT ON COLUMN public.deposit_interest_policies.minimum_balance IS
    'SAVINGS: minimum balance to earn interest. TD_*: minimum placement amount. NULL = none.';

-- Placeholder rates — BOD edits them on the Interest Policies page.
INSERT INTO public.deposit_interest_policies
    (product_code, product_name, annual_rate, term_months, crediting_frequency, minimum_balance)
VALUES
    ('SAVINGS', 'Regular Savings',            1.0000, NULL, 'monthly',     NULL),
    ('TD_6M',   'Time Deposit — 6 months',    3.0000, 6,    'at_maturity', 5000),
    ('TD_12M',  'Time Deposit — 1 year',      4.0000, 12,   'at_maturity', 5000)
ON CONFLICT (product_code) DO NOTHING;

-- RLS: any signed-in user reads (computations + member portal), only BOD writes.
ALTER TABLE public.deposit_interest_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deposit_interest_policies_read ON public.deposit_interest_policies;
CREATE POLICY deposit_interest_policies_read ON public.deposit_interest_policies
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS deposit_interest_policies_update_bod ON public.deposit_interest_policies;
CREATE POLICY deposit_interest_policies_update_bod ON public.deposit_interest_policies
    FOR UPDATE TO authenticated
    USING (public.is_bod_account())
    WITH CHECK (public.is_bod_account());

GRANT SELECT ON public.deposit_interest_policies TO authenticated;
GRANT UPDATE (annual_rate, crediting_frequency, minimum_balance, updated_by)
    ON public.deposit_interest_policies TO authenticated;
GRANT ALL ON public.deposit_interest_policies TO service_role;

-- Stamp actor + time (same rule as loan_fee_policies).
CREATE OR REPLACE FUNCTION public.stamp_deposit_interest_policy_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_deposit_interest_policies_actor
    ON public.deposit_interest_policies;
CREATE TRIGGER trg_stamp_deposit_interest_policies_actor
BEFORE INSERT OR UPDATE ON public.deposit_interest_policies
FOR EACH ROW EXECUTE FUNCTION public.stamp_deposit_interest_policy_actor();

-- Audit every rate/frequency/minimum change.
CREATE OR REPLACE FUNCTION public.audit_trg_deposit_interest_policies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
BEGIN
  IF NEW.annual_rate IS DISTINCT FROM OLD.annual_rate THEN
    v_before := v_before || jsonb_build_object('annual_rate', OLD.annual_rate);
    v_after  := v_after  || jsonb_build_object('annual_rate', NEW.annual_rate);
  END IF;
  IF NEW.crediting_frequency IS DISTINCT FROM OLD.crediting_frequency THEN
    v_before := v_before || jsonb_build_object('crediting_frequency', OLD.crediting_frequency);
    v_after  := v_after  || jsonb_build_object('crediting_frequency', NEW.crediting_frequency);
  END IF;
  IF NEW.minimum_balance IS DISTINCT FROM OLD.minimum_balance THEN
    v_before := v_before || jsonb_build_object('minimum_balance', OLD.minimum_balance);
    v_after  := v_after  || jsonb_build_object('minimum_balance', NEW.minimum_balance);
  END IF;

  IF v_after <> '{}'::jsonb THEN
    PERFORM public.audit_write(
      'policy',
      NEW.product_code,
      'update',
      v_before,
      v_after,
      jsonb_build_object(
        'kind',         'deposit_interest',
        'product_code', NEW.product_code,
        'updated_by',   NEW.updated_by
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_deposit_interest_policies
    ON public.deposit_interest_policies;
CREATE TRIGGER trg_audit_deposit_interest_policies
AFTER UPDATE ON public.deposit_interest_policies
FOR EACH ROW EXECUTE FUNCTION public.audit_trg_deposit_interest_policies();

REVOKE EXECUTE ON FUNCTION public.audit_trg_deposit_interest_policies()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_deposit_interest_policy_actor()
    FROM PUBLIC, anon, authenticated;

COMMIT;
