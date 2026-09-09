-- =============================================================================
-- ISC v2 — FIX: the overlap constraint must ignore BOTH halves of a reversal
-- =============================================================================
-- Run AFTER isc_v2_03_post_settle.sql. Read the reasoning before running.
--
-- THE BUG (mine, introduced in step 5b)
--   isc_v2_03 rewrote the constraint as:
--
--       EXCLUDE ... WHERE (status <> 'reversed')
--
--   That excludes the ORIGINAL of a reversed pair but NOT the reversal entry,
--   because a reversal is itself a posting and carries status = 'posted'.
--
--   Measured on live data 2026-09-09:
--
--     e649520f  status reversed  Dec2025-Sep2026  +PHP 1,496,104.42  bookkeeper
--     38dc1d51  status posted    Dec2025-Sep2026  -PHP 1,496,104.42  manager
--
--   The pair nets to PHP 0.00 and owes nobody anything, yet the second row kept
--   Dec 2025 - Sep 2026 occupied and blocked a legitimate new posting.
--
-- WHY I MISSED IT
--   §17.1 discards reversal, so I treated `status = 'reversed'` as the whole
--   story and dropped the old predicate's reliance on reverses_posting_id.
--   But `reverses_posting_id` is what identifies the CANCELLING half, and it is
--   still on the table -- isc_v2_03 dropped the isc_reverse FUNCTION, not the
--   column. The marker was load-bearing and I did not notice.
--
--   §22.8 recorded this check as PASS because the constraint definition
--   mentioned 'reversed'. Mentioning a value is not the same as excluding the
--   right rows. A definition-text check cannot verify behaviour.
--
-- THE RULE, STATED PROPERLY
--   A posting occupies its months unless it is part of a reversal pair.
--   Both halves are excluded: the original (status = 'reversed') and the
--   cancelling entry (reverses_posting_id IS NOT NULL).
--
-- Idempotent. Reads and rewrites one constraint; no data is changed.
-- =============================================================================

BEGIN;

-- Safety: this must hold before the constraint is relaxed. If a reversal entry
-- is not marked, dropping the old constraint could let two LIVE postings share
-- months -- the exact failure §8.2 exists to prevent.
DO $$
DECLARE
  v_unmarked integer;
BEGIN
  SELECT count(*) INTO v_unmarked
  FROM public.isc_postings r
  WHERE r.total_interest < 0
    AND r.reverses_posting_id IS NULL;

  IF v_unmarked > 0 THEN
    RAISE EXCEPTION
      '% negative-total posting(s) have no reverses_posting_id. Refusing to relax the overlap constraint until every reversal entry is marked.',
      v_unmarked;
  END IF;
END $$;

ALTER TABLE public.isc_postings
  DROP CONSTRAINT IF EXISTS isc_postings_no_overlap;

ALTER TABLE public.isc_postings
  ADD CONSTRAINT isc_postings_no_overlap
  EXCLUDE USING gist (
    daterange(period_start, period_end, '[]') WITH &&
  ) WHERE (
    status <> 'reversed'              -- the original of a reversed pair
    AND reverses_posting_id IS NULL   -- the cancelling entry itself
  );

COMMENT ON CONSTRAINT isc_postings_no_overlap ON public.isc_postings IS
  'Two LIVE postings may never share a month (plan §8.2). Both halves of a reversal pair are excluded: the original by status, the cancelling entry by reverses_posting_id. A deleted posting frees its months by ceasing to exist (§17.1).';

COMMIT;


-- =============================================================================
-- VERIFY -- Dec 2025 to Sep 2026 should now be FREE
-- =============================================================================
SELECT
  p.status,
  p.period_start,
  p.period_end,
  to_char(p.total_interest, 'FM999,999,999.00')                  AS total_interest,
  p.reverses_posting_id IS NOT NULL                              AS is_a_reversal_entry,
  CASE
    WHEN p.status = 'reversed'              THEN 'excluded - original of a reversed pair'
    WHEN p.reverses_posting_id IS NOT NULL  THEN 'excluded - cancelling entry'
    ELSE '*** OCCUPIES THESE MONTHS ***'
  END                                                            AS effect
FROM public.isc_postings p
ORDER BY p.posted_at;

-- Both Sep-6 rows must now read "excluded". If either still says OCCUPIES, the
-- predicate is wrong -- stop and investigate rather than posting.
