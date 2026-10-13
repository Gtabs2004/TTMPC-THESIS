-- SOA test scenarios -- rollback (LIVE database).
-- Removes ONLY rows tied to the three TESTSOA-* loans, including anything the
-- app created for them during testing (new schedule rows, cashier payments,
-- penalties, ledger rows, receipts, restructure requests).
--
-- Run R0 first and read it. Then run the BEGIN ... COMMIT block.
--
-- NOT removed (by design):
--   * audit_log rows -- the audit trail is append-only; they stay, tagged with
--     the TESTSOA control numbers, so the history of the test is explainable.
--   * A RENEWAL loan created from a test loan gets a NEW control number. R0
--     lists any such loan; decide on it by hand -- this script will not
--     delete a loan it did not create.

-- R0  Preview.
SELECT 'loans' AS tbl, count(*) FROM public.loans WHERE control_number LIKE 'TESTSOA-%'
UNION ALL SELECT 'loan_schedules', count(*) FROM public.loan_schedules WHERE loan_id LIKE 'TESTSOA-%'
UNION ALL SELECT 'loan_payments', count(*) FROM public.loan_payments WHERE loan_id LIKE 'TESTSOA-%'
UNION ALL SELECT 'loan_payment_ledger', count(*) FROM public.loan_payment_ledger WHERE loan_id LIKE 'TESTSOA-%'
UNION ALL SELECT 'loan_penalties', count(*) FROM public.loan_penalties WHERE loan_id LIKE 'TESTSOA-%'
UNION ALL SELECT 'loan_restructure_requests', count(*) FROM public.loan_restructure_requests WHERE loan_id LIKE 'TESTSOA-%'
UNION ALL SELECT 'receipts (loan_payment)', count(*) FROM public.receipts r
  WHERE r.source_type = 'loan_payment'
    AND r.source_id IN (SELECT id::text FROM public.loan_payments WHERE loan_id LIKE 'TESTSOA-%');

-- Other loans opened on these three members AFTER the seed -- e.g. a renewal
-- made during testing. Review manually; not touched below.
SELECT l.control_number, lt.code, l.loan_status, l.created_at, l.user_email
FROM public.loans l
JOIN public.loan_types lt ON lt.id = l.loan_type_id
JOIN public.member_account ma ON ma.user_id = l.member_id
WHERE lower(ma.email) IN ('lynxridao@gmail.com','erdenjhed.teope@wvsu.edu.ph','serevee7@gmail.com')
  AND l.control_number NOT LIKE 'TESTSOA-%'
  AND l.created_at >= (SELECT min(created_at) FROM public.loans WHERE control_number LIKE 'TESTSOA-%');

-- R1  Delete, children first (loan_payments -> loan_schedules is ON DELETE RESTRICT).
BEGIN;

DELETE FROM public.receipts r
WHERE r.source_type = 'loan_payment'
  AND r.source_id IN (SELECT id::text FROM public.loan_payments WHERE loan_id LIKE 'TESTSOA-%');

DELETE FROM public.loan_penalties            WHERE loan_id LIKE 'TESTSOA-%';
DELETE FROM public.loan_restructure_requests WHERE loan_id LIKE 'TESTSOA-%';
DELETE FROM public.loan_payment_ledger       WHERE loan_id LIKE 'TESTSOA-%';
DELETE FROM public.loan_payments             WHERE loan_id LIKE 'TESTSOA-%';
DELETE FROM public.loan_schedules            WHERE loan_id LIKE 'TESTSOA-%';
DELETE FROM public.loans                     WHERE control_number LIKE 'TESTSOA-%';

-- Expect 0.
SELECT (SELECT count(*) FROM public.loans          WHERE control_number LIKE 'TESTSOA-%')
     + (SELECT count(*) FROM public.loan_schedules WHERE loan_id LIKE 'TESTSOA-%')
     + (SELECT count(*) FROM public.loan_payments  WHERE loan_id LIKE 'TESTSOA-%') AS remaining_test_rows;

COMMIT;
