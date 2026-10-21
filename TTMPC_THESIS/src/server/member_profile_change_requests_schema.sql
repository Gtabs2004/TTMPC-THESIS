-- member_profile_change_requests
-- Profile change requests with Bookkeeper approval.
--
-- A member no longer edits a controlled Personal Data Sheet field directly.
-- Each changed field becomes a request row (rows from one save share a
-- batch_id). The Bookkeeper approves or rejects it; approval writes the new
-- value to the profile. Net take-home pay (personal_data_sheet.salary) is the
-- one field that needs proof: the member attaches a payslip (image or PDF),
-- stored in the private Supporting_Documents bucket under profile_payslips/.
--
-- This table is also the history ledger: rows are never deleted, old_value is
-- kept after approval, and every decision stamps who and when. State changes
-- are additionally mirrored into public.audit_log by the FastAPI endpoints.
--
-- Additive only. Safe to run multiple times.

create table if not exists public.member_profile_change_requests (
  id                        bigint generated always as identity primary key,

  -- A member's single save can change several fields; each gets its own row.
  batch_id                  uuid        not null default gen_random_uuid(),

  -- Who is asking. member_id is member_account.user_id (= member.id).
  member_id                 uuid        not null,
  membership_id             text,
  member_name               text        not null default '',
  requested_by_user_id      uuid,       -- auth.users id of the requester
  requested_by_email        text,

  -- What is being changed. field_key is a personal_data_sheet column.
  field_key                 text        not null,
  field_label               text        not null default '',
  old_value                 text,
  new_value                 text,

  -- Proof. Only net pay needs it. payslip_path is a path inside the private
  -- Supporting_Documents bucket; pay_period is the month the payslip covers
  -- (first day of that month).
  requires_proof            boolean     not null default false,
  payslip_path              text,
  payslip_content_type      text,
  pay_period                date,

  status                    text        not null default 'pending'
                            check (status in ('pending', 'approved', 'rejected', 'cancelled')),

  -- Bookkeeper decision. review_note is the rejection reason.
  reviewed_by_user_id       uuid,
  reviewed_by_email         text,
  reviewed_at               timestamptz,
  review_note               text,
  applied_at                timestamptz,  -- set when the value was written to the profile

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- One open request per member per field.
create unique index if not exists uq_profile_change_one_pending
  on public.member_profile_change_requests (member_id, field_key)
  where status = 'pending';

create index if not exists idx_profile_change_status_created
  on public.member_profile_change_requests (status, created_at desc);

create index if not exists idx_profile_change_member
  on public.member_profile_change_requests (member_id, created_at desc);

create index if not exists idx_profile_change_batch
  on public.member_profile_change_requests (batch_id);

create or replace function public._set_profile_change_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profile_change_updated_at on public.member_profile_change_requests;
create trigger trg_profile_change_updated_at
  before update on public.member_profile_change_requests
  for each row execute function public._set_profile_change_updated_at();

-- RLS: all access goes through the FastAPI backend on the service-role key,
-- which resolves the caller from the verified JWT. No policies are defined for
-- anon/authenticated, so direct client access is denied. Payslips are only ever
-- handed out as short-lived signed links minted by the backend.
alter table public.member_profile_change_requests enable row level security;

-- New tables are not covered by the realtime broadcast automatically; attach
-- it (no-op if the helper is not installed in this environment).
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'realtime_sync_attach_all'
  ) then
    perform public.realtime_sync_attach_all();
  end if;
end $$;
