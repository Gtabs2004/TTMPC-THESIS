-- ============================================================================
-- Cleanup: delete 4 test-account duplicates from the member table.
--
-- Confirmed by user: these are all test/dummy accounts created during dev.
-- Their loans/payments/schedules are also test data.
--
-- Rows being deleted:
--   TTMPC-265  Rios, Lorelie          (duplicate of TTMPC-266) — has 1 test loan
--   TTMPC-267  TABIOLO, GERO          (duplicate of TTMPC-268) — no loans
--   TTMPC-269  Delos Reyes, Romelyn   (duplicate of TTMPC-270) — no loans
--   TTMPC-295  Portor, Feitan         (standalone test)         — no loans
--
-- Test loan cascade-target:
--   CL-20260424-1411 (linked to TTMPC-265), plus its 2 loan_payments and any
--   loan_schedules.
--
-- Before running, back up:
--   SELECT * FROM member         WHERE membership_id IN ('TTMPC-265','TTMPC-267','TTMPC-269','TTMPC-295');
--   SELECT * FROM member_account WHERE membership_id IN ('TTMPC-265','TTMPC-267','TTMPC-269','TTMPC-295');
--   SELECT * FROM loans          WHERE control_number = 'CL-20260424-1411';
--   SELECT * FROM loan_payments  WHERE loan_id = 'CL-20260424-1411';
--   SELECT * FROM loan_schedules WHERE loan_id = 'CL-20260424-1411';
-- ============================================================================

BEGIN;

-- Preview counts (visible in the psql/SQL Editor output as NOTICE).
DO $$
DECLARE
  v_member_count int;
  v_loan_count int;
  v_payment_count int;
  v_schedule_count int;
BEGIN
  SELECT COUNT(*) INTO v_member_count
    FROM member
    WHERE membership_id IN ('TTMPC-265','TTMPC-267','TTMPC-269','TTMPC-295');
  SELECT COUNT(*) INTO v_loan_count
    FROM loans
    WHERE member_id IN (SELECT id FROM member WHERE membership_id IN ('TTMPC-265','TTMPC-267','TTMPC-269','TTMPC-295'));
  SELECT COUNT(*) INTO v_payment_count
    FROM loan_payments
    WHERE loan_id IN (SELECT control_number FROM loans WHERE member_id IN (SELECT id FROM member WHERE membership_id IN ('TTMPC-265','TTMPC-267','TTMPC-269','TTMPC-295')));
  SELECT COUNT(*) INTO v_schedule_count
    FROM loan_schedules
    WHERE loan_id IN (SELECT control_number FROM loans WHERE member_id IN (SELECT id FROM member WHERE membership_id IN ('TTMPC-265','TTMPC-267','TTMPC-269','TTMPC-295')));
  RAISE NOTICE 'About to delete: % member rows, % loans, % payments, % schedules',
    v_member_count, v_loan_count, v_payment_count, v_schedule_count;
END $$;

-- Delete in FK-safe order: payments -> schedules -> loans -> member_account -> member.
DELETE FROM public.loan_payments
WHERE loan_id IN (
  SELECT control_number FROM loans
  WHERE member_id IN (SELECT id FROM member WHERE membership_id IN ('TTMPC-265','TTMPC-267','TTMPC-269','TTMPC-295'))
);

DELETE FROM public.loan_schedules
WHERE loan_id IN (
  SELECT control_number FROM loans
  WHERE member_id IN (SELECT id FROM member WHERE membership_id IN ('TTMPC-265','TTMPC-267','TTMPC-269','TTMPC-295'))
);

DELETE FROM public.loans
WHERE member_id IN (SELECT id FROM member WHERE membership_id IN ('TTMPC-265','TTMPC-267','TTMPC-269','TTMPC-295'));

DELETE FROM public.member_account
WHERE membership_id IN ('TTMPC-265','TTMPC-267','TTMPC-269','TTMPC-295');

DELETE FROM public.member
WHERE membership_id IN ('TTMPC-265','TTMPC-267','TTMPC-269','TTMPC-295');

-- Verify inside the transaction.
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_remaining
    FROM member
    WHERE membership_id IN ('TTMPC-265','TTMPC-267','TTMPC-269','TTMPC-295');
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'Unexpected: % target rows still exist after DELETE', v_remaining;
  END IF;
  RAISE NOTICE 'All 4 target rows successfully deleted.';
END $$;

COMMIT;
