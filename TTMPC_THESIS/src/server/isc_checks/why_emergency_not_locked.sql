-- Why is the Emergency card not locked for this member?
--
-- The lock needs an ACTIVE emergency loan. Two things can defeat it:
--   1. every emergency loan is already fully paid / closed
--   2. loan_status holds a value outside ACTIVE_LOAN_STATUSES
--      (backend: released / partially paid / paid / ongoing / active)
--   3. the loan_types join returns a code/name without "emergency" in it,
--      so _resolve_loan_type_code() cannot classify the row
--
-- Replace the control numbers below if you are checking a different member.

SELECT
    l.control_number,
    lt.code                      AS loan_type_code,
    lt.name                      AS loan_type_name,
    -- What the backend's _resolve_loan_type_code() would return:
    CASE
        WHEN lower(COALESCE(lt.code,'') || ' ' || COALESCE(lt.name,'')) LIKE '%consolidated%' THEN 'consolidated'
        WHEN lower(COALESCE(lt.code,'') || ' ' || COALESCE(lt.name,'')) LIKE '%emergency%'    THEN 'emergency'
        WHEN lower(COALESCE(lt.code,'') || ' ' || COALESCE(lt.name,'')) LIKE '%bonus%'        THEN 'bonus'
        ELSE 'UNRESOLVED - backend ignores this loan'
    END                          AS resolved_type,
    l.loan_status,
    -- Does that status count as active?
    -- ACTIVE_LOAN_STATUSES in main.py is exactly this set:
    CASE
        WHEN lower(COALESCE(l.loan_status,'')) IN ('released','paid','partially paid')
        THEN 'ACTIVE -> should lock'
        ELSE 'not active -> does NOT lock'
    END                          AS lock_effect,
    l.application_date,
    l.disbursal_date
FROM public.loans l
LEFT JOIN public.loan_types lt ON lt.id = l.loan_type_id
WHERE l.control_number IN (
    'EL-20260919-7042',
    'EL-20260818-2581',
    'EL-20260818-1476',
    'EL-20260818-8051'
)
ORDER BY l.application_date DESC;


-- What loan_status values exist on emergency loans overall? Anything outside
-- the active list above is invisible to the eligibility check.
SELECT
    lt.name                AS loan_type,
    l.loan_status,
    COUNT(*)               AS loans
FROM public.loans l
LEFT JOIN public.loan_types lt ON lt.id = l.loan_type_id
WHERE lower(COALESCE(lt.code,'') || ' ' || COALESCE(lt.name,'')) LIKE '%emergency%'
GROUP BY lt.name, l.loan_status
ORDER BY COUNT(*) DESC;
