-- Member-first import migration
-- This migration sets membership_id as the operational identifier
-- and uses an AFTER INSERT trigger on public.member.
--
-- Review carefully before running in production.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Ensure member has a direct optional auth linkage for officer accounts.
ALTER TABLE public.member
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'member'
      AND tc.constraint_name = 'member_auth_user_id_fkey'
  ) THEN
    ALTER TABLE public.member
      ADD CONSTRAINT member_auth_user_id_fkey
      FOREIGN KEY (auth_user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 2) Add fields needed for membership_id-first auth in member_account.
ALTER TABLE public.member_account
  ADD COLUMN IF NOT EXISTS membership_id text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

UPDATE public.member_account ma
SET membership_id = m.membership_id,
    auth_user_id = m.auth_user_id
FROM public.member m
WHERE ma.user_id = m.id
  AND (ma.membership_id IS NULL OR ma.auth_user_id IS NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'member_account'
      AND tc.constraint_name = 'member_account_membership_id_key'
  ) THEN
    ALTER TABLE public.member_account
      ADD CONSTRAINT member_account_membership_id_key UNIQUE (membership_id);
  END IF;
END $$;

-- 3) Trigger function: create member_account + personal_data_sheet rows from member.
CREATE OR REPLACE FUNCTION public.handle_new_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- member_account bootstrap row
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

  -- personal_data_sheet bootstrap row
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
