-- Decisive: is the running FastAPI process actually executing the new code?
--
-- The validated ₱5,000 payment went through the approve path. If that path ran
-- the new logic, it MUST have written the allocation breakdown. All zeros means
-- the process is still running the pre-change code (uvicorn --reload does not
-- always pick up edits reliably on Windows).

SELECT
    payment_reference,
    amount_paid,
    confirmation_status,
    applied_to_penalty,
    applied_to_arrears,
    applied_to_current,
    applied_to_credit,
    CASE
        WHEN COALESCE(applied_to_penalty,0) + COALESCE(applied_to_arrears,0)
           + COALESCE(applied_to_current,0) + COALESCE(applied_to_credit,0) = 0
            THEN 'STALE SERVER - new code did not run'
        ELSE 'NEW CODE RAN'
    END AS verdict
FROM public.loan_payments
WHERE loan_id = 'CL-20260523-8734'
  AND lower(COALESCE(confirmation_status,'')) = 'validated';
