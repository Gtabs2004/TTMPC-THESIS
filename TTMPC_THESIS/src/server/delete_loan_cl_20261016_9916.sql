-- One-off manual deletion: removes loan CL-20261016-9916 (Juan Dela Cruz,
-- ₱60,000 Consolidated, 12mo) as if it was never applied for. Does NOT touch
-- the member account or member record -- only this one loan and everything
-- that hangs off it.
--
-- Checked 2026-10-17 before writing this: this loan has 0 loan_schedules,
-- 0 loan_payments, 0 loan_payments_legacy, 0 capital_build_up rows, and
-- 0 loan_penalties -- it was never disbursed, so there is no CBU entry to
-- reverse and no member share-capital resync to worry about. Only
-- audit_log (6 rows) and loan_notifications (8 rows) reference it.
--
-- Order matters: children before the parent loan row (included even where
-- the count is 0, so this script is safe to reuse if that ever changes).

BEGIN;

DELETE FROM public.loan_payments WHERE loan_id = 'CL-20261016-9916';
DELETE FROM public.loan_payments_legacy WHERE loan_id = 'CL-20261016-9916';
DELETE FROM public.loan_penalties WHERE loan_id = 'CL-20261016-9916';
DELETE FROM public.loan_schedules WHERE loan_id = 'CL-20261016-9916';
DELETE FROM public.capital_build_up WHERE source_loan_id = 'CL-20261016-9916';
DELETE FROM public.loan_notifications WHERE loan_id = 'CL-20261016-9916';
DELETE FROM public.audit_log WHERE entity_id = 'CL-20261016-9916';
DELETE FROM public.loans WHERE control_number = 'CL-20261016-9916';

COMMIT;

-- Verify afterward (every row should return 0, and the member account/row
-- should still exist):
--   SELECT 'loans' t, count(*) FROM loans WHERE control_number = 'CL-20261016-9916'
--   UNION ALL SELECT 'loan_notifications', count(*) FROM loan_notifications WHERE loan_id = 'CL-20261016-9916'
--   UNION ALL SELECT 'audit_log', count(*) FROM audit_log WHERE entity_id = 'CL-20261016-9916';
