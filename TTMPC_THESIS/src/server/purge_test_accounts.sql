-- ============================================================================
-- PURGE TEST ACCOUNTS — full data removal for 11 simulated/test identities
-- ============================================================================
-- Scope: these are simulated accounts used while building the thesis system,
-- being cleared ahead of defense. This removes EVERY row in every public-schema
-- table that is reachable (directly or transitively) from these auth.users rows
-- via foreign keys, then deletes the auth.users rows themselves.
--
-- HOW IT WORKS:
--   1. Seeds the 11 target UUIDs into a temp table.
--   2. Walks pg_constraint LIVE (not a stale export) to find every table with a
--      FK pointing at auth.users, OR transitively at any table that itself
--      points at auth.users (e.g. loans -> member -> auth.users). This builds
--      the real dependency graph instead of trusting a hand-typed list.
--   3. For each discovered table, deletes rows whose FK column value is in the
--      target set (resolved per-table: some hang off auth.users.id directly,
--      others off member.id / member_account.id / profiles.id which themselves
--      resolve back to the target auth ids).
--   4. Processes tables in reverse dependency order (deepest leaf tables first)
--      so no FK violation is possible.
--   5. Reports row counts deleted per table via RAISE NOTICE.
--   6. Deletes public.member / public.member_account / public.profiles rows for
--      these identities.
--   7. Deletes the auth.users rows last.
--   8. Verifies zero remaining rows in auth.users for the target set.
--
-- Run this whole script in the Supabase SQL Editor. It is wrapped in a single
-- transaction — if anything errors, nothing is committed.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE target_ids (id UUID PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE target_emails (email TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO target_ids (id) VALUES
  ('632a2d7b-bf43-48c8-b71c-1f4d121158ed'), -- bulotaoloashleynicole@gmail.com
  ('9d6ec1a6-ddcf-41d3-b4d9-e96bc6994b9e'), -- dondonquixote7@gmail.com
  ('b3ab3448-0c45-4c9c-9024-c0ba96b793c3'), -- ejhedteope@gmail.com
  ('be1e5f88-04d7-45a8-aa45-d92d13f6f0c3'), -- erdenjhed.teope@wvsu.edu.ph
  ('3f38c77f-e867-415a-b35a-b9f226bf6d1a'), -- gtabs2004@gmail.com
  ('50a8c0f5-6253-46f5-8bd2-99f6682b3bb1'), -- jibozai2004@gmail.com
  ('cde1a326-7edd-4fb2-a958-8562054c7cc3'), -- kirigayalynx@gmail.com
  ('3592a9eb-ea5e-45e7-8fa4-c03dd9e7d368'), -- lynxridao@gmail.com
  ('0f068353-dc68-4def-9067-c81de277a93f'), -- nashervine.siaton@wvsu.edu.ph
  ('e6570ddf-9338-48ee-8045-af19f410c165'), -- nashervinesiaton@gmail.com
  ('ee051661-17ee-43f4-a1ee-abe9a091cded'); -- sereevee7@gmail.com

INSERT INTO target_emails (email) VALUES
  ('bulotaoloashleynicole@gmail.com'),
  ('dondonquixote7@gmail.com'),
  ('ejhedteope@gmail.com'),
  ('erdenjhed.teope@wvsu.edu.ph'),
  ('gtabs2004@gmail.com'),
  ('jibozai2004@gmail.com'),
  ('kirigayalynx@gmail.com'),
  ('lynxridao@gmail.com'),
  ('nashervine.siaton@wvsu.edu.ph'),
  ('nashervinesiaton@gmail.com'),
  ('sereevee7@gmail.com');

-- Sanity check: confirm these are the rows we think they are before anything
-- is deleted. If this returns fewer than 11 rows, some UUIDs don't exist in
-- auth.users (fine — they'll just no-op later) or something is off; review
-- the output before proceeding past this point.
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM auth.users WHERE id IN (SELECT id FROM target_ids);
  RAISE NOTICE 'Matched % of 11 target auth.users rows', v_count;
END $$;

-- ----------------------------------------------------------------------------
-- Step 1: Resolve secondary root IDs (member / member_account / profiles)
-- that hang off the target auth.users via auth_user_id, since nearly all
-- cooperative data (loans, savings, CBU, applications, audit logs, etc.)
-- is keyed to member.id / member_account.id, not auth.users.id directly.
-- ----------------------------------------------------------------------------

CREATE TEMP TABLE target_member_ids (id UUID PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE target_member_account_ids (id UUID PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE target_profile_ids (id UUID PRIMARY KEY) ON COMMIT DROP;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member') THEN
    INSERT INTO target_member_ids (id)
      SELECT m.id FROM public.member m
      WHERE m.auth_user_id IN (SELECT id FROM target_ids)
      ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_account') THEN
    INSERT INTO target_member_account_ids (id)
      SELECT ma.user_id FROM public.member_account ma
      WHERE ma.auth_user_id IN (SELECT id FROM target_ids)
      ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles') THEN
    INSERT INTO target_profile_ids (id)
      SELECT p.id FROM public.profiles p
      WHERE p.id IN (SELECT id FROM target_ids)
      ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- member.auth_user_id can be unlinked even when the person has a real member
-- row (verified live: dondonquixote7@gmail.com / TTMPC-298 — member_account
-- resolves fine, but member.auth_user_id is not set to this auth id, so the
-- join above misses it entirely). Fall back to matching member.id by the
-- membership_id already resolved via member_account for the same auth user.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_account') THEN
    INSERT INTO target_member_ids (id)
      SELECT m.id FROM public.member m
      WHERE m.membership_id IN (
        SELECT ma.membership_id FROM public.member_account ma
        WHERE ma.auth_user_id IN (SELECT id FROM target_ids)
          AND ma.membership_id IS NOT NULL
      )
      ON CONFLICT DO NOTHING;
  END IF;
END $$;

DO $$
DECLARE
  v_m INT; v_ma INT; v_p INT;
BEGIN
  SELECT count(*) INTO v_m FROM target_member_ids;
  SELECT count(*) INTO v_ma FROM target_member_account_ids;
  SELECT count(*) INTO v_p FROM target_profile_ids;
  RAISE NOTICE 'Resolved % member row(s), % member_account row(s), % profile row(s)', v_m, v_ma, v_p;
END $$;

-- ----------------------------------------------------------------------------
-- Step 1b: Resolve the TEXT membership_id keys for these members. A second,
-- undeclared keying system exists alongside the UUID FKs: several tables
-- (grocery transactions, savings transaction queue/ledger, attendance logs,
-- member_classification_temporal, member_profile, personal_data_sheet) key
-- off member.membership_id (a text code like "TTMPC-xxx") instead of a real
-- foreign key to member.id, so Step 2's pg_constraint walk cannot see them.
-- ----------------------------------------------------------------------------

CREATE TEMP TABLE target_membership_ids (membership_id TEXT PRIMARY KEY) ON COMMIT DROP;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member') THEN
    INSERT INTO target_membership_ids (membership_id)
      SELECT DISTINCT m.membership_id FROM public.member m
      WHERE m.id IN (SELECT id FROM target_member_ids)
        AND m.membership_id IS NOT NULL
      ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_account') THEN
    INSERT INTO target_membership_ids (membership_id)
      SELECT DISTINCT ma.membership_id FROM public.member_account ma
      WHERE ma.auth_user_id IN (SELECT id FROM target_ids)
        AND ma.membership_id IS NOT NULL
      ON CONFLICT DO NOTHING;
  END IF;

  -- personal_data_sheet.email can be the ONLY link for an applicant who was
  -- never connected to an auth_user_id/member/member_account at all (verified
  -- live: bulotaoloashleynicole@gmail.com / TTMPC-295 — "Feitan Portor
  -- Kirigaya" — personal_data_sheet.auth_user_id is NULL, so none of the
  -- auth_user_id-based lookups above ever find this membership_id, even
  -- though Savings_Transactions has a real FK-enforced row under it).
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='personal_data_sheet') THEN
    INSERT INTO target_membership_ids (membership_id)
      SELECT DISTINCT pds.membership_number_id FROM public.personal_data_sheet pds
      WHERE lower(pds.email) IN (SELECT lower(email) FROM target_emails)
        AND pds.membership_number_id IS NOT NULL
      ON CONFLICT DO NOTHING;
  END IF;
END $$;

DO $$
DECLARE v_mid INT;
BEGIN
  SELECT count(*) INTO v_mid FROM target_membership_ids;
  RAISE NOTICE 'Resolved % distinct membership_id text key(s)', v_mid;
END $$;

-- ----------------------------------------------------------------------------
-- Step 1c: Resolve loan ids for these members BEFORE loans are deleted.
-- A second tier of tables (loan_payments, loan_schedules, loan_penalties,
-- loan_notifications, loan_email_log, loan_restructure_requests,
-- loan_payment_ledger) is keyed only by loan_id, one hop from member_id, and
-- none of it has a declared FK either (verified live, same as loans itself).
--
-- IMPORTANT: public.loans has NO uuid "id" column at all — its primary key
-- is control_number (character varying). Every child table's "loan_id"
-- column (loan_payments, loan_schedules, loan_penalties, loan_notifications,
-- loan_email_log, loan_restructure_requests, loan_payment_ledger, cbu_payouts,
-- co_makers, disbursement_confirmations, loan_renewal_override_requests,
-- loan_calculator, loan_payments_legacy) is itself text/varchar and holds
-- loans.control_number, NOT a separate uuid. Verified live via
-- diagnose_member_footprint.sql — an earlier uuid-based target_loan_ids
-- table matched nothing because loans.id never existed, so this whole
-- tier was silently skipped until caught by this check.
-- ----------------------------------------------------------------------------

CREATE TEMP TABLE target_loan_control_numbers (control_number TEXT PRIMARY KEY) ON COMMIT DROP;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='loans') THEN
    INSERT INTO target_loan_control_numbers (control_number)
      SELECT l.control_number FROM public.loans l
      WHERE l.member_id IN (SELECT id FROM target_member_ids)
        AND l.control_number IS NOT NULL
      ON CONFLICT DO NOTHING;
  END IF;
END $$;

DO $$
DECLARE v_cn INT;
BEGIN
  SELECT count(*) INTO v_cn FROM target_loan_control_numbers;
  RAISE NOTICE 'Resolved % loan control number(s)', v_cn;
END $$;

-- ----------------------------------------------------------------------------
-- Step 2: Delete from every public-schema table that has a member_id,
-- auth_user_id, or member_account_id UUID column.
--
-- NOTE: this schema does NOT declare real foreign key constraints on these
-- relationships — verified live: loans, capital_build_up, cbu_payouts,
-- receipts, savings_accounts, isc_transactions, membership_payments,
-- migs_outside_loan_declaration, co_makers, and more all have a member_id
-- column with NO FOREIGN KEY constraint backing it (checked against
-- information_schema.table_constraints — zero FK rows for any of them).
-- Referential integrity here is enforced only in application code. That
-- means the original pg_constraint-walk approach found nothing and silently
-- skipped every one of these tables. This step instead discovers tables by
-- COLUMN NAME (member_id / auth_user_id / member_account_id), the same
-- method already verified against live data in diagnose_member_footprint.sql.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  rec RECORD;
  v_sql TEXT;
  v_deleted BIGINT;
BEGIN
  FOR rec IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name IN ('member_id', 'auth_user_id', 'member_account_id')
      AND c.data_type = 'uuid'
      -- receipts: trg_receipts_block_changes raises on any UPDATE/DELETE by
      -- design (RECEIPT_SYSTEM_PLAN.md — "never edited or deleted after it is
      -- issued"), confirmed with user 2026-10-12 in a prior cleanup
      -- (migration/cleanup_test_account_loan_data.sql) — left in place as an
      -- orphaned but intact reference; receipts.source_id has no FK so this
      -- is harmless.
      AND c.table_name NOT IN ('member', 'member_account', 'profiles', 'loans_member_id_backup_20260730', 'receipts')
    ORDER BY c.table_name, c.column_name
  LOOP
    IF rec.column_name = 'member_id' THEN
      v_sql := format(
        'DELETE FROM public.%I WHERE %I IN (SELECT id FROM target_member_ids)',
        rec.table_name, rec.column_name
      );
    ELSIF rec.column_name = 'auth_user_id' THEN
      v_sql := format(
        'DELETE FROM public.%I WHERE %I IN (SELECT id FROM target_ids)',
        rec.table_name, rec.column_name
      );
    ELSIF rec.column_name = 'member_account_id' THEN
      v_sql := format(
        'DELETE FROM public.%I WHERE %I IN (SELECT id FROM target_member_account_ids)',
        rec.table_name, rec.column_name
      );
    END IF;

    EXECUTE v_sql;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted > 0 THEN
      RAISE NOTICE 'Deleted % row(s) from %.%', v_deleted, rec.table_name, rec.column_name;
    END IF;
  END LOOP;

  RAISE NOTICE 'Finished member_id/auth_user_id/member_account_id table cleanup';
END $$;

-- ----------------------------------------------------------------------------
-- Step 2c: Delete from every table keyed by loan_id (all text/varchar,
-- holding loans.control_number — resolved in Step 1c, before loans itself
-- gets deleted later in this script).
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
  v_sql TEXT;
  v_deleted BIGINT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'loan_email_log',
    'loan_notifications',
    'loan_payment_ledger',
    'loan_payments',
    'loan_penalties',
    'loan_restructure_requests',
    'loan_schedules',
    'cbu_payouts',
    'co_makers',
    'disbursement_confirmations',
    'loan_calculator',
    'loan_payments_legacy',
    'loan_renewal_override_requests'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl)
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=tbl AND column_name='loan_id') THEN
      v_sql := format('DELETE FROM public.%I WHERE loan_id IN (SELECT control_number FROM target_loan_control_numbers)', tbl);
      EXECUTE v_sql;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      IF v_deleted > 0 THEN
        RAISE NOTICE 'loan_id cleanup: deleted % row(s) from %', v_deleted, tbl;
      END IF;
    END IF;
  END LOOP;
END $$;

-- koica_loans has no member_id/loan_id at all — keyed by user_email and
-- control_number instead (non-member loan applications).
DO $$
DECLARE v_deleted BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='koica_loans') THEN
    DELETE FROM public.koica_loans WHERE lower(user_email) IN (SELECT lower(email) FROM target_emails);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted > 0 THEN
      RAISE NOTICE 'Deleted % row(s) from public.koica_loans', v_deleted;
    END IF;
  END IF;
END $$;

-- loan_collateral is keyed by loan_control_number (text), resolved into
-- target_loan_control_numbers back in Step 1c (before loans rows, which
-- carry control_number, are deleted in Step 2).
DO $$
DECLARE v_deleted BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='loan_collateral') THEN
    DELETE FROM public.loan_collateral
    WHERE loan_control_number IN (SELECT control_number FROM target_loan_control_numbers);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted > 0 THEN
      RAISE NOTICE 'Deleted % row(s) from public.loan_collateral', v_deleted;
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Step 2b: Delete rows from tables keyed by the TEXT membership_id (no formal
-- FK, so Step 2 cannot discover these — enumerated explicitly from the known
-- schema instead of a live constraint walk).
-- ----------------------------------------------------------------------------

