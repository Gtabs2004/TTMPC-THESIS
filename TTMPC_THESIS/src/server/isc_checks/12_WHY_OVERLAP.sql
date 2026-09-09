-- =============================================================================
-- ISC CHECK 12  --  Why did the overlap constraint block the test posting?
-- =============================================================================
-- isc_post('2026-01-01','2026-12-01') was rejected:
--
--   conflicting key ([2026-01-01,2027-01-01)) conflicts with
--   existing key   ([2025-12-01,2026-10-01))
--
-- The existing range is the 2026-09-06 posting (Dec 2025 - Sep 2026). Its
-- REVERSAL should not occupy any months -- but the ORIGINAL is what is
-- conflicting, and its status is 'reversed', which §22 assumed the constraint
-- excluded.
--
-- Safe: reads only.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1  --  what is actually in isc_postings, and what does it occupy?
-- -----------------------------------------------------------------------------
SELECT
  p.id,
  p.status,
  p.period_start,
  p.period_end,
  daterange(p.period_start, p.period_end, '[]')            AS occupies,
  to_char(p.total_interest, 'FM999,999,999.00')            AS total_interest,
  p.posted_by_email,
  p.posted_at::date                                        AS posted_on,
  CASE WHEN p.status = 'reversed'
       THEN 'should NOT block a new posting'
       ELSE 'blocks overlapping months' END                AS effect
FROM public.isc_postings p
ORDER BY p.posted_at;


-- -----------------------------------------------------------------------------
-- PART 2  --  what does the constraint ACTUALLY say right now?
-- -----------------------------------------------------------------------------
-- §22.8 recorded this as PASS because the definition mentions 'reversed'. But
-- mentioning it is not the same as excluding the right rows -- check the real
-- predicate here.
-- -----------------------------------------------------------------------------
SELECT
  conname                        AS constraint_name,
  pg_get_constraintdef(oid)      AS definition
FROM pg_constraint
WHERE conrelid = 'public.isc_postings'::regclass
  AND conname = 'isc_postings_no_overlap';


-- -----------------------------------------------------------------------------
-- PART 3  --  which rows does that predicate currently protect?
-- -----------------------------------------------------------------------------
-- Rows listed here are the ones occupying months. If a 'reversed' row appears,
-- the predicate is not doing what §17.1 intended.
-- -----------------------------------------------------------------------------
SELECT
  status,
  count(*)                                                 AS postings,
  string_agg(period_start::text || ' to ' || period_end::text, '; ' ORDER BY period_start) AS ranges
FROM public.isc_postings
WHERE status <> 'reversed'
GROUP BY status;
