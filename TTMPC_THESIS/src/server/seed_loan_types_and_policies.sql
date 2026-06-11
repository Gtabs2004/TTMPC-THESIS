-- Idempotent seed: ensure loan_types has EMERGENCY with 2% monthly
-- and loan_fee_policies contains the EMERGENCY policy (loan_fee_policies
-- schema file already inserts defaults). Run this in Supabase SQL editor.

BEGIN;

-- Ensure loan_types table exists and has a row for EMERGENCY
DO $$
BEGIN
  IF to_regclass('public.loan_types') IS NOT NULL THEN
    -- If a row exists with code EMERGENCY, update interest_rate
    IF EXISTS (SELECT 1 FROM public.loan_types WHERE upper(coalesce(code, '')) = 'EMERGENCY') THEN
      UPDATE public.loan_types
      SET interest_rate = 2
      WHERE upper(coalesce(code, '')) = 'EMERGENCY';

    -- Otherwise, if a row matches by name, set code and interest_rate
    ELSIF EXISTS (SELECT 1 FROM public.loan_types WHERE lower(coalesce(name, '')) IN ('emergency', 'emergency loan')) THEN
      UPDATE public.loan_types
      SET code = 'EMERGENCY', interest_rate = 2
      WHERE lower(coalesce(name, '')) IN ('emergency', 'emergency loan');

    -- Else insert new row
    ELSE
      INSERT INTO public.loan_types (code, name, interest_rate)
      VALUES ('EMERGENCY', 'Emergency Loan', 2);
    END IF;
  END IF;
END$$;

COMMIT;

-- Notes:
-- 1) Run this in your Supabase SQL editor (Project → SQL) or psql against the
--    target database. It is safe to re-run.
-- 2) `loan_fee_policies_schema.sql` already seeds EMERGENCY policy with
--    service_fee=100 and cbu_rate=0.02. If you haven't applied that file,
--    run it too.
