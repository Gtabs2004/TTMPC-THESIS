-- =============================================================================
-- ISC CHECK 10  --  Did the migration land?   (READ-ONLY)
-- =============================================================================
-- Run this after isc_v2_03_post_settle.sql.
--
-- "Only a bookkeeper may post Interest on Share Capital" from the SQL editor is
-- NOT a failure. The editor connects as postgres/service_role, so auth.uid()
-- is NULL and has_portal_role() correctly refuses. The guard is doing its job
-- (plan §5.4) -- it just means the SQL editor cannot post, by design.
--
-- Safe: reads only.
-- =============================================================================

SELECT
  'isc_reverse REMOVED'                                          AS item,
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'isc_reverse')
       THEN 'PASS' ELSE '*** STILL PRESENT ***' END              AS verdict
UNION ALL SELECT
  'isc_post takes a POOL (not a rate)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'isc_post'
      AND pg_get_function_arguments(p.oid) ILIKE '%p_allocated_pool%'
  ) THEN 'PASS' ELSE '*** OLD SIGNATURE ***' END
UNION ALL SELECT
  'exactly ONE isc_post (no stale overload)',
  CASE WHEN (SELECT count(*) FROM pg_proc WHERE proname = 'isc_post') = 1
       THEN 'PASS' ELSE '*** ' || (SELECT count(*)::text FROM pg_proc WHERE proname='isc_post')
            || ' OVERLOADS - a caller could hit the wrong one ***' END
UNION ALL SELECT
  'isc_settle_posting created',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'isc_settle_posting')
       THEN 'PASS' ELSE 'MISSING' END
UNION ALL SELECT
  'isc_delete_posting created',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'isc_delete_posting')
       THEN 'PASS' ELSE 'MISSING' END
UNION ALL SELECT
  'isc_calculate_preview takes a POOL',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'isc_calculate_preview'
      AND pg_get_function_arguments(p.oid) ILIKE '%p_allocated_pool%'
  ) THEN 'PASS' ELSE '*** OLD SIGNATURE ***' END
UNION ALL SELECT
  'overlap constraint excludes only reversed rows',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'isc_postings_no_overlap'
      AND pg_get_constraintdef(oid) ILIKE '%reversed%'
  ) THEN 'PASS' ELSE 'CHECK MANUALLY' END
UNION ALL SELECT
  '--- nothing moved ---', ''
UNION ALL SELECT
  'capital_build_up rows (baseline 816)',
  (SELECT count(*)::text FROM public.capital_build_up)
UNION ALL SELECT
  'coop share capital (baseline 29,678,787.77)',
  (SELECT to_char(round(sum(l.ending_share_capital),2), 'FM999,999,999.00') FROM (
     SELECT DISTINCT ON (cbu.member_id) cbu.ending_share_capital
     FROM public.capital_build_up cbu
     WHERE cbu.member_id IN (SELECT DISTINCT member_id FROM public.capital_build_up
                              WHERE deposit_account = 'historical_import_2025')
     ORDER BY cbu.member_id, cbu.transaction_date DESC,
       NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''),'^CBUD_0*',''),'')::integer DESC NULLS LAST,
       cbu.id DESC) l)
UNION ALL SELECT
  'ISC postings (expect 2, both from Sep-6)',
  (SELECT count(*)::text FROM public.isc_postings)
UNION ALL SELECT
  'ISC line items (expect 526)',
  (SELECT count(*)::text FROM public.isc_transactions);
