-- Time Deposit — soft minimum placement override.
-- Today td_open() silently fails below the PHP 50,000 floor with a generic
-- "no applicable rate bracket" error -- there is no way for staff to place a
-- below-minimum certificate even when there's a good reason to. This adds an
-- explicit p_override_minimum flag: false (default) keeps today's behavior
-- unchanged; true lets a principal below PHP 50,000 go through, using the
-- lowest bracket's rate (the PHP 50,000-199,999.99 tier) since no bracket is
-- defined for anything smaller. The override is logged in the ledger's
-- metadata so it's auditable who approved placing below the floor.
-- Apply after time_deposit_07_pre_termination.sql.

BEGIN;

-- The new 6th parameter makes this a different overload in Postgres --
-- drop the old 5-arg signature so callers can't silently invoke the stale
-- version without the override.
DROP FUNCTION IF EXISTS public.td_open(uuid, numeric, integer, date, text);

CREATE OR REPLACE FUNCTION public.td_open(
    p_member_id uuid,
    p_principal numeric,
    p_term_days integer,
    p_placement_date date DEFAULT current_date,
    p_opening_key text DEFAULT NULL,
    p_override_minimum boolean DEFAULT false
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
    v_below_minimum boolean := false;
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
        IF NOT p_override_minimum THEN
            RAISE EXCEPTION 'This principal is below the PHP 50,000 minimum for a Time Deposit. Use the minimum override to place it anyway.';
        END IF;

        -- Below the lowest defined bracket and the override was given:
        -- use the lowest bracket's own rate (there is no bracket smaller
        -- than it to fall back to).
        SELECT tiers.bracket_min, tiers.bracket_max, tiers.annual_rate_percent / 100, tiers.bracket_label
        INTO v_bracket_min, v_bracket_max, v_rate, v_bracket_label
        FROM public.deposit_interest_policy_tiers AS tiers
        WHERE tiers.product_code = v_product_code
            AND tiers.term_days = p_term_days
        ORDER BY tiers.bracket_min ASC
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'No Time Deposit rate bracket is configured for this term at all.';
        END IF;
        v_below_minimum := true;
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
        jsonb_build_object(
            'kind', 'placement', 'member_id', p_member_id,
            'below_minimum_override', v_below_minimum
        )
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

REVOKE ALL ON FUNCTION public.td_open(uuid, numeric, integer, date, text, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.td_open(uuid, numeric, integer, date, text, boolean) TO service_role;

COMMIT;
