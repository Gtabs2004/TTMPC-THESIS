-- Ashley's P70,000 deposit was done live via Cashier/Bookkeeper (CBU ledger
-- row CBUD_2764, recorded_by a real user) -- capital_build_up correctly
-- shows ending_share_capital = 90,000.00, but her Member dashboard still
-- shows Share Capital = 20,000.00, meaning member.share_capital_amount
-- never synced (recompute_member_shares() apparently didn't fire, or isn't
-- wired to this deposit path). Syncing it directly here so the Consolidated
-- ceiling check (main.py line 8054, reads member.share_capital_amount
-- first) and her dashboard both reflect the real 90,000.00 balance.

update public.member
set share_capital_amount = 90000.00
where id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861';

-- Verify:
select id, membership_id, share_capital_amount from public.member
where id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861';
-- Expect 90000.00.
