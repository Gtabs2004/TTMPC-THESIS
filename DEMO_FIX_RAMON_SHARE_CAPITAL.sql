-- Fix for TTMPC-302 Ramon S. Villanueva's P600,000 Consolidated loan
-- (CL-20261024-9302). The Consolidated ceiling the app actually enforces is
-- share_capital * multiplier (main.py line 8293), read from
-- member.share_capital_amount first (line 8054), falling back to CBU's
-- latest ending_share_capital only if that's 0/unset (line 8055-8066).
--
-- Our CBU seed only gave him ending_share_capital = 125,000.00
-- (DEMO_LOAN_SEED_MEMBERS_TIER1.sql line 341), and because all our seed
-- inserts run under session_replication_role = 'replica' (bypasses ALL
-- triggers, including recompute_member_shares() -- CLAUDE.md), that CBU
-- balance never synced into member.share_capital_amount.
--
-- No MIGS classification was seeded for him either, so the backend
-- defaults to Non-MIGS (multiplier = 3.0, main.py line 8068). That means
-- his ceiling = share_capital * 3. Even his seeded CBU figure (125,000)
-- only supports a 375,000 ceiling -- nowhere near his 600,000 loan.
--
-- Fix: raise his CBU (and the member.share_capital_amount it should be
-- mirroring) to 210,000 -- comfortably clears the 200,000 minimum needed
-- for a 600,000 ceiling at 3x, while staying consistent with the
-- "high risk, >P500k, BOD route" scenario (adequate capital, not flush).

begin;
set local session_replication_role = 'replica';

-- Add a second CBU row so the deposit history stays coherent (starting
-- balance picks up from the existing 125,000.00 ending balance).
insert into public.capital_build_up (
  member_id, transaction_date, capital_added, starting_share_capital,
  ending_share_capital, deposit_account, cbu_deposit_id
) values (
  'c6372942-1d99-4733-8884-5c95c3c7ee99', '2026-10-01'::timestamptz,
  85000.00, 125000.00, 210000.00, 'cash', 'CBUD_902B'
);

-- Mirror it into member.share_capital_amount, since the sync trigger was
-- bypassed for all our seed inserts.
update public.member
set share_capital_amount = 210000.00
where id = 'c6372942-1d99-4733-8884-5c95c3c7ee99';

commit;

-- Verify:
select share_capital_amount from public.member where id = 'c6372942-1d99-4733-8884-5c95c3c7ee99';
select ending_share_capital from public.capital_build_up
where member_id = 'c6372942-1d99-4733-8884-5c95c3c7ee99' order by transaction_date desc limit 1;
-- Expect both = 210000.00. Ceiling = 210000 * 3 = 630000, which clears his 600000 loan.
