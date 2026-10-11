-- =============================================================================
-- Receipts — Step 6a (CBU deposits) verification (READ-ONLY). RECEIPT_SYSTEM_PLAN.md §12.2g.
-- Run after receipts_04_cbu.sql and `SELECT * FROM public.receipts_backfill_cbu();`
-- =============================================================================

WITH dep AS (
    SELECT c.*,
           EXISTS (SELECT 1 FROM public.audit_log al
                   WHERE al.entity_type = 'cbu' AND al.action = 'record'
                     AND al.entity_id IN (c.cbu_deposit_id, c.id::text)) AS has_audit,
           EXISTS (SELECT 1 FROM public.receipts r
                   WHERE r.source_type = 'cbu' AND r.source_id = c.id::text) AS has_receipt
    FROM public.capital_build_up c
    WHERE public.receipt_is_cbu_deposit(c.deposit_account, c.capital_added, c.source_loan_id,
                                        c.source_payment_id, c.source_isc_id, c.source_backfill_id)
)
SELECT '01 cashier deposits (rule match)' AS check_name, count(*)::text AS value FROM dep

UNION ALL
SELECT '02 deposits WITH a receipt', count(*)::text FROM dep WHERE has_receipt

UNION ALL
SELECT '03 deposits recorded through the system WITHOUT a receipt (should be 0)',
       count(*)::text FROM dep WHERE has_audit AND NOT has_receipt

UNION ALL
SELECT '04 deposits with no audit row, skipped by the catch-up (possibly imported)',
       count(*)::text || ' (dates: ' || coalesce(min(transaction_date)::date::text, '-') || ' to '
       || coalesce(max(transaction_date)::date::text, '-') || ')'
FROM dep WHERE NOT has_audit AND NOT has_receipt

UNION ALL
SELECT '05 CBU receipts for rows that are NOT cashier deposits (should be 0)',
       count(*)::text
FROM public.receipts r
JOIN public.capital_build_up c ON c.id::text = r.source_id
WHERE r.source_type = 'cbu'
  AND NOT public.receipt_is_cbu_deposit(c.deposit_account, c.capital_added, c.source_loan_id,
                                        c.source_payment_id, c.source_isc_id, c.source_backfill_id)

UNION ALL
SELECT '06 receipts by type',
       string_agg(t || ': ' || n, ', ' ORDER BY t)
FROM (SELECT source_type t, count(*)::text n FROM public.receipts GROUP BY 1) x

UNION ALL
SELECT '07 receipt issue errors (cbu)',
       coalesce(string_agg(source_id || ': ' || left(error, 120), ' | '), 'none')
FROM (SELECT * FROM public.receipt_issue_errors WHERE source_type = 'cbu' ORDER BY occurred_at DESC LIMIT 5) e

UNION ALL
SELECT '08 newest CBU receipt',
       (SELECT receipt_no || ' · ' || (snapshot -> 'member' ->> 'name') || ' · ₱' || amount::text
               || ' · after ₱' || (snapshot -> 'breakdown' ->> 'share_capital_after')
               || ' · by ' || (snapshot -> 'reference' ->> 'received_by')
        FROM public.receipts WHERE source_type = 'cbu' ORDER BY issued_at DESC LIMIT 1);
