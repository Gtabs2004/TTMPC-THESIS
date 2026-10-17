-- Time Deposit — base schema and read-only calculation preview.
-- Apply manually in Supabase SQL Editor. Do not apply until the schema has
-- been reviewed against the live database.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.deposit_interest_policy_tiers (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_code         text NOT NULL REFERENCES public.deposit_interest_policies(product_code),
    term_days            integer NOT NULL CHECK (term_days IN (180, 365)),
    bracket_min          numeric(14,2) NOT NULL CHECK (bracket_min >= 0),
    bracket_max          numeric(14,2),
    annual_rate_percent  numeric(7,4) NOT NULL CHECK (annual_rate_percent >= 0 AND annual_rate_percent < 100),
    bracket_label        text NOT NULL,
    updated_by           uuid,
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT deposit_interest_policy_tiers_range_chk CHECK (
        bracket_max IS NULL OR bracket_max > bracket_min
    ),
    CONSTRAINT deposit_interest_policy_tiers_unique_range
        UNIQUE (product_code, term_days, bracket_min)
);

INSERT INTO public.deposit_interest_policy_tiers
    (product_code, term_days, bracket_min, bracket_max, annual_rate_percent, bracket_label)
VALUES
    ('TD_6M',  180, 50000,  199999.99, 1.5, 'PHP 50,000.00-PHP 199,999.99'),
    ('TD_6M',  180, 200000, 499999.99, 2.0, 'PHP 200,000.00-PHP 499,999.99'),
    ('TD_6M',  180, 500000, 799999.99, 2.5, 'PHP 500,000.00-PHP 799,999.99'),
    ('TD_6M',  180, 800000, NULL,       3.0, 'PHP 800,000.00 and above'),
    ('TD_12M', 365, 50000,  199999.99, 2.0, 'PHP 50,000.00-PHP 199,999.99'),
    ('TD_12M', 365, 200000, 499999.99, 2.5, 'PHP 200,000.00-PHP 499,999.99'),
    ('TD_12M', 365, 500000, 799999.99, 3.0, 'PHP 500,000.00-PHP 799,999.99'),
    ('TD_12M', 365, 800000, NULL,       4.0, 'PHP 800,000.00 and above')
ON CONFLICT (product_code, term_days, bracket_min) DO NOTHING;

ALTER TABLE public.deposit_interest_policy_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deposit_interest_policy_tiers_read ON public.deposit_interest_policy_tiers;
CREATE POLICY deposit_interest_policy_tiers_read ON public.deposit_interest_policy_tiers
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS deposit_interest_policy_tiers_update_bod ON public.deposit_interest_policy_tiers;
CREATE POLICY deposit_interest_policy_tiers_update_bod ON public.deposit_interest_policy_tiers
    FOR UPDATE TO authenticated
    USING (public.is_bod_account())
    WITH CHECK (public.is_bod_account());

GRANT SELECT ON public.deposit_interest_policy_tiers TO authenticated;
GRANT UPDATE (annual_rate_percent, updated_by) ON public.deposit_interest_policy_tiers TO authenticated;
GRANT ALL ON public.deposit_interest_policy_tiers TO service_role;

CREATE TABLE IF NOT EXISTS public.time_deposits (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_number       text NOT NULL UNIQUE,
    member_id                uuid NOT NULL REFERENCES public.member(id),
    prior_deposit_id         uuid REFERENCES public.time_deposits(id),
    cycle_number             integer NOT NULL DEFAULT 1 CHECK (cycle_number > 0),
    placement_date           date NOT NULL,
    maturity_date            date NOT NULL,
    principal                numeric(14,2) NOT NULL CHECK (principal > 0),
    term_days                integer NOT NULL CHECK (term_days IN (180, 365)),
    annual_rate              numeric(8,6) NOT NULL CHECK (annual_rate >= 0 AND annual_rate < 1),
    rate_bracket_min         numeric(14,2) NOT NULL CHECK (rate_bracket_min >= 0),
    rate_bracket_max         numeric(14,2),
    rate_bracket_label       text NOT NULL,
    expected_interest        numeric(14,2) NOT NULL CHECK (expected_interest >= 0),
    expected_maturity_value  numeric(14,2) NOT NULL CHECK (expected_maturity_value >= 0),
    status                   text NOT NULL DEFAULT 'locked'
        CHECK (status IN ('locked', 'matured', 'closed')),
    funding_source           text,
    funding_reference        text,
    source_account_number    text REFERENCES public.savings_accounts(account_number),
    created_by               uuid,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    settled_at               timestamptz,
    opening_key              text UNIQUE,
    CONSTRAINT time_deposits_cycle_parent_chk CHECK (
        (cycle_number = 1 AND prior_deposit_id IS NULL)
        OR (cycle_number > 1 AND prior_deposit_id IS NOT NULL)
    ),
    CONSTRAINT time_deposits_maturity_after_placement_chk CHECK (maturity_date > placement_date)
);

