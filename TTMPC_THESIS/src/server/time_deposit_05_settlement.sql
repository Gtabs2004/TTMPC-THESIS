-- Time Deposit — maturity settlement (member's choice: withdraw all, or
-- withdraw tubo and renew the original principal). Apply after
-- time_deposit_04_maturity.sql. Staff-processed only (per TD_LIFECYCLE_PLAN.md
-- D6) — there is no automatic settlement; this RPC is called by the Cashier
-- once the member has told staff what they want at the counter.

BEGIN;

CREATE OR REPLACE FUNCTION public.td_settle_maturity(
    p_time_deposit_id uuid,
    p_mode text,
    p_new_term_days integer DEFAULT NULL,
    p_posted_by uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    certificate_number text,
    status text,
    new_time_deposit_id uuid,
    new_certificate_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_td public.time_deposits%ROWTYPE;
    v_new_id uuid;
    v_new_certificate text;
    v_product_code text;
    v_rate numeric;
    v_bracket_min numeric;
    v_bracket_max numeric;
    v_bracket_label text;
    v_new_interest numeric;
    v_placement_date date;
BEGIN
    IF p_mode NOT IN ('FULL_PAYOUT', 'ROLL_PRINCIPAL_ONLY') THEN
        RAISE EXCEPTION 'Settlement mode must be FULL_PAYOUT or ROLL_PRINCIPAL_ONLY.';
    END IF;

    SELECT * INTO v_td
    FROM public.time_deposits
    WHERE time_deposits.id = p_time_deposit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Time Deposit certificate not found.';
    END IF;
    IF v_td.status <> 'matured' THEN
        RAISE EXCEPTION 'Only a matured certificate can be settled.';
    END IF;

    v_placement_date := current_date;

    -- Interest is always paid out in cash at settlement — the completed
    -- cycle's agreed interest never changes and is never added to a renewed
    -- principal (TD_LIFECYCLE_PLAN.md D6/D7; tracking doc Section 6).
    INSERT INTO public.time_deposit_ledger (
        time_deposit_id, entry_type, amount, reference, idempotency_key, metadata
    ) VALUES (
        v_td.id, 'interest_payout', v_td.expected_interest, v_td.certificate_number,
        v_td.id::text || ':interest_payout',
        jsonb_build_object('kind', 'interest_payout', 'member_id', v_td.member_id)
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    IF p_mode = 'FULL_PAYOUT' THEN
        INSERT INTO public.time_deposit_ledger (
            time_deposit_id, entry_type, amount, reference, idempotency_key, metadata, posted_by
        ) VALUES (
            v_td.id, 'principal_payout', v_td.principal, v_td.certificate_number,
            v_td.id::text || ':principal_payout',
            jsonb_build_object('kind', 'principal_payout', 'member_id', v_td.member_id),
            p_posted_by
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        UPDATE public.time_deposits
        SET status = 'closed', updated_at = now(), settled_at = now()
        WHERE time_deposits.id = v_td.id
          AND status = 'matured';

        IF FOUND THEN
            INSERT INTO public.time_deposit_status_history (
                time_deposit_id, old_status, new_status, reason, changed_by
            ) VALUES (
                v_td.id, 'matured', 'closed', 'Full payout at maturity', p_posted_by
            );
        END IF;

        RETURN QUERY SELECT v_td.id, v_td.certificate_number, 'closed'::text, NULL::uuid, NULL::text;
        RETURN;
    END IF;

    -- ROLL_PRINCIPAL_ONLY: the original principal is retained — it is not
    -- debited or credited a second time (tracking doc Section 6 Option A) —
    -- and a new linked cycle is created with the member's chosen term.
    IF p_new_term_days NOT IN (180, 365) THEN
        RAISE EXCEPTION 'A renewal cycle requires a term of 180 or 365 days.';
    END IF;

    v_product_code := CASE WHEN p_new_term_days = 180 THEN 'TD_6M' ELSE 'TD_12M' END;
    SELECT tiers.bracket_min, tiers.bracket_max, tiers.annual_rate_percent / 100, tiers.bracket_label
    INTO v_bracket_min, v_bracket_max, v_rate, v_bracket_label
    FROM public.deposit_interest_policy_tiers AS tiers
    WHERE tiers.product_code = v_product_code
        AND tiers.term_days = p_new_term_days
        AND v_td.principal >= tiers.bracket_min
        AND (tiers.bracket_max IS NULL OR v_td.principal <= tiers.bracket_max)
    ORDER BY tiers.bracket_min DESC
    LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No applicable Time Deposit rate bracket for the renewed principal.';
    END IF;

    v_new_interest := CASE
        WHEN p_new_term_days = 180 THEN round(v_td.principal * v_rate / 365 * 180, 2)
        ELSE round(v_td.principal * v_rate, 2)
    END;
    v_new_id := gen_random_uuid();
    v_new_certificate := 'TD-' || to_char(v_placement_date, 'YYYYMMDD') || '-'
        || upper(substr(replace(v_new_id::text, '-', ''), 1, 8));

    INSERT INTO public.time_deposits (
        id, certificate_number, member_id, prior_deposit_id, cycle_number,
        placement_date, maturity_date, principal, term_days, annual_rate,
        rate_bracket_min, rate_bracket_max, rate_bracket_label,
        expected_interest, expected_maturity_value, status
    ) VALUES (
        v_new_id, v_new_certificate, v_td.member_id, v_td.id, v_td.cycle_number + 1,
        v_placement_date,
        v_placement_date + (CASE WHEN p_new_term_days = 180 THEN 6 ELSE 12 END || ' months')::interval,
        v_td.principal, p_new_term_days, v_rate,
        v_bracket_min, v_bracket_max, v_bracket_label, v_new_interest,
        round(v_td.principal + v_new_interest, 2), 'locked'
    );

    INSERT INTO public.time_deposit_ledger (
        time_deposit_id, entry_type, amount, reference, idempotency_key, metadata
    ) VALUES (
        v_new_id, 'rollover_principal', v_td.principal, v_new_certificate,
        v_new_id::text || ':rollover_principal',
        jsonb_build_object('kind', 'rollover_principal', 'member_id', v_td.member_id, 'prior_deposit_id', v_td.id)
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    UPDATE public.time_deposits
    SET status = 'closed', updated_at = now(), settled_at = now()
    WHERE time_deposits.id = v_td.id
      AND status = 'matured';

    IF FOUND THEN
        INSERT INTO public.time_deposit_status_history (
            time_deposit_id, old_status, new_status, reason, changed_by
        ) VALUES (
            v_td.id, 'matured', 'closed', 'Interest paid out; principal renewed into ' || v_new_certificate, p_posted_by
        );
    END IF;

    RETURN QUERY SELECT v_td.id, v_td.certificate_number, 'closed'::text, v_new_id, v_new_certificate;
END;
$$;

REVOKE ALL ON FUNCTION public.td_settle_maturity(uuid, text, integer, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.td_settle_maturity(uuid, text, integer, uuid) TO service_role;

COMMIT;
