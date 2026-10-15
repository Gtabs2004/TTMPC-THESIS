-- ============================================================================
-- INVESTIGATE (v2): the first pass found a Savings_Transactions row for
-- TTMPC-295 ("Feitan Kirigaya Portor") but NO personal_data_sheet row with
-- that membership_number_id, member row, or member_account row. Yet the
-- trigger's DELETE FROM personal_data_sheet WHERE email = v_email hit a row
-- whose membership_number_id is TTMPC-295 and got blocked. This means a
-- personal_data_sheet row DOES exist with that membership_number_id but
-- something in query #3 of the last pass didn't match it (case sensitivity?
-- whitespace? wrong column name assumption). Re-check directly.
-- Read-only.
-- ============================================================================

-- 1) Case/whitespace-insensitive search for the membership_number_id.
SELECT membership_number_id, email, auth_user_id, pg_typeof(membership_number_id) AS col_type
FROM public.personal_data_sheet
WHERE btrim(upper(membership_number_id::text)) = 'TTMPC-295';

-- 2) Search personal_data_sheet by any email matching our 11 targets, to see
-- which membership_number_id each one actually carries (may differ from what
-- member/member_account show, if this row was never linked up).
SELECT pds.email, pds.membership_number_id, pds.auth_user_id
FROM public.personal_data_sheet pds
WHERE lower(pds.email) IN (
  'bulotaoloashleynicole@gmail.com','dondonquixote7@gmail.com','ejhedteope@gmail.com',
  'erdenjhed.teope@wvsu.edu.ph','gtabs2004@gmail.com','jibozai2004@gmail.com',
  'kirigayalynx@gmail.com','lynxridao@gmail.com','nashervine.siaton@wvsu.edu.ph',
  'nashervinesiaton@gmail.com','sereevee7@gmail.com'
);

-- 3) Full row, unfiltered, for any personal_data_sheet entry mentioning
-- "Kirigaya" or "Feitan" or "Portor" (columns are split surname/first_name/middle_name).
SELECT * FROM public.personal_data_sheet
WHERE surname ILIKE '%kirigaya%' OR surname ILIKE '%portor%'
   OR first_name ILIKE '%feitan%' OR middle_name ILIKE '%kirigaya%';
