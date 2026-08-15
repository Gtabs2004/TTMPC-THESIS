-- Supporting documents storage policies for loan approval workflows.
-- Bucket: Supporting_Documents
-- Access:
--   - Member: upload collateral photos from loan forms
--   - Bookkeeper: upload/update/delete files
--   - Bookkeeper/Manager/Treasurer: view files
--   - service_role: full access

INSERT INTO storage.buckets (id, name, public)
SELECT 'Supporting_Documents', 'Supporting_Documents', false
WHERE NOT EXISTS (
  SELECT 1
  FROM storage.buckets
  WHERE id = 'Supporting_Documents'
);

-- NOTE:
-- storage.objects is managed by Supabase and already has RLS enabled.
-- Some environments return "must be owner of table objects" when trying
-- to run ALTER TABLE here, so we intentionally skip that statement.

DROP POLICY IF EXISTS supporting_documents_staff_select ON storage.objects;
CREATE POLICY supporting_documents_staff_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'Supporting_Documents'
  AND public.has_portal_role(
    auth.uid(),
    auth.email(),
    ARRAY['bookkeeper', 'manager', 'treasurer']
  )
);

DROP POLICY IF EXISTS supporting_documents_bookkeeper_insert ON storage.objects;
CREATE POLICY supporting_documents_bookkeeper_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'Supporting_Documents'
  AND name LIKE 'loan_supporting_documents/%'
  AND public.has_portal_role(
    auth.uid(),
    auth.email(),
    ARRAY['bookkeeper']
  )
);

DROP POLICY IF EXISTS supporting_documents_member_collateral_insert ON storage.objects;
CREATE POLICY supporting_documents_member_collateral_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'Supporting_Documents'
  AND name LIKE 'loan_collateral/%'
  AND public.has_portal_role(
    auth.uid(),
    auth.email(),
    ARRAY['member']
  )
);

-- Members must be able to read their just-uploaded collateral so the loan
-- form can render a thumbnail preview. Signed URLs also go through this policy.
DROP POLICY IF EXISTS supporting_documents_member_collateral_select ON storage.objects;
CREATE POLICY supporting_documents_member_collateral_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'Supporting_Documents'
  AND name LIKE 'loan_collateral/%'
  AND public.has_portal_role(
    auth.uid(),
    auth.email(),
    ARRAY['member']
  )
);

-- Members can remove a collateral photo they uploaded while filling the loan
-- form (before submission), so an unwanted upload doesn't linger in storage.
DROP POLICY IF EXISTS supporting_documents_member_collateral_delete ON storage.objects;
CREATE POLICY supporting_documents_member_collateral_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'Supporting_Documents'
  AND name LIKE 'loan_collateral/%'
  AND public.has_portal_role(
    auth.uid(),
    auth.email(),
    ARRAY['member']
  )
);

DROP POLICY IF EXISTS supporting_documents_bookkeeper_update ON storage.objects;
CREATE POLICY supporting_documents_bookkeeper_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'Supporting_Documents'
  AND public.has_portal_role(
    auth.uid(),
    auth.email(),
    ARRAY['bookkeeper']
  )
)
WITH CHECK (
  bucket_id = 'Supporting_Documents'
  AND public.has_portal_role(
    auth.uid(),
    auth.email(),
    ARRAY['bookkeeper']
  )
);

DROP POLICY IF EXISTS supporting_documents_bookkeeper_delete ON storage.objects;
CREATE POLICY supporting_documents_bookkeeper_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'Supporting_Documents'
  AND public.has_portal_role(
    auth.uid(),
    auth.email(),
    ARRAY['bookkeeper']
  )
);

DROP POLICY IF EXISTS supporting_documents_service_role_all ON storage.objects;
CREATE POLICY supporting_documents_service_role_all
ON storage.objects
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Member avatar uploads under profiles/{auth.uid()}/...
DROP POLICY IF EXISTS supporting_documents_member_profiles_select ON storage.objects;
CREATE POLICY supporting_documents_member_profiles_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'Supporting_Documents'
  AND split_part(name, '/', 1) = 'profiles'
  AND split_part(name, '/', 2) = auth.uid()::text
);

DROP POLICY IF EXISTS supporting_documents_member_profiles_insert ON storage.objects;
CREATE POLICY supporting_documents_member_profiles_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'Supporting_Documents'
  AND split_part(name, '/', 1) = 'profiles'
  AND split_part(name, '/', 2) = auth.uid()::text
);

DROP POLICY IF EXISTS supporting_documents_member_profiles_update ON storage.objects;
CREATE POLICY supporting_documents_member_profiles_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'Supporting_Documents'
  AND split_part(name, '/', 1) = 'profiles'
  AND split_part(name, '/', 2) = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'Supporting_Documents'
  AND split_part(name, '/', 1) = 'profiles'
  AND split_part(name, '/', 2) = auth.uid()::text
);

DROP POLICY IF EXISTS supporting_documents_member_profiles_delete ON storage.objects;
CREATE POLICY supporting_documents_member_profiles_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'Supporting_Documents'
  AND split_part(name, '/', 1) = 'profiles'
  AND split_part(name, '/', 2) = auth.uid()::text
);
