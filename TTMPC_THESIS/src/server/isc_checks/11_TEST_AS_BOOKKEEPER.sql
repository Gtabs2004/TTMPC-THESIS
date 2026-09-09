-- =============================================================================
-- ISC CHECK 11  --  Post / settle / delete, running AS a bookkeeper
-- =============================================================================
-- WHY THIS FILE EXISTS
--   The Supabase SQL editor connects as postgres/service_role. auth.uid() and
--   auth.email() are therefore NULL, has_portal_role() returns false, and
--   isc_post correctly refuses:
--
--     ERROR: Only a bookkeeper may post Interest on Share Capital.
--
--   That is the §5.4 guard working, not a bug. The fix is NOT to weaken the
--   guard -- it is to run the test as a real bookkeeper.
--
--   has_portal_role() matches on user_id, auth_user_id, OR EMAIL
--   (loan_form_policies.sql:240). Setting request.jwt.claims for the session
--   is enough to satisfy it, and changes no code.
--
-- *** THIS FILE WRITES. Run every part IN ORDER. Part 6 is the teardown. ***
-- =============================================================================


-- =============================================================================
-- PART 0  --  find a real bookkeeper account
-- =============================================================================
-- Copy the email AND the id from the row you get back -- parts 1-6 need them.
-- If this returns nothing, no bookkeeper exists and posting cannot be tested.
-- -----------------------------------------------------------------------------
SELECT
  ma.email,
  ma.auth_user_id,
  ma.user_id,
  ma.role
FROM public.member_account ma
WHERE lower(coalesce(ma.role, '')) = 'bookkeeper'
ORDER BY ma.email
LIMIT 5;


-- =============================================================================
-- PART 1  --  become that bookkeeper, then POST          *** WRITES ***
-- =============================================================================
-- Replace BOTH placeholders below with the values from PART 0, then run the
-- whole block. The SET is session-local: it lasts for this connection only and
-- is discarded when you disconnect.
--
-- Expect: one uuid returned.
-- -----------------------------------------------------------------------------
-- Filled in from PART 0, 2026-09-09. NOTE which id is used: auth_user_id,
-- NOT user_id. auth.uid() returns auth_user_id; user_id is a member row. That
-- distinction caused bugs 4 and 6 in the 2026-09-06 build (§0).
--   email        bookkeeper@gmail.com
--   auth_user_id e7e2ed14-1b67-4c55-a010-2911c0fc6bc3   <- this one
--   user_id      ccd0c723-2cf0-4926-950f-4c68357d08c1   <- NOT this one
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',   'e7e2ed14-1b67-4c55-a010-2911c0fc6bc3',
    'email', 'bookkeeper@gmail.com',
    'role',  'authenticated'
  )::text,
  false                      -- false = session-wide, survives to the next query
) IS NOT NULL AS claims_set;

-- Confirm the impersonation took effect before posting anything.
SELECT
  auth.uid()                                                    AS acting_uid,
  auth.email()                                                  AS acting_email,
  public.has_portal_role(auth.uid(), auth.email(), ARRAY['bookkeeper']) AS is_bookkeeper;
-- is_bookkeeper MUST be true before continuing. If it is false, the ids are
-- wrong -- do not proceed.

-- Now post.
SELECT public.isc_post('2026-01-01', '2026-12-01', 1000000.00) AS new_posting_id;


-- =============================================================================
-- PART 2  --  THE KEY TEST: did posting move any money?
-- =============================================================================
-- §14: posting records a PAYABLE and must touch no share capital at all.
--
--   CBU rows created by this posting   MUST BE 0
--   coop share capital                 MUST still be 29,678,787.77
-- -----------------------------------------------------------------------------
WITH latest AS (
  SELECT id FROM public.isc_postings ORDER BY posted_at DESC LIMIT 1
)
SELECT
  'line items created'                                          AS item,
  (SELECT count(*)::text FROM public.isc_transactions
     WHERE isc_posting_id = (SELECT id FROM latest))            AS value,
  'expect 265'                                                  AS expected
UNION ALL SELECT
  '>>> CBU rows created by posting <<<',
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
  'derived rate stored on the header',
  (SELECT round(rate, 4)::text FROM public.isc_postings WHERE id = (SELECT id FROM latest)),
  'pool / total average'
UNION ALL SELECT
  '>>> coop share capital NOW <<<',
  (SELECT to_char(round(sum(l.ending_share_capital),2), 'FM999,999,999.00') FROM (
     SELECT DISTINCT ON (cbu.member_id) cbu.ending_share_capital
     FROM public.capital_build_up cbu
     WHERE cbu.member_id IN (SELECT DISTINCT member_id FROM public.capital_build_up
                              WHERE deposit_account = 'historical_import_2025')
     ORDER BY cbu.member_id, cbu.transaction_date DESC,
       NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''),'^CBUD_0*',''),'')::integer DESC NULLS LAST,
       cbu.id DESC) l),
  '*** MUST BE 29,678,787.77 ***';


-- =============================================================================
-- PART 3  --  SETTLE: everyone capitalises except two    *** WRITES ***
-- =============================================================================
-- The March checklist. The two largest payouts are passed as the cash list.
--
-- Expect: capitalised_count 263, cash_count 2, totals summing to 1,000,000.00.
-- -----------------------------------------------------------------------------
WITH latest AS (
  SELECT id FROM public.isc_postings ORDER BY posted_at DESC LIMIT 1
),
cash_two AS (
  SELECT array_agg(member_id) AS ids
  FROM (SELECT member_id FROM public.isc_transactions
        WHERE isc_posting_id = (SELECT id FROM latest)
        ORDER BY interest_amount DESC LIMIT 2) t
)
SELECT * FROM public.isc_settle_posting(
  (SELECT id FROM latest), (SELECT ids FROM cash_two), current_date);


