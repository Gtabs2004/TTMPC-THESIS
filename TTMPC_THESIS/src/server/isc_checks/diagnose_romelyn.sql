-- CL-20260519-5266 (Romelyn Delos Reyes I): amortization 7,490.00.
-- Paid 7,490.00 on 9/17 (exact), then 5,000.00 on 9/20 (short by 2,490.00).
--
-- ONE result set: Supabase's editor shows only the last one.
-- Rows are labelled so the schedule rows and the payment rows can be told apart.

SELECT
    'SCHEDULE'                            AS row_kind,
    s.installment_no::text                AS a_installment,
    s.due_date::text                      AS b_due_date,
    s.schedule_status                     AS c_status,
    s.expected_amount::text               AS d_expected,
    COALESCE(s.carried_arrears, 0)::text  AS e_arrears,
    COALESCE(s.applied_credit, 0)::text   AS f_credit,
    (SELECT COALESCE(SUM(p.amount_paid), 0)::text
       FROM public.loan_payments p
      WHERE p.schedule_id = s.id
        AND lower(COALESCE(p.confirmation_status,'')) = 'validated')
                                          AS g_validated_paid_on_row,
    (SELECT COUNT(*)::text
       FROM public.loan_payments p
      WHERE p.schedule_id = s.id
        AND lower(COALESCE(p.confirmation_status,'')) = 'validated')
                                          AS h_payment_count
FROM public.loan_schedules s
WHERE s.loan_id = 'CL-20260519-5266'

UNION ALL

SELECT
    'PAYMENT',
    COALESCE(s.installment_no::text, 'no schedule'),
    p.payment_date::text,
    p.confirmation_status,
    p.amount_paid::text,
    COALESCE(p.applied_to_arrears, 0)::text,
    COALESCE(p.applied_to_credit, 0)::text,
    COALESCE(p.applied_to_current, 0)::text,
    p.payment_reference
FROM public.loan_payments p
LEFT JOIN public.loan_schedules s ON s.id = p.schedule_id
WHERE p.loan_id = 'CL-20260519-5266'

ORDER BY row_kind, a_installment, b_due_date;

-- Column meanings:
--   SCHEDULE rows: a=installment, b=due, c=status, d=expected, e=arrears,
--                  f=credit, g=validated paid on that row, h=payment count
--   PAYMENT  rows: a=attached installment, b=paid on, c=status, d=amount,
--                  e=to_arrears, f=to_credit, g=to_current, h=reference
