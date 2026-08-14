-- =============================================================================
-- Audit Log Triggers — meaningful state changes only
-- =============================================================================
-- Run this AFTER audit_log_schema.sql.
-- Each trigger watches one source table and writes one compact row when a
-- meaningful field changes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. loans
-- Meaningful: status change, loan_amount change, disbursal_date set,
--             bod_approval_payload set.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_trg_loans()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_name text := NULL;
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  v_action text := 'update';
  v_changed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      'loan',
      NEW.control_number,
      'create',
      NULL,
      jsonb_build_object(
        'loan_status', NEW.loan_status,
        'loan_amount', NEW.loan_amount,
        'loan_type_id', NEW.loan_type_id
      ),
      jsonb_build_object('control_number', NEW.control_number)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- status change
    IF NEW.loan_status IS DISTINCT FROM OLD.loan_status THEN
      v_before := v_before || jsonb_build_object('loan_status', OLD.loan_status);
      v_after  := v_after  || jsonb_build_object('loan_status', NEW.loan_status);
      v_changed := true;
      -- Pick a more specific action label when we can.
      v_action := CASE lower(coalesce(NEW.loan_status, ''))
        WHEN 'recommended for approval'      THEN 'recommend'
        WHEN 'recommended for bod approval'  THEN 'recommend'
        WHEN 'approved'                       THEN 'approve'
        WHEN 'bod rejected'                   THEN 'reject'
        WHEN 'rejected'                       THEN 'reject'
        WHEN 'revision_requested'             THEN 'revise'
        WHEN 'released'                       THEN 'disburse'
        WHEN 'to be disbursed'                THEN 'approve'
        ELSE 'update'
      END;
    END IF;

    -- amount change
    IF NEW.loan_amount IS DISTINCT FROM OLD.loan_amount THEN
      v_before := v_before || jsonb_build_object('loan_amount', OLD.loan_amount);
      v_after  := v_after  || jsonb_build_object('loan_amount', NEW.loan_amount);
      v_changed := true;
    END IF;

    -- first disbursal
    IF NEW.disbursal_date IS NOT NULL AND OLD.disbursal_date IS NULL THEN
      v_before := v_before || jsonb_build_object('disbursal_date', NULL);
      v_after  := v_after  || jsonb_build_object('disbursal_date', NEW.disbursal_date);
      v_changed := true;
      v_action := 'disburse';
    END IF;

    -- BOD payload recorded
    IF NEW.bod_approval_payload IS NOT NULL AND OLD.bod_approval_payload IS DISTINCT FROM NEW.bod_approval_payload THEN
      v_before := v_before || jsonb_build_object('bod_approval_payload', OLD.bod_approval_payload);
      v_after  := v_after  || jsonb_build_object('bod_approval_payload', NEW.bod_approval_payload);
      v_changed := true;
    END IF;

    IF v_changed THEN
      PERFORM public.audit_write(
        'loan',
        NEW.control_number,
        v_action,
        v_before,
        v_after,
        jsonb_build_object('control_number', NEW.control_number)
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_loans ON public.loans;
CREATE TRIGGER trg_audit_loans
AFTER INSERT OR UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.audit_trg_loans();

-- ---------------------------------------------------------------------------
-- 2. member_account
-- Meaningful: role change, is_active change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_trg_member_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  v_action text := 'update';
  v_changed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      v_before := v_before || jsonb_build_object('role', OLD.role);
      v_after  := v_after  || jsonb_build_object('role', NEW.role);
      v_changed := true;
      v_action := 'change_role';
    END IF;

    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      v_before := v_before || jsonb_build_object('is_active', OLD.is_active);
      v_after  := v_after  || jsonb_build_object('is_active', NEW.is_active);
      v_changed := true;
      IF v_action = 'update' THEN
        v_action := CASE WHEN NEW.is_active THEN 'reactivate' ELSE 'deactivate' END;
      END IF;
    END IF;

    IF v_changed THEN
      PERFORM public.audit_write(
        'account',
        coalesce(NEW.membership_id, NEW.user_id::text),
        v_action,
        v_before,
        v_after,
        jsonb_build_object(
          'membership_id', NEW.membership_id,
          'email', NEW.email
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_member_account ON public.member_account;
CREATE TRIGGER trg_audit_member_account
AFTER UPDATE ON public.member_account
FOR EACH ROW EXECUTE FUNCTION public.audit_trg_member_account();

-- ---------------------------------------------------------------------------
-- 3. staff_termination_requests
-- Meaningful: insert (Secretary files request), status change (BOD decides).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_trg_staff_termination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      'termination',
      NEW.id::text,
      'terminate',
      NULL,
      jsonb_build_object(
        'status', NEW.status,
        'previous_role', NEW.previous_role,
        'reason', NEW.reason
      ),
      jsonb_build_object(
        'member_id', NEW.member_id,
        'resolution_no', NEW.resolution_no
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.audit_write(
      'termination',
      NEW.id::text,
      CASE NEW.status
        WHEN 'approved' THEN 'approve'
        WHEN 'rejected' THEN 'reject'
        ELSE 'update'
      END,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object(
        'member_id', NEW.member_id,
        'resolution_no', NEW.resolution_no
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_staff_termination ON public.staff_termination_requests;
CREATE TRIGGER trg_audit_staff_termination
AFTER INSERT OR UPDATE ON public.staff_termination_requests
FOR EACH ROW EXECUTE FUNCTION public.audit_trg_staff_termination();

-- ---------------------------------------------------------------------------
-- 4. member_applications
-- Meaningful: status change (BOD approves/rejects new members).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_trg_member_applications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Column is named application_status in this schema, not status. Reading
  -- NEW.status here raised Postgres 42703 and rolled back the "Proceed to
  -- Training" update from the BOD Member Approvals flow.
  IF TG_OP = 'UPDATE'
     AND NEW.application_status IS DISTINCT FROM OLD.application_status THEN
    PERFORM public.audit_write(
      'application',
      coalesce(NEW.membership_id, NEW.application_id::text),
      CASE lower(coalesce(NEW.application_status, ''))
        WHEN 'approved' THEN 'approve'
        WHEN 'rejected' THEN 'reject'
        ELSE 'update'
      END,
      jsonb_build_object('status', OLD.application_status),
      jsonb_build_object('status', NEW.application_status),
      jsonb_build_object(
        'membership_id', NEW.membership_id,
        'first_name', NEW.first_name,
        'last_name', NEW.surname
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Guarded — only attach if the table exists in this DB.
DO $$
BEGIN
  IF to_regclass('public.member_applications') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_member_applications ON public.member_applications';
    EXECUTE 'CREATE TRIGGER trg_audit_member_applications
             AFTER UPDATE ON public.member_applications
             FOR EACH ROW EXECUTE FUNCTION public.audit_trg_member_applications()';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. loan_fee_policies
-- Meaningful: any fee/rate change or a new loan-type row inserted. Also
-- stamps updated_by/updated_at from the JWT so the actor is captured even
-- when the client forgets to pass it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_loan_fee_policy_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- auth.uid() is NULL for service-role / SQL-editor writes; only overwrite
  -- when we actually have a caller identity, so seed scripts don't get
  -- rejected.
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_loan_fee_policies_actor
    ON public.loan_fee_policies;

CREATE TRIGGER trg_stamp_loan_fee_policies_actor
BEFORE INSERT OR UPDATE ON public.loan_fee_policies
FOR EACH ROW EXECUTE FUNCTION public.stamp_loan_fee_policy_actor();

CREATE OR REPLACE FUNCTION public.audit_trg_loan_fee_policies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  v_changed boolean := false;
  v_action text := 'update';
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      'policy',
      NEW.loan_type_code,
      'create',
      NULL,
      jsonb_build_object(
        'service_fee_mode',         NEW.service_fee_mode,
        'service_fee_per_bracket',  NEW.service_fee_per_bracket,
        'service_fee_bracket_size', NEW.service_fee_bracket_size,
        'cbu_rate',                 NEW.cbu_rate,
        'insurance_per_thousand',   NEW.insurance_per_thousand,
        'notarial_fee',             NEW.notarial_fee
      ),
      jsonb_build_object(
        'loan_type_code', NEW.loan_type_code,
        'updated_by',     NEW.updated_by
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.service_fee_mode IS DISTINCT FROM OLD.service_fee_mode THEN
      v_before := v_before || jsonb_build_object('service_fee_mode', OLD.service_fee_mode);
      v_after  := v_after  || jsonb_build_object('service_fee_mode', NEW.service_fee_mode);
      v_changed := true;
    END IF;
    IF NEW.service_fee_per_bracket IS DISTINCT FROM OLD.service_fee_per_bracket THEN
      v_before := v_before || jsonb_build_object('service_fee_per_bracket', OLD.service_fee_per_bracket);
      v_after  := v_after  || jsonb_build_object('service_fee_per_bracket', NEW.service_fee_per_bracket);
      v_changed := true;
    END IF;
    IF NEW.service_fee_bracket_size IS DISTINCT FROM OLD.service_fee_bracket_size THEN
      v_before := v_before || jsonb_build_object('service_fee_bracket_size', OLD.service_fee_bracket_size);
      v_after  := v_after  || jsonb_build_object('service_fee_bracket_size', NEW.service_fee_bracket_size);
      v_changed := true;
    END IF;
    IF NEW.cbu_rate IS DISTINCT FROM OLD.cbu_rate THEN
      v_before := v_before || jsonb_build_object('cbu_rate', OLD.cbu_rate);
      v_after  := v_after  || jsonb_build_object('cbu_rate', NEW.cbu_rate);
      v_changed := true;
    END IF;
    IF NEW.insurance_per_thousand IS DISTINCT FROM OLD.insurance_per_thousand THEN
      v_before := v_before || jsonb_build_object('insurance_per_thousand', OLD.insurance_per_thousand);
      v_after  := v_after  || jsonb_build_object('insurance_per_thousand', NEW.insurance_per_thousand);
      v_changed := true;
    END IF;
    IF NEW.notarial_fee IS DISTINCT FROM OLD.notarial_fee THEN
      v_before := v_before || jsonb_build_object('notarial_fee', OLD.notarial_fee);
      v_after  := v_after  || jsonb_build_object('notarial_fee', NEW.notarial_fee);
      v_changed := true;
    END IF;

    IF v_changed THEN
      PERFORM public.audit_write(
        'policy',
        NEW.loan_type_code,
        v_action,
        v_before,
        v_after,
        jsonb_build_object(
          'loan_type_code', NEW.loan_type_code,
          'updated_by',     NEW.updated_by
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.loan_fee_policies') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_loan_fee_policies ON public.loan_fee_policies';
    EXECUTE 'CREATE TRIGGER trg_audit_loan_fee_policies
             AFTER INSERT OR UPDATE ON public.loan_fee_policies
             FOR EACH ROW EXECUTE FUNCTION public.audit_trg_loan_fee_policies()';
  END IF;
END $$;

-- Trigger functions are invoked by the trigger itself, never via REST. Revoke
-- the default PUBLIC EXECUTE grant so Supabase's linter stops flagging them as
-- anon-callable /rest/v1/rpc endpoints, and so a rogue client can't call them
-- directly to forge audit_log rows.
REVOKE EXECUTE ON FUNCTION public.audit_trg_loan_fee_policies()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_loan_fee_policy_actor()
    FROM PUBLIC, anon, authenticated;
