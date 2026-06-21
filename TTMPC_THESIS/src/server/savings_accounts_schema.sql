-- Savings accounts + ledger schema.
--
-- savings_accounts is the master record per account (one row = one passbook).
--   - account_number is the human-readable PK (e.g., SA-000123).
--   - member_id links to public.member when the account belongs to a real member.
--   - member_id is NULL for "standalone" buckets (project funds, grants, etc.).
--   - balance is the materialized running total; ledger is source of truth.
--
-- savings_ledger is the immutable double-entry record per account.
--   - entry_type: 'credit' = deposit (money in), 'debit' = withdrawal (money out).
--   - running_balance snapshot lets the UI render the audit trail without a window query.

CREATE TABLE IF NOT EXISTS public.savings_accounts (
    account_number text PRIMARY KEY,
    account_name   text NOT NULL,
    member_id      uuid REFERENCES public.member(id) ON DELETE SET NULL,
    account_kind   text NOT NULL DEFAULT 'member'
        CHECK (account_kind IN ('member', 'standalone')),
    balance        numeric(14,2) NOT NULL DEFAULT 0,
    status         text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'closed', 'frozen')),
    notes          text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT savings_accounts_member_kind_chk CHECK (
        (account_kind = 'member' AND member_id IS NOT NULL)
        OR (account_kind = 'standalone' AND member_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_savings_accounts_member_id
    ON public.savings_accounts (member_id);

CREATE INDEX IF NOT EXISTS idx_savings_accounts_kind
    ON public.savings_accounts (account_kind);


CREATE TABLE IF NOT EXISTS public.savings_ledger (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number  text NOT NULL REFERENCES public.savings_accounts(account_number) ON DELETE CASCADE,
    entry_type      text NOT NULL CHECK (entry_type IN ('credit', 'debit')),
    amount          numeric(14,2) NOT NULL CHECK (amount > 0),
    running_balance numeric(14,2) NOT NULL,
    reference       text,
    source          text NOT NULL DEFAULT 'manual',
    remarks         text,
    posted_by       text,
    posted_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_savings_ledger_account_number
    ON public.savings_ledger (account_number, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_savings_ledger_posted_at
    ON public.savings_ledger (posted_at DESC);


-- Trigger: keep savings_accounts.balance and updated_at in sync with the ledger.
CREATE OR REPLACE FUNCTION public.fn_savings_ledger_apply()
RETURNS TRIGGER AS $$
DECLARE
    current_balance numeric(14,2);
    new_balance     numeric(14,2);
BEGIN
    SELECT balance INTO current_balance
    FROM public.savings_accounts
    WHERE account_number = NEW.account_number
    FOR UPDATE;

    IF current_balance IS NULL THEN
        RAISE EXCEPTION 'savings_accounts row % does not exist', NEW.account_number;
    END IF;

    IF NEW.entry_type = 'credit' THEN
        new_balance := current_balance + NEW.amount;
    ELSE
        new_balance := current_balance - NEW.amount;
        IF new_balance < 0 THEN
            RAISE EXCEPTION 'Insufficient funds on account % (balance=%, debit=%)',
                NEW.account_number, current_balance, NEW.amount;
        END IF;
    END IF;

    NEW.running_balance := new_balance;

    UPDATE public.savings_accounts
       SET balance    = new_balance,
           updated_at = now()
     WHERE account_number = NEW.account_number;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_savings_ledger_apply ON public.savings_ledger;
CREATE TRIGGER trg_savings_ledger_apply
    BEFORE INSERT ON public.savings_ledger
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_savings_ledger_apply();


-- RLS: staff read/write, mirroring savings_transaction_queue policy style.
ALTER TABLE public.savings_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_ledger   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS savings_accounts_staff_select ON public.savings_accounts;
CREATE POLICY savings_accounts_staff_select ON public.savings_accounts
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS savings_accounts_staff_insert ON public.savings_accounts;
CREATE POLICY savings_accounts_staff_insert ON public.savings_accounts
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS savings_accounts_staff_update ON public.savings_accounts;
CREATE POLICY savings_accounts_staff_update ON public.savings_accounts
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS savings_ledger_staff_select ON public.savings_ledger;
CREATE POLICY savings_ledger_staff_select ON public.savings_ledger
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS savings_ledger_staff_insert ON public.savings_ledger;
CREATE POLICY savings_ledger_staff_insert ON public.savings_ledger
    FOR INSERT TO authenticated WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.savings_accounts TO authenticated;
GRANT SELECT, INSERT           ON public.savings_ledger   TO authenticated;
GRANT ALL ON public.savings_accounts TO service_role;
GRANT ALL ON public.savings_ledger   TO service_role;
