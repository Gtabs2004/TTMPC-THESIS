-- Read-only: figure out whether these two UUIDs are auth.users ids,
-- member.id, or member_account.user_id, and get their emails.

SELECT 'auth.users' AS source, id, email FROM auth.users
WHERE id IN ('aa7a8243-1d17-47ea-9840-2434aaca6213', '19f5e0fa-cbbe-4323-a5f9-0d207a01593f');

SELECT 'member' AS source, id, membership_id, first_name, last_name, auth_user_id FROM public.member
WHERE id IN ('aa7a8243-1d17-47ea-9840-2434aaca6213', '19f5e0fa-cbbe-4323-a5f9-0d207a01593f');

SELECT 'member_account' AS source, user_id, membership_id, email, auth_user_id FROM public.member_account
WHERE user_id IN ('aa7a8243-1d17-47ea-9840-2434aaca6213', '19f5e0fa-cbbe-4323-a5f9-0d207a01593f');
