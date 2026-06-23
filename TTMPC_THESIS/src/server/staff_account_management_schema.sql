-- Staff Account Management
-- Adds an is_active flag on member_account (for deactivation / termination locks)
-- and a staff_termination_requests table for the Secretary -> BOD workflow.

-- 1. is_active on member_account ---------------------------------------------
ALTER TABLE public.member_account
  ADD COLUMN IF NOT EXISTS is_active boolean NULL DEFAULT true;

-- Backfill any nulls so existing rows behave as active.
UPDATE public.member_account
  SET is_active = true
  WHERE is_active IS NULL;

-- 2. staff_termination_requests ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_termination_requests (
  id                bigserial PRIMARY KEY,
  member_id         text NOT NULL,
  member_account_id uuid NULL,
  previous_role     text NULL,
  resolution_no     text NULL,
  resolution_date   date NULL,
  effective_date    date NULL,
  reason            text NULL,
  notes             text NULL,
  status            text NOT NULL DEFAULT 'awaiting_bod_confirmation',
  requested_by      uuid NULL,
  requested_by_role text NULL,
  requested_at      timestamptz NOT NULL DEFAULT now(),
  decided_by        uuid NULL,
  decided_at        timestamptz NULL,
  decision_notes    text NULL,
  CONSTRAINT staff_termination_requests_status_chk
    CHECK (lower(status) IN ('awaiting_bod_confirmation', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_staff_termination_requests_status
  ON public.staff_termination_requests (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_termination_requests_member
  ON public.staff_termination_requests (member_id);

-- RLS — only service role writes; BOD/Secretary read via backend.
ALTER TABLE public.staff_termination_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role all staff terminations" ON public.staff_termination_requests;
CREATE POLICY "service role all staff terminations"
  ON public.staff_termination_requests
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
