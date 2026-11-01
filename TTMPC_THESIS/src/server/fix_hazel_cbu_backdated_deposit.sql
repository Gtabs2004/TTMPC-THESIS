-- Fix: Hazel P. Gumban (TTMPC-310) — two bugs compounded on her CBU ledger.
--
-- 1) Two "Initial Paid-Up Capital" ₱20,000 rows were seeded for the same
--    membership confirmation:
--      CBUD_309 (2026-10-26 00:00:00) — from applicationConfirmation.py's
--        confirm_membership(), deposit_account = "Initial Paid-Up Capital".
--      CBUD_310 (2026-10-26 15:37:34) — from main.py's
--        _seed_initial_capital_build_up(), which ran right after on the same
--        confirmation but checked deposit_account = "INITIAL_PAID_UP_CAPITAL"
--        (all caps) — a case mismatch with what CBUD_309 actually stored —
--        so its "already seeded?" guard never saw CBUD_309 and inserted a
--        duplicate. Fixed in code (main.py now checks for ANY existing CBU
--        row, matching applicationConfirmation.py's own guard), so this
--        won't recur on future confirmations.
--
-- 2) A real ₱43,000 CBU deposit (CBUD_2772) was entered dated 2026-10-25 —
--    one day before both Oct 26 rows above — even though it was actually
--    entered afterward. Every "latest CBU row" lookup in the app (Member
--    dashboard, Cashier CBU list, the deposit endpoint's own running-balance
--    walk) picks the latest row by transaction_date, so the Oct 26 duplicate
--    kept winning and the ₱43,000 deposit's ending balance never surfaced.
--    Also fixed in code: the deposit endpoint now rejects a transaction_date
--    earlier than the member's current latest CBU row.
--
-- This script: delete the duplicate CBUD_310, then move CBUD_2772 to
-- 2026-10-26 (same day as the real initial-capital row, later in the
-- insertion-order tiebreak since its cbu_deposit_id suffix 2772 > 309), then
-- recompute her stored balance. Final share_capital_amount should read
-- ₱63,000.00.
--
-- Run in Supabase SQL editor. Step 0 re-confirms current state before
-- touching anything.

BEGIN;

-- 0) Confirm current state before changing anything.
SELECT id, cbu_deposit_id, transaction_date, starting_share_capital,
       capital_added, ending_share_capital, deposit_account
FROM public.capital_build_up
WHERE member_id = (SELECT id FROM public.member WHERE membership_id = 'TTMPC-310')
ORDER BY transaction_date, cbu_deposit_id;

-- 1) Delete the duplicate initial-capital row (CBUD_310).
DELETE FROM public.capital_build_up
WHERE id = '47e5c315-e092-46b4-86e3-67947d74481f'
  AND cbu_deposit_id = 'CBUD_310';

-- 2) Move the real ₱43,000 deposit (CBUD_2772) to 2026-10-26, so it chains
--    correctly after the real initial-capital row (CBUD_309) instead of
--    sorting before it.
UPDATE public.capital_build_up
SET transaction_date = '2026-10-26'
WHERE id = '466887f8-717d-4419-b86b-be6bc41ade2f'
  AND cbu_deposit_id = 'CBUD_2772';

-- 3) Recompute her stored share_capital_amount / number_of_shares (the
--    triggers on the DELETE/UPDATE above should already do this, but this
--    makes it explicit and is safe to re-run).
SELECT public.recompute_member_shares(
  (SELECT id FROM public.member WHERE membership_id = 'TTMPC-310')
);

-- 4) Verify the final ledger and balance before committing.
SELECT id, cbu_deposit_id, transaction_date, starting_share_capital,
       capital_added, ending_share_capital, deposit_account
FROM public.capital_build_up
WHERE member_id = (SELECT id FROM public.member WHERE membership_id = 'TTMPC-310')
ORDER BY transaction_date, cbu_deposit_id;

SELECT share_capital_amount, number_of_shares
FROM public.member
WHERE membership_id = 'TTMPC-310';

-- If everything above looks right (single ₱20,000 initial-capital row,
-- ₱43,000 deposit chained after it, share_capital_amount = 63000.00):
COMMIT;

-- If anything looks wrong, run ROLLBACK instead of COMMIT.
