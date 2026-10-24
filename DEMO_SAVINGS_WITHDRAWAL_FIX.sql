-- Fix for the 3 seeded savings_transaction_queue rows (DEMO_SAVINGS_SEED_MEMBERS_TIER1.sql).
-- The Bookkeeper's Savings Withdrawal Verification page renders:
--   typeLabel: row.account_type || row.transaction_type
-- (Savings-Transactions.jsx line 76). The real backend (main.py lines 11222,
-- 12261) always writes account_type = "Savings Withdrawal" for a withdrawal
-- queue row -- it's the human-readable label, NOT the member/account kind.
-- transaction_type ("withdraw") is the separate machine-readable field the
-- backend logic branches on.
--
-- Our seed set account_type = 'member' (the savings_accounts.account_kind
-- value, a different concept entirely), which is why the page showed "member"
-- instead of "Savings Withdrawal" for our 3 rows while the real rows correctly
-- showed the proper label.

update public.savings_transaction_queue
set account_type = 'Savings Withdrawal'
where transaction_id in ('SVQ-TTMPC-301-001', 'SVQ-TTMPC-303-001', 'SVQ-TTMPC-307-001');

-- Verify:
select transaction_id, member_name, account_type, transaction_type
from public.savings_transaction_queue
where transaction_id in ('SVQ-TTMPC-301-001', 'SVQ-TTMPC-303-001', 'SVQ-TTMPC-307-001');
