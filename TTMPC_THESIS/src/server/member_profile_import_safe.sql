-- Safe import bridge for Members Profile workbook/CSV.
-- Goal:
-- 1) Stage raw rows from workbook CSV.
-- 2) Upsert into public.member, public.member_account, and public.personal_data_sheet.
-- 3) Skip rows that have no linked auth.users account and log them to unresolved table.
--
-- IMPORTANT:
-- - This script does NOT destroy existing processes.
-- - This script does NOT hard-delete existing production rows.
-- - This script will only write rows that can be mapped to auth.users.id.
--
-- Usage:
-- A. Import CSV into public.member_import_stage (Supabase Table Editor -> Import data).
-- B. Run this script.
-- C. Check public.member_import_unresolved and create missing auth accounts for those rows.
-- D. Re-run this script after fixing unresolved rows.
--
-- CRITICAL CSV FORMAT NOTE:
-- - Do NOT upload .xlsx directly to CSV import.
-- - The file must be plain text CSV (UTF-8), not a zipped Excel binary.
-- - If header looks like "PK..." then the wrong file was uploaded.
--
-- Expected CSV headers (case-insensitive mapping recommended):
-- member_uuid,membership_id,lastname,firstname,middlename,gender,civilstatus,dateofbirth,tin,address,occupation,datejoined,status,dependentcount,role,email

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.member_import_stage (
  member_uuid text,
  membership_id text,
  lastname text,
  firstname text,
  middlename text,
  gender text,
  civilstatus text,
  dateofbirth text,
  tin text,
  address text,
  occupation text,
  datejoined text,
  status text,
  dependentcount text,
  role text,
  email text,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.member_import_unresolved (
  unresolved_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_uuid text,
  membership_id text,
  email text,
  role text,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Rebuild unresolved report each run so it reflects current stage data.
TRUNCATE TABLE public.member_import_unresolved;

WITH source_rows AS (
  SELECT to_jsonb(s) AS j
  FROM public.member_import_stage s
), normalized AS (
  SELECT
    COALESCE(j->>'member_uuid', j->>'Member_UUID') AS member_uuid,
    COALESCE(j->>'membership_id', j->>'Membership_ID') AS membership_id,
    COALESCE(j->>'lastname', j->>'LastName') AS lastname,
    COALESCE(j->>'firstname', j->>'FirstName') AS firstname,
    COALESCE(j->>'middlename', j->>'MiddleName') AS middlename,
    COALESCE(j->>'gender', j->>'Gender') AS gender,
    COALESCE(j->>'civilstatus', j->>'CivilStatus') AS civilstatus,
    COALESCE(j->>'dateofbirth', j->>'DateOfBirth') AS dateofbirth,
    COALESCE(j->>'tin', j->>'TIN') AS tin,
    COALESCE(j->>'address', j->>'Address') AS address,
    COALESCE(j->>'occupation', j->>'Occupation') AS occupation,
    COALESCE(j->>'datejoined', j->>'DateJoined') AS datejoined,
    COALESCE(j->>'status', j->>'Status') AS status,
    COALESCE(j->>'dependentcount', j->>'DependentCount') AS dependentcount,
    COALESCE(j->>'role', j->>'Role') AS role,
    lower(nullif(btrim(COALESCE(j->>'email', j->>'Email')), '')) AS email,
    CASE
      WHEN upper(nullif(btrim(COALESCE(j->>'membership_id', j->>'Membership_ID')), '')) ~ '^TTMPC[-_][0-9]+$'
        THEN 'TTMPCM_' || lpad(regexp_replace(upper(btrim(COALESCE(j->>'membership_id', j->>'Membership_ID'))), '^TTMPC[-_]?', ''), 3, '0')
      WHEN upper(nullif(btrim(COALESCE(j->>'membership_id', j->>'Membership_ID')), '')) ~ '^TTMPCM[-_][0-9]+$'
        THEN 'TTMPCM_' || lpad(regexp_replace(upper(btrim(COALESCE(j->>'membership_id', j->>'Membership_ID'))), '^TTMPCM[-_]?', ''), 3, '0')
      ELSE upper(nullif(btrim(COALESCE(j->>'membership_id', j->>'Membership_ID')), ''))
    END AS membership_id_norm,
    CASE
      WHEN lower(coalesce(btrim(COALESCE(j->>'role', j->>'Role')), '')) = 'bod' THEN 'BOD'
      WHEN lower(coalesce(btrim(COALESCE(j->>'role', j->>'Role')), '')) = 'manager' THEN 'Manager'
      WHEN lower(coalesce(btrim(COALESCE(j->>'role', j->>'Role')), '')) = 'bookkeeper' THEN 'Bookkeeper'
      WHEN lower(coalesce(btrim(COALESCE(j->>'role', j->>'Role')), '')) = 'cashier' THEN 'Cashier'
      WHEN lower(coalesce(btrim(COALESCE(j->>'role', j->>'Role')), '')) = 'secretary' THEN 'Secretary'
      WHEN lower(coalesce(btrim(COALESCE(j->>'role', j->>'Role')), '')) = 'treasurer' THEN 'Treasurer'
      ELSE 'Member'
    END AS role_norm,
    CASE
      WHEN coalesce(btrim(COALESCE(j->>'datejoined', j->>'DateJoined')), '') ~ '^[0-9]+(\\.[0-9]+)?$'
        THEN (date '1899-12-30' + floor((btrim(COALESCE(j->>'datejoined', j->>'DateJoined')) )::numeric)::int)::date
      WHEN coalesce(btrim(COALESCE(j->>'datejoined', j->>'DateJoined')), '') ~ '^\\d{4}-\\d{2}-\\d{2}$'
        THEN (btrim(COALESCE(j->>'datejoined', j->>'DateJoined')) )::date
      ELSE CURRENT_DATE
    END AS membership_date_norm,
    CASE
      WHEN coalesce(btrim(COALESCE(j->>'dateofbirth', j->>'DateOfBirth')), '') ~ '^[0-9]+(\\.[0-9]+)?$'
        THEN to_char((date '1899-12-30' + floor((btrim(COALESCE(j->>'dateofbirth', j->>'DateOfBirth')) )::numeric)::int)::date, 'YYYY-MM-DD')
      WHEN coalesce(btrim(COALESCE(j->>'dateofbirth', j->>'DateOfBirth')), '') ~ '^\\d{4}-\\d{2}-\\d{2}$'
        THEN btrim(COALESCE(j->>'dateofbirth', j->>'DateOfBirth'))
      ELSE nullif(btrim(COALESCE(j->>'dateofbirth', j->>'DateOfBirth')), '')
    END AS dob_text_norm,
    CASE
      WHEN coalesce(btrim(COALESCE(j->>'dependentcount', j->>'DependentCount')), '') ~ '^-?\\d+$' THEN (btrim(COALESCE(j->>'dependentcount', j->>'DependentCount')) )::bigint
      ELSE NULL
    END AS dependent_count_norm,
    CASE
      WHEN coalesce(btrim(COALESCE(j->>'member_uuid', j->>'Member_UUID')), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (btrim(COALESCE(j->>'member_uuid', j->>'Member_UUID')) )::uuid
      ELSE NULL
    END AS member_uuid_as_uuid
  FROM source_rows
), resolved AS (
  SELECT
    n.*,
    COALESCE(u_by_id.id, u_by_email.id) AS resolved_user_id
  FROM normalized n
  LEFT JOIN auth.users u_by_id ON u_by_id.id = n.member_uuid_as_uuid
  LEFT JOIN auth.users u_by_email ON n.email IS NOT NULL AND lower(u_by_email.email) = n.email
), unresolved AS (
  INSERT INTO public.member_import_unresolved (member_uuid, membership_id, email, role, reason)
  SELECT
    r.member_uuid,
    r.membership_id,
    r.email,
    r.role,
    CASE
      WHEN r.email IS NULL THEN 'No email provided and member_uuid is not a valid existing auth.users UUID.'
      ELSE 'No matching auth.users account found for email/member_uuid.'
    END AS reason
  FROM resolved r
  WHERE r.resolved_user_id IS NULL
  RETURNING 1
), upsert_member AS (
  INSERT INTO public.member (
    id,
    membership_id,
    first_name,
    last_name,
    middle_initial,
    membership_date,
    is_bona_fide,
    created_at
  )
  SELECT
    r.resolved_user_id,
    r.membership_id_norm,
    nullif(btrim(r.firstname), ''),
    nullif(btrim(r.lastname), ''),
    left(nullif(btrim(r.middlename), ''), 1),
    r.membership_date_norm,
    true,
    now()
  FROM resolved r
  WHERE r.resolved_user_id IS NOT NULL
    AND r.membership_id_norm IS NOT NULL
  ON CONFLICT (id) DO UPDATE SET
    membership_id = EXCLUDED.membership_id,
    first_name = COALESCE(EXCLUDED.first_name, public.member.first_name),
    last_name = COALESCE(EXCLUDED.last_name, public.member.last_name),
    middle_initial = COALESCE(EXCLUDED.middle_initial, public.member.middle_initial),
    membership_date = COALESCE(EXCLUDED.membership_date, public.member.membership_date),
    is_bona_fide = EXCLUDED.is_bona_fide
  RETURNING id
), upsert_account AS (
  INSERT INTO public.member_account (
    user_id,
    email,
    role,
    is_temporary,
    created_at
  )
  SELECT
    r.resolved_user_id,
    COALESCE(r.email, lower(u.email)),
    r.role_norm,
    FALSE,
    now()
  FROM resolved r
  JOIN auth.users u ON u.id = r.resolved_user_id
  WHERE r.resolved_user_id IS NOT NULL
  ON CONFLICT (user_id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.member_account.email),
    role = COALESCE(EXCLUDED.role, public.member_account.role),
    is_temporary = COALESCE(EXCLUDED.is_temporary, public.member_account.is_temporary)
  RETURNING user_id
)
INSERT INTO public.personal_data_sheet (
  personal_data_sheet_id,
  membership_number_id,
  surname,
  first_name,
  middle_name,
  date_of_birth,
  gender,
  civil_status,
  tin_number,
  permanent_address,
  occupation,
  date_of_membership,
  number_of_dependents,
  email,
  created_at
)
SELECT
  'PDS-' || r.membership_id_norm,
  r.membership_id_norm,
  nullif(btrim(r.lastname), ''),
  nullif(btrim(r.firstname), ''),
  nullif(btrim(r.middlename), ''),
  r.dob_text_norm,
  nullif(btrim(r.gender), ''),
  nullif(btrim(r.civilstatus), ''),
  nullif(btrim(r.tin), ''),
  nullif(btrim(r.address), ''),
  nullif(btrim(r.occupation), ''),
  to_char(r.membership_date_norm, 'YYYY-MM-DD'),
  r.dependent_count_norm,
  r.email,
  now()
FROM resolved r
WHERE r.resolved_user_id IS NOT NULL
  AND r.membership_id_norm IS NOT NULL
ON CONFLICT (membership_number_id) DO UPDATE SET
  surname = COALESCE(EXCLUDED.surname, public.personal_data_sheet.surname),
  first_name = COALESCE(EXCLUDED.first_name, public.personal_data_sheet.first_name),
  middle_name = COALESCE(EXCLUDED.middle_name, public.personal_data_sheet.middle_name),
  date_of_birth = COALESCE(EXCLUDED.date_of_birth, public.personal_data_sheet.date_of_birth),
  gender = COALESCE(EXCLUDED.gender, public.personal_data_sheet.gender),
  civil_status = COALESCE(EXCLUDED.civil_status, public.personal_data_sheet.civil_status),
  tin_number = COALESCE(EXCLUDED.tin_number, public.personal_data_sheet.tin_number),
  permanent_address = COALESCE(EXCLUDED.permanent_address, public.personal_data_sheet.permanent_address),
  occupation = COALESCE(EXCLUDED.occupation, public.personal_data_sheet.occupation),
  date_of_membership = COALESCE(EXCLUDED.date_of_membership, public.personal_data_sheet.date_of_membership),
  number_of_dependents = COALESCE(EXCLUDED.number_of_dependents, public.personal_data_sheet.number_of_dependents),
  email = COALESCE(EXCLUDED.email, public.personal_data_sheet.email);

COMMIT;

-- Post-check queries:
-- SELECT count(*) AS staged_rows FROM public.member_import_stage;
-- SELECT count(*) AS unresolved_rows FROM public.member_import_unresolved;
-- SELECT * FROM public.member_import_unresolved ORDER BY created_at DESC;
--
-- Preflight sanity check for wrong file type after import:
-- SELECT member_uuid, membership_id, lastname
-- FROM public.member_import_stage
-- LIMIT 5;
--
-- If member_uuid contains values like "PK..." you imported an XLSX binary, not CSV.
