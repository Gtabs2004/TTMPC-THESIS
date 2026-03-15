-- Run this in Supabase SQL editor.
-- It enables RLS and allows backend service role access for membership confirmation.

ALTER TABLE IF EXISTS membership_application ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS member_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS member ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.membership_application ADD COLUMN IF NOT EXISTS membership_id TEXT;
ALTER TABLE IF EXISTS public.membership_application ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.membership_application ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE IF EXISTS public.membership_application ADD COLUMN IF NOT EXISTS approved_by_role TEXT;

ALTER TABLE IF EXISTS public.member_applications ADD COLUMN IF NOT EXISTS membership_id TEXT;
ALTER TABLE IF EXISTS public.member_applications ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.member_applications ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE IF EXISTS public.member_applications ADD COLUMN IF NOT EXISTS approved_by_role TEXT;

DO $$
BEGIN
  IF to_regclass('public.membership_application') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "service role read applications" ON membership_application';
    EXECUTE 'CREATE POLICY "service role read applications" ON membership_application FOR SELECT USING (auth.role() = ''service_role'')';

    EXECUTE 'DROP POLICY IF EXISTS "service role update applications" ON membership_application';
    EXECUTE 'CREATE POLICY "service role update applications" ON membership_application FOR UPDATE USING (auth.role() = ''service_role'')';
  END IF;

  IF to_regclass('public.member_applications') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "service role read applications" ON member_applications';
    EXECUTE 'CREATE POLICY "service role read applications" ON member_applications FOR SELECT USING (auth.role() = ''service_role'')';

    EXECUTE 'DROP POLICY IF EXISTS "service role update applications" ON member_applications';
    EXECUTE 'CREATE POLICY "service role update applications" ON member_applications FOR UPDATE USING (auth.role() = ''service_role'')';
  END IF;
END $$;

DROP POLICY IF EXISTS "service role insert members" ON member;
CREATE POLICY "service role insert members"
ON member
FOR INSERT
WITH CHECK (auth.role() = 'service_role');
