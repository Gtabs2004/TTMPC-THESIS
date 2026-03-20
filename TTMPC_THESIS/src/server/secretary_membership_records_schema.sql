-- Secretary membership records integration patch
-- Uses existing public.member and public.member_applications tables.
-- No new table created.

BEGIN;

ALTER TABLE IF EXISTS public.member
  ADD COLUMN IF NOT EXISTS membership_date timestamptz,
  ADD COLUMN IF NOT EXISTS bod_resolution_number text,
  ADD COLUMN IF NOT EXISTS number_of_shares numeric,
  ADD COLUMN IF NOT EXISTS share_capital_amount numeric,
  ADD COLUMN IF NOT EXISTS initial_paid_up_capital numeric,
  ADD COLUMN IF NOT EXISTS termination_resolution_number text,
  ADD COLUMN IF NOT EXISTS termination_date timestamptz;

COMMIT;
