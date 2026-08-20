-- loan_restructure_requests
-- Stores Bookkeeper-initiated restructure requests pending Manager approval.

create table if not exists loan_restructure_requests (
  id                bigint generated always as identity primary key,
  loan_id           text        not null,
  new_term_months   integer     not null check (new_term_months > 0),
  new_amortization  numeric(14,2) not null check (new_amortization > 0),
  requested_by      text        not null default 'Bookkeeper',
  note              text        not null default '',
  status            text        not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Index for fast lookup by loan + status
create index if not exists idx_restructure_requests_loan_status
  on loan_restructure_requests (loan_id, status);

-- Auto-update updated_at
create or replace function _set_restructure_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_restructure_updated_at on loan_restructure_requests;
create trigger trg_restructure_updated_at
  before update on loan_restructure_requests
  for each row execute function _set_restructure_updated_at();

-- RLS: allow all authenticated staff to read; bookkeeper inserts; manager updates
alter table loan_restructure_requests enable row level security;

drop policy if exists "staff_read_restructure" on loan_restructure_requests;
create policy "staff_read_restructure" on loan_restructure_requests
  for select using (auth.role() = 'authenticated');

drop policy if exists "bookkeeper_insert_restructure" on loan_restructure_requests;
create policy "bookkeeper_insert_restructure" on loan_restructure_requests
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "manager_update_restructure" on loan_restructure_requests;
create policy "manager_update_restructure" on loan_restructure_requests
  for update using (auth.role() = 'authenticated');
