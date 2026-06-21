-- Bridge between legacy Savings_Transactions (capital S) and new savings_accounts.
--
-- This is Phase 1 of the savings consolidation. After this runs:
--   - savings_accounts.legacy_savings_id  links new -> old (set by backfill).
--   - savings_transaction_queue.account_number links queue -> new accounts.
--
-- Mirror writes (Phase 2) will fill account_number on every new queue row, and
-- the reconciliation view at the bottom flags any drift between old Balance
-- and new savings_accounts.balance.

ALTER TABLE public.savings_accounts
    ADD COLUMN IF NOT EXISTS legacy_savings_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_savings_accounts_legacy_savings_id
    ON public.savings_accounts (legacy_savings_id)
    WHERE legacy_savings_id IS NOT NULL;


ALTER TABLE public.savings_transaction_queue
    ADD COLUMN IF NOT EXISTS account_number text;

CREATE INDEX IF NOT EXISTS idx_savings_transaction_queue_account_number
    ON public.savings_transaction_queue (account_number);


-- Reconciliation view: any row here = a drift between the two balances.
-- After mirror writes are live for a day, this should stay empty.
-- security_invoker=on: the view enforces the caller's RLS, not the creator's
-- (Supabase linter flags the default security_definer behavior as a risk).
CREATE OR REPLACE VIEW public.v_savings_balance_reconciliation
WITH (security_invoker = on) AS
SELECT
    sa.account_number,
    sa.account_name,
    sa.legacy_savings_id,
    sa.balance       AS new_balance,
    st."Balance"     AS legacy_balance,
    (sa.balance - COALESCE(st."Balance", 0))::numeric(14,2) AS delta
FROM public.savings_accounts sa
LEFT JOIN public."Savings_Transactions" st
       ON st."Savings_ID" = sa.legacy_savings_id
WHERE sa.legacy_savings_id IS NOT NULL
  AND ABS(sa.balance - COALESCE(st."Balance", 0)) > 0.01;

GRANT SELECT ON public.v_savings_balance_reconciliation TO authenticated;
GRANT SELECT ON public.v_savings_balance_reconciliation TO service_role;
