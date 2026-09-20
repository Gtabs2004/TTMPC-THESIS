-- The cashier screen bills 7,490 for installment 3, but that row's
-- expected_amount is 256,490 (a running total with the 2,490 shortfall folded
-- in). So which number does the UI actually use, and would a populated
-- carried_arrears even show up?
--
-- The UI caps the due at the loan's monthly_amortization and ADDS
-- carried_arrears. If carried_arrears is 0 (because the legacy fallback wrote
-- the row), the shortfall is invisible -- billed inside expected_amount, which
-- the UI ignores as unreliable on running-total rows.

SELECT
    s.installment_no,
    s.due_date,
    s.schedule_status,
    s.expected_amount                          AS raw_expected,
    COALESCE(s.carried_arrears, 0)             AS carried_arrears,
    COALESCE(s.applied_credit, 0)              AS applied_credit,
    l.monthly_amortization,
    -- What the cashier screen computes and shows:
    LEAST(l.monthly_amortization, s.expected_amount)
      + COALESCE(s.carried_arrears, 0)
      - COALESCE(s.applied_credit, 0)          AS ui_total_due,
    -- What it SHOULD be if the shortfall were in carried_arrears:
    l.monthly_amortization + 2490.00           AS expected_if_fixed
FROM public.loan_schedules s
JOIN public.loans l ON l.control_number = s.loan_id
WHERE s.loan_id = 'CL-20260519-5266'
ORDER BY s.installment_no;
