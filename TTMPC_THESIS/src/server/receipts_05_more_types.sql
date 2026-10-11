-- =============================================================================
-- Receipts — Part 5: savings, membership fees, CBU exit payouts, ISC, grocery.
-- See RECEIPT_SYSTEM_PLAN.md §12.2h. Run AFTER receipts_01..04. Safe to re-run.
-- =============================================================================
-- Same pattern as loan payments / releases / CBU deposits: a trigger issues the
-- receipt in the same transaction as the posting, never blocks it (failures go
-- to receipt_issue_errors), and one receipt per transaction.
--
-- Which rows get a receipt (only transactions done through the system):
--   savings     a savings_ledger entry whose reference is a savings queue
--               transaction (cashier deposit; withdrawal once the Bookkeeper
--               confirms), or an account-opening deposit ('OPEN-<id>').
--               Receipt source_id = the queue transaction ID.
--   membership  membership_payments marked paid, with a system payment ID
--               (TTMPCMF-... membership fee, TTMPCPC-... paid-up capital).
--   cbu_payout  cbu_payouts rows of kind 'payout' (cash handed to an exiting
--               member). Loan offsets are not cash and get none.
--   isc         isc_transactions line settled as 'capitalised' or 'cash'.
--   grocery     GROCERY_TRANSACTIONS 'Completed' and received from the POS
--               webhook (event_id present). 'On Credit' is left out for now.
-- =============================================================================

BEGIN;

-- 0. Who recorded a savings entry (filled by the backend) ----------------------
ALTER TABLE public.savings_ledger ADD COLUMN IF NOT EXISTS recorded_by uuid;

