-- =============================================================================
-- ISC FIX — posted_by / reversed_by must not reference member(id)  (2026-09-06)
-- =============================================================================
-- SYMPTOM
--   Posting fails outright:
--     insert or update on table "isc_postings" violates foreign key
--     constraint "isc_postings_posted_by_fkey"
--
-- CAUSE
--   isc_postings.posted_by and .reversed_by were declared
--   REFERENCES public.member(id), which assumes every staff member is also a
--   cooperative member holding a member row under the SAME id. That is false.
--
--   audit_resolve_actor() returns auth.uid() -- the auth user id. For the
--   bookkeeper:
--       member_account.user_id       = ccd0c723...  -> IS a member (TTMPC-164)
--       member_account.auth_user_id  = e7e2ed14...  -> NOT in member  <-- auth.uid()
--
--   All six staff accounts (bod, secretary, cashier, bookkeeper, treasurer,
--   manager) have an auth uid with no matching member row, so every posting
--   and every reversal would fail the constraint.
--
-- FIX
--   Drop both foreign keys. These columns record WHO PERFORMED THE ACTION --
--   an auth identity, not a cooperative membership. The accompanying
--   posted_by_email / reversed_by_email columns carry the human-readable
--   identity, and audit_log independently records the same actor, so the audit
--   trail is unaffected.
--
--   The columns keep their uuid type and stay NOT NULL-able as before; only
--   the referential constraint to member(id) goes.
--
-- Safe on a live database. Safe to run more than once. No data is modified.
-- =============================================================================

BEGIN;

ALTER TABLE public.isc_postings
  DROP CONSTRAINT IF EXISTS isc_postings_posted_by_fkey;

ALTER TABLE public.isc_postings
  DROP CONSTRAINT IF EXISTS isc_postings_reversed_by_fkey;

COMMENT ON COLUMN public.isc_postings.posted_by IS
  'auth.uid() of the staff member who posted. NOT a member(id) -- staff accounts '
  'are not necessarily cooperative members. See posted_by_email for the identity.';

COMMENT ON COLUMN public.isc_postings.reversed_by IS
  'auth.uid() of the manager who reversed. NOT a member(id) -- see reversed_by_email.';

COMMIT;
