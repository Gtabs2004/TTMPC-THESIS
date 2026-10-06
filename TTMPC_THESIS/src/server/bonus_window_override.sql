-- Bonus window override.
--
-- Bonus loans are normally accepted only in May and November. A member can now
-- ask the Bookkeeper to waive that window (same request/approve flow as the
-- 6-month renewal override). An approved bonus_window override lets that one
-- member submit ONE Bonus application outside the window within 30 days; the
-- override is marked 'used' by the same trigger that lets the insert through,
-- so it can't be reused.
--
-- Requires loan_renewal_override_schema.sql. Additive; safe to re-run.

-- 1) Which rule a request waives.
alter table public.loan_renewal_override_requests
  add column if not exists override_kind text not null default 'six_month';

alter table public.loan_renewal_override_requests
  drop constraint if exists loan_renewal_override_requests_override_kind_check;
alter table public.loan_renewal_override_requests
  add constraint loan_renewal_override_requests_override_kind_check
  check (override_kind in ('six_month', 'bonus_window'));

-- A window override isn't tied to an existing loan.
alter table public.loan_renewal_override_requests
  alter column loan_id drop not null;

-- One open request per member, loan type AND kind.
drop index if exists public.uq_renewal_override_one_pending;
create unique index if not exists uq_renewal_override_one_pending
  on public.loan_renewal_override_requests (member_id, loan_type, override_kind)
  where status = 'pending';

-- 2) Does this member hold an approved, unexpired, unused window override?
create or replace function public.has_bonus_window_override(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.loan_renewal_override_requests
    where member_id = p_member_id
      and override_kind = 'bonus_window'
      and loan_type = 'bonus'
      and status = 'approved'
      and expires_at > now()
  );
$$;

-- 3) Window enforcement on insert: let an override through and spend it.
create or replace function public.enforce_bonus_loan_window()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code       text;
  v_month      int := extract(month from now())::int;
  v_row        jsonb := to_jsonb(NEW);
  v_member_id  uuid;
  v_override   bigint;
begin
  if NEW.loan_type_id is not null then
    select upper(coalesce(code, '')) into v_code
    from public.loan_types
    where id = NEW.loan_type_id;
  end if;

  if v_code is null or v_code = '' then
    v_code := upper(coalesce(v_row->>'loan_type_code', ''));
  end if;

  if v_code not in ('BONUS', 'NONMEMBER_BONUS') or v_month in (5, 11) then
    return NEW;
  end if;

  -- koica_loans (non-members) has no member_id, so it never qualifies.
  if TG_TABLE_NAME = 'loans' and nullif(v_row->>'member_id', '') is not null then
    v_member_id := (v_row->>'member_id')::uuid;

    update public.loan_renewal_override_requests
    set status = 'used',
        used_at = now(),
        used_application_id = NEW.control_number
    where id = (
      select id
      from public.loan_renewal_override_requests
      where member_id = v_member_id
        and override_kind = 'bonus_window'
        and loan_type = 'bonus'
        and status = 'approved'
        and expires_at > now()
      order by reviewed_at desc
      limit 1
      for update skip locked
    )
    returning id into v_override;

    if v_override is not null then
      return NEW;
    end if;
  end if;

  raise exception
    'Bonus loan applications are accepted only during Mid-year (May) and Year-end (November). Current month: %',
    v_month
    using errcode = 'check_violation';
end;
$function$;

