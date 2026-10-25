select cbu_deposit_id, transaction_date, ending_share_capital,
  NULLIF(regexp_replace(coalesce(cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer as suffix
from public.capital_build_up
where member_id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861'
order by transaction_date desc, id desc;
