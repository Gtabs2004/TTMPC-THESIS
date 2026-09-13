-- ============================================================================
-- Auto-derive member.number_of_shares / member.share_capital_amount from
-- the member's running Capital Build-Up (CBU) balance.
-- ----------------------------------------------------------------------------
-- Business rule (confirmed 2026-09-13): 1 share = PHP 1,000 of CBU.
--   e.g. capital_build_up.ending_share_capital = 20000  =>  number_of_shares = 20
--
-- Scope:
--   - Runs off the member's TOTAL running CBU balance (ending_share_capital
--     of their most recent capital_build_up row), not just the initial
--     PHP 10,000 payment. Shares grow automatically as CBU grows (later
--     Cashier CBU deposits included), matching the printed policy.
--   - member.initial_paid_up_capital is set ONCE, from the member's very
--     first capital_build_up row (chronologically), and is never
--     overwritten afterward — it records the original paid-up amount, not
--     the running balance.
--   - Mirrors the computed number_of_shares / amount into
--     personal_data_sheet when a row exists for that member, so both
--     surfaces (Member Profile via personal_data_sheet, Secretary/BOD
--     views via member) stay consistent.
--
-- This supersedes manual entry of number_of_shares/amount by
-- Secretary/BOD in Record_Details.jsx — those fields become read-only
-- display values driven by this trigger (see Record_Details.jsx change).
--
-- Run in Supabase SQL editor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Helper: recompute and write number_of_shares/share_capital_amount for
--    one member, from their capital_build_up rows.
-- ----------------------------------------------------------------------------
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

    -- Latest running CBU balance for this member.
    SELECT coalesce(ending_share_capital, 0)
    INTO v_running_balance
    FROM public.capital_build_up
    WHERE member_id = p_member_id
    ORDER BY transaction_date DESC NULLS LAST, id DESC
    LIMIT 1;

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

    -- Mirror into personal_data_sheet if a row exists for this member
    -- (keeps the Member Profile page, which reads personal_data_sheet
    -- first, in sync with the member table).
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

-- ----------------------------------------------------------------------------
-- 2. Trigger function: fires on any capital_build_up change for a member.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sync_member_shares_from_cbu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.recompute_member_shares(OLD.member_id);
        RETURN OLD;
    END IF;

    PERFORM public.recompute_member_shares(NEW.member_id);

    -- Handle member_id reassignment (rare, but keep the old member correct).
    IF TG_OP = 'UPDATE' AND OLD.member_id IS DISTINCT FROM NEW.member_id THEN
        PERFORM public.recompute_member_shares(OLD.member_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capital_build_up_sync_member_shares
    ON public.capital_build_up;

CREATE TRIGGER trg_capital_build_up_sync_member_shares
AFTER INSERT OR DELETE OR UPDATE OF ending_share_capital, capital_added, member_id, transaction_date
    ON public.capital_build_up
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_member_shares_from_cbu();

-- ----------------------------------------------------------------------------
-- 3. Backfill: recompute for every member who already has capital_build_up
--    rows, so existing members pick up the derived values immediately.
-- ----------------------------------------------------------------------------
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
