-- One-shot fix for conflicting loan_schedules schedule_status constraints.
-- Run this in Supabase SQL editor before retrying disbursement claim.

BEGIN;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.loan_schedules'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%schedule_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.loan_schedules DROP CONSTRAINT %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.loan_schedules
  ADD CONSTRAINT loan_schedules_schedule_status_check
  CHECK (lower(coalesce(schedule_status, '')) IN ('unpaid', 'paid', 'overdue', 'pending'));

-- Optional normalization for old values
UPDATE public.loan_schedules
SET schedule_status = 'Unpaid'
WHERE lower(coalesce(schedule_status, '')) = 'pending';

COMMIT;
