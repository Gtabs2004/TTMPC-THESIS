-- Persistent in-app notification feed for the loan approval workflow.
-- Additive only. Safe to run multiple times.
--
-- Lifecycle: a row is inserted whenever a loan transitions between staff
-- stages (bookkeeper -> manager, manager -> treasurer). The receiving role's
-- bell component polls this table and marks rows read on click.

create table if not exists public.loan_notifications (
    id bigserial primary key,
    recipient_role text not null,                 -- 'manager' | 'treasurer' | 'member' (lowercase)
    recipient_user_id uuid,                       -- optional; null = role broadcast
    recipient_member_id text,                     -- members.id (text) — set when recipient_role='member'
    title text not null,
    message text not null,
    notification_type text not null,              -- 'recommend' | 'decline' | 'approve' | 'revise' | etc.
    severity text not null default 'info',        -- 'success' | 'warning' | 'danger' | 'info'
    loan_id text,                                 -- control_number of the loan (FK-by-convention)
    redirect_url text,                            -- e.g. /loan-approval/<control_number>
    dedup_key text,                               -- sha256(recipient_role|loan_id|notification_type|status_label)
    is_read boolean not null default false,
    read_at timestamptz,
    read_by uuid,
    created_at timestamptz not null default now(),
    created_by uuid
);

-- Idempotent column add for environments that ran the earlier migration
-- (must run BEFORE any index that references recipient_member_id).
alter table public.loan_notifications
    add column if not exists recipient_member_id text;

create index if not exists loan_notifications_role_unread_idx
    on public.loan_notifications (recipient_role, is_read, created_at desc);
create index if not exists loan_notifications_loan_idx
    on public.loan_notifications (loan_id);
create index if not exists loan_notifications_member_unread_idx
    on public.loan_notifications (recipient_member_id, is_read, created_at desc)
    where recipient_member_id is not null;

-- Partial unique index — at most one *unread* row per dedup_key. A new transition
-- to the same status (e.g. after a revision returns) will only insert again once
-- the previous one is read. Read rows are not constrained.
create unique index if not exists loan_notifications_dedup_unread_uniq
    on public.loan_notifications (dedup_key)
    where is_read = false and dedup_key is not null;

-- Row-level security: anon role should not see notifications; service role bypasses.
alter table public.loan_notifications enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'loan_notifications' and policyname = 'loan_notifications_read_by_role'
    ) then
        execute $p$
            create policy loan_notifications_read_by_role
            on public.loan_notifications
            for select
            using (true)
        $p$;
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'loan_notifications' and policyname = 'loan_notifications_mark_read'
    ) then
        execute $p$
            create policy loan_notifications_mark_read
            on public.loan_notifications
            for update
            using (true)
            with check (true)
        $p$;
    end if;
end$$;
