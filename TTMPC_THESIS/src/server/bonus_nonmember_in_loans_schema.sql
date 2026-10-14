-- =============================================================================
-- Non-member Bonus loans stored in `loans` (BONUS_LOAN_PLAN.md Step 8, D13-B)
-- =============================================================================
-- Today, non-member Bonus loans live in non_member_loans and have NO
-- disbursement or payment path at all (disburse_cashier_loan and
-- approve_bookkeeper_payment only ever read `loans`) — they dead-end at
-- Treasurer approval. Folding them into `loans` with member_id = NULL gives
-- them everything Steps 1-7 already built (disbursement, payment, penalty,
-- verification) for free, instead of a second parallel implementation.
--
-- Existing non_member_loans rows are NOT migrated — they stay as read-only
-- history (the PDF endpoint already supports source="non_member_loans").
-- Only new non-member Bonus applications go into `loans` from now on.
--
-- Safe to run multiple times.
-- =============================================================================

ALTER TABLE IF EXISTS public.loans
  ADD COLUMN IF NOT EXISTS applicant_full_name TEXT,
  ADD COLUMN IF NOT EXISTS applicant_credentials JSONB;

COMMENT ON COLUMN public.loans.applicant_full_name IS
  'Non-member applicant''s name, typed in by the Cashier at intake. Only set when member_id IS NULL.';
COMMENT ON COLUMN public.loans.applicant_credentials IS
  'Non-member applicant''s personal-data-sheet fields (surname, contact, employer, etc.), typed in by the Cashier. Only set when member_id IS NULL.';

-- Staff-only insert for non-member rows: member_id IS NULL and the loan type
-- is NONMEMBER_BONUS. Mirrors the existing Cashier-only insert policy that
-- was on non_member_loans (koica_loans_staff_submitted_by.sql).
DO $$
BEGIN
  IF to_regclass('public.loans') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "cashier insert nonmember bonus loans" ON loans';
    EXECUTE '
      CREATE POLICY "cashier insert nonmember bonus loans"
      ON loans
      FOR INSERT
      TO authenticated
      WITH CHECK (
        member_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.loan_types lt
          WHERE lt.id = loans.loan_type_id
            AND upper(coalesce(lt.code, '''')) = ''NONMEMBER_BONUS''
        )
        AND public.has_portal_role(auth.uid(), auth.email(), ARRAY[''cashier''])
      )
    ';
  END IF;
END $$;

-- Staff-only read for non-member rows: the existing "staff read all loans"
-- policy (loan_form_policies.sql) already covers manager/bod/bookkeeper/
-- treasurer/cashier for any loans row regardless of member_id, so no new
-- read policy is needed here.
