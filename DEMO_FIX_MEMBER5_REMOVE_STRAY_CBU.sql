-- CBUD_304 is a stray duplicate "initial capital" row for Ashley
-- (TTMPC-308) -- same 20,000.00 figure as her real initial row CBUD_303,
-- but auto-stamped later in the day (03:31:11 UTC vs CBUD_303/CBUD_2764's
-- 00:00:00), which made it win recompute_member_shares()'s "latest by
-- transaction_date" sort and freeze her dashboard at 20,000.00 even after
-- her real 70,000.00 Cashier deposit (CBUD_2764, ending_share_capital =
-- 90,000.00). Not a real transaction -- removing it, not just excluding it
-- from the sort, since it has no recorded_by/source_payment_id tying it to
-- an actual event (unlike CBUD_303, which has source_payment_id =
-- 'TTMPCPC-037').

begin;
set local session_replication_role = 'replica';

delete from public.capital_build_up
where cbu_deposit_id = 'CBUD_304'
  and member_id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861';

commit;

-- Now recompute her shares from the real remaining rows.
select public.recompute_member_shares('43ee8ea8-ed69-4eaf-8428-95de2efa0861'::uuid);

-- Verify:
select id, membership_id, share_capital_amount from public.member
where id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861';
-- Expect 90000.00.

select cbu_deposit_id, transaction_date, ending_share_capital
from public.capital_build_up
where member_id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861'
order by transaction_date desc, id desc;
-- Expect only CBUD_303 (20000) and CBUD_2764 (90000) remaining.
