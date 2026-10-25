-- DEMO ONLY: seed a simulated consolidated loan for the synthetic TTMPC-306
-- account so the payment, SOA, and Bookkeeper ledger screens can be previewed.
-- Run only in the database where this exact member is confirmed to be synthetic.
--
-- Scenario: PHP 100,000; 12 months; originated May 26, 2026; June-August paid;
-- September missed; October installment due October 26, 2026.
-- Uses the current CONSOLIDATED loan_types.interest_rate. Penalties are excluded.
--
-- This inserts a tagged loan and three tagged validated demo payments. It does
-- not mark the loan Released, so the release-triggered CBU credit is not fired.
-- Payment validation uses the installed workflow trigger to populate the
-- Bookkeeper ledger. Loan IDs use CL-YYYYMMDD-XXXX; payment references use
-- the Cashier's TTMPCLP-<base36 timestamp><6 random base36 chars> format.

BEGIN;

DO $$
DECLARE
    v_member_id uuid := 'c50f3fd8-9a29-407b-bc7c-d3192a1f176b';
    v_membership_id text := 'TTMPC-306';
    v_control_number text;
    v_attempt integer;
    v_loan_type_id public.loan_types.id%TYPE;
    v_loan_type_matches integer;
    v_rate_percent numeric;
    v_principal numeric := 100000.00;
    v_term integer := 12;
    v_monthly_principal numeric;
    v_monthly_interest numeric;
    v_monthly_amortization numeric;
    v_total_interest numeric;
    v_digits constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    v_millis bigint;
    v_unique_suffix text;
    v_payment_reference text;
    v_transaction_reference text;
    v_payment_id uuid;
    v_digit_index integer;
    v_random_index integer;
    v_installment record;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.member m
        WHERE m.id = v_member_id
          AND m.membership_id = v_membership_id
          AND lower(btrim(m.first_name)) = 'ricky'
          AND lower(btrim(m.last_name)) = 'gallo'
    ) THEN
        RAISE EXCEPTION
            'Safety check failed: expected synthetic member Ricky Gallo / TTMPC-306 / %.',
            v_member_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.loans
        WHERE raw_payload->>'demo_scenario' = 'ricky_gallo_missed_september_2026'
    ) THEN
        RAISE EXCEPTION
            'A loan tagged for this demo scenario already exists; refusing duplicate seed.';
    END IF;

    FOR v_attempt IN 1..50 LOOP
        v_control_number := format(
            'CL-%s-%s',
            to_char((now() AT TIME ZONE 'Asia/Manila')::date, 'YYYYMMDD'),
            lpad((floor(random() * 9000)::integer + 1000)::text, 4, '0')
        );
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.loans WHERE control_number = v_control_number
        );
    END LOOP;

    IF v_control_number IS NULL
       OR EXISTS (
            SELECT 1 FROM public.loans WHERE control_number = v_control_number
       ) THEN
        RAISE EXCEPTION 'Could not generate a unique system-format control number.';
    END IF;

    IF to_regclass('public.loan_payment_ledger') IS NULL
       OR to_regclass('public.member_statement_of_account') IS NULL
       OR NOT EXISTS (
            SELECT 1
            FROM pg_trigger
            WHERE tgrelid = 'public.loan_payments'::regclass
              AND tgname = 'trg_sync_loan_payment_to_ledger'
              AND NOT tgisinternal
       ) THEN
        RAISE EXCEPTION
            'Required payment ledger / SOA / sync trigger is missing; apply the loan payment schema first.';
    END IF;

    SELECT count(*)
    INTO v_loan_type_matches
    FROM public.loan_types lt
    WHERE upper(btrim(coalesce(lt.code, ''))) = 'CONSOLIDATED';

    IF v_loan_type_matches = 1 THEN
        SELECT lt.id, lt.interest_rate
        INTO v_loan_type_id, v_rate_percent
        FROM public.loan_types lt
        WHERE upper(btrim(coalesce(lt.code, ''))) = 'CONSOLIDATED';
    ELSE
        SELECT count(*)
        INTO v_loan_type_matches
        FROM public.loan_types lt
        WHERE lower(btrim(coalesce(lt.name, ''))) IN ('consolidated', 'consolidated loan');

        IF v_loan_type_matches <> 1 THEN
            RAISE EXCEPTION
                'Expected exactly one CONSOLIDATED loan type; found %.',
                v_loan_type_matches;
        END IF;

        SELECT lt.id, lt.interest_rate
        INTO v_loan_type_id, v_rate_percent
        FROM public.loan_types lt
        WHERE lower(btrim(coalesce(lt.name, ''))) IN ('consolidated', 'consolidated loan');
    END IF;

    IF coalesce(v_rate_percent, 0) <= 0 THEN
        RAISE EXCEPTION
            'The CONSOLIDATED monthly interest rate is missing or invalid.';
    END IF;

    -- Match /api/loans/compute for consolidated loans:
    -- monthly principal + (principal x monthly percentage rate).
    v_monthly_principal := round(v_principal / v_term, 2);
    v_monthly_interest := round(v_principal * v_rate_percent / 100, 2);
    v_monthly_amortization := v_monthly_principal + v_monthly_interest;
    v_total_interest := v_monthly_interest * v_term;

    INSERT INTO public.loans (
        control_number,
        member_id,
        loan_type_id,
        loan_amount,
        principal_amount,
        interest_rate,
        term,
        loan_status,
        application_status,
        application_type,
        application_date,
        disbursal_date,
        payment_start_date,
        monthly_amortization,
        total_interest,
        raw_payload,
        created_at,
        updated_at
    ) VALUES (
        v_control_number,
        v_member_id,
        v_loan_type_id,
        v_principal,
        v_principal,
        v_rate_percent,
        v_term,
        'partially paid',
        'partially paid',
        'new',
        DATE '2026-05-26',
        TIMESTAMPTZ '2026-05-26 09:00:00+08',
        DATE '2026-06-26',
        v_monthly_amortization,
        v_total_interest,
        jsonb_build_object(
            'demo_scenario', 'ricky_gallo_missed_september_2026',
            'synthetic_member', true,
            'description', 'Demo only: June-August paid, September missed, October due',
            'interest_rate_source', 'public.loan_types.interest_rate'
        ),
        now(),
        now()
    );

    -- Only one open schedule is seeded, matching the live single-active-row
    -- design. September is closed as partially_paid with no payment; its full
    -- installment is carried into the October open schedule.
    WITH installments AS (
        SELECT
            gs.installment_no,
            (DATE '2026-06-26' + ((gs.installment_no - 1) * INTERVAL '1 month'))::date AS due_date,
            CASE
                WHEN gs.installment_no = v_term THEN
                    v_principal - v_monthly_principal * (v_term - 1)
                ELSE v_monthly_principal
            END AS expected_principal,
            v_monthly_interest AS expected_interest
        FROM generate_series(1, 5) AS gs(installment_no)
    ),
    numbered AS (
        SELECT
            i.*,
            i.expected_principal + i.expected_interest AS expected_amount,
            v_principal - SUM(i.expected_principal) OVER (
                ORDER BY i.installment_no
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS remaining_principal
        FROM installments i
    )
    INSERT INTO public.loan_schedules (
        schedule_id,
        loan_id,
        installment_no,
        due_date,
        expected_principal,
        expected_interest,
        penalty,
        remaining_principal,
        expected_amount,
        principal_component,
        interest_component,
        schedule_status,
        carried_arrears,
        applied_credit
    )
    SELECT
        v_control_number || '-' || lpad(installment_no::text, 2, '0'),
        v_control_number,
        installment_no,
        due_date,
        expected_principal,
        expected_interest,
        2,
        greatest(remaining_principal, 0),
        expected_amount,
        expected_principal,
        expected_interest,
        CASE
            WHEN installment_no <= 3 THEN 'Paid'
            WHEN installment_no = 4 THEN 'partially_paid'
            ELSE 'Unpaid'
        END,
        CASE
            WHEN installment_no = 5 THEN lag(expected_amount) OVER (ORDER BY installment_no)
            ELSE 0
        END,
        0
    FROM numbered
    ORDER BY installment_no;

    -- Match Cashier's TTMPCLP-<Date.now base36><6 random base36 chars>.
    FOR v_installment IN
        SELECT s.id, s.installment_no, s.expected_amount, s.due_date
        FROM public.loan_schedules s
        WHERE s.loan_id = v_control_number
          AND s.installment_no BETWEEN 1 AND 3
        ORDER BY s.installment_no
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
            SELECT 1 FROM public.loan_payments
            WHERE payment_reference = v_payment_reference
               OR transaction_reference = v_transaction_reference
        ) THEN
            RAISE EXCEPTION 'Generated payment reference collision; rerun the demo seed.';
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
            v_control_number,
            v_installment.id,
            v_payment_reference,
            v_transaction_reference,
            v_installment.expected_amount,
            (v_installment.due_date + TIME '09:00') AT TIME ZONE 'Asia/Manila',
            0,
            0,
            'pending_bookkeeper',
            'SIMULATED DEMO PAYMENT - no actual cash received.',
            'system',
            (v_installment.due_date + TIME '09:00') AT TIME ZONE 'Asia/Manila'
        )
        RETURNING id INTO v_payment_id;

        UPDATE public.loan_payments
        SET
            confirmation_status = 'validated',
            validation_notes = 'SIMULATED DEMO PAYMENT - no actual cash received.',
            reviewed_at = now()
        WHERE id = v_payment_id;
    END LOOP;

    IF (
        SELECT count(*)
        FROM public.loan_payment_ledger pl
        WHERE pl.loan_id = v_control_number
    ) <> 3 THEN
        RAISE EXCEPTION
            'Expected 3 demo payment ledger rows; trigger did not create all rows.';
    END IF;
