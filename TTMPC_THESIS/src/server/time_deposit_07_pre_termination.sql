-- Time Deposit — pre-termination (member closes a certificate before
-- maturity "for a good reason"). Segregation of duties, mirroring ISC's
-- preparer/approver split (ISC_DIVIDEND_PLAN.md) and this project's existing
-- Cashier-requests / Bookkeeper-approves / Cashier-executes pattern
-- (loan_renewal_override_requests): Cashier requests -> Bookkeeper
-- approves/rejects -> Cashier executes the payout. Apply after
-- time_deposit_06_calendar_maturity.sql.
--
-- Payout formula is the step-down schedule from the reference engine
-- (services/time_deposit_engine.py: _step_down_rate / quote_pre_termination):
--   elapsed < 25% of term  -> 0% interest
--   25% - 50%              -> 0% interest (no savings interest rate exists
--                              in REGANT today -- the "min(savings_rate,
--                              contract_rate)" floor is held at 0 until that
--                              policy is confirmed; do not invent a rate)
--   50% - 75%               -> 50% of the contract rate
--   75% - 100%              -> 75% of the contract rate
-- Interest for the elapsed partial term uses Actual/365 (the same day-count
-- the placement preview already uses), never compounds, and is reduced by an
-- admin fee the Bookkeeper sets when approving. No withholding tax is applied
-- (tax policy is still unconfirmed project-wide -- see TD_LIFECYCLE_PLAN.md
-- D3). None of this touches savings/savings_accounts in any way.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.time_deposit_pretermination_requests (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    time_deposit_id      uuid NOT NULL REFERENCES public.time_deposits(id),
    reason               text NOT NULL,
    status               text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'executed')),
    elapsed_days         integer NOT NULL CHECK (elapsed_days >= 0),
    applied_rate         numeric(8,6) NOT NULL CHECK (applied_rate >= 0),
    adjusted_interest    numeric(14,2) NOT NULL CHECK (adjusted_interest >= 0),
    admin_fee            numeric(14,2),
    principal_payout     numeric(14,2),
    total_payout         numeric(14,2),
    requested_by         uuid,
    requested_at         timestamptz NOT NULL DEFAULT now(),
    decided_by           uuid,
    decided_at           timestamptz,
    decision_reason      text,
    executed_by          uuid,
    executed_at          timestamptz,
    CONSTRAINT td_preterm_one_pending_per_td
        EXCLUDE USING gist (time_deposit_id WITH =) WHERE (status = 'pending')
);

CREATE INDEX IF NOT EXISTS idx_td_preterm_time_deposit
    ON public.time_deposit_pretermination_requests (time_deposit_id, status);

ALTER TABLE public.time_deposit_pretermination_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.time_deposit_pretermination_requests FROM anon, authenticated;
GRANT ALL ON public.time_deposit_pretermination_requests TO service_role;


