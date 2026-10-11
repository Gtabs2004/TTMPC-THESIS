-- =============================================================================
-- Receipts — Part 3: catch-up for past transactions. See RECEIPT_SYSTEM_PLAN.md §6.2.
-- Run AFTER receipts_02_triggers.sql.
-- =============================================================================
-- receipts_backfill() issues receipts for completed transactions that were done
-- through the system and have none yet. Safe to run any number of times: a
-- transaction that already has a receipt is skipped.
--
-- Skipped on purpose:
--   * imported history: loan_payments_legacy, and system payments on loans
--     that have legacy history (none today — Step 0 check 03)
--   * releases with no disbursement_confirmations row (released before the
--     cashier release step existed, or imported — Step 0 check 07)
--
-- Covers loan payments and loan releases. Later steps add the other types.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.receipts_backfill()
RETURNS TABLE (source_type text, checked int, issued int, failed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r        record;
    v_before int;
    v_no     text;
    v_check  int;
    v_issued int;
    v_failed int;
BEGIN
    -- Loan payments ---------------------------------------------------------
    v_check := 0; v_issued := 0; v_failed := 0;
    FOR r IN
        SELECT p.id
        FROM public.loan_payments p
        WHERE lower(coalesce(p.confirmation_status, '')) IN ('validated', 'confirmed', 'bookkeeper_confirmed', 'approved')
          AND NOT EXISTS (SELECT 1 FROM public.loan_payments_legacy lp WHERE lp.loan_id = p.loan_id)
          AND NOT EXISTS (SELECT 1 FROM public.receipts rc
                          WHERE rc.source_type = 'loan_payment' AND rc.source_id = p.id::text)
        ORDER BY coalesce(p.confirmed_at, p.reviewed_at, p.payment_date), p.id
    LOOP
        v_check := v_check + 1;
        BEGIN
            v_no := public.receipt_issue_loan_payment(r.id);
            IF v_no IS NOT NULL THEN v_issued := v_issued + 1; END IF;
        EXCEPTION WHEN others THEN
            v_failed := v_failed + 1;
            INSERT INTO public.receipt_issue_errors (source_type, source_id, error)
            VALUES ('loan_payment', r.id::text, 'backfill: ' || SQLERRM);
        END;
    END LOOP;
    source_type := 'loan_payment'; checked := v_check; issued := v_issued; failed := v_failed;
    RETURN NEXT;

    -- Loan releases ---------------------------------------------------------
    v_check := 0; v_issued := 0; v_failed := 0;
    FOR r IN
        SELECT d.id
        FROM public.disbursement_confirmations d
        WHERE NOT EXISTS (SELECT 1 FROM public.receipts rc
                          WHERE rc.source_type = 'loan_release' AND rc.source_id = d.id::text)
        ORDER BY d.disbursed_at, d.id
    LOOP
        v_check := v_check + 1;
        BEGIN
            v_no := public.receipt_issue_loan_release(r.id);
            IF v_no IS NOT NULL THEN v_issued := v_issued + 1; END IF;
        EXCEPTION WHEN others THEN
            v_failed := v_failed + 1;
            INSERT INTO public.receipt_issue_errors (source_type, source_id, error)
            VALUES ('loan_release', r.id::text, 'backfill: ' || SQLERRM);
        END;
    END LOOP;
    source_type := 'loan_release'; checked := v_check; issued := v_issued; failed := v_failed;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.receipts_backfill() FROM public, anon, authenticated;

COMMIT;

-- Run it (separately, after the COMMIT above):
--   SELECT * FROM public.receipts_backfill();
