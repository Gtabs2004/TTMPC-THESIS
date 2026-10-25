-- DEMO ONLY: insert a simulated consolidated-loan scenario for Ana L. Dela Cruz
-- (TTMPC-301) so the installment, penalty, SOA, and Bookkeeper ledger behavior
-- can be reviewed in the application.
--
-- IMPORTANT: Ana is an existing member. This creates fictional loan and payment
-- history on her account; do not run against production or treat these payments
-- as actual cash received.
--
-- Scenario: PHP 150,000; 24 months; first installment due February 26, 2026;
-- installments 1-5 paid; installments 6-8 missed; installment 9 due October
-- 26, 2026. Uses the current CONSOLIDATED loan_types.interest_rate.
--
-- The penalty is NOT inserted here. The current backend starts penalties for
-- non-bonus loans after 3 consecutive missed due dates and computes the charge
-- using its configured rule when the loan is loaded/paid. For this scenario,
-- the missed July-September installments should make the October payment
-- eligible for that system-calculated penalty.
--
-- This inserts one tagged loan, nine schedules, and five tagged validated
-- simulated payments. Validation uses the installed workflow trigger to create
-- Bookkeeper ledger rows. The loan ID and payment references follow the
-- application's current formats.

BEGIN;

DO $$
DECLARE
    v_member_id uuid;
    v_membership_id text := 'TTMPC-301';
    v_member_matches integer;
    v_control_number text;
    v_attempt integer;
    v_loan_type_id public.loan_types.id%TYPE;
    v_loan_type_matches integer;
    v_rate_percent numeric;
    v_principal numeric := 150000.00;
    v_term integer := 24;
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
    SELECT count(*)
    INTO v_member_matches
    FROM public.member m
    WHERE m.membership_id = v_membership_id
      AND lower(btrim(m.first_name)) = 'ana'
      AND lower(btrim(m.last_name)) = 'dela cruz';

    IF v_member_matches <> 1 THEN
        RAISE EXCEPTION
            'Safety check failed: expected exactly one Ana Dela Cruz / TTMPC-301; found %.',
            v_member_matches;
    END IF;

    SELECT m.id
    INTO v_member_id
    FROM public.member m
    WHERE m.membership_id = v_membership_id
      AND lower(btrim(m.first_name)) = 'ana'
      AND lower(btrim(m.last_name)) = 'dela cruz';

    IF EXISTS (
        SELECT 1
        FROM public.loans
        WHERE raw_payload->>'demo_scenario' = 'ana_dela_cruz_missed_installments_2026'
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
        DATE '2026-02-26',
        TIMESTAMPTZ '2026-02-26 09:00:00+08',
        DATE '2026-02-26',
        v_monthly_amortization,
        v_total_interest,
        jsonb_build_object(
            'demo_scenario', 'ana_dela_cruz_missed_installments_2026',
            'synthetic_scenario', true,
            'description', 'SIMULATED ONLY: 150000 consolidated, 24 months; installments 1-5 paid, 6-8 missed, 9 due October 2026',
            'interest_rate_source', 'public.loan_types.interest_rate',
            'no_actual_cash_received', true
        ),
        now(),
        now()
    );

    -- Past-due periods are closed as partially_paid, matching the Cashier
    -- reconciliation workflow; the complete unpaid amount is carried on the
    -- current October schedule. Future rows are created as payments progress.
    WITH installments AS (
        SELECT
            gs.installment_no,
            (DATE '2026-02-26' + ((gs.installment_no - 1) * INTERVAL '1 month'))::date AS due_date,
            CASE
                WHEN gs.installment_no = v_term THEN
                    v_principal - v_monthly_principal * (v_term - 1)
                ELSE v_monthly_principal
            END AS expected_principal,
            v_monthly_interest AS expected_interest
        FROM generate_series(1, 9) AS gs(installment_no)
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
            WHEN installment_no <= 5 THEN 'Paid'
            WHEN installment_no BETWEEN 6 AND 8 THEN 'partially_paid'
            ELSE 'Unpaid'
        END,
        CASE
            WHEN installment_no = 9 THEN 3 * v_monthly_amortization
            ELSE 0
        END,
        0
    FROM numbered
    ORDER BY installment_no;

    -- Match Cashier's TTMPCLP-<base36 timestamp><6 random base36 chars>.
    FOR v_installment IN
        SELECT s.id, s.installment_no, s.expected_amount, s.due_date
        FROM public.loan_schedules s
        WHERE s.loan_id = v_control_number
          AND s.installment_no BETWEEN 1 AND 5
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
    ) <> 5 THEN
        RAISE EXCEPTION
            'Expected 5 demo payment ledger rows; trigger did not create all rows.';
    END IF;
END;
$$;

COMMIT;

-- Verification: loan/schedule state, simulated payments + ledger, and SOA.
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
WHERE l.raw_payload->>'demo_scenario' = 'ana_dela_cruz_missed_installments_2026'
ORDER BY s.installment_no;

SELECT
    p.payment_reference,
    p.transaction_reference,
    p.payment_date,
    p.amount_paid,
    p.confirmation_status,
    p.validation_notes,
    pl.total_collected AS ledger_total_collected,
    pl.posted_at AS ledger_posted_at
FROM public.loan_payments p
LEFT JOIN public.loan_payment_ledger pl ON pl.payment_id = p.id
WHERE p.loan_id IN (
    SELECT control_number
    FROM public.loans
    WHERE raw_payload->>'demo_scenario' = 'ana_dela_cruz_missed_installments_2026'
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
    WHERE raw_payload->>'demo_scenario' = 'ana_dela_cruz_missed_installments_2026'
)
ORDER BY soa.payment_date;

-- The system calculates/persists penalties through its normal backend workflow;
-- the seed intentionally does not fabricate a loan_penalties row.
SELECT
    lp.period_due_date,
    lp.installment_no,
    lp.amount,
    lp.basis_balance,
    lp.rate_percent,
    lp.is_paid
FROM public.loan_penalties lp
WHERE lp.loan_id IN (
    SELECT control_number
    FROM public.loans
    WHERE raw_payload->>'demo_scenario' = 'ana_dela_cruz_missed_installments_2026'
)
ORDER BY lp.period_due_date;