-- 1. Receipt writer that also keeps the applicant (membership fees) -----------
CREATE OR REPLACE FUNCTION public.receipt_issue_for_application(
    p_source_type    text,
    p_source_id      text,
    p_member_id      uuid,
    p_application_id text,
    p_amount         numeric,
    p_snapshot       jsonb,
    p_issued_by      uuid,
    p_issued_role    text,
    p_issued_at      timestamptz
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
    FROM public.receipts WHERE source_type = p_source_type AND source_id = p_source_id;
    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    v_no := public.receipt_next_no(v_at);
    v_snapshot := p_snapshot || jsonb_build_object('receipt_no', v_no, 'source_type', p_source_type, 'issued_at', v_at);

    INSERT INTO public.receipts (
        receipt_no, source_type, source_id, member_id, application_id, amount,
        snapshot, snapshot_hash, issued_at, issued_by, issued_by_role
    ) VALUES (
        v_no, p_source_type, p_source_id, p_member_id, p_application_id, coalesce(p_amount, 0),
        v_snapshot, encode(digest(v_snapshot::text, 'sha256'), 'hex'),
        v_at, p_issued_by, p_issued_role
    )
    ON CONFLICT (source_type, source_id) DO NOTHING;

    SELECT receipt_no INTO v_existing
    FROM public.receipts WHERE source_type = p_source_type AND source_id = p_source_id;
    RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.receipt_member_json(p_member_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object('name', public.receipt_member_name(m.id), 'membership_id', m.membership_id)
    FROM public.member m WHERE m.id = p_member_id;
$$;

-- =============================================================================
-- 2. SAVINGS
-- =============================================================================
CREATE OR REPLACE FUNCTION public.receipt_is_savings_entry(p_reference text, p_source text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_reference IS NOT NULL AND (
           p_reference LIKE 'OPEN-%'
        OR coalesce(p_source, '') = 'cashier_deposit'
        OR EXISTS (SELECT 1 FROM public.savings_transaction_queue q
                   WHERE q.transaction_id = p_reference
                     AND lower(coalesce(q.transaction_status, '')) IN ('validated', 'posted', 'completed'))
    );
$$;

CREATE OR REPLACE FUNCTION public.receipt_issue_savings(p_ledger_id uuid, p_at timestamptz DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    e          public.savings_ledger%ROWTYPE;
    a          record;
    q          record;
    v_member   uuid;
    v_withdraw boolean;
    v_opening  boolean;
    v_actor_id uuid;
    v_actor    jsonb;
    v_title    text;
    v_snapshot jsonb;
BEGIN
    SELECT * INTO e FROM public.savings_ledger WHERE id = p_ledger_id;
    IF NOT FOUND OR NOT public.receipt_is_savings_entry(e.reference, e.source) THEN
        RETURN NULL;
    END IF;

    SELECT account_number, account_name, member_id INTO a
    FROM public.savings_accounts WHERE account_number = e.account_number;

    SELECT transaction_id, transaction_type, requested_at, verified_by, membership_number_id INTO q
    FROM public.savings_transaction_queue WHERE transaction_id = e.reference
    ORDER BY requested_at DESC LIMIT 1;

    v_member := a.member_id;
    IF v_member IS NULL AND q.membership_number_id IS NOT NULL THEN
        SELECT id INTO v_member FROM public.member WHERE membership_id = q.membership_number_id LIMIT 1;
    END IF;

    v_withdraw := e.entry_type = 'debit';
    v_opening  := e.reference LIKE 'OPEN-%';
    v_title := CASE WHEN v_opening THEN 'Savings Opening Deposit'
                    WHEN v_withdraw THEN 'Savings Withdrawal'
                    ELSE 'Savings Deposit' END;

    v_actor_id := coalesce(e.recorded_by, public.receipt_try_uuid(q.verified_by::text));
    v_actor    := public.receipt_actor(v_actor_id);

    v_snapshot := jsonb_build_object(
        'kind',   'savings',
        'title',  v_title,
        'amount', e.amount,
        'member', coalesce(public.receipt_member_json(v_member), '{}'::jsonb),
        'account', jsonb_build_object('account_number', e.account_number, 'account_name', a.account_name),
        'breakdown', jsonb_build_object(
            'direction',     CASE WHEN v_withdraw THEN 'withdrawal' ELSE 'deposit' END,
            'amount',        e.amount,
            'balance_after', e.running_balance
        ),
        'reference', jsonb_build_object(
            'transaction_id', e.reference,
            'requested_at',   q.requested_at,
            'posted_at',      e.posted_at,
            'handled_by',     coalesce(v_actor ->> 'name',
                                       CASE WHEN v_withdraw THEN 'Bookkeeper' ELSE 'Cashier' END),
            'handled_role',   CASE WHEN v_withdraw THEN 'Validated by' ELSE 'Received by' END
        )
    );

    RETURN public.receipt_issue(
        'savings', e.reference, v_member, e.amount, v_snapshot, v_actor_id,
        coalesce(v_actor ->> 'role', CASE WHEN v_withdraw THEN 'bookkeeper' ELSE 'cashier' END),
        coalesce(p_at, e.posted_at, now())
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.receipt_trg_savings_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        PERFORM public.receipt_issue_savings(NEW.id);
    EXCEPTION WHEN others THEN
        INSERT INTO public.receipt_issue_errors (source_type, source_id, error)
        VALUES ('savings', coalesce(NEW.reference, NEW.id::text), SQLERRM);
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_savings_ledger ON public.savings_ledger;
CREATE TRIGGER trg_receipt_savings_ledger
AFTER INSERT ON public.savings_ledger
FOR EACH ROW
WHEN (NEW.reference IS NOT NULL)
EXECUTE FUNCTION public.receipt_trg_savings_ledger();

-- =============================================================================
-- 3. MEMBERSHIP FEES (membership fee + initial paid-up capital)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.receipt_issue_membership_payment(p_payment_pk uuid, p_at timestamptz DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    p          record;
    app        record;
    v_member   uuid;
    v_actor_id uuid;
    v_actor    jsonb;
    v_paid_up  boolean;
    v_person   jsonb;
    v_snapshot jsonb;
BEGIN
    SELECT * INTO p FROM public.membership_payments WHERE id = p_payment_pk;
    IF NOT FOUND
       OR lower(coalesce(p.payment_status, '')) <> 'paid'
       OR coalesce(p.payment_id, '') !~ '^TTMPC(MF|PC)-' THEN
        RETURN NULL;
    END IF;

    SELECT application_id, membership_id, first_name, surname INTO app
    FROM public.member_applications WHERE application_id = p.application_id
    ORDER BY created_at DESC NULLS LAST LIMIT 1;

    v_member := public.receipt_try_uuid(p.member_id::text);
    IF v_member IS NULL AND coalesce(app.membership_id, p.membership_number_id::text) IS NOT NULL THEN
        SELECT id INTO v_member FROM public.member
        WHERE membership_id = coalesce(app.membership_id, p.membership_number_id::text) LIMIT 1;
    END IF;

    v_person := coalesce(
        public.receipt_member_json(v_member),
        jsonb_build_object(
            'name', nullif(btrim(concat_ws(' ', app.first_name, app.surname)), ''),
            'membership_id', coalesce(app.membership_id, 'Applicant')
        )
    );

    v_actor_id := public.receipt_try_uuid(p.processed_by::text);
    v_actor    := public.receipt_actor(v_actor_id);
    v_paid_up  := upper(coalesce(p.payment_type, '')) = 'INITIAL_PAID_UP_CAPITAL';

    v_snapshot := jsonb_build_object(
        'kind',   'membership_payment',
        'title',  CASE WHEN v_paid_up THEN 'Initial Paid-Up Capital' ELSE 'Membership Fee' END,
        'amount', p.amount,
        'member', v_person,
        'breakdown', jsonb_build_object(
            'payment_type',   CASE WHEN v_paid_up THEN 'Initial Paid-Up Capital' ELSE 'Membership Fee' END,
            'amount',         p.amount,
            'payment_method', p.payment_method
        ),
        'reference', jsonb_build_object(
            'payment_id',       p.payment_id,
            'reference_number', p.reference_number,
            'application_id',   p.application_id,
            'paid_at',          coalesce(p.payment_date, p.created_at),
            'received_by',      coalesce(v_actor ->> 'name', nullif(p.processed_by_name, ''), 'Cashier')
        )
    );

    RETURN public.receipt_issue_for_application(
        'membership_payment', p.payment_id, v_member, p.application_id::text, p.amount, v_snapshot,
        v_actor_id, coalesce(v_actor ->> 'role', 'cashier'),
        coalesce(p_at, now())
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.receipt_trg_membership_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        PERFORM public.receipt_issue_membership_payment(NEW.id);
    EXCEPTION WHEN others THEN
        INSERT INTO public.receipt_issue_errors (source_type, source_id, error)
        VALUES ('membership_payment', coalesce(NEW.payment_id, NEW.id::text), SQLERRM);
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_membership_payments ON public.membership_payments;
CREATE TRIGGER trg_receipt_membership_payments
AFTER INSERT OR UPDATE OF payment_status ON public.membership_payments
FOR EACH ROW
WHEN (lower(coalesce(NEW.payment_status, '')) = 'paid')
EXECUTE FUNCTION public.receipt_trg_membership_payments();

-- =============================================================================
-- 4. CBU EXIT PAYOUTS
-- =============================================================================
CREATE OR REPLACE FUNCTION public.receipt_issue_cbu_payout(p_payout_id bigint, p_at timestamptz DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    p          public.cbu_payouts%ROWTYPE;
    c          record;
    v_actor    jsonb;
    v_snapshot jsonb;
BEGIN
    SELECT * INTO p FROM public.cbu_payouts WHERE id = p_payout_id;
    IF NOT FOUND OR p.kind <> 'payout' THEN
        RETURN NULL;
    END IF;

    SELECT starting_share_capital, ending_share_capital INTO c
    FROM public.capital_build_up WHERE id = p.cbu_row_id;

    v_actor := public.receipt_actor(p.recorded_by);

    v_snapshot := jsonb_build_object(
        'kind',   'cbu_payout',
        'title',  'CBU Exit Payout',
        'amount', p.amount,
        'member', coalesce(public.receipt_member_json(p.member_id),
                           jsonb_build_object('membership_id', p.membership_id)),
        'breakdown', jsonb_build_object(
            'amount_paid',        p.amount,
            'cbu_before',         c.starting_share_capital,
            'still_owed_after',   greatest(coalesce(c.ending_share_capital, 0), 0)
        ),
        'reference', jsonb_build_object(
            'payout_reference', p.reference,
            'payout_date',      p.payout_date,
            'paid_by',          coalesce(v_actor ->> 'name', nullif(p.recorded_by_email, ''), 'Cashier')
        )
    );

    RETURN public.receipt_issue(
        'cbu_payout', p.id::text, p.member_id, p.amount, v_snapshot,
        p.recorded_by, coalesce(v_actor ->> 'role', 'cashier'), coalesce(p_at, p.created_at, now())
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.receipt_trg_cbu_payouts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        PERFORM public.receipt_issue_cbu_payout(NEW.id);
    EXCEPTION WHEN others THEN
        INSERT INTO public.receipt_issue_errors (source_type, source_id, error)
        VALUES ('cbu_payout', NEW.id::text, SQLERRM);
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_cbu_payouts ON public.cbu_payouts;
CREATE TRIGGER trg_receipt_cbu_payouts
AFTER INSERT ON public.cbu_payouts
FOR EACH ROW
WHEN (NEW.kind = 'payout')
EXECUTE FUNCTION public.receipt_trg_cbu_payouts();

-- =============================================================================
-- 5. ISC (Interest on Share Capital) — one receipt per settled member line
-- =============================================================================
CREATE OR REPLACE FUNCTION public.receipt_issue_isc(p_line_id uuid, p_at timestamptz DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t          record;
    h          record;
    c          record;
    v_cap      boolean;
    v_actor    jsonb;
    v_snapshot jsonb;
BEGIN
    SELECT * INTO t FROM public.isc_transactions WHERE id = p_line_id;
    IF NOT FOUND OR t.settlement NOT IN ('capitalised', 'cash') OR coalesce(t.interest_amount, 0) <= 0 THEN
        RETURN NULL;
    END IF;

    SELECT period_start, period_end, rate INTO h FROM public.isc_postings WHERE id = t.isc_posting_id;
    v_cap := t.settlement = 'capitalised';
    IF v_cap THEN
        SELECT ending_share_capital INTO c FROM public.capital_build_up
        WHERE id = t.capitalised_cbu_id OR source_isc_id = t.id
        LIMIT 1;
    END IF;

    v_actor := public.receipt_actor(t.settled_by);

    v_snapshot := jsonb_build_object(
        'kind',   'isc',
        'title',  'Interest on Share Capital',
        'amount', t.interest_amount,
        'member', coalesce(public.receipt_member_json(t.member_id), '{}'::jsonb),
        'breakdown', jsonb_build_object(
            'settlement',           t.settlement,
            'period_start',         h.period_start,
            'period_end',           h.period_end,
            'rate',                 coalesce(t.rate, h.rate),
            'average_share_capital', t.average_share_capital,
            'interest_amount',      t.interest_amount,
            'share_capital_after',  CASE WHEN v_cap THEN c.ending_share_capital END
        ),
        'reference', jsonb_build_object(
            'isc_line_id', t.id,
            'settled_at',  t.settled_at,
            'settled_by',  coalesce(v_actor ->> 'name', nullif(t.settled_by_email, ''), 'Bookkeeper')
        )
    );

    RETURN public.receipt_issue(
        'isc', t.id::text, t.member_id, t.interest_amount, v_snapshot,
        t.settled_by, coalesce(v_actor ->> 'role', 'bookkeeper'), coalesce(p_at, t.settled_at, now())
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.receipt_trg_isc_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        PERFORM public.receipt_issue_isc(NEW.id);
    EXCEPTION WHEN others THEN
        INSERT INTO public.receipt_issue_errors (source_type, source_id, error)
        VALUES ('isc', NEW.id::text, SQLERRM);
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_isc_transactions ON public.isc_transactions;
CREATE TRIGGER trg_receipt_isc_transactions
AFTER UPDATE OF settlement ON public.isc_transactions
FOR EACH ROW
WHEN (NEW.settlement IN ('capitalised', 'cash') AND OLD.settlement IS DISTINCT FROM NEW.settlement)
EXECUTE FUNCTION public.receipt_trg_isc_transactions();

-- =============================================================================
-- 6. GROCERY (POS)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.receipt_issue_grocery(p_grocery_id text, p_at timestamptz DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    g          record;
    v_snapshot jsonb;
BEGIN
    SELECT * INTO g FROM public."GROCERY_TRANSACTIONS" WHERE "GroceryID" = p_grocery_id;
    IF NOT FOUND OR g."Status" <> 'Completed' OR g.event_id IS NULL OR coalesce(g."GroceryAmount", 0) <= 0 THEN
        RETURN NULL;
    END IF;

    v_snapshot := jsonb_build_object(
        'kind',   'grocery',
        'title',  'Grocery Purchase',
        'amount', g."GroceryAmount",
        'member', coalesce(public.receipt_member_json(g.membership_number_id), '{}'::jsonb),
        'breakdown', jsonb_build_object('amount', g."GroceryAmount", 'status', g."Status"),
        'reference', jsonb_build_object(
            'grocery_id',   g."GroceryID",
            'pos_event_id', g.event_id,
            'purchased_at', g."TransactionDate"
        )
    );

    RETURN public.receipt_issue(
        'grocery', g."GroceryID", g.membership_number_id, g."GroceryAmount", v_snapshot,
        NULL, 'pos', coalesce(p_at, g.created_at, g."TransactionDate", now())
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.receipt_trg_grocery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        PERFORM public.receipt_issue_grocery(NEW."GroceryID");
    EXCEPTION WHEN others THEN
        INSERT INTO public.receipt_issue_errors (source_type, source_id, error)
        VALUES ('grocery', NEW."GroceryID", SQLERRM);
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_grocery ON public."GROCERY_TRANSACTIONS";
CREATE TRIGGER trg_receipt_grocery
AFTER INSERT OR UPDATE OF "Status" ON public."GROCERY_TRANSACTIONS"
FOR EACH ROW
WHEN (NEW."Status" = 'Completed' AND NEW.event_id IS NOT NULL)
EXECUTE FUNCTION public.receipt_trg_grocery();

-- =============================================================================
-- 7. Catch-up for all five types
-- =============================================================================
CREATE OR REPLACE FUNCTION public.receipts_backfill_more()
RETURNS TABLE (source_type text, checked int, issued int, failed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r        record;
    v_no     text;
    v_check  int;
    v_issued int;
    v_failed int;
BEGIN
    -- Savings
    v_check := 0; v_issued := 0; v_failed := 0;
    FOR r IN
        SELECT e.id, e.reference FROM public.savings_ledger e
        WHERE public.receipt_is_savings_entry(e.reference, e.source)
          AND NOT EXISTS (SELECT 1 FROM public.receipts rc WHERE rc.source_type = 'savings' AND rc.source_id = e.reference)
        ORDER BY e.posted_at, e.id
    LOOP
        v_check := v_check + 1;
        BEGIN
            v_no := public.receipt_issue_savings(r.id);
            IF v_no IS NOT NULL THEN v_issued := v_issued + 1; END IF;
        EXCEPTION WHEN others THEN
            v_failed := v_failed + 1;
            INSERT INTO public.receipt_issue_errors (source_type, source_id, error) VALUES ('savings', r.reference, 'backfill: ' || SQLERRM);
        END;
    END LOOP;
    source_type := 'savings'; checked := v_check; issued := v_issued; failed := v_failed; RETURN NEXT;

    -- Membership fees (issue time = when the payment was recorded)
    v_check := 0; v_issued := 0; v_failed := 0;
    FOR r IN
        SELECT p.id, p.payment_id, coalesce(p.payment_date, p.created_at) AS at FROM public.membership_payments p
        WHERE lower(coalesce(p.payment_status, '')) = 'paid'
          AND coalesce(p.payment_id, '') ~ '^TTMPC(MF|PC)-'
          AND NOT EXISTS (SELECT 1 FROM public.receipts rc WHERE rc.source_type = 'membership_payment' AND rc.source_id = p.payment_id)
        ORDER BY 3, p.payment_id
    LOOP
        v_check := v_check + 1;
        BEGIN
            v_no := public.receipt_issue_membership_payment(r.id, r.at);
            IF v_no IS NOT NULL THEN v_issued := v_issued + 1; END IF;
        EXCEPTION WHEN others THEN
            v_failed := v_failed + 1;
            INSERT INTO public.receipt_issue_errors (source_type, source_id, error) VALUES ('membership_payment', r.payment_id, 'backfill: ' || SQLERRM);
        END;
    END LOOP;
    source_type := 'membership_payment'; checked := v_check; issued := v_issued; failed := v_failed; RETURN NEXT;

    -- CBU exit payouts
    v_check := 0; v_issued := 0; v_failed := 0;
    FOR r IN
        SELECT p.id FROM public.cbu_payouts p
        WHERE p.kind = 'payout'
          AND NOT EXISTS (SELECT 1 FROM public.receipts rc WHERE rc.source_type = 'cbu_payout' AND rc.source_id = p.id::text)
        ORDER BY p.created_at, p.id
    LOOP
        v_check := v_check + 1;
        BEGIN
            v_no := public.receipt_issue_cbu_payout(r.id);
            IF v_no IS NOT NULL THEN v_issued := v_issued + 1; END IF;
        EXCEPTION WHEN others THEN
            v_failed := v_failed + 1;
            INSERT INTO public.receipt_issue_errors (source_type, source_id, error) VALUES ('cbu_payout', r.id::text, 'backfill: ' || SQLERRM);
        END;
    END LOOP;
    source_type := 'cbu_payout'; checked := v_check; issued := v_issued; failed := v_failed; RETURN NEXT;

    -- ISC
    v_check := 0; v_issued := 0; v_failed := 0;
    FOR r IN
        SELECT t.id FROM public.isc_transactions t
        WHERE t.settlement IN ('capitalised', 'cash') AND coalesce(t.interest_amount, 0) > 0
          AND NOT EXISTS (SELECT 1 FROM public.receipts rc WHERE rc.source_type = 'isc' AND rc.source_id = t.id::text)
        ORDER BY t.settled_at, t.id
    LOOP
        v_check := v_check + 1;
        BEGIN
            v_no := public.receipt_issue_isc(r.id);
            IF v_no IS NOT NULL THEN v_issued := v_issued + 1; END IF;
        EXCEPTION WHEN others THEN
            v_failed := v_failed + 1;
            INSERT INTO public.receipt_issue_errors (source_type, source_id, error) VALUES ('isc', r.id::text, 'backfill: ' || SQLERRM);
        END;
    END LOOP;
    source_type := 'isc'; checked := v_check; issued := v_issued; failed := v_failed; RETURN NEXT;

    -- Grocery
    v_check := 0; v_issued := 0; v_failed := 0;
    FOR r IN
        SELECT g."GroceryID" AS gid FROM public."GROCERY_TRANSACTIONS" g
        WHERE g."Status" = 'Completed' AND g.event_id IS NOT NULL AND coalesce(g."GroceryAmount", 0) > 0
          AND NOT EXISTS (SELECT 1 FROM public.receipts rc WHERE rc.source_type = 'grocery' AND rc.source_id = g."GroceryID")
        ORDER BY g."TransactionDate", g."GroceryID"
    LOOP
        v_check := v_check + 1;
        BEGIN
            v_no := public.receipt_issue_grocery(r.gid);
            IF v_no IS NOT NULL THEN v_issued := v_issued + 1; END IF;
        EXCEPTION WHEN others THEN
            v_failed := v_failed + 1;
            INSERT INTO public.receipt_issue_errors (source_type, source_id, error) VALUES ('grocery', r.gid, 'backfill: ' || SQLERRM);
        END;
    END LOOP;
    source_type := 'grocery'; checked := v_check; issued := v_issued; failed := v_failed; RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.receipt_issue_for_application(text, text, uuid, text, numeric, jsonb, uuid, text, timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipt_issue_savings(uuid, timestamptz)              FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipt_issue_membership_payment(uuid, timestamptz)   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipt_issue_cbu_payout(bigint, timestamptz)         FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipt_issue_isc(uuid, timestamptz)                  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipt_issue_grocery(text, timestamptz)              FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipts_backfill_more()                              FROM public, anon, authenticated;

COMMIT;

-- Then run (separately):
--   SELECT * FROM public.receipts_backfill_more();
