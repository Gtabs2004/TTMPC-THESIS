-- Revert the accidental termination of Hazel P Gumban (TTMPC-310),
-- resolution TERM-2026-0003.
--
-- What the termination actually wrote (traced from _finalize_termination /
-- accounts_terminate_member in main.py):
--   1. member.member_status -> 'terminated' (+ termination_date,
--      termination_resolution_number, termination_cbu_total)
--   2. member_account.role -> 'Member', is_active -> false
--      (can_manage_accounts untouched here since it wasn't set for her)
--   3. Supabase Auth: her auth user was BANNED (ban_duration set) — this is
--      NOT a table and can't be undone by SQL. See the note after this
--      script for how to unban her.
--   4. A staff_termination_requests row inserted, status='approved'.
--   5. loan_notifications rows for secretary/cashier — informational only,
--      harmless to leave; deleted here for cleanliness since the event
--      never really happened.
--
-- Her CBU ("To Loans" = ₱0.00) was NOT touched — _apply_cbu_loan_offset
-- returns immediately when there's nothing to offset, so no loan payments,
-- cbu_payouts, or CBU withdrawal rows were created. Nothing to undo there.
-- Her status also never reached 'closed' (refundable > 0), so Part C's
-- _close_member never ran — no auth-user deletion, no personal-data wipe.
-- This is a clean, fully reversible case.
--
-- Run in Supabase SQL editor. Step 0 confirms current state first.

BEGIN;

-- 0) Confirm current state before changing anything.
SELECT id, membership_id, member_status, termination_date,
       termination_resolution_number, termination_cbu_total
FROM public.member
WHERE membership_id = 'TTMPC-310';

SELECT membership_id, role, is_active, can_manage_accounts, auth_user_id
FROM public.member_account
WHERE membership_id = 'TTMPC-310';

SELECT id, status, decision_notes, resolution_no, requested_at, decided_at
FROM public.staff_termination_requests
WHERE member_id = 'TTMPC-310'
ORDER BY requested_at DESC;

-- 1) Restore member_status and clear the termination stamp.
UPDATE public.member
SET member_status = 'active',
    termination_date = NULL,
    termination_resolution_number = NULL,
    termination_cbu_total = NULL
WHERE membership_id = 'TTMPC-310';

-- 2) Re-activate the account and restore her role. Replace 'Member' below
--    with whatever her actual pre-termination role was if it wasn't a plain
--    Member (check step 0's member_account output first — previous_role on
--    the staff_termination_requests row below also shows it).
SELECT previous_role FROM public.staff_termination_requests
WHERE member_id = 'TTMPC-310'
ORDER BY requested_at DESC
LIMIT 1;

UPDATE public.member_account
SET is_active = true
    -- , role = '<previous_role if different from Member>'
WHERE membership_id = 'TTMPC-310';

-- 3) Remove the termination history row and the two notifications it fired,
--    since the event is being fully undone (not just reversed-but-logged).
DELETE FROM public.staff_termination_requests
WHERE member_id = 'TTMPC-310'
  AND resolution_no = 'TERM-2026-0003';

DELETE FROM public.loan_notifications
WHERE notification_type = 'member_terminated'
  AND message LIKE '%TTMPC-310%';

-- 4) Verify.
SELECT id, membership_id, member_status, termination_date,
       termination_resolution_number, termination_cbu_total
FROM public.member
WHERE membership_id = 'TTMPC-310';

SELECT membership_id, role, is_active
FROM public.member_account
WHERE membership_id = 'TTMPC-310';

-- If everything looks right (member_status = 'active', is_active = true):
COMMIT;

-- If anything looks wrong, run ROLLBACK instead of COMMIT.

-- ---------------------------------------------------------------------
-- STEP 5 — NOT SQL. Her Supabase Auth user is still banned and SQL can't
-- undo that (auth.users isn't directly writable, and ban_duration is set
-- via the Auth Admin API). To unban her:
--   a) Supabase Dashboard -> Authentication -> Users -> find her by email
--      -> the "..." menu -> remove the ban / un-restrict access; OR
--   b) Call the backend once (it already has this exact logic):
--      POST _set_sign_in_blocked(auth_user_id, False) isn't an HTTP route,
--      but re-running the account activation path in
--      Account_Management.jsx (BOD -> Account Management -> reactivate, if
--      such an action exists) would call it. If there's no reactivate
--      button in the UI, the quickest fix is the Dashboard unban in (a).
-- ---------------------------------------------------------------------
