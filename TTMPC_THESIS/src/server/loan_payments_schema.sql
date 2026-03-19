-- LOAN_PAYMENTS schema migration (aligned with existing repo SQL)
-- Existing conventions in this codebase:
-- - public.loan_payments primary key is `id` (not `payment_id`)
-- - public.loans key is `control_number` (varchar)
-- - schedules table is `public.loan_schedules` with key `id`

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.loan_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        loan_id VARCHAR NOT NULL REFERENCES public.loans(control_number) ON DELETE CASCADE,
        schedule_id UUID NOT NULL REFERENCES public.loan_schedules(id) ON DELETE RESTRICT,
        transaction_id UUID,
    payment_reference TEXT,
    transaction_reference TEXT,
        amount_paid NUMERIC(14,2) NOT NULL CHECK (amount_paid > 0),
        payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        penalties NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (penalties >= 0),
        deficiency NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (deficiency >= 0),
    confirmation_status TEXT NOT NULL DEFAULT 'pending_bookkeeper',
    confirmed_at TIMESTAMPTZ,
    confirmed_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT loan_payments_schedule_loan_fk
            FOREIGN KEY (schedule_id, loan_id)
            REFERENCES public.loan_schedules (id, loan_id)
            ON DELETE RESTRICT
);

-- If table already exists from older scripts, ensure required columns are present.
ALTER TABLE public.loan_payments
    ADD COLUMN IF NOT EXISTS transaction_id UUID,
    ADD COLUMN IF NOT EXISTS payment_reference TEXT,
    ADD COLUMN IF NOT EXISTS transaction_reference TEXT,
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS penalties NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS deficiency NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS confirmation_status TEXT,
    ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS confirmed_by UUID,
    ADD COLUMN IF NOT EXISTS validated_by UUID,
    ADD COLUMN IF NOT EXISTS validation_notes TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_by UUID,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS entered_by_role TEXT,
    ADD COLUMN IF NOT EXISTS entered_by UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE public.loan_payments
    ALTER COLUMN amount_paid SET NOT NULL,
    ALTER COLUMN payment_date SET DEFAULT NOW(),
    ALTER COLUMN payment_date SET NOT NULL,
    ALTER COLUMN penalties SET DEFAULT 0,
    ALTER COLUMN penalties SET NOT NULL,
    ALTER COLUMN deficiency SET DEFAULT 0,
    ALTER COLUMN deficiency SET NOT NULL,
    ALTER COLUMN confirmation_status SET DEFAULT 'pending_bookkeeper',
    ALTER COLUMN confirmation_status SET NOT NULL,
    ALTER COLUMN entered_by_role SET DEFAULT 'cashier',
    ALTER COLUMN entered_by_role SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_payments_amount_paid_chk'
            AND conrelid = 'public.loan_payments'::regclass
    ) THEN
        ALTER TABLE public.loan_payments
            ADD CONSTRAINT loan_payments_amount_paid_chk CHECK (amount_paid > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_payments_penalties_chk'
            AND conrelid = 'public.loan_payments'::regclass
    ) THEN
        ALTER TABLE public.loan_payments
            ADD CONSTRAINT loan_payments_penalties_chk CHECK (penalties >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_payments_deficiency_chk'
            AND conrelid = 'public.loan_payments'::regclass
    ) THEN
        ALTER TABLE public.loan_payments
            ADD CONSTRAINT loan_payments_deficiency_chk CHECK (deficiency >= 0);
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_payments_confirmation_status_chk'
            AND conrelid = 'public.loan_payments'::regclass
    ) THEN
        ALTER TABLE public.loan_payments DROP CONSTRAINT loan_payments_confirmation_status_chk;
    END IF;

    ALTER TABLE public.loan_payments
        ADD CONSTRAINT loan_payments_confirmation_status_chk
        CHECK (
            lower(coalesce(confirmation_status, '')) IN (
                'pending_bookkeeper',
                'validated',
                'confirmed',
                'bookkeeper_confirmed',
                'approved',
                'rejected'
            )
        );

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_payments_entered_by_role_chk'
            AND conrelid = 'public.loan_payments'::regclass
    ) THEN
        ALTER TABLE public.loan_payments DROP CONSTRAINT loan_payments_entered_by_role_chk;
    END IF;

    ALTER TABLE public.loan_payments
        ADD CONSTRAINT loan_payments_entered_by_role_chk
        CHECK (lower(coalesce(entered_by_role, 'cashier')) IN ('cashier', 'bookkeeper', 'system'));
