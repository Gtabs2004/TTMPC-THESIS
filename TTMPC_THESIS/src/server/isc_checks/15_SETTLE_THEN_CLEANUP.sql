-- =============================================================================
-- ISC CHECK 15  --  Settle the test posting, then remove it   *** WRITES ***
-- =============================================================================
-- Posting 66e154b4 (Jan-Dec 2026, 265 members, PHP 1,000,000) is currently a
-- payable: no share capital has moved. This exercises the other half.
--
-- RUN THE PARTS IN ORDER. PART 4 IS THE TEARDOWN -- DO NOT STOP BEFORE IT.
-- A leftover test posting would block a real Jan-Dec 2026 posting through the
-- overlap constraint.
--
-- Each part is ONE statement, because the Supabase editor may use a different
-- connection per query and impersonation is session-local (§22.9).
-- =============================================================================


-- =============================================================================
-- PART 1  --  SETTLE: everyone capitalises except the two largest  *** WRITES ***
-- =============================================================================
-- The March checklist (§17.2). Members default to CAPITALISE; the ids passed
-- are those taking CASH. Here that is the two biggest payouts, chosen only to
-- prove both paths work.
--
-- The effective date is deliberately in MARCH 2027 -- the assembly that settles
-- a Jan-Dec 2026 period meets in March of the FOLLOWING year (§23).
--
-- Expect: capitalised_count 263, cash_count 2, totals summing to 1,000,000.00.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_posting  uuid;
  v_cash     uuid[];
  v_result   record;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','e7e2ed14-1b67-4c55-a010-2911c0fc6bc3',
                      'email','bookkeeper@gmail.com','role','authenticated')::text, true);

  IF NOT public.has_portal_role(auth.uid(), auth.email(), ARRAY['bookkeeper']) THEN
    RAISE EXCEPTION 'Impersonation failed - nothing was settled.';
  END IF;

  SELECT id INTO v_posting FROM public.isc_postings
  WHERE reverses_posting_id IS NULL AND status <> 'reversed'
  ORDER BY posted_at DESC LIMIT 1;

  SELECT array_agg(member_id) INTO v_cash FROM (
    SELECT member_id FROM public.isc_transactions
    WHERE isc_posting_id = v_posting
    ORDER BY interest_amount DESC LIMIT 2) t;

  SELECT * INTO v_result
  FROM public.isc_settle_posting(v_posting, v_cash, DATE '2027-03-15');

  RAISE NOTICE 'capitalised % members (PHP %), cash % members (PHP %)',
    v_result.capitalised_count, v_result.capitalised_total,
    v_result.cash_count,        v_result.cash_total;
END $$;


-- =============================================================================
-- PART 2  --  did settlement credit the RIGHT members?  (read-only)
-- =============================================================================
-- Capitalised rows must each own exactly one CBU row. Cash rows must own none.
-- The coop total must rise by the CAPITALISED total only -- never the whole pool.
-- -----------------------------------------------------------------------------
WITH latest AS (
  SELECT id FROM public.isc_postings
  WHERE reverses_posting_id IS NULL AND status <> 'reversed'
  ORDER BY posted_at DESC LIMIT 1
)
SELECT
  t.settlement,
  count(*)                                                AS members,
  to_char(sum(t.interest_amount), 'FM999,999,999.00')     AS total,
  count(t.capitalised_cbu_id)                             AS cbu_rows,
  CASE
    WHEN t.settlement = 'capitalised' AND count(*) = count(t.capitalised_cbu_id)
      THEN 'PASS - every capitalised row has a CBU row'
    WHEN t.settlement = 'cash' AND count(t.capitalised_cbu_id) = 0
      THEN 'PASS - cash rows wrote no CBU'
    ELSE '*** CHECK THIS ***'
  END                                                     AS verdict
FROM public.isc_transactions t
WHERE t.isc_posting_id = (SELECT id FROM latest)
GROUP BY t.settlement
ORDER BY t.settlement;


