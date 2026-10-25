select control_number, loan_status, loan_amount from public.loans
where control_number = 'CL-20260210-9308';

select id, membership_id, share_capital_amount from public.member
where id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861';

select * from public.capital_build_up
where member_id = '43ee8ea8-ed69-4eaf-8428-95de2efa0861'
order by transaction_date;
