-- Account Security: Email + Password Change with OTP
-- Adds is_email_dummy flag on member_account (for migrated members whose
-- email is a placeholder), and account_change_otp table that backs the
-- OTP-based confirmation flow for both email and password changes.

-- 1. is_email_dummy on member_account ----------------------------------------
-- TRUE for members imported via the Python migration script (placeholder
-- email like memberXXXX@dummy.ttmpc.local). FALSE for real applicants whose
-- email came from the application form. The frontend route guard uses this
-- to force migrated members through the change-email flow on first login.
ALTER TABLE public.member_account
  ADD COLUMN IF NOT EXISTS is_email_dummy boolean NOT NULL DEFAULT false;

-- Optional mirror of a pending new email while Supabase secure-email-change
-- is in flight. Cleared once the user confirms (or never set for the
-- first-login flow which uses email_confirm=True and skips the confirm link).
ALTER TABLE public.member_account
  ADD COLUMN IF NOT EXISTS pending_email text NULL;

-- 2. account_change_otp ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_change_otp (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  uuid NOT NULL,
  purpose       text NOT NULL,
  code_hash     text NOT NULL,
  payload       jsonb NULL,
  expires_at    timestamptz NOT NULL,
  attempts      int  NOT NULL DEFAULT 0,
  consumed      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_change_otp_purpose_chk
    CHECK (purpose IN ('email_change', 'email_change_initial', 'password_change'))
);

-- Lookup the latest active OTP for a (user, purpose) pair.
CREATE INDEX IF NOT EXISTS idx_account_change_otp_lookup
  ON public.account_change_otp (auth_user_id, purpose, consumed, created_at DESC);

-- Periodic cleanup helper (expired rows).
CREATE INDEX IF NOT EXISTS idx_account_change_otp_expires_at
  ON public.account_change_otp (expires_at);

-- RLS — backend only.
ALTER TABLE public.account_change_otp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role all account_change_otp" ON public.account_change_otp;
CREATE POLICY "service role all account_change_otp"
  ON public.account_change_otp
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
