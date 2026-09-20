-- Fix: a second, older CHECK constraint blocks 'partially_paid'.
--
-- loan_arrears_credit_schema.sql dropped and recreated
--   loan_schedules_schedule_status_check   (allows partially_paid)
-- but the table ALSO carries
--   loan_schedules_schedule_status_v2_chk  (unpaid|paid|overdue|pending)
-- from an earlier migration. A row must satisfy EVERY check constraint, so the
-- v2 one rejected every partially_paid write.
--
-- The approve path swallows that failure by design (a constraint error must not
-- fail an approval), which is why the shortfall vanished with no error: the
-- schedule stayed Unpaid, carry_arrears_forward was reset to 0, and the next
-- installment was therefore never created either.
--
-- This replaces the v2 constraint with one that also allows partially_paid.
-- 'pending' is preserved -- it is in the live definition and still used by the
-- next-unpaid-schedule lookups.

BEGIN;

ALTER TABLE public.loan_schedules
  DROP CONSTRAINT IF EXISTS loan_schedules_schedule_status_v2_chk;

ALTER TABLE public.loan_schedules
  ADD CONSTRAINT loan_schedules_schedule_status_v2_chk
  CHECK (
    lower(COALESCE(schedule_status, '')) = ANY (
      ARRAY['unpaid', 'paid', 'overdue', 'pending', 'partially_paid']
    )
  );

COMMIT;

-- Verify: every CHECK touching schedule_status must now mention partially_paid.
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.loan_schedules'::regclass
--     AND contype = 'c'
--     AND pg_get_constraintdef(oid) ILIKE '%schedule_status%';
