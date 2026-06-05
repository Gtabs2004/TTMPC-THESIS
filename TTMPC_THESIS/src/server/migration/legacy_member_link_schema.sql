-- legacy_member_link
-- Tracks the manual coop-validated link between a legacy MasterUUID
-- (from the pre-migration system, used in Master_Analytical_Matrix /
-- Normalized_Payments) and the current Supabase member.id.
--
-- Two valid states per row:
--   1. member_id IS NOT NULL  -> coop confirmed this MasterUUID belongs
--                                to that Supabase member.
--   2. marked_no_history = TRUE -> coop confirmed this MasterUUID has no
--                                real legacy history (withdrawn placeholder
--                                or new member).
--
-- Run once in Supabase SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.legacy_member_link (
    legacy_master_uuid  UUID PRIMARY KEY,
    member_id           UUID REFERENCES public.member(id) ON DELETE CASCADE,
    marked_no_history   BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_by        UUID,
    confirmed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes               TEXT,
    CONSTRAINT legacy_member_link_state_chk
        CHECK ( (member_id IS NOT NULL) <> (marked_no_history = TRUE) )
);

CREATE INDEX IF NOT EXISTS idx_legacy_member_link_member_id
    ON public.legacy_member_link (member_id);

ALTER TABLE public.legacy_member_link ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legacy_member_link_service_role_all ON public.legacy_member_link;
CREATE POLICY legacy_member_link_service_role_all
ON public.legacy_member_link FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS legacy_member_link_authenticated_select ON public.legacy_member_link;
CREATE POLICY legacy_member_link_authenticated_select
ON public.legacy_member_link FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.legacy_member_link TO authenticated;
GRANT ALL ON public.legacy_member_link TO service_role;

COMMENT ON TABLE public.legacy_member_link IS
    'Coop-validated bridge from legacy MasterUUID to Supabase member.id, or marker that the MasterUUID has no real legacy history.';

COMMIT;
