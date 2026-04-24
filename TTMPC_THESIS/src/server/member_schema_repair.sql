-- Member schema/policy repair script
-- Purpose:
-- 1) Remove unsafe public read policies on member_account/member_accounts.
-- 2) Restore expected identity keys used by the app (member.id + member.membership_id).
-- 3) Rebuild safe member_account constraints.
-- 4) Restore member_account RLS policies to own-account scope.
-- 5) Restore the member insert trigger that bootstraps member_account + personal_data_sheet.
--
-- Safe to re-run (idempotent), and does not hard-delete application data.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- A) Ensure member has stable identifiers expected by backend/frontend SQL
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.member
  ADD COLUMN IF NOT EXISTS id uuid,
  ADD COLUMN IF NOT EXISTS membership_id text,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Backfill missing IDs so we can safely enforce uniqueness / FK references.
UPDATE public.member
SET id = gen_random_uuid()
WHERE id IS NULL;

-- Keep UUID generation behavior for new rows.
ALTER TABLE IF EXISTS public.member
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Add uniqueness on member.id when missing (required FK target for user_id links).
DO $$
BEGIN
  IF to_regclass('public.member') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_id_key'
      AND conrelid = 'public.member'::regclass
  ) THEN
    ALTER TABLE public.member
      ADD CONSTRAINT member_id_key UNIQUE (id);
  END IF;
END $$;

-- Ensure membership_id remains unique for membership-key based flows.
DO $$
BEGIN
  IF to_regclass('public.member') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_membership_id_key'
      AND conrelid = 'public.member'::regclass
  ) THEN
    ALTER TABLE public.member
      ADD CONSTRAINT member_membership_id_key UNIQUE (membership_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- B) Normalize member_account structure used by current app logic
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.member_account
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS membership_id text,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS is_temporary boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Sync missing membership_id from member when possible.
UPDATE public.member_account ma
SET membership_id = m.membership_id
FROM public.member m
WHERE ma.user_id = m.id
  AND ma.membership_id IS NULL;

-- Ensure membership_id is the primary key on member_account.
DO $$
DECLARE
  current_pk text;
BEGIN
  IF to_regclass('public.member_account') IS NULL THEN
    RETURN;
  END IF;

  SELECT c.conname
  INTO current_pk
  FROM pg_constraint c
  WHERE c.contype = 'p'
    AND c.conrelid = 'public.member_account'::regclass
  LIMIT 1;

  IF current_pk IS DISTINCT FROM 'member_account_pkey' THEN
    IF current_pk IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.member_account DROP CONSTRAINT %I', current_pk);
    END IF;
    ALTER TABLE public.member_account ADD CONSTRAINT member_account_pkey PRIMARY KEY (membership_id);
  END IF;
END $$;

-- Keep user_id optional, but unique when present.
ALTER TABLE IF EXISTS public.member_account
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.member_account') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_account_user_id_key'
      AND conrelid = 'public.member_account'::regclass
  ) THEN
    ALTER TABLE public.member_account
      ADD CONSTRAINT member_account_user_id_key UNIQUE (user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_account_membership_id_key'
      AND conrelid = 'public.member_account'::regclass
  ) THEN
    ALTER TABLE public.member_account
      ADD CONSTRAINT member_account_membership_id_key UNIQUE (membership_id);
  END IF;
END $$;

-- Re-attach FK from member_account.user_id -> member.id.
DO $$
BEGIN
  IF to_regclass('public.member_account') IS NULL OR to_regclass('public.member') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.member_account DROP CONSTRAINT IF EXISTS member_account_user_id_fkey;
  ALTER TABLE public.member_account
    ADD CONSTRAINT member_account_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.member(id) ON DELETE CASCADE;
END $$;

-- Optional FK from membership_id -> member.membership_id (safe for membership-key lookups).
DO $$
BEGIN
  IF to_regclass('public.member_account') IS NULL OR to_regclass('public.member') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_account_membership_id_fkey'
      AND conrelid = 'public.member_account'::regclass
  ) THEN
    ALTER TABLE public.member_account
      ADD CONSTRAINT member_account_membership_id_fkey
      FOREIGN KEY (membership_id) REFERENCES public.member(membership_id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- C) Remove unsafe public lookup policies and restore strict own-account RLS
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.member_account ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read for login lookup" ON public.member_account;
DROP POLICY IF EXISTS "Allow public read" ON public.member_account;
DROP POLICY IF EXISTS "Public_ID_Lookup" ON public.member_account;
DROP POLICY IF EXISTS "Kiosk_Universal_Visibility" ON public.member_account;

GRANT SELECT, UPDATE ON public.member_account TO authenticated;

DROP POLICY IF EXISTS "authenticated read own account" ON public.member_account;
CREATE POLICY "authenticated read own account"
ON public.member_account
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR auth_user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated update own account" ON public.member_account;
CREATE POLICY "authenticated update own account"
ON public.member_account
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR auth_user_id = auth.uid())
WITH CHECK (user_id = auth.uid() OR auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- D) Restore member insert trigger for bootstrap rows (member_account + PDS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.member_account (
    user_id,
    auth_user_id,
    membership_id,
    email,
    role,
    is_temporary,
    password_hash,
    created_at
  )
  VALUES (
    NEW.id,
    NEW.auth_user_id,
    NEW.membership_id,
    NULL,
    'Member',
    TRUE,
    NULL,
    now()
  )
  ON CONFLICT (membership_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    auth_user_id = COALESCE(EXCLUDED.auth_user_id, public.member_account.auth_user_id),
    is_temporary = COALESCE(public.member_account.is_temporary, TRUE);

  INSERT INTO public.personal_data_sheet (
    personal_data_sheet_id,
    membership_number_id,
    surname,
    first_name,
    middle_name,
    date_of_membership,
    created_at
  )
  VALUES (
    'PDS-' || NEW.membership_id,
    NEW.membership_id,
    NEW.last_name,
    NEW.first_name,
    NEW.middle_initial,
    to_char(COALESCE(NEW.membership_date, CURRENT_DATE), 'YYYY-MM-DD'),
    now()
  )
  ON CONFLICT (membership_number_id) DO UPDATE SET
    surname = COALESCE(EXCLUDED.surname, public.personal_data_sheet.surname),
    first_name = COALESCE(EXCLUDED.first_name, public.personal_data_sheet.first_name),
    middle_name = COALESCE(EXCLUDED.middle_name, public.personal_data_sheet.middle_name),
    date_of_membership = COALESCE(EXCLUDED.date_of_membership, public.personal_data_sheet.date_of_membership);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_member_created ON public.member;
CREATE TRIGGER on_member_created
AFTER INSERT ON public.member
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_member();

COMMIT;

-- ---------------------------------------------------------------------------
-- Post-checks (run manually after COMMIT)
-- ---------------------------------------------------------------------------
-- 1) Confirm key constraints
-- SELECT conname, contype
-- FROM pg_constraint
-- WHERE conrelid = 'public.member_account'::regclass
-- ORDER BY conname;

-- 2) Confirm unsafe public policies are gone
-- SELECT policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'member_account'
-- ORDER BY policyname;

-- 3) Confirm trigger exists
-- SELECT trigger_name, event_manipulation, action_timing
-- FROM information_schema.triggers
-- WHERE event_object_schema = 'public'
--   AND event_object_table = 'member'
-- ORDER BY trigger_name;
