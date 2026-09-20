-- Make payment_reference unique so the idempotency guard can be added.
--
-- The old cashier code derived the reference from `paymentRecords.length + 1`,
-- so two submissions against a stale list produced the same string -- e.g.
-- TTMPCLP-013 appearing more than once. That is a LABEL collision, not
-- necessarily a double charge: the rows are distinct payments that happen to
-- share a reference.
--
-- This migration therefore NEVER deletes a payment and never changes an
-- amount. It only gives the later colliding rows a fresh, unique reference,
-- keeping the earliest row's original value so existing receipts still match.
--
-- Run AFTER loan_penalties_schema.sql (whose final index failed), then create
-- the index at the bottom of this file.

BEGIN;

-- Safety: capture what we are about to rename, so it can be audited later.
CREATE TABLE IF NOT EXISTS public.loan_payment_reference_remap (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL,
    old_reference text,
    new_reference text,
    remapped_at timestamptz NOT NULL DEFAULT now()
);

WITH ranked AS (
    SELECT
        id,
        payment_reference,
        ROW_NUMBER() OVER (
            PARTITION BY payment_reference
            ORDER BY payment_date NULLS LAST, created_at NULLS LAST, id
        ) AS rn
    FROM public.loan_payments
    WHERE payment_reference IS NOT NULL
),
to_fix AS (
    -- rn = 1 keeps the original reference; everything after it is renamed.
    SELECT id, payment_reference
    FROM ranked
    WHERE rn > 1
)
INSERT INTO public.loan_payment_reference_remap (payment_id, old_reference, new_reference)
SELECT
    f.id,
    f.payment_reference,
    f.payment_reference || '-D' || substr(replace(f.id::text, '-', ''), 1, 6)
FROM to_fix f;

-- Apply the new references.
UPDATE public.loan_payments p
SET payment_reference = r.new_reference
FROM public.loan_payment_reference_remap r
WHERE r.payment_id = p.id
  AND p.payment_reference = r.old_reference;

-- Same treatment for transaction_reference if it collides (no index on it,
-- but keeping it aligned avoids confusing the SOA, which falls back to it).
WITH ranked_txn AS (
    SELECT
        id,
        transaction_reference,
        ROW_NUMBER() OVER (
            PARTITION BY transaction_reference
            ORDER BY payment_date NULLS LAST, created_at NULLS LAST, id
        ) AS rn
    FROM public.loan_payments
    WHERE transaction_reference IS NOT NULL
)
UPDATE public.loan_payments p
SET transaction_reference =
        p.transaction_reference || '-D' || substr(replace(p.id::text, '-', ''), 1, 6)
FROM ranked_txn t
WHERE t.id = p.id
  AND t.rn > 1;

COMMIT;

-- Verify: this must return zero rows before the index will build.
--   SELECT payment_reference, COUNT(*) FROM public.loan_payments
--   WHERE payment_reference IS NOT NULL
--   GROUP BY payment_reference HAVING COUNT(*) > 1;

-- Now the guard that failed earlier can be created.
CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_payments_payment_reference_uk
  ON public.loan_payments (payment_reference)
  WHERE payment_reference IS NOT NULL;
