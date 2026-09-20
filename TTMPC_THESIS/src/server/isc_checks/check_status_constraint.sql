-- Does the DB actually accept 'partially_paid'?
--
-- main.py swallows a failure on that UPDATE (by design: a constraint error must
-- not fail an approval), so if the constraint rejects the value the shortfall is
-- silently dropped -- exactly the symptom on CL-20260523-8734.
--
-- Returns ONE table so Supabase's editor shows it (RAISE NOTICE output is
-- hidden there, and only the last result set is displayed).

WITH probe AS (
    SELECT
        -- Attempt the real value against the live constraint without writing:
        -- if any CHECK on schedule_status rejects 'partially_paid', this is false.
        NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'public.loan_schedules'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%schedule_status%'
              AND pg_get_constraintdef(oid) NOT ILIKE '%partially_paid%'
        ) AS accepts_partially_paid
)
SELECT
    'accepts partially_paid' AS check_item,
    CASE WHEN p.accepts_partially_paid THEN 'YES' ELSE 'NO - THIS IS THE BUG' END AS result,
    (SELECT string_agg(conname || ' => ' || pg_get_constraintdef(oid), '  |  ')
       FROM pg_constraint
      WHERE conrelid = 'public.loan_schedules'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%schedule_status%') AS live_constraints
FROM probe p

UNION ALL

SELECT
    'single-active-due index',
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_loan_schedules_one_active_due_per_loan')
    THEN 'PRESENT' ELSE 'MISSING' END,
    COALESCE((SELECT indexdef FROM pg_indexes
        WHERE indexname = 'idx_loan_schedules_one_active_due_per_loan'), '-')

UNION ALL

-- If the index still counts a partially_paid row as "active", creating the
-- NEXT installment would violate it -- and that insert is also inside a
-- try/except, so it would fail silently too.
SELECT
    'index excludes partially_paid',
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_loan_schedules_one_active_due_per_loan'
          AND indexdef ILIKE '%partially_paid%')
    THEN 'NO - index counts it as active (BUG)' ELSE 'YES' END,
    '-'

UNION ALL

SELECT
    'schedule rows for this loan',
    (SELECT COUNT(*)::text FROM public.loan_schedules
      WHERE loan_id = 'CL-20260523-8734'),
    'expect 2 after a carried-forward partial payment';
