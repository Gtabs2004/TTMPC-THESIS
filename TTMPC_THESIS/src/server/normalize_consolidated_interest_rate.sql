-- Normalize existing consolidated loan interest rates from 0.83 -> 0.083
-- Run this in Supabase SQL editor.

BEGIN;

-- Preview rows that will be updated
-- SELECT l.control_number, l.interest_rate, lt.code, lt.name
-- FROM public.loans l
-- LEFT JOIN public.loan_types lt ON lt.id = l.loan_type_id
-- WHERE (
--   upper(coalesce(lt.code, '')) = 'CONSOLIDATED'
--   OR lower(coalesce(lt.name, '')) IN ('consolidated', 'consolidated loan')
-- )
-- AND l.interest_rate IS NOT NULL
-- AND abs(l.interest_rate - 0.83) < 0.000001;

UPDATE public.loans l
SET interest_rate = 0.083
FROM public.loan_types lt
WHERE lt.id = l.loan_type_id
  AND (
    upper(coalesce(lt.code, '')) = 'CONSOLIDATED'
    OR lower(coalesce(lt.name, '')) IN ('consolidated', 'consolidated loan')
  )
  AND l.interest_rate IS NOT NULL
  AND abs(l.interest_rate - 0.83) < 0.000001;

-- Optional: apply same normalization for koica_loans only if explicitly tagged as consolidated.
UPDATE public.koica_loans
SET interest_rate = 0.083
WHERE upper(coalesce(loan_type_code, '')) = 'CONSOLIDATED'
  AND interest_rate IS NOT NULL
  AND abs(interest_rate - 0.83) < 0.000001;

COMMIT;

-- Verify results after commit
-- SELECT l.control_number, l.interest_rate, lt.code, lt.name
-- FROM public.loans l
-- LEFT JOIN public.loan_types lt ON lt.id = l.loan_type_id
-- WHERE (
--   upper(coalesce(lt.code, '')) = 'CONSOLIDATED'
--   OR lower(coalesce(lt.name, '')) IN ('consolidated', 'consolidated loan')
-- )
-- ORDER BY l.control_number;
