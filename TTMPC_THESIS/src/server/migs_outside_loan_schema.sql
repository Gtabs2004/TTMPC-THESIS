-- =============================================================================
-- MIGS — bookkeeper-declared "Loans from Other PLIs" (2026-09-18)
-- =============================================================================
-- Adds the ONE MIGS criterion that has no system source: whether a member
-- carries a loan with another Private Lending Institution. Every other
-- criterion is derived (CBU ledger, loan schedules, savings, groceries, GA
-- attendance); this one can only come from the bookkeeper asking.
--
-- Until now all three scoring call sites passed has_outside_loan=None
-- (main.py:7176, :7280, :7699), so score_outside_loan() always returned its
-- "innocent until flagged" default of 10/10 and the UI showed "Not wired yet".
--
-- -----------------------------------------------------------------------------
-- WHY A SEPARATE TABLE AND NOT A COLUMN ON member_classification_temporal
-- -----------------------------------------------------------------------------
-- That table is the SNAPSHOT, and /api/migs/recompute-all rebuilds it with a
-- DELETE-then-INSERT for the accrual date (main.py ~:7315). A declaration
-- stored there would be destroyed by the next recompute -- the bookkeeper's
-- answer would silently revert to "unanswered" and every member would quietly
-- go back to scoring 10/10.
--
-- So the DECLARATION (an input, entered by a person) and the POINTS (an
-- output, recomputed from it) live apart. pli_points on the snapshot stays
-- exactly as it is: the computed result at snapshot time.
--
-- -----------------------------------------------------------------------------
-- WHY PER-YEAR
-- -----------------------------------------------------------------------------
-- MIGS is explicitly temporal -- the snapshot table is named for it and both
-- MIGS screens carry a year filter. A member who had an outside loan in 2025
-- and cleared it in 2026 must score differently in each year, and last year's
-- answer must not be overwritten by this year's. Hence the PK is
-- (member_id, year).
--
-- -----------------------------------------------------------------------------
-- THE SCORING RULE IS UNCHANGED
-- -----------------------------------------------------------------------------
-- migs_engine.score_outside_loan() already implements it and is NOT touched:
--     has_outside_loan IS TRUE  -> 0 of 10
--     otherwise                 -> 10 of 10
-- Binary, matching the engine. This migration only gives that function a real
-- value to read instead of a hardcoded None.
--
-- NOTE ON THE DEFAULT: a member with no row here still scores 10/10, which
-- preserves today's behaviour exactly -- applying this migration changes no
-- member's score until a bookkeeper actually records an answer. The UI
-- distinguishes "not yet asked" from "confirmed no outside loan" so the two
-- are never mistaken for each other, even though they score the same.
--
-- Idempotent. Safe to re-run.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.migs_outside_loan_declaration (
  member_id         uuid    NOT NULL
      REFERENCES public.member(id) ON DELETE CASCADE,
  year              integer NOT NULL,

  -- The answer. NOT NULL: a row exists only once someone has actually
  -- answered. "Not yet asked" is the ABSENCE of a row, never a NULL here --
  -- that keeps the two states impossible to confuse.
  has_outside_loan  boolean NOT NULL,

  -- Who said so and when. This is a human declaration affecting a member's
  -- classification and loan multiplier (5x vs 3x), so it must be attributable.
  declared_by       uuid,
  declared_by_email text,
  note              text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT migs_outside_loan_declaration_pk
    PRIMARY KEY (member_id, year),

  -- Matches the MIGS history floor; keeps a typo'd year out of the table.
  CONSTRAINT migs_outside_loan_declaration_year_chk
    CHECK (year BETWEEN 2019 AND 2100)
);

COMMENT ON TABLE public.migs_outside_loan_declaration IS
  'Bookkeeper-declared "Loans from Other PLIs" input for MIGS scoring. Deliberately NOT on member_classification_temporal: recompute-all rebuilds that table by delete+insert and would destroy the declaration. One row per member per year; no row = not yet asked (scores the engine default of 10).';

COMMENT ON COLUMN public.migs_outside_loan_declaration.has_outside_loan IS
  'TRUE = member carries a loan with another PLI, scores 0 of 10. FALSE = confirmed none, scores 10 of 10. No row at all = not yet asked (also scores 10, but the UI shows it as unanswered).';

CREATE INDEX IF NOT EXISTS migs_outside_loan_declaration_year_idx
  ON public.migs_outside_loan_declaration (year);

-- Keep updated_at honest on re-declaration.
CREATE OR REPLACE FUNCTION public.touch_migs_outside_loan_declaration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_migs_outside_loan_declaration
  ON public.migs_outside_loan_declaration;
CREATE TRIGGER trg_touch_migs_outside_loan_declaration
  BEFORE UPDATE ON public.migs_outside_loan_declaration
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_migs_outside_loan_declaration();

-- -----------------------------------------------------------------------------
-- RLS — same posture as the other bookkeeper-written MIGS tables.
-- -----------------------------------------------------------------------------
ALTER TABLE public.migs_outside_loan_declaration ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS migs_outside_loan_declaration_read ON public.migs_outside_loan_declaration;
CREATE POLICY migs_outside_loan_declaration_read
  ON public.migs_outside_loan_declaration
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS migs_outside_loan_declaration_write ON public.migs_outside_loan_declaration;
CREATE POLICY migs_outside_loan_declaration_write
  ON public.migs_outside_loan_declaration
  FOR ALL
  TO authenticated
  USING (public.has_portal_role(auth.uid(), auth.email(), ARRAY['bookkeeper']))
  WITH CHECK (public.has_portal_role(auth.uid(), auth.email(), ARRAY['bookkeeper']));

COMMIT;


-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT
  (SELECT count(*) FROM public.migs_outside_loan_declaration)            AS declarations,
  (SELECT count(*) FROM public.migs_outside_loan_declaration
    WHERE has_outside_loan)                                              AS with_outside_loan,
  (SELECT count(*) FROM public.member
    WHERE lower(coalesce(member_status,'active')) = 'active')            AS active_members,
  'no row = not yet asked (scores 10/10, same as today)'                 AS note;