END $$;

UPDATE public.loan_payments
SET confirmation_status = CASE
    WHEN lower(coalesce(confirmation_status, '')) IN ('confirmed', 'bookkeeper_confirmed', 'approved') THEN 'validated'
    WHEN lower(coalesce(confirmation_status, '')) = 'rejected' THEN 'rejected'
    ELSE 'pending_bookkeeper'
END
WHERE lower(coalesce(confirmation_status, '')) NOT IN ('pending_bookkeeper', 'validated', 'rejected');

CREATE TABLE IF NOT EXISTS public.loan_payment_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL UNIQUE REFERENCES public.loan_payments(id) ON DELETE CASCADE,
    loan_id VARCHAR NOT NULL REFERENCES public.loans(control_number) ON DELETE CASCADE,
    schedule_id UUID NOT NULL REFERENCES public.loan_schedules(id) ON DELETE RESTRICT,
    payment_reference TEXT,
    transaction_reference TEXT,
    amount_paid NUMERIC(14,2) NOT NULL CHECK (amount_paid > 0),
    penalties NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (penalties >= 0),
    total_collected NUMERIC(14,2) NOT NULL CHECK (total_collected >= 0),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    posted_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_payment_ledger_loan_id
    ON public.loan_payment_ledger (loan_id);

CREATE INDEX IF NOT EXISTS idx_loan_payment_ledger_schedule_id
    ON public.loan_payment_ledger (schedule_id);

CREATE INDEX IF NOT EXISTS idx_loan_payment_ledger_posted_at
    ON public.loan_payment_ledger (posted_at DESC);

CREATE OR REPLACE FUNCTION public.normalize_loan_payment_workflow()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    old_status TEXT;
    new_status TEXT;
