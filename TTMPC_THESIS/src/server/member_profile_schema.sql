-- Member profile schema (idempotent)
-- Purpose:
-- 1) Add MEMBER_PROFILE with required attributes and constraints.
-- 2) Relate member profile to existing member/account tables.
-- 3) Standardize member classification and stress index category as FK lookups.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.member_classification (
  classification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT member_classification_code_chk
    CHECK (code IN ('MIGS', 'NON-MIGS'))
);

INSERT INTO public.member_classification (code, description)
VALUES
  ('MIGS', 'Member in good standing'),
  ('NON-MIGS', 'Non-member in good standing')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.stress_index_category (
  stress_index_category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stress_index_category_code_chk
    CHECK (code IN ('safe', 'low_risk', 'moderate_risk', 'high_risk', 'extreme_risk'))
);

INSERT INTO public.stress_index_category (code, label)
VALUES
  ('safe', 'Safe'),
  ('low_risk', 'Low Risk'),
  ('moderate_risk', 'Moderate Risk'),
  ('high_risk', 'High Risk'),
  ('extreme_risk', 'Extreme Risk')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.member_profile (
  profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to public.member(id). This is the stable UUID identity.
  membership_number_id UUID NOT NULL,

  -- FK to member account table (resolved dynamically for member_account/member_accounts).
  member_account UUID NULL,

  housing_status TEXT NOT NULL,
  net_income NUMERIC(14,2) NOT NULL,
  years_in_service INTEGER NOT NULL DEFAULT 0,

  civil_status TEXT NOT NULL,
  employment_status TEXT NOT NULL,
  spouse_employment_status TEXT NULL,

  member_classification_id UUID NOT NULL,

  -- Inputs for DTI formula: stress_index = current_loan_debt / latest_net_pay.
  current_loan_debt NUMERIC(14,2) NOT NULL DEFAULT 0,
  latest_net_pay NUMERIC(14,2) NOT NULL,

  stress_index NUMERIC(7,4)
    GENERATED ALWAYS AS (ROUND(current_loan_debt / NULLIF(latest_net_pay, 0), 4)) STORED,

  stress_index_category_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT member_profile_member_unique UNIQUE (membership_number_id),

  CONSTRAINT member_profile_housing_status_chk
    CHECK (housing_status IN ('Owner', 'Rent')),
  CONSTRAINT member_profile_net_income_chk
    CHECK (net_income >= 0),
  CONSTRAINT member_profile_years_in_service_chk
    CHECK (years_in_service >= 0),

  CONSTRAINT member_profile_civil_status_chk
    CHECK (civil_status IN ('Single', 'Married', 'Separated', 'Divorced', 'Widowed')),

  CONSTRAINT member_profile_employment_status_chk
    CHECK (employment_status IN ('Full-time', 'Part-time', 'Freelance', 'Unemployed', 'Other')),

  CONSTRAINT member_profile_spouse_employment_status_chk
    CHECK (
      spouse_employment_status IS NULL
      OR spouse_employment_status IN ('Full-time', 'Part-time', 'Freelance', 'Unemployed', 'Other')
    ),

  CONSTRAINT member_profile_member_fk
    FOREIGN KEY (membership_number_id)
    REFERENCES public.member(id)
    ON DELETE CASCADE,

  CONSTRAINT member_profile_member_classification_fk
    FOREIGN KEY (member_classification_id)
    REFERENCES public.member_classification(classification_id)
    ON DELETE RESTRICT,

  CONSTRAINT member_profile_stress_index_category_fk
    FOREIGN KEY (stress_index_category_id)
    REFERENCES public.stress_index_category(stress_index_category_id)
    ON DELETE SET NULL,

  CONSTRAINT member_profile_loan_debt_chk
    CHECK (current_loan_debt >= 0),
  CONSTRAINT member_profile_latest_net_pay_chk
    CHECK (latest_net_pay > 0)
);

-- Longitudinal member growth level lookup.
CREATE TABLE IF NOT EXISTS public.classification_level (
  classification_level_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  min_score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT classification_level_score_range_chk CHECK (min_score >= 0 AND max_score >= min_score)
);

