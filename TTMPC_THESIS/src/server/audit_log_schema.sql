-- =============================================================================
-- Audit Log — two-tier governance audit trail
-- =============================================================================
-- Tier 1 (operational): each staff role sees only their own actions via RLS.
-- Tier 2 (governance):  BOD sees everything across all portals.
--
-- Triggers on loans, member_account, staff_termination_requests, and
-- member_applications fire on meaningful state changes and write one
-- compact row to public.audit_log.
-- =============================================================================

-- 1. Table -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id              bigserial PRIMARY KEY,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  actor_user_id   uuid NULL,
  actor_role      text NULL,   -- snapshotted at write time
  actor_email     text NULL,   -- denormalized for display without JOINs
  entity_type     text NOT NULL CHECK (entity_type IN (
                    'loan', 'member', 'account', 'termination', 'application', 'policy'
                  )),
  entity_id       text NOT NULL,
  action          text NOT NULL CHECK (action IN (
                    'create', 'update', 'approve', 'reject', 'recommend',
                    'deactivate', 'reactivate', 'terminate', 'disburse',
                    'change_role', 'revise'
                  )),
  before          jsonb NULL,  -- changed fields' previous values
  after           jsonb NULL,  -- changed fields' new values
  context         jsonb NULL   -- denormalized labels (member_name, control_number, etc.)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at ON public.audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor       ON public.audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity      ON public.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action      ON public.audit_log (action);

-- 2. Actor resolver helper ---------------------------------------------------
-- Returns (uid, role, email) for the current session, used by all triggers.
-- Falls back to NULLs when there is no auth context (e.g. direct SQL).
CREATE OR REPLACE FUNCTION public.audit_resolve_actor()
RETURNS TABLE (uid uuid, role text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text := auth.email();
  v_role  text := NULL;
BEGIN
  -- Service role bypass — keep role NULL so it's visible in logs as system action.
  IF auth.role() = 'service_role' THEN
    RETURN QUERY SELECT v_uid, 'service_role'::text, v_email;
    RETURN;
  END IF;

  IF to_regclass('public.member_account') IS NOT NULL THEN
    SELECT lower(btrim(coalesce(ma.role, '')))
      INTO v_role
      FROM public.member_account ma
      WHERE (v_uid IS NOT NULL AND ma.auth_user_id = v_uid)
         OR (v_email IS NOT NULL AND lower(coalesce(ma.email, '')) = lower(v_email))
      LIMIT 1;
  END IF;

  RETURN QUERY SELECT v_uid, COALESCE(v_role, ''), v_email;
END;
$$;

-- 3. Write helper ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_write(
  p_entity_type text,
  p_entity_id   text,
  p_action      text,
  p_before      jsonb,
  p_after       jsonb,
  p_context     jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor record;
BEGIN
  SELECT * INTO v_actor FROM public.audit_resolve_actor();
  INSERT INTO public.audit_log
    (actor_user_id, actor_role, actor_email,
     entity_type, entity_id, action, before, after, context)
  VALUES
    (v_actor.uid, v_actor.role, v_actor.email,
     p_entity_type, p_entity_id, p_action, p_before, p_after, p_context);
END;
$$;

-- 4. RLS ---------------------------------------------------------------------
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Service role bypass (triggers run as service_role definer; reads always need this).
DROP POLICY IF EXISTS audit_log_service_role_all ON public.audit_log;
CREATE POLICY audit_log_service_role_all
ON public.audit_log
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- BOD: read everything.
DROP POLICY IF EXISTS audit_log_bod_select ON public.audit_log;
CREATE POLICY audit_log_bod_select
ON public.audit_log
FOR SELECT
TO authenticated
USING (
  public.has_portal_role(auth.uid(), auth.email(), ARRAY['bod'])
);

-- All other staff: read only rows where they were the actor.
DROP POLICY IF EXISTS audit_log_staff_self_select ON public.audit_log;
CREATE POLICY audit_log_staff_self_select
ON public.audit_log
FOR SELECT
TO authenticated
USING (
  actor_user_id = auth.uid()
  AND public.has_portal_role(
    auth.uid(), auth.email(),
    ARRAY['manager', 'bookkeeper', 'treasurer', 'cashier', 'secretary']
  )
);

-- Nobody can INSERT/UPDATE/DELETE from app code — only triggers + service role.
-- No INSERT/UPDATE/DELETE policies defined → blocked by default.
