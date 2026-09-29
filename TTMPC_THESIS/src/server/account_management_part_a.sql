-- Account Management & termination — Part A
-- (ACCOUNT_MANAGEMENT_TERMINATION_PLAN.md §6)
-- Run in Supabase SQL editor.
--
-- 1. member_account.can_manage_accounts — the one designated BOD who may use
--    the Account Management page (assign staff roles, terminate members).
--    All BOD keep role 'bod'; this flag is the extra permission on top.
--    Starts ON for BOD@gmail.com (TTMPC-004) so there is always one admin.
-- 2. member.termination_cbu_total — the member's CBU balance on the day BOD
--    terminates them, kept as a fixed figure for the Cashier's CBU payout
--    (Part B).
--
-- Additive only (two nullable/defaulted columns). Idempotent: safe to re-run.
-- To undo: DROP COLUMN both.

BEGIN;

ALTER TABLE public.member_account
  ADD COLUMN IF NOT EXISTS can_manage_accounts boolean NOT NULL DEFAULT false;

UPDATE public.member_account
SET can_manage_accounts = true
WHERE lower(email) = 'bod@gmail.com'
  AND lower(btrim(coalesce(role, ''))) = 'bod';

ALTER TABLE public.member
  ADD COLUMN IF NOT EXISTS termination_cbu_total numeric(14, 2);

COMMIT;

-- Check 1: exactly one account admin, and it is a BOD (expect 1 row).
SELECT membership_id, email, role, can_manage_accounts
FROM public.member_account
WHERE can_manage_accounts;

-- Check 2 (plan §5, one-time): members stuck by the old Secretary termination
-- request flow — locked (is_active = false) by a request that no BOD screen
-- could ever confirm. Each needs a decision: terminate properly from Account
-- Management, or unlock (UPDATE member_account SET is_active = true ...).
-- Expect 0 rows ideally.
SELECT r.id AS request_id, r.member_id, r.requested_at, r.reason,
       m.member_status, ma.is_active
FROM public.staff_termination_requests r
LEFT JOIN public.member m ON m.membership_id = r.member_id
LEFT JOIN public.member_account ma ON ma.membership_id = r.member_id
WHERE r.status = 'awaiting_bod_confirmation'
ORDER BY r.requested_at;
