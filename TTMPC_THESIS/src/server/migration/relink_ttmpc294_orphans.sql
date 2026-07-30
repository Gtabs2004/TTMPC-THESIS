-- ============================================================================
-- Relink TTMPC-294 (HISTORICAL BORROWER, UNKNOWN) orphan loans to real members.
--
-- Investigation revealed TTMPC-294 held 45 legacy loans from 13 distinct
-- borrower names. After name matching (accounting for swapped-format names
-- like "Delfa Zaragosa," where the CSV put first-name first):
--
--   9 borrowers = 41 loans matched to real active members       (relink)
--   3 borrowers =  3 loans belong to ex-members not in DB        (ghost member)
--   1 borrower  =  1 loan  is placeholder "WITHDRAWN 11.26.2015" (stays on TTMPC-294)
--
-- After this SQL runs, TTMPC-294 should hold exactly 1 loan (the WITHDRAWN
-- placeholder). It is intentionally kept as the bucket for truly-unresolvable
-- historical loans.
--
-- Rollback: run the loans_member_id_backup_20260730 query from earlier
-- session to restore prior member_id values.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Part 1: Relink 41 loans to their real member records
-- ---------------------------------------------------------------------------

-- Delfa Zaragosa -> TTMPC-241 (6 loans)
UPDATE public.loans SET member_id = 'ca694000-25f1-46b6-9737-327758e7bafb'
WHERE control_number IN ('TTMPCL-764','TTMPCL-765','TTMPCL-766','TTMPCL-767','TTMPCL-768','TTMPCL-769');

-- Donna Villa -> TTMPC-240 (7 loans)
UPDATE public.loans SET member_id = '5ab9004d-0f27-4b67-adcd-ade73b2f5d3c'
WHERE control_number IN ('TTMPCL-757','TTMPCL-758','TTMPCL-759','TTMPCL-760','TTMPCL-761','TTMPCL-762','TTMPCL-763');

-- Ellen Vargas -> TTMPC-239 (4 loans)
UPDATE public.loans SET member_id = '5401bcbe-78bc-4b7b-b828-64417d25c5fe'
WHERE control_number IN ('TTMPCL-753','TTMPCL-754','TTMPCL-755','TTMPCL-756');

-- Lou Frances Gallego -> TTMPC-052 (2 loans)
UPDATE public.loans SET member_id = '6d4dd78f-3ffc-42f0-a331-c3b9e29c3e45'
WHERE control_number IN ('TTMPCL-184','TTMPCL-185');

-- Nenial Armie -> TTMPC-090 (4 loans)
UPDATE public.loans SET member_id = '73d46cc2-a755-4367-b26b-c60b5e0e54d9'
WHERE control_number IN ('TTMPCL-288','TTMPCL-289','TTMPCL-290','TTMPCL-291');

-- Rechelle Tacubay -> TTMPC-168 (6 loans)
UPDATE public.loans SET member_id = 'aad2e824-0548-4cac-951b-878b36cd75c5'
WHERE control_number IN ('TTMPCL-526','TTMPCL-527','TTMPCL-528','TTMPCL-529','TTMPCL-530','TTMPCL-531');

-- Rufina Seasol -> TTMPC-243 (1 loan)
UPDATE public.loans SET member_id = 'e7d4fa39-e0ef-4c13-9d43-1770be8d2c5f'
WHERE control_number IN ('TTMPCL-319');

-- Delos Santos Janice -> TTMPC-032 (1 loan)
UPDATE public.loans SET member_id = '5a3bb292-4793-4602-a9a0-0d13fa8efbc9'
WHERE control_number IN ('TTMPCL-131');

-- Medecinio (spelled Medicinio in DB), May Joy Catherine -> TTMPC-084 (10 loans)
UPDATE public.loans SET member_id = '16329787-916e-4de5-93a7-b064ae1481b0'
WHERE control_number IN ('TTMPCL-263','TTMPCL-264','TTMPCL-265','TTMPCL-266','TTMPCL-267','TTMPCL-268','TTMPCL-269','TTMPCL-270','TTMPCL-271','TTMPCL-272');

-- ---------------------------------------------------------------------------
-- Part 2: Create 3 ghost members for ex-borrowers not in the current roster.
-- Marked with is_bona_fide=false and termination_date=today so they don't
-- appear in active-member queries. membership_id prefix "EX-" makes them
-- easy to identify and filter out of Cashier / active portals.
-- ---------------------------------------------------------------------------

INSERT INTO public.member (id, membership_id, first_name, last_name, is_bona_fide, termination_date, membership_date, created_at)
VALUES
  (gen_random_uuid(), 'EX-001', 'DHEL',    'CASTOR',  false, CURRENT_DATE, CURRENT_DATE, NOW()),
  (gen_random_uuid(), 'EX-002', 'CLEA',    'TABAO',   false, CURRENT_DATE, CURRENT_DATE, NOW()),
  (gen_random_uuid(), 'EX-003', 'ROSALIA', 'TACADAO', false, CURRENT_DATE, CURRENT_DATE, NOW())
ON CONFLICT (membership_id) DO NOTHING;

-- Relink the 3 loans to the new ghost members.
UPDATE public.loans
   SET member_id = (SELECT id FROM public.member WHERE membership_id = 'EX-001')
 WHERE control_number = 'TTMPCL-108';

UPDATE public.loans
   SET member_id = (SELECT id FROM public.member WHERE membership_id = 'EX-002')
 WHERE control_number = 'TTMPCL-395';

UPDATE public.loans
   SET member_id = (SELECT id FROM public.member WHERE membership_id = 'EX-003')
 WHERE control_number = 'TTMPCL-466';

-- ---------------------------------------------------------------------------
-- Part 3: Verify the cleanup. TTMPC-294 should now hold only TTMPCL-745
-- (the "WITHDRAWN 11.26.2015 B" placeholder loan).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_orphan_id uuid;
  v_remaining int;
BEGIN
  SELECT id INTO v_orphan_id FROM public.member WHERE membership_id = 'TTMPC-294';
  SELECT COUNT(*) INTO v_remaining FROM public.loans WHERE member_id = v_orphan_id;
  RAISE NOTICE 'TTMPC-294 remaining loans: % (expected: 1 - the WITHDRAWN placeholder)', v_remaining;
END $$;

COMMIT;
