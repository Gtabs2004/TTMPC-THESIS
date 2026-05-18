-- MEMBERSHIP_PAYMENTS schema migration
-- Stores membership fee and paid-up capital payments.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.membership_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id TEXT,
    member_id UUID REFERENCES public.member(id) ON DELETE SET NULL,
    member_code TEXT,
    payment_type TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    payment_status TEXT NOT NULL DEFAULT 'validated',
    payment_method TEXT,
    reference_number TEXT,
    processed_by TEXT,
    processed_by_role TEXT NOT NULL DEFAULT 'cashier',
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.membership_payments
    ADD COLUMN IF NOT EXISTS payment_id TEXT,
    ADD COLUMN IF NOT EXISTS member_id UUID,
    ADD COLUMN IF NOT EXISTS member_code TEXT,
    ADD COLUMN IF NOT EXISTS payment_type TEXT,
    ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS payment_status TEXT,
    ADD COLUMN IF NOT EXISTS payment_method TEXT,
    ADD COLUMN IF NOT EXISTS reference_number TEXT,
    ADD COLUMN IF NOT EXISTS processed_by TEXT,
    ADD COLUMN IF NOT EXISTS processed_by_role TEXT,
    ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE public.membership_payments
    ALTER COLUMN payment_type SET NOT NULL,
    ALTER COLUMN amount SET NOT NULL,
    ALTER COLUMN payment_status SET DEFAULT 'validated',
    ALTER COLUMN payment_status SET NOT NULL,
    ALTER COLUMN processed_by_role SET DEFAULT 'cashier',
    ALTER COLUMN processed_by_role SET NOT NULL,
    ALTER COLUMN payment_date SET DEFAULT NOW(),
    ALTER COLUMN payment_date SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'membership_payments_amount_chk'
            AND conrelid = 'public.membership_payments'::regclass
    ) THEN
        ALTER TABLE public.membership_payments
            ADD CONSTRAINT membership_payments_amount_chk CHECK (amount > 0);
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'membership_payments_status_chk'
            AND conrelid = 'public.membership_payments'::regclass
    ) THEN
        ALTER TABLE public.membership_payments DROP CONSTRAINT membership_payments_status_chk;
    END IF;

    ALTER TABLE public.membership_payments
        ADD CONSTRAINT membership_payments_status_chk
        CHECK (
            lower(coalesce(payment_status, '')) IN (
                'pending_verification',
                'validated',
                'confirmed',
                'approved',
                'rejected'
            )
        );
END $$;

CREATE INDEX IF NOT EXISTS idx_membership_payments_member_id
    ON public.membership_payments (member_id);

CREATE INDEX IF NOT EXISTS idx_membership_payments_member_code
    ON public.membership_payments (member_code);

CREATE INDEX IF NOT EXISTS idx_membership_payments_payment_type
    ON public.membership_payments (payment_type);

CREATE INDEX IF NOT EXISTS idx_membership_payments_payment_date
    ON public.membership_payments (payment_date DESC);

ALTER TABLE IF EXISTS public.membership_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "service role read membership payments" ON membership_payments';
    EXECUTE 'CREATE POLICY "service role read membership payments" ON membership_payments FOR SELECT USING (auth.role() = ''service_role'')';

    EXECUTE 'DROP POLICY IF EXISTS "service role write membership payments" ON membership_payments';
    EXECUTE 'CREATE POLICY "service role write membership payments" ON membership_payments FOR INSERT WITH CHECK (auth.role() = ''service_role'')';

    EXECUTE 'DROP POLICY IF EXISTS "service role update membership payments" ON membership_payments';
    EXECUTE 'CREATE POLICY "service role update membership payments" ON membership_payments FOR UPDATE USING (auth.role() = ''service_role'')';
END $$;

COMMIT;
