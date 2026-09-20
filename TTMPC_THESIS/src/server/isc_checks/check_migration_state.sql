-- Read-only: which parts of the payment migrations are actually in place?
-- Expected answers are in the `expected` column.

SELECT 'loan_penalties table' AS item,
       CASE WHEN to_regclass('public.loan_penalties') IS NOT NULL
            THEN 'PRESENT' ELSE 'MISSING' END AS state,
       'PRESENT' AS expected
UNION ALL
SELECT 'loan_payments.applied_to_penalty',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='loan_payments' AND column_name='applied_to_penalty')
            THEN 'PRESENT' ELSE 'MISSING' END, 'PRESENT'
UNION ALL
SELECT 'loan_payments.applied_to_credit',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='loan_payments' AND column_name='applied_to_credit')
            THEN 'PRESENT' ELSE 'MISSING' END, 'PRESENT'
UNION ALL
SELECT 'loan_schedules.carried_arrears',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='loan_schedules' AND column_name='carried_arrears')
            THEN 'PRESENT' ELSE 'MISSING' END, 'PRESENT'
UNION ALL
SELECT 'loan_schedules.applied_credit',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='loan_schedules' AND column_name='applied_credit')
            THEN 'PRESENT' ELSE 'MISSING' END, 'PRESENT'
UNION ALL
-- Checks EVERY constraint touching schedule_status, not just one by name:
-- a row must satisfy all of them, and an older v2_chk once blocked
-- partially_paid while the named check allowed it.
SELECT 'schedule_status allows partially_paid',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.loan_schedules'::regclass
                AND contype = 'c'
                AND pg_get_constraintdef(oid) ILIKE '%schedule_status%'
                AND pg_get_constraintdef(oid) NOT ILIKE '%partially_paid%')
            THEN 'PRESENT' ELSE 'MISSING' END, 'PRESENT'
UNION ALL
SELECT 'payment_reference unique index',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                         WHERE indexname='idx_loan_payments_payment_reference_uk')
            THEN 'PRESENT' ELSE 'MISSING' END, 'PRESENT'
UNION ALL
SELECT 'SOA view has total_amount_due',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='member_statement_of_account'
                           AND column_name='total_amount_due')
            THEN 'PRESENT' ELSE 'MISSING' END, 'PRESENT'
UNION ALL
SELECT 'partial-payment trigger fix',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc
                         WHERE proname='sync_loan_payment_to_ledger'
                           AND prosrc ILIKE '%v_paid_toward_installment%')
            THEN 'PRESENT' ELSE 'MISSING' END, 'PRESENT'
UNION ALL
SELECT 'duplicate payment_reference values',
       COALESCE((SELECT COUNT(*)::text FROM (
            SELECT payment_reference FROM public.loan_payments
            WHERE payment_reference IS NOT NULL
            GROUP BY payment_reference HAVING COUNT(*) > 1) d), '0'),
       '0';
