-- =============================================================================
-- Audit Log — extend to cashier transaction tables
-- =============================================================================
-- Adds AFTER INSERT triggers on the tables the Cashier writes to, so every
-- payment, disbursement, CBU deposit, savings ledger entry, savings queue
-- request, membership payment, and grocery transaction produces an audit_log
-- row. The trigger runs as SECURITY DEFINER through audit_write(), which
-- captures the current actor via audit_resolve_actor() — so the row's
-- actor_user_id matches the signed-in cashier and RLS lets them read it back.
--
-- Run this AFTER audit_log_schema.sql and audit_log_triggers.sql.
-- =============================================================================

-- 1. Widen the CHECK constraints so the new entity_type / action values are
--    accepted. The existing values remain valid.
ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type IN (
    'loan', 'member', 'account', 'termination', 'application', 'policy',
    'payment', 'disbursement', 'cbu', 'savings', 'withdrawal',
    'membership_payment', 'grocery'
  ));

ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_action_check;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_action_check
  CHECK (action IN (
    'create', 'update', 'approve', 'reject', 'recommend',
    'deactivate', 'reactivate', 'terminate', 'disburse',
    'change_role', 'revise',
    'record', 'post'
  ));

-- =============================================================================
-- 2. loan_payments — cashier records a loan repayment
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_trg_loan_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      'payment',
      NEW.id::text,
      'record',
      NULL,
      jsonb_build_object(
        'loan_id',      NEW.loan_id,
        'amount_paid',  NEW.amount_paid,
        'penalties',    NEW.penalties,
        'payment_date', NEW.payment_date
      ),
      jsonb_build_object(
        'loan_id',      NEW.loan_id,
        'amount_paid', NEW.amount_paid
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.loan_payments') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_loan_payments ON public.loan_payments';
    EXECUTE 'CREATE TRIGGER trg_audit_loan_payments
             AFTER INSERT ON public.loan_payments
             FOR EACH ROW EXECUTE FUNCTION public.audit_trg_loan_payments()';
  END IF;
END $$;

-- =============================================================================
-- 3. disbursement_confirmations — cashier confirms a loan disbursement
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_trg_disbursement_confirmations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      'disbursement',
      NEW.id::text,
      'disburse',
      NULL,
      to_jsonb(NEW) - 'id',
      jsonb_build_object('loan_id', NEW.loan_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.disbursement_confirmations') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_disbursement_confirmations ON public.disbursement_confirmations';
    EXECUTE 'CREATE TRIGGER trg_audit_disbursement_confirmations
             AFTER INSERT ON public.disbursement_confirmations
             FOR EACH ROW EXECUTE FUNCTION public.audit_trg_disbursement_confirmations()';
  END IF;
END $$;

-- =============================================================================
-- 4. capital_build_up — cashier records a CBU deposit
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_trg_capital_build_up()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      'cbu',
      coalesce(NEW.cbu_deposit_id, NEW.id::text),
      'record',
      NULL,
      jsonb_build_object(
        'member_id',              NEW.member_id,
        'capital_added',          NEW.capital_added,
        'starting_share_capital', NEW.starting_share_capital,
        'ending_share_capital',   NEW.ending_share_capital,
        'transaction_date',       NEW.transaction_date
      ),
      jsonb_build_object(
        'member_id',     NEW.member_id,
        'capital_added', NEW.capital_added
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.capital_build_up') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_capital_build_up ON public.capital_build_up';
    EXECUTE 'CREATE TRIGGER trg_audit_capital_build_up
             AFTER INSERT ON public.capital_build_up
             FOR EACH ROW EXECUTE FUNCTION public.audit_trg_capital_build_up()';
  END IF;
END $$;

-- =============================================================================
-- 5. savings_ledger — cashier posts a savings deposit or withdrawal
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_trg_savings_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity text := 'savings';
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Withdrawals get their own entity_type so the Withdrawals filter matches.
    IF lower(coalesce(NEW.entry_type, '')) = 'debit' THEN
      v_entity := 'withdrawal';
    END IF;

    PERFORM public.audit_write(
      v_entity,
      NEW.id::text,
      'post',
      NULL,
      jsonb_build_object(
        'account_number',  NEW.account_number,
        'entry_type',      NEW.entry_type,
        'amount',          NEW.amount,
        'running_balance', NEW.running_balance,
        'reference',       NEW.reference,
        'source',          NEW.source,
        'posted_at',       NEW.posted_at
      ),
      jsonb_build_object(
        'account_number', NEW.account_number,
        'amount',         NEW.amount
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.savings_ledger') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_savings_ledger ON public.savings_ledger';
    EXECUTE 'CREATE TRIGGER trg_audit_savings_ledger
             AFTER INSERT ON public.savings_ledger
             FOR EACH ROW EXECUTE FUNCTION public.audit_trg_savings_ledger()';
  END IF;
END $$;

-- =============================================================================
-- 6. savings_transaction_queue — cashier processes / validates a queued
--    savings request. Only meaningful transitions produce an audit row.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_trg_savings_transaction_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity text := 'savings';
  v_id text;
BEGIN
  v_id := coalesce(NEW.transaction_id, NEW.id::text);

  IF lower(coalesce(NEW.transaction_type, '')) = 'withdraw' THEN
    v_entity := 'withdrawal';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      v_entity,
      v_id,
      'create',
      NULL,
      jsonb_build_object(
        'transaction_type',   NEW.transaction_type,
        'amount',             NEW.amount,
        'transaction_status', NEW.transaction_status,
        'requested_at',       NEW.requested_at
      ),
      jsonb_build_object(
        'membership_number_id', NEW.membership_number_id,
        'amount',               NEW.amount
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.transaction_status IS DISTINCT FROM OLD.transaction_status THEN
    PERFORM public.audit_write(
      v_entity,
      v_id,
      CASE lower(coalesce(NEW.transaction_status, ''))
        WHEN 'validated' THEN 'approve'
        WHEN 'rejected'  THEN 'reject'
        ELSE 'update'
      END,
      jsonb_build_object('transaction_status', OLD.transaction_status),
      jsonb_build_object('transaction_status', NEW.transaction_status),
      jsonb_build_object(
        'membership_number_id', NEW.membership_number_id,
        'amount',               NEW.amount
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.savings_transaction_queue') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_savings_transaction_queue ON public.savings_transaction_queue';
    EXECUTE 'CREATE TRIGGER trg_audit_savings_transaction_queue
             AFTER INSERT OR UPDATE ON public.savings_transaction_queue
             FOR EACH ROW EXECUTE FUNCTION public.audit_trg_savings_transaction_queue()';
  END IF;
END $$;

-- =============================================================================
-- 7. membership_payments — cashier records a membership fee payment
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_trg_membership_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      'membership_payment',
      NEW.id::text,
      'record',
      NULL,
      to_jsonb(NEW) - 'id',
      jsonb_build_object(
        'membership_id', NEW.membership_id,
        'amount',        NEW.amount
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.audit_write(
      'membership_payment',
      NEW.id::text,
      CASE lower(coalesce(NEW.status, ''))
        WHEN 'paid'     THEN 'approve'
        WHEN 'rejected' THEN 'reject'
        ELSE 'update'
      END,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object(
        'membership_id', NEW.membership_id,
        'amount',        NEW.amount
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.membership_payments') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_membership_payments ON public.membership_payments';
    EXECUTE 'CREATE TRIGGER trg_audit_membership_payments
             AFTER INSERT OR UPDATE ON public.membership_payments
             FOR EACH ROW EXECUTE FUNCTION public.audit_trg_membership_payments()';
  END IF;
END $$;

-- =============================================================================
-- 8. GROCERY_TRANSACTIONS — cashier records a grocery sale
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_trg_grocery_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb := to_jsonb(NEW);
  v_id  text  := coalesce(v_row->>'GroceryID', v_row->>'id');
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      'grocery',
      v_id,
      'record',
      NULL,
      v_row - 'GroceryID' - 'id',
      jsonb_build_object('id', v_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public."GROCERY_TRANSACTIONS"') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_grocery_transactions ON public."GROCERY_TRANSACTIONS"';
    EXECUTE 'CREATE TRIGGER trg_audit_grocery_transactions
             AFTER INSERT ON public."GROCERY_TRANSACTIONS"
             FOR EACH ROW EXECUTE FUNCTION public.audit_trg_grocery_transactions()';
  END IF;
  -- Also handle the lowercase variant if that's what exists in this DB.
  IF to_regclass('public.grocery_transactions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_grocery_transactions_lc ON public.grocery_transactions';
    EXECUTE 'CREATE TRIGGER trg_audit_grocery_transactions_lc
             AFTER INSERT ON public.grocery_transactions
             FOR EACH ROW EXECUTE FUNCTION public.audit_trg_grocery_transactions()';
  END IF;
END $$;