-- =============================================================================
-- PART 4  --  did settlement credit the RIGHT members?
-- =============================================================================
-- Capitalised rows must each own a CBU row. Cash rows must own none.
-- The coop total must rise by the CAPITALISED total only -- never the whole pool.
-- -----------------------------------------------------------------------------
WITH latest AS (
  SELECT id FROM public.isc_postings ORDER BY posted_at DESC LIMIT 1
)
SELECT
  t.settlement,
  count(*)                                              AS members,
  to_char(sum(t.interest_amount), 'FM999,999,999.00')   AS total,
  count(t.capitalised_cbu_id)                           AS cbu_rows,
  CASE
    WHEN t.settlement = 'capitalised' AND count(*) = count(t.capitalised_cbu_id)
      THEN 'PASS - every capitalised row has a CBU row'
    WHEN t.settlement = 'cash' AND count(t.capitalised_cbu_id) = 0
      THEN 'PASS - cash rows wrote no CBU'
    ELSE '*** CHECK THIS ***'
  END                                                   AS verdict
FROM public.isc_transactions t
WHERE t.isc_posting_id = (SELECT id FROM latest)
GROUP BY t.settlement;


-- =============================================================================
-- PART 5  --  is the CBU chain still intact?
-- =============================================================================
-- Settlement just wrote 263 rows. This is the §11.1 failure mode -- the one
-- that cost PHP 446,478 last time. It must still be zero.
-- -----------------------------------------------------------------------------
WITH ordered AS (
  SELECT
    starting_share_capital,
    lag(ending_share_capital) OVER (
      PARTITION BY member_id
      ORDER BY transaction_date,
        NULLIF(regexp_replace(coalesce(cbu_deposit_id,''),'^CBUD_0*',''),'')::integer NULLS FIRST,
        id
    ) AS previous_ending
  FROM public.capital_build_up
)
SELECT
  count(*)                                              AS rows_checked,
  count(*) FILTER (WHERE previous_ending IS NOT NULL
    AND round(starting_share_capital,2) <> round(previous_ending,2)) AS broken_links,
  CASE WHEN count(*) FILTER (WHERE previous_ending IS NOT NULL
    AND round(starting_share_capital,2) <> round(previous_ending,2)) = 0
       THEN 'PASS' ELSE '*** CHAIN BROKEN - STOP ***' END AS verdict
FROM ordered;


-- =============================================================================
-- PART 5b --  delete must now be REFUSED  (run on its own; MUST raise)
-- =============================================================================
-- Expect: "This posting has been settled (263 members). A settled posting is
-- permanent - correct it with a further posting instead."
-- -----------------------------------------------------------------------------
-- SELECT public.isc_delete_posting(
--   (SELECT id FROM public.isc_postings ORDER BY posted_at DESC LIMIT 1));


-- =============================================================================
-- PART 6  --  TEARDOWN -- DO NOT SKIP                    *** WRITES ***
-- =============================================================================
-- Returns the database to its pre-test state. A leftover test posting would
-- block a real one through the overlap constraint.
--
-- Steps 1-3 unwind the settlement by hand because isc_delete_posting rightly
-- refuses a settled posting. There is deliberately no such function in the app.
-- -----------------------------------------------------------------------------
BEGIN;

  DELETE FROM public.capital_build_up
  WHERE source_isc_id IN (
    SELECT t.id FROM public.isc_transactions t
    WHERE t.isc_posting_id = (SELECT id FROM public.isc_postings
                               ORDER BY posted_at DESC LIMIT 1));

  UPDATE public.isc_transactions
  SET settlement = 'unsettled', settled_at = NULL, settled_by = NULL,
      settled_by_email = NULL, capitalised_cbu_id = NULL
  WHERE isc_posting_id = (SELECT id FROM public.isc_postings
                           ORDER BY posted_at DESC LIMIT 1);

  UPDATE public.isc_postings SET status = 'posted'
  WHERE id = (SELECT id FROM public.isc_postings ORDER BY posted_at DESC LIMIT 1);

COMMIT;

SELECT public.isc_delete_posting(
  (SELECT id FROM public.isc_postings ORDER BY posted_at DESC LIMIT 1));


-- =============================================================================
-- PART 7  --  back to baseline?
-- =============================================================================
-- Every figure must match §22.6 exactly.
-- -----------------------------------------------------------------------------
SELECT
  'capital_build_up rows'                                       AS item,
  (SELECT count(*)::text FROM public.capital_build_up)          AS value,
  '816'                                                         AS baseline
UNION ALL SELECT
  'coop share capital',
  (SELECT to_char(round(sum(l.ending_share_capital),2), 'FM999,999,999.00') FROM (
     SELECT DISTINCT ON (cbu.member_id) cbu.ending_share_capital
     FROM public.capital_build_up cbu
     WHERE cbu.member_id IN (SELECT DISTINCT member_id FROM public.capital_build_up
                              WHERE deposit_account = 'historical_import_2025')
     ORDER BY cbu.member_id, cbu.transaction_date DESC,
       NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''),'^CBUD_0*',''),'')::integer DESC NULLS LAST,
       cbu.id DESC) l),
  '29,678,787.77'
UNION ALL SELECT
  'ISC postings',
  (SELECT count(*)::text FROM public.isc_postings),
  '2 (both Sep-6)'
UNION ALL SELECT
  'ISC line items',
  (SELECT count(*)::text FROM public.isc_transactions),
  '526';
