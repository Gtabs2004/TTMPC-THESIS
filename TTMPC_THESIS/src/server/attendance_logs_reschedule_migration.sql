-- Extends attendance_logs to support the "Rescheduled Training" stage and
-- per-row attendance locking used by the Secretary Portal reschedule flow.
-- Run this in Supabase SQL editor. Idempotent and non-breaking.

-- 1. Allow 'Rescheduled Training' as a valid stage.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_logs_stage_check'
      AND conrelid = 'public.attendance_logs'::regclass
  ) THEN
    ALTER TABLE public.attendance_logs
      DROP CONSTRAINT attendance_logs_stage_check;
  END IF;

  ALTER TABLE public.attendance_logs
    ADD CONSTRAINT attendance_logs_stage_check
    CHECK (training_stage IN ('Training', '1st Training', 'Rescheduled Training'));
END $$;

-- 2. Add is_locked column. Training-stage rows are locked immediately at
--    Present/Absent (legacy behavior). Reschedule rows stay unlocked until the
--    secretary explicitly locks them via the portal.
ALTER TABLE IF EXISTS public.attendance_logs
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

-- Backfill: existing Training-stage rows with a decided status were implicitly
-- locked under the old rule; reflect that so the UI stays consistent.
UPDATE public.attendance_logs
SET is_locked = true
WHERE training_stage = 'Training'
  AND attendance_status IN ('Present', 'Absent')
  AND is_locked = false;

CREATE INDEX IF NOT EXISTS attendance_logs_is_locked_idx
ON public.attendance_logs (is_locked);

-- 3. Allow 'Rescheduled' as an attendance_status value so the Secretary can
--    explicitly mark a member as awaiting the new session on the Reschedule
--    Training tab. Applied to both the legacy and v2 status constraints.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_logs_status_check'
      AND conrelid = 'public.attendance_logs'::regclass
  ) THEN
    ALTER TABLE public.attendance_logs
      DROP CONSTRAINT attendance_logs_status_check;
  END IF;

  ALTER TABLE public.attendance_logs
    ADD CONSTRAINT attendance_logs_status_check
    CHECK (attendance_status IN ('Present', 'Absent', 'Pending', 'Rescheduled'));

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_logs_status_v2_check'
      AND conrelid = 'public.attendance_logs'::regclass
  ) THEN
    ALTER TABLE public.attendance_logs
      DROP CONSTRAINT attendance_logs_status_v2_check;
  END IF;

  ALTER TABLE public.attendance_logs
    ADD CONSTRAINT attendance_logs_status_v2_check
    CHECK (status IS NULL OR status IN ('Present', 'Absent', 'Rescheduled'));
END $$;
