-- ============================================================================
-- VERIFY: confirm the 11 test accounts are fully gone. Read-only.
-- ============================================================================

-- 1) auth.users — should be 0 rows.
SELECT id, email FROM auth.users WHERE id IN (
  '632a2d7b-bf43-48c8-b71c-1f4d121158ed',
  '9d6ec1a6-ddcf-41d3-b4d9-e96bc6994b9e',
  'b3ab3448-0c45-4c9c-9024-c0ba96b793c3',
  'be1e5f88-04d7-45a8-aa45-d92d13f6f0c3',
  '3f38c77f-e867-415a-b35a-b9f226bf6d1a',
  '50a8c0f5-6253-46f5-8bd2-99f6682b3bb1',
  'cde1a326-7edd-4fb2-a958-8562054c7cc3',
  '3592a9eb-ea5e-45e7-8fa4-c03dd9e7d368',
  '0f068353-dc68-4def-9067-c81de277a93f',
  'e6570ddf-9338-48ee-8045-af19f410c165',
  'ee051661-17ee-43f4-a1ee-abe9a091cded'
);

-- 2) public.member — should be 0 rows.
SELECT id, membership_id, first_name, last_name FROM public.member
WHERE membership_id IN ('TTMPC-298','TTMPC-299','TTMPC-296','TTMPC-270','TTMPC-271','TTMPC-131','TTMPC-266','TTMPC-002','TTMPC-295');

-- 3) public.member_account — should be 0 rows.
SELECT user_id, membership_id, email FROM public.member_account
WHERE lower(email) IN (
  'bulotaoloashleynicole@gmail.com','dondonquixote7@gmail.com','ejhedteope@gmail.com',
  'erdenjhed.teope@wvsu.edu.ph','gtabs2004@gmail.com','jibozai2004@gmail.com',
  'kirigayalynx@gmail.com','lynxridao@gmail.com','nashervine.siaton@wvsu.edu.ph',
  'nashervinesiaton@gmail.com','sereevee7@gmail.com'
);

-- 4) public.loans — should be 0 rows.
SELECT control_number, member_id, user_email FROM public.loans
WHERE lower(user_email) IN (
  'bulotaoloashleynicole@gmail.com','dondonquixote7@gmail.com','ejhedteope@gmail.com',
  'erdenjhed.teope@wvsu.edu.ph','gtabs2004@gmail.com','jibozai2004@gmail.com',
  'kirigayalynx@gmail.com','lynxridao@gmail.com','nashervine.siaton@wvsu.edu.ph',
  'nashervinesiaton@gmail.com','sereevee7@gmail.com'
);

-- 5) public.member_applications — should be 0 rows.
SELECT application_id, email, membership_id FROM public.member_applications
WHERE lower(email) IN (
  'bulotaoloashleynicole@gmail.com','dondonquixote7@gmail.com','ejhedteope@gmail.com',
  'erdenjhed.teope@wvsu.edu.ph','gtabs2004@gmail.com','jibozai2004@gmail.com',
  'kirigayalynx@gmail.com','lynxridao@gmail.com','nashervine.siaton@wvsu.edu.ph',
  'nashervinesiaton@gmail.com','sereevee7@gmail.com'
);

-- 6) public.personal_data_sheet — should be 0 rows.
SELECT membership_number_id, email FROM public.personal_data_sheet
WHERE lower(email) IN (
  'bulotaoloashleynicole@gmail.com','dondonquixote7@gmail.com','ejhedteope@gmail.com',
  'erdenjhed.teope@wvsu.edu.ph','gtabs2004@gmail.com','jibozai2004@gmail.com',
  'kirigayalynx@gmail.com','lynxridao@gmail.com','nashervine.siaton@wvsu.edu.ph',
  'nashervinesiaton@gmail.com','sereevee7@gmail.com'
);

-- 7) public.receipts — EXPECTED to still show rows (intentionally not deleted,
-- immutable by design). Just confirming they're still there as expected.
SELECT count(*) AS receipts_left_in_place FROM public.receipts
WHERE member_id IN (
  SELECT id FROM public.member WHERE membership_id IN ('TTMPC-298','TTMPC-299','TTMPC-296','TTMPC-271','TTMPC-131','TTMPC-266','TTMPC-002')
);
