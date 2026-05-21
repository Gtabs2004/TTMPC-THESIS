-- ============================================================================
-- Capital Build-Up synchronization from membership_payments
-- ----------------------------------------------------------------------------
-- Purpose:
--   When a newly-registered member's INITIAL_PAID_UP_CAPITAL payment is
--   recorded in membership_payments (status = 'paid'), automatically create
--   the corresponding capital_build_up row so the Member Dashboard reflects
--   the share capital in real time.
--
--   Idempotent and duplicate-safe: re-running the trigger or backfill will
--   not produce duplicate capital_build_up rows for the same payment.
--
--   Scope: only applies to INITIAL_PAID_UP_CAPITAL records (i.e., newly
--   registered members' first deposit). Existing members' subsequent CBU
--   deposits continue to be handled by the existing Cashier CBU flow.
--
-- Run in Supabase SQL editor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Schema additions to capital_build_up: track originating payment.
-- ----------------------------------------------------------------------------
ALTER TABLE public.capital_build_up
    ADD COLUMN IF NOT EXISTS source_payment_id text;

-- Prevent duplicate capital_build_up rows for the same membership_payment row.
-- A regular UNIQUE constraint allows multiple NULLs in Postgres (so rows
-- without a source payment are unaffected) and is required for ON CONFLICT
-- inference to work in the trigger/backfill below.
DROP INDEX IF EXISTS public.capital_build_up_source_payment_id_uk;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'capital_build_up_source_payment_id_uk'
          AND conrelid = 'public.capital_build_up'::regclass
    ) THEN
        ALTER TABLE public.capital_build_up
            ADD CONSTRAINT capital_build_up_source_payment_id_uk
            UNIQUE (source_payment_id);
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Helper: resolve member.id for a given membership_payments row.
--    Maps application_id -> member_applications.membership_id ->
--    member.membership_number_id -> member.id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_member_id_for_application(
    p_application_id text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_membership_id text;
    v_member_id uuid;
BEGIN
    IF p_application_id IS NULL OR btrim(p_application_id) = '' THEN
        RETURN NULL;
    END IF;

    IF to_regclass('public.member_applications') IS NOT NULL THEN
        SELECT ma.membership_id
        INTO v_membership_id
        FROM public.member_applications ma
        WHERE ma.application_id = p_application_id
          AND ma.membership_id IS NOT NULL
        ORDER BY ma.created_at DESC NULLS LAST
        LIMIT 1;
    END IF;

    IF v_membership_id IS NULL
       AND to_regclass('public.membership_application') IS NOT NULL THEN
        SELECT ma.membership_id
        INTO v_membership_id
        FROM public.membership_application ma
        WHERE ma.application_id = p_application_id
          AND ma.membership_id IS NOT NULL
        ORDER BY ma.created_at DESC NULLS LAST
        LIMIT 1;
    END IF;

    IF v_membership_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT m.id
    INTO v_member_id
    FROM public.member m
    WHERE m.membership_id = v_membership_id
    LIMIT 1;

    RETURN v_member_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Trigger function: sync a single membership_payments row into CBU.
--    Fires only for INITIAL_PAID_UP_CAPITAL payments with status = 'paid'.
--    Idempotent — relies on the unique index above.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_cbu_from_membership_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payment_type text;
    v_payment_status text;
    v_amount numeric;
    v_member_id uuid;
    v_existing_balance numeric := 0;
    v_payment_key text;
BEGIN
    v_payment_type := lower(btrim(coalesce(NEW.payment_type, '')));
    v_payment_status := lower(btrim(coalesce(NEW.payment_status, '')));
    v_amount := coalesce(NEW.amount, 0);

    -- Only new-member initial paid-up capital is auto-synced.
    IF v_payment_type <> 'initial_paid_up_capital' THEN
        RETURN NEW;
    END IF;

    -- Only confirmed payments produce a CBU row.
    IF v_payment_status <> 'paid' THEN
        RETURN NEW;
    END IF;

    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;

    v_member_id := public.resolve_member_id_for_application(NEW.application_id);
    IF v_member_id IS NULL THEN
        -- Member not yet confirmed; CBU row will be seeded once member.id exists.
        RETURN NEW;
    END IF;

    v_payment_key := coalesce(NEW.payment_id, NEW.id::text);

    -- Already synced for this payment? Skip.
    IF EXISTS (
        SELECT 1
        FROM public.capital_build_up
        WHERE source_payment_id = v_payment_key
    ) THEN
        RETURN NEW;
    END IF;

    -- Pick up the member's current running balance to keep the ledger
    -- continuous (handles the rare case of multiple initial payments).
    SELECT coalesce(ending_share_capital, 0)
    INTO v_existing_balance
    FROM public.capital_build_up
    WHERE member_id = v_member_id
    ORDER BY transaction_date DESC NULLS LAST
    LIMIT 1;

    IF v_existing_balance IS NULL THEN
        v_existing_balance := 0;
    END IF;

    INSERT INTO public.capital_build_up (
        member_id,
        transaction_date,
        starting_share_capital,
        capital_added,
        deposit_account,
        ending_share_capital,
        source_payment_id
    ) VALUES (
        v_member_id,
        coalesce(NEW.payment_date, now()),
        v_existing_balance,
        v_amount,
        'INITIAL_PAID_UP_CAPITAL',
        v_existing_balance + v_amount,
        v_payment_key
    )
    ON CONFLICT (source_payment_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cbu_from_membership_payment
    ON public.membership_payments;

CREATE TRIGGER trg_sync_cbu_from_membership_payment
AFTER INSERT OR UPDATE OF payment_status, amount, payment_date, payment_type
    ON public.membership_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_cbu_from_membership_payment();

-- ----------------------------------------------------------------------------
-- 4. Backfill: migrate any previously-recorded INITIAL_PAID_UP_CAPITAL
--    payments that don't yet have a corresponding capital_build_up row.
--    Safe to re-run — duplicates are prevented by the unique index.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    rec record;
    v_member_id uuid;
    v_existing_balance numeric;
    v_payment_key text;
BEGIN
    FOR rec IN
        SELECT
            mp.id,
            mp.payment_id,
            mp.application_id,
            mp.payment_date,
            mp.amount,
            mp.payment_status,
            mp.payment_type
        FROM public.membership_payments mp
        WHERE lower(btrim(coalesce(mp.payment_type, ''))) = 'initial_paid_up_capital'
          AND lower(btrim(coalesce(mp.payment_status, ''))) = 'paid'
          AND coalesce(mp.amount, 0) > 0
          AND NOT EXISTS (
              SELECT 1
              FROM public.capital_build_up cbu
              WHERE cbu.source_payment_id = coalesce(mp.payment_id, mp.id::text)
          )
        ORDER BY mp.payment_date NULLS LAST, mp.id
    LOOP
        v_member_id := public.resolve_member_id_for_application(rec.application_id);
        IF v_member_id IS NULL THEN
            CONTINUE;
        END IF;

        v_payment_key := coalesce(rec.payment_id, rec.id::text);

        -- Extra safety: skip if a CBU row for this member already references
        -- this payment (race-safe even though unique index also enforces it).
        IF EXISTS (
            SELECT 1
            FROM public.capital_build_up
            WHERE source_payment_id = v_payment_key
        ) THEN
            CONTINUE;
        END IF;

        SELECT coalesce(ending_share_capital, 0)
        INTO v_existing_balance
        FROM public.capital_build_up
        WHERE member_id = v_member_id
        ORDER BY transaction_date DESC NULLS LAST
        LIMIT 1;

        IF v_existing_balance IS NULL THEN
            v_existing_balance := 0;
        END IF;

        INSERT INTO public.capital_build_up (
            member_id,
            transaction_date,
            starting_share_capital,
            capital_added,
            deposit_account,
            ending_share_capital,
            source_payment_id
        ) VALUES (
            v_member_id,
            coalesce(rec.payment_date, now()),
            v_existing_balance,
            rec.amount,
            'INITIAL_PAID_UP_CAPITAL',
            v_existing_balance + rec.amount,
            v_payment_key
        )
        ON CONFLICT (source_payment_id) DO NOTHING;
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 5. One-off cleanup: collapse duplicate INITIAL_PAID_UP_CAPITAL rows that
--    pre-date the unique constraint (older seed runs may have created two
--    rows per member with no source_payment_id). Keeps the earliest row.
-- ----------------------------------------------------------------------------
WITH dups AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY member_id, deposit_account
            ORDER BY transaction_date ASC NULLS LAST, id
        ) AS rn
    FROM public.capital_build_up
    WHERE deposit_account = 'INITIAL_PAID_UP_CAPITAL'
      AND source_payment_id IS NULL
)
DELETE FROM public.capital_build_up cbu
USING dups
WHERE cbu.id = dups.id
  AND dups.rn > 1;

COMMIT;
