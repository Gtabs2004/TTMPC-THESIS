-- =============================================================================
-- ISC CHECK 9  --  Does post / settle / delete behave correctly?
-- =============================================================================
-- Run AFTER isc_v2_03_post_settle.sql.
--
-- UNLIKE EVERY EARLIER CHECK, THIS ONE WRITES.
--   Tests 3-7 create a real posting and then remove it again. Test 6 settles a
--   posting, which credits share capital -- it is the only step that touches
--   member balances, and it is undone in test 7.
--
--   Run them IN ORDER. Test 7 is the cleanup; do not stop before it.
--
-- Tests 1-2 are read-only and safe to run at any time.
-- =============================================================================


-- =============================================================================
-- TEST 1  --  did the old functions actually go?  (read-only)
-- =============================================================================
SELECT
  'isc_reverse removed'                                       AS item,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'isc_reverse'
  ) THEN 'PASS' ELSE '*** STILL PRESENT ***' END              AS verdict
UNION ALL SELECT
  'isc_post now takes a pool (3 args, last = allocated_pool)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'isc_post'
      AND pg_get_function_arguments(p.oid) ILIKE '%p_allocated_pool%'
  ) THEN 'PASS' ELSE '*** OLD SIGNATURE ***' END
UNION ALL SELECT
  'isc_settle_posting exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'isc_settle_posting')
       THEN 'PASS' ELSE 'MISSING' END
UNION ALL SELECT
  'isc_delete_posting exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'isc_delete_posting')
       THEN 'PASS' ELSE 'MISSING' END
UNION ALL SELECT
  'only ONE isc_post overload',
  CASE WHEN (SELECT count(*) FROM pg_proc WHERE proname = 'isc_post') = 1
       THEN 'PASS' ELSE '*** MORE THAN ONE - a caller could hit the wrong one ***' END;


-- =============================================================================
-- TEST 2  --  the Sep-6 history is still intact  (read-only)
-- =============================================================================
-- The old posting and its reversal must survive the migration untouched. They
-- net to zero, so they neither owe anyone money nor affect anyone's basis.
-- -----------------------------------------------------------------------------
SELECT
  status,
  count(*)                                                    AS postings,
  to_char(sum(total_interest), 'FM999,999,999.00')            AS total_interest,
  min(posted_at)::date                                        AS posted_on
FROM public.isc_postings
GROUP BY status
ORDER BY status;


-- =============================================================================
-- TEST 3  --  POST a real distribution                       *** WRITES ***
-- =============================================================================
-- Creates a posting for Jan-Dec 2026 with a PHP 1,000,000 pool.
--
-- COPY THE RETURNED UUID -- tests 4-7 need it.
--
-- Expect: one uuid returned, and NO new capital_build_up rows (test 4 proves
-- that). If this raises "Only a bookkeeper may post", you are signed in as the
-- wrong role -- the guard is working, use a bookkeeper account.
-- -----------------------------------------------------------------------------
SELECT public.isc_post('2026-01-01', '2026-12-01', 1000000.00) AS new_posting_id;


-- =============================================================================
-- TEST 4  --  did posting move any money?  (it must NOT)     *** the key test ***
-- =============================================================================
-- §14: posting records a PAYABLE. Share capital must be untouched until the
-- member elects to capitalise at the March assembly.
--
-- Compare coop_total_now against the baseline you captured before migrating.
-- They must be IDENTICAL.
-- -----------------------------------------------------------------------------
WITH latest AS (
  SELECT id FROM public.isc_postings ORDER BY posted_at DESC LIMIT 1
)
SELECT
  'line items created'                                        AS item,
  (SELECT count(*)::text FROM public.isc_transactions
     WHERE isc_posting_id = (SELECT id FROM latest))          AS value,
  'expect 265'                                                AS expected
UNION ALL SELECT
  'CBU rows created by this posting',
  (SELECT count(*)::text FROM public.capital_build_up cbu
     JOIN public.isc_transactions t ON t.id = cbu.source_isc_id
    WHERE t.isc_posting_id = (SELECT id FROM latest)),
  '*** MUST BE 0 ***'