CREATE OR REPLACE FUNCTION public.td_request_pre_termination(
    p_time_deposit_id uuid,
    p_reason text,
    p_actor_user_id uuid,
    p_actor_email text
)
RETURNS TABLE (
    id uuid,
    time_deposit_id uuid,
    status text,
    elapsed_days integer,
    applied_rate numeric,
    adjusted_interest numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_td public.time_deposits%ROWTYPE;
    v_elapsed_ratio numeric;
    v_applied_rate numeric;
    v_adjusted_interest numeric;
    v_request_id uuid;
BEGIN
    IF NOT public.has_portal_role(p_actor_user_id, p_actor_email, ARRAY['cashier', 'bookkeeper']) THEN
        RAISE EXCEPTION 'Only a Cashier may request a Time Deposit pre-termination.';
    END IF;
    IF coalesce(trim(p_reason), '') = '' THEN
        RAISE EXCEPTION 'A reason is required to request pre-termination.';
    END IF;

    SELECT * INTO v_td
    FROM public.time_deposits
    WHERE time_deposits.id = p_time_deposit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Time Deposit certificate not found.';
    END IF;
    IF v_td.status <> 'locked' THEN
        RAISE EXCEPTION 'Only a certificate still within its term (status locked) can be pre-terminated.';
    END IF;

    DECLARE
        v_elapsed_days integer := current_date - v_td.placement_date;
    BEGIN
        IF v_elapsed_days < 0 OR v_elapsed_days >= v_td.term_days THEN
            RAISE EXCEPTION 'Pre-termination requires 0 <= elapsed days < term days; a matured certificate uses settlement instead.';
        END IF;

        v_elapsed_ratio := v_elapsed_days::numeric / v_td.term_days::numeric;
        v_applied_rate := CASE
            WHEN v_elapsed_ratio < 0.25 THEN 0
            WHEN v_elapsed_ratio < 0.50 THEN 0  -- see header note: savings-rate floor held at 0, unconfirmed
            WHEN v_elapsed_ratio < 0.75 THEN v_td.annual_rate * 0.50
            ELSE v_td.annual_rate * 0.75
        END;
        v_adjusted_interest := round(v_td.principal * v_applied_rate * v_elapsed_days / 365, 2);

        INSERT INTO public.time_deposit_pretermination_requests (
            time_deposit_id, reason, elapsed_days, applied_rate, adjusted_interest, requested_by
        ) VALUES (
            v_td.id, p_reason, v_elapsed_days, v_applied_rate, v_adjusted_interest, p_actor_user_id
        )
        RETURNING time_deposit_pretermination_requests.id INTO v_request_id;
    END;

    RETURN QUERY
    SELECT r.id, r.time_deposit_id, r.status, r.elapsed_days, r.applied_rate, r.adjusted_interest
    FROM public.time_deposit_pretermination_requests r
    WHERE r.id = v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.td_request_pre_termination(uuid, text, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.td_request_pre_termination(uuid, text, uuid, text) TO service_role;


CREATE OR REPLACE FUNCTION public.td_decide_pre_termination(
    p_request_id uuid,
    p_approve boolean,
    p_decision_reason text,
    p_admin_fee numeric,
    p_actor_user_id uuid,
    p_actor_email text
)
RETURNS TABLE (
    id uuid,
    status text,
    admin_fee numeric,
    principal_payout numeric,
    total_payout numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req public.time_deposit_pretermination_requests%ROWTYPE;
    v_td public.time_deposits%ROWTYPE;
    v_fee numeric;
    v_principal_payout numeric;
    v_total_payout numeric;
BEGIN
    -- The real guard is in the database, not the disabled button (ISC_DIVIDEND_PLAN.md S5.4 precedent).
    IF NOT public.has_portal_role(p_actor_user_id, p_actor_email, ARRAY['bookkeeper']) THEN
        RAISE EXCEPTION 'Only the Bookkeeper may approve or reject a Time Deposit pre-termination.';
    END IF;

    SELECT * INTO v_req
    FROM public.time_deposit_pretermination_requests
    WHERE time_deposit_pretermination_requests.id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pre-termination request not found.';
    END IF;
    IF v_req.status <> 'pending' THEN
        RAISE EXCEPTION 'This request has already been decided.';
    END IF;

    SELECT * INTO v_td FROM public.time_deposits WHERE time_deposits.id = v_req.time_deposit_id;

    IF p_approve THEN
        v_fee := round(coalesce(p_admin_fee, 0), 2);
        IF v_fee < 0 OR v_fee > v_td.principal THEN
            RAISE EXCEPTION 'admin_fee must be between 0 and the principal.';
        END IF;
        v_principal_payout := v_td.principal - v_fee;
        v_total_payout := v_principal_payout + v_req.adjusted_interest;

        UPDATE public.time_deposit_pretermination_requests
        SET status = 'approved', admin_fee = v_fee, principal_payout = v_principal_payout,
            total_payout = v_total_payout, decided_by = p_actor_user_id, decided_at = now(),
            decision_reason = p_decision_reason
        WHERE time_deposit_pretermination_requests.id = p_request_id;
    ELSE
        UPDATE public.time_deposit_pretermination_requests
        SET status = 'rejected', decided_by = p_actor_user_id, decided_at = now(),
            decision_reason = p_decision_reason
        WHERE time_deposit_pretermination_requests.id = p_request_id;
    END IF;

    RETURN QUERY
    SELECT r.id, r.status, r.admin_fee, r.principal_payout, r.total_payout
    FROM public.time_deposit_pretermination_requests r
    WHERE r.id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.td_decide_pre_termination(uuid, boolean, text, numeric, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.td_decide_pre_termination(uuid, boolean, text, numeric, uuid, text) TO service_role;


CREATE OR REPLACE FUNCTION public.td_execute_pre_termination(
    p_request_id uuid,
    p_actor_user_id uuid,
    p_actor_email text
)
RETURNS TABLE (
    id uuid,
    time_deposit_id uuid,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req public.time_deposit_pretermination_requests%ROWTYPE;
    v_td public.time_deposits%ROWTYPE;
BEGIN
    IF NOT public.has_portal_role(p_actor_user_id, p_actor_email, ARRAY['cashier', 'bookkeeper']) THEN
        RAISE EXCEPTION 'Only a Cashier may execute an approved pre-termination payout.';
    END IF;

    SELECT * INTO v_req
    FROM public.time_deposit_pretermination_requests
    WHERE time_deposit_pretermination_requests.id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pre-termination request not found.';
    END IF;
    IF v_req.status <> 'approved' THEN
        RAISE EXCEPTION 'Only an approved request can be executed.';
    END IF;

    SELECT * INTO v_td
    FROM public.time_deposits
    WHERE time_deposits.id = v_req.time_deposit_id
    FOR UPDATE;

    IF v_td.status <> 'locked' THEN
        RAISE EXCEPTION 'Certificate is no longer in a pre-terminable state.';
    END IF;

    IF v_req.adjusted_interest > 0 THEN
        INSERT INTO public.time_deposit_ledger (
            time_deposit_id, entry_type, amount, reference, idempotency_key, metadata, posted_by
        ) VALUES (
            v_td.id, 'interest_payout', v_req.adjusted_interest, v_td.certificate_number,
            v_req.id::text || ':preterm_interest',
            jsonb_build_object('kind', 'pre_termination_interest', 'member_id', v_td.member_id, 'request_id', v_req.id),
            p_actor_user_id
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    INSERT INTO public.time_deposit_ledger (
        time_deposit_id, entry_type, amount, reference, idempotency_key, metadata, posted_by
    ) VALUES (
        v_td.id, 'principal_payout', v_req.principal_payout, v_td.certificate_number,
        v_req.id::text || ':preterm_principal',
        jsonb_build_object(
            'kind', 'pre_termination_principal', 'member_id', v_td.member_id,
            'request_id', v_req.id, 'admin_fee', v_req.admin_fee
        ),
        p_actor_user_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    UPDATE public.time_deposits
    SET status = 'closed', updated_at = now(), settled_at = now()
    WHERE time_deposits.id = v_td.id
      AND status = 'locked';

    INSERT INTO public.time_deposit_status_history (
        time_deposit_id, old_status, new_status, reason, changed_by
    ) VALUES (
        v_td.id, 'locked', 'closed', 'Pre-terminated: ' || v_req.reason, p_actor_user_id
    );

    UPDATE public.time_deposit_pretermination_requests
    SET status = 'executed', executed_by = p_actor_user_id, executed_at = now()
    WHERE time_deposit_pretermination_requests.id = p_request_id;

    RETURN QUERY SELECT v_td.id, v_td.id, 'closed'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.td_execute_pre_termination(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.td_execute_pre_termination(uuid, uuid, text) TO service_role;

COMMIT;
