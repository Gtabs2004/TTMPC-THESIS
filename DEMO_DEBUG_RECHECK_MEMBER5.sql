select id, membership_id, share_capital_amount from public.member
where id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861';

select cbu_deposit_id, transaction_date, ending_share_capital
from public.capital_build_up
where member_id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861'
order by transaction_date desc, id desc;

-- Also check personal_data_sheet -- the Member Profile page may read from
-- there instead of/in addition to public.member (sync_member_shares_from_cbu.sql
-- mirrors into both).
select membership_number_id, number_of_shares, amount
from public.personal_data_sheet
where membership_number_id = 'TTMPC-308';

-- Confirm the loan landed too.
select control_number, loan_status, loan_amount, monthly_amortization
from public.loans where control_number = 'CL-20260210-9308';
