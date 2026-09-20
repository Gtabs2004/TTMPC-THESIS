-- Did the constraint fix take, and is there anything left to approve?

SELECT
    'constraints blocking partially_paid' AS check_item,
    COALESCE((
        SELECT string_agg(conname, ', ')
        FROM pg_constraint
        WHERE conrelid = 'public.loan_schedules'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%schedule_status%'
          AND pg_get_constraintdef(oid) NOT ILIKE '%partially_paid%'
    ), 'NONE - fix applied correctly') AS result

UNION ALL

SELECT
    'payments still awaiting approval',
    COALESCE((
        SELECT string_agg(payment_reference || ' = ' || amount_paid::text, ' | ')
        FROM public.loan_payments
        WHERE loan_id = 'CL-20260523-8734'
          AND lower(COALESCE(confirmation_status,'')) NOT IN ('validated','rejected')
    ), 'none - nothing left to approve')

UNION ALL

SELECT
    'already-validated payments',
    COALESCE((
        SELECT string_agg(payment_reference || ' = ' || amount_paid::text, ' | ')
        FROM public.loan_payments
        WHERE loan_id = 'CL-20260523-8734'
          AND lower(COALESCE(confirmation_status,'')) = 'validated'
    ), 'none');
