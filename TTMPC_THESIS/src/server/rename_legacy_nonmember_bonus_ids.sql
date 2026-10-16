-- ============================================================================
-- Rename legacy KOICA identifiers for non-member Bonus loans
-- ============================================================================
-- The former non-member product used KOICA-prefixed control numbers and, in
-- some imports, a KOICA loan_type_code. These rows are non-member Bonus
-- loans, not KOICA/ABFF loans. New rows already use the NMBL prefix.
--
-- Run after rename_koica_loans_to_non_member_loans.sql and
-- nonmember_bonus_payments_schema.sql. Safe to run multiple times.
-- ============================================================================

BEGIN;

-- Legacy payment rows reference the control number. Make that relationship
-- update-safe before changing the parent identifiers.
DO $$
DECLARE
  fk_name text;
BEGIN
  IF to_regclass('public.non_member_loans') IS NULL
     OR to_regclass('public.nonmember_loan_payments') IS NULL THEN
    RETURN;
  END IF;

  SELECT c.conname
    INTO fk_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.nonmember_loan_payments'::regclass
    AND c.confrelid = 'public.non_member_loans'::regclass
    AND c.contype = 'f'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.nonmember_loan_payments DROP CONSTRAINT %I',
      fk_name
    );
    EXECUTE format(
      'ALTER TABLE public.nonmember_loan_payments
       ADD CONSTRAINT %I
       FOREIGN KEY (loan_id)
       REFERENCES public.non_member_loans(control_number)
       ON UPDATE CASCADE ON DELETE CASCADE',
      fk_name
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.non_member_loans') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.non_member_loans legacy
    WHERE legacy.control_number ILIKE 'KOICA-%'
      AND EXISTS (
        SELECT 1
        FROM public.non_member_loans newer
        WHERE newer.control_number = 'NMBL-' || substring(legacy.control_number FROM 7)
      )
  ) THEN
    RAISE EXCEPTION
      'Cannot rename legacy KOICA control numbers: an NMBL control number already exists';
  END IF;

  UPDATE public.non_member_loans
     SET loan_type_code = 'NONMEMBER_BONUS',
         control_number = CASE
           WHEN control_number ILIKE 'KOICA-%'
             THEN 'NMBL-' || substring(control_number FROM 7)
           ELSE control_number
         END
   WHERE control_number ILIKE 'KOICA-%'
      OR upper(coalesce(loan_type_code, '')) = 'KOICA';
END $$;

-- Older notifications used the retired source tag. Keep their links usable
-- after the control-number rename.
UPDATE public.loan_notifications
   SET loan_id = CASE
                   WHEN loan_id ILIKE 'KOICA-%'
                     THEN 'NMBL-' || substring(loan_id FROM 7)
                   ELSE loan_id
                 END,
       redirect_url = replace(redirect_url, '?source=koica', '?source=non_member')
 WHERE loan_id ILIKE 'KOICA-%'
    OR redirect_url LIKE '%source=koica%';

COMMIT;

-- Verify:
-- SELECT control_number, loan_type_code
-- FROM public.non_member_loans
-- WHERE control_number ILIKE 'KOICA-%' OR upper(coalesce(loan_type_code, '')) = 'KOICA';
