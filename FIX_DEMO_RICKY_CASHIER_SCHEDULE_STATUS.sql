-- Fix the casing of the September missed demo installment.
-- Cashier's UI queries this status as the exact lowercase value
-- 'partially_paid'; the original demo seed used 'Partially_Paid'.

BEGIN;

DO $$
DECLARE
    v_loan_count integer;
    v_updated integer;
BEGIN
    SELECT count(*)
    INTO v_loan_count
    FROM public.loans l
    JOIN public.member m ON m.id = l.member_id
    WHERE l.control_number = 'CL-20261026-9529'
      AND l.member_id = 'c50f3fd8-9a29-407b-bc7c-d3192a1f176b'
      AND m.membership_id = 'TTMPC-306'
      AND l.raw_payload->>'demo_scenario' = 'ricky_gallo_missed_september_2026';

    IF v_loan_count <> 1 THEN
        RAISE EXCEPTION
            'Expected exactly one tagged synthetic demo loan CL-20261026-9529; found %.',
            v_loan_count;
    END IF;

    UPDATE public.loan_schedules
    SET schedule_status = 'partially_paid'
    WHERE loan_id = 'CL-20261026-9529'
      AND installment_no = 4
      AND lower(btrim(schedule_status)) = 'partially_paid'
      AND schedule_status <> 'partially_paid';

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 AND NOT EXISTS (
        SELECT 1
        FROM public.loan_schedules
        WHERE loan_id = 'CL-20261026-9529'
          AND installment_no = 4
          AND schedule_status = 'partially_paid'
    ) THEN
        RAISE EXCEPTION
            'Expected September installment #4 was not found; no schedule row changed.';
    END IF;
END;
$$;

COMMIT;

SELECT
    loan_id,
    installment_no,
    due_date,
    schedule_status,
    expected_amount,
    carried_arrears
FROM public.loan_schedules
WHERE loan_id = 'CL-20261026-9529'
  AND installment_no IN (4, 5)
ORDER BY installment_no;
