-- Fix: member share capital / share count ignored every CBU line after the
-- year-end import placeholder.
-- Run in Supabase SQL editor.
--
-- The yearly historical import pre-creates a Dec-31-of-the-current-year
-- snapshot row for each member (capital_added = 0, ending_share_capital =
-- balance at import time). recompute_member_shares() picked the "latest"
-- row by transaction_date alone, so for every member with that placeholder
-- (259 on 2026-09-30) member.share_capital_amount / number_of_shares stayed
-- frozen at the import-time balance: real deposits made since, loan CBU
-- retentions, and termination payouts never reached the coop's total CBU.
--
-- Same fix already applied to the CRJ deposit endpoint and the loan-release
-- CBU trigger (cbu_disbursement_trigger_fix_future_date.sql): ignore rows
-- dated after today, and tie-break same-day rows on cbu_deposit_id's numeric
-- suffix instead of the random uuid `id`. If a member has ONLY future-dated
-- rows, fall back to the latest row of any date (rather than ₱0).
--
-- Then recompute every member once so stored values catch up.
-- Idempotent: safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION public.recompute_member_shares(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_running_balance numeric;
    v_first_capital_added numeric;
    v_computed_shares numeric;
BEGIN
    IF p_member_id IS NULL THEN
        RETURN;
    END IF;

    -- Latest REAL running CBU balance (not the future-dated placeholder).
    SELECT coalesce(ending_share_capital, 0)
    INTO v_running_balance
    FROM public.capital_build_up
    WHERE member_id = p_member_id
      AND transaction_date::date <= current_date
    ORDER BY
        transaction_date DESC NULLS LAST,
        NULLIF(regexp_replace(coalesce(cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer DESC NULLS LAST,
        id DESC
    LIMIT 1;

    -- Only future-dated rows: use the latest of those rather than ₱0.
    IF v_running_balance IS NULL THEN
        SELECT coalesce(ending_share_capital, 0)
        INTO v_running_balance
        FROM public.capital_build_up
        WHERE member_id = p_member_id
        ORDER BY transaction_date DESC NULLS LAST, id DESC
        LIMIT 1;
    END IF;

    IF v_running_balance IS NULL THEN
        v_running_balance := 0;
    END IF;

    -- Original paid-up amount: the capital_added of the member's earliest
    -- capital_build_up row (set once, never re-derived on later deposits).
    SELECT capital_added
    INTO v_first_capital_added
    FROM public.capital_build_up
    WHERE member_id = p_member_id
    ORDER BY transaction_date ASC NULLS LAST, id ASC
    LIMIT 1;

    v_computed_shares := floor(v_running_balance / 1000);

    UPDATE public.member
    SET
        number_of_shares = v_computed_shares,
        share_capital_amount = v_running_balance,
        initial_paid_up_capital = coalesce(
            member.initial_paid_up_capital,
            v_first_capital_added,
            0
        )
    WHERE id = p_member_id;

    IF to_regclass('public.personal_data_sheet') IS NOT NULL THEN
        UPDATE public.personal_data_sheet pds
        SET
            number_of_shares = v_computed_shares,
            amount = v_running_balance,
            initial_paid_up_capital = coalesce(
                pds.initial_paid_up_capital,
                v_first_capital_added,
                0
            )
        FROM public.member m
        WHERE m.id = p_member_id
          AND pds.membership_number_id = m.membership_id;
    END IF;
END;
$$;

-- Snapshot the coop total before the recompute, for Check 1.
DROP TABLE IF EXISTS _cbu_total_before;
CREATE TEMP TABLE _cbu_total_before AS
SELECT coalesce(sum(share_capital_amount), 0) AS total FROM public.member;

DO $$
DECLARE
    rec record;
BEGIN
    FOR rec IN
        SELECT DISTINCT member_id
        FROM public.capital_build_up
        WHERE member_id IS NOT NULL
    LOOP
        PERFORM public.recompute_member_shares(rec.member_id);
    END LOOP;
END $$;

COMMIT;

-- Check 1: coop total CBU before vs after (the difference is what the
-- placeholder rows were hiding).
SELECT
    (SELECT total FROM _cbu_total_before)                              AS total_before,
    (SELECT coalesce(sum(share_capital_amount), 0) FROM public.member) AS total_after,
    (SELECT coalesce(sum(share_capital_amount), 0) FROM public.member)
      - (SELECT total FROM _cbu_total_before)                          AS difference;