ALTER TABLE public.time_deposits
    ADD COLUMN IF NOT EXISTS opening_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_time_deposits_opening_key
    ON public.time_deposits (opening_key)
    WHERE opening_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_time_deposits_member_status
    ON public.time_deposits (member_id, status, maturity_date DESC);

CREATE INDEX IF NOT EXISTS idx_time_deposits_maturity
    ON public.time_deposits (maturity_date, status);

CREATE TABLE IF NOT EXISTS public.time_deposit_ledger (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    time_deposit_id   uuid NOT NULL REFERENCES public.time_deposits(id),
    entry_type        text NOT NULL CHECK (entry_type IN (
        'placement', 'interest_payout', 'principal_payout',
        'rollover_principal', 'rollover_interest', 'adjustment'
    )),
    amount            numeric(14,2) NOT NULL CHECK (amount > 0),
    reference         text,
    idempotency_key   text NOT NULL UNIQUE,
    metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
    posted_by         uuid,
    posted_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_deposit_ledger_deposit
    ON public.time_deposit_ledger (time_deposit_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS public.time_deposit_status_history (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    time_deposit_id uuid NOT NULL REFERENCES public.time_deposits(id),
    old_status      text,
    new_status      text NOT NULL CHECK (new_status IN ('locked', 'matured', 'closed')),
    reason          text,
    changed_by      uuid,
    changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_deposit_status_history_deposit
    ON public.time_deposit_status_history (time_deposit_id, changed_at DESC);

ALTER TABLE public.time_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_deposit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_deposit_status_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.time_deposits FROM anon, authenticated;
REVOKE ALL ON public.time_deposit_ledger FROM anon, authenticated;
REVOKE ALL ON public.time_deposit_status_history FROM anon, authenticated;
GRANT ALL ON public.time_deposits TO service_role;
GRANT ALL ON public.time_deposit_ledger TO service_role;
GRANT ALL ON public.time_deposit_status_history TO service_role;

CREATE OR REPLACE FUNCTION public.td_calculate_preview(
    p_principal numeric,
    p_term_days integer
)
RETURNS TABLE (
    principal numeric,
    term_days integer,
    annual_rate numeric,
    rate_bracket_min numeric,
    rate_bracket_max numeric,
    rate_bracket_label text,
    expected_interest numeric,
    expected_maturity_value numeric,
    formula text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_rate numeric;
    v_bracket_min numeric;
    v_bracket_max numeric;
    v_label text;
    v_interest numeric;
BEGIN
    IF p_principal IS NULL OR p_principal <= 0 THEN
        RAISE EXCEPTION 'Principal must be greater than zero.';
    END IF;

    IF p_term_days NOT IN (180, 365) THEN
        RAISE EXCEPTION 'Time Deposit term must be 180 or 365 days.';
    END IF;

        SELECT tiers.bracket_min, tiers.bracket_max, tiers.annual_rate_percent / 100, tiers.bracket_label
    INTO v_bracket_min, v_bracket_max, v_rate, v_label
        FROM public.deposit_interest_policy_tiers AS tiers
        WHERE tiers.product_code = CASE WHEN p_term_days = 180 THEN 'TD_6M' ELSE 'TD_12M' END
            AND tiers.term_days = p_term_days
            AND p_principal >= tiers.bracket_min
            AND (tiers.bracket_max IS NULL OR p_principal <= tiers.bracket_max)
        ORDER BY tiers.bracket_min DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No applicable Time Deposit rate bracket for this principal.';
    END IF;

    v_interest := CASE
        WHEN p_term_days = 180 THEN round(p_principal * v_rate / 365 * 180, 2)
        ELSE round(p_principal * v_rate, 2)
    END;

    RETURN QUERY SELECT
        round(p_principal, 2), p_term_days, v_rate, v_bracket_min, v_bracket_max,
        v_label, v_interest, round(p_principal + v_interest, 2),
        CASE WHEN p_term_days = 180
             THEN 'principal x annual rate / 365 x 180'
             ELSE 'principal x annual rate'
        END;
END;
$$;

REVOKE ALL ON FUNCTION public.td_calculate_preview(numeric, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.td_calculate_preview(numeric, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.td_open(
    p_member_id uuid,
    p_principal numeric,
    p_term_days integer,
    p_placement_date date DEFAULT current_date,
    p_opening_key text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    certificate_number text,
    member_id uuid,
    placement_date date,
    maturity_date date,
    principal numeric,
    term_days integer,
    annual_rate numeric,
    rate_bracket_min numeric,
    rate_bracket_max numeric,
    rate_bracket_label text,
    expected_interest numeric,
    expected_maturity_value numeric,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_product_code text;
    v_rate numeric;
    v_bracket_min numeric;
    v_bracket_max numeric;
    v_bracket_label text;
    v_interest numeric;
    v_id uuid;
    v_certificate text;
    v_existing public.time_deposits%ROWTYPE;
BEGIN
    IF p_member_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.member WHERE member.id = p_member_id) THEN
        RAISE EXCEPTION 'Member does not exist.';
    END IF;
    IF p_principal IS NULL OR p_principal <= 0 THEN
        RAISE EXCEPTION 'Principal must be greater than zero.';
    END IF;
    IF p_term_days NOT IN (180, 365) THEN
        RAISE EXCEPTION 'Time Deposit term must be 180 or 365 days.';
    END IF;
    IF p_placement_date IS NULL THEN
        RAISE EXCEPTION 'Placement date is required.';
    END IF;

    IF p_opening_key IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.time_deposits
        WHERE opening_key = p_opening_key
        FOR UPDATE;
        IF FOUND THEN
            RETURN QUERY SELECT
                v_existing.id, v_existing.certificate_number, v_existing.member_id,
                v_existing.placement_date, v_existing.maturity_date, v_existing.principal,
                v_existing.term_days, v_existing.annual_rate, v_existing.rate_bracket_min,
                v_existing.rate_bracket_max, v_existing.rate_bracket_label,
                v_existing.expected_interest, v_existing.expected_maturity_value,
                v_existing.status;
            RETURN;
        END IF;
    END IF;

    v_product_code := CASE WHEN p_term_days = 180 THEN 'TD_6M' ELSE 'TD_12M' END;
        SELECT tiers.bracket_min, tiers.bracket_max, tiers.annual_rate_percent / 100, tiers.bracket_label
    INTO v_bracket_min, v_bracket_max, v_rate, v_bracket_label
        FROM public.deposit_interest_policy_tiers AS tiers
        WHERE tiers.product_code = v_product_code
            AND tiers.term_days = p_term_days
            AND p_principal >= tiers.bracket_min
            AND (tiers.bracket_max IS NULL OR p_principal <= tiers.bracket_max)
        ORDER BY tiers.bracket_min DESC
    LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No applicable Time Deposit rate bracket for this principal.';
    END IF;

    v_interest := CASE
        WHEN p_term_days = 180 THEN round(p_principal * v_rate / 365 * 180, 2)
        ELSE round(p_principal * v_rate, 2)
    END;
    v_id := gen_random_uuid();
    v_certificate := 'TD-' || to_char(p_placement_date, 'YYYYMMDD') || '-' || upper(substr(replace(v_id::text, '-', ''), 1, 8));

    INSERT INTO public.time_deposits (
        id, certificate_number, member_id, placement_date, maturity_date,
        principal, term_days, annual_rate, rate_bracket_min, rate_bracket_max,
        rate_bracket_label, expected_interest, expected_maturity_value,
        status, opening_key
    ) VALUES (
        v_id, v_certificate, p_member_id, p_placement_date,
        p_placement_date + (CASE WHEN p_term_days = 180 THEN 6 ELSE 12 END || ' months')::interval,
        p_principal, p_term_days, v_rate,
        v_bracket_min, v_bracket_max, v_bracket_label, v_interest,
        round(p_principal + v_interest, 2), 'locked', p_opening_key
    );

    INSERT INTO public.time_deposit_ledger (
        time_deposit_id, entry_type, amount, reference, idempotency_key, metadata
    ) VALUES (
        v_id, 'placement', round(p_principal, 2), v_certificate,
        coalesce(p_opening_key, v_id::text) || ':placement',
        jsonb_build_object('kind', 'placement', 'member_id', p_member_id)
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN QUERY
    SELECT td.id, td.certificate_number, td.member_id, td.placement_date,
           td.maturity_date, td.principal, td.term_days, td.annual_rate,
           td.rate_bracket_min, td.rate_bracket_max, td.rate_bracket_label,
           td.expected_interest, td.expected_maturity_value, td.status
    FROM public.time_deposits td
    WHERE td.id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.td_open(uuid, numeric, integer, date, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.td_open(uuid, numeric, integer, date, text) TO service_role;

COMMIT;