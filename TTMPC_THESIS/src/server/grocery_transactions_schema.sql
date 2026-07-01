-- Grocery transactions schema (queryable ledger fed by POS webhook).
-- Companion to grocery_events (raw audit log).
-- Idempotent; safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public."GROCERY_TRANSACTIONS" (
  "GroceryID" text PRIMARY KEY,
  event_id text UNIQUE,
  membership_number_id uuid REFERENCES public.member(id) ON DELETE SET NULL,
  pos_member_ref text,
  "TransactionDate" timestamptz NOT NULL,
  "GroceryAmount" numeric(12,2) NOT NULL,
  "Status" text NOT NULL CHECK ("Status" IN ('Completed','On Credit')),
  balance_due numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grocery_tx_member_idx
  ON public."GROCERY_TRANSACTIONS" (membership_number_id);

CREATE INDEX IF NOT EXISTS grocery_tx_date_idx
  ON public."GROCERY_TRANSACTIONS" ("TransactionDate" DESC);

CREATE OR REPLACE VIEW public.member_grocery_totals
WITH (security_invoker = true) AS
SELECT
  membership_number_id,
  SUM("GroceryAmount") AS total_grocery_amount,
  COUNT(*) AS transaction_count,
  MAX("TransactionDate") AS last_transaction_at
FROM public."GROCERY_TRANSACTIONS"
WHERE "Status" IN ('Completed','On Credit')
  AND membership_number_id IS NOT NULL
GROUP BY membership_number_id;

ALTER TABLE public."GROCERY_TRANSACTIONS" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grocery_tx_service_all ON public."GROCERY_TRANSACTIONS";
CREATE POLICY grocery_tx_service_all
  ON public."GROCERY_TRANSACTIONS"
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS grocery_tx_authenticated_read ON public."GROCERY_TRANSACTIONS";
CREATE POLICY grocery_tx_authenticated_read
  ON public."GROCERY_TRANSACTIONS"
  FOR SELECT
  TO authenticated
  USING (true);

COMMIT;
