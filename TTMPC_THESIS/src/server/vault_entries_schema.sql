-- =============================================================================
-- vault_entries — treasurer cash-on-hand ledger
-- =============================================================================
-- Ledger of every adjustment to the coop's disbursement vault (physical cash /
-- bank balance reserved for releasing loans). One row per change; current
-- balance is the running SUM(amount).
--
-- Why a ledger and not a single "current_balance" row:
--   • Audit trail — every change is attributable (who + when + why)
--   • No accidental overwrites — mis-entries are reversed with a new row
--   • Matches the append-only pattern used by loan_payments / cbu deposits
--
-- Run this file in the Supabase SQL editor.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Table
-- -----------------------------------------------------------------------------
create table if not exists public.vault_entries (
  id            bigserial primary key,
  amount        numeric(14,2) not null,           -- signed: +deposit / -withdrawal
  change_type   text not null check (change_type in (
                  'deposit',        -- cash added to the vault
                  'withdrawal',     -- cash removed (non-loan; e.g. transferred to bank)
                  'disbursement',   -- cash released for a loan (system-recorded)
                  'adjustment',     -- reconciliation / correction entry
                  'opening_balance' -- one-time seeding row
                )),
  note          text,                              -- free-form; recommended for 'adjustment'
  reference_id  bigint,                            -- FK-ish to loans.id for change_type='disbursement' (nullable)
  entered_by    uuid references auth.users(id),   -- treasurer who recorded the entry
  entered_at    timestamptz not null default now()
);

comment on table  public.vault_entries is 'Ledger of vault cash movements. Current balance = SUM(amount).';
comment on column public.vault_entries.amount is 'Signed peso amount: positive for cash in, negative for cash out.';
comment on column public.vault_entries.reference_id is 'Loans.id when this entry was auto-created from a loan disbursement.';

create index if not exists vault_entries_entered_at_idx on public.vault_entries(entered_at desc);
create index if not exists vault_entries_change_type_idx on public.vault_entries(change_type);
create index if not exists vault_entries_reference_idx  on public.vault_entries(reference_id) where reference_id is not null;

-- -----------------------------------------------------------------------------
-- Convenience view — current running balance and last-updated timestamp.
-- -----------------------------------------------------------------------------
-- `security_invoker = on` makes the view execute with the *caller's* rights,
-- so the underlying vault_entries RLS policies (is_vault_reader) are still
-- enforced. Without this, Postgres runs the view as its creator and RLS is
-- bypassed — flagged by the Supabase security advisor as SECURITY DEFINER view.
create or replace view public.vault_balance_v
  with (security_invoker = on)
as
  select
    coalesce(sum(amount), 0)::numeric(14,2) as current_balance,
    max(entered_at)                          as last_updated_at,
    count(*)                                 as entry_count
  from public.vault_entries;

comment on view public.vault_balance_v is 'Single-row aggregate: current vault balance, last update, total entry count.';

-- -----------------------------------------------------------------------------
-- Role helpers — mirror the existing is_cbu_staff() pattern.
-- Checks member_account(s).role first, falls back to JWT claim.
-- Read: treasurer + bod + manager + bookkeeper (managers/bookkeepers need
--       to see cash position when reviewing loans).
-- Write: treasurer + bod only.
-- -----------------------------------------------------------------------------
create or replace function public.is_vault_reader()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if to_regclass('public.member_account') is not null then
    select lower(btrim(coalesce(ma.role, '')))
      into v_role
      from public.member_account ma
     where ma.user_id = auth.uid()
        or lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
     limit 1;
    if v_role in ('treasurer', 'bod', 'manager', 'bookkeeper') then
      return true;
    end if;
  end if;

  if to_regclass('public.member_accounts') is not null then
    select lower(btrim(coalesce(ma.role, '')))
      into v_role
      from public.member_accounts ma
     where ma.user_id = auth.uid()
        or lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
     limit 1;
    if v_role in ('treasurer', 'bod', 'manager', 'bookkeeper') then
      return true;
    end if;
  end if;

  v_role := lower(btrim(coalesce(
    auth.jwt() ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  )));
  return v_role in ('treasurer', 'bod', 'manager', 'bookkeeper');
end;
$$;

create or replace function public.is_vault_writer()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if to_regclass('public.member_account') is not null then
    select lower(btrim(coalesce(ma.role, '')))
      into v_role
      from public.member_account ma
     where ma.user_id = auth.uid()
        or lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
     limit 1;
    if v_role in ('treasurer', 'bod') then
      return true;
    end if;
  end if;

  if to_regclass('public.member_accounts') is not null then
    select lower(btrim(coalesce(ma.role, '')))
      into v_role
      from public.member_accounts ma
     where ma.user_id = auth.uid()
        or lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
     limit 1;
    if v_role in ('treasurer', 'bod') then
      return true;
    end if;
  end if;

  v_role := lower(btrim(coalesce(
    auth.jwt() ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  )));
  return v_role in ('treasurer', 'bod');
end;
$$;

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- No UPDATE / DELETE policies on purpose — the ledger is append-only.
-- Corrections are made by inserting a compensating 'adjustment' row.
-- -----------------------------------------------------------------------------
alter table public.vault_entries enable row level security;

drop policy if exists vault_entries_read   on public.vault_entries;
drop policy if exists vault_entries_insert on public.vault_entries;

create policy vault_entries_read on public.vault_entries
  for select
  using (public.is_vault_reader());

create policy vault_entries_insert on public.vault_entries
  for insert
  with check (public.is_vault_writer());

COMMIT;

-- =============================================================================
-- Optional (leave commented until you want auto-sync from disbursements):
-- Auto-record a vault withdrawal when a loan is marked disbursed.
-- Requires disbursement_confirmations to expose a status transition.
-- =============================================================================
-- create or replace function public.vault_entries_from_disbursement()
-- returns trigger language plpgsql security definer as $$
-- begin
--   if new.status = 'disbursed' and (old.status is null or old.status <> 'disbursed') then
--     insert into public.vault_entries (amount, change_type, note, reference_id, entered_by)
--     values (
--       -1 * coalesce(new.disbursed_amount, 0),
--       'disbursement',
--       'Auto-recorded from loan #' || new.loan_id,
--       new.loan_id,
--       new.confirmed_by
--     );
--   end if;
--   return new;
-- end $$;
--
-- drop trigger if exists vault_entries_from_disbursement_trg on public.disbursement_confirmations;
-- create trigger vault_entries_from_disbursement_trg
--   after insert or update on public.disbursement_confirmations
--   for each row execute function public.vault_entries_from_disbursement();
