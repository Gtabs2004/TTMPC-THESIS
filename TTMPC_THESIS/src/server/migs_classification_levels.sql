-- Add MIGS / Non-MIGS rows to the existing classification_level lookup so
-- snapshots written by /api/migs/recompute-all can reference them via FK.
--
-- The existing starter/active/advanced/elite rows are kept untouched in case
-- the longitudinal analytics module still uses them.

INSERT INTO public.classification_level (code, label, min_score, max_score)
VALUES
  ('non_migs', 'Non-MIGS', 0, 49),
  ('migs',     'MIGS Qualified', 50, 100)
ON CONFLICT (code) DO NOTHING;
