-- =============================================================================
-- Receipts — Part 2: issue receipts for loan payments and loan releases.
-- See RECEIPT_SYSTEM_PLAN.md §6.2 / §12.2. Run AFTER receipts_01_schema.sql.
-- =============================================================================
-- Issued automatically, in the same database transaction as the posting:
--   * loan payment  -> when loan_payments.confirmation_status becomes validated
--   * loan release  -> when a disbursement_confirmations row is inserted
--
-- The triggers NEVER block the posting: a failure is written to
-- receipt_issue_errors and receipts_backfill() (receipts_03) retries it.
-- A second attempt for the same transaction is a no-op (one receipt per
-- transaction), so retries and double clicks are safe.
--
-- Safe to re-run.
-- =============================================================================

BEGIN;

-- 1. Small helpers -----------------------------------------------------------

-- "First M. Last" for a member.id.
CREATE OR REPLACE FUNCTION public.receipt_member_name(p_member_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT nullif(btrim(concat_ws(' ',
               nullif(btrim(m.first_name), ''),
               CASE WHEN nullif(btrim(m.middle_initial), '') IS NOT NULL
                    THEN rtrim(btrim(m.middle_initial), '.') || '.' END,
               nullif(btrim(m.last_name), ''))), '')
    FROM public.member m
    WHERE m.id = p_member_id;
$$;

-- Display name + role of a staff login (auth user id). NULL when unknown.
CREATE OR REPLACE FUNCTION public.receipt_actor(p_auth_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
               'name', public.receipt_member_name(m.id),
               'role', nullif(lower(btrim(ma.role)), '')
           )
    FROM public.member_account ma
    LEFT JOIN public.member m ON m.membership_id = ma.membership_id
    WHERE ma.auth_user_id = p_auth_id
    LIMIT 1;
$$;

-- text -> uuid without raising on junk.
CREATE OR REPLACE FUNCTION public.receipt_try_uuid(p text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN nullif(btrim(p), '')::uuid;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$;

-- 2. The one place a receipt row is written ----------------------------------
-- Returns the receipt number (existing or new). Adds receipt_no / issued_at to
-- the snapshot before hashing, so the hash covers the whole printed receipt.
CREATE OR REPLACE FUNCTION public.receipt_issue(
    p_source_type text,
    p_source_id   text,
    p_member_id   uuid,
    p_amount      numeric,
    p_snapshot    jsonb,
    p_issued_by   uuid,
    p_issued_role text,
    p_issued_at   timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_existing text;
    v_no       text;
    v_at       timestamptz := coalesce(p_issued_at, now());
    v_snapshot jsonb;
BEGIN
    SELECT receipt_no INTO v_existing
    FROM public.receipts
    WHERE source_type = p_source_type AND source_id = p_source_id;
    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    v_no := public.receipt_next_no(v_at);
    v_snapshot := p_snapshot || jsonb_build_object(
        'receipt_no',  v_no,
        'source_type', p_source_type,
        'issued_at',   v_at
    );

    INSERT INTO public.receipts (
        receipt_no, source_type, source_id, member_id, amount,
        snapshot, snapshot_hash, issued_at, issued_by, issued_by_role
    ) VALUES (
        v_no, p_source_type, p_source_id, p_member_id, coalesce(p_amount, 0),
        v_snapshot, encode(digest(v_snapshot::text, 'sha256'), 'hex'),
        v_at, p_issued_by, p_issued_role
    )
    ON CONFLICT (source_type, source_id) DO NOTHING;

    -- Lost a race with a concurrent issuer: return the winner's number.
    SELECT receipt_no INTO v_existing
    FROM public.receipts
    WHERE source_type = p_source_type AND source_id = p_source_id;
    RETURN v_existing;
END;
$$;

-- 3. Loan payment -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receipt_issue_loan_payment(p_payment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    p          public.loan_payments%ROWTYPE;
    l          record;
    s          record;
    v_status   text;
    v_payable  numeric;
    v_paid     numeric;
    v_interest numeric;
    v_received jsonb;
    v_valid_id uuid;
    v_valid    jsonb;
    v_valid_at timestamptz;
    v_member   jsonb;
    v_snapshot jsonb;
BEGIN
    SELECT * INTO p FROM public.loan_payments WHERE id = p_payment_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_status := lower(coalesce(p.confirmation_status, ''));
    IF v_status NOT IN ('validated', 'confirmed', 'bookkeeper_confirmed', 'approved') THEN
        RETURN NULL;   -- only validated payments get a receipt
    END IF;

    SELECT ln.control_number, ln.member_id, ln.term, ln.monthly_amortization,
           coalesce(ln.principal_amount, ln.loan_amount, 0) AS principal,
           coalesce(ln.total_interest, 0)                  AS total_interest,
           lt.name                                         AS loan_type
    INTO l
    FROM public.loans ln
    LEFT JOIN public.loan_types lt ON lt.id = ln.loan_type_id
    WHERE ln.control_number = p.loan_id;

    SELECT installment_no, due_date INTO s
    FROM public.loan_schedules WHERE id = p.schedule_id;

    -- Remaining balance = total payable - validated payments (incl. this one).
    -- Same rule as _loan_total_payable() in main.py.
    v_interest := coalesce(l.total_interest, 0);
    IF v_interest <= 0 AND coalesce(l.monthly_amortization, 0) > 0 AND coalesce(l.term, 0) > 0 THEN
        v_interest := greatest(l.monthly_amortization * l.term - l.principal, 0);
    END IF;
    v_payable := coalesce(l.principal, 0) + v_interest;

    SELECT coalesce(sum(amount_paid), 0) INTO v_paid
    FROM public.loan_payments
    WHERE loan_id = p.loan_id
      AND lower(coalesce(confirmation_status, '')) IN ('validated', 'confirmed', 'bookkeeper_confirmed', 'approved');

    v_received := public.receipt_actor(p.entered_by);
    v_valid_id := coalesce(p.validated_by, p.reviewed_by, p.confirmed_by);
    v_valid    := public.receipt_actor(v_valid_id);
    v_valid_at := coalesce(p.confirmed_at, p.reviewed_at, now());

    SELECT jsonb_build_object('name', public.receipt_member_name(m.id), 'membership_id', m.membership_id)
    INTO v_member
    FROM public.member m WHERE m.id = l.member_id;

    v_snapshot := jsonb_build_object(
        'kind',            'loan_payment',
        'title',           'Loan Payment',
        'amount',          coalesce(p.amount_paid, 0) + coalesce(p.penalties, 0),
        'member',          coalesce(v_member, '{}'::jsonb),
        'loan', jsonb_build_object(
            'control_number', p.loan_id,
            'loan_type',      l.loan_type,
            'term_months',    l.term,
            'installment_no', s.installment_no,
            'due_date',       s.due_date
        ),
        'breakdown', jsonb_build_object(
            'amount_paid',        coalesce(p.amount_paid, 0),
            'penalty_paid',       coalesce(p.penalties, 0),
            'applied_to_penalty', coalesce(p.applied_to_penalty, 0),
            'applied_to_arrears', coalesce(p.applied_to_arrears, 0),
            'applied_to_current', coalesce(p.applied_to_current, 0),
            'applied_to_credit',  coalesce(p.applied_to_credit, 0),
            'remaining_balance',  greatest(v_payable - v_paid, 0)
        ),
        'reference', jsonb_build_object(
            'payment_reference', coalesce(nullif(p.payment_reference, ''), nullif(p.transaction_reference, ''), p.id::text),
            'paid_at',           p.payment_date,
            'received_by',       coalesce(v_received ->> 'name', 'Cashier'),
            'validated_by',      coalesce(v_valid ->> 'name', 'Bookkeeper'),
            'validated_at',      v_valid_at
        )
    );

    RETURN public.receipt_issue(
        'loan_payment', p.id::text, l.member_id,
        coalesce(p.amount_paid, 0) + coalesce(p.penalties, 0),
        v_snapshot, v_valid_id, coalesce(v_valid ->> 'role', 'bookkeeper'), v_valid_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.receipt_trg_loan_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        PERFORM public.receipt_issue_loan_payment(NEW.id);
    EXCEPTION WHEN others THEN
        INSERT INTO public.receipt_issue_errors (source_type, source_id, error)
        VALUES ('loan_payment', NEW.id::text, SQLERRM);
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_loan_payments ON public.loan_payments;
CREATE TRIGGER trg_receipt_loan_payments
AFTER UPDATE OF confirmation_status ON public.loan_payments
FOR EACH ROW
WHEN (
    lower(coalesce(NEW.confirmation_status, '')) IN ('validated', 'confirmed', 'bookkeeper_confirmed', 'approved')
    AND lower(coalesce(OLD.confirmation_status, '')) IS DISTINCT FROM lower(coalesce(NEW.confirmation_status, ''))
)
EXECUTE FUNCTION public.receipt_trg_loan_payments();

-- 4. Loan release --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receipt_issue_loan_release(p_confirmation_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    d          public.disbursement_confirmations%ROWTYPE;
    l          record;
    v_member   uuid;
    v_mem_json jsonb;
    v_actor_id uuid;
    v_actor    jsonb;
    v_recorded boolean;
    v_amount   numeric;
    v_snapshot jsonb;
BEGIN
    SELECT * INTO d FROM public.disbursement_confirmations WHERE id = p_confirmation_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT ln.member_id, ln.term, ln.monthly_amortization, lt.name AS loan_type
    INTO l
    FROM public.loans ln
    LEFT JOIN public.loan_types lt ON lt.id = ln.loan_type_id
    WHERE ln.control_number = d.loan_id;

    v_member := coalesce(l.member_id, public.receipt_try_uuid(d.member_id));

    SELECT jsonb_build_object('name', public.receipt_member_name(m.id), 'membership_id', m.membership_id)
    INTO v_mem_json
    FROM public.member m WHERE m.id = v_member;

    v_actor_id := coalesce(d.released_by_auth_id, public.receipt_try_uuid(d.cashier_id));
    v_actor    := public.receipt_actor(v_actor_id);

    -- Breakdown is on the row only for releases made after receipts_01.
    v_recorded := d.net_proceeds IS NOT NULL;
    v_amount   := coalesce(d.net_proceeds, d.loan_amount);

    v_snapshot := jsonb_build_object(
        'kind',   'loan_release',
        'title',  'Loan Released',
        'amount', v_amount,
        'member', coalesce(v_mem_json, jsonb_build_object('name', d.member_name)),
        'loan', jsonb_build_object(
            'control_number',       d.loan_id,
            'loan_type',            coalesce(l.loan_type, d.loan_type),
            'term_months',          coalesce(d.term_months, l.term),
            'monthly_amortization', coalesce(d.monthly_amortization, l.monthly_amortization),
            'first_due_date',       d.first_due_date
        ),
        'breakdown', jsonb_build_object(
            'recorded',       v_recorded,
            'principal',      coalesce(d.principal_amount, d.loan_amount),
            'service_fee',    d.service_fee,
            'cbu_deduction',  d.cbu_deduction,
            'insurance_fee',  d.insurance_fee,
            'notarial_fee',   d.notarial_fee,
            'renewal_payoff', d.renewal_payoff,
            'net_proceeds',   d.net_proceeds
        ),
        'reference', jsonb_build_object(
            'disbursement_reference', d.reference_number,
            'released_at',            d.disbursed_at,
            'released_by',            coalesce(v_actor ->> 'name', nullif(d.cashier_name, ''), 'Cashier')
        )
    );

    RETURN public.receipt_issue(
        'loan_release', d.id::text, v_member, v_amount,
        v_snapshot, v_actor_id, coalesce(v_actor ->> 'role', 'cashier'), d.disbursed_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.receipt_trg_disbursement_confirmations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        PERFORM public.receipt_issue_loan_release(NEW.id);
    EXCEPTION WHEN others THEN
        INSERT INTO public.receipt_issue_errors (source_type, source_id, error)
        VALUES ('loan_release', NEW.id::text, SQLERRM);
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_disbursement_confirmations ON public.disbursement_confirmations;
CREATE TRIGGER trg_receipt_disbursement_confirmations
AFTER INSERT ON public.disbursement_confirmations
FOR EACH ROW
EXECUTE FUNCTION public.receipt_trg_disbursement_confirmations();

-- 5. None of these are callable from the browser --------------------------------
REVOKE ALL ON FUNCTION public.receipt_issue(text, text, uuid, numeric, jsonb, uuid, text, timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipt_issue_loan_payment(uuid)  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipt_issue_loan_release(uuid)  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipt_member_name(uuid)         FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipt_actor(uuid)               FROM public, anon, authenticated;

COMMIT;