-- IMPORTANT: columns named membership_id / membership_number_id are
-- inconsistently typed across this schema — uuid (holding member.id) in some
-- tables, text/varchar (holding the "TTMPC-xxx" code) in others. Verified by
-- diagnostic scan on 2026-10 (e.g. Savings_Transactions.membership_number_id
-- is varchar holding "TTMPC-270"; attendance_logs.membership_number_id is
-- uuid). Matching against the wrong-typed temp table throws
-- "invalid input syntax for type uuid" — so each column's live data_type is
-- checked before building the DELETE, exactly as verified in
-- diagnose_member_footprint.sql.
DO $$
DECLARE
  tbl TEXT;
  v_coltype TEXT;
  v_col TEXT;
  v_sql TEXT;
  v_deleted BIGINT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'GROCERY_TRANSACTIONS',
    'Savings_Transactions',
    'ledger_transactions',
    'savings_transaction_queue',
    'attendance_logs',
    'member_classification_temporal',
    'member_profile',
    'personal_data_sheet',
    'membership_payments',
    'loan_renewal_override_requests',
    'member_import_stage'
  ]
  LOOP
    -- member_grocery_totals (and any similar GROUP BY aggregate) is a VIEW,
    -- not a table — not independently deletable; it reflects
    -- GROCERY_TRANSACTIONS automatically once that table is cleaned above.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=tbl AND table_type='BASE TABLE'
    ) THEN
      CONTINUE;
    END IF;

    FOR v_col, v_coltype IN
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl
        AND column_name IN ('membership_id', 'membership_number_id')
    LOOP
      IF v_coltype = 'uuid' THEN
        v_sql := format(
          'DELETE FROM public.%I WHERE %I IN (SELECT id FROM target_member_ids)',
          tbl, v_col
        );
      ELSIF v_coltype IN ('text', 'character varying') THEN
        v_sql := format(
          'DELETE FROM public.%I WHERE %I IN (SELECT membership_id FROM target_membership_ids)',
          tbl, v_col
        );
      ELSE
        CONTINUE;
      END IF;

      EXECUTE v_sql;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      IF v_deleted > 0 THEN
        RAISE NOTICE 'Text/uuid-key cleanup: deleted % row(s) from %.% (type %)', v_deleted, tbl, v_col, v_coltype;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- membership_payments also carries a direct member_id uuid FK — Step 2's FK
