-- Run this in Supabase SQL editor.
-- Purpose: allow authenticated users to read ONLY their own member_applications
-- for loan form prefill (frontend/anon key with auth session).

ALTER TABLE IF EXISTS public.member_applications ENABLE ROW LEVEL SECURITY;

-- Optional baseline grant for PostgREST authenticated role.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.member_applications TO authenticated;

DROP POLICY IF EXISTS "authenticated read own member applications for prefill" ON public.member_applications;
CREATE POLICY "authenticated read own member applications for prefill"
ON public.member_applications
FOR SELECT
TO authenticated
USING (
  -- Match by signed-in email
  lower(coalesce(email, '')) = lower(auth.email())
  OR
  -- Or match by membership_id linked from the signed-in member profile
  EXISTS (
    SELECT 1
    FROM public.member m
    WHERE m.id = auth.uid()
      AND m.membership_id IS NOT NULL
      AND m.membership_id = member_applications.membership_id
  )
);