-- Optional defaults. Adjust ranges to match your business rules.
INSERT INTO public.classification_level (code, label, min_score, max_score)
VALUES
  ('starter', 'Starter', 0, 99),
  ('active', 'Active', 100, 199),
  ('advanced', 'Advanced', 200, 299),
  ('elite', 'Elite', 300, 2147483647)
ON CONFLICT (code) DO NOTHING;

-- Temporal member classification snapshots for longitudinal analytics.
CREATE TABLE IF NOT EXISTS public.member_classification_temporal (
  classification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_number_id UUID NOT NULL,
  classification_level_id UUID NOT NULL,

  -- Weekly snapshot date; constrained to Saturdays.
  accrual_date DATE NOT NULL,

  cbu_points INTEGER NOT NULL DEFAULT 0,
  loan_points INTEGER NOT NULL DEFAULT 0,
  savings_points INTEGER NOT NULL DEFAULT 0,
  payment_points INTEGER NOT NULL DEFAULT 0,
  grocery_points INTEGER NOT NULL DEFAULT 0,
  pli_points INTEGER NOT NULL DEFAULT 0,
  attendance_points INTEGER NOT NULL DEFAULT 0,

  total_score INTEGER
    GENERATED ALWAYS AS (
      cbu_points
      + loan_points
      + savings_points
      + payment_points
      + grocery_points
      + pli_points
      + attendance_points
    ) STORED,

  -- Should be encoded during first week snapshots.
  final_status TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT member_classification_temporal_member_fk
    FOREIGN KEY (membership_number_id)
    REFERENCES public.member(id)
    ON DELETE CASCADE,

  CONSTRAINT member_classification_temporal_level_fk
    FOREIGN KEY (classification_level_id)
    REFERENCES public.classification_level(classification_level_id)
    ON DELETE RESTRICT,

  CONSTRAINT member_classification_temporal_unique_week
    UNIQUE (membership_number_id, accrual_date),

  CONSTRAINT member_classification_temporal_saturday_chk
    CHECK (EXTRACT(ISODOW FROM accrual_date) = 6),

  CONSTRAINT member_classification_temporal_points_nonneg_chk
    CHECK (
      cbu_points >= 0
      AND loan_points >= 0
      AND savings_points >= 0
      AND payment_points >= 0
      AND grocery_points >= 0
      AND pli_points >= 0
      AND attendance_points >= 0
    ),

  CONSTRAINT member_classification_temporal_final_status_window_chk
    CHECK (
      final_status IS NULL
      OR EXTRACT(DAY FROM accrual_date) <= 7
    )
);

-- Add optional member_account FK depending on whichever account table exists.
DO $$
DECLARE
  fk_exists BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_profile_member_account_fk'
      AND conrelid = 'public.member_profile'::regclass
  ) INTO fk_exists;

  IF fk_exists THEN
    RETURN;
  END IF;

  IF to_regclass('public.member_account') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'member_account'
        AND column_name = 'user_id'
    ) THEN
      EXECUTE '
        ALTER TABLE public.member_profile
        ADD CONSTRAINT member_profile_member_account_fk
        FOREIGN KEY (member_account)
        REFERENCES public.member_account(user_id)
        ON DELETE SET NULL
      ';
      RETURN;
    ELSIF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'member_account'
        AND column_name = 'id'
    ) THEN
      EXECUTE '
        ALTER TABLE public.member_profile
        ADD CONSTRAINT member_profile_member_account_fk
        FOREIGN KEY (member_account)
        REFERENCES public.member_account(id)
        ON DELETE SET NULL
      ';
      RETURN;
    END IF;
  END IF;

  IF to_regclass('public.member_accounts') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'member_accounts'
        AND column_name = 'user_id'
    ) THEN
      EXECUTE '
        ALTER TABLE public.member_profile
        ADD CONSTRAINT member_profile_member_account_fk
        FOREIGN KEY (member_account)
        REFERENCES public.member_accounts(user_id)
        ON DELETE SET NULL
      ';
      RETURN;
    ELSIF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'member_accounts'
        AND column_name = 'id'
    ) THEN
      EXECUTE '
        ALTER TABLE public.member_profile
        ADD CONSTRAINT member_profile_member_account_fk
        FOREIGN KEY (member_account)
        REFERENCES public.member_accounts(id)
        ON DELETE SET NULL
      ';
      RETURN;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_member_profile_member_id
  ON public.member_profile (membership_number_id);