END;
$$;

COMMIT;

-- Verification: loan/schedule state, validated payments + Bookkeeper ledger,
-- then the validated rows visible to the Member SOA.
SELECT
    l.control_number,
    m.membership_id,
    l.loan_status,
    l.application_status,
    l.principal_amount,
    l.interest_rate,
    l.term,
    l.monthly_amortization,
    l.total_interest,
    s.installment_no,
    s.due_date,
    s.expected_amount,
    s.carried_arrears,
    s.schedule_status
FROM public.loans l
JOIN public.member m ON m.id = l.member_id
JOIN public.loan_schedules s ON s.loan_id = l.control_number
WHERE l.raw_payload->>'demo_scenario' = 'ricky_gallo_missed_september_2026'
ORDER BY s.installment_no;

SELECT
    p.payment_reference,
    p.transaction_reference,
    p.payment_date,
    p.amount_paid,
    p.confirmation_status,
    pl.total_collected AS ledger_total_collected,
    pl.posted_at AS ledger_posted_at
FROM public.loan_payments p
LEFT JOIN public.loan_payment_ledger pl ON pl.payment_id = p.id
WHERE p.loan_id IN (
    SELECT control_number
    FROM public.loans
    WHERE raw_payload->>'demo_scenario' = 'ricky_gallo_missed_september_2026'
)
ORDER BY p.payment_date;

