-- Destructive loan cleanup for TTMPC-295 through TTMPC-307.
--
-- This removes all regular and KOICA loan rows linked to these member UUIDs,
-- regardless of status, plus the listed loan-specific records. It does not
-- delete member/account rows, CBU or other accounting transactions, or audit_log.
--
-- This script commits the deletions when run. Review the preview carefully first.

BEGIN;

CREATE TEMP TABLE _loan_cleanup_members (
    membership_id text PRIMARY KEY,
    member_uuid uuid NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO _loan_cleanup_members (membership_id, member_uuid) VALUES
    ('TTMPC-295', 'a31c69ee-5fdb-4f3e-b940-541c0a97cedd'),
    ('TTMPC-296', 'fe8e4f40-f3d9-4c4b-9ec2-ffbc269ebd85'),
    ('TTMPC-297', '4580955d-ceda-4d80-bbb2-dd51a852ea4a'),
    ('TTMPC-298', 'b9bc69a4-83af-4f9d-b690-8395e8aaa5c2'),
    ('TTMPC-299', '207b314e-ee7c-4cc2-9c72-25d59742a90e'),
    ('TTMPC-300', 'e095cc91-82ca-4963-8677-706ba16a1338'),
    ('TTMPC-301', '7febd8cc-f62f-427b-8ec3-c2f93c698a39'),
    ('TTMPC-302', 'c6372942-1d99-4733-8884-5c95c3c7ee99'),
    ('TTMPC-303', 'f6b22908-5ac8-4e50-9eff-f1e00b400a53'),
    ('TTMPC-304', '2c7d1119-d5fa-4414-bf3f-e23eca1930b1'),
    ('TTMPC-305', 'a753cade-b64c-4bb8-ae0c-c35a0fa5c1f7'),
    ('TTMPC-306', 'c50f3fd8-9a29-407b-bc7c-d3192a1f176b'),
    ('TTMPC-307', '2952fa4f-03da-4e97-a135-54e3277425ac');

DO $$
DECLARE
    v_target_count integer;
    v_valid_count integer;
BEGIN
    SELECT count(*) INTO v_target_count FROM _loan_cleanup_members;
    SELECT count(*)
      INTO v_valid_count
      FROM _loan_cleanup_members AS target
      JOIN public.member AS member
        ON member.id = target.member_uuid
       AND upper(btrim(member.membership_id)) = upper(target.membership_id);

    IF v_target_count <> 13 OR v_valid_count <> 13 THEN
        RAISE EXCEPTION
            'Aborting cleanup: expected 13 UUID/membership matches; found % targets and % valid live matches.',
            v_target_count, v_valid_count;
    END IF;
END $$;

CREATE TEMP TABLE _loan_cleanup_regular_ids (
    control_number text PRIMARY KEY,
    member_uuid uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _loan_cleanup_regular_ids (control_number, member_uuid)
SELECT loans.control_number::text, loans.member_id
FROM public.loans AS loans
JOIN _loan_cleanup_members AS target
  ON target.member_uuid = loans.member_id;

CREATE TEMP TABLE _loan_cleanup_koica_ids (
    control_number text PRIMARY KEY,
    member_uuid uuid NOT NULL
) ON COMMIT DROP;

DO $$
BEGIN
    IF to_regclass('public.koica_loans') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO _loan_cleanup_koica_ids (control_number, member_uuid)
            SELECT loans.control_number::text, loans.member_id
            FROM public.koica_loans AS loans
            JOIN _loan_cleanup_members AS target
              ON target.member_uuid = loans.member_id
        $sql$;
    END IF;
END $$;

-- Preview the loan/application rows that will be removed.
SELECT
    target.membership_id,
    loans.source_table,
    loans.control_number
FROM (
    SELECT 'loans'::text AS source_table, control_number, member_uuid
    FROM _loan_cleanup_regular_ids
    UNION ALL
    SELECT 'koica_loans'::text AS source_table, control_number, member_uuid
    FROM _loan_cleanup_koica_ids
) AS loans
JOIN _loan_cleanup_members AS target
  ON target.member_uuid = loans.member_uuid
ORDER BY 1, 2, 3;

-- Delete optional records that can restrict deletion of a loan schedule.
DO $$
DECLARE
    item record;
BEGIN
    FOR item IN
        SELECT * FROM (VALUES
            ('loan_payment_ledger', 'loan_id'),
            ('loan_penalties', 'loan_id'),
            ('loan_payments_legacy', 'loan_id')
        ) AS optional_tables(table_name, loan_column)
    LOOP
        IF to_regclass(format('public.%I', item.table_name)) IS NOT NULL THEN
            EXECUTE format(
                'DELETE FROM public.%I WHERE %I IN (SELECT control_number FROM _loan_cleanup_regular_ids)',
                item.table_name,
                item.loan_column
            );
        END IF;
    END LOOP;

    IF to_regclass('public.loan_payments_legacy') IS NOT NULL THEN
        EXECUTE
            'DELETE FROM public.loan_payments_legacy '
            'WHERE member_id IN (SELECT member_uuid FROM _loan_cleanup_members)';
    END IF;
END $$;

DELETE FROM public.loan_payments
WHERE loan_id IN (SELECT control_number FROM _loan_cleanup_regular_ids);

DELETE FROM public.loan_schedules
WHERE loan_id IN (SELECT control_number FROM _loan_cleanup_regular_ids);

-- Remove optional regular-loan-associated operational records when installed.
DO $$
DECLARE
    item record;
BEGIN
    FOR item IN
        SELECT * FROM (VALUES
            ('loan_collateral', 'loan_control_number'),
            ('co_makers', 'loan_id'),
            ('loan_notifications', 'loan_id'),
            ('loan_email_log', 'loan_id'),
            ('disbursement_confirmations', 'loan_id'),
            ('loan_restructure_requests', 'loan_id'),
            ('loan_renewal_override_requests', 'loan_id')
        ) AS optional_tables(table_name, loan_column)
    LOOP
        IF to_regclass(format('public.%I', item.table_name)) IS NOT NULL THEN
            EXECUTE format(
                'DELETE FROM public.%I WHERE %I IN ('
                'SELECT control_number FROM _loan_cleanup_regular_ids '
                'UNION SELECT control_number FROM _loan_cleanup_koica_ids)',
                item.table_name,
                item.loan_column
            );
        END IF;
    END LOOP;

    IF to_regclass('public.loan_calculator') IS NOT NULL THEN
        EXECUTE
            'DELETE FROM public.loan_calculator '
            'WHERE member_id IN (SELECT member_uuid FROM _loan_cleanup_members) '
            'OR loan_id IN (SELECT control_number FROM _loan_cleanup_regular_ids)';
    END IF;
END $$;

-- Delete applications/loans last. Related KOICA payment rows cascade from koica_loans.
DELETE FROM public.loans
WHERE member_id IN (SELECT member_uuid FROM _loan_cleanup_members);

DO $$
BEGIN
    IF to_regclass('public.koica_loans') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.koica_loans WHERE member_id IN (SELECT member_uuid FROM _loan_cleanup_members)';
    END IF;
END $$;

COMMIT;
