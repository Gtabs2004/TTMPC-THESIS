-- Payments on non-member Bonus loans (public.koica_loans). loan_payments and
-- loan_payments_legacy can only reference public.loans, so these get their own
-- table. Written only by FastAPI on the service-role key: RLS on, no client
-- policies. Safe to re-run. Apply on TEST, then LIVE.

CREATE TABLE IF NOT EXISTS public.nonmember_loan_payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id         TEXT NOT NULL REFERENCES public.koica_loans(control_number) ON DELETE CASCADE,
    amount_paid     NUMERIC(14,2) NOT NULL CHECK (amount_paid > 0),
    payment_date    TIMESTAMPTZ NOT NULL DEFAULT now(),
    or_no           TEXT,
    recorded_by     UUID,
    recorded_by_name TEXT,
    source          TEXT NOT NULL DEFAULT 'cashier',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nonmember_loan_payments_loan
    ON public.nonmember_loan_payments (loan_id);

ALTER TABLE public.nonmember_loan_payments ENABLE ROW LEVEL SECURITY;

-- Bring the receipts already proven by the ledgers (stored on
-- koica_loans.raw_payload.repayment by import_nonmember_bonus_repayments.sql)
-- into the table, once.
INSERT INTO public.nonmember_loan_payments (loan_id, amount_paid, payment_date, or_no, source)
SELECT k.control_number,
       (r->>'amount')::numeric,
       (r->>'date')::date,
       nullif(r->>'or_no', ''),
       'ledger_import'
  FROM public.koica_loans k
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(k.raw_payload->'repayment', '[]'::jsonb)) r
 WHERE (r->>'amount')::numeric > 0
   AND r->>'date' IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.nonmember_loan_payments p
                    WHERE p.loan_id = k.control_number AND p.source = 'ledger_import');

SELECT source, count(*), sum(amount_paid) FROM public.nonmember_loan_payments GROUP BY 1;
