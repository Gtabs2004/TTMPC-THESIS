-- loan_renewal_override_requests
-- 6-Month Loan Rule Override.
--
-- A member with an active loan normally cannot renew until 6 monthly payments
-- have been recorded (RENEWAL_MIN_PAYMENTS). When they have an urgent need they
-- can file a request explaining why; the Bookkeeper reviews it and, if
-- appropriate, approves it. An approved request unlocks Renewal for that one
-- active loan until it expires or is used.
--
-- This table is also the audit/history ledger for the feature: rows are never
-- deleted, every state change stamps who did it and when, and the reason and
-- the decision note are kept verbatim. State changes are additionally mirrored
-- into public.audit_log by the FastAPI endpoints.
--
-- Additive only. Safe to run multiple times.

create table if not exists public.loan_renewal_override_requests (
  id                        bigint generated always as identity primary key,

  -- Who is asking. member_id is member_account.user_id (= member.id), the same
  -- id loans.member_id and get_loan_eligibility() use.
  member_id                 uuid        not null,
  membership_id             text,
  member_name               text        not null default '',
  requested_by_user_id      uuid,       -- auth.users id of the requester
  requested_by_email        text,

  -- What is being overridden. loan_id is the active loan's control_number at
  -- request time; the override only ever applies while that loan is still the
  -- member's active loan of this type.
  loan_type                 text        not null
                            check (loan_type in ('consolidated', 'bonus', 'emergency')),
  loan_id                   text        not null,
  payments_made             integer     not null default 0 check (payments_made >= 0),
  required_payments         integer     not null default 6 check (required_payments > 0),

  reason                    text        not null check (char_length(btrim(reason)) >= 20),

  status                    text        not null default 'pending'
                            check (status in ('pending', 'approved', 'rejected', 'cancelled', 'used')),

  -- Bookkeeper decision.
  reviewed_by_user_id       uuid,
  reviewed_by_email         text,
  reviewed_at               timestamptz,
  review_note               text,
  expires_at                timestamptz,  -- set on approval

  -- Set when the override is spent on a renewal application.
  used_at                   timestamptz,
  used_application_id       text,         -- loans.control_number of the renewal

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- A member can have at most one open request per loan type.
create unique index if not exists uq_renewal_override_one_pending
  on public.loan_renewal_override_requests (member_id, loan_type)
  where status = 'pending';

create index if not exists idx_renewal_override_status_created
  on public.loan_renewal_override_requests (status, created_at desc);

create index if not exists idx_renewal_override_member
  on public.loan_renewal_override_requests (member_id, created_at desc);

create or replace function public._set_renewal_override_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_renewal_override_updated_at on public.loan_renewal_override_requests;
create trigger trg_renewal_override_updated_at
  before update on public.loan_renewal_override_requests
  for each row execute function public._set_renewal_override_updated_at();

-- RLS: all access goes through the FastAPI backend on the service-role key,
-- which resolves the caller from the verified JWT. No policies are defined for
-- anon/authenticated, so direct client access is denied.
alter table public.loan_renewal_override_requests enable row level security;
