-- One-off manual deletion: removes ALL 3 remaining loans for Juan Dela Cruz
-- (TTMPC-295), as if none were ever applied for. Does NOT touch the member
-- account or member record.
--
-- Loans deleted:
--   - CL-20261016-3862 (Consolidated, ₱30,000) -- has 4 loan_schedules,
--     1 loan_payment, 1 capital_build_up entry (disbursed)
--   - EL-20261017-8139 (Emergency, ₱20,000) -- not yet disbursed, no child rows
--   - EL-20261016-3339 (Emergency, ₱20,000) -- not yet disbursed, no child rows
--
-- Deleting the capital_build_up row for CL-20261016-3862 fires
-- trg_capital_build_up_sync_member_shares, which automatically re-syncs
-- member.share_capital_amount / number_of_shares. No manual recompute needed.
--
-- Order matters: children before each parent loan row.

BEGIN;

DELETE FROM public.loan_payments WHERE loan_id IN ('CL-20261016-3862', 'EL-20261017-8139', 'EL-20261016-3339');
DELETE FROM public.loan_payments_legacy WHERE loan_id IN ('CL-20261016-3862', 'EL-20261017-8139', 'EL-20261016-3339');
DELETE FROM public.loan_penalties WHERE loan_id IN ('CL-20261016-3862', 'EL-20261017-8139', 'EL-20261016-3339');
DELETE FROM public.loan_schedules WHERE loan_id IN ('CL-20261016-3862', 'EL-20261017-8139', 'EL-20261016-3339');
DELETE FROM public.capital_build_up WHERE source_loan_id IN ('CL-20261016-3862', 'EL-20261017-8139', 'EL-20261016-3339');
DELETE FROM public.loan_notifications WHERE loan_id IN ('CL-20261016-3862', 'EL-20261017-8139', 'EL-20261016-3339');
DELETE FROM public.audit_log WHERE entity_id IN ('CL-20261016-3862', 'EL-20261017-8139', 'EL-20261016-3339');
DELETE FROM public.loans WHERE control_number IN ('CL-20261016-3862', 'EL-20261017-8139', 'EL-20261016-3339');

COMMIT;

-- Verify afterward (every row should return 0, and the member record at
-- TTMPC-295 should still exist):
--   SELECT control_number FROM loans WHERE member_id = 'a31c69ee-5fdb-4f3e-b940-541c0a97cedd';
--   -- Expect 0 rows.
--   SELECT membership_id, first_name, last_name FROM member WHERE membership_id = 'TTMPC-295';
--   -- Expect the member row, unchanged.