BEGIN
    old_status := lower(coalesce(OLD.confirmation_status, 'pending_bookkeeper'));
    new_status := lower(coalesce(NEW.confirmation_status, 'pending_bookkeeper'));

    IF new_status IN ('confirmed', 'bookkeeper_confirmed', 'approved') THEN
        new_status := 'validated';
    END IF;

    IF new_status NOT IN ('pending_bookkeeper', 'validated', 'rejected') THEN
        RAISE EXCEPTION 'Invalid confirmation_status: %', NEW.confirmation_status;
    END IF;

    NEW.confirmation_status := new_status;
    NEW.entered_by_role := lower(coalesce(NEW.entered_by_role, 'cashier'));

    IF TG_OP = 'INSERT' THEN
        IF NEW.entered_by_role = 'cashier' AND NEW.confirmation_status <> 'pending_bookkeeper' THEN
            RAISE EXCEPTION 'Cashier-created payments must start as pending_bookkeeper.';
        END IF;

        IF NEW.confirmation_status = 'validated' THEN
            NEW.confirmed_at := coalesce(NEW.confirmed_at, now());
            NEW.reviewed_at := coalesce(NEW.reviewed_at, NEW.confirmed_at);
            NEW.confirmed_by := coalesce(NEW.confirmed_by, NEW.validated_by, NEW.reviewed_by);
            NEW.reviewed_by := coalesce(NEW.reviewed_by, NEW.validated_by, NEW.confirmed_by);
        ELSIF NEW.confirmation_status = 'rejected' THEN
            NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
            NEW.reviewed_by := coalesce(NEW.reviewed_by, NEW.validated_by);
        END IF;

        RETURN NEW;
    END IF;

    IF old_status = 'pending_bookkeeper' THEN
        IF new_status NOT IN ('pending_bookkeeper', 'validated', 'rejected') THEN
            RAISE EXCEPTION 'Pending payments can only transition to validated or rejected.';
        END IF;
    ELSIF old_status = 'validated' THEN
        IF new_status <> 'validated' THEN
            RAISE EXCEPTION 'Validated payments are immutable and cannot be reverted.';
        END IF;
    ELSIF old_status = 'rejected' THEN
        IF new_status <> 'rejected' THEN
            RAISE EXCEPTION 'Rejected payments are immutable and cannot be re-opened.';
        END IF;
    END IF;

    IF old_status IN ('validated', 'rejected') THEN
        IF NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
           OR NEW.penalties IS DISTINCT FROM OLD.penalties
           OR NEW.deficiency IS DISTINCT FROM OLD.deficiency
           OR NEW.loan_id IS DISTINCT FROM OLD.loan_id
           OR NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
           OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
           OR NEW.transaction_reference IS DISTINCT FROM OLD.transaction_reference THEN
            RAISE EXCEPTION 'Financial fields cannot be changed after review.';
        END IF;
    END IF;

    IF new_status = 'validated' THEN
        NEW.confirmed_at := coalesce(NEW.confirmed_at, now());
        NEW.reviewed_at := coalesce(NEW.reviewed_at, NEW.confirmed_at);
        NEW.confirmed_by := coalesce(NEW.confirmed_by, NEW.validated_by, NEW.reviewed_by, OLD.confirmed_by);
        NEW.reviewed_by := coalesce(NEW.reviewed_by, NEW.validated_by, NEW.confirmed_by, OLD.reviewed_by);
    ELSIF new_status = 'rejected' THEN
        NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
        NEW.reviewed_by := coalesce(NEW.reviewed_by, NEW.validated_by, OLD.reviewed_by);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_loan_payment_workflow ON public.loan_payments;
CREATE TRIGGER trg_normalize_loan_payment_workflow
BEFORE INSERT OR UPDATE ON public.loan_payments
FOR EACH ROW
EXECUTE FUNCTION public.normalize_loan_payment_workflow();

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

DROP TRIGGER IF EXISTS trg_sync_loan_payment_to_ledger ON public.loan_payments;
CREATE TRIGGER trg_sync_loan_payment_to_ledger
AFTER UPDATE OF confirmation_status ON public.loan_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_loan_payment_to_ledger();

ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payment_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loan_payments_service_role_all ON public.loan_payments;
CREATE POLICY loan_payments_service_role_all
ON public.loan_payments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS loan_payments_authenticated_select ON public.loan_payments;
CREATE POLICY loan_payments_authenticated_select
ON public.loan_payments
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS loan_payments_authenticated_insert_cashier ON public.loan_payments;
CREATE POLICY loan_payments_authenticated_insert_cashier
ON public.loan_payments
FOR INSERT
TO authenticated
WITH CHECK (
    lower(coalesce(entered_by_role, 'cashier')) = 'cashier'
    AND lower(coalesce(confirmation_status, 'pending_bookkeeper')) = 'pending_bookkeeper'
);

DROP POLICY IF EXISTS loan_payments_authenticated_bookkeeper_review ON public.loan_payments;
CREATE POLICY loan_payments_authenticated_bookkeeper_review
ON public.loan_payments
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
    lower(coalesce(confirmation_status, '')) IN ('validated', 'rejected', 'pending_bookkeeper')
);

