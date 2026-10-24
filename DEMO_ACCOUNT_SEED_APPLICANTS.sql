-- Seed SQL for Applicants 1-5 (DEMO_ACCOUNT_PLAN.md)
-- Bypasses /membership_form — confirmed safe: the Applicant stage creates no
-- Supabase Auth user. member_applications is a plain table insert with no
-- password/login tied to it (login is only created at BOD approval, when the
-- row becomes a real member + member_account row). No trigger, no PDF, no
-- email fires on insert. application_id in the live app is just
-- 'TTMPCAP-' || floor(random() 4-5 digit) client-side — reproduced below.
--
-- Cashier payments (Applicant5) and BOD approval (all 5) stay LIVE, not
-- seeded — those are the steps the panel should watch happen in the real UI.
--
-- Run once; a second run hits the partial unique index on email in
-- member_applications_email_uniqueness.sql if any email already has a
-- non-rejected row.

insert into public.member_applications (
  application_id, surname, first_name, middle_name, gender, civil_status,
  date_of_birth, age, place_of_birth, citizenship, religion, height, weight,
  blood_type, tin_number, number_of_dependents, permanent_address,
  contact_number, email, educational_attainment, occupation, position,
  annual_income, other_income, declaration_confirmed, application_status,
  gsis_number, father_name, mother_name, income_source, employer_name, salary
) values
-- Applicant1: Carla M. Bautista — stays Pending, no attendance row yet
('TTMPCAP-30001', 'Bautista', 'Carla', 'M.', 'Female', 'Single',
 '1997-03-11', 29, 'Tubungan, Iloilo', 'Filipino', 'Roman Catholic', '158', '54',
 'O+', '111-222-333', 0, 'Brgy. Poblacion, Tubungan, Iloilo',
 '09171000001', 'hithott2@gmail.com', 'Bachelor''s degree', 'Teacher', 'Teacher I',
 294000.00, 'N/A', true, 'pending',
 '1111222233', 'Roberto Bautista', 'Elena Bautista', 'Salary', 'DepEd Tubungan', '24500.00'),

-- Applicant2: Paolo R. Espinosa — Approved for PMES (attendance row seeded separately, see note below)
('TTMPCAP-30002', 'Espinosa', 'Paolo', 'R.', 'Male', 'Single',
 '1995-08-22', 31, 'Iloilo City', 'Filipino', 'Roman Catholic', '170', '68',
 'A+', '222-333-444', 0, 'Brgy. Tabucan, Tubungan, Iloilo',
 '09171000002', 'kraksip@gmail.com', 'Bachelor''s degree', 'Teacher', 'Teacher I',
 294000.00, 'N/A', true, 'pending',
 '2222333344', 'Ramon Espinosa', 'Luz Espinosa', 'Salary', 'DepEd Tubungan', '24500.00'),

-- Applicant3: Joanna T. Lacson — missed first PMES, rescheduled (attendance rows seeded separately)
('TTMPCAP-30003', 'Lacson', 'Joanna', 'T.', 'Female', 'Single',
 '1998-11-02', 27, 'Tubungan, Iloilo', 'Filipino', 'Roman Catholic', '160', '55',
 'B+', '333-444-555', 0, 'Brgy. Igbon, Tubungan, Iloilo',
 '09171000003', 'diwondo1@gmail.com', 'Bachelor''s degree', 'Teacher', 'Teacher II',
 333600.00, 'N/A', true, 'pending',
 '3333444455', 'Teodoro Lacson', 'Rosario Lacson', 'Salary', 'DepEd Tubungan', '27800.00'),

-- Applicant4: Miguel A. Sorongon — TIN/GSIS left blank on purpose (seeds the BOD revision scenario)
('TTMPCAP-30004', 'Sorongon', 'Miguel', 'A.', 'Male', 'Single',
 '1996-05-17', 30, 'Guimbal, Iloilo', 'Filipino', 'Roman Catholic', '172', '70',
 'O+', '', 0, 'Brgy. Cubay, Tubungan, Iloilo',
 '09171000004', 'byarou030@gmail.com', 'Bachelor''s degree', 'Teacher', 'Teacher I',
 294000.00, 'N/A', true, 'pending',
 '', 'Ariston Sorongon', 'Fe Sorongon', 'Salary', 'DepEd Tubungan', '24500.00'),

-- Applicant5: Hazel P. Gumban — PMES Present (seed attendance row separately), payments stay live/Cashier
('TTMPCAP-30005', 'Gumban', 'Hazel', 'P.', 'Female', 'Single',
 '1993-09-29', 33, 'Tubungan, Iloilo', 'Filipino', 'Roman Catholic', '155', '50',
 'A+', '555-666-777', 0, 'Brgy. Buyo, Tubungan, Iloilo',
 '09171000005', 'dpurposes17@gmail.com', 'Bachelor''s degree', 'Teacher', 'Teacher III',
 374400.00, 'N/A', true, 'pending',
 '5555666677', 'Pablo Gumban', 'Corazon Gumban', 'Salary', 'DepEd Tubungan', '31200.00');

-- Notes:
-- - tin_number is NOT NULL in schema; Applicant4's row uses '' since the
--   column disallows NULL. Confirm the BOD page treats an empty string the
--   same as "missing" for its revision-reason flow before relying on it —
--   may need 'N/A' or a space instead of '' depending on how the page reads it.
-- - annual_income is NOT NULL numeric — populated as monthly salary x 12 to
--   match what the form itself computes from the Monthly Salary field.
-- - attendance_logs (referenced in the Complete doc for Applicant2/3/5) is a
--   SEPARATE table, not covered by this insert — seed those separately, or
--   do the Secretary/BOD PMES-marking steps live instead (recommended for
--   Applicant2 and Applicant5 either way, since those are live-demo steps
--   per the Complete doc's D-1/S-1 scenarios).
