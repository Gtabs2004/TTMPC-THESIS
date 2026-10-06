-- Member email notification preferences (Member Settings > Notifications).
--
-- One row per member; a missing row means every email is on. Only the optional
-- loan status emails can be turned off: security codes (password / email
-- change) always send, and the in-app bell is never affected.
--   loan_review_emails  : Bookkeeper / Manager decisions on an application
--   loan_release_emails : Treasurer stage (ready to claim, released, cancelled)
-- Enforced in services/notification_service.py before the member email is sent.
--
-- RLS is on with no client policies: all access goes through FastAPI on the
-- service-role key, identity from the verified JWT. Additive; safe to re-run.

create table if not exists public.member_notification_preferences (
  member_id            uuid        primary key references public.member(id) on delete cascade,
  loan_review_emails   boolean     not null default true,
  loan_release_emails  boolean     not null default true,
  updated_at           timestamptz not null default now()
);

alter table public.member_notification_preferences enable row level security;
