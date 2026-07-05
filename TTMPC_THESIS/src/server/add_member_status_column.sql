-- =============================================================================
-- Adds a first-class member_status column to public.member.
--
-- Why: previously, "is this member active?" was inferred from
-- termination_date IS NULL. Every read path had to know that convention, so
-- listings like Manage Member could easily miss the filter and keep showing
-- terminated members as active. A dedicated status column makes the intent
-- explicit and cheap to query on.
--
-- Values:
--   'active'     — default; the member is in good standing.
--   'terminated' — set by the BOD termination flow.
--
-- Safe to run multiple times.
-- =============================================================================

ALTER TABLE public.member
  ADD COLUMN IF NOT EXISTS member_status text NOT NULL DEFAULT 'active';

-- Restrict the column to known values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_status_chk'
      AND conrelid = 'public.member'::regclass
  ) THEN
    ALTER TABLE public.member
      ADD CONSTRAINT member_status_chk
      CHECK (lower(member_status) IN ('active', 'terminated'));
  END IF;
END$$;

-- Backfill: anyone with a termination_date is retroactively 'terminated'.
UPDATE public.member
SET member_status = 'terminated'
WHERE termination_date IS NOT NULL
  AND lower(member_status) <> 'terminated';

-- Index so filtering by status is fast on large tables.
CREATE INDEX IF NOT EXISTS idx_member_status ON public.member (member_status);
