-- Account Management & termination — Part B: CBU settlement / payout
-- (ACCOUNT_MANAGEMENT_TERMINATION_PLAN.md §7–§10)
-- Run in Supabase SQL editor AFTER account_management_part_a.sql.
--
-- 1. member.member_status may also be 'exiting' (CBU applied to loans, the
--    rest still being paid — can't leave until ₱0) and 'closed' (fully
--    settled; history kept).
-- 2. cbu_payouts — one row per CBU settlement movement:
--      kind 'loan_offset' : CBU applied to a loan at termination (no cash)
--      kind 'payout'      : cash the Cashier handed to the terminated member
--    Each row points at the capital_build_up withdrawal line it created.
-- 3. A trigger on loans refusing NEW applications (new loan or renewal) for a
--    member who is exiting, terminated or closed — enforced here because loan
--    forms insert straight into public.loans.
--
-- Idempotent: safe to re-run.

BEGIN;

-- 1) member_status values -------------------------------------------------
ALTER TABLE public.member DROP CONSTRAINT IF EXISTS member_status_chk;
ALTER TABLE public.member
  ADD CONSTRAINT member_status_chk
  CHECK (lower(member_status) IN ('active', 'exiting', 'terminated', 'closed'));

-- 2) cbu_payouts ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cbu_payouts (
  id                  bigserial PRIMARY KEY,
  membership_id       text        NOT NULL,
  member_id           uuid        NOT NULL,
  kind                text        NOT NULL CHECK (kind IN ('loan_offset', 'payout')),
  amount              numeric(14, 2) NOT NULL CHECK (amount > 0),
  payout_date         date        NOT NULL DEFAULT current_date,
  reference           text,
  loan_id             text,                       -- loan_offset only
  loan_payment_id     text,                       -- loan_payments.payment_reference
  deductions          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  cbu_row_id          uuid,                       -- capital_build_up.id it created
  notes               text,
  recorded_by         uuid,
  recorded_by_email   text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cbu_payouts_membership_idx ON public.cbu_payouts (membership_id, created_at);

-- A cash payout's receipt reference must be unique (guards double submit).
CREATE UNIQUE INDEX IF NOT EXISTS cbu_payouts_reference_uk
  ON public.cbu_payouts (reference)
  WHERE reference IS NOT NULL;

-- History ledger: rows are never updated or deleted. All access goes through
-- FastAPI on the service-role key; RLS on with no client policies.
ALTER TABLE public.cbu_payouts ENABLE ROW LEVEL SECURITY;

-- 3) No new loans for members on their way out -----------------------------
CREATE OR REPLACE FUNCTION public.block_loans_for_exiting_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.member_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT lower(coalesce(member_status, 'active'))
  INTO v_status
  FROM public.member
  WHERE id = NEW.member_id;

  IF v_status IN ('exiting', 'terminated', 'closed') THEN
    RAISE EXCEPTION 'This member is % and cannot apply for new loans or renewals.', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_loans_for_exiting_members ON public.loans;
CREATE TRIGGER trg_block_loans_for_exiting_members
BEFORE INSERT ON public.loans
FOR EACH ROW
EXECUTE FUNCTION public.block_loans_for_exiting_members();

COMMIT;

-- Check 1: the new status values are allowed (expect the CHECK to list all four).
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'member_status_chk';

-- Check 2: the payout ledger exists and is empty to start (expect 0).
SELECT count(*) AS cbu_payout_rows FROM public.cbu_payouts;