UNION ALL SELECT
  'all line items unsettled',
  (SELECT count(*)::text FROM public.isc_transactions
     WHERE isc_posting_id = (SELECT id FROM latest) AND settlement = 'unsettled'),
  'expect 265'
UNION ALL SELECT
  'payouts total the pool exactly (rule 7)',
  (SELECT to_char(sum(interest_amount), 'FM999,999,999.00')
     FROM public.isc_transactions WHERE isc_posting_id = (SELECT id FROM latest)),
  'expect 1,000,000.00'
UNION ALL SELECT
  'coop share capital NOW',
  (SELECT to_char(sum(l.ending_share_capital), 'FM999,999,999.00') FROM (
     SELECT DISTINCT ON (cbu.member_id) cbu.ending_share_capital
     FROM public.capital_build_up cbu
     ORDER BY cbu.member_id, cbu.transaction_date DESC,
       NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''),'^CBUD_0*',''),'')::integer DESC NULLS LAST,
       cbu.id DESC) l),
  'MUST equal your pre-migration baseline';


-- =============================================================================
-- TEST 5  --  guards refuse bad input                        (each MUST error)
-- =============================================================================
-- Run these ONE AT A TIME. Each should raise, not return rows.
-- -----------------------------------------------------------------------------
-- Expect "An allocated pool greater than zero is required":
--   SELECT public.isc_post('2026-01-01','2026-12-01', NULL);
--   SELECT public.isc_post('2026-01-01','2026-12-01', 0);
--
-- Expect "cannot start before December 2025":
--   SELECT public.isc_post('2025-01-01','2026-12-01', 1000000);
--
-- Expect the EXCLUDE constraint to reject an overlapping period
-- ("conflicting key value violates exclusion constraint"):
--   SELECT public.isc_post('2026-06-01','2026-12-01', 500000);


-- =============================================================================
-- TEST 6  --  SETTLE the posting                             *** WRITES ***
-- =============================================================================
-- Applies the March checklist. Everyone capitalises EXCEPT the two members
-- passed in the cash list, which is built here from the two largest payouts.
--
-- THIS CREDITS SHARE CAPITAL. Test 7 undoes it.
--
-- Expect: capitalised_count 263, cash_count 2, and the two totals summing to
-- PHP 1,000,000.00.
-- -----------------------------------------------------------------------------
WITH latest AS (
  SELECT id FROM public.isc_postings ORDER BY posted_at DESC LIMIT 1
),
cash_two AS (
  SELECT array_agg(member_id) AS ids
  FROM (
    SELECT member_id FROM public.isc_transactions
    WHERE isc_posting_id = (SELECT id FROM latest)
    ORDER BY interest_amount DESC
    LIMIT 2
  ) t
)
SELECT * FROM public.isc_settle_posting(
  (SELECT id FROM latest),
  (SELECT ids FROM cash_two),
  current_date
);


-- =============================================================================
-- TEST 6b --  did settlement move the RIGHT money?
-- =============================================================================
-- Only the capitalised members should have gained share capital. The two cash
-- members must be unchanged, and the coop total must have risen by exactly the
-- capitalised total -- NOT by the whole pool.
-- -----------------------------------------------------------------------------
WITH latest AS (
  SELECT id FROM public.isc_postings ORDER BY posted_at DESC LIMIT 1
)
SELECT
  t.settlement,
  count(*)                                                    AS members,
  to_char(sum(t.interest_amount), 'FM999,999,999.00')         AS total,
  count(t.capitalised_cbu_id)                                 AS cbu_rows_written,
  CASE
    WHEN t.settlement = 'capitalised' AND count(*) = count(t.capitalised_cbu_id)
      THEN 'PASS - every capitalised row has a CBU row'
    WHEN t.settlement = 'cash' AND count(t.capitalised_cbu_id) = 0
      THEN 'PASS - cash rows wrote no CBU'
    ELSE '*** CHECK THIS ***'
  END                                                         AS verdict
FROM public.isc_transactions t
WHERE t.isc_posting_id = (SELECT id FROM latest)
GROUP BY t.settlement;


