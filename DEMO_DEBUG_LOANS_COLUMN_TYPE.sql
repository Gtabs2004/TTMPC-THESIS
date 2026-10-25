select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'loans'
  and column_name in ('latest_net_pay', 'share_capital', 'monthly_amortization', 'total_interest');