-- 4) Eligibility RPC: the window counts as open for a member with an override.
create or replace function public.get_loan_eligibility(p_member_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_current_month  int  := extract(month from now())::int;
  v_month_open     bool := v_current_month in (5, 11);
  v_bonus_override bool := false;
  v_bonus_open     bool;
  v_renewal_min    int  := 6;

  v_cons_id        text;
  v_emrg_id        text;
  v_bonus_id       text;
  v_cons_payments  int := 0;
  v_emrg_payments  int := 0;
  v_bonus_payments int := 0;

  v_bucket_cons    jsonb;
  v_bucket_emrg    jsonb;
  v_bucket_bonus   jsonb;
begin
  if not v_month_open then
    v_bonus_override := public.has_bonus_window_override(p_member_id);
  end if;
  v_bonus_open := v_month_open or v_bonus_override;

  select
    max(control_number) filter (where loan_category = 'consolidated'),
    max(control_number) filter (where loan_category = 'emergency'),
    max(control_number) filter (where loan_category = 'bonus')
  into v_cons_id, v_emrg_id, v_bonus_id
  from (
    select distinct on (
      case
        when lower(lt.code) like '%consolidated%' or lower(lt.name) like '%consolidated%' then 'consolidated'
        when lower(lt.code) like '%emergency%'    or lower(lt.name) like '%emergency%'    then 'emergency'
        when lower(lt.code) like '%bonus%'        or lower(lt.name) like '%bonus%'        then 'bonus'
      end
    )
      l.control_number,
      case
        when lower(lt.code) like '%consolidated%' or lower(lt.name) like '%consolidated%' then 'consolidated'
        when lower(lt.code) like '%emergency%'    or lower(lt.name) like '%emergency%'    then 'emergency'
        when lower(lt.code) like '%bonus%'        or lower(lt.name) like '%bonus%'        then 'bonus'
      end as loan_category
    from public.loans l
    join public.loan_types lt on lt.id = l.loan_type_id
    where l.member_id = p_member_id
      and lower(l.loan_status) in ('released', 'paid', 'partially paid')
    order by
      case
        when lower(lt.code) like '%consolidated%' or lower(lt.name) like '%consolidated%' then 'consolidated'
        when lower(lt.code) like '%emergency%'    or lower(lt.name) like '%emergency%'    then 'emergency'
        when lower(lt.code) like '%bonus%'        or lower(lt.name) like '%bonus%'        then 'bonus'
      end,
      coalesce(l.disbursal_date, l.application_date) desc nulls last
  ) active_loans;

  if v_cons_id is not null or v_emrg_id is not null or v_bonus_id is not null then
    select
      count(*) filter (where loan_id = v_cons_id),
      count(*) filter (where loan_id = v_emrg_id),
      count(*) filter (where loan_id = v_bonus_id)
    into v_cons_payments, v_emrg_payments, v_bonus_payments
    from public.loan_payments
    where loan_id in (v_cons_id, v_emrg_id, v_bonus_id);
  end if;

  if v_cons_id is null then
    v_bucket_cons := jsonb_build_object(
      'loan_type', 'consolidated', 'can_apply_new', true, 'can_renew', false,
      'reason', 'No active consolidated loan on record.',
      'active_loan_id', null, 'payments_made', 0
    );
  else
    v_bucket_cons := jsonb_build_object(
      'loan_type', 'consolidated', 'can_apply_new', false,
      'can_renew', (v_cons_payments >= v_renewal_min),
      'reason', 'Active consolidated loan ' || v_cons_id || ' in repayment. ' ||
        case when v_cons_payments >= v_renewal_min then 'Eligible for renewal.'
             else 'Needs ' || (v_renewal_min - v_cons_payments)::text || ' more monthly payment(s) before renewal.'
        end,
      'active_loan_id', v_cons_id, 'payments_made', v_cons_payments
    );
  end if;

  if v_emrg_id is null then
    v_bucket_emrg := jsonb_build_object(
      'loan_type', 'emergency', 'can_apply_new', true, 'can_renew', false,
      'reason', 'No active emergency loan on record.',
      'active_loan_id', null, 'payments_made', 0
    );
  else
    v_bucket_emrg := jsonb_build_object(
      'loan_type', 'emergency', 'can_apply_new', false,
      'can_renew', (v_emrg_payments >= v_renewal_min),
      'reason', 'Active emergency loan ' || v_emrg_id || ' in repayment. ' ||
        case when v_emrg_payments >= v_renewal_min then 'Eligible for renewal.'
             else 'Needs ' || (v_renewal_min - v_emrg_payments)::text || ' more monthly payment(s) before renewal.'
        end,
      'active_loan_id', v_emrg_id, 'payments_made', v_emrg_payments
    );
  end if;

  if not v_bonus_open then
    v_bucket_bonus := jsonb_build_object(
      'loan_type', 'bonus', 'can_apply_new', false, 'can_renew', false,
      'reason', 'Bonus loan applications are accepted only during Mid-year (May) and Year-end (November).',
      'active_loan_id', null, 'payments_made', 0
    );
  elsif v_bonus_id is null then
    v_bucket_bonus := jsonb_build_object(
      'loan_type', 'bonus', 'can_apply_new', true, 'can_renew', false,
      'reason', 'No active bonus loan on record.',
      'active_loan_id', null, 'payments_made', 0
    );
  else
    v_bucket_bonus := jsonb_build_object(
      'loan_type', 'bonus', 'can_apply_new', false,
      'can_renew', (v_bonus_payments >= v_renewal_min),
      'reason', 'Active bonus loan ' || v_bonus_id || ' in repayment. ' ||
        case when v_bonus_payments >= v_renewal_min then 'Eligible for renewal.'
             else 'Needs ' || (v_renewal_min - v_bonus_payments)::text || ' more monthly payment(s) before renewal.'
        end,
      'active_loan_id', v_bonus_id, 'payments_made', v_bonus_payments
    );
  end if;

  v_bucket_bonus := v_bucket_bonus || jsonb_build_object('bonus_window_override', v_bonus_override);

  return jsonb_build_object(
    'per_type', jsonb_build_object(
      'consolidated', v_bucket_cons,
      'emergency',    v_bucket_emrg,
      'bonus',        v_bucket_bonus
    )
  );
end;
$function$;
