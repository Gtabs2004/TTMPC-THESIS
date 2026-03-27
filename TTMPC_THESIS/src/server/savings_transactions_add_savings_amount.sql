-- Savings verification workflow schema
-- Business flow:
-- 1) Cashier records deposit/withdraw request as pending_verification.
-- 2) Bookkeeper confirms/rejects request.
-- 3) On confirm, savings balance is posted and ledger entry is inserted.

CREATE TABLE IF NOT EXISTS public.savings_transaction_queue (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	transaction_id text NOT NULL UNIQUE,
	savings_id text NOT NULL,
	membership_number_id text,
	member_name text,
	account_type text NOT NULL,
	transaction_type text NOT NULL,
	amount numeric(14,2) NOT NULL,
	transaction_status text NOT NULL DEFAULT 'pending_verification',
	entered_by_role text NOT NULL DEFAULT 'cashier',
	requested_at timestamptz NOT NULL DEFAULT now(),
	verified_at timestamptz,
	verified_by text,
	posted_at timestamptz,
	notes text,
	CONSTRAINT savings_transaction_queue_amount_chk CHECK (amount > 0),
	CONSTRAINT savings_transaction_queue_type_chk CHECK (lower(transaction_type) IN ('deposit', 'withdraw')),
	CONSTRAINT savings_transaction_queue_status_chk CHECK (lower(transaction_status) IN ('pending_verification', 'validated', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_savings_transaction_queue_status
	ON public.savings_transaction_queue (transaction_status);

CREATE INDEX IF NOT EXISTS idx_savings_transaction_queue_requested_at
	ON public.savings_transaction_queue (requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_savings_transaction_queue_savings_id
	ON public.savings_transaction_queue (savings_id);

CREATE TABLE IF NOT EXISTS public.ledger_transactions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	transaction_id text NOT NULL,
	ledger_source text NOT NULL,
	source_id text NOT NULL,
	membership_number_id text,
	account_type text,
	entry_type text NOT NULL,   
	amount numeric(14,2) NOT NULL,
	running_balance numeric(14,2),
	posted_at timestamptz NOT NULL DEFAULT now(),
	posted_by text,
	remarks text,
	CONSTRAINT ledger_transactions_entry_type_chk CHECK (lower(entry_type) IN ('credit', 'debit')),
	CONSTRAINT ledger_transactions_amount_chk CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_posted_at
	ON public.ledger_transactions (posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_transaction_id
	ON public.ledger_transactions (transaction_id);

ALTER TABLE public.savings_transaction_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS savings_transaction_queue_staff_select ON public.savings_transaction_queue;
CREATE POLICY savings_transaction_queue_staff_select
ON public.savings_transaction_queue
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS savings_transaction_queue_staff_insert ON public.savings_transaction_queue;
CREATE POLICY savings_transaction_queue_staff_insert
ON public.savings_transaction_queue
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS savings_transaction_queue_staff_update ON public.savings_transaction_queue;
CREATE POLICY savings_transaction_queue_staff_update
ON public.savings_transaction_queue
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS ledger_transactions_staff_select ON public.ledger_transactions;
CREATE POLICY ledger_transactions_staff_select
ON public.ledger_transactions
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS ledger_transactions_staff_insert ON public.ledger_transactions;
CREATE POLICY ledger_transactions_staff_insert
ON public.ledger_transactions
FOR INSERT
TO authenticated
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.savings_transaction_queue TO authenticated;
GRANT SELECT, INSERT ON public.ledger_transactions TO authenticated;
GRANT ALL ON public.savings_transaction_queue TO service_role;
GRANT ALL ON public.ledger_transactions TO service_role;