DROP POLICY IF EXISTS loan_payment_ledger_service_role_all ON public.loan_payment_ledger;
CREATE POLICY loan_payment_ledger_service_role_all
ON public.loan_payment_ledger
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS loan_payment_ledger_authenticated_select ON public.loan_payment_ledger;
CREATE POLICY loan_payment_ledger_authenticated_select
ON public.loan_payment_ledger
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT, INSERT, UPDATE ON public.loan_payments TO authenticated;
GRANT SELECT ON public.loan_payment_ledger TO authenticated;
GRANT ALL ON public.loan_payments TO service_role;
GRANT ALL ON public.loan_payment_ledger TO service_role;

CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id
    ON public.loan_payments (loan_id);

CREATE INDEX IF NOT EXISTS idx_loan_payments_schedule_id
    ON public.loan_payments (schedule_id);

CREATE INDEX IF NOT EXISTS idx_loan_payments_transaction_id
    ON public.loan_payments (transaction_id);

CREATE INDEX IF NOT EXISTS idx_loan_payments_confirmation_status
    ON public.loan_payments (confirmation_status);

CREATE INDEX IF NOT EXISTS idx_loan_payments_payment_date
    ON public.loan_payments (payment_date);

COMMENT ON TABLE public.loan_payments IS 'Stores loan amortization payments and penalties.';
COMMENT ON COLUMN public.loan_payments.id IS 'PaymentID (PK).';
COMMENT ON COLUMN public.loan_payments.loan_id IS 'LoanID FK -> public.loans(control_number).';
COMMENT ON COLUMN public.loan_payments.schedule_id IS 'Internal schedule UUID FK -> public.loan_schedules(id); UI schedule code is public.loan_schedules.schedule_id (e.g., TTMPCLP_SI_001).';
COMMENT ON COLUMN public.loan_payments.transaction_id IS 'TransactionID for audit trace (ledger or loan app reference).';
COMMENT ON COLUMN public.loan_payments.payment_reference IS 'Display PaymentID format for cashier UI (e.g., TTMPCLP-001).';
COMMENT ON COLUMN public.loan_payments.transaction_reference IS 'Display TransactionID format for cashier UI.';
COMMENT ON COLUMN public.loan_payments.amount_paid IS 'AmountPaid: monthly amortization payment amount.';
COMMENT ON COLUMN public.loan_payments.payment_date IS 'PaymentDate timestamp.';
COMMENT ON COLUMN public.loan_payments.penalties IS 'Penalties: actual cash collected as late-payment fine.';
COMMENT ON COLUMN public.loan_payments.deficiency IS 'Deficiency: number/score of missed due dates.';
COMMENT ON COLUMN public.loan_payments.confirmation_status IS 'Cashier-created payments remain pending_bookkeeper until Bookkeeper confirms.';
COMMENT ON COLUMN public.loan_payments.confirmed_at IS 'Timestamp when Bookkeeper confirms payment.';
COMMENT ON COLUMN public.loan_payments.confirmed_by IS 'User id of Bookkeeper who confirmed payment.';
COMMENT ON COLUMN public.loan_payments.validated_by IS 'Optional compatibility field for Bookkeeper validator id.';
COMMENT ON COLUMN public.loan_payments.validation_notes IS 'Bookkeeper validation notes attached at approval.';
COMMENT ON COLUMN public.loan_payments.reviewed_at IS 'Timestamp when a payment was reviewed by Bookkeeper.';
COMMENT ON COLUMN public.loan_payments.reviewed_by IS 'Bookkeeper reviewer user id.';
COMMENT ON COLUMN public.loan_payments.rejection_reason IS 'Reason supplied by Bookkeeper when rejecting payment.';
COMMENT ON COLUMN public.loan_payments.entered_by_role IS 'Role that first entered the payment row (cashier/bookkeeper/system).';
COMMENT ON COLUMN public.loan_payments.entered_by IS 'Optional user id that created the row.';
COMMENT ON TABLE public.loan_payment_ledger IS 'Posted ledger entries for Bookkeeper-validated cashier payments.';

COMMIT;