-- =============================================================================
-- TEST 6c --  is the CBU chain still intact after settlement?
-- =============================================================================
-- Settlement wrote 263 new rows. Re-run the check that matters most (§11.1):
-- every row must start where the previous one ended.
-- -----------------------------------------------------------------------------
WITH ordered AS (
  SELECT
    member_id, starting_share_capital,
    lag(ending_share_capital) OVER (
      PARTITION BY member_id
      ORDER BY transaction_date,
        NULLIF(regexp_replace(coalesce(cbu_deposit_id,''),'^CBUD_0*',''),'')::integer NULLS FIRST,
        id
    ) AS previous_ending
  FROM public.capital_build_up
)
SELECT
  count(*)                                                    AS rows_checked,
  count(*) FILTER (WHERE previous_ending IS NOT NULL
                     AND round(starting_share_capital,2) <> round(previous_ending,2)) AS broken_links,
  CASE WHEN count(*) FILTER (WHERE previous_ending IS NOT NULL
                     AND round(starting_share_capital,2) <> round(previous_ending,2)) = 0
       THEN 'PASS' ELSE '*** CHAIN BROKEN - DO NOT PROCEED ***' END AS verdict
FROM ordered;


-- =============================================================================
-- TEST 6d --  delete must now be REFUSED
-- =============================================================================
-- The posting is settled, so it is permanent (§17.1). This MUST raise
-- "This posting has been settled ... correct it with a further posting instead."
-- -----------------------------------------------------------------------------
-- SELECT public.isc_delete_posting(
--   (SELECT id FROM public.isc_postings ORDER BY posted_at DESC LIMIT 1));


-- =============================================================================
-- TEST 7  --  CLEAN UP                                       *** WRITES ***
-- =============================================================================
-- Removes the test posting and the share capital it credited, returning the
-- database to its pre-test state.
--
-- isc_delete_posting will REFUSE a settled posting (that is test 6d), so the
-- settlement is unwound first. This is a TEST-ONLY teardown -- there is
-- deliberately no such function in the application.
--
-- Run all three statements together.
-- -----------------------------------------------------------------------------
BEGIN;

  -- 1. remove the CBU rows settlement created
  DELETE FROM public.capital_build_up
  WHERE source_isc_id IN (
    SELECT t.id FROM public.isc_transactions t
    WHERE t.isc_posting_id = (SELECT id FROM public.isc_postings
                               ORDER BY posted_at DESC LIMIT 1)
  );

  -- 2. return the line items to unsettled
  UPDATE public.isc_transactions
  SET settlement = 'unsettled', settled_at = NULL, settled_by = NULL,
      settled_by_email = NULL, capitalised_cbu_id = NULL
  WHERE isc_posting_id = (SELECT id FROM public.isc_postings
                           ORDER BY posted_at DESC LIMIT 1);

  UPDATE public.isc_postings SET status = 'posted'
  WHERE id = (SELECT id FROM public.isc_postings ORDER BY posted_at DESC LIMIT 1);

COMMIT;

-- 3. now the real function will accept it
SELECT public.isc_delete_posting(
  (SELECT id FROM public.isc_postings ORDER BY posted_at DESC LIMIT 1));


-- =============================================================================
-- TEST 8  --  back to baseline?
-- =============================================================================
-- The final proof. Every number must match what you captured BEFORE migrating.
-- -----------------------------------------------------------------------------
SELECT
  'capital_build_up rows'                                     AS item,
  (SELECT count(*)::text FROM public.capital_build_up)        AS value
UNION ALL SELECT
  'coop share capital total',
  (SELECT to_char(sum(l.ending_share_capital), 'FM999,999,999.00') FROM (
     SELECT DISTINCT ON (cbu.member_id) cbu.ending_share_capital
     FROM public.capital_build_up cbu
     ORDER BY cbu.member_id, cbu.transaction_date DESC,
       NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''),'^CBUD_0*',''),'')::integer DESC NULLS LAST,
       cbu.id DESC) l)
UNION ALL SELECT
  'ISC postings remaining (expect only the 2 from Sep-6)',
  (SELECT count(*)::text FROM public.isc_postings)
UNION ALL SELECT
  'ISC line items remaining (expect 526)',
  (SELECT count(*)::text FROM public.isc_transactions);
