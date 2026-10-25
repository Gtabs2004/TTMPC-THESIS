select membership_number_id, number_of_shares, amount
from public.personal_data_sheet
where membership_number_id = 'TTMPC-308';

select id, membership_id, share_capital_amount, number_of_shares
from public.member
where id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861';
