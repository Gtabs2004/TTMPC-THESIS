-- =============================================================================
-- Receipts — Step 1 verification (READ-ONLY). See RECEIPT_SYSTEM_PLAN.md §12.2.
-- Run after receipts_01 / 02 / 03 and `SELECT * FROM public.receipts_backfill();`
-- One result set (check, value).
-- =============================================================================

SELECT '01 receipts by type' AS check_name,
       coalesce(string_agg(t || ': ' || n, ', ' ORDER BY t), 'none') AS value
FROM (SELECT source_type t, count(*)::text n FROM public.receipts GROUP BY 1) x

UNION ALL
SELECT '02 validated loan payments WITHOUT a receipt (should be 0)',
       count(*)::text
FROM public.loan_payments p
WHERE lower(coalesce(p.confirmation_status, '')) IN ('validated', 'confirmed', 'bookkeeper_confirmed', 'approved')
  AND NOT EXISTS (SELECT 1 FROM public.loan_payments_legacy lp WHERE lp.loan_id = p.loan_id)
  AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.source_type = 'loan_payment' AND r.source_id = p.id::text)

UNION ALL
SELECT '03 pending / rejected payments WITH a receipt (should be 0)',
       count(*)::text
FROM public.loan_payments p
JOIN public.receipts r ON r.source_type = 'loan_payment' AND r.source_id = p.id::text
WHERE lower(coalesce(p.confirmation_status, '')) IN ('pending_bookkeeper', 'rejected')

UNION ALL
SELECT '04 releases WITHOUT a receipt (should be 0)',
       count(*)::text
FROM public.disbursement_confirmations d
WHERE NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.source_type = 'loan_release' AND r.source_id = d.id::text)

UNION ALL
SELECT '05 duplicate receipt numbers (should be 0)',
       count(*)::text
FROM (SELECT receipt_no FROM public.receipts GROUP BY 1 HAVING count(*) > 1) x

UNION ALL
SELECT '06 receipts with no owner (member_id NULL)',
       count(*)::text
FROM public.receipts WHERE member_id IS NULL

UNION ALL
SELECT '07 hash check: receipts whose snapshot no longer matches its hash (should be 0)',
       count(*)::text
FROM public.receipts
WHERE snapshot_hash <> encode(digest(snapshot::text, 'sha256'), 'hex')

UNION ALL
SELECT '08 receipt issue errors logged',
       coalesce(string_agg(source_type || ' ' || source_id || ': ' || left(error, 120), ' | '), 'none')
FROM (SELECT * FROM public.receipt_issue_errors ORDER BY occurred_at DESC LIMIT 5) e

UNION ALL
SELECT '09 counter',
       coalesce(string_agg(year::text || ' → ' || last_no::text, ', '), 'none')
FROM public.receipt_counters

UNION ALL
SELECT '10 sample payment receipt',
       (SELECT receipt_no || ' · ' || (snapshot -> 'member' ->> 'name') || ' · ₱' || amount::text
               || ' · balance ₱' || (snapshot -> 'breakdown' ->> 'remaining_balance')
        FROM public.receipts WHERE source_type = 'loan_payment' ORDER BY issued_at DESC LIMIT 1)

UNION ALL
SELECT '11 sample release receipt',
       (SELECT receipt_no || ' · ' || (snapshot -> 'member' ->> 'name') || ' · ₱' || amount::text
               || ' · breakdown recorded: ' || (snapshot -> 'breakdown' ->> 'recorded')
        FROM public.receipts WHERE source_type = 'loan_release' ORDER BY issued_at DESC LIMIT 1);
