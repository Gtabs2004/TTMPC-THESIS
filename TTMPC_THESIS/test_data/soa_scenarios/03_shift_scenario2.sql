-- SOA test scenarios -- STEP 3: move scenario 2 (TESTSOA-CL-0002) one month
-- earlier so it sits at month 10 with THREE installments missed (#7 Jul 15,
-- #8 Aug 15, #9 Sep 15) and #10 (Oct 15) current. That is "3 months without
-- payment", the point where the first penalty must appear.
--
-- Only dates change. Amounts, statuses and row counts are untouched, so no
-- trigger that moves money fires (ledger / receipt / CBU triggers watch
-- confirmation_status or loan_status, which are not updated here).
-- Refuses to run twice: it checks the open row is still due 2026-08-15.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.loan_schedules
    WHERE loan_id = 'TESTSOA-CL-0002'
      AND lower(schedule_status) = 'unpaid'
      AND due_date = DATE '2026-08-15'
  ) THEN
    RAISE EXCEPTION 'TESTSOA-CL-0002 is not in its original state (open row not due 2026-08-15). Already shifted, or changed by testing -- stopping.';
  END IF;
END $$;

UPDATE public.loans
SET disbursal_date     = disbursal_date     - interval '1 month',
    application_date   = application_date   - interval '1 month',
    payment_start_date = payment_start_date - interval '1 month',
    updated_at         = now()
WHERE control_number = 'TESTSOA-CL-0002';

UPDATE public.loan_schedules
SET due_date = (due_date - interval '1 month')::date
WHERE loan_id = 'TESTSOA-CL-0002';

UPDATE public.loan_payments
SET payment_date = payment_date - interval '1 month',
    confirmed_at = confirmed_at - interval '1 month',
    reviewed_at  = reviewed_at  - interval '1 month'
WHERE loan_id = 'TESTSOA-CL-0002';

UPDATE public.loan_payment_ledger
SET posted_at = posted_at - interval '1 month'
WHERE loan_id = 'TESTSOA-CL-0002';

-- Expect: disbursed 2025-12-15; paid #1-#6 due Jan 15 .. Jun 15 (paid on the 13th);
-- open #7 due 2026-07-15, ~90 days past due.
SELECT s.installment_no, s.due_date, s.schedule_status,
       p.payment_date::date AS paid_on,
       current_date - s.due_date AS days_past_due
FROM public.loan_schedules s
LEFT JOIN public.loan_payments p ON p.schedule_id = s.id
WHERE s.loan_id = 'TESTSOA-CL-0002'
ORDER BY s.installment_no;

COMMIT;
