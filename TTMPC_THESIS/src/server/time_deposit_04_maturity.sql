-- Time Deposit — maturity-state synchronization.
-- Apply after time_deposit_01_schema.sql. This does not settle, renew, or
-- move funds; it only records that a locked certificate reached maturity.

BEGIN;

CREATE OR REPLACE FUNCTION public.td_mark_matured(p_as_of date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer := 0;
    v_deposit public.time_deposits%ROWTYPE;
BEGIN
    IF p_as_of IS NULL THEN
        RAISE EXCEPTION 'Maturity date is required.';
    END IF;

    FOR v_deposit IN
        SELECT *
        FROM public.time_deposits
        WHERE status = 'locked'
          AND maturity_date <= p_as_of
        FOR UPDATE
    LOOP
        UPDATE public.time_deposits
        SET status = 'matured',
            updated_at = now()
        WHERE id = v_deposit.id
          AND status = 'locked';

        IF FOUND THEN
            INSERT INTO public.time_deposit_status_history (
                time_deposit_id, old_status, new_status, reason
            ) VALUES (
                v_deposit.id, 'locked', 'matured',
                'Contractual maturity date reached'
            );
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.td_mark_matured(date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.td_mark_matured(date) TO service_role;

COMMIT;