CREATE INDEX IF NOT EXISTS idx_member_profile_member_account
  ON public.member_profile (member_account);

CREATE INDEX IF NOT EXISTS idx_member_profile_member_classification
  ON public.member_profile (member_classification_id);

CREATE INDEX IF NOT EXISTS idx_member_profile_stress_category
  ON public.member_profile (stress_index_category_id);

CREATE INDEX IF NOT EXISTS idx_member_profile_stress_index
  ON public.member_profile (stress_index);

CREATE INDEX IF NOT EXISTS idx_member_classification_temporal_member_week
  ON public.member_classification_temporal (membership_number_id, accrual_date DESC);

CREATE INDEX IF NOT EXISTS idx_member_classification_temporal_level
  ON public.member_classification_temporal (classification_level_id);

CREATE INDEX IF NOT EXISTS idx_member_classification_temporal_final_status
  ON public.member_classification_temporal (final_status);

ALTER TABLE public.member_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stress_index_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classification_level ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_classification_temporal ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_member_profile_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_member_classification_temporal_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_member_profile_updated_at'
      AND tgrelid = 'public.member_profile'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_member_profile_updated_at
    BEFORE UPDATE ON public.member_profile
    FOR EACH ROW
    EXECUTE FUNCTION public.set_member_profile_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_member_classification_temporal_updated_at'
      AND tgrelid = 'public.member_classification_temporal'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_member_classification_temporal_updated_at
    BEFORE UPDATE ON public.member_classification_temporal
    FOR EACH ROW
    EXECUTE FUNCTION public.set_member_classification_temporal_updated_at();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.member_profile_set_stress_category()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_stress NUMERIC(7,4);
  v_code TEXT;
BEGIN
  IF NEW.latest_net_pay IS NULL OR NEW.latest_net_pay <= 0 THEN
    NEW.stress_index_category_id := NULL;
    RETURN NEW;
  END IF;

  v_stress := ROUND(NEW.current_loan_debt / NULLIF(NEW.latest_net_pay, 0), 4);

  v_code := CASE
    WHEN v_stress <= 0.20 THEN 'safe'
    WHEN v_stress <= 0.30 THEN 'low_risk'
    WHEN v_stress <= 0.35 THEN 'moderate_risk'
    WHEN v_stress <= 0.40 THEN 'high_risk'
    ELSE 'extreme_risk'
  END;

  NEW.stress_index_category_id := (
    SELECT sic.stress_index_category_id
    FROM public.stress_index_category sic
    WHERE sic.code = v_code
    LIMIT 1
  );

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_member_profile_set_stress_category'
      AND tgrelid = 'public.member_profile'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_member_profile_set_stress_category
    BEFORE INSERT OR UPDATE OF current_loan_debt, latest_net_pay
    ON public.member_profile
    FOR EACH ROW
    EXECUTE FUNCTION public.member_profile_set_stress_category();
  END IF;
END $$;

-- Optional sync from latest loan calculator output.
CREATE OR REPLACE FUNCTION public.sync_member_profile_from_loan_calculator()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.member_profile
  SET
    current_loan_debt = COALESCE(NEW.monthly_amortization, current_loan_debt),
    latest_net_pay = COALESCE(NEW.latest_net_pay, latest_net_pay),
    updated_at = NOW()
  WHERE membership_number_id = NEW.member_id;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.loan_calculator') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_sync_member_profile_from_loan_calculator'
        AND tgrelid = 'public.loan_calculator'::regclass
        AND NOT tgisinternal
    ) THEN
      EXECUTE '
        CREATE TRIGGER trg_sync_member_profile_from_loan_calculator
        AFTER INSERT OR UPDATE OF monthly_amortization, latest_net_pay
        ON public.loan_calculator
        FOR EACH ROW
        EXECUTE FUNCTION public.sync_member_profile_from_loan_calculator()
      ';
    END IF;
  END IF;
