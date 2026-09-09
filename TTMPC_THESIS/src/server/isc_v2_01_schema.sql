-- =============================================================================
-- ISC v2 — STEP 1 of 5: schema changes only
-- =============================================================================
-- Run this FIRST. It adds columns and relaxes constraints. It does NOT change
-- any function, so the existing ISC modal keeps working exactly as it does now.
--
-- Idempotent: safe to run more than once.
-- Reversible: nothing is dropped, nothing is deleted.
--
-- WHY THESE CHANGES
--   ISC_DIVIDEND_PLAN.md §12 (pool-based rate), §14 (ISC pays cash),
--   §17 (no reversal; settlement is a checklist), §20 (2026 backfill).
--
--   In short, three things changed after the 2026-09-06 build:
--     1. The cooperative allocates a POOL and the rate is derived from it.
--        The old model asked the bookkeeper to type a rate.
--     2. ISC pays CASH. It only becomes share capital if the member elects
--        that at the March General Assembly.
--     3. Reversal is discarded; a posting is deletable until it is settled.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. isc_postings — the pool becomes the primary input
-- -----------------------------------------------------------------------------
-- allocated_pool  the audited net surplus the General Assembly assigned to ISC.
--                 This is now what the bookkeeper enters (§12.1).
-- total_average   the sum of every member's average share capital -- rule 4's
--                 denominator. Stored so the rate is reproducible from the
--                 record alone, without re-running the calculation.
--
-- rate stays, but it is now DERIVED (pool / total_average) rather than typed.
-- -----------------------------------------------------------------------------
ALTER TABLE public.isc_postings
  ADD COLUMN IF NOT EXISTS allocated_pool numeric,
  ADD COLUMN IF NOT EXISTS total_average  numeric;

COMMENT ON COLUMN public.isc_postings.allocated_pool IS
  'Audited net surplus allocated to ISC by the General Assembly. The PRIMARY input (plan §12.1); rate is derived from it.';
COMMENT ON COLUMN public.isc_postings.total_average IS
  'Sum of every member average share capital (rule 4). Denominator of the derived rate; stored so the rate is reproducible.';


