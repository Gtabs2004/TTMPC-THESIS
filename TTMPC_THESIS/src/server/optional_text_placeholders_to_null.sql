-- Optional text placeholder cleanup (safe/idempotent)
-- Purpose: Convert placeholder values like NA/N-A/none/null to real NULL
-- for optional text columns so members can fill them later in their POV.

BEGIN;

DO $$
DECLARE
  v_table TEXT;
  v_col TEXT;
  v_tables TEXT[] := ARRAY[
    'member_applications',
    'membership_application',
    'personal_data_sheet'
  ];
  v_columns TEXT[] := ARRAY[
    'spouse_name',
    'spouse_occupation',
    'spouse_employment_status',
    'spouse_date_of_birth',
    'maiden_name',
    'father_name',
    'mother_name',
    'other_income',
    'income_source',
    'employer_name',
    'position',
    'educational_attainment',
    'religion',
    'citizenship',
    'permanent_address',
    'occupation',
    'blood_type',
    'place_of_birth'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      CONTINUE;
    END IF;

    FOREACH v_col IN ARRAY v_columns LOOP
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = v_table
          AND column_name = v_col
          AND is_nullable = 'YES'
      ) THEN
        EXECUTE format(
          'UPDATE public.%I
           SET %I = NULL
           WHERE lower(btrim(coalesce(%I::text, ''''))) IN (
             ''na'', ''n/a'', ''none'', ''null'', ''-'', ''--'', ''tbd'', ''unknown'', ''not applicable''
           )',
          v_table,
          v_col,
          v_col
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
