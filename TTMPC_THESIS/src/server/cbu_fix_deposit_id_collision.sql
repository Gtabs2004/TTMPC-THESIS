-- Fix: loan release fails with
--   duplicate key value violates unique constraint "capital_build_up_cbu_deposit_id_uk"
--   Key (cbu_deposit_id)=(CBUD_275) already exists.
-- Run in Supabase SQL editor.
--
-- Path: cashier confirms disbursement -> loans.loan_status = 'released' ->
-- trg_sync_cbu_from_loan_disbursement inserts the LOAN_CBU_RETENTION row
-- WITHOUT a cbu_deposit_id -> trg_set_cbu_deposit_id (BEFORE INSERT) picks
-- the id. The id it picked already existed, so the whole release rolled back.
--
-- The live set_cbu_deposit_id() had drifted from cbu_cashier_policy_and_trigger.sql
-- (a MAX()+1 over the numeric suffix cannot return an id in use). Even the
-- repo version had two holes:
--   * no lock -- two concurrent inserts compute the same MAX()+1;
--   * the '^CBUD_0*' strip + ::integer cast throws on any id that isn't
--     exactly CBUD_<digits>.
--
-- Fix: serialize id assignment with a transaction-scoped advisory lock,
-- parse only well-formed CBUD_<digits> ids, and skip forward past any id
-- that still exists. Only fires when the caller didn't supply an id, so the
-- Python CRJ endpoint and ISC settlement (which pre-supply ids) are unchanged.
--
-- Idempotent: CREATE OR REPLACE, safe to re-run. No data is changed.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_cbu_deposit_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_number integer;
BEGIN
  IF NEW.cbu_deposit_id IS NULL OR btrim(NEW.cbu_deposit_id) = '' THEN
    -- One id assignment at a time; released at COMMIT/ROLLBACK.
    PERFORM pg_advisory_xact_lock(hashtext('capital_build_up.cbu_deposit_id'));

    SELECT coalesce(max(substring(cbu_deposit_id FROM '^CBUD_(\d+)$')::integer), 0) + 1
    INTO next_number
    FROM public.capital_build_up
    WHERE cbu_deposit_id ~ '^CBUD_\d+$';

    -- Belt and braces: also skip padded/unpadded twins (CBUD_0275 vs CBUD_275).
    WHILE EXISTS (
      SELECT 1 FROM public.capital_build_up
      WHERE cbu_deposit_id IN ('CBUD_' || next_number::text,
                               'CBUD_' || lpad(next_number::text, 3, '0'),
                               'CBUD_' || lpad(next_number::text, 4, '0'))
    ) LOOP
      next_number := next_number + 1;
    END LOOP;

    NEW.cbu_deposit_id := 'CBUD_' || lpad(next_number::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_cbu_deposit_id ON public.capital_build_up;
CREATE TRIGGER trg_set_cbu_deposit_id
BEFORE INSERT ON public.capital_build_up
FOR EACH ROW
EXECUTE FUNCTION public.set_cbu_deposit_id();

COMMIT;

-- Sanity check: should return 0 rows.
SELECT cbu_deposit_id, count(*)
FROM public.capital_build_up
WHERE cbu_deposit_id IS NOT NULL
GROUP BY cbu_deposit_id
HAVING count(*) > 1;
