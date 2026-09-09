-- =============================================================================
-- ISC CHECK 3 of 3  --  "Write these numbers down"
-- =============================================================================
-- Run this once, BEFORE any ISC changes, and keep the result.
--
-- After the rewrite you run it again. The numbers must be IDENTICAL. That is
-- how you prove the migration did not quietly move the cooperative's money.
--
-- Safe: reads only, changes nothing.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1  --  the headline numbers
-- -----------------------------------------------------------------------------
WITH real_members AS (
  SELECT DISTINCT member_id
  FROM public.capital_build_up
  WHERE deposit_account = 'historical_import_2025'
)
SELECT
  'Members brought in by the migration'                                AS item,
  (SELECT count(*)::text FROM real_members)                            AS value
UNION ALL SELECT
  'All their CBU rows (opening + everything since)',
  (SELECT count(*)::text FROM public.capital_build_up
     WHERE member_id IN (SELECT member_id FROM real_members))
UNION ALL SELECT
  'CBU rows in the whole table (incl. test accounts)',
  (SELECT count(*)::text FROM public.capital_build_up)
UNION ALL SELECT
  'Active members in the system',
  (SELECT count(*)::text FROM public.member
     WHERE lower(coalesce(member_status,'active')) = 'active')
UNION ALL SELECT
  'Opening balance total (the 2025-12-31 import)',
  (SELECT to_char(round(sum(capital_added),2), 'FM999,999,999.00')
     FROM public.capital_build_up
     WHERE deposit_account = 'historical_import_2025')
UNION ALL SELECT
  '>>> COOPERATIVE SHARE CAPITAL TODAY <<<',
  (SELECT to_char(round(sum(latest.ending_share_capital),2), 'FM999,999,999.00')
     FROM (
       SELECT DISTINCT ON (cbu.member_id) cbu.ending_share_capital
       FROM public.capital_build_up cbu
       WHERE cbu.member_id IN (SELECT member_id FROM real_members)
       ORDER BY cbu.member_id,
         cbu.transaction_date DESC,
         NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''), '^CBUD_0*',''),'')::integer DESC NULLS LAST,
         cbu.id DESC
     ) latest);


-- -----------------------------------------------------------------------------
-- PART 2  --  which months still need typing in (§20 backfill)
-- -----------------------------------------------------------------------------
-- Run on 2026-09-09 this showed FIVE empty months (Jan, Feb, Mar, Apr, Jun) and
-- only 2-5 members active in the months that had anything -- out of 258.
--
-- Until these gaps are filled, an "average" over Dec 2025 - Sep 2026 is really
-- just the December figure carried forward, which defeats the point of
-- averaging at all. Re-run this as backfilling progresses.
-- -----------------------------------------------------------------------------
WITH months AS (
  SELECT generate_series(
    DATE '2025-12-01',
    date_trunc('month', now())::date,
    interval '1 month'
  )::date AS month_start
)
SELECT
  to_char(mo.month_start, 'YYYY-Mon')                              AS month,
  count(cbu.id)                                                    AS movements,
  count(DISTINCT cbu.member_id)                                    AS members_touched,
  to_char(round(coalesce(sum(cbu.capital_added),0),2), 'FM999,999,999.00') AS amount,
  CASE
    WHEN count(cbu.id) = 0            THEN 'EMPTY - needs backfill'
    WHEN count(DISTINCT cbu.member_id) < 20 THEN 'sparse'
    ELSE 'ok'
  END                                                              AS status
FROM months mo
LEFT JOIN public.capital_build_up cbu
       ON date_trunc('month', cbu.transaction_date)::date = mo.month_start
      AND cbu.source_isc_id IS NULL
GROUP BY mo.month_start
ORDER BY mo.month_start;
