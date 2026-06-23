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
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.audit_write(
      'application',
      coalesce(NEW.membership_id, NEW.id::text),
      CASE lower(coalesce(NEW.status, ''))
        WHEN 'approved' THEN 'approve'
        WHEN 'rejected' THEN 'reject'
        ELSE 'update'
      END,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object(
        'membership_id', NEW.membership_id,
        'first_name', NEW.first_name,
        'last_name', coalesce(NEW.surname, NEW.last_name)
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
