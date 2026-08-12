-- =====================================================================
-- RPC: get_member_login_bundle
-- Purpose: Collapse the 9 sequential Supabase queries that
--          Member_Dashboard.jsx fires on first paint into ONE round-trip.
--
-- Deploy:  Paste this whole file into Supabase → SQL Editor → Run.
--          Safe to re-run: uses CREATE OR REPLACE.
--
-- Called from: TTMPC_THESIS/src/Member/Components/Member_Dashboard.jsx
--   const { data } = await supabase.rpc('get_member_login_bundle', {
--     p_auth_user_id: sessionUser.id
--   });
--
-- Returns JSON shape:
--   {
--     account:            member_account row (or null),
--     member:             personal_data_sheet row keyed by membership_number_id,
--     avatar_url:         profiles.avatar_url,
--     application:        latest member_applications row (by membership_id, else email),
--     loans:              [ loan rows, newest application_date first ],
--     cbu:                [ capital_build_up rows, newest first ],
--     savings:            [ Savings_Transactions rows ],
--     upcoming_schedules: [ loan_schedules for member's loans, earliest due first ],
--     pending_savings:    [ savings_transaction_queue, latest 6 ],
--     recent_payments:    [ loan_payments for member's loans, latest 6 ]
--   }
--
-- SECURITY: SECURITY DEFINER + explicit auth.uid() check.
--   The caller must be authenticated AND their auth.uid() must match
--   the p_auth_user_id argument. Prevents one member reading another's
--   bundle even though the function bypasses RLS.
-- =====================================================================

create or replace function public.get_member_login_bundle(p_auth_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account        json;
  v_membership_id  text;
  v_member_id_text text;
  v_loan_ids       text[];
  result           json;
begin
  -- Guard: caller must be the same user they're asking about.
  if auth.uid() is null or auth.uid() <> p_auth_user_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- Resolve the member_account row for this auth user.
  select row_to_json(ma) into v_account
  from public.member_account ma
  where ma.auth_user_id = p_auth_user_id
  limit 1;

  if v_account is null then
    return json_build_object(
      'account', null,
      'error',   'account_not_found'
    );
  end if;

  v_membership_id  := v_account ->> 'membership_id';
  v_member_id_text := coalesce(v_account ->> 'user_id', p_auth_user_id::text);

  -- Pre-compute this member's loan control_numbers so schedule/payment
  -- subqueries don't have to repeat the join.
  select coalesce(array_agg(l.control_number::text), array[]::text[])
    into v_loan_ids
  from public.loans l
  where l.member_id::text = v_member_id_text;

  select json_build_object(
    'account',    v_account,

    'member',     (
      select row_to_json(m)
      from public.personal_data_sheet m
      where m.membership_number_id = v_membership_id
      limit 1
    ),

    'avatar_url', (
      select p.avatar_url
      from public.profiles p
      where p.id = p_auth_user_id
      limit 1
    ),

    'application', coalesce(
      (select row_to_json(a)
         from public.member_applications a
        where a.membership_id = v_membership_id
        order by a.created_at desc
        limit 1),
      (select row_to_json(a)
         from public.member_applications a
        where a.email ilike (select email from public.member_account where auth_user_id = p_auth_user_id limit 1)
        order by a.created_at desc
        limit 1)
    ),

    'loans', coalesce((
      select json_agg(row_to_json(l) order by l.application_date desc)
      from (
        select control_number, principal_amount, loan_amount, total_interest,
               monthly_amortization, loan_status, application_date, term
        from public.loans
        where member_id::text = v_member_id_text
      ) l
    ), '[]'::json),

    'cbu', coalesce((
      select json_agg(row_to_json(c) order by c.transaction_date desc)
      from (
        select starting_share_capital, ending_share_capital,
               capital_added, transaction_date
        from public.capital_build_up
        where member_id::text = v_member_id_text
      ) c
    ), '[]'::json),

    'savings', coalesce((
      select json_agg(row_to_json(s))
      from (
        select "Balance", "Savings_Amount", "Amount"
        from public."Savings_Transactions"
        where membership_number_id = v_membership_id
      ) s
    ), '[]'::json),

    'upcoming_schedules', coalesce((
      select json_agg(row_to_json(ls) order by ls.due_date asc)
      from (
        select loan_id, due_date, schedule_status, expected_amount
        from public.loan_schedules
        where loan_id = any (v_loan_ids)
      ) ls
    ), '[]'::json),

    'pending_savings', coalesce((
      select json_agg(row_to_json(q) order by q.requested_at desc)
      from (
        select transaction_id, transaction_type, amount,
               requested_at, transaction_status
        from public.savings_transaction_queue
        where membership_number_id = v_membership_id
        order by requested_at desc
        limit 6
      ) q
    ), '[]'::json),

    'recent_payments', coalesce((
      select json_agg(row_to_json(p) order by p.payment_date desc)
      from (
        select id, payment_date, amount_paid, penalties, loan_id
        from public.loan_payments
        where loan_id = any (v_loan_ids)
        order by payment_date desc
        limit 6
      ) p
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

-- Allow authenticated users to call it. The function itself enforces
-- that they can only fetch their own bundle.
revoke all on function public.get_member_login_bundle(uuid) from public;
grant execute on function public.get_member_login_bundle(uuid) to authenticated;