-- -----------------------------------------------------------------------------
-- 2. isc_postings — the rate CHECK must allow "not yet known"
-- -----------------------------------------------------------------------------
-- The original CHECK is (rate > 0 AND rate <= 100), with rate NOT NULL.
-- Under the pool model the rate cannot exist before the basis is computed, and
-- a preview with no pool has no rate at all. So rate becomes nullable, and the
-- CHECK now permits NULL while still rejecting a nonsense value.
--
-- Postgres names an unnamed table CHECK 'isc_postings_check', 'isc_postings_check1',
-- and so on, in declaration order. The rate check is the 4th, hence _check3.
-- Dropped defensively by exact name, then re-added under an explicit name so it
-- is never ambiguous again.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  c record;
BEGIN
  -- Find whichever unnamed CHECK constraint mentions "rate" and drop it.
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.isc_postings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%rate%'
      AND conname <> 'isc_postings_rate_valid'
  LOOP
    EXECUTE format('ALTER TABLE public.isc_postings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.isc_postings ALTER COLUMN rate DROP NOT NULL;

ALTER TABLE public.isc_postings
  DROP CONSTRAINT IF EXISTS isc_postings_rate_valid;
ALTER TABLE public.isc_postings
  ADD CONSTRAINT isc_postings_rate_valid
  CHECK (rate IS NULL OR (rate > 0 AND rate <= 100));


-- -----------------------------------------------------------------------------
-- 3. isc_postings — status gains 'settled', keeps 'reversed' for history
-- -----------------------------------------------------------------------------
-- §17.1 discards reversal, but the two 2026-09-06 rows already carry
-- status='reversed' and must remain readable. So 'reversed' stays VALID but is
-- never written again.
--
--   posted   -- payable recorded, nothing settled yet. Deletable (§17.1).
--   settled  -- the March checklist has been applied. Permanent.
--   reversed -- legacy only, from the pre-v2 build.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.isc_postings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND conname <> 'isc_postings_status_valid'
  LOOP
    EXECUTE format('ALTER TABLE public.isc_postings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.isc_postings
  DROP CONSTRAINT IF EXISTS isc_postings_status_valid;
ALTER TABLE public.isc_postings
  ADD CONSTRAINT isc_postings_status_valid
  CHECK (status IN ('posted', 'settled', 'reversed'));


-- -----------------------------------------------------------------------------
-- 4. isc_transactions — settlement state (§14.3, §17.2)
-- -----------------------------------------------------------------------------
-- A line item records what a member is OWED. How it was settled is a separate,
-- later fact decided at the March General Assembly:
--
--   unsettled   -- posted, not yet dealt with
--   cash        -- the member took the money
--   capitalised -- the member added it to share capital (a CBU row exists)
--
-- payout_unrounded and adjusted carry the audit trail for largest-remainder
-- centavo allocation (§12.3). Without them a one-centavo difference is
-- untraceable after the fact, which is the entire point of the amber dot.
-- -----------------------------------------------------------------------------
ALTER TABLE public.isc_transactions
  ADD COLUMN IF NOT EXISTS payout_unrounded   numeric,
  ADD COLUMN IF NOT EXISTS adjusted           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS settlement         text    NOT NULL DEFAULT 'unsettled',
  ADD COLUMN IF NOT EXISTS settled_at         timestamptz,
  ADD COLUMN IF NOT EXISTS settled_by         uuid,
  ADD COLUMN IF NOT EXISTS settled_by_email   text,
  ADD COLUMN IF NOT EXISTS capitalised_cbu_id uuid;

ALTER TABLE public.isc_transactions
  DROP CONSTRAINT IF EXISTS isc_transactions_settlement_valid;
ALTER TABLE public.isc_transactions
  ADD CONSTRAINT isc_transactions_settlement_valid
  CHECK (settlement IN ('unsettled', 'cash', 'capitalised'));

-- A capitalised row MUST point at the CBU row it created; the others must not.
ALTER TABLE public.isc_transactions
  DROP CONSTRAINT IF EXISTS isc_transactions_capitalised_has_cbu;
ALTER TABLE public.isc_transactions
  ADD CONSTRAINT isc_transactions_capitalised_has_cbu
  CHECK (
    (settlement =  'capitalised' AND capitalised_cbu_id IS NOT NULL)
    OR
    (settlement <> 'capitalised' AND capitalised_cbu_id IS NULL)
  );

ALTER TABLE public.isc_transactions
  ALTER COLUMN rate DROP NOT NULL;

COMMENT ON COLUMN public.isc_transactions.settlement IS
  'How the payout was settled: unsettled | cash | capitalised. Set by isc_settle_posting at the March GA (plan §17.2).';
COMMENT ON COLUMN public.isc_transactions.payout_unrounded IS
  'Payout before centavo reconciliation. Kept so an auditor can trace a one-centavo largest-remainder adjustment (plan §12.3).';
COMMENT ON COLUMN public.isc_transactions.adjusted IS
  'True when this row received a residual centavo from largest-remainder allocation (plan §12.3).';

-- The existing 2026-09-06 rows predate settlement. They belong to a reversed
-- posting and were never settled, so the 'unsettled' default is accurate.


-- -----------------------------------------------------------------------------
-- 5. capital_build_up — the backfill origin (§20.3)
-- -----------------------------------------------------------------------------
-- 2026 CBU history is mostly on paper: five of the nine months since the
-- December import have NO rows at all (§21, query G). The bookkeeper will type
-- them into the ledger grid, and every row they create must be tagged so it can
-- never be mistaken for a transaction the cashier actually processed.
--
-- UNIQUE, following the established source_* pattern (§4), so a double save
-- cannot create a duplicate movement.
-- -----------------------------------------------------------------------------
ALTER TABLE public.capital_build_up
  ADD COLUMN IF NOT EXISTS source_backfill_id uuid,
  ADD COLUMN IF NOT EXISTS backfilled_by      uuid,
  ADD COLUMN IF NOT EXISTS backfilled_at      timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS capital_build_up_source_backfill_id_key
  ON public.capital_build_up (source_backfill_id)
  WHERE source_backfill_id IS NOT NULL;

COMMENT ON COLUMN public.capital_build_up.source_backfill_id IS
  'Set when the row was typed in via the ISC backfill grid rather than processed live (plan §20.3). Tagged deposit_account = BACKFILL_2026.';


-- -----------------------------------------------------------------------------
-- 6. Indexes for the preview query
-- -----------------------------------------------------------------------------
-- The averaging walk reads capital_build_up per member per month-end, ordering
-- by transaction_date. At 263 members x 12 months that is the hot path.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS capital_build_up_member_date_idx
  ON public.capital_build_up (member_id, transaction_date);

CREATE INDEX IF NOT EXISTS isc_transactions_settlement_idx
  ON public.isc_transactions (isc_posting_id, settlement);

COMMIT;


-- =============================================================================
-- VERIFY — run this after the COMMIT above. Every row must say OK.
-- =============================================================================
SELECT 'isc_postings.allocated_pool'      AS item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name='isc_postings' AND column_name='allocated_pool')
            THEN 'OK' ELSE 'MISSING' END  AS status
UNION ALL SELECT 'isc_postings.total_average',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name='isc_postings' AND column_name='total_average')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'isc_postings.rate is nullable',
       CASE WHEN (SELECT is_nullable FROM information_schema.columns
                   WHERE table_name='isc_postings' AND column_name='rate') = 'YES'
            THEN 'OK' ELSE 'STILL NOT NULL' END
UNION ALL SELECT 'isc_transactions.settlement',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name='isc_transactions' AND column_name='settlement')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'isc_transactions.payout_unrounded',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name='isc_transactions' AND column_name='payout_unrounded')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'capital_build_up.source_backfill_id',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name='capital_build_up' AND column_name='source_backfill_id')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'existing rows untouched (816 expected)',
       (SELECT count(*)::text FROM public.capital_build_up)
UNION ALL SELECT 'existing line items default to unsettled',
       (SELECT count(*)::text || ' rows' FROM public.isc_transactions
         WHERE settlement = 'unsettled');
