-- Storage policies for BOD high-value loan approval evidence.
-- Bucket: Supporting_Documents, path prefix: bod_resolution/
--
-- BOD can upload + update + delete their resolution files.
-- BOD, Manager, Treasurer, Bookkeeper can read them (for audit / next-stage review).
-- Service role bypasses (already covered by supporting_documents_service_role_all).

DROP POLICY IF EXISTS supporting_documents_bod_resolution_select ON storage.objects;
CREATE POLICY supporting_documents_bod_resolution_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'Supporting_Documents'
  AND name LIKE 'bod_resolution/%'
  AND public.has_portal_role(
    auth.uid(),
    auth.email(),
    ARRAY['bod', 'manager', 'treasurer', 'bookkeeper']
  )
);

DROP POLICY IF EXISTS supporting_documents_bod_resolution_insert ON storage.objects;
CREATE POLICY supporting_documents_bod_resolution_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'Supporting_Documents'
  AND name LIKE 'bod_resolution/%'
  AND public.has_portal_role(
    auth.uid(),
    auth.email(),
    ARRAY['bod']
  )
);

DROP POLICY IF EXISTS supporting_documents_bod_resolution_update ON storage.objects;
CREATE POLICY supporting_documents_bod_resolution_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'Supporting_Documents'
  AND name LIKE 'bod_resolution/%'
  AND public.has_portal_role(
    auth.uid(),
    auth.email(),
    ARRAY['bod']
  )
)
WITH CHECK (
  bucket_id = 'Supporting_Documents'
  AND name LIKE 'bod_resolution/%'
  AND public.has_portal_role(
    auth.uid(),
    auth.email(),
    ARRAY['bod']
  )
);

DROP POLICY IF EXISTS supporting_documents_bod_resolution_delete ON storage.objects;
CREATE POLICY supporting_documents_bod_resolution_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'Supporting_Documents'
  AND name LIKE 'bod_resolution/%'
  AND public.has_portal_role(
    auth.uid(),
    auth.email(),
    ARRAY['bod']
  )
);