END $$;

ALTER TABLE public.member_profile ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_profile'
      AND policyname = 'member_profile_authenticated_select_own'
  ) THEN
    EXECUTE 'ALTER POLICY member_profile_authenticated_select_own ON public.member_profile USING (membership_number_id = auth.uid() OR member_account = auth.uid())';
  ELSE
    EXECUTE 'CREATE POLICY member_profile_authenticated_select_own ON public.member_profile FOR SELECT TO authenticated USING (membership_number_id = auth.uid() OR member_account = auth.uid())';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_profile'
      AND policyname = 'member_profile_authenticated_upsert_own'
  ) THEN
    EXECUTE 'ALTER POLICY member_profile_authenticated_upsert_own ON public.member_profile WITH CHECK (membership_number_id = auth.uid() OR member_account = auth.uid())';
  ELSE
    EXECUTE 'CREATE POLICY member_profile_authenticated_upsert_own ON public.member_profile FOR INSERT TO authenticated WITH CHECK (membership_number_id = auth.uid() OR member_account = auth.uid())';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_profile'
      AND policyname = 'member_profile_authenticated_update_own'
  ) THEN
    EXECUTE 'ALTER POLICY member_profile_authenticated_update_own ON public.member_profile USING (membership_number_id = auth.uid() OR member_account = auth.uid()) WITH CHECK (membership_number_id = auth.uid() OR member_account = auth.uid())';
  ELSE
    EXECUTE 'CREATE POLICY member_profile_authenticated_update_own ON public.member_profile FOR UPDATE TO authenticated USING (membership_number_id = auth.uid() OR member_account = auth.uid()) WITH CHECK (membership_number_id = auth.uid() OR member_account = auth.uid())';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_profile'
      AND policyname = 'member_profile_service_role_all'
  ) THEN
    EXECUTE 'ALTER POLICY member_profile_service_role_all ON public.member_profile USING (true) WITH CHECK (true)';
  ELSE
    EXECUTE 'CREATE POLICY member_profile_service_role_all ON public.member_profile FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_classification'
      AND policyname = 'member_classification_authenticated_select'
  ) THEN
    EXECUTE 'ALTER POLICY member_classification_authenticated_select ON public.member_classification USING (true)';
  ELSE
    EXECUTE 'CREATE POLICY member_classification_authenticated_select ON public.member_classification FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_classification'
      AND policyname = 'member_classification_service_role_all'
  ) THEN
    EXECUTE 'ALTER POLICY member_classification_service_role_all ON public.member_classification USING (true) WITH CHECK (true)';
  ELSE
    EXECUTE 'CREATE POLICY member_classification_service_role_all ON public.member_classification FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stress_index_category'
      AND policyname = 'stress_index_category_authenticated_select'
  ) THEN
    EXECUTE 'ALTER POLICY stress_index_category_authenticated_select ON public.stress_index_category USING (true)';
  ELSE
    EXECUTE 'CREATE POLICY stress_index_category_authenticated_select ON public.stress_index_category FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stress_index_category'
      AND policyname = 'stress_index_category_service_role_all'
  ) THEN
    EXECUTE 'ALTER POLICY stress_index_category_service_role_all ON public.stress_index_category USING (true) WITH CHECK (true)';
  ELSE
    EXECUTE 'CREATE POLICY stress_index_category_service_role_all ON public.stress_index_category FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'classification_level'
      AND policyname = 'classification_level_authenticated_select'
  ) THEN
    EXECUTE 'ALTER POLICY classification_level_authenticated_select ON public.classification_level USING (true)';
  ELSE
    EXECUTE 'CREATE POLICY classification_level_authenticated_select ON public.classification_level FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'classification_level'
      AND policyname = 'classification_level_service_role_all'
  ) THEN
    EXECUTE 'ALTER POLICY classification_level_service_role_all ON public.classification_level USING (true) WITH CHECK (true)';
  ELSE
    EXECUTE 'CREATE POLICY classification_level_service_role_all ON public.classification_level FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_classification_temporal'
      AND policyname = 'member_classification_temporal_authenticated_select_own'
  ) THEN
    EXECUTE 'ALTER POLICY member_classification_temporal_authenticated_select_own ON public.member_classification_temporal USING (membership_number_id = auth.uid())';
  ELSE
    EXECUTE 'CREATE POLICY member_classification_temporal_authenticated_select_own ON public.member_classification_temporal FOR SELECT TO authenticated USING (membership_number_id = auth.uid())';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_classification_temporal'
      AND policyname = 'member_classification_temporal_authenticated_insert_own'
  ) THEN
    EXECUTE 'ALTER POLICY member_classification_temporal_authenticated_insert_own ON public.member_classification_temporal WITH CHECK (membership_number_id = auth.uid())';
  ELSE
    EXECUTE 'CREATE POLICY member_classification_temporal_authenticated_insert_own ON public.member_classification_temporal FOR INSERT TO authenticated WITH CHECK (membership_number_id = auth.uid())';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_classification_temporal'
      AND policyname = 'member_classification_temporal_authenticated_update_own'
  ) THEN
    EXECUTE 'ALTER POLICY member_classification_temporal_authenticated_update_own ON public.member_classification_temporal USING (membership_number_id = auth.uid()) WITH CHECK (membership_number_id = auth.uid())';
  ELSE
    EXECUTE 'CREATE POLICY member_classification_temporal_authenticated_update_own ON public.member_classification_temporal FOR UPDATE TO authenticated USING (membership_number_id = auth.uid()) WITH CHECK (membership_number_id = auth.uid())';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_classification_temporal'
      AND policyname = 'member_classification_temporal_service_role_all'
  ) THEN
    EXECUTE 'ALTER POLICY member_classification_temporal_service_role_all ON public.member_classification_temporal USING (true) WITH CHECK (true)';
  ELSE
    EXECUTE 'CREATE POLICY member_classification_temporal_service_role_all ON public.member_classification_temporal FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.member_profile TO authenticated;
