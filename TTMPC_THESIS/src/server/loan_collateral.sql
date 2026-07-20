-- Consolidated-loan collateral records.
-- One loan (loans.control_number) can have many collateral items.
-- Bookkeeper fills appraised_value during review; declared_value is member-supplied.

create table if not exists public.loan_collateral (
  collateral_id       text primary key,
  loan_control_number text not null references public.loans (control_number) on delete cascade,
  collateral_type     text not null check (collateral_type in (
    'co_maker','cbu_shares','chattel','real_estate','atm_hold','other'
  )),
  description         text not null,
  declared_value      numeric(14,2) not null check (declared_value >= 0),
  appraised_value     numeric(14,2) check (appraised_value is null or appraised_value >= 0),
  document_url        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_loan_collateral_control
  on public.loan_collateral (loan_control_number);

alter table public.loan_collateral enable row level security;

-- Member reads their own collateral (via the parent loan they own).
drop policy if exists loan_collateral_select_own on public.loan_collateral;
create policy loan_collateral_select_own
  on public.loan_collateral for select
  using (
    exists (
      select 1 from public.loans l
      join public.member m on m.id = l.member_id
      where l.control_number = loan_collateral.loan_control_number
        and m.id = auth.uid()
    )
  );

-- Member inserts collateral for a loan they own.
drop policy if exists loan_collateral_insert_own on public.loan_collateral;
create policy loan_collateral_insert_own
  on public.loan_collateral for insert
  with check (
    exists (
      select 1 from public.loans l
      where l.control_number = loan_collateral.loan_control_number
        and l.member_id = auth.uid()
    )
  );

-- Staff (bookkeeper/manager/treasurer/bod) read all + update appraisal.
drop policy if exists loan_collateral_staff_all on public.loan_collateral;
create policy loan_collateral_staff_all
  on public.loan_collateral for all
  using (
    exists (
      select 1 from public.member_account ma
      where ma.auth_user_id = auth.uid()
        and lower(ma.role) in ('bookkeeper','manager','treasurer','bod','cashier')
    )
  )
  with check (
    exists (
      select 1 from public.member_account ma
      where ma.auth_user_id = auth.uid()
        and lower(ma.role) in ('bookkeeper','manager','treasurer','bod')
    )
  );
