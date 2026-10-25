-- Replace the three simulated reference labels with the same format Cashier
-- generates: TTMPCLP-<Date.now base36><6 random base36 chars>, paired with
-- TTMPCLP_TXN_<same suffix>.
--
-- Validated payment references are immutable by design. This script therefore
-- recreates ONLY the tagged demo payments, preserving schedule, amount, date,
-- penalty, deficiency, and notes. The ledger rows are recreated by the normal
-- validation trigger. No loan amounts or schedule amounts are changed.
--
-- Run once after DEMO_RICKY_LOAN_SCENARIO_SEED.sql. Transaction rolls back if
-- the exact loan/member/tag/payment checks fail.

BEGIN;

CREATE TEMP TABLE demo_ricky_payment_reference_snapshot
ON COMMIT DROP
AS
SELECT
    p.id AS old_payment_id,
    p.schedule_id,
    s.installment_no,
    p.amount_paid,
    p.payment_date,
    p.penalties,
    p.deficiency,
    p.validation_notes,
    p.entered_by_role,
    p.created_at
FROM public.loan_payments p
JOIN public.loans l ON l.control_number = p.loan_id
JOIN public.member m ON m.id = l.member_id
JOIN public.loan_schedules s ON s.id = p.schedule_id
WHERE p.loan_id = 'CL-20261026-9529'
  AND l.raw_payload->>'demo_scenario' = 'ricky_gallo_missed_september_2026'
  AND l.member_id = 'c50f3fd8-9a29-407b-bc7c-d3192a1f176b'
  AND m.membership_id = 'TTMPC-306'
  AND p.payment_reference LIKE 'DEMO-RICKY-2026-PAY-%';

DO $$
DECLARE
    v_count integer;
    v_digits constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    v_millis bigint;
    v_unique_suffix text;
    v_payment_reference text;
    v_transaction_reference text;
    v_payment_id uuid;
    v_digit_index integer;
    v_random_index integer;
    v_payment record;
BEGIN
    SELECT count(*) INTO v_count FROM demo_ricky_payment_reference_snapshot;
    IF v_count <> 3 THEN
        RAISE EXCEPTION
            'Expected exactly 3 tagged demo payments for CL-20261026-9529; found %. Nothing changed.',
            v_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.loan_payments p
        JOIN demo_ricky_payment_reference_snapshot s ON s.old_payment_id = p.id
        WHERE lower(coalesce(p.confirmation_status, '')) <> 'validated'
    ) THEN
        RAISE EXCEPTION 'All three demo payments must be validated before reference repair.';
    END IF;

    IF to_regclass('public.loan_payment_ledger') IS NULL
       OR NOT EXISTS (
            SELECT 1
            FROM pg_trigger
            WHERE tgrelid = 'public.loan_payments'::regclass
              AND tgname = 'trg_sync_loan_payment_to_ledger'
              AND NOT tgisinternal
       ) THEN
        RAISE EXCEPTION 'The loan payment ledger sync trigger is missing.';
    END IF;

    DELETE FROM public.loan_payments p
    USING demo_ricky_payment_reference_snapshot s
    WHERE p.id = s.old_payment_id;

    FOR v_payment IN
        SELECT *
        FROM demo_ricky_payment_reference_snapshot
        ORDER BY installment_no
    LOOP
        v_millis := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
        v_unique_suffix := '';
        WHILE v_millis > 0 LOOP
            v_digit_index := (v_millis % 36)::integer + 1;
            v_unique_suffix := substr(v_digits, v_digit_index, 1) || v_unique_suffix;
            v_millis := v_millis / 36;
        END LOOP;
        FOR v_random_index IN 1..6 LOOP
            v_unique_suffix := v_unique_suffix ||
                substr(v_digits, floor(random() * 36)::integer + 1, 1);
        END LOOP;
        v_unique_suffix := upper(v_unique_suffix);
        v_payment_reference := 'TTMPCLP-' || v_unique_suffix;
        v_transaction_reference := 'TTMPCLP_TXN_' || v_unique_suffix;

        IF EXISTS (
            SELECT 1
            FROM public.loan_payments
            WHERE payment_reference = v_payment_reference
               OR transaction_reference = v_transaction_reference
        ) THEN
            RAISE EXCEPTION 'Generated reference collision; rerun the repair script.';
        END IF;

        INSERT INTO public.loan_payments (
            loan_id,
            schedule_id,
            payment_reference,
            transaction_reference,
            amount_paid,
            payment_date,
            penalties,
            deficiency,
            confirmation_status,
            validation_notes,
            entered_by_role,
            created_at
        ) VALUES (
            'CL-20261026-9529',
            v_payment.schedule_id,
            v_payment_reference,
            v_transaction_reference,
            v_payment.amount_paid,
            v_payment.payment_date,
            v_payment.penalties,
            v_payment.deficiency,
            'pending_bookkeeper',
            'SIMULATED DEMO PAYMENT - no actual cash received.',
            'system',
            v_payment.created_at
        )
        RETURNING id INTO v_payment_id;

        UPDATE public.loan_payments
        SET
            confirmation_status = 'validated',
            validation_notes = 'SIMULATED DEMO PAYMENT - no actual cash received.',
            reviewed_at = now()
        WHERE id = v_payment_id;
    END LOOP;

    SELECT count(*) INTO v_count
    FROM public.loan_payment_ledger
    WHERE loan_id = 'CL-20261026-9529';

    IF v_count <> 3 THEN
        RAISE EXCEPTION
            'Expected 3 rebuilt demo ledger rows, found %. Transaction will roll back.',
            v_count;
    END IF;
END;
$$;

COMMIT;

-- Confirm Cashier references, SOA reference_id, and corresponding ledger rows.
SELECT
    p.payment_reference,
    p.transaction_reference,
    p.payment_date,
    p.amount_paid,
    p.confirmation_status,
    pl.total_collected AS ledger_total_collected,
    soa.reference_id AS soa_reference_id
FROM public.loan_payments p
LEFT JOIN public.loan_payment_ledger pl ON pl.payment_id = p.id
LEFT JOIN public.member_statement_of_account soa ON soa.payment_id = p.id
WHERE p.loan_id = 'CL-20261026-9529'
  AND p.validation_notes = 'SIMULATED DEMO PAYMENT - no actual cash received.'
ORDER BY p.payment_date;
