-- SOA test scenarios -- STEP 5: reset scenario 2 (TESTSOA-CL-0002) to
-- "6 paid, then 3 months with no payment" -- the state right after
-- 03_shift_scenario2.sql -- so the delinquency / penalty / payment flow can be
-- run again from the start.
--
-- Removes ONLY what testing added on top of the seed:
--   * payments that are not seed payments (seed refs are 'TESTSOA-2-01'..'-06'),
--     their ledger rows (cascade) and their receipts
--   * all penalty rows of this loan
--   * schedule rows after #7 (created by the roll-forward / approvals)
-- and reopens #7 (due 2026-07-15) as the single Unpaid row.
--
-- Never touches scenario 1 or 3, or any non-TESTSOA data. audit_log rows stay
-- (append-only). A receipt number that was issued is not reused.
--
-- Run R0 first and read it, then the BEGIN ... COMMIT block.

-- R0  Preview of what will be removed.
SELECT 'non-seed payments' AS what, count(*)
  FROM public.loan_payments
 WHERE loan_id = 'TESTSOA-CL-0002' AND coalesce(payment_reference, '') NOT LIKE 'TESTSOA-2-%'
UNION ALL
SELECT 'receipts for them (kept, immutable)', count(*)
  FROM public.receipts r
 WHERE r.source_type = 'loan_payment'
   AND r.source_id IN (SELECT id::text FROM public.loan_payments
                        WHERE loan_id = 'TESTSOA-CL-0002'
                          AND coalesce(payment_reference, '') NOT LIKE 'TESTSOA-2-%')
UNION ALL
SELECT 'penalty rows', count(*) FROM public.loan_penalties WHERE loan_id = 'TESTSOA-CL-0002'
UNION ALL
SELECT 'schedule rows after #7', count(*)
  FROM public.loan_schedules WHERE loan_id = 'TESTSOA-CL-0002' AND installment_no > 7;

-- R1  Reset.
BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.loan_payments
       WHERE loan_id = 'TESTSOA-CL-0002' AND payment_reference LIKE 'TESTSOA-2-%') <> 6
     OR NOT EXISTS (SELECT 1 FROM public.loan_schedules
                     WHERE loan_id = 'TESTSOA-CL-0002' AND installment_no = 7
                       AND due_date = DATE '2026-07-15') THEN
    RAISE EXCEPTION 'TESTSOA-CL-0002 is not the shifted seed (6 seed payments, #7 due 2026-07-15). Run 03_shift_scenario2.sql state first. Stopping.';
  END IF;
END $$;

-- Receipts are NOT deleted: receipts_block_changes() makes them immutable
-- (official receipt numbering must have no gaps). A receipt has no foreign key
-- to its payment, so it stays as the record that the test payment was issued.

DELETE FROM public.loan_penalties WHERE loan_id = 'TESTSOA-CL-0002';

-- Ledger rows go with their payment (ON DELETE CASCADE).
DELETE FROM public.loan_payments
 WHERE loan_id = 'TESTSOA-CL-0002' AND coalesce(payment_reference, '') NOT LIKE 'TESTSOA-2-%';

DELETE FROM public.loan_schedules WHERE loan_id = 'TESTSOA-CL-0002' AND installment_no > 7;

UPDATE public.loan_schedules
   SET schedule_status = 'Unpaid', carried_arrears = 0, applied_credit = 0
 WHERE loan_id = 'TESTSOA-CL-0002' AND installment_no = 7;

UPDATE public.loans
   SET loan_status = 'partially paid', application_status = 'partially paid', updated_at = now()
 WHERE control_number = 'TESTSOA-CL-0002';

-- Expect: #1-#6 Paid with one seed payment each, #7 Unpaid due 2026-07-15,
-- nothing after it; 6 payments totalling 59,959.98; 0 penalty rows.
SELECT s.installment_no, s.due_date, s.schedule_status, s.carried_arrears,
       p.payment_reference, p.amount_paid
FROM public.loan_schedules s
LEFT JOIN public.loan_payments p ON p.schedule_id = s.id
WHERE s.loan_id = 'TESTSOA-CL-0002'
ORDER BY s.installment_no;

COMMIT;
