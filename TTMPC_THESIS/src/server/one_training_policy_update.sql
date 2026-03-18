-- Run this in Supabase SQL editor.
-- Policy migration: membership now requires only ONE completed training.

-- 1) Normalize historical application statuses to the one-training flow.
DO $$
BEGIN
  IF to_regclass('public.member_applications') IS NOT NULL THEN
    EXECUTE '
      UPDATE public.member_applications
      SET application_status = ''1st Training''
      WHERE lower(coalesce(application_status, '''')) IN (''2nd training'', ''second training'', ''training 2'')
    ';
  END IF;

  IF to_regclass('public.membership_application') IS NOT NULL THEN
    EXECUTE '
      UPDATE public.membership_application
      SET application_status = ''1st Training''
      WHERE lower(coalesce(application_status, '''')) IN (''2nd training'', ''second training'', ''training 2'')
    ';
  END IF;
END $$;

-- 2) Optional: normalize legacy training_status values if this column exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'member_applications'
      AND column_name = 'training_status'
  ) THEN
    EXECUTE '
      UPDATE public.member_applications
      SET training_status = ''1st training completed''
      WHERE lower(coalesce(training_status, '''')) IN (
        ''2nd training completed'', ''second training completed'', ''2nd training'', ''training 2''
      )
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'membership_application'
      AND column_name = 'training_status'
  ) THEN
    EXECUTE '
      UPDATE public.membership_application
      SET training_status = ''1st training completed''
      WHERE lower(coalesce(training_status, '''')) IN (
        ''2nd training completed'', ''second training completed'', ''2nd training'', ''training 2''
      )
    ';
  END IF;
END $$;

-- 3) Optional cleanup for attendance log stage labels.
DO $$
BEGIN
  IF to_regclass('public.attendance_logs') IS NOT NULL THEN
    EXECUTE '
      UPDATE public.attendance_logs
      SET training_stage = ''1st Training''
      WHERE training_stage IN (''2nd Training'', ''Second Training'', ''training 2'')
    ';
  END IF;
END $$;

-- 4) Keep historical rows but enforce one-training label going forward.
DO $$
BEGIN
  IF to_regclass('public.attendance_logs') IS NOT NULL THEN
    ALTER TABLE public.attendance_logs
      DROP CONSTRAINT IF EXISTS attendance_logs_stage_check;

    ALTER TABLE public.attendance_logs
      ADD CONSTRAINT attendance_logs_stage_check
      CHECK (training_stage IN ('1st Training'));
  END IF;
END $$;
