-- =============================================================================
-- ISC CHECK 14  --  THE KEY TEST: did posting move any money?   (READ-ONLY)
-- =============================================================================
-- Posting 66e154b4 was created: Jan-Dec 2026, 265 members, PHP 1,000,000 pool,
-- derived rate 3.33%.
--
-- §14 says posting records a PAYABLE and nothing more. Share capital must not
-- move until a member ELECTS to capitalise at the March General Assembly.
--
-- The old (Sep-6) isc_post credited every member automatically. If this shows
-- any CBU rows, that behaviour survived the migration and §14 is not done.
--
-- Safe: reads only.
-- =============================================================================

WITH latest AS (
  SELECT id FROM public.isc_postings
  WHERE reverses_posting_id IS NULL AND status <> 'reversed'
  ORDER BY posted_at DESC LIMIT 1
)
SELECT
  '>>> CBU rows created by this posting <<<'                     AS item,
  (SELECT count(*)::text FROM public.capital_build_up cbu
     JOIN public.isc_transactions t ON t.id = cbu.source_isc_id
    WHERE t.isc_posting_id = (SELECT id FROM latest))            AS value,
  '*** MUST BE 0 ***'                                            AS expected
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
  '*** MUST BE 29,678,787.77 ***'
UNION ALL SELECT
  'capital_build_up rows',
  (SELECT count(*)::text FROM public.capital_build_up),
  'must still be 816'
UNION ALL SELECT
  '--- the payable itself ---', '', ''
UNION ALL SELECT
  'line items created',
  (SELECT count(*)::text FROM public.isc_transactions
     WHERE isc_posting_id = (SELECT id FROM latest)),
  '265'
UNION ALL SELECT
  'all of them unsettled',
  (SELECT count(*)::text FROM public.isc_transactions
     WHERE isc_posting_id = (SELECT id FROM latest) AND settlement = 'unsettled'),
  '265 - nobody has been paid yet'
UNION ALL SELECT
  'payouts sum to the pool exactly (rule 7)',
  (SELECT to_char(sum(interest_amount), 'FM999,999,999.00')
     FROM public.isc_transactions WHERE isc_posting_id = (SELECT id FROM latest)),
  '1,000,000.00'
UNION ALL SELECT
  'rows that got a residual centavo',
  (SELECT count(*)::text FROM public.isc_transactions
     WHERE isc_posting_id = (SELECT id FROM latest) AND adjusted),
  'a hundred or so is normal'
UNION ALL SELECT
  'unrounded payouts kept for audit',
  (SELECT count(*)::text FROM public.isc_transactions
     WHERE isc_posting_id = (SELECT id FROM latest) AND payout_unrounded IS NOT NULL),
  '265 - lets an auditor trace a centavo';
