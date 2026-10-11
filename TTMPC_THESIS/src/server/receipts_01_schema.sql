-- =============================================================================
-- Receipts — Part 1: table, receipt numbers, lock-down. See RECEIPT_SYSTEM_PLAN.md.
-- =============================================================================
-- A receipt is a frozen copy of one completed transaction. It never changes
-- balances and is never edited or deleted after it is issued.
--
--   * one receipt per transaction: UNIQUE (source_type, source_id)
--   * numbers TTMPC-TR-<year>-<000001>, from a per-year counter
--   * RLS on with NO client policies: only the backend (service role) reads
--     receipts; it checks who is asking before returning one
--   * UPDATE / DELETE are blocked by a trigger, even for the service role
--
-- Also adds the release breakdown columns to disbursement_confirmations, so
-- the release receipt can freeze what was actually computed at release time
-- (loans has no fee snapshot for these releases — Step 0, checks 08-10).
--
-- Run in Supabase → SQL Editor. Safe to re-run. Then run receipts_02_triggers.sql.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Table -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.receipts (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_no      text        NOT NULL UNIQUE,
    source_type     text        NOT NULL CHECK (source_type IN (
                        'loan_payment', 'loan_release', 'savings', 'cbu',
                        'membership_payment', 'cbu_payout', 'isc', 'grocery'
                    )),
    source_id       text        NOT NULL,
    member_id       uuid,                       -- owner (member.id); NULL only for pre-member applicants
    application_id  text,                       -- membership-fee receipts before membership
    amount          numeric(14, 2) NOT NULL CHECK (amount >= 0),
    snapshot        jsonb       NOT NULL,       -- every field printed on the receipt
    snapshot_hash   text        NOT NULL,       -- sha256 of snapshot, to detect tampering
    issued_at       timestamptz NOT NULL DEFAULT now(),
    issued_by       uuid,                       -- auth user who completed the transaction
    issued_by_role  text,
    CONSTRAINT receipts_source_uk UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_receipts_member_issued ON public.receipts (member_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_issued_at     ON public.receipts (issued_at DESC);

-- 2. Receipt numbers -----------------------------------------------------------
-- One row per year. The row lock in the UPDATE serialises concurrent issuers,
-- so two receipts never get the same number.
CREATE TABLE IF NOT EXISTS public.receipt_counters (
    year     int PRIMARY KEY,
    last_no  int NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.receipt_next_no(p_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_year int := extract(year FROM (p_at AT TIME ZONE 'Asia/Manila'))::int;
    v_no   int;
BEGIN
    INSERT INTO public.receipt_counters (year, last_no)
    VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_no = public.receipt_counters.last_no + 1
    RETURNING last_no INTO v_no;

    RETURN 'TTMPC-TR-' || v_year::text || '-' || lpad(v_no::text, 6, '0');
END;
$$;

-- 3. Receipts never change ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.receipts_block_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Receipts cannot be edited or deleted (receipt %).', OLD.receipt_no
        USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_receipts_block_changes ON public.receipts;
CREATE TRIGGER trg_receipts_block_changes
BEFORE UPDATE OR DELETE ON public.receipts
FOR EACH ROW EXECUTE FUNCTION public.receipts_block_changes();

-- 4. Lock down: backend only ---------------------------------------------------
ALTER TABLE public.receipts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.receipts         FROM anon, authenticated;
REVOKE ALL ON public.receipt_counters FROM anon, authenticated;
GRANT SELECT, INSERT ON public.receipts         TO service_role;
GRANT ALL            ON public.receipt_counters TO service_role;

REVOKE ALL ON FUNCTION public.receipt_next_no(timestamptz) FROM public, anon, authenticated;

-- 5. Failures are recorded, never lost ----------------------------------------
-- The issuing triggers never block a payment or release (the approve endpoint
-- swallows update errors and retries with a different status, so a raising
-- trigger would leave a half-posted payment). If building a receipt fails, the
-- error lands here and receipts_backfill() retries it.
CREATE TABLE IF NOT EXISTS public.receipt_issue_errors (
    id           bigserial   PRIMARY KEY,
    source_type  text        NOT NULL,
    source_id    text        NOT NULL,
    error        text        NOT NULL,
    occurred_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.receipt_issue_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.receipt_issue_errors FROM anon, authenticated;
GRANT ALL ON public.receipt_issue_errors TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.receipt_issue_errors_id_seq TO service_role;

-- 6. Release breakdown on disbursement_confirmations --------------------------
-- Filled by POST /api/cashier/disbursements/{id}/disburse from
-- _compute_net_cash_out(). NULL on the 7 releases confirmed before this.
ALTER TABLE public.disbursement_confirmations
    ADD COLUMN IF NOT EXISTS principal_amount     numeric(14, 2),
    ADD COLUMN IF NOT EXISTS service_fee          numeric(14, 2),
    ADD COLUMN IF NOT EXISTS cbu_deduction        numeric(14, 2),
    ADD COLUMN IF NOT EXISTS insurance_fee        numeric(14, 2),
    ADD COLUMN IF NOT EXISTS notarial_fee         numeric(14, 2),
    ADD COLUMN IF NOT EXISTS renewal_payoff       numeric(14, 2),
    ADD COLUMN IF NOT EXISTS net_proceeds         numeric(14, 2),
    ADD COLUMN IF NOT EXISTS term_months          int,
    ADD COLUMN IF NOT EXISTS monthly_amortization numeric(14, 2),
    ADD COLUMN IF NOT EXISTS released_by_auth_id  uuid;

COMMIT;
