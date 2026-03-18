-- Bookkeeper -> Manager review schema update
-- Target: PostgreSQL (Supabase) + MySQL 8+
-- Purpose:
-- 1) Store immutable Bookkeeper internal notes
-- 2) Track review timestamps
-- 3) Keep transition status as: recommended for approval

/* -------------------------------------------------------------------------
   POSTGRESQL (Supabase)
   ------------------------------------------------------------------------- */

BEGIN;

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS bookkeeper_internal_remarks TEXT,
  ADD COLUMN IF NOT EXISTS bookkeeper_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manager_review_requested_at TIMESTAMPTZ;

ALTER TABLE public.koica_loans
  ADD COLUMN IF NOT EXISTS bookkeeper_internal_remarks TEXT,
  ADD COLUMN IF NOT EXISTS bookkeeper_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manager_review_requested_at TIMESTAMPTZ;

-- Ensure status checks allow draft and recommended-for-approval queue handoff.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.loans'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%loan_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.loans DROP CONSTRAINT %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.loans
  ADD CONSTRAINT loans_loan_status_chk
  CHECK (
    lower(coalesce(loan_status, '')) IN (
      'draft',
      'pending',
      'recommended for approval',
      'approved',
      'rejected',
      'cancelled',
      'released',
      'to be disbursed'
    )
  );

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.koica_loans'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%loan_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.koica_loans DROP CONSTRAINT %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.koica_loans
  ADD CONSTRAINT koica_loans_loan_status_chk
  CHECK (
    lower(coalesce(loan_status, '')) IN (
      'draft',
      'pending',
      'recommended for approval',
      'approved',
      'rejected',
      'cancelled',
      'released',
      'to be disbursed'
    )
  );

-- Trigger: manager can VIEW but cannot EDIT bookkeeper notes.
CREATE OR REPLACE FUNCTION public.prevent_manager_edit_bookkeeper_notes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Service role updates are allowed.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF to_regclass('public.member_account') IS NOT NULL THEN
    SELECT lower(btrim(coalesce(ma.role, '')))
    INTO v_role
    FROM public.member_account ma
    WHERE ma.user_id = auth.uid()
       OR lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
    LIMIT 1;
  END IF;

  IF v_role IS NULL AND to_regclass('public.member_accounts') IS NOT NULL THEN
    SELECT lower(btrim(coalesce(ma.role, '')))
    INTO v_role
    FROM public.member_accounts ma
    WHERE ma.user_id = auth.uid()
       OR lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
    LIMIT 1;
  END IF;

  v_role := coalesce(v_role, lower(btrim(coalesce(auth.jwt() ->> 'role', ''))));

  IF v_role = 'manager' THEN
    IF NEW.bookkeeper_internal_remarks IS DISTINCT FROM OLD.bookkeeper_internal_remarks
       OR NEW.bookkeeper_reviewed_at IS DISTINCT FROM OLD.bookkeeper_reviewed_at
       OR NEW.manager_review_requested_at IS DISTINCT FROM OLD.manager_review_requested_at THEN
      RAISE EXCEPTION 'Managers are not allowed to edit bookkeeper notes or review metadata.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_manager_edit_bookkeeper_notes_loans ON public.loans;
CREATE TRIGGER trg_prevent_manager_edit_bookkeeper_notes_loans
BEFORE UPDATE ON public.loans
FOR EACH ROW
EXECUTE FUNCTION public.prevent_manager_edit_bookkeeper_notes();

DROP TRIGGER IF EXISTS trg_prevent_manager_edit_bookkeeper_notes_koica_loans ON public.koica_loans;
CREATE TRIGGER trg_prevent_manager_edit_bookkeeper_notes_koica_loans
BEFORE UPDATE ON public.koica_loans
FOR EACH ROW
EXECUTE FUNCTION public.prevent_manager_edit_bookkeeper_notes();

CREATE INDEX IF NOT EXISTS idx_loans_manager_queue
  ON public.loans (loan_status, manager_review_requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_koica_loans_manager_queue
  ON public.koica_loans (loan_status, manager_review_requested_at DESC);

COMMIT;

/* -------------------------------------------------------------------------
   MYSQL 8+ (manual equivalent)
   Notes:
   - Run only on MySQL deployments (do NOT run this block on PostgreSQL).
   - UUID can be stored as CHAR(36) for compatibility.
   -------------------------------------------------------------------------

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS bookkeeper_internal_remarks TEXT NULL,
  ADD COLUMN IF NOT EXISTS bookkeeper_reviewed_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS manager_review_requested_at TIMESTAMP NULL;

ALTER TABLE koica_loans
  ADD COLUMN IF NOT EXISTS bookkeeper_internal_remarks TEXT NULL,
  ADD COLUMN IF NOT EXISTS bookkeeper_reviewed_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS manager_review_requested_at TIMESTAMP NULL;

CREATE INDEX idx_loans_manager_queue ON loans (loan_status, manager_review_requested_at);
CREATE INDEX idx_koica_loans_manager_queue ON koica_loans (loan_status, manager_review_requested_at);

-- Column-level immutability for manager in MySQL should be implemented via BEFORE UPDATE triggers
-- that check your app's session/role context strategy.
*/
