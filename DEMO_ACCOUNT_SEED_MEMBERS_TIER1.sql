-- Seed SQL for Tier 1 Members 1-11 (DEMO_ACCOUNT_PLAN.md)
-- Same pattern as DEMO_ACCOUNT_SEED_APPLICANTS.sql: inserts member_applications
-- rows only. Bypasses /membership_form, but NOT the approval pipeline — you
-- still walk each of these through PMES, Cashier payment, and BOD approval
-- LIVE in the system, same as a real applicant becoming a member. That live
-- approval is what creates the real Supabase Auth user + member row (via the
-- existing on_member_created trigger / confirm-membership flow) — nothing
-- here creates a login directly.
--
-- Names and loan-type scenarios are assigned per DEMO_ACCOUNT_PLAN.md's
-- "Tier 1 — Member 1-11 assignment" table. After you approve each one, tell
-- me which membership IDs/emails came out the other side and I'll continue
-- with the CBU/loan/payment seeding for that specific scenario (e.g. M6's
-- override-pending request, M18's unpaid-penalty loan) — those steps need
-- the real membership_id Supabase assigns on approval, which doesn't exist
-- until you've approved them.
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
-- M1: Ana L. Dela Cruz — New Consolidated <500k (medium risk)
('TTMPCAP-30011', 'Dela Cruz', 'Ana', 'L.', 'Female', 'Single',
 '1991-02-10', 35, 'Tubungan, Iloilo', 'Filipino', 'Roman Catholic', '159', '56',
 'O+', '611-222-333', 2, 'Brgy. Poblacion, Tubungan, Iloilo',
 '09171000011', 'romelyn.delosreyes@wvsu.edu.ph', 'Bachelor''s degree', 'Teacher', 'Teacher III',
 408000.00, 'N/A', true, 'pending',
 '6111222233', 'Leonardo Dela Cruz', 'Marissa Dela Cruz', 'Salary', 'DepEd Tubungan', '34000.00'),

-- M2: Ramon S. Villanueva — New Consolidated >500k (high risk, BOD route) + stacked active Emergency
('TTMPCAP-30012', 'Villanueva', 'Ramon', 'S.', 'Male', 'Single',
 '1982-07-19', 44, 'Iloilo City', 'Filipino', 'Roman Catholic', '173', '75',
 'A+', '622-333-444', 4, 'Brgy. Tabucan, Tubungan, Iloilo',
 '09171000012', 'dksxlynx112@gmail.com', 'Master''s units', 'Teacher', 'Master Teacher I',
 540000.00, 'N/A', true, 'pending',
 '6222333344', 'Simeon Villanueva', 'Adoracion Villanueva', 'Salary', 'DepEd Tubungan', '45000.00'),

-- M5: Grace D. Tolentino — Consolidated renewal (8/6 payments met)
('TTMPCAP-30015', 'Tolentino', 'Grace', 'D.', 'Female', 'Single',
 '1985-01-20', 41, 'Tubungan, Iloilo', 'Filipino', 'Roman Catholic', '157', '58',
 'B+', '633-444-555', 3, 'Brgy. Igbon, Tubungan, Iloilo',
 '09171000015', 'kirigayalynx@gmail.com', 'Bachelor''s degree', 'Teacher', 'Teacher III',
 432000.00, 'N/A', true, 'pending',
 '6333444455', 'Hernando Tolentino', 'Divina Tolentino', 'Salary', 'DepEd Tubungan', '36000.00'),

-- M6: Mark J. Salazar — Renewal blocked (3/6 payments), override request pending
('TTMPCAP-30016', 'Salazar', 'Mark', 'J.', 'Male', 'Single',
 '1989-05-14', 37, 'Guimbal, Iloilo', 'Filipino', 'Roman Catholic', '171', '69',
 'O+', '644-555-666', 2, 'Brgy. Cubay, Tubungan, Iloilo',
 '09171000016', 'lynxridao@gmail.com', 'Bachelor''s degree', 'Teacher', 'Teacher II',
 360000.00, 'N/A', true, 'pending',
 '6444555566', 'Joaquin Salazar', 'Remedios Salazar', 'Salary', 'DepEd Tubungan', '30000.00'),

-- M8: Dennis F. Paredes — Consolidated, revision requested by Manager
('TTMPCAP-30018', 'Paredes', 'Dennis', 'F.', 'Male', 'Single',
 '1984-02-13', 42, 'Tubungan, Iloilo', 'Filipino', 'Roman Catholic', '169', '72',
 'A+', '655-666-777', 3, 'Brgy. Buyo, Tubungan, Iloilo',
 '09171000018', 'gardecelso@gmail.com', 'Bachelor''s degree', 'Teacher', 'Teacher II',
 348000.00, 'N/A', true, 'pending',
 '6555666677', 'Federico Paredes', 'Imelda Paredes', 'Salary', 'DepEd Tubungan', '29000.00'),

-- M12: Noel V. Catalan — Payment = amortization
('TTMPCAP-30112', 'Catalan', 'Noel', 'V.', 'Male', 'Single',
 '1985-04-03', 41, 'Tubungan, Iloilo', 'Filipino', 'Roman Catholic', '170', '70',
 'O+', '666-777-888', 2, 'Brgy. Poblacion, Tubungan, Iloilo',
 '09171000112', 'mae.tabiolo@deped.gov.ph', 'Bachelor''s degree', 'Teacher', 'Teacher II',
 336000.00, 'N/A', true, 'pending',
 '6666777788', 'Vicente Catalan', 'Herminia Catalan', 'Salary', 'DepEd Tubungan', '28000.00'),

-- M13: Shiela A. Lopez — Payment < amortization (deficiency)
('TTMPCAP-30113', 'Lopez', 'Shiela', 'A.', 'Female', 'Single',
 '1985-04-03', 41, 'Tubungan, Iloilo', 'Filipino', 'Roman Catholic', '158', '53',
 'B+', '677-888-999', 2, 'Brgy. Tabucan, Tubungan, Iloilo',
 '09171000113', 'dondonquixote7@gmail.com', 'Bachelor''s degree', 'Teacher', 'Teacher II',
 336000.00, 'N/A', true, 'pending',
 '6777888899', 'Anselmo Lopez', 'Victoria Lopez', 'Salary', 'DepEd Tubungan', '28000.00'),

-- M14: Ricky D. Gallo — Payment > amortization (credit)
('TTMPCAP-30114', 'Gallo', 'Ricky', 'D.', 'Male', 'Single',
 '1985-04-03', 41, 'Tubungan, Iloilo', 'Filipino', 'Roman Catholic', '174', '74',
 'O+', '688-999-000', 1, 'Brgy. Igbon, Tubungan, Iloilo',
 '09171000114', 'gtabs2004@gmail.com', 'Bachelor''s degree', 'Teacher', 'Teacher II',
 336000.00, 'N/A', true, 'pending',
 '6888999900', 'Marcelo Gallo', 'Priscilla Gallo', 'Salary', 'DepEd Tubungan', '28000.00'),

-- M18: Edwin R. Bermejo — 5 months unpaid, 2% penalty
('TTMPCAP-30118', 'Bermejo', 'Edwin', 'R.', 'Male', 'Single',
 '1988-09-07', 38, 'Guimbal, Iloilo', 'Filipino', 'Roman Catholic', '172', '73',
 'A+', '699-000-111', 4, 'Brgy. Cubay, Tubungan, Iloilo',
 '09171000118', 'serevee7@gmail.com', 'Bachelor''s degree', 'Teacher', 'Teacher II',
 324000.00, 'N/A', true, 'pending',
 '6990001112', 'Agapito Bermejo', 'Veronica Bermejo', 'Salary', 'DepEd Tubungan', '27000.00'),

-- M3: Liza M. Gonzaga — Emergency loan, low risk
('TTMPCAP-30013', 'Gonzaga', 'Liza', 'M.', 'Female', 'Single',
 '1980-07-16', 46, 'Tubungan, Iloilo', 'Filipino', 'Roman Catholic', '156', '57',
 'B+', '600-111-222', 1, 'Brgy. Buyo, Tubungan, Iloilo',
 '09171000013', 'geroantoni.tabiolo@wvsu.edu.ph', 'Bachelor''s degree', 'Teacher', 'Teacher II',
 336000.00, 'N/A', true, 'pending',
 '6001112223', 'Domingo Gonzaga', 'Cristina Gonzaga', 'Salary', 'DepEd Tubungan', '28000.00'),

-- M4: Joel B. Castillo — Bonus loan, low risk
('TTMPCAP-30014', 'Castillo', 'Joel', 'B.', 'Male', 'Single',
 '1984-08-01', 42, 'Tubungan, Iloilo', 'Filipino', 'Roman Catholic', '171', '71',
 'O+', '611-222-444', 2, 'Brgy. Poblacion, Tubungan, Iloilo',
 '09171000014', 'jibozai2004@gmail.com', 'Bachelor''s degree', 'Teacher', 'Teacher III',
 372000.00, 'N/A', true, 'pending',
 '6112224445', 'Esteban Castillo', 'Lourdes Castillo', 'Salary', 'DepEd Tubungan', '31000.00');

-- Notes:
-- - annual_income is NOT NULL numeric — populated as monthly salary x 12 to
--   match what the form itself computes from the Monthly Salary field (see
--   DEMO_ACCOUNT_PLAN.md's Tier 1 table for the monthly figures this is
--   derived from).
-- - "Member since" dates from the Complete doc's roster (e.g. M1 2019-06-10)
--   are NOT reproduced here — they describe tenure as an already-long-time
--   member, which doesn't apply to someone being approved fresh today. Date
--   of birth is set so each person's age is plausible for their position;
--   adjust freely, it isn't load-bearing for any scenario.
-- - attendance_logs (PMES) is a separate table, same caveat as the applicant
--   seed file — do PMES scheduling/marking live.
-- - After you approve each of these 11 live (PMES -> Cashier payment -> BOD
--   confirm), send back the resulting membership IDs/emails so the CBU
--   balances, loan applications, and payment-history seeding for each
--   person's specific scenario (per DEMO_ACCOUNT_PLAN.md) can be written
--   against their real membership_id.
