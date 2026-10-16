-- Time Deposit simulation rollback
--
-- This script deletes only the exact TD certificates/opening keys entered below.
-- It does not delete regular savings accounts, savings_ledger rows, members, or
-- unrelated receipts/audit entries. Review the preview result before COMMIT.
-- Apply manually in Supabase SQL Editor only after replacing the example rows.

BEGIN;

CREATE TEMP TABLE td_simulation_rollback_targets (
    certificate_number text,
    opening_key text,
    CHECK (nullif(btrim(certificate_number), '') IS NOT NULL
        OR nullif(btrim(opening_key), '') IS NOT NULL)
) ON COMMIT DROP;

-- Add only certificates created during the simulation.
-- INSERT INTO td_simulation_rollback_targets (certificate_number)
-- VALUES ('TD-20261016-EXAMPLE');
-- INSERT INTO td_simulation_rollback_targets (opening_key)
-- VALUES ('the-opening-key-used-by-the-test');

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM td_simulation_rollback_targets) THEN
        RAISE EXCEPTION 'No rollback targets supplied. Add certificate_number or opening_key rows first.';
    END IF;
END;
$$;

CREATE TEMP TABLE td_simulation_rollback_rows ON COMMIT DROP AS
SELECT td.id, td.certificate_number
FROM public.time_deposits td
JOIN td_simulation_rollback_targets target
  ON (target.certificate_number IS NOT NULL
      AND td.certificate_number = btrim(target.certificate_number))
  OR (target.opening_key IS NOT NULL
      AND td.opening_key = btrim(target.opening_key));

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM td_simulation_rollback_rows) THEN
        RAISE EXCEPTION 'No matching Time Deposit certificates found. Nothing was deleted.';
    END IF;
END;
$$;

-- Review the exact records selected by the targets.
SELECT td.*
FROM public.time_deposits td
JOIN td_simulation_rollback_rows target ON target.id = td.id
ORDER BY td.created_at;

-- Receipt rows use the TD ledger id as source_id.
DELETE FROM public.receipts r
WHERE r.source_type = 'time_deposit'
  AND r.source_id IN (
      SELECT l.id::text
      FROM public.time_deposit_ledger l
      JOIN td_simulation_rollback_rows target ON target.id = l.time_deposit_id
  );

-- Remove receipt audit rows when the receipt audit context identifies TD data.
DELETE FROM public.audit_log a
WHERE a.entity_type = 'receipt'
  AND a.context ->> 'source_type' = 'time_deposit'
  AND a.entity_id IN (
      SELECT l.id::text
      FROM public.time_deposit_ledger l
      JOIN td_simulation_rollback_rows target ON target.id = l.time_deposit_id
  );

-- TD ledger audit rows use the certificate's TD id as entity_id.
DELETE FROM public.audit_log a
WHERE a.entity_type = 'time_deposit'
  AND a.entity_id IN (SELECT id::text FROM td_simulation_rollback_rows);

DELETE FROM public.time_deposit_status_history h
USING td_simulation_rollback_rows target
WHERE h.time_deposit_id = target.id;

DELETE FROM public.time_deposit_ledger l
USING td_simulation_rollback_rows target
WHERE l.time_deposit_id = target.id;

DELETE FROM public.time_deposits td
USING td_simulation_rollback_rows target
WHERE td.id = target.id;

-- Confirm no targeted TD data remains before committing.
SELECT count(*) AS remaining_targeted_time_deposits
FROM public.time_deposits td
JOIN td_simulation_rollback_rows target ON target.id = td.id;

COMMIT;
