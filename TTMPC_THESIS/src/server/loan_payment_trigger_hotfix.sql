-- Hotfix: resolve ambiguous principal_amount in payment->ledger trigger.
-- Run this in Supabase SQL editor immediately.

CREATE OR REPLACE FUNCTION public.sync_loan_payment_to_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_principal_amount NUMERIC := 0;
    v_total_validated NUMERIC := 0;
    v_remaining_balance NUMERIC := 0;
    v_next_loan_status TEXT;
BEGIN
    IF lower(coalesce(NEW.confirmation_status, '')) = 'validated'
       AND lower(coalesce(OLD.confirmation_status, '')) <> 'validated' THEN
        INSERT INTO public.loan_payment_ledger (
            payment_id,
            loan_id,
            schedule_id,
            payment_reference,
            transaction_reference,
            amount_paid,
            penalties,
            total_collected,
            posted_at,
            posted_by,
            notes
        ) VALUES (
            NEW.id,
            NEW.loan_id,
            NEW.schedule_id,
            NEW.payment_reference,
            NEW.transaction_reference,
            NEW.amount_paid,
            NEW.penalties,
            coalesce(NEW.amount_paid, 0) + coalesce(NEW.penalties, 0),
            coalesce(NEW.confirmed_at, NEW.reviewed_at, now()),
            coalesce(NEW.confirmed_by, NEW.reviewed_by, NEW.validated_by),
            NEW.validation_notes
        )
        ON CONFLICT (payment_id) DO UPDATE
        SET
            loan_id = EXCLUDED.loan_id,
            schedule_id = EXCLUDED.schedule_id,
            payment_reference = EXCLUDED.payment_reference,
            transaction_reference = EXCLUDED.transaction_reference,
            amount_paid = EXCLUDED.amount_paid,
            penalties = EXCLUDED.penalties,
            total_collected = EXCLUDED.total_collected,
            posted_at = EXCLUDED.posted_at,
            posted_by = EXCLUDED.posted_by,
            notes = EXCLUDED.notes;

        UPDATE public.loan_schedules
        SET schedule_status = 'Paid'
        WHERE id = NEW.schedule_id
          AND loan_id = NEW.loan_id
          AND lower(coalesce(schedule_status, '')) <> 'paid';

        SELECT coalesce(l.principal_amount, l.loan_amount, 0)
        INTO v_principal_amount
        FROM public.loans AS l
        WHERE l.control_number = NEW.loan_id;

        SELECT coalesce(sum(amount_paid), 0)
        INTO v_total_validated
        FROM public.loan_payments
        WHERE loan_id = NEW.loan_id
          AND lower(coalesce(confirmation_status, '')) = 'validated';

        v_remaining_balance := greatest(coalesce(v_principal_amount, 0) - coalesce(v_total_validated, 0), 0);
        v_next_loan_status := CASE WHEN v_remaining_balance <= 0 THEN 'fully paid' ELSE 'partially paid' END;

        UPDATE public.loans
        SET
            loan_status = v_next_loan_status,
            application_status = v_next_loan_status
        WHERE control_number = NEW.loan_id;
    ELSIF lower(coalesce(NEW.confirmation_status, '')) = 'rejected'
       AND lower(coalesce(OLD.confirmation_status, '')) <> 'rejected' THEN
        DELETE FROM public.loan_payment_ledger
        WHERE payment_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;
