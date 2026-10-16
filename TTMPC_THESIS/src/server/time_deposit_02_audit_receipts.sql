-- Time Deposit — additive audit and receipt wiring.
-- Apply after time_deposit_01_schema.sql, audit_log_triggers.sql, and the
-- receipts schema/trigger files. No funding or settlement behavior is added.
-- The new CHECK constraints are intentionally NOT VALID because this is an
-- additive migration and existing deployments may contain older entity/source
-- labels that are not in the current documented allow-lists. PostgreSQL still
-- enforces NOT VALID checks for every new or updated row.

BEGIN;

ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type IN (
    'loan', 'member', 'account', 'termination', 'application', 'policy',
    'payment', 'disbursement', 'cbu', 'savings', 'withdrawal',
    'membership_payment', 'grocery', 'receipt', 'time_deposit'
    )) NOT VALID;

CREATE OR REPLACE FUNCTION public.audit_trg_time_deposit_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.audit_write(
        'time_deposit',
        NEW.time_deposit_id::text,
        'post',
        NULL,
        jsonb_build_object(
            'ledger_id', NEW.id,
            'entry_type', NEW.entry_type,
            'amount', NEW.amount,
            'reference', NEW.reference,
            'idempotency_key', NEW.idempotency_key,
            'posted_at', NEW.posted_at
        ),
        jsonb_build_object('ledger_id', NEW.id, 'amount', NEW.amount)
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_time_deposit_ledger ON public.time_deposit_ledger;
CREATE TRIGGER trg_audit_time_deposit_ledger
AFTER INSERT ON public.time_deposit_ledger
FOR EACH ROW EXECUTE FUNCTION public.audit_trg_time_deposit_ledger();

ALTER TABLE public.receipts
  DROP CONSTRAINT IF EXISTS receipts_source_type_check;

ALTER TABLE public.receipts
  ADD CONSTRAINT receipts_source_type_check
  CHECK (source_type IN (
    'loan_payment', 'loan_release', 'savings', 'cbu',
    'membership_payment', 'cbu_payout', 'isc', 'grocery', 'time_deposit'
    )) NOT VALID;

CREATE OR REPLACE FUNCTION public.receipt_issue_time_deposit(p_ledger_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    l public.time_deposit_ledger%ROWTYPE;
    d public.time_deposits%ROWTYPE;
    v_member jsonb;
BEGIN
    SELECT * INTO l
    FROM public.time_deposit_ledger
    WHERE id = p_ledger_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT * INTO d
    FROM public.time_deposits
    WHERE id = l.time_deposit_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT jsonb_build_object(
        'name', public.receipt_member_name(m.id),
        'membership_id', m.membership_id
    ) INTO v_member
    FROM public.member m
    WHERE m.id = d.member_id;

    RETURN public.receipt_issue(
        'time_deposit',
        l.id::text,
        d.member_id,
        l.amount,
        jsonb_build_object(
            'kind', 'time_deposit',
            'title', 'Time Deposit Transaction',
            'member', coalesce(v_member, '{}'::jsonb),
            'certificate_number', d.certificate_number,
            'entry_type', l.entry_type,
            'principal', d.principal,
            'term_days', d.term_days,
            'annual_rate', d.annual_rate,
            'amount', l.amount,
            'reference', l.reference,
            'posted_at', l.posted_at
        ),
        l.posted_by,
        NULL,
        l.posted_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.receipt_trg_time_deposit_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        PERFORM public.receipt_issue_time_deposit(NEW.id);
    EXCEPTION WHEN others THEN
        INSERT INTO public.receipt_issue_errors (source_type, source_id, error)
        VALUES ('time_deposit', NEW.id::text, SQLERRM);
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_time_deposit_ledger ON public.time_deposit_ledger;
CREATE TRIGGER trg_receipt_time_deposit_ledger
AFTER INSERT ON public.time_deposit_ledger
FOR EACH ROW EXECUTE FUNCTION public.receipt_trg_time_deposit_ledger();

COMMIT;