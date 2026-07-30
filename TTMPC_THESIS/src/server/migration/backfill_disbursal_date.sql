-- Backfill disbursal_date = application_date for legacy loans whose disbursal
-- date is NULL. TTMPC historically disburses same day as application for most
-- consolidated/emergency loans.
--
-- Only touches rows where disbursal_date IS NULL AND raw_payload->>'legacy' = 'true'.
-- Safe to re-run (COALESCE guard).
--
-- Rollback: UPDATE loans SET disbursal_date = NULL WHERE raw_payload->>'legacy' = 'true';

BEGIN;

UPDATE public.loans
SET disbursal_date = application_date
WHERE disbursal_date IS NULL
  AND application_date IS NOT NULL
  AND raw_payload->>'legacy' = 'true';

-- Verify
DO $$
DECLARE
  v_updated int;
  v_remaining_null int;
BEGIN
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  SELECT COUNT(*) INTO v_remaining_null
    FROM loans
    WHERE disbursal_date IS NULL AND raw_payload->>'legacy' = 'true';
  RAISE NOTICE 'Updated % legacy loans. Remaining legacy loans with NULL disbursal_date: %',
    v_updated, v_remaining_null;
END $$;

COMMIT;
