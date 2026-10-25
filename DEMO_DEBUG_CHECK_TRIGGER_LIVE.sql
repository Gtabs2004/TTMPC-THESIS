-- Is the trigger actually attached to capital_build_up right now?
select tgname, tgenabled, tgrelid::regclass
from pg_trigger
where tgrelid = 'public.capital_build_up'::regclass
  and not tgisinternal;

-- What does the live recompute_member_shares() function body look like?
select pg_get_functiondef('public.recompute_member_shares(uuid)'::regprocedure);

-- Manually call it for Ashley and see if it fixes her -- proves whether the
-- function itself is correct and only the trigger/auto-fire is the problem.
select public.recompute_member_shares('43ee8ea8-ed69-4eaf-8428-95de2efa0861'::uuid);

select id, membership_id, share_capital_amount from public.member
where id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861';
