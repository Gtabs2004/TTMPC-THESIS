-- Cleanup migration for single-active-schedule design.
-- Use this if your database has historical pre-generated rows per loan.
-- It keeps only the earliest due active row per loan and marks the rest as Paid.

BEGIN;

WITH ranked_active AS (
  SELECT
    id,
    loan_id,
    row_number() OVER (
      PARTITION BY loan_id
      ORDER BY due_date ASC, installment_no ASC, created_at ASC
    ) AS rn
  FROM public.loan_schedules
  WHERE lower(coalesce(schedule_status, '')) IN ('unpaid', 'pending', 'overdue')
)
UPDATE public.loan_schedules ls
SET schedule_status = 'Paid'
FROM ranked_active ra
WHERE ls.id = ra.id
  AND ra.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_schedules_one_active_due_per_loan
  ON public.loan_schedules (loan_id)
  WHERE lower(coalesce(schedule_status, '')) IN ('unpaid', 'pending', 'overdue');

COMMIT;
