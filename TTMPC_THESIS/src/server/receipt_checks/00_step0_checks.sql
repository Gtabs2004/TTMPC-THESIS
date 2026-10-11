-- =============================================================================
-- Receipts — Step 0 checks (READ-ONLY). See RECEIPT_SYSTEM_PLAN.md §12.1.
-- Changes nothing. Paste into Supabase → SQL Editor → Run, then copy the
-- whole result table back. Everything comes out as ONE result set
-- (check, value) because the SQL Editor only shows the last statement.
-- =============================================================================

WITH legacy_loans AS (
    SELECT DISTINCT loan_id FROM public.loan_payments_legacy
),
fee_gap AS (
    -- For released loans: principal - frozen fees - net_proceeds.
    -- A non-zero gap means something else (e.g. a renewal's old balance) was
    -- deducted and must be shown on the release receipt.
    SELECT
        l.control_number,
        COALESCE(l.principal_amount, l.loan_amount, 0)
          - COALESCE(l.service_fee, 0) - COALESCE(l.cbu_deduction, 0)
          - COALESCE(l.insurance_fee, 0) - COALESCE(l.notarial_fee, 0)
          - COALESCE(l.net_proceeds, 0) AS gap,
        l.net_proceeds,
        l.service_fee
    FROM public.loans l
    JOIN public.disbursement_confirmations d ON d.loan_id = l.control_number
)
SELECT '01 loan_payments by status' AS check_name,
       string_agg(s || ': ' || n, ', ' ORDER BY s) AS value
FROM (SELECT coalesce(confirmation_status, '(null)') s, count(*)::text n
      FROM public.loan_payments GROUP BY 1) x

UNION ALL
SELECT '02 loan_payments by entered_by_role',
       string_agg(s || ': ' || n, ', ' ORDER BY s)
FROM (SELECT coalesce(entered_by_role, '(null)') s, count(*)::text n
      FROM public.loan_payments GROUP BY 1) x

UNION ALL
SELECT '03 validated payments on loans that also have legacy history',
       count(*)::text
FROM public.loan_payments p
WHERE lower(coalesce(p.confirmation_status, '')) = 'validated'
  AND p.loan_id IN (SELECT loan_id FROM legacy_loans)

UNION ALL
SELECT '04 validated payments missing validated_by / reviewed_by',
       count(*)::text
FROM public.loan_payments p
WHERE lower(coalesce(p.confirmation_status, '')) = 'validated'
  AND p.validated_by IS NULL AND p.reviewed_by IS NULL

UNION ALL
SELECT '05 validated payments missing applied_to_* allocation',
       count(*)::text
FROM public.loan_payments p
WHERE lower(coalesce(p.confirmation_status, '')) = 'validated'
  AND p.applied_to_current IS NULL

UNION ALL
SELECT '06 disbursement_confirmations rows', count(*)::text
FROM public.disbursement_confirmations

UNION ALL
SELECT '07 released/paid loans WITHOUT a disbursement_confirmations row (non-legacy)',
       count(*)::text
FROM public.loans l
WHERE lower(coalesce(l.loan_status, '')) IN ('released', 'partially paid', 'fully paid', 'restructured', 'delinquent')
  AND l.control_number NOT IN (SELECT loan_id FROM legacy_loans)
  AND NOT EXISTS (SELECT 1 FROM public.disbursement_confirmations d WHERE d.loan_id = l.control_number)

UNION ALL
SELECT '08 released loans with NULL fee snapshot or net_proceeds',
       count(*)::text
FROM fee_gap WHERE net_proceeds IS NULL OR service_fee IS NULL

UNION ALL
SELECT '09 released loans where principal - fees <> net_proceeds (other deduction)',
       count(*)::text || ' (sample: ' ||
       coalesce(string_agg(control_number || ' gap ' || gap::text, '; ') FILTER (WHERE abs(gap) > 0.009), 'none') || ')'
FROM fee_gap WHERE abs(gap) > 0.009

UNION ALL
SELECT '10 raw_payload keys mentioning balance on released loans',
       coalesce(string_agg(DISTINCT k, ', '), 'none')
FROM public.loans l
JOIN public.disbursement_confirmations d ON d.loan_id = l.control_number,
LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(l.raw_payload) = 'object' THEN l.raw_payload ELSE '{}'::jsonb END) k
WHERE k ILIKE '%balance%' OR k ILIKE '%renew%' OR k ILIKE '%previous%' OR k ILIKE '%existing%'

UNION ALL
SELECT '11 triggers on loan_payments / disbursement_confirmations',
       string_agg(DISTINCT event_object_table || '.' || trigger_name, ', ')
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('loan_payments', 'disbursement_confirmations')

UNION ALL
SELECT '12 receipts table already exists?',
       CASE WHEN to_regclass('public.receipts') IS NULL THEN 'no' ELSE 'YES' END

UNION ALL
SELECT '13 pgcrypto installed (needed for snapshot hash)',
       coalesce((SELECT extversion FROM pg_extension WHERE extname = 'pgcrypto'), 'NOT installed')

UNION ALL
SELECT '14 staff role values in member_account',
       string_agg(r || ': ' || n, ', ' ORDER BY r)
FROM (SELECT coalesce(nullif(lower(role), ''), '(none)') r, count(*)::text n
      FROM public.member_account GROUP BY 1) x;