-- =============================================================================
-- PART 3  --  is the CBU chain still intact?  (read-only)
-- =============================================================================
-- Settlement just wrote 263 rows dated 2027-03-15. This is the §11.1 failure
-- mode -- the one that cost PHP 446,478 last time. It must still be zero.
--
-- Also confirms the coop total rose by the CAPITALISED amount only.
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
  'CBU chain intact'                                      AS item,
  count(*) FILTER (WHERE previous_ending IS NOT NULL
    AND round(starting_share_capital,2) <> round(previous_ending,2))::text AS broken_links,
  CASE WHEN count(*) FILTER (WHERE previous_ending IS NOT NULL
    AND round(starting_share_capital,2) <> round(previous_ending,2)) = 0
       THEN 'PASS' ELSE '*** CHAIN BROKEN - STOP ***' END AS verdict
FROM ordered
UNION ALL
SELECT
  'coop share capital now',
  (SELECT to_char(round(sum(l.ending_share_capital),2), 'FM999,999,999.00') FROM (
     SELECT DISTINCT ON (cbu.member_id) cbu.ending_share_capital
     FROM public.capital_build_up cbu
     WHERE cbu.member_id IN (SELECT DISTINCT member_id FROM public.capital_build_up
                              WHERE deposit_account = 'historical_import_2025')
     ORDER BY cbu.member_id, cbu.transaction_date DESC,
       NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''),'^CBUD_0*',''),'')::integer DESC NULLS LAST,
       cbu.id DESC) l),
  'baseline 29,678,787.77 + the capitalised total'
UNION ALL
SELECT
  'capital_build_up rows',
  (SELECT count(*)::text FROM public.capital_build_up),
  '816 + 263 = 1079';


-- =============================================================================
-- PART 3b --  delete must now be REFUSED  (run alone; MUST raise an error)
-- =============================================================================
-- The posting is settled, so it is permanent (§17.1). Uncomment and run:
--
--   SELECT public.isc_delete_posting(
--     (SELECT id FROM public.isc_postings
--      WHERE reverses_posting_id IS NULL AND status <> 'reversed'
--      ORDER BY posted_at DESC LIMIT 1));
--
-- Expect: "This posting has been settled (263 members). A settled posting is
--          permanent - correct it with a further posting instead."
--
-- If it SUCCEEDS, the guard is broken -- say so before going further.


-- =============================================================================
-- PART 4  --  TEARDOWN -- DO NOT SKIP                    *** WRITES ***
-- =============================================================================
-- Unwinds the settlement by hand, then deletes the posting through the real
-- function. The manual unwind is necessary because isc_delete_posting rightly
-- refuses a settled posting; there is deliberately no such function in the app.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_posting uuid;
  v_removed integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','e7e2ed14-1b67-4c55-a010-2911c0fc6bc3',
                      'email','bookkeeper@gmail.com','role','authenticated')::text, true);

  SELECT id INTO v_posting FROM public.isc_postings
  WHERE reverses_posting_id IS NULL AND status <> 'reversed'
  ORDER BY posted_at DESC LIMIT 1;

  DELETE FROM public.capital_build_up
  WHERE source_isc_id IN (SELECT id FROM public.isc_transactions
                          WHERE isc_posting_id = v_posting);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  UPDATE public.isc_transactions
  SET settlement = 'unsettled', settled_at = NULL, settled_by = NULL,
      settled_by_email = NULL, capitalised_cbu_id = NULL
  WHERE isc_posting_id = v_posting;

  UPDATE public.isc_postings SET status = 'posted' WHERE id = v_posting;

  PERFORM public.isc_delete_posting(v_posting);

  RAISE NOTICE 'removed % CBU rows and deleted posting %', v_removed, v_posting;
END $$;


-- =============================================================================
-- PART 5  --  back to baseline?  (read-only)
-- =============================================================================
-- Every figure must match §22.6 exactly.
-- -----------------------------------------------------------------------------
SELECT
  'capital_build_up rows'                                 AS item,
  (SELECT count(*)::text FROM public.capital_build_up)    AS value,
  '816'                                                   AS baseline
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
