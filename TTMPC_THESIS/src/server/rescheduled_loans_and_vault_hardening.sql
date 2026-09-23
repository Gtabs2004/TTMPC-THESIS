-- Rescheduled Loans tab + vault wiring — see RESCHEDULED_LOANS_PLAN.md at the
-- repo root for the full design/audit this implements (§6 steps 1-4, §8
-- security items). Run this once in the Supabase SQL editor. Additive only;
-- safe to re-run.
--
-- Contents:
--   1. rescheduled_at / reschedule_note columns on loans + koica_loans
--      (Treasurer's "Reschedule" action updates loan_status but never
--      recorded when or why — the notes textarea was captured in the form
--      and then discarded).
--   2. vault_debit_for_disbursement() RPC — atomic insufficient-funds check
--      + vault_entries debit for the Cashier's release step (§8.1: the vault
--      never moves today; the commented-out trigger in vault_entries_schema.sql
--      was never enabled, and used gross principal, not net cash out — see §4).
--   3. vault_entries_guard trigger — enforces amount sign vs change_type and
--      blocks any insert that would take the balance negative (§8.4, §8.5).
--      Applies at the table level, so it protects BOTH the FastAPI write path
--      (POST /api/treasurer/vault/entries, service-role key, bypasses RLS)
--      and the Treasurer's direct-Supabase write from Vault.jsx (RLS-governed).

BEGIN;

-- 1. Reschedule metadata -----------------------------------------------------

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reschedule_note text;

ALTER TABLE public.koica_loans
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reschedule_note text;

COMMENT ON COLUMN public.loans.rescheduled_at IS
  'Set when the Treasurer marks a loan pending rescheduling for insufficient vault funds. Cleared is not required — history is kept.';
COMMENT ON COLUMN public.loans.reschedule_note IS
  'Treasurer''s optional note entered on the Reschedule modal.';

-- 2. Atomic vault debit for disbursement -------------------------------------
-- Narrow by design: this function's only job is "is there enough cash right
-- now, and if so take it out" — atomically, so two concurrent releases can't
-- both read the same balance and both succeed when only one can be covered
-- (RESCHEDULED_LOANS_PLAN.md §3.1). It does NOT attempt to also lock/update
-- the loans/loan_schedules rows in the same transaction: that logic (equal-
-- principal declining-interest schedules for Emergency, add-on interest for
-- Consolidated/Bonus) already exists, tested, in Python
-- (build_single_schedule_row in main.py) and re-deriving it in PL/pgSQL would
-- risk a second, divergent implementation of the amortization math. The
-- FastAPI endpoint calls this FIRST, before any other write, so a refusal
-- here leaves the loan completely untouched.
CREATE OR REPLACE FUNCTION public.vault_debit_for_disbursement(
  p_amount     numeric,   -- positive net cash out; the function negates it
  p_note       text,
  p_entered_by uuid
)
RETURNS TABLE (new_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'vault_debit_for_disbursement: amount must be positive' USING ERRCODE = '22023';
  END IF;

  -- Serializes all disbursement debits against each other so the balance read
  -- below can't race with a concurrent debit.
  PERFORM pg_advisory_xact_lock(hashtext('vault_entries:disbursement'));

  SELECT coalesce(sum(amount), 0) INTO v_balance FROM public.vault_entries;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_funds: vault balance % is less than the % required', v_balance, p_amount
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.vault_entries (amount, change_type, note, entered_by)
  VALUES (-p_amount, 'disbursement', p_note, p_entered_by);

  RETURN QUERY SELECT (v_balance - p_amount);
END;
$$;

-- Only the backend (service-role key, identity already verified against the
-- caller's JWT before this is called) may run this — never anon/authenticated
-- directly, since p_entered_by is trusted as given.
REVOKE ALL ON FUNCTION public.vault_debit_for_disbursement(numeric, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vault_debit_for_disbursement(numeric, text, uuid) TO service_role;

-- 3. Table-level guard: sign vs change_type, and no negative balance --------
-- Defense in depth for §8.4/§8.5. Applies to every insert, from any caller —
-- the FastAPI service-role path AND the Treasurer's direct Supabase write in
-- Vault.jsx. 'adjustment' is exempt from the sign check on purpose: Vault.jsx
-- posts a signed delta (new balance − old balance) as an 'adjustment' entry,
-- and a correction legitimately needs to move the balance either way.
CREATE OR REPLACE FUNCTION public.vault_entries_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
BEGIN
  IF NEW.change_type IN ('deposit', 'opening_balance') AND NEW.amount <= 0 THEN
    RAISE EXCEPTION 'vault_entries: amount must be positive for change_type %', NEW.change_type;
  ELSIF NEW.change_type IN ('withdrawal', 'disbursement') AND NEW.amount >= 0 THEN
    RAISE EXCEPTION 'vault_entries: amount must be negative for change_type %', NEW.change_type;
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_balance FROM public.vault_entries;
  IF v_balance + NEW.amount < 0 THEN
    RAISE EXCEPTION 'vault_entries: this entry would take the balance negative (current %, entry %)', v_balance, NEW.amount;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vault_entries_guard ON public.vault_entries;
CREATE TRIGGER trg_vault_entries_guard
  BEFORE INSERT ON public.vault_entries
  FOR EACH ROW EXECUTE FUNCTION public.vault_entries_guard();

COMMIT;
