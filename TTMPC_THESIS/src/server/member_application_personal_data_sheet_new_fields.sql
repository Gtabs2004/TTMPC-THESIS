-- Add newly requested membership fields to both member_applications and personal_data_sheet.
-- Safe to run multiple times.

BEGIN;

ALTER TABLE IF EXISTS public.member_applications
  ADD COLUMN IF NOT EXISTS gsis_number text,
  ADD COLUMN IF NOT EXISTS father_name text,
  ADD COLUMN IF NOT EXISTS mother_name text,
  ADD COLUMN IF NOT EXISTS income_source text,
  ADD COLUMN IF NOT EXISTS employer_name text,
  ADD COLUMN IF NOT EXISTS salary text;

ALTER TABLE IF EXISTS public.personal_data_sheet
  ADD COLUMN IF NOT EXISTS gsis_number text,
  ADD COLUMN IF NOT EXISTS father_name text,
  ADD COLUMN IF NOT EXISTS mother_name text,
  ADD COLUMN IF NOT EXISTS income_source text,
  ADD COLUMN IF NOT EXISTS employer_name text,
  ADD COLUMN IF NOT EXISTS salary text,
  ADD COLUMN IF NOT EXISTS annual_income text,
  ADD COLUMN IF NOT EXISTS other_income text;

-- Backfill PDS values from the latest application per membership_id when missing.
UPDATE public.personal_data_sheet pds
SET
  gsis_number = COALESCE(NULLIF(btrim(pds.gsis_number), ''), src.gsis_number),
  father_name = COALESCE(NULLIF(btrim(pds.father_name), ''), src.father_name),
  mother_name = COALESCE(NULLIF(btrim(pds.mother_name), ''), src.mother_name),
  income_source = COALESCE(NULLIF(btrim(pds.income_source), ''), src.income_source),
  employer_name = COALESCE(NULLIF(btrim(pds.employer_name), ''), src.employer_name),
  salary = COALESCE(NULLIF(btrim(pds.salary), ''), src.salary),
  annual_income = COALESCE(NULLIF(btrim(pds.annual_income), ''), src.annual_income),
  other_income = COALESCE(NULLIF(btrim(pds.other_income), ''), src.other_income)
FROM (
  SELECT DISTINCT ON (membership_id)
    membership_id,
    gsis_number::text AS gsis_number,
    father_name::text AS father_name,
    mother_name::text AS mother_name,
    income_source::text AS income_source,
    employer_name::text AS employer_name,
    salary::text AS salary,
    annual_income::text AS annual_income,
    other_income::text AS other_income,
    created_at
  FROM public.member_applications
  WHERE membership_id IS NOT NULL
  ORDER BY membership_id, created_at DESC
) src
WHERE pds.membership_number_id = src.membership_id;

COMMIT;
