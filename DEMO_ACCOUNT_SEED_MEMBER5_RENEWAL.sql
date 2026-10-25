-- Seed SQL for Member5 -- Loan Application Renewal scenario.
-- Same pattern as DEMO_ACCOUNT_SEED_APPLICANTS.sql / DEMO_ACCOUNT_SEED_MEMBERS_TIER1.sql:
-- bypasses /membership_form (Applicant stage creates no Supabase Auth user,
-- plain member_applications insert, no trigger/PDF/email fires on insert).
--
-- You approve this live in the system (Secretary PMES -> Cashier payments ->
-- BOD "Confirm and Complete") -- that is what actually creates the real
-- member/member_account row + Supabase Auth login. Do NOT sql the approval
-- step itself.
--
-- After approval, note the resulting membership_id + member UUID and use
-- them in DEMO_LOAN_SEED_MEMBER5_RENEWAL.sql (the loan half of this
-- scenario) before requesting the renewal live in the system.

insert into public.member_applications (
  application_id, surname, first_name, middle_name, gender, civil_status,
  date_of_birth, age, place_of_birth, citizenship, religion, height, weight,
  blood_type, tin_number, number_of_dependents, permanent_address,
  contact_number, email, educational_attainment, occupation, position,
  annual_income, other_income, declaration_confirmed, application_status,
  gsis_number, father_name, mother_name, income_source, employer_name, salary
) values
('TTMPCAP-30006', 'Bulotaolo', 'Ashley', 'Nicole', 'Female', 'Single',
 '1994-02-15', 32, 'Tubungan, Iloilo', 'Filipino', 'Roman Catholic', '160', '56',
 'B+', '666-777-888', 0, 'Brgy. Tipacla, Tubungan, Iloilo',
 '09171000006', 'ashleynicole.bulotaolo0815@gmail.com', 'Bachelor''s degree', 'Teacher', 'Teacher II',
 333600.00, 'N/A', true, 'pending',
 '6666777788', 'Danilo Bulotaolo', 'Marites Bulotaolo', 'Salary', 'DepEd Tubungan', '27800.00');
