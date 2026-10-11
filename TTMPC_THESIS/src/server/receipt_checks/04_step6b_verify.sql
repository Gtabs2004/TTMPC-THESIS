-- =============================================================================
-- Receipts — Step 6b/7 verification (READ-ONLY). RECEIPT_SYSTEM_PLAN.md §12.2h.
-- Run after receipts_05_more_types.sql, receipts_06_audit.sql and
-- `SELECT * FROM public.receipts_backfill_more();`
-- =============================================================================

SELECT '01 receipts by type' AS check_name,
       string_agg(t || ': ' || n, ', ' ORDER BY t) AS value
FROM (SELECT source_type t, count(*)::text n FROM public.receipts GROUP BY 1) x

UNION ALL
SELECT '02 completed savings transactions WITHOUT a receipt (should be 0)',
       count(*)::text
FROM public.savings_ledger e
WHERE public.receipt_is_savings_entry(e.reference, e.source)
  AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.source_type = 'savings' AND r.source_id = e.reference)

UNION ALL
SELECT '03 savings withdrawals still pending WITH a receipt (should be 0)',
       count(*)::text
FROM public.savings_transaction_queue q
JOIN public.receipts r ON r.source_type = 'savings' AND r.source_id = q.transaction_id
WHERE lower(coalesce(q.transaction_status, '')) NOT IN ('validated', 'posted', 'completed')

UNION ALL
SELECT '04 paid membership fees WITHOUT a receipt (should be 0)',
       count(*)::text
FROM public.membership_payments p
WHERE lower(coalesce(p.payment_status, '')) = 'paid'
  AND coalesce(p.payment_id, '') ~ '^TTMPC(MF|PC)-'
  AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.source_type = 'membership_payment' AND r.source_id = p.payment_id)

UNION ALL
SELECT '05 membership-fee receipts still without an owner (applicant not yet a member)',
       count(*)::text
FROM public.receipts WHERE source_type = 'membership_payment' AND member_id IS NULL

UNION ALL
SELECT '06 CBU exit payouts WITHOUT a receipt (should be 0)',
       count(*)::text
FROM public.cbu_payouts p
WHERE p.kind = 'payout'
  AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.source_type = 'cbu_payout' AND r.source_id = p.id::text)

UNION ALL
SELECT '07 settled ISC lines WITHOUT a receipt (should be 0)',
       count(*)::text
FROM public.isc_transactions t
WHERE t.settlement IN ('capitalised', 'cash') AND coalesce(t.interest_amount, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.source_type = 'isc' AND r.source_id = t.id::text)

UNION ALL
SELECT '08 completed POS grocery purchases WITHOUT a receipt (should be 0)',
       count(*)::text
FROM public."GROCERY_TRANSACTIONS" g
WHERE g."Status" = 'Completed' AND g.event_id IS NOT NULL AND coalesce(g."GroceryAmount", 0) > 0
  AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.source_type = 'grocery' AND r.source_id = g."GroceryID")

UNION ALL
SELECT '09 grocery rows skipped (no POS event_id — likely imported)',
       count(*)::text
FROM public."GROCERY_TRANSACTIONS" g WHERE g.event_id IS NULL

UNION ALL
SELECT '10 duplicate receipt numbers (should be 0)',
       count(*)::text
FROM (SELECT receipt_no FROM public.receipts GROUP BY 1 HAVING count(*) > 1) x

UNION ALL
SELECT '11 hash mismatches (should be 0)',
       count(*)::text
FROM public.receipts WHERE snapshot_hash <> encode(digest(snapshot::text, 'sha256'), 'hex')

UNION ALL
SELECT '12 receipt issue errors (newest 5)',
       coalesce(string_agg(source_type || ' ' || source_id || ': ' || left(error, 100), ' | '), 'none')
FROM (SELECT * FROM public.receipt_issue_errors ORDER BY occurred_at DESC LIMIT 5) e

UNION ALL
SELECT '13 audit_log allows receipt / view',
       (SELECT string_agg(conname || ': ' || CASE WHEN pg_get_constraintdef(oid) ~ '''(receipt|view)''' THEN 'yes' ELSE 'NO' END, ', ')
        FROM pg_constraint WHERE conrelid = 'public.audit_log'::regclass AND contype = 'c'
          AND conname IN ('audit_log_entity_type_check', 'audit_log_action_check'));
