-- Bookkeeper co-maker payload support
-- Purpose:
-- 1) Ensure raw_payload exists for loans and koica_loans
-- 2) Backfill null payloads to empty JSON objects
-- 3) Add helper indexes for JSON payload reads

BEGIN;

-- Ensure JSON payload exists on loans (Bookkeeper flow writes co-maker details here).
ALTER TABLE IF EXISTS public.loans
  ADD COLUMN IF NOT EXISTS raw_payload JSONB;

-- Ensure JSON payload exists on koica_loans for consistency across approval flows.
ALTER TABLE IF EXISTS public.koica_loans
  ADD COLUMN IF NOT EXISTS raw_payload JSONB;

-- Normalize null payloads to empty object for safer JSON path reads.
UPDATE public.loans
SET raw_payload = '{}'::jsonb
WHERE raw_payload IS NULL;

UPDATE public.koica_loans
SET raw_payload = '{}'::jsonb
WHERE raw_payload IS NULL;

-- Optional but useful: fast filtering when querying JSON paths.
CREATE INDEX IF NOT EXISTS idx_loans_raw_payload_gin
  ON public.loans
  USING GIN (raw_payload);

CREATE INDEX IF NOT EXISTS idx_koica_loans_raw_payload_gin
  ON public.koica_loans
  USING GIN (raw_payload);

COMMIT;
