-- Fix: partial payments were being marked fully Paid.
--
-- sync_loan_payment_to_ledger() fires AFTER UPDATE OF confirmation_status,
-- which is exactly the update approve_bookkeeper_payment() performs after it
-- has already decided whether the installment is covered. The old body then
-- unconditionally set schedule_status = 'Paid', overwriting that decision: a
-- 8,000 payment against a 9,800 installment closed the installment and the
-- 1,800 shortfall disappeared from the schedule.
--
-- The trigger now applies the same coverage test as the Python endpoint --
-- sum of validated payments against THIS schedule vs. the installment due,
-- with the same half-peso rounding tolerance -- so a short payment leaves the
-- installment open while still posting to the ledger and reducing the balance.

CREATE OR REPLACE FUNCTION public.sync_loan_payment_to_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_principal_amount NUMERIC := 0;
    v_total_interest NUMERIC := 0;
    v_total_payable NUMERIC := 0;
    v_monthly_amortization NUMERIC := 0;
    v_term_months INTEGER := 0;
    v_total_validated NUMERIC := 0;
    v_remaining_balance NUMERIC := 0;
    v_next_loan_status TEXT;
    v_installment_due NUMERIC := 0;
    v_schedule_expected NUMERIC := 0;
    v_paid_toward_installment NUMERIC := 0;
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

        SELECT
            coalesce(l.principal_amount, l.loan_amount, 0),
            coalesce(l.total_interest, 0),
            coalesce(l.monthly_amortization, 0),
            coalesce(l.term, 0)
        INTO v_principal_amount, v_total_interest, v_monthly_amortization, v_term_months
        FROM public.loans AS l
        WHERE l.control_number = NEW.loan_id;

        IF v_total_interest <= 0 AND v_monthly_amortization > 0 AND v_term_months > 0 THEN
            v_total_interest := greatest((v_monthly_amortization * v_term_months) - v_principal_amount, 0);
        END IF;
        v_total_payable := coalesce(v_principal_amount, 0) + coalesce(v_total_interest, 0);

        SELECT coalesce(sum(amount_paid), 0)
        INTO v_total_validated
        FROM public.loan_payments
        WHERE loan_id = NEW.loan_id
          AND lower(coalesce(confirmation_status, '')) = 'validated';

        v_remaining_balance := greatest(v_total_payable - coalesce(v_total_validated, 0), 0);

        -- Installment due for THIS schedule. expected_amount alone is unreliable
        -- on legacy rows (it can hold a running total), so cap by the loan's
        -- monthly_amortization the same way approve_bookkeeper_payment() does.
        SELECT coalesce(s.expected_amount, 0)
        INTO v_schedule_expected
        FROM public.loan_schedules AS s
        WHERE s.id = NEW.schedule_id
          AND s.loan_id = NEW.loan_id;

        v_installment_due := coalesce(v_monthly_amortization, 0);
        IF v_installment_due > 0 AND coalesce(v_schedule_expected, 0) > 0 THEN
            v_installment_due := least(v_installment_due, v_schedule_expected);
        END IF;

        SELECT coalesce(sum(amount_paid), 0)
        INTO v_paid_toward_installment
        FROM public.loan_payments
        WHERE schedule_id = NEW.schedule_id
          AND lower(coalesce(confirmation_status, '')) = 'validated';

        -- Close the installment only when it is genuinely covered. Half a peso
        -- of tolerance absorbs centavo rounding between the schedule and the UI.
        IF v_installment_due <= 0
           OR v_remaining_balance <= 0
           OR v_paid_toward_installment + 0.50 >= v_installment_due THEN
            UPDATE public.loan_schedules
            SET schedule_status = 'Paid'
            WHERE id = NEW.schedule_id
              AND loan_id = NEW.loan_id
              AND lower(coalesce(schedule_status, '')) <> 'paid';
        END IF;

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