SELECT
    soa.control_number,
    soa.payment_date,
    soa.reference_id,
    soa.principal_paid,
    soa.interest_paid,
    soa.total_amount_paid,
    soa.outstanding_balance
FROM public.member_statement_of_account soa
WHERE soa.control_number IN (
    SELECT control_number
    FROM public.loans
    WHERE raw_payload->>'demo_scenario' = 'ricky_gallo_missed_september_2026'
)
ORDER BY soa.payment_date;

-- Optional cleanup (run separately only if you want to remove this demo):
-- BEGIN;
-- DO $$
-- BEGIN
--     IF NOT EXISTS (
--         SELECT 1
--         FROM public.loans l
--         WHERE l.control_number = (
--             SELECT control_number
--             FROM public.loans
--             WHERE member_id = 'c50f3fd8-9a29-407b-bc7c-d3192a1f176b'
--               AND raw_payload->>'demo_scenario' = 'ricky_gallo_missed_september_2026'
--         )
--           AND l.member_id = 'c50f3fd8-9a29-407b-bc7c-d3192a1f176b'
--           AND l.raw_payload->>'demo_scenario' = 'ricky_gallo_missed_september_2026'
--     ) THEN
--         RAISE EXCEPTION 'Refusing cleanup: tagged demo loan was not found.';
--     END IF;
--
--     DELETE FROM public.loan_payments
--     WHERE loan_id IN (
--         SELECT control_number FROM public.loans
--         WHERE member_id = 'c50f3fd8-9a29-407b-bc7c-d3192a1f176b'
--           AND raw_payload->>'demo_scenario' = 'ricky_gallo_missed_september_2026'
--     )
--       AND validation_notes = 'SIMULATED DEMO PAYMENT - no actual cash received.';
--     DELETE FROM public.loan_schedules
--     WHERE loan_id IN (
--         SELECT control_number FROM public.loans
--         WHERE member_id = 'c50f3fd8-9a29-407b-bc7c-d3192a1f176b'
--           AND raw_payload->>'demo_scenario' = 'ricky_gallo_missed_september_2026'
--     );
--     DELETE FROM public.loans
--     WHERE control_number IN (
--         SELECT control_number FROM public.loans
--         WHERE member_id = 'c50f3fd8-9a29-407b-bc7c-d3192a1f176b'
--           AND raw_payload->>'demo_scenario' = 'ricky_gallo_missed_september_2026'
--     )
--       AND member_id = 'c50f3fd8-9a29-407b-bc7c-d3192a1f176b'
--       AND raw_payload->>'demo_scenario' = 'ricky_gallo_missed_september_2026';
-- END;
-- $$;
-- COMMIT;
-- Loan audit-log history, if enabled, is intentionally retained after cleanup.
