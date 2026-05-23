-- Loan email notification audit + duplicate-protection schema.
-- Additive only. Safe to run multiple times.

create table if not exists public.loan_email_log (
    id bigserial primary key,
    loan_id text not null,
    stage text not null,                          -- 'bookkeeper' | 'manager' | 'treasurer'
    action text not null,                         -- 'recommend' | 'approve' | 'reject' | 'revise' | 'disburse' | etc.
    status_label text,                            -- human-readable status (e.g. 'Recommended for Approval')
    recipient_email text,
    recipient_role text,                          -- 'member' | 'next_approver'
    dedup_key text not null,                      -- sha256(loan_id|stage|action|status_label|recipient_email)
    success boolean not null default false,
    provider_message_id text,
    error_message text,
    attempt_count int not null default 1,
    sent_at timestamptz not null default now(),
    created_by uuid
);

create index if not exists loan_email_log_loan_id_idx on public.loan_email_log (loan_id);
create index if not exists loan_email_log_dedup_idx on public.loan_email_log (dedup_key);
create unique index if not exists loan_email_log_dedup_success_uniq
    on public.loan_email_log (dedup_key)
    where success = true;

-- Transition guard column on loans. Tracks the last status value an email was
-- successfully sent for. Used to short-circuit duplicate sends on the same transition.
alter table public.loans
    add column if not exists last_emailed_status text;

-- Optional same guard on koica_loans if that table is also approved through the same UI.
do $$
begin
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'koica_loans') then
        execute 'alter table public.koica_loans add column if not exists last_emailed_status text';
    end if;
end$$;
