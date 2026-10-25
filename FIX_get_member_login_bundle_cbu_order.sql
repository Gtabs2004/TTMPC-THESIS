-- Bug: get_member_login_bundle()'s 'cbu' subquery orders only by
-- transaction_date DESC. Two same-day capital_build_up rows (identical
-- timestamp, e.g. both midnight-stamped) have no secondary sort key, so
-- Postgres returns them in arbitrary order -- the Member Dashboard takes
-- cbu[0] as "today's" balance (Member_Dashboard.jsx line 351-356), so it
-- can show a STALE, smaller balance even after a real, larger same-day
-- CBU deposit. Confirmed live: TTMPC-308 showed Share Capital = 20,000.00
-- on her dashboard after a real 70,000.00 Cashier deposit brought her to
-- 90,000.00 same calendar day (both rows transaction_date = 2026-10-25
-- 00:00:00+00) -- the Bookkeeper CBU page and recompute_member_shares()
-- (which both/now tiebreak on cbu_deposit_id's numeric suffix, per
-- cbu_share_sync_fix_future_dated.sql) showed the correct 90,000.00; only
-- this RPC's bare transaction_date sort did not.
--
-- Fix: add the same cbu_deposit_id-suffix tiebreak already used elsewhere
-- in the codebase, then id DESC as a final fallback. Also include
-- cbu_deposit_id in the selected columns and subquery sort so json_agg's
-- own ORDER BY can reference it.

CREATE OR REPLACE FUNCTION public.get_member_login_bundle(p_auth_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      select json_agg(row_to_json(c) order by
        c.transaction_date desc,
        nullif(regexp_replace(coalesce(c.cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer desc nulls last,
        c.id desc
      )
      from (
        select id, starting_share_capital, ending_share_capital,
               capital_added, transaction_date, cbu_deposit_id
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
$function$;

-- Note: this changes the function's return shape slightly -- the 'cbu'
-- array's row objects now also include "id" and "cbu_deposit_id" (needed
-- for the ORDER BY to reference them via row_to_json). Confirmed harmless:
-- Member_Dashboard.jsx only reads cbuRow.ending_share_capital / .capital_added
-- off cbu[0] (lines 352-356), so the two extra fields are simply ignored.
