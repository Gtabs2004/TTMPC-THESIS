-- Supporting documents storage policies for loan approval workflows.
-- Bucket: Supporting_Documents
-- Access:
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