GRANT ALL ON public.member_profile TO service_role;
GRANT SELECT ON public.member_classification TO authenticated;
GRANT ALL ON public.member_classification TO service_role;
GRANT SELECT ON public.stress_index_category TO authenticated;
GRANT ALL ON public.stress_index_category TO service_role;
GRANT SELECT ON public.classification_level TO authenticated;
GRANT ALL ON public.classification_level TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.member_classification_temporal TO authenticated;
GRANT ALL ON public.member_classification_temporal TO service_role;

COMMENT ON TABLE public.member_profile IS 'Detailed member profile with employment, financial, and risk attributes.';
COMMENT ON COLUMN public.member_profile.membership_number_id IS 'FK to public.member(id).';
COMMENT ON COLUMN public.member_profile.member_account IS 'FK to member_account/member_accounts user id for login linkage.';
COMMENT ON COLUMN public.member_profile.member_classification_id IS 'FK to MIGS/NON-MIGS lookup table.';
COMMENT ON COLUMN public.member_profile.stress_index IS 'Computed DTI ratio: current_loan_debt/latest_net_pay.';
COMMENT ON COLUMN public.member_profile.stress_index_category_id IS 'FK to stress index category lookup derived from DTI value.';
COMMENT ON TABLE public.classification_level IS 'Lookup table for member growth classification levels and score thresholds.';
COMMENT ON TABLE public.member_classification_temporal IS 'Weekly temporal snapshots used for longitudinal member growth analytics.';
COMMENT ON COLUMN public.member_classification_temporal.accrual_date IS 'Snapshot accrual date; must be Saturday.';
COMMENT ON COLUMN public.member_classification_temporal.final_status IS 'Monthly final classification status; should be set on first-week snapshots.';

COMMIT;