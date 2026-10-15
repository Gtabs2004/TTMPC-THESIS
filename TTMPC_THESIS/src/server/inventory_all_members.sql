-- ============================================================================
-- INVENTORY: every distinct member/applicant identity in the database, for
-- manual review before any further deletions. Read-only.
-- ============================================================================

-- 1) Every public.member row — the "real" membership roster.
SELECT 'member' AS source, membership_id, first_name, last_name, member_status, membership_date, auth_user_id
FROM public.member
ORDER BY membership_id;

-- 2) Every member_account (login) row — may include staff and applicants.
SELECT 'member_account' AS source, membership_id, email, role, is_active, created_at
FROM public.member_account
ORDER BY membership_id;

-- 3) Every member_applications row — includes pending/rejected/approved, and
-- clearly-fake test entries (short names, "meow", duplicate TABIOLO rows).
SELECT 'member_applications' AS source, application_id, surname, first_name, middle_name, email, membership_id, application_status, created_at
FROM public.member_applications
ORDER BY created_at;

-- 4) Distinct emails appearing in attendance_logs that AREN'T in
-- member_applications' email list — these are "orphan" identities only
-- traceable through this one table.
SELECT DISTINCT al.member_email
FROM public.attendance_logs al
WHERE al.member_email IS NOT NULL
  AND lower(al.member_email) NOT IN (SELECT lower(email) FROM public.member_applications WHERE email IS NOT NULL)
ORDER BY al.member_email;

-- 5) Distinct auth_user_id values in capital_build_up that have NO matching
-- public.member row at all (orphaned CBU activity, possibly from already
-- deleted test accounts, or accounts never fully set up).
SELECT DISTINCT cbu.member_id
FROM public.capital_build_up cbu
WHERE cbu.member_id NOT IN (SELECT id FROM public.member WHERE id IS NOT NULL)
ORDER BY cbu.member_id;

-- 6) auth.users not linked to any current member/member_account row at all
-- (could be leftover test logins with no other footprint).
SELECT au.id, au.email, au.created_at
FROM auth.users au
WHERE au.id NOT IN (SELECT auth_user_id FROM public.member WHERE auth_user_id IS NOT NULL)
  AND au.id NOT IN (SELECT auth_user_id FROM public.member_account WHERE auth_user_id IS NOT NULL)
ORDER BY au.created_at;
