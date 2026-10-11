-- =============================================================================
-- Receipts — Step 6 (CBU deposits) checks (READ-ONLY). See RECEIPT_SYSTEM_PLAN.md §12.3.
-- Changes nothing. One result set (check, value).
--
-- Goal: find a reliable rule for "this capital_build_up row is a deposit the
-- cashier recorded", as opposed to rows the system writes (loan CBU
-- deduction, membership paid-up capital, ISC, termination offsets) and
-- imported history.
-- =============================================================================

WITH cbu AS (
    SELECT c.*,
           a.actor_role AS audit_role,
           a.occurred_at AS audit_at
    FROM public.capital_build_up c
    LEFT JOIN LATERAL (
        SELECT al.actor_role, al.occurred_at
        FROM public.audit_log al
        WHERE al.entity_type = 'cbu'
          AND al.action = 'record'
          AND al.entity_id IN (c.cbu_deposit_id, c.id::text)
        ORDER BY al.occurred_at
        LIMIT 1
    ) a ON true
)
SELECT '01 total rows' AS check_name, count(*)::text AS value FROM cbu

UNION ALL
SELECT '02 rows by deposit_account (top 15)',
       string_agg(k || ': ' || n, ', ' ORDER BY cnt DESC)
FROM (SELECT coalesce(deposit_account, '(null)') k, count(*)::text n, count(*) cnt
      FROM cbu GROUP BY 1 ORDER BY 3 DESC LIMIT 15) x

UNION ALL
SELECT '03 rows with a source key (loan / membership payment / ISC)',
       'source_loan_id: ' || count(*) FILTER (WHERE source_loan_id IS NOT NULL)
       || ', source_payment_id: ' || count(*) FILTER (WHERE source_payment_id IS NOT NULL)
       || ', source_isc_id: ' || count(*) FILTER (WHERE (to_jsonb(cbu) ->> 'source_isc_id') IS NOT NULL)
FROM cbu

UNION ALL
SELECT '04 rows by audit actor_role (who inserted it)',
       string_agg(k || ': ' || n, ', ' ORDER BY k)
FROM (SELECT coalesce(nullif(lower(audit_role), ''), '(no audit row)') k, count(*)::text n
      FROM cbu GROUP BY 1) x

UNION ALL
SELECT '05 cashier-audited rows WITHOUT any source key, by deposit_account',
       coalesce(string_agg(k || ': ' || n, ', ' ORDER BY k), 'none')
FROM (SELECT coalesce(deposit_account, '(null)') k, count(*)::text n
      FROM cbu
      WHERE lower(coalesce(audit_role, '')) = 'cashier'
        AND source_loan_id IS NULL AND source_payment_id IS NULL
        AND (to_jsonb(cbu) ->> 'source_isc_id') IS NULL
      GROUP BY 1) x

UNION ALL
SELECT '06 cashier-audited, no source key, capital_added <= 0 (should be 0 for deposits)',
       count(*)::text
FROM cbu
WHERE lower(coalesce(audit_role, '')) = 'cashier'
  AND source_loan_id IS NULL AND source_payment_id IS NULL
  AND (to_jsonb(cbu) ->> 'source_isc_id') IS NULL
  AND coalesce(capital_added, 0) <= 0

UNION ALL
SELECT '07 sample of 5 newest cashier-audited deposits',
       coalesce(string_agg(s, ' | '), 'none')
FROM (SELECT coalesce(cbu_deposit_id, id::text) || ' · ' || transaction_date::text || ' · ₱' || capital_added::text
             || ' · ' || coalesce(deposit_account, '(null)') AS s
      FROM cbu
      WHERE lower(coalesce(audit_role, '')) = 'cashier'
        AND source_loan_id IS NULL AND source_payment_id IS NULL
        AND (to_jsonb(cbu) ->> 'source_isc_id') IS NULL
      ORDER BY audit_at DESC LIMIT 5) x

UNION ALL
SELECT '08 rows with NO audit row (likely imported), by deposit_account (top 10)',
       coalesce(string_agg(k || ': ' || n, ', ' ORDER BY cnt DESC), 'none')
FROM (SELECT coalesce(deposit_account, '(null)') k, count(*)::text n, count(*) cnt
      FROM cbu WHERE audit_role IS NULL GROUP BY 1 ORDER BY 3 DESC LIMIT 10) x

UNION ALL
SELECT '09 capital_build_up columns',
       string_agg(column_name || ':' || data_type, ', ' ORDER BY ordinal_position)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'capital_build_up'

UNION ALL
SELECT '10 triggers on capital_build_up',
       string_agg(DISTINCT trigger_name, ', ')
FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table = 'capital_build_up';
