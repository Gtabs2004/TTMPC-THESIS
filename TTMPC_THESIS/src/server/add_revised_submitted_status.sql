-- Revision logic update: member-resubmission status
-- See Simulation-findings-to-be-addressed.md discussion / revision-logic-update plan.
-- Run this once in the Supabase SQL editor. Additive only; safe to re-run.
--
-- Today a Manager "Revise" sets loan_status = 'revision_requested' and the loan
-- re-enters the Bookkeeper's queue for the Bookkeeper to edit on the member's
-- behalf. Under the new flow the MEMBER edits and resubmits the application
-- themselves; on resubmission the loan needs a status distinct from both the
-- original 'revision_requested' (still out with the member, Bookkeeper locked
-- to view-only) and plain 'pending' (so the Bookkeeper can tell at a glance
-- it's a resubmission, not a brand-new application). This adds that value
-- ('revised_submitted') to the loan_status/application_status CHECK
-- constraints on both public.loans and public.non_member_loans (renamed from
-- koica_loans by rename_koica_loans_to_non_member_loans.sql — this table may
-- not exist at all on a database that never had koica_loans, so each block
-- below is guarded with to_regclass and is a no-op if the table is missing), superseding
-- the same-named constraint most recently defined in
-- rescheduled_loans_and_vault_hardening.sql / the rename migration.

BEGIN;

DO $$
DECLARE
  rec record;
BEGIN
  IF to_regclass('public.loans') IS NULL THEN
    RETURN;
  END IF;
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
      'recommended for bod approval',
      'bod rejected',
      'approved',
      'revision_requested',
      'revised_submitted',
      'rejected',
      'cancelled',
      'released',
      'ready for disbursement',
      'to be disbursed',
      'pending rescheduling',
      'partially paid',
      'fully paid'
    )
  );

-- non_member_loans (the renamed koica_loans — see rename_koica_loans_to_non_member_loans.sql).
-- Guarded end-to-end with to_regclass: on a DB where the table doesn't exist
-- under either name, this whole block is a no-op instead of erroring.
DO $$
DECLARE
  rec record;
  target_table text;
BEGIN
  IF to_regclass('public.non_member_loans') IS NOT NULL THEN
    target_table := 'non_member_loans';
  ELSIF to_regclass('public.koica_loans') IS NOT NULL THEN
    target_table := 'koica_loans';
  ELSE
    RETURN;
  END IF;

  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = ('public.' || target_table)::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%loan_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', target_table, rec.conname);
  END LOOP;

  EXECUTE format(
    'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (
      lower(coalesce(loan_status, '''')) IN (
        ''draft'', ''pending'', ''recommended for approval'', ''recommended for bod approval'',
        ''bod rejected'', ''approved'', ''revision_requested'', ''revised_submitted'', ''rejected'',
        ''cancelled'', ''released'', ''ready for disbursement'', ''to be disbursed'',
        ''pending rescheduling'', ''partially paid'', ''fully paid''
      )
    )',
    target_table,
    target_table || '_loan_status_chk'
  );
END $$;

COMMIT;