-- walk already covers it if the constraint is declared, but this is a
-- backstop in case it isn't.
DO $$
DECLARE v_deleted BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='membership_payments')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='membership_payments' AND column_name='member_id') THEN
    DELETE FROM public.membership_payments WHERE member_id IN (SELECT id FROM target_member_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted > 0 THEN
      RAISE NOTICE 'Deleted % row(s) from public.membership_payments (member_id)', v_deleted;
    END IF;
  END IF;
END $$;

-- attendance_logs.application_id -> member_applications.application_id is a
-- REAL declared foreign key (attendance_logs_member_applications_fk) — the
-- only one found anywhere in this schema. ALL attendance_logs rows for every
-- application matched by EITHER membership_id OR email must be deleted
-- before member_applications itself, regardless of which key resolves it
-- (pulled member_applications out of the generic Step 2b loop entirely so
-- this always runs first, in one place).
DO $$
DECLARE v_deleted BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='attendance_logs')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_applications') THEN
    DELETE FROM public.attendance_logs
    WHERE application_id IN (
      SELECT application_id FROM public.member_applications
      WHERE lower(email) IN (SELECT lower(email) FROM target_emails)
         OR membership_id IN (SELECT membership_id FROM target_membership_ids)
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted > 0 THEN
      RAISE NOTICE 'Deleted % row(s) from public.attendance_logs (application_id, pre member_applications delete)', v_deleted;
    END IF;
  END IF;
END $$;

-- member_applications: matched by BOTH membership_id (approved applications)
-- and email (pre-approval applications, or any row missing membership_id).
DO $$
DECLARE v_deleted BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_applications') THEN
    DELETE FROM public.member_applications
    WHERE lower(email) IN (SELECT lower(email) FROM target_emails)
       OR membership_id IN (SELECT membership_id FROM target_membership_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted > 0 THEN
      RAISE NOTICE 'Deleted % row(s) from public.member_applications (email or membership_id)', v_deleted;
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Step 3: Delete the root application entities themselves.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_deleted BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member') THEN
    DELETE FROM public.member WHERE id IN (SELECT id FROM target_member_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted % row(s) from public.member', v_deleted;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_account') THEN
    DELETE FROM public.member_account WHERE user_id IN (SELECT id FROM target_member_account_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted % row(s) from public.member_account', v_deleted;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles') THEN
    DELETE FROM public.profiles WHERE id IN (SELECT id FROM target_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted % row(s) from public.profiles', v_deleted;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Step 4: Delete the auth.users rows last.
-- ----------------------------------------------------------------------------

DELETE FROM auth.users WHERE id IN (SELECT id FROM target_ids);

-- ----------------------------------------------------------------------------
-- Step 5: Verification — must return 0.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_remaining INT;
BEGIN
  SELECT count(*) INTO v_remaining FROM auth.users WHERE id IN (SELECT id FROM target_ids);
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Purge incomplete: % auth.users row(s) still remain', v_remaining;
  ELSE
    RAISE NOTICE 'Verification passed: 0 remaining auth.users rows for target set';
  END IF;
END $$;

COMMIT;
