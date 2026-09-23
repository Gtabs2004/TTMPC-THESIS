-- Prevents the same email address from being submitted twice as a member
-- application. Additive, safe to re-run.
--
-- Scope: a PARTIAL unique index, not a plain one — a rejected/denied
-- application must not permanently block that person from applying again.
-- Every other status ('pending', 'for revision', 'official member'/'member',
-- etc.) still counts as "this email is already in the pipeline or already a
-- member" and stays blocked. See BOD/Components/Member-Approvals.jsx's
-- isRejected()/isApproved() for the same status vocabulary.
--
-- This is the actual enforcement layer: the frontend's pre-submit check
-- (Membership_Form.jsx) is a best-effort courtesy for a friendly inline
-- message, but the member_applications table has no SELECT policy for the
-- public/anon role that submits this form (it's a PII table), so that
-- pre-check can return nothing even when a duplicate exists. Only this index
-- guarantees no duplicate row lands, race conditions included.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS member_applications_email_live_uniq
  ON public.member_applications (lower(btrim(email)))
  WHERE email IS NOT NULL
    AND btrim(email) <> ''
    AND lower(btrim(coalesce(application_status, ''))) NOT IN ('rejected', 'denied');

COMMENT ON INDEX public.member_applications_email_live_uniq IS
  'Case-insensitive: at most one non-rejected/denied application per email. Re-application after rejection/denial is allowed.';

COMMIT;
