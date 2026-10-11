-- =============================================================================
-- Receipts — Part 4: CBU deposit receipts. See RECEIPT_SYSTEM_PLAN.md §12.2g.
-- Run AFTER receipts_01 / 02 / 03. Safe to re-run.
-- =============================================================================
-- Which capital_build_up rows are cashier deposits (Step 6a checks, 2026-10-11):
--   * deposit_account is one of the Cashier form's "Paid by" options
--     (Cash / Check / GCash / Bank Transfer). Everything the system writes uses
--     its own code: historical_yearly_2019_2026, historical_import_2025,
--     LOAN_CBU_RETENTION, INITIAL_PAID_UP_CAPITAL / Initial Paid-Up Capital,
--     INTEREST_ON_SHARE_CAPITAL, TERMINATION_*.
--   * no source key (loan / membership payment / ISC / backfill)
--   * capital_added > 0
--
-- New column capital_build_up.recorded_by (auth user who recorded the
-- deposit), filled by POST /api/cashier/cbu/deposits, so the receipt can name
-- the cashier and the cashier can open the pop-up.
-- =============================================================================

BEGIN;

ALTER TABLE public.capital_build_up
    ADD COLUMN IF NOT EXISTS recorded_by uuid;

-- 1. The rule, in one place ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.receipt_is_cbu_deposit(
    p_deposit_account text,
    p_capital_added   numeric,
    p_source_loan_id  text,
    p_source_payment  text,
    p_source_isc      uuid,
    p_source_backfill uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT lower(btrim(coalesce(p_deposit_account, ''))) IN ('cash', 'check', 'gcash', 'bank transfer')
       AND coalesce(p_capital_added, 0) > 0
       AND p_source_loan_id IS NULL
       AND p_source_payment IS NULL
       AND p_source_isc IS NULL
       AND p_source_backfill IS NULL;
$$;

-- 2. Snapshot -------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.receipt_issue_cbu(uuid, uuid);
CREATE OR REPLACE FUNCTION public.receipt_issue_cbu(
    p_cbu_id uuid,
    p_actor  uuid        DEFAULT NULL,
    p_at     timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c          public.capital_build_up%ROWTYPE;
    v_actor_id uuid;
    v_actor    jsonb;
    v_member   jsonb;
    v_at       timestamptz;
    v_snapshot jsonb;
BEGIN
    SELECT * INTO c FROM public.capital_build_up WHERE id = p_cbu_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    IF NOT public.receipt_is_cbu_deposit(c.deposit_account, c.capital_added, c.source_loan_id,
                                          c.source_payment_id, c.source_isc_id, c.source_backfill_id) THEN
        RETURN NULL;
    END IF;

    v_actor_id := coalesce(c.recorded_by, p_actor);
    v_actor    := public.receipt_actor(v_actor_id);

    SELECT jsonb_build_object('name', public.receipt_member_name(m.id), 'membership_id', m.membership_id)
    INTO v_member
    FROM public.member m WHERE m.id = c.member_id;

    -- transaction_date is a plain date the cashier picked; the receipt is
    -- issued when the deposit was recorded (now, or its audit time on catch-up).
    v_at := coalesce(p_at, now());

    v_snapshot := jsonb_build_object(
        'kind',   'cbu',
        'title',  'Capital Build-Up Deposit',
        'amount', c.capital_added,
        'member', coalesce(v_member, '{}'::jsonb),
        'breakdown', jsonb_build_object(
            'amount_added',          c.capital_added,
            'share_capital_before',  c.starting_share_capital,
            'share_capital_after',   c.ending_share_capital
        ),
        'reference', jsonb_build_object(
            'cbu_deposit_id',  coalesce(c.cbu_deposit_id, c.id::text),
            'paid_by',         c.deposit_account,
            'date_received',   (c.transaction_date AT TIME ZONE 'UTC')::date,
            'received_by',     coalesce(v_actor ->> 'name', 'Cashier')
        )
    );

    RETURN public.receipt_issue(
        'cbu', c.id::text, c.member_id, c.capital_added,
        v_snapshot, v_actor_id, coalesce(v_actor ->> 'role', 'cashier'), v_at
    );
END;
$$;

-- 3. Trigger ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receipt_trg_capital_build_up()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        PERFORM public.receipt_issue_cbu(NEW.id);
    EXCEPTION WHEN others THEN
        INSERT INTO public.receipt_issue_errors (source_type, source_id, error)
        VALUES ('cbu', NEW.id::text, SQLERRM);
    END;
    RETURN NEW;
END;
$$;

-- AFTER INSERT, so the row already carries the cbu_deposit_id that
-- trg_set_cbu_deposit_id assigns.
DROP TRIGGER IF EXISTS trg_receipt_capital_build_up ON public.capital_build_up;
CREATE TRIGGER trg_receipt_capital_build_up
AFTER INSERT ON public.capital_build_up
FOR EACH ROW
WHEN (public.receipt_is_cbu_deposit(NEW.deposit_account, NEW.capital_added, NEW.source_loan_id,
                                     NEW.source_payment_id, NEW.source_isc_id, NEW.source_backfill_id))
EXECUTE FUNCTION public.receipt_trg_capital_build_up();

-- 4. Catch-up ---------------------------------------------------------------------
-- Conservative on purpose: past deposits get a receipt only if the audit log
-- shows they were recorded through the system (an audit_log 'cbu' row exists).
-- Deposits with no audit row may be imported history, so they are skipped;
-- the Step 6a check counts them separately.
CREATE OR REPLACE FUNCTION public.receipts_backfill_cbu()
RETURNS TABLE (source_type text, checked int, issued int, failed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r        record;
    v_no     text;
    v_check  int := 0;
    v_issued int := 0;
    v_failed int := 0;
BEGIN
    FOR r IN
        SELECT c.id, a.actor_user_id, a.occurred_at
        FROM public.capital_build_up c
        JOIN LATERAL (
            SELECT al.actor_user_id, al.occurred_at
            FROM public.audit_log al
            WHERE al.entity_type = 'cbu' AND al.action = 'record'
              AND al.entity_id IN (c.cbu_deposit_id, c.id::text)
            ORDER BY al.occurred_at
            LIMIT 1
        ) a ON true
        WHERE public.receipt_is_cbu_deposit(c.deposit_account, c.capital_added, c.source_loan_id,
                                            c.source_payment_id, c.source_isc_id, c.source_backfill_id)
          AND NOT EXISTS (SELECT 1 FROM public.receipts rc
                          WHERE rc.source_type = 'cbu' AND rc.source_id = c.id::text)
        ORDER BY c.transaction_date, c.cbu_deposit_id
    LOOP
        v_check := v_check + 1;
        BEGIN
            v_no := public.receipt_issue_cbu(r.id, r.actor_user_id, r.occurred_at);
            IF v_no IS NOT NULL THEN v_issued := v_issued + 1; END IF;
        EXCEPTION WHEN others THEN
            v_failed := v_failed + 1;
            INSERT INTO public.receipt_issue_errors (source_type, source_id, error)
            VALUES ('cbu', r.id::text, 'backfill: ' || SQLERRM);
        END;
    END LOOP;
    source_type := 'cbu'; checked := v_check; issued := v_issued; failed := v_failed;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.receipt_issue_cbu(uuid, uuid, timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipts_backfill_cbu()      FROM public, anon, authenticated;

COMMIT;

-- Then run (separately):
--   SELECT * FROM public.receipts_backfill_cbu();
