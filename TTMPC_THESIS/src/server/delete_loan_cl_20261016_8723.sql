-- One-off manual deletion: removes ALL data for loan CL-20261016-8723
-- (Juan Dela Cruz, ₱60,000 Consolidated, 12mo) as if it was never applied
-- for or disbursed. Does NOT touch the member account or member record --
-- only this one loan and everything that hangs off it.
--
-- Scope confirmed 2026-10-17:
--   - The loan record itself
--   - Its schedules (2 rows)
--   - Its payments (1 row)
--   - Its penalties (0 rows currently, included for completeness)
--   - The capital_build_up (CBU) entry created by its disbursement (1 row) --
--     deleting it fires trg_capital_build_up_sync_member_shares, which
--     automatically re-syncs member.share_capital_amount / number_of_shares
--     to the member's next-latest real CBU row. No manual recompute needed.
--   - Its audit_log entries (6 rows) and loan_notifications (7 rows), since
--     they reference a loan that will no longer exist.
--
-- Order matters: children before the parent loan row.

BEGIN;

DELETE FROM public.loan_payments WHERE loan_id = 'CL-20261016-8723';
DELETE FROM public.loan_payments_legacy WHERE loan_id = 'CL-20261016-8723';
DELETE FROM public.loan_penalties WHERE loan_id = 'CL-20261016-8723';
DELETE FROM public.loan_schedules WHERE loan_id = 'CL-20261016-8723';
DELETE FROM public.capital_build_up WHERE source_loan_id = 'CL-20261016-8723';
DELETE FROM public.loan_notifications WHERE loan_id = 'CL-20261016-8723';
DELETE FROM public.audit_log WHERE entity_id = 'CL-20261016-8723';
DELETE FROM public.loans WHERE control_number = 'CL-20261016-8723';

COMMIT;

-- Verify afterward (every row should return 0, and the member account/row
-- should still exist):
--   SELECT 'loans' t, count(*) FROM loans WHERE control_number = 'CL-20261016-8723'
--   UNION ALL SELECT 'loan_schedules', count(*) FROM loan_schedules WHERE loan_id = 'CL-20261016-8723'
--   UNION ALL SELECT 'loan_payments', count(*) FROM loan_payments WHERE loan_id = 'CL-20261016-8723'
--   UNION ALL SELECT 'capital_build_up', count(*) FROM capital_build_up WHERE source_loan_id = 'CL-20261016-8723';
