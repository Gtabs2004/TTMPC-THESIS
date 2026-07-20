-- Test data cleanup: rewrite one messy test member's loan history into a clean
-- chronological timeline suitable for defense-day demo, while preserving the
-- original mess in a snapshot table for analytics safety.
--
-- Usage:
--   1. Set :target_member_id below to the UUID of the messy test member.
--   2. Run in Supabase SQL editor. Each block is idempotent-friendly:
--      - archive block only runs if archive table doesn't already hold it
--      - rewrite block deletes messy loans then reinserts a clean sequence
--   3. Verify with the SELECT at the bottom before committing.
--
-- Timeline produced (relative to today):
--   Loan A: disbursed ~24mo ago, fully paid ~12mo ago  (loan_status='fully paid')
--   Loan B: disbursed ~14mo ago, fully paid ~2mo ago   (loan_status='fully paid')
--   Loan C: disbursed ~7mo ago,  6 payments recorded,  currently active for renewal demo
--           (loan_status='released', outstanding_balance>0)

begin;

-- ---------------------------------------------------------------------------
-- CONFIGURE ME
-- ---------------------------------------------------------------------------
-- Replace with the actual messy member's ID before running.
-- (In Supabase SQL editor this is easier than a psql :var substitution.)
do $$
declare
  target_member_id uuid := '00000000-0000-0000-0000-000000000000'::uuid; -- TODO: set me
  loan_a_id text := 'DEMO-CL-A-' || to_char(now(), 'YYYYMMDD');
  loan_b_id text := 'DEMO-CL-B-' || to_char(now(), 'YYYYMMDD');
  loan_c_id text := 'DEMO-CL-C-' || to_char(now(), 'YYYYMMDD');
  consolidated_type_id int;
begin

  -- Resolve the Consolidated loan_type id (fail loud if not seeded).
  select id into consolidated_type_id
  from public.loan_types
  where upper(coalesce(code, '')) = 'CONSOLIDATED'
     or lower(name) like 'consolidated%'
  limit 1;

  if consolidated_type_id is null then
    raise exception 'No CONSOLIDATED entry in loan_types — seed loan_types first.';
  end if;

  -- -------------------------------------------------------------------------
  -- STEP 1 — Archive the messy history.
  -- Analytics-safe copy. If the archive table already has rows for this
  -- member, skip (the migration is safe to re-run).
  -- -------------------------------------------------------------------------
  create table if not exists public.loans_archive_predefense as
    select *, now() as archived_at, ''::text as archive_note
    from public.loans where false;

  create table if not exists public.loan_payments_archive_predefense as
    select *, now() as archived_at, ''::text as archive_note
    from public.loan_payments where false;

  if not exists (
    select 1 from public.loans_archive_predefense where member_id = target_member_id
  ) then
    insert into public.loans_archive_predefense
    select l.*, now(), 'pre-defense cleanup snapshot'
    from public.loans l
    where l.member_id = target_member_id;

    insert into public.loan_payments_archive_predefense
    select lp.*, now(), 'pre-defense cleanup snapshot'
    from public.loan_payments lp
    where lp.loan_id in (
      select control_number from public.loans where member_id = target_member_id
    );
  end if;

  -- -------------------------------------------------------------------------
  -- STEP 2 — Wipe live loans and payments for this member so we can re-seed
  -- a clean, chronological history. Archive already preserves the originals.
  -- -------------------------------------------------------------------------
  delete from public.loan_payments
  where loan_id in (select control_number from public.loans where member_id = target_member_id);

  delete from public.loans where member_id = target_member_id;

  -- -------------------------------------------------------------------------
  -- STEP 3 — Insert the clean sequence.
  -- Loan A: fully paid, oldest.
  -- -------------------------------------------------------------------------
  insert into public.loans (
    control_number, member_id, loan_type_id, loan_amount, principal_amount,
    interest_rate, term, loan_status, application_status, application_type,
    application_date, disbursal_date, monthly_amortization, total_interest,
    outstanding_balance
  ) values (
    loan_a_id, target_member_id, consolidated_type_id,
    50000, 50000, 12, 12, 'fully paid', 'released', 'new',
    (now() - interval '24 months')::timestamptz,
    (now() - interval '24 months')::timestamptz,
    4459.61, 3515.32, 0
  );

  -- 12 payments spread evenly over the term.
  insert into public.loan_payments (loan_id, amount_paid, payment_date, confirmation_status)
  select
    loan_a_id,
    4459.61,
    (now() - interval '24 months' + (n || ' months')::interval)::timestamptz,
    'confirmed'
  from generate_series(1, 12) n;

  -- Loan B: fully paid, mid.
  insert into public.loans (
    control_number, member_id, loan_type_id, loan_amount, principal_amount,
    interest_rate, term, loan_status, application_status, application_type,
    application_date, disbursal_date, monthly_amortization, total_interest,
    outstanding_balance
  ) values (
    loan_b_id, target_member_id, consolidated_type_id,
    80000, 80000, 12, 12, 'fully paid', 'released', 'renewal',
    (now() - interval '14 months')::timestamptz,
    (now() - interval '14 months')::timestamptz,
    7135.38, 5624.52, 0
  );

  insert into public.loan_payments (loan_id, amount_paid, payment_date, confirmation_status)
  select
    loan_b_id,
    7135.38,
    (now() - interval '14 months' + (n || ' months')::interval)::timestamptz,
    'confirmed'
  from generate_series(1, 12) n;

  -- Loan C: currently active. 6 payments made → RENEWAL-ELIGIBLE.
  -- This is the loan you demo against for the "Renewal available" state.
  insert into public.loans (
    control_number, member_id, loan_type_id, loan_amount, principal_amount,
    interest_rate, term, loan_status, application_status, application_type,
    application_date, disbursal_date, monthly_amortization, total_interest,
    outstanding_balance
  ) values (
    loan_c_id, target_member_id, consolidated_type_id,
    120000, 120000, 12, 24, 'released', 'released', 'renewal',
    (now() - interval '7 months')::timestamptz,
    (now() - interval '7 months')::timestamptz,
    5648.83, 15571.92, 60000
  );

  insert into public.loan_payments (loan_id, amount_paid, payment_date, confirmation_status)
  select
    loan_c_id,
    5648.83,
    (now() - interval '7 months' + (n || ' months')::interval)::timestamptz,
    'confirmed'
  from generate_series(1, 6) n;

  raise notice 'Cleanup complete for member %', target_member_id;
  raise notice 'Loan A (paid, oldest): %', loan_a_id;
  raise notice 'Loan B (paid, mid):    %', loan_b_id;
  raise notice 'Loan C (active, 6pmts, renewal-eligible): %', loan_c_id;
end $$;

-- -------------------------------------------------------------------------
-- VERIFY: run this before committing.
-- Expect: 3 rows, one 'released' with outstanding_balance>0, two 'fully paid'.
-- -------------------------------------------------------------------------
-- select control_number, loan_status, application_type,
--        application_date::date, outstanding_balance,
--        (select count(*) from public.loan_payments where loan_id = l.control_number) as payments
-- from public.loans l
-- where member_id = '00000000-0000-0000-0000-000000000000'
-- order by application_date;

commit;
