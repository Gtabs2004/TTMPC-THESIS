-- Fix: personal_data_sheet.contact_number is bigint, which cannot hold a
-- leading 0 -- every Philippine mobile number (09xxxxxxxxx) stored here
-- silently loses its leading digit (Simulation findings item 9).
--
-- Converts the column to text, re-padding any value that already lost its
-- leading 0 under the old bigint column back to the standard 11-digit
-- 09xxxxxxxxx form before the type change, so existing rows don't end up
-- permanently stuck at 10 digits.
--
-- Idempotent: safe to run again (no-op if contact_number is already text).

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'personal_data_sheet'
      AND column_name = 'contact_number'
      AND data_type = 'bigint'
  ) THEN
    -- Re-pad 10-digit values that look like a mobile number missing its
    -- leading 0 (started with 9, exactly 10 digits) back to 11 digits
    -- instead of just carrying the truncated value forward unchanged.
    ALTER TABLE public.personal_data_sheet
      ALTER COLUMN contact_number TYPE text
      USING (
        CASE
          WHEN contact_number IS NULL THEN NULL
          WHEN length(contact_number::text) = 10 AND contact_number::text LIKE '9%'
            THEN '0' || contact_number::text
          ELSE contact_number::text
        END
      );
  END IF;
END $$;

COMMIT;
