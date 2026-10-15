-- ============================================================================
-- PURGE TEST ACCOUNTS — BATCH 2 — Gero Tabiolo (TTMPC-268), Nash Siaton
-- (TTMPC-297), plus 5 unapproved member_applications rows with no
-- membership_id (pure test/joke entries, confirmed by user).
-- ============================================================================
-- Same validated logic as purge_test_accounts.sql (batch 1), scoped to these
-- identities. TTMPC-268's auth_user_id/member_account row already shows the
-- closed-ttmpc-268@ttmpc.local pattern from a prior _close_member() run, but
-- was confirmed by the user as test data, not a real closure to preserve.
--
-- The 5 extra applications (TTMPCAP-103853 "Erden Teope"/romelyn.delosreyes,
-- TTMPCAP-103753 "Feitan Delos Reyes"/gardecelso, TTMPCAP-108458 "meow/gero/
-- huuhuh" joke entry/diwondo, TTMPCAP-103949 "ERDEN TEOPE"/diwondo1,
-- TTMPCAP-101165 duplicate "GERO TABIOLO"/byarou030) never got a
-- membership_id or auth.users row — matched purely by email via
-- target_emails, same as the member_applications/attendance_logs delete
-- logic already in this script.
--
-- Run this whole script in the Supabase SQL Editor. Wrapped in a single
-- transaction — if anything errors, nothing is committed.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE target_ids (id UUID PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE target_emails (email TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO target_ids (id) VALUES
  ('aa7a8243-1d17-47ea-9840-2434aaca6213'), -- Gero Tabiolo / TTMPC-268
  ('19f5e0fa-cbbe-4323-a5f9-0d207a01593f'); -- Nash Siaton / TTMPC-297

INSERT INTO target_emails (email) VALUES
  ('closed-ttmpc-268@ttmpc.local'),
  ('hithott2@gmail.com'),
  ('romelyn.delosreyes@wvsu.edu.ph'),  -- TTMPCAP-103853, Erden Teope (Training, no membership_id)
  ('gardecelso@gmail.com'),            -- TTMPCAP-103753, Feitan Delos Reyes (Training, no membership_id)
  ('diwondo@gmail.com'),               -- TTMPCAP-108458, "meow/gero/huuhuh" joke entry
  ('diwondo1@gmail.com'),              -- TTMPCAP-103949, ERDEN TEOPE (Training, no membership_id)
  ('byarou030@gmail.com');             -- TTMPCAP-101165, duplicate GERO TABIOLO application

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM auth.users WHERE id IN (SELECT id FROM target_ids);
  RAISE NOTICE 'Matched % of 2 target auth.users rows', v_count;
END $$;

-- ----------------------------------------------------------------------------
-- Step 1: Resolve secondary root IDs.
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
-- Step 1b: Resolve TEXT membership_id keys.
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

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='personal_data_sheet') THEN
    INSERT INTO target_membership_ids (membership_id)
      SELECT DISTINCT pds.membership_number_id FROM public.personal_data_sheet pds
      WHERE lower(pds.email) IN (SELECT lower(email) FROM target_emails)
        AND pds.membership_number_id IS NOT NULL
      ON CONFLICT DO NOTHING;
  END IF;

  -- Also seed directly by known membership_id, in case neither email nor
  -- auth_user_id resolves it (covers the closed-member email-rewrite case).
  INSERT INTO target_membership_ids (membership_id) VALUES ('TTMPC-268'), ('TTMPC-297')
  ON CONFLICT DO NOTHING;
END $$;

DO $$
DECLARE v_mid INT;
BEGIN
  SELECT count(*) INTO v_mid FROM target_membership_ids;
  RAISE NOTICE 'Resolved % distinct membership_id text key(s)', v_mid;
END $$;

-- member_ids may still be unresolved (e.g. no public.member row at all, same
-- as several batch-1 accounts) — also resolve member.id directly by the
-- known membership_ids, in case the earlier auth_user_id/membership_id joins
-- missed it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member') THEN
    INSERT INTO target_member_ids (id)
      SELECT m.id FROM public.member m
      WHERE m.membership_id IN (SELECT membership_id FROM target_membership_ids)
      ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Step 1c: Resolve loan control numbers BEFORE loans are deleted.
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
-- Step 2: Delete from every public-schema table with member_id/auth_user_id/
-- member_account_id (uuid). receipts excluded (immutable by design).
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
      AND c.table_name NOT IN ('member', 'member_account', 'profiles', 'loans_member_id_backup_20260730', 'receipts')
    ORDER BY c.table_name, c.column_name
  LOOP
    IF rec.column_name = 'member_id' THEN
      v_sql := format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM target_member_ids)', rec.table_name, rec.column_name);
    ELSIF rec.column_name = 'auth_user_id' THEN
      v_sql := format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM target_ids)', rec.table_name, rec.column_name);
    ELSIF rec.column_name = 'member_account_id' THEN
      v_sql := format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM target_member_account_ids)', rec.table_name, rec.column_name);
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
-- Step 2c: Delete from every table keyed by loan_id (text, holds control_number).
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
  v_sql TEXT;
  v_deleted BIGINT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'loan_email_log', 'loan_notifications', 'loan_payment_ledger', 'loan_payments',
    'loan_penalties', 'loan_restructure_requests', 'loan_schedules', 'cbu_payouts',
    'co_makers', 'disbursement_confirmations', 'loan_calculator',
    'loan_payments_legacy', 'loan_renewal_override_requests'
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
-- Step 2b: Delete from tables keyed by TEXT membership_id/membership_number_id
-- (type-aware: uuid holds member.id, text/varchar holds "TTMPC-xxx").
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
  v_coltype TEXT;
  v_col TEXT;
  v_sql TEXT;
  v_deleted BIGINT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'GROCERY_TRANSACTIONS', 'Savings_Transactions', 'ledger_transactions',
    'savings_transaction_queue', 'attendance_logs', 'member_classification_temporal',
    'member_profile', 'personal_data_sheet', 'membership_payments',
    'loan_renewal_override_requests', 'member_import_stage'
  ]
  LOOP
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
        v_sql := format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM target_member_ids)', tbl, v_col);
      ELSIF v_coltype IN ('text', 'character varying') THEN
        v_sql := format('DELETE FROM public.%I WHERE %I IN (SELECT membership_id FROM target_membership_ids)', tbl, v_col);
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

-- attendance_logs.application_id -> member_applications.application_id FK —
-- must clear before member_applications itself.
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
