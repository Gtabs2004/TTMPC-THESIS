-- Relink loans.member_id + populate legacy_member_link bridge.
-- Source: name_match_auto.csv (188 borrowers, exact name match) and
--         name_match_fuzzy.csv (13 borrowers, user-confirmed same person).
--
-- Only updates loans whose control_number is in the auto/fuzzy CSVs.
-- Uses WHERE control_number IN (...) so the UPDATE is idempotent — running
-- twice is safe (second run just sets the same member_id again).
--
-- Rollback:
--   1. Restore prior member_id values from your Supabase backup.
--   2. DELETE FROM legacy_member_link WHERE confirmed_by IS NULL;

BEGIN;

-- auto: AMBACAN, ELIZABETH (2 loan(s)) -> member e074308d-58eb-4d7a-9297-28d71003f6cf
UPDATE public.loans SET member_id = 'e074308d-58eb-4d7a-9297-28d71003f6cf' WHERE control_number IN ('TTMPCL-001', 'TTMPCL-002');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('033ee878-b392-49cd-baf6-51035f98ca60', 'e074308d-58eb-4d7a-9297-28d71003f6cf', FALSE, 'auto match: AMBACAN, ELIZABETH') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: AMBACAN, ELYMHAR ANJOE (6 loan(s)) -> member d6591e17-bd74-4423-acdd-dfa01b0ff241
UPDATE public.loans SET member_id = 'd6591e17-bd74-4423-acdd-dfa01b0ff241' WHERE control_number IN ('TTMPCL-003', 'TTMPCL-004', 'TTMPCL-005', 'TTMPCL-006', 'TTMPCL-007', 'TTMPCL-008');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('fb4ddc32-7968-4ec6-a577-292721c22597', 'd6591e17-bd74-4423-acdd-dfa01b0ff241', FALSE, 'auto match: AMBACAN, ELYMHAR ANJOE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: AMORA, ARACELI (3 loan(s)) -> member a6716916-a6a0-4b2d-93db-4d3b93f20dba
UPDATE public.loans SET member_id = 'a6716916-a6a0-4b2d-93db-4d3b93f20dba' WHERE control_number IN ('TTMPCL-009', 'TTMPCL-010', 'TTMPCL-011');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('b4abca4f-83b9-49a2-9ad4-2febb12fb456', 'a6716916-a6a0-4b2d-93db-4d3b93f20dba', FALSE, 'auto match: AMORA, ARACELI') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: ARAÑA, FELY (4 loan(s)) -> member 68a8e641-42a8-4a55-b0ef-efd5c64b303c
UPDATE public.loans SET member_id = '68a8e641-42a8-4a55-b0ef-efd5c64b303c' WHERE control_number IN ('TTMPCL-012', 'TTMPCL-013', 'TTMPCL-014', 'TTMPCL-015');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('c3d1d7a7-e1d6-4225-a559-c361929eecb2', '68a8e641-42a8-4a55-b0ef-efd5c64b303c', FALSE, 'auto match: ARAÑA, FELY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: AUMENTADO, FREDZKIE (5 loan(s)) -> member 67afa221-aef5-44ca-9d0b-2c34378e8c20
UPDATE public.loans SET member_id = '67afa221-aef5-44ca-9d0b-2c34378e8c20' WHERE control_number IN ('TTMPCL-016', 'TTMPCL-017', 'TTMPCL-018', 'TTMPCL-019', 'TTMPCL-020');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('4743db6e-9a71-46f9-9b1c-f6acea49fc0b', '67afa221-aef5-44ca-9d0b-2c34378e8c20', FALSE, 'auto match: AUMENTADO, FREDZKIE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: BERBEGAL, ANNIE (3 loan(s)) -> member 34289d7d-5ddc-4f0d-8dfd-e1aa76647da8
UPDATE public.loans SET member_id = '34289d7d-5ddc-4f0d-8dfd-e1aa76647da8' WHERE control_number IN ('TTMPCL-021', 'TTMPCL-022', 'TTMPCL-023');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('79b3fc3a-ff89-4144-b673-d6a2e1dba1c0', '34289d7d-5ddc-4f0d-8dfd-e1aa76647da8', FALSE, 'auto match: BERBEGAL, ANNIE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: BORERO, MINERVA (6 loan(s)) -> member 96f4a99f-761f-43b1-8d24-7e2e299f55cb
UPDATE public.loans SET member_id = '96f4a99f-761f-43b1-8d24-7e2e299f55cb' WHERE control_number IN ('TTMPCL-024', 'TTMPCL-025', 'TTMPCL-026', 'TTMPCL-027', 'TTMPCL-028', 'TTMPCL-029');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('ff4ea4e4-cf0c-49cd-ab3c-54db25d8021d', '96f4a99f-761f-43b1-8d24-7e2e299f55cb', FALSE, 'auto match: BORERO, MINERVA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: BRAZA, MELANIE (2 loan(s)) -> member fa9f6fee-0de6-4322-8fc4-f44f2e4e1a6a
UPDATE public.loans SET member_id = 'fa9f6fee-0de6-4322-8fc4-f44f2e4e1a6a' WHERE control_number IN ('TTMPCL-030', 'TTMPCL-031');

-- auto: CA AYA, JIEZL (4 loan(s)) -> member 04e3170b-bdb5-48f5-b2ca-bee2f52df47d
UPDATE public.loans SET member_id = '04e3170b-bdb5-48f5-b2ca-bee2f52df47d' WHERE control_number IN ('TTMPCL-037', 'TTMPCL-038', 'TTMPCL-039', 'TTMPCL-040');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('065f0f44-8dad-4784-bc3b-02fd8a9c7a4d', '04e3170b-bdb5-48f5-b2ca-bee2f52df47d', FALSE, 'auto match: CA AYA, JIEZL') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CABALLERO, GERRY (3 loan(s)) -> member 6bdce4c8-fb3f-459a-874f-22352a3355fa
UPDATE public.loans SET member_id = '6bdce4c8-fb3f-459a-874f-22352a3355fa' WHERE control_number IN ('TTMPCL-041', 'TTMPCL-042', 'TTMPCL-043');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('2e9cbc1f-eca7-4ef2-8202-d2e94628228b', '6bdce4c8-fb3f-459a-874f-22352a3355fa', FALSE, 'auto match: CABALLERO, GERRY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CABALLERO, LOURDES (1 loan(s)) -> member 57726405-fa55-4b8d-adeb-0131fb3572a2
UPDATE public.loans SET member_id = '57726405-fa55-4b8d-adeb-0131fb3572a2' WHERE control_number IN ('TTMPCL-044');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('a0f09bf0-f113-4dff-8bf5-272cd286bfad', '57726405-fa55-4b8d-adeb-0131fb3572a2', FALSE, 'auto match: CABALLERO, LOURDES') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CABALLERO, LULOU (3 loan(s)) -> member 9ba0ccfa-22b3-46fa-9823-f9446894662c
UPDATE public.loans SET member_id = '9ba0ccfa-22b3-46fa-9823-f9446894662c' WHERE control_number IN ('TTMPCL-045', 'TTMPCL-046', 'TTMPCL-047');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('7e1422e9-4ad0-4a65-874f-695be2571a36', '9ba0ccfa-22b3-46fa-9823-f9446894662c', FALSE, 'auto match: CABALLERO, LULOU') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CABALLERO, MA MARITES (3 loan(s)) -> member 62d3afb2-4813-4cc0-bae1-be2393023f45
UPDATE public.loans SET member_id = '62d3afb2-4813-4cc0-bae1-be2393023f45' WHERE control_number IN ('TTMPCL-048', 'TTMPCL-049', 'TTMPCL-050');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('e68585a0-93c8-4ee7-9ca3-b43584b29321', '62d3afb2-4813-4cc0-bae1-be2393023f45', FALSE, 'auto match: CABALLERO, MA MARITES') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CABALUNA, JOAN ROSE (1 loan(s)) -> member 33a4e39f-91b8-4512-860b-45da740fe32b
UPDATE public.loans SET member_id = '33a4e39f-91b8-4512-860b-45da740fe32b' WHERE control_number IN ('TTMPCL-051');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('3ac4aead-7645-46cf-b7bf-3674a1309773', '33a4e39f-91b8-4512-860b-45da740fe32b', FALSE, 'auto match: CABALUNA, JOAN ROSE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CALAMCAMAN, GINA (6 loan(s)) -> member cbdfc337-4d34-46cb-b0d5-bb8768904e61
UPDATE public.loans SET member_id = 'cbdfc337-4d34-46cb-b0d5-bb8768904e61' WHERE control_number IN ('TTMPCL-052', 'TTMPCL-053', 'TTMPCL-054', 'TTMPCL-055', 'TTMPCL-056', 'TTMPCL-057');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('a14114da-d16a-478c-af88-f77ae29a6411', 'cbdfc337-4d34-46cb-b0d5-bb8768904e61', FALSE, 'auto match: CALAMCAMAN, GINA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CALAYCAY, VIOLETA (6 loan(s)) -> member 337d8f49-bd88-4ea0-95c2-8fa7d7faeffb
UPDATE public.loans SET member_id = '337d8f49-bd88-4ea0-95c2-8fa7d7faeffb' WHERE control_number IN ('TTMPCL-058', 'TTMPCL-059', 'TTMPCL-060', 'TTMPCL-061', 'TTMPCL-062', 'TTMPCL-063');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('bda457ec-ee6f-4fca-91e1-4a1e61d0635e', '337d8f49-bd88-4ea0-95c2-8fa7d7faeffb', FALSE, 'auto match: CALAYCAY, VIOLETA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CALOPEZ, JOVIE (6 loan(s)) -> member 91ceef6c-3721-4e3e-a335-29df9c66d78d
UPDATE public.loans SET member_id = '91ceef6c-3721-4e3e-a335-29df9c66d78d' WHERE control_number IN ('TTMPCL-064', 'TTMPCL-065', 'TTMPCL-066', 'TTMPCL-067', 'TTMPCL-068', 'TTMPCL-069');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('7afcd0f3-2d2f-48d8-9c34-6832d73c04e2', '91ceef6c-3721-4e3e-a335-29df9c66d78d', FALSE, 'auto match: CALOPEZ, JOVIE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CAMINCE, HAZEL CRIS (8 loan(s)) -> member 211cb540-68c7-4d2a-8586-279b8b883f69
UPDATE public.loans SET member_id = '211cb540-68c7-4d2a-8586-279b8b883f69' WHERE control_number IN ('TTMPCL-070', 'TTMPCL-071', 'TTMPCL-072', 'TTMPCL-073', 'TTMPCL-074', 'TTMPCL-075', 'TTMPCL-076', 'TTMPCL-077');

-- auto: CAMINIAN, REBECCA (1 loan(s)) -> member e52ba3de-f2c5-4af2-86ac-8c3b7c96e857
UPDATE public.loans SET member_id = 'e52ba3de-f2c5-4af2-86ac-8c3b7c96e857' WHERE control_number IN ('TTMPCL-078');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('9e7acdfa-085f-4a50-8403-ef276adcddb4', 'e52ba3de-f2c5-4af2-86ac-8c3b7c96e857', FALSE, 'auto match: CAMINIAN, REBECCA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CAMIRING, LIEZL (11 loan(s)) -> member 6594b0fe-07b3-4e51-80a6-2b37286b618b
UPDATE public.loans SET member_id = '6594b0fe-07b3-4e51-80a6-2b37286b618b' WHERE control_number IN ('TTMPCL-079', 'TTMPCL-080', 'TTMPCL-081', 'TTMPCL-082', 'TTMPCL-083', 'TTMPCL-084', 'TTMPCL-085', 'TTMPCL-086', 'TTMPCL-087', 'TTMPCL-088', 'TTMPCL-089');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('266b466e-729f-46ed-bbf8-0ba32ebfe910', '6594b0fe-07b3-4e51-80a6-2b37286b618b', FALSE, 'auto match: CAMIRING, LIEZL') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CAPARIDA, CECIL (7 loan(s)) -> member d9e907ee-28aa-4561-8234-6f6a2fa1cfc5
UPDATE public.loans SET member_id = 'd9e907ee-28aa-4561-8234-6f6a2fa1cfc5' WHERE control_number IN ('TTMPCL-090', 'TTMPCL-091', 'TTMPCL-092', 'TTMPCL-093', 'TTMPCL-094', 'TTMPCL-095', 'TTMPCL-096');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('032bd16f-4279-4c4f-aade-1bfe40b1fd70', 'd9e907ee-28aa-4561-8234-6f6a2fa1cfc5', FALSE, 'auto match: CAPARIDA, CECIL') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CAMIRING, CHERY JEAN (6 loan(s)) -> member de3aa065-bfa2-48e5-b0f6-fabd799e94f3
UPDATE public.loans SET member_id = 'de3aa065-bfa2-48e5-b0f6-fabd799e94f3' WHERE control_number IN ('TTMPCL-097', 'TTMPCL-098', 'TTMPCL-099', 'TTMPCL-100', 'TTMPCL-101', 'TTMPCL-102');

-- auto: CAMORAHAN, LEEAN (1 loan(s)) -> member af5e4bd4-613f-4169-8905-9e69d6d6881c
UPDATE public.loans SET member_id = 'af5e4bd4-613f-4169-8905-9e69d6d6881c' WHERE control_number IN ('TTMPCL-103');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('6e936d76-0703-4e50-8a85-f2825e5a2ecb', 'af5e4bd4-613f-4169-8905-9e69d6d6881c', FALSE, 'auto match: CAMORAHAN, LEEAN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CASTILLANO, WENDY (4 loan(s)) -> member 34eca428-1dc8-4f7c-89a7-33a89ea29809
UPDATE public.loans SET member_id = '34eca428-1dc8-4f7c-89a7-33a89ea29809' WHERE control_number IN ('TTMPCL-104', 'TTMPCL-105', 'TTMPCL-106', 'TTMPCL-107');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('8e37daa0-2c21-4a32-8dd0-b6628353c18e', '34eca428-1dc8-4f7c-89a7-33a89ea29809', FALSE, 'auto match: CASTILLANO, WENDY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CATANUS, GENOVEVA (2 loan(s)) -> member d3873f14-d324-49a4-b085-1f07b4e505a0
UPDATE public.loans SET member_id = 'd3873f14-d324-49a4-b085-1f07b4e505a0' WHERE control_number IN ('TTMPCL-109', 'TTMPCL-110');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('fcad473d-6ad9-4f10-b8c9-1f0381ec7567', 'd3873f14-d324-49a4-b085-1f07b4e505a0', FALSE, 'auto match: CATANUS, GENOVEVA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: CELDA, GLENDA RAE (7 loan(s)) -> member 9d689f00-986c-42a8-b549-f1de1c9f54e5
UPDATE public.loans SET member_id = '9d689f00-986c-42a8-b549-f1de1c9f54e5' WHERE control_number IN ('TTMPCL-111', 'TTMPCL-112', 'TTMPCL-113', 'TTMPCL-114', 'TTMPCL-115', 'TTMPCL-116', 'TTMPCL-117');

-- auto: DALISAY, JEANETTE (8 loan(s)) -> member 0acf501e-74cd-491a-a8ad-958bd9727441
UPDATE public.loans SET member_id = '0acf501e-74cd-491a-a8ad-958bd9727441' WHERE control_number IN ('TTMPCL-118', 'TTMPCL-119', 'TTMPCL-120', 'TTMPCL-121', 'TTMPCL-122', 'TTMPCL-123', 'TTMPCL-124', 'TTMPCL-125');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('893e2c6a-a56f-4182-95aa-8449c2f12a84', '0acf501e-74cd-491a-a8ad-958bd9727441', FALSE, 'auto match: DALISAY, JEANETTE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: DIZON, FATIMA (1 loan(s)) -> member c8249ac1-ba06-45ed-9931-5480b0839789
UPDATE public.loans SET member_id = 'c8249ac1-ba06-45ed-9931-5480b0839789' WHERE control_number IN ('TTMPCL-126');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('75bf720b-d502-44ef-bb6e-d7952357cbff', 'c8249ac1-ba06-45ed-9931-5480b0839789', FALSE, 'auto match: DIZON, FATIMA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: DE LEON, TEODORA (4 loan(s)) -> member b5601f66-39c9-40ff-8ef8-03906fdabd88
UPDATE public.loans SET member_id = 'b5601f66-39c9-40ff-8ef8-03906fdabd88' WHERE control_number IN ('TTMPCL-127', 'TTMPCL-128', 'TTMPCL-129', 'TTMPCL-130');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('b0e6fb60-97ed-4e50-b42a-602f7ef53c15', 'b5601f66-39c9-40ff-8ef8-03906fdabd88', FALSE, 'auto match: DE LEON, TEODORA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: DELOSO, MAY HAZEL (3 loan(s)) -> member bd104645-28b4-458a-a633-53b94f1e7769
UPDATE public.loans SET member_id = 'bd104645-28b4-458a-a633-53b94f1e7769' WHERE control_number IN ('TTMPCL-132', 'TTMPCL-133', 'TTMPCL-134');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('385941ba-8675-4742-84a8-013ad1334c5f', 'bd104645-28b4-458a-a633-53b94f1e7769', FALSE, 'auto match: DELOSO, MAY HAZEL') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: DUEÑAS, KARL DENNIS (3 loan(s)) -> member cee4a173-7d17-4aae-9648-e6c69e3da46f
UPDATE public.loans SET member_id = 'cee4a173-7d17-4aae-9648-e6c69e3da46f' WHERE control_number IN ('TTMPCL-135', 'TTMPCL-136', 'TTMPCL-137');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('8d8fc564-00b8-419a-8cd3-29ea7b537632', 'cee4a173-7d17-4aae-9648-e6c69e3da46f', FALSE, 'auto match: DUEÑAS, KARL DENNIS') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: ECHALAR, RICHARD (6 loan(s)) -> member 7c6aa1e7-6e6a-4fbe-bbd4-68c8d06e65e5
UPDATE public.loans SET member_id = '7c6aa1e7-6e6a-4fbe-bbd4-68c8d06e65e5' WHERE control_number IN ('TTMPCL-142', 'TTMPCL-143', 'TTMPCL-144', 'TTMPCL-145', 'TTMPCL-146', 'TTMPCL-147');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('7a424db9-98ab-41bb-bb34-2e55ba729be5', '7c6aa1e7-6e6a-4fbe-bbd4-68c8d06e65e5', FALSE, 'auto match: ECHALAR, RICHARD') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: EDER, EDELIA (4 loan(s)) -> member d4d7cd4f-6c0c-4ca4-9d0a-d0751ce950a5
UPDATE public.loans SET member_id = 'd4d7cd4f-6c0c-4ca4-9d0a-d0751ce950a5' WHERE control_number IN ('TTMPCL-148', 'TTMPCL-149', 'TTMPCL-150', 'TTMPCL-151');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('8a9ee954-5613-4ce6-bd85-7e90f31f3a46', 'd4d7cd4f-6c0c-4ca4-9d0a-d0751ce950a5', FALSE, 'auto match: EDER, EDELIA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: EDER, LANY (5 loan(s)) -> member 49c35d59-cad4-4ed5-91f1-5c892046d56c
UPDATE public.loans SET member_id = '49c35d59-cad4-4ed5-91f1-5c892046d56c' WHERE control_number IN ('TTMPCL-152', 'TTMPCL-153', 'TTMPCL-154', 'TTMPCL-155', 'TTMPCL-156');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('11516617-4861-4ed1-b57f-c01d58e92b2b', '49c35d59-cad4-4ed5-91f1-5c892046d56c', FALSE, 'auto match: EDER, LANY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: ELISAN, MARIA ROVELYN (1 loan(s)) -> member cdfae075-1b79-4d58-8661-7ab3a78d4e9f
UPDATE public.loans SET member_id = 'cdfae075-1b79-4d58-8661-7ab3a78d4e9f' WHERE control_number IN ('TTMPCL-157');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('4ea87486-2629-4443-98eb-e04c8277fd60', 'cdfae075-1b79-4d58-8661-7ab3a78d4e9f', FALSE, 'auto match: ELISAN, MARIA ROVELYN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: ESPAÑA, ARRA (6 loan(s)) -> member 73e4da6b-936a-4e09-9fc7-54d3497636c3
UPDATE public.loans SET member_id = '73e4da6b-936a-4e09-9fc7-54d3497636c3' WHERE control_number IN ('TTMPCL-158', 'TTMPCL-159', 'TTMPCL-160', 'TTMPCL-161', 'TTMPCL-162', 'TTMPCL-163');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('15285aa6-0bdd-4b67-9d20-e94b125ef31b', '73e4da6b-936a-4e09-9fc7-54d3497636c3', FALSE, 'auto match: ESPAÑA, ARRA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: ESTIMO, MARVE (3 loan(s)) -> member 07eca900-2e72-4a88-8d37-b39de8931a05
UPDATE public.loans SET member_id = '07eca900-2e72-4a88-8d37-b39de8931a05' WHERE control_number IN ('TTMPCL-164', 'TTMPCL-165', 'TTMPCL-166');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('5acd82c8-a334-4bf2-9d6a-1c687b0aa352', '07eca900-2e72-4a88-8d37-b39de8931a05', FALSE, 'auto match: ESTIMO, MARVE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: ESTOMO, MITCHELLE (4 loan(s)) -> member 97268a1d-453d-4bb9-8947-5ca6c0a8d827
UPDATE public.loans SET member_id = '97268a1d-453d-4bb9-8947-5ca6c0a8d827' WHERE control_number IN ('TTMPCL-167', 'TTMPCL-168', 'TTMPCL-169', 'TTMPCL-170');

-- auto: ESTOPIDO, MONSERAT (3 loan(s)) -> member 935c86c6-d9ee-4be2-89cc-2b0104dd44b0
UPDATE public.loans SET member_id = '935c86c6-d9ee-4be2-89cc-2b0104dd44b0' WHERE control_number IN ('TTMPCL-171', 'TTMPCL-172', 'TTMPCL-173');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('22ed9b4d-bc97-4f69-825b-58f62b9f0ea7', '935c86c6-d9ee-4be2-89cc-2b0104dd44b0', FALSE, 'auto match: ESTOPIDO, MONSERAT') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: FAILAGUTAN, ANITA (3 loan(s)) -> member c612c13a-6c37-48cb-bbe1-21fb73cee51c
UPDATE public.loans SET member_id = 'c612c13a-6c37-48cb-bbe1-21fb73cee51c' WHERE control_number IN ('TTMPCL-174', 'TTMPCL-175', 'TTMPCL-176');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('d5fc3b6c-963f-45a9-8d1f-fb16f033a335', 'c612c13a-6c37-48cb-bbe1-21fb73cee51c', FALSE, 'auto match: FAILAGUTAN, ANITA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: FAILAGUTAN, ULDARICO (2 loan(s)) -> member 22536340-c9b1-4ee6-9c16-45ff2dc7560a
UPDATE public.loans SET member_id = '22536340-c9b1-4ee6-9c16-45ff2dc7560a' WHERE control_number IN ('TTMPCL-177', 'TTMPCL-178');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('abe828ea-6e66-45aa-81a6-0f1775f56bf4', '22536340-c9b1-4ee6-9c16-45ff2dc7560a', FALSE, 'auto match: FAILAGUTAN, ULDARICO') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: FAJARDO, SHEENLY (1 loan(s)) -> member 29dfa6a4-d13c-4e14-ac68-929e19531fbc
UPDATE public.loans SET member_id = '29dfa6a4-d13c-4e14-ac68-929e19531fbc' WHERE control_number IN ('TTMPCL-179');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('e0d020e3-a392-4efd-b6ad-0e3fa14f7c2a', '29dfa6a4-d13c-4e14-ac68-929e19531fbc', FALSE, 'auto match: FAJARDO, SHEENLY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: FUERZA, JOSEFA (3 loan(s)) -> member 63f6a8aa-04f1-4cad-9ced-bb9de58d60e6
UPDATE public.loans SET member_id = '63f6a8aa-04f1-4cad-9ced-bb9de58d60e6' WHERE control_number IN ('TTMPCL-180', 'TTMPCL-181', 'TTMPCL-182');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('dddbd264-c8f0-43cc-ab14-17c8f13eaa49', '63f6a8aa-04f1-4cad-9ced-bb9de58d60e6', FALSE, 'auto match: FUERZA, JOSEFA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: GALLEGO, CELESTIAL NATIVIDAD (1 loan(s)) -> member 83f878ce-2e54-4203-acc6-ea4502134372
UPDATE public.loans SET member_id = '83f878ce-2e54-4203-acc6-ea4502134372' WHERE control_number IN ('TTMPCL-183');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('9e21ff0f-4ada-44c5-8a6d-6402500b3922', '83f878ce-2e54-4203-acc6-ea4502134372', FALSE, 'auto match: GALLEGO, CELESTIAL NATIVIDAD') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: GANGE, MA ELIZABETH (6 loan(s)) -> member 2757ed39-269b-48c7-bfb7-f34920cfd125
UPDATE public.loans SET member_id = '2757ed39-269b-48c7-bfb7-f34920cfd125' WHERE control_number IN ('TTMPCL-186', 'TTMPCL-187', 'TTMPCL-188', 'TTMPCL-189', 'TTMPCL-190', 'TTMPCL-191');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('3ca8d03d-1f6f-4915-a06c-40d5d08e285d', '2757ed39-269b-48c7-bfb7-f34920cfd125', FALSE, 'auto match: GANGE, MA ELIZABETH') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: GARCIA, FEBE ARCELIE (1 loan(s)) -> member 120d3ada-32dc-4d5d-87f4-5da317c1324c
UPDATE public.loans SET member_id = '120d3ada-32dc-4d5d-87f4-5da317c1324c' WHERE control_number IN ('TTMPCL-192');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('9a272d47-7eb6-4ad5-841a-6f2c3be64dde', '120d3ada-32dc-4d5d-87f4-5da317c1324c', FALSE, 'auto match: GARCIA, FEBE ARCELIE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: GARGARITANO, VICENTE JR (3 loan(s)) -> member e14b22fb-b698-46f5-94c8-79fff0c4bf23
UPDATE public.loans SET member_id = 'e14b22fb-b698-46f5-94c8-79fff0c4bf23' WHERE control_number IN ('TTMPCL-193', 'TTMPCL-194', 'TTMPCL-195');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('1328b9e8-a204-4b0e-86a6-9bc69ab53992', 'e14b22fb-b698-46f5-94c8-79fff0c4bf23', FALSE, 'auto match: GARGARITANO, VICENTE JR') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: GARINGALAO, ROMEO (3 loan(s)) -> member 995b7843-305d-493a-99c8-1c570031c4c0
UPDATE public.loans SET member_id = '995b7843-305d-493a-99c8-1c570031c4c0' WHERE control_number IN ('TTMPCL-196', 'TTMPCL-197', 'TTMPCL-198');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('82bc1691-0867-4da1-b729-92e753f05cc9', '995b7843-305d-493a-99c8-1c570031c4c0', FALSE, 'auto match: GARINGALAO, ROMEO') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: GAYATGAY, MARICEL (2 loan(s)) -> member b8425129-325d-4c36-b0b7-898c5f2397e6
UPDATE public.loans SET member_id = 'b8425129-325d-4c36-b0b7-898c5f2397e6' WHERE control_number IN ('TTMPCL-199', 'TTMPCL-200');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('1d11c8f4-93bf-4f6b-9474-d525f71de9c4', 'b8425129-325d-4c36-b0b7-898c5f2397e6', FALSE, 'auto match: GAYATGAY, MARICEL') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: GEALON, ARCELY (3 loan(s)) -> member 1d32f027-8671-4200-a650-8edc5b1fa533
UPDATE public.loans SET member_id = '1d32f027-8671-4200-a650-8edc5b1fa533' WHERE control_number IN ('TTMPCL-201', 'TTMPCL-202', 'TTMPCL-203');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('9af30c1f-9849-4c26-a257-64d2cfe98bd6', '1d32f027-8671-4200-a650-8edc5b1fa533', FALSE, 'auto match: GEALON, ARCELY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: GENTON, RUBY (7 loan(s)) -> member 59fc65f2-98c4-4526-9012-4c5be50a8efc
UPDATE public.loans SET member_id = '59fc65f2-98c4-4526-9012-4c5be50a8efc' WHERE control_number IN ('TTMPCL-209', 'TTMPCL-210', 'TTMPCL-211', 'TTMPCL-212', 'TTMPCL-213', 'TTMPCL-214', 'TTMPCL-215');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('26209387-5cde-4254-b860-dd6444e3a3a9', '59fc65f2-98c4-4526-9012-4c5be50a8efc', FALSE, 'auto match: GENTON, RUBY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: GERONGANI, ELZIE CHRISTIE (1 loan(s)) -> member bc6bfc65-0bcd-407d-819c-902ed49cce6c
UPDATE public.loans SET member_id = 'bc6bfc65-0bcd-407d-819c-902ed49cce6c' WHERE control_number IN ('TTMPCL-216');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('8298885e-0809-448d-a4da-b2cd31e54f61', 'bc6bfc65-0bcd-407d-819c-902ed49cce6c', FALSE, 'auto match: GERONGANI, ELZIE CHRISTIE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: GICO, IRISH KAY (2 loan(s)) -> member 3ec65fa1-1d3d-4a19-b9c4-e66d89c79e50
UPDATE public.loans SET member_id = '3ec65fa1-1d3d-4a19-b9c4-e66d89c79e50' WHERE control_number IN ('TTMPCL-217', 'TTMPCL-218');

-- auto: GOMEZ, HOPE JOY (2 loan(s)) -> member 82fca495-8381-45e2-b7ce-20b65fbe017b
UPDATE public.loans SET member_id = '82fca495-8381-45e2-b7ce-20b65fbe017b' WHERE control_number IN ('TTMPCL-222', 'TTMPCL-223');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('e2624c7d-e3a1-4e40-b11f-b52d17028f60', '82fca495-8381-45e2-b7ce-20b65fbe017b', FALSE, 'auto match: GOMEZ, HOPE JOY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: INDICO, ALEAN GRACE (7 loan(s)) -> member df3f158c-8c25-4e31-8c3f-72cc1ef494c5
UPDATE public.loans SET member_id = 'df3f158c-8c25-4e31-8c3f-72cc1ef494c5' WHERE control_number IN ('TTMPCL-224', 'TTMPCL-225', 'TTMPCL-226', 'TTMPCL-227', 'TTMPCL-228', 'TTMPCL-229', 'TTMPCL-230');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('bbf24a20-d878-4110-ba8e-9b8a21975c20', 'df3f158c-8c25-4e31-8c3f-72cc1ef494c5', FALSE, 'auto match: INDICO, ALEAN GRACE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: JALA, EVANGELINA (2 loan(s)) -> member ec6d943c-5c4b-4285-b665-9b3cdbd70ff5
UPDATE public.loans SET member_id = 'ec6d943c-5c4b-4285-b665-9b3cdbd70ff5' WHERE control_number IN ('TTMPCL-231', 'TTMPCL-232');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('8201afe8-3e56-4eb0-93a6-3e64d2415ef6', 'ec6d943c-5c4b-4285-b665-9b3cdbd70ff5', FALSE, 'auto match: JALA, EVANGELINA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: JAMILLO, ANNIE ROSE (1 loan(s)) -> member d91fabbc-8832-4fe2-8f2b-709a467af915
UPDATE public.loans SET member_id = 'd91fabbc-8832-4fe2-8f2b-709a467af915' WHERE control_number IN ('TTMPCL-233');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('6617f6e2-5cb7-4766-a2d8-17b794bfc8ee', 'd91fabbc-8832-4fe2-8f2b-709a467af915', FALSE, 'auto match: JAMILLO, ANNIE ROSE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: LAGUARDIA, SHARA MAE (3 loan(s)) -> member f7917218-e1aa-425b-88b2-cb0ba44fd398
UPDATE public.loans SET member_id = 'f7917218-e1aa-425b-88b2-cb0ba44fd398' WHERE control_number IN ('TTMPCL-234', 'TTMPCL-235', 'TTMPCL-236');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('73e46c70-62dc-4087-a8a6-139878e59ac9', 'f7917218-e1aa-425b-88b2-cb0ba44fd398', FALSE, 'auto match: LAGUARDIA, SHARA MAE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: LAMSIN, SHARMAGNE GAY (4 loan(s)) -> member 2e9e83cf-c141-459e-a5f2-fe41dfbe9397
UPDATE public.loans SET member_id = '2e9e83cf-c141-459e-a5f2-fe41dfbe9397' WHERE control_number IN ('TTMPCL-237', 'TTMPCL-238', 'TTMPCL-239', 'TTMPCL-240');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('e822b8a5-15c3-404b-ba21-f72ad7b2d8d7', '2e9e83cf-c141-459e-a5f2-fe41dfbe9397', FALSE, 'auto match: LAMSIN, SHARMAGNE GAY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: LATOZA, ROSA MARIA (6 loan(s)) -> member 0891facf-5f72-4189-afe4-61be9ac609e7
UPDATE public.loans SET member_id = '0891facf-5f72-4189-afe4-61be9ac609e7' WHERE control_number IN ('TTMPCL-241', 'TTMPCL-242', 'TTMPCL-243', 'TTMPCL-244', 'TTMPCL-245', 'TTMPCL-246');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('321ff9d8-0d5a-413e-b392-de1d30e0367b', '0891facf-5f72-4189-afe4-61be9ac609e7', FALSE, 'auto match: LATOZA, ROSA MARIA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: LLASO, KARREN (1 loan(s)) -> member aa95504a-c155-4a14-9edc-56337373de5c
UPDATE public.loans SET member_id = 'aa95504a-c155-4a14-9edc-56337373de5c' WHERE control_number IN ('TTMPCL-247');

-- auto: MACAYA, LIEZYL (3 loan(s)) -> member a5e1771f-7dd2-4205-b950-2acbfe78a16f
UPDATE public.loans SET member_id = 'a5e1771f-7dd2-4205-b950-2acbfe78a16f' WHERE control_number IN ('TTMPCL-248', 'TTMPCL-249', 'TTMPCL-250');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('628e55fe-7702-48cb-904c-a700e21e631f', 'a5e1771f-7dd2-4205-b950-2acbfe78a16f', FALSE, 'auto match: MACAYA, LIEZYL') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: LONQUINO, ANNABELLE (2 loan(s)) -> member 65227528-ffae-43a5-a514-3c830503f055
UPDATE public.loans SET member_id = '65227528-ffae-43a5-a514-3c830503f055' WHERE control_number IN ('TTMPCL-251', 'TTMPCL-252');

-- auto: MADRIDANO, MARICEL (3 loan(s)) -> member b32d88b2-3ef6-4b9c-a5bb-e17b8993b396
UPDATE public.loans SET member_id = 'b32d88b2-3ef6-4b9c-a5bb-e17b8993b396' WHERE control_number IN ('TTMPCL-253', 'TTMPCL-254', 'TTMPCL-255');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('5a6b02e3-6af6-4ed4-8ec7-f6a408fa54a9', 'b32d88b2-3ef6-4b9c-a5bb-e17b8993b396', FALSE, 'auto match: MADRIDANO, MARICEL') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: MALAGA, MA ANDELEN (6 loan(s)) -> member 543c19af-3bb2-482f-938f-74d5f890b029
UPDATE public.loans SET member_id = '543c19af-3bb2-482f-938f-74d5f890b029' WHERE control_number IN ('TTMPCL-256', 'TTMPCL-257', 'TTMPCL-258', 'TTMPCL-259', 'TTMPCL-260', 'TTMPCL-261');

-- auto: MATILLANO, FRANCIE ROSE (1 loan(s)) -> member 738f886f-1eb9-46da-aeec-392714afacb5
UPDATE public.loans SET member_id = '738f886f-1eb9-46da-aeec-392714afacb5' WHERE control_number IN ('TTMPCL-262');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('a7206b0f-4f88-4b5e-82ae-a160c727a098', '738f886f-1eb9-46da-aeec-392714afacb5', FALSE, 'auto match: MATILLANO, FRANCIE ROSE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: MEMPIN, KENNETH LYLE (1 loan(s)) -> member 961f9ee5-54cb-4781-ab96-c113b8188dd1
UPDATE public.loans SET member_id = '961f9ee5-54cb-4781-ab96-c113b8188dd1' WHERE control_number IN ('TTMPCL-273');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('cd050e67-0ed1-4ba5-aa19-bf05c3545cef', '961f9ee5-54cb-4781-ab96-c113b8188dd1', FALSE, 'auto match: MEMPIN, KENNETH LYLE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: MEMPIN, MARY HOPE (4 loan(s)) -> member f71a6f86-5a42-43c7-9cc8-c6900bbc8197
UPDATE public.loans SET member_id = 'f71a6f86-5a42-43c7-9cc8-c6900bbc8197' WHERE control_number IN ('TTMPCL-274', 'TTMPCL-275', 'TTMPCL-276', 'TTMPCL-277');

-- auto: MEMPIN, MINDA CELIA (3 loan(s)) -> member 04b15a5e-b79b-4193-9201-2039b98759dd
UPDATE public.loans SET member_id = '04b15a5e-b79b-4193-9201-2039b98759dd' WHERE control_number IN ('TTMPCL-278', 'TTMPCL-279', 'TTMPCL-280');

-- auto: MESTOSAMENTE, MARICEL (3 loan(s)) -> member ea67ffbd-1160-4a71-9137-eec53683ec2c
UPDATE public.loans SET member_id = 'ea67ffbd-1160-4a71-9137-eec53683ec2c' WHERE control_number IN ('TTMPCL-281', 'TTMPCL-282', 'TTMPCL-283');

-- auto: MURIERA, XENIA (4 loan(s)) -> member 3d88d596-bf50-4b21-ab5d-5e501482615e
UPDATE public.loans SET member_id = '3d88d596-bf50-4b21-ab5d-5e501482615e' WHERE control_number IN ('TTMPCL-284', 'TTMPCL-285', 'TTMPCL-286', 'TTMPCL-287');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('a612041f-69b0-45d2-bd6c-ae5b527a98da', '3d88d596-bf50-4b21-ab5d-5e501482615e', FALSE, 'auto match: MURIERA, XENIA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: OCATE, JEAN (2 loan(s)) -> member a31d5054-a7dd-4ffa-b40a-0583f8ac5f5e
UPDATE public.loans SET member_id = 'a31d5054-a7dd-4ffa-b40a-0583f8ac5f5e' WHERE control_number IN ('TTMPCL-292', 'TTMPCL-293');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('d8b7a9ae-7a80-4090-af67-aad18d42764d', 'a31d5054-a7dd-4ffa-b40a-0583f8ac5f5e', FALSE, 'auto match: OCATE, JEAN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: OGACO, JONATHAN (3 loan(s)) -> member 0b695973-a994-42f9-b3e4-2fe1fe2bde22
UPDATE public.loans SET member_id = '0b695973-a994-42f9-b3e4-2fe1fe2bde22' WHERE control_number IN ('TTMPCL-294', 'TTMPCL-295', 'TTMPCL-296');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('70189e49-0b25-470b-9ee4-62115500705b', '0b695973-a994-42f9-b3e4-2fe1fe2bde22', FALSE, 'auto match: OGACO, JONATHAN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: OLMOS, VERLYN (2 loan(s)) -> member 2b2090cd-e8e3-4ffe-b97b-bc25a3922f75
UPDATE public.loans SET member_id = '2b2090cd-e8e3-4ffe-b97b-bc25a3922f75' WHERE control_number IN ('TTMPCL-297', 'TTMPCL-298');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('d59f117c-16dc-474e-8ab8-2eb523bc586f', '2b2090cd-e8e3-4ffe-b97b-bc25a3922f75', FALSE, 'auto match: OLMOS, VERLYN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: PADILLA, MARY IVY (9 loan(s)) -> member 353abbb5-ecc4-4746-ac66-7c4ed53ea1ed
UPDATE public.loans SET member_id = '353abbb5-ecc4-4746-ac66-7c4ed53ea1ed' WHERE control_number IN ('TTMPCL-299', 'TTMPCL-300', 'TTMPCL-301', 'TTMPCL-302', 'TTMPCL-303', 'TTMPCL-304', 'TTMPCL-305', 'TTMPCL-306', 'TTMPCL-307');

-- auto: PANIZA, MARLYN (3 loan(s)) -> member 70e93078-a3f0-427d-9935-e46d8656581b
UPDATE public.loans SET member_id = '70e93078-a3f0-427d-9935-e46d8656581b' WHERE control_number IN ('TTMPCL-308', 'TTMPCL-309', 'TTMPCL-310');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('fcee519a-9c3e-4e35-a56f-68792a49b5c5', '70e93078-a3f0-427d-9935-e46d8656581b', FALSE, 'auto match: PANIZA, MARLYN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: REFUGIO, YOLANDA (5 loan(s)) -> member 6259a1d4-d68f-47d8-8682-37674b68f125
UPDATE public.loans SET member_id = '6259a1d4-d68f-47d8-8682-37674b68f125' WHERE control_number IN ('TTMPCL-311', 'TTMPCL-312', 'TTMPCL-313', 'TTMPCL-314', 'TTMPCL-315');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('9bedb437-1d2f-4a8d-8087-418a27e0cf48', '6259a1d4-d68f-47d8-8682-37674b68f125', FALSE, 'auto match: REFUGIO, YOLANDA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: SABAY, EVELYN (2 loan(s)) -> member 91b4698b-60d3-4bba-a05b-98543bd5e023
UPDATE public.loans SET member_id = '91b4698b-60d3-4bba-a05b-98543bd5e023' WHERE control_number IN ('TTMPCL-316', 'TTMPCL-317');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('3eb23e20-4252-4823-8797-0c958021c409', '91b4698b-60d3-4bba-a05b-98543bd5e023', FALSE, 'auto match: SABAY, EVELYN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: SISON, MARICEL (5 loan(s)) -> member a5d29838-ca23-47fd-ba39-4dfb64bf4a34
UPDATE public.loans SET member_id = 'a5d29838-ca23-47fd-ba39-4dfb64bf4a34' WHERE control_number IN ('TTMPCL-320', 'TTMPCL-321', 'TTMPCL-322', 'TTMPCL-323', 'TTMPCL-324');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('22ebb6f9-2c50-462f-a7f2-e441c90e79c1', 'a5d29838-ca23-47fd-ba39-4dfb64bf4a34', FALSE, 'auto match: SISON, MARICEL') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: SITUBAL, ARLYN JUNE (4 loan(s)) -> member 42b2a122-63c1-4aa9-9a70-acc73135873f
UPDATE public.loans SET member_id = '42b2a122-63c1-4aa9-9a70-acc73135873f' WHERE control_number IN ('TTMPCL-325', 'TTMPCL-326', 'TTMPCL-327', 'TTMPCL-328');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('6a4dca72-37b6-4dbd-9e22-ba7d2ba11509', '42b2a122-63c1-4aa9-9a70-acc73135873f', FALSE, 'auto match: SITUBAL, ARLYN JUNE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: SOLDEVILLA, SHELLA (2 loan(s)) -> member ba9f5d5d-cc51-42b0-9ab9-1107ac0ebdba
UPDATE public.loans SET member_id = 'ba9f5d5d-cc51-42b0-9ab9-1107ac0ebdba' WHERE control_number IN ('TTMPCL-329', 'TTMPCL-330');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('3297c191-765d-43ef-a4d4-ef62842acfd1', 'ba9f5d5d-cc51-42b0-9ab9-1107ac0ebdba', FALSE, 'auto match: SOLDEVILLA, SHELLA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TA ACA, LEONCIA (3 loan(s)) -> member b8fdf8d1-6d7c-4e5e-b2cc-33242df8a03d
UPDATE public.loans SET member_id = 'b8fdf8d1-6d7c-4e5e-b2cc-33242df8a03d' WHERE control_number IN ('TTMPCL-331', 'TTMPCL-332', 'TTMPCL-333');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('1ee81733-6834-45b4-8f68-3e6182379d1f', 'b8fdf8d1-6d7c-4e5e-b2cc-33242df8a03d', FALSE, 'auto match: TA ACA, LEONCIA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TA ALA, JOSIE ANN (3 loan(s)) -> member ffe7b10b-7872-470d-8995-d86e3a408970
UPDATE public.loans SET member_id = 'ffe7b10b-7872-470d-8995-d86e3a408970' WHERE control_number IN ('TTMPCL-334', 'TTMPCL-335', 'TTMPCL-336');

-- auto: TA ALA, WILMA (2 loan(s)) -> member b2407c3f-3d51-4dc3-9554-3b727770f53b
UPDATE public.loans SET member_id = 'b2407c3f-3d51-4dc3-9554-3b727770f53b' WHERE control_number IN ('TTMPCL-337', 'TTMPCL-338');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('b198e126-e1da-4b15-b07e-417fa9e5b678', 'b2407c3f-3d51-4dc3-9554-3b727770f53b', FALSE, 'auto match: TA ALA, WILMA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABABA, ASISCLO (2 loan(s)) -> member b233c4db-638a-480a-a98a-0550c12e98d6
UPDATE public.loans SET member_id = 'b233c4db-638a-480a-a98a-0550c12e98d6' WHERE control_number IN ('TTMPCL-341', 'TTMPCL-342');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('78cc7196-d6a6-4494-b1d2-cc803aab96c0', 'b233c4db-638a-480a-a98a-0550c12e98d6', FALSE, 'auto match: TABABA, ASISCLO') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABABA, CONCEPCION (5 loan(s)) -> member a32d70b6-d1b2-4109-9592-3c59d09246f3
UPDATE public.loans SET member_id = 'a32d70b6-d1b2-4109-9592-3c59d09246f3' WHERE control_number IN ('TTMPCL-343', 'TTMPCL-344', 'TTMPCL-345', 'TTMPCL-346', 'TTMPCL-347');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('dc1183b9-b4e8-4eee-b9e4-1c6e61a49901', 'a32d70b6-d1b2-4109-9592-3c59d09246f3', FALSE, 'auto match: TABABA, CONCEPCION') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABABA, ELIZER (4 loan(s)) -> member 488eed51-1965-48f5-b8f1-5582820ccf94
UPDATE public.loans SET member_id = '488eed51-1965-48f5-b8f1-5582820ccf94' WHERE control_number IN ('TTMPCL-348', 'TTMPCL-349', 'TTMPCL-350', 'TTMPCL-351');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('9000ed79-5b32-4a84-beaf-251b736a17d2', '488eed51-1965-48f5-b8f1-5582820ccf94', FALSE, 'auto match: TABABA, ELIZER') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABABA, MONA LISA (7 loan(s)) -> member 9813d9d4-e5f5-4ded-9e22-200c472e8703
UPDATE public.loans SET member_id = '9813d9d4-e5f5-4ded-9e22-200c472e8703' WHERE control_number IN ('TTMPCL-352', 'TTMPCL-353', 'TTMPCL-354', 'TTMPCL-355', 'TTMPCL-356', 'TTMPCL-357', 'TTMPCL-358');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('085a7677-d8a3-404e-80d7-14d36e7a1c5f', '9813d9d4-e5f5-4ded-9e22-200c472e8703', FALSE, 'auto match: TABABA, MONA LISA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABABA, VINICIUS (1 loan(s)) -> member e8b5b398-d741-499e-84a0-a673f82ebdfb
UPDATE public.loans SET member_id = 'e8b5b398-d741-499e-84a0-a673f82ebdfb' WHERE control_number IN ('TTMPCL-359');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('9592f9e7-e278-47d4-922d-abd013c98f4e', 'e8b5b398-d741-499e-84a0-a673f82ebdfb', FALSE, 'auto match: TABABA, VINICIUS') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABAFA, MERCEDITA (3 loan(s)) -> member 12258f2e-7768-4222-bbd3-e7b5ad3d3975
UPDATE public.loans SET member_id = '12258f2e-7768-4222-bbd3-e7b5ad3d3975' WHERE control_number IN ('TTMPCL-360', 'TTMPCL-361', 'TTMPCL-362');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('fea5f699-e066-4b21-be61-8e497b302dde', '12258f2e-7768-4222-bbd3-e7b5ad3d3975', FALSE, 'auto match: TABAFA, MERCEDITA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABAGO, ABBIE KAYE (1 loan(s)) -> member 93f5bd29-38fa-46eb-91f6-c675f69239fd
UPDATE public.loans SET member_id = '93f5bd29-38fa-46eb-91f6-c675f69239fd' WHERE control_number IN ('TTMPCL-363');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('4d79d454-2ac3-4511-977e-275a0f3a1e94', '93f5bd29-38fa-46eb-91f6-c675f69239fd', FALSE, 'auto match: TABAGO, ABBIE KAYE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABAGO, AMANDA (6 loan(s)) -> member 5908295e-8392-47ea-80d0-dc0eb37a0a28
UPDATE public.loans SET member_id = '5908295e-8392-47ea-80d0-dc0eb37a0a28' WHERE control_number IN ('TTMPCL-364', 'TTMPCL-365', 'TTMPCL-366', 'TTMPCL-367', 'TTMPCL-368', 'TTMPCL-369');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('ca15ed0b-38ab-4970-9c03-0155fc0e90e9', '5908295e-8392-47ea-80d0-dc0eb37a0a28', FALSE, 'auto match: TABAGO, AMANDA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABAGO, HAZEL JADE (1 loan(s)) -> member 0424dd4e-648e-41b0-8964-6f06fb1c4ccb
UPDATE public.loans SET member_id = '0424dd4e-648e-41b0-8964-6f06fb1c4ccb' WHERE control_number IN ('TTMPCL-370');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('3b775ee6-b4bb-411e-b4b5-9d5672b0c745', '0424dd4e-648e-41b0-8964-6f06fb1c4ccb', FALSE, 'auto match: TABAGO, HAZEL JADE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABAGO, KRISJEN (1 loan(s)) -> member 999a497c-bcac-4949-a89f-750449771f6c
UPDATE public.loans SET member_id = '999a497c-bcac-4949-a89f-750449771f6c' WHERE control_number IN ('TTMPCL-371');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('42cbe407-2697-4ccd-b44a-871f69080eec', '999a497c-bcac-4949-a89f-750449771f6c', FALSE, 'auto match: TABAGO, KRISJEN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABAGO, MA DULZURA (3 loan(s)) -> member 0dc60bf4-e7b6-4851-89ba-c091830ad134
UPDATE public.loans SET member_id = '0dc60bf4-e7b6-4851-89ba-c091830ad134' WHERE control_number IN ('TTMPCL-372', 'TTMPCL-373', 'TTMPCL-374');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('57509130-7de3-4140-a908-cff8e68d6423', '0dc60bf4-e7b6-4851-89ba-c091830ad134', FALSE, 'auto match: TABAGO, MA DULZURA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABALINA, JOY (6 loan(s)) -> member f241a306-4842-48eb-97bc-6e1a2b20fcbd
UPDATE public.loans SET member_id = 'f241a306-4842-48eb-97bc-6e1a2b20fcbd' WHERE control_number IN ('TTMPCL-375', 'TTMPCL-376', 'TTMPCL-377', 'TTMPCL-378', 'TTMPCL-379', 'TTMPCL-380');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('753f3f31-7a00-447e-a9eb-1601fdb0b758', 'f241a306-4842-48eb-97bc-6e1a2b20fcbd', FALSE, 'auto match: TABALINA, JOY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABALINA, MARICEL JOY (5 loan(s)) -> member 4de4748f-a5cb-402a-9886-f0e71a7d3d90
UPDATE public.loans SET member_id = '4de4748f-a5cb-402a-9886-f0e71a7d3d90' WHERE control_number IN ('TTMPCL-381', 'TTMPCL-382', 'TTMPCL-383', 'TTMPCL-384', 'TTMPCL-385');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('fdd5167e-4ee4-4cab-b761-9a7d470ee436', '4de4748f-a5cb-402a-9886-f0e71a7d3d90', FALSE, 'auto match: TABALINA, MARICEL JOY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABANGCORA, RONA (1 loan(s)) -> member 7bdd88a2-35f1-4242-864f-c196d9e2da48
UPDATE public.loans SET member_id = '7bdd88a2-35f1-4242-864f-c196d9e2da48' WHERE control_number IN ('TTMPCL-389');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('0ed6eb36-934b-411b-9065-6ec2105db0f9', '7bdd88a2-35f1-4242-864f-c196d9e2da48', FALSE, 'auto match: TABANGCORA, RONA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABANIAG, MARY FLOR (5 loan(s)) -> member 12f6088b-5673-49e9-a190-d1273592bafa
UPDATE public.loans SET member_id = '12f6088b-5673-49e9-a190-d1273592bafa' WHERE control_number IN ('TTMPCL-390', 'TTMPCL-391', 'TTMPCL-392', 'TTMPCL-393', 'TTMPCL-394');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('88b5eaaf-b543-4e0b-844e-5fc02f69659d', '12f6088b-5673-49e9-a190-d1273592bafa', FALSE, 'auto match: TABANIAG, MARY FLOR') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABAOSARES, MARITES (7 loan(s)) -> member 5911bc29-2501-4e7c-9b03-fcda2b4ad194
UPDATE public.loans SET member_id = '5911bc29-2501-4e7c-9b03-fcda2b4ad194' WHERE control_number IN ('TTMPCL-396', 'TTMPCL-397', 'TTMPCL-398', 'TTMPCL-399', 'TTMPCL-400', 'TTMPCL-401', 'TTMPCL-402');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('b2d0f068-0aef-44c2-860d-22310b5ee899', '5911bc29-2501-4e7c-9b03-fcda2b4ad194', FALSE, 'auto match: TABAOSARES, MARITES') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABARES, RITA (4 loan(s)) -> member bd14617f-f8d7-4b07-871b-7508a6c435dd
UPDATE public.loans SET member_id = 'bd14617f-f8d7-4b07-871b-7508a6c435dd' WHERE control_number IN ('TTMPCL-403', 'TTMPCL-404', 'TTMPCL-405', 'TTMPCL-406');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('b64abe3e-658b-4a79-ab83-2825af7b2811', 'bd14617f-f8d7-4b07-871b-7508a6c435dd', FALSE, 'auto match: TABARES, RITA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABIFRANCA, LUCILLE (4 loan(s)) -> member dec3eaa0-55c8-41c5-a673-6bcbfa9e30b5
UPDATE public.loans SET member_id = 'dec3eaa0-55c8-41c5-a673-6bcbfa9e30b5' WHERE control_number IN ('TTMPCL-407', 'TTMPCL-408', 'TTMPCL-409', 'TTMPCL-410');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('77e0f38f-dd0d-4669-8a04-417269a94a63', 'dec3eaa0-55c8-41c5-a673-6bcbfa9e30b5', FALSE, 'auto match: TABIFRANCA, LUCILLE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABIOLO, MAE (7 loan(s)) -> member 4b59ebbf-9784-4f6b-818e-6efadacb3c2c
UPDATE public.loans SET member_id = '4b59ebbf-9784-4f6b-818e-6efadacb3c2c' WHERE control_number IN ('TTMPCL-417', 'TTMPCL-418', 'TTMPCL-419', 'TTMPCL-420', 'TTMPCL-421', 'TTMPCL-422', 'TTMPCL-423');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('02c393bf-c8c9-4123-8074-2c23c961ca5f', '4b59ebbf-9784-4f6b-818e-6efadacb3c2c', FALSE, 'auto match: TABIOLO, MAE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABIOLO, MARLENE (2 loan(s)) -> member a3de7469-60b2-4d5c-a12f-3b79f1a79b0c
UPDATE public.loans SET member_id = 'a3de7469-60b2-4d5c-a12f-3b79f1a79b0c' WHERE control_number IN ('TTMPCL-424', 'TTMPCL-425');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('60f5103b-4033-4aeb-a122-05469591c71d', 'a3de7469-60b2-4d5c-a12f-3b79f1a79b0c', FALSE, 'auto match: TABIOLO, MARLENE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABIOLO, RAMIL (2 loan(s)) -> member 26db1a6c-faee-4be7-9737-05a6a9f0477e
UPDATE public.loans SET member_id = '26db1a6c-faee-4be7-9737-05a6a9f0477e' WHERE control_number IN ('TTMPCL-426', 'TTMPCL-427');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('dc424c0f-b297-433d-82c0-3a19a763a9dc', '26db1a6c-faee-4be7-9737-05a6a9f0477e', FALSE, 'auto match: TABIOLO, RAMIL') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABION, JOSEPH ARIEL (3 loan(s)) -> member e1b52f7a-46b3-4ca9-a5d0-fcd2ebe0569b
UPDATE public.loans SET member_id = 'e1b52f7a-46b3-4ca9-a5d0-fcd2ebe0569b' WHERE control_number IN ('TTMPCL-428', 'TTMPCL-429', 'TTMPCL-430');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('60240075-a1d0-49d8-a27b-b528814207b6', 'e1b52f7a-46b3-4ca9-a5d0-fcd2ebe0569b', FALSE, 'auto match: TABION, JOSEPH ARIEL') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABLATIN, AIZA FAITH (1 loan(s)) -> member 49fc832f-d058-48fd-9ad1-ed06599cd668
UPDATE public.loans SET member_id = '49fc832f-d058-48fd-9ad1-ed06599cd668' WHERE control_number IN ('TTMPCL-436');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('72962c35-6ee7-4697-ac3b-dc0a0d6a2bb6', '49fc832f-d058-48fd-9ad1-ed06599cd668', FALSE, 'auto match: TABLATIN, AIZA FAITH') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABLATIN, SHEEREMAR (2 loan(s)) -> member 8f5f6e2f-34d1-4d15-8462-06393870d71e
UPDATE public.loans SET member_id = '8f5f6e2f-34d1-4d15-8462-06393870d71e' WHERE control_number IN ('TTMPCL-437', 'TTMPCL-438');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('bd12ce07-875a-425e-aada-b1ec2f36653d', '8f5f6e2f-34d1-4d15-8462-06393870d71e', FALSE, 'auto match: TABLATIN, SHEEREMAR') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABLATIN, WRYAN (3 loan(s)) -> member cc7161c0-d4a4-4361-b361-8e851abcccfd
UPDATE public.loans SET member_id = 'cc7161c0-d4a4-4361-b361-8e851abcccfd' WHERE control_number IN ('TTMPCL-439', 'TTMPCL-440', 'TTMPCL-441');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('d04db366-6b86-4f25-b747-b927f5ff2f7c', 'cc7161c0-d4a4-4361-b361-8e851abcccfd', FALSE, 'auto match: TABLATIN, WRYAN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABOCOLDE, CHERRY (5 loan(s)) -> member bb4cf277-e432-4994-99c2-c281728134d9
UPDATE public.loans SET member_id = 'bb4cf277-e432-4994-99c2-c281728134d9' WHERE control_number IN ('TTMPCL-442', 'TTMPCL-443', 'TTMPCL-444', 'TTMPCL-445', 'TTMPCL-446');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('adb00aa2-32a8-4338-bf85-d74562e572b6', 'bb4cf277-e432-4994-99c2-c281728134d9', FALSE, 'auto match: TABOCOLDE, CHERRY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABSING, LEONCIA (1 loan(s)) -> member a903d0ad-74bf-4964-af25-2ee0b23bacff
UPDATE public.loans SET member_id = 'a903d0ad-74bf-4964-af25-2ee0b23bacff' WHERE control_number IN ('TTMPCL-447');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('144484ac-9b41-4582-84d4-2234898474c0', 'a903d0ad-74bf-4964-af25-2ee0b23bacff', FALSE, 'auto match: TABSING, LEONCIA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABU AO, LERMA (1 loan(s)) -> member 7d1aea58-6a33-487b-bbb8-d42d0ad26e47
UPDATE public.loans SET member_id = '7d1aea58-6a33-487b-bbb8-d42d0ad26e47' WHERE control_number IN ('TTMPCL-448');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('a4f1616f-4c6f-42cd-92dd-c9d1a765b1f2', '7d1aea58-6a33-487b-bbb8-d42d0ad26e47', FALSE, 'auto match: TABU AO, LERMA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABUCURAN, NANCY (2 loan(s)) -> member 65a1625f-24a8-4648-801e-7ee21e05c1eb
UPDATE public.loans SET member_id = '65a1625f-24a8-4648-801e-7ee21e05c1eb' WHERE control_number IN ('TTMPCL-450', 'TTMPCL-451');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('ec745d32-6166-495a-abd6-bfb747a47be6', '65a1625f-24a8-4648-801e-7ee21e05c1eb', FALSE, 'auto match: TABUCURAN, NANCY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABUD, MANUEL JR (1 loan(s)) -> member d46c80f5-169c-4229-9f31-7ffcd4ece06c
UPDATE public.loans SET member_id = 'd46c80f5-169c-4229-9f31-7ffcd4ece06c' WHERE control_number IN ('TTMPCL-452');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('09a32eb7-e584-47bb-a937-8316f8199fec', 'd46c80f5-169c-4229-9f31-7ffcd4ece06c', FALSE, 'auto match: TABUD, MANUEL JR') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABUMFAMA, ESTELA (1 loan(s)) -> member 109bcd78-300e-4d8e-a021-64d96ee8b832
UPDATE public.loans SET member_id = '109bcd78-300e-4d8e-a021-64d96ee8b832' WHERE control_number IN ('TTMPCL-453');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('76e495f4-2c24-4242-a3b9-a9e752d8e26d', '109bcd78-300e-4d8e-a021-64d96ee8b832', FALSE, 'auto match: TABUMFAMA, ESTELA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABULINAR, RITA (1 loan(s)) -> member a6cded70-8897-456b-8e7a-b4ef533b1d08
UPDATE public.loans SET member_id = 'a6cded70-8897-456b-8e7a-b4ef533b1d08' WHERE control_number IN ('TTMPCL-454');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('7d286fe4-cd37-4e28-92bd-b8f83b6b47eb', 'a6cded70-8897-456b-8e7a-b4ef533b1d08', FALSE, 'auto match: TABULINAR, RITA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TABURO, RICO JOHN (5 loan(s)) -> member 81313a21-6f9f-49f1-a9fd-7e9bef992ad8
UPDATE public.loans SET member_id = '81313a21-6f9f-49f1-a9fd-7e9bef992ad8' WHERE control_number IN ('TTMPCL-455', 'TTMPCL-456', 'TTMPCL-457', 'TTMPCL-458', 'TTMPCL-459');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('0c669195-d001-455a-aabf-d98e89a78115', '81313a21-6f9f-49f1-a9fd-7e9bef992ad8', FALSE, 'auto match: TABURO, RICO JOHN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACADAO, ADRIAN (2 loan(s)) -> member 5a8ce07e-85c3-4e4c-a740-47c450dff7a2
UPDATE public.loans SET member_id = '5a8ce07e-85c3-4e4c-a740-47c450dff7a2' WHERE control_number IN ('TTMPCL-460', 'TTMPCL-461');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('44edcefe-85c4-411c-96e1-b305a24e99bb', '5a8ce07e-85c3-4e4c-a740-47c450dff7a2', FALSE, 'auto match: TACADAO, ADRIAN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACADAO, MA FE (4 loan(s)) -> member 64f1e8b6-3d7d-4b97-ba0f-fb8a27b91e09
UPDATE public.loans SET member_id = '64f1e8b6-3d7d-4b97-ba0f-fb8a27b91e09' WHERE control_number IN ('TTMPCL-462', 'TTMPCL-463', 'TTMPCL-464', 'TTMPCL-465');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('aef156af-fa3d-4261-9856-c3edf3eba2bf', '64f1e8b6-3d7d-4b97-ba0f-fb8a27b91e09', FALSE, 'auto match: TACADAO, MA FE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACADAO, VALERIA (3 loan(s)) -> member 1b55da17-1d02-4730-848f-0f9cc3869fe2
UPDATE public.loans SET member_id = '1b55da17-1d02-4730-848f-0f9cc3869fe2' WHERE control_number IN ('TTMPCL-467', 'TTMPCL-468', 'TTMPCL-469');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('c80970ae-5868-40e9-8024-fd3ca8bbcee3', '1b55da17-1d02-4730-848f-0f9cc3869fe2', FALSE, 'auto match: TACADAO, VALERIA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACAISAN, BERNADETTE (3 loan(s)) -> member 2c013a63-02fd-460a-b034-b8da1b07b004
UPDATE public.loans SET member_id = '2c013a63-02fd-460a-b034-b8da1b07b004' WHERE control_number IN ('TTMPCL-470', 'TTMPCL-471', 'TTMPCL-472');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('ec001307-75e3-482c-933a-63245a96247c', '2c013a63-02fd-460a-b034-b8da1b07b004', FALSE, 'auto match: TACAISAN, BERNADETTE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACAISAN, CHRISYL (2 loan(s)) -> member 5abe55f5-7df4-4a74-9cff-81aba375c4f5
UPDATE public.loans SET member_id = '5abe55f5-7df4-4a74-9cff-81aba375c4f5' WHERE control_number IN ('TTMPCL-473', 'TTMPCL-474');

-- auto: TACAISAN, JOANNA (1 loan(s)) -> member b5b82b71-9ad3-4081-b9d3-edeb86143bde
UPDATE public.loans SET member_id = 'b5b82b71-9ad3-4081-b9d3-edeb86143bde' WHERE control_number IN ('TTMPCL-475');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('035eb059-2785-4350-bc7c-3a8ab6b4acfb', 'b5b82b71-9ad3-4081-b9d3-edeb86143bde', FALSE, 'auto match: TACAISAN, JOANNA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACAISAN, MILAGROSA (2 loan(s)) -> member 04a4d152-431e-4507-939a-ce11743c86dc
UPDATE public.loans SET member_id = '04a4d152-431e-4507-939a-ce11743c86dc' WHERE control_number IN ('TTMPCL-476', 'TTMPCL-477');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('b4393306-54d6-44ef-8a9e-9890a6536627', '04a4d152-431e-4507-939a-ce11743c86dc', FALSE, 'auto match: TACAISAN, MILAGROSA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACANLOY, GENEVIVE (2 loan(s)) -> member 2b591dae-b3fd-415f-ba31-e7a98ad58b46
UPDATE public.loans SET member_id = '2b591dae-b3fd-415f-ba31-e7a98ad58b46' WHERE control_number IN ('TTMPCL-478', 'TTMPCL-479');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('a52c386d-6eb7-4a66-9d35-ce90cf6de387', '2b591dae-b3fd-415f-ba31-e7a98ad58b46', FALSE, 'auto match: TACANLOY, GENEVIVE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACANLOY, JOY FAITH (10 loan(s)) -> member 68696a9c-e031-403c-8e35-e07e611d2823
UPDATE public.loans SET member_id = '68696a9c-e031-403c-8e35-e07e611d2823' WHERE control_number IN ('TTMPCL-480', 'TTMPCL-481', 'TTMPCL-482', 'TTMPCL-483', 'TTMPCL-484', 'TTMPCL-485', 'TTMPCL-486', 'TTMPCL-487', 'TTMPCL-488', 'TTMPCL-489');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('7997e230-541e-488f-9116-cfe83ffd5751', '68696a9c-e031-403c-8e35-e07e611d2823', FALSE, 'auto match: TACANLOY, JOY FAITH') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACAPAN, IMELDA (5 loan(s)) -> member 54177d7f-9f8f-408c-9e5c-ffd459b46fd0
UPDATE public.loans SET member_id = '54177d7f-9f8f-408c-9e5c-ffd459b46fd0' WHERE control_number IN ('TTMPCL-490', 'TTMPCL-491', 'TTMPCL-492', 'TTMPCL-493', 'TTMPCL-494');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('5c1c94fa-9133-4a3a-bef9-6095e420b0cc', '54177d7f-9f8f-408c-9e5c-ffd459b46fd0', FALSE, 'auto match: TACAPAN, IMELDA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACARDON, ELSA (8 loan(s)) -> member 891df252-6af4-49d1-842c-c197d94e6835
UPDATE public.loans SET member_id = '891df252-6af4-49d1-842c-c197d94e6835' WHERE control_number IN ('TTMPCL-495', 'TTMPCL-496', 'TTMPCL-497', 'TTMPCL-498', 'TTMPCL-499', 'TTMPCL-500', 'TTMPCL-501', 'TTMPCL-502');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('f8580cfa-46db-4082-ba29-215d3ca2655e', '891df252-6af4-49d1-842c-c197d94e6835', FALSE, 'auto match: TACARDON, ELSA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACARDON, IPHIGENIA (1 loan(s)) -> member d5b6fcaa-da27-4052-8f15-0eaf2f494bf1
UPDATE public.loans SET member_id = 'd5b6fcaa-da27-4052-8f15-0eaf2f494bf1' WHERE control_number IN ('TTMPCL-503');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('33ad326f-26c1-4a62-a202-4d0b6c0b76e3', 'd5b6fcaa-da27-4052-8f15-0eaf2f494bf1', FALSE, 'auto match: TACARDON, IPHIGENIA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACAYON, DINDO FRANCIS (7 loan(s)) -> member ae346787-1053-48d8-a073-8337dae2f800
UPDATE public.loans SET member_id = 'ae346787-1053-48d8-a073-8337dae2f800' WHERE control_number IN ('TTMPCL-504', 'TTMPCL-505', 'TTMPCL-506', 'TTMPCL-507', 'TTMPCL-508', 'TTMPCL-509', 'TTMPCL-510');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('2e1c5b3c-7338-47ce-b025-855cf81b1bbb', 'ae346787-1053-48d8-a073-8337dae2f800', FALSE, 'auto match: TACAYON, DINDO FRANCIS') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACAYON, NESTOR (2 loan(s)) -> member 2c52bda7-5223-41d2-8300-a27ae47f7fa3
UPDATE public.loans SET member_id = '2c52bda7-5223-41d2-8300-a27ae47f7fa3' WHERE control_number IN ('TTMPCL-511', 'TTMPCL-512');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('02b1abfa-54f9-4b46-aed1-35f0afa5a5bf', '2c52bda7-5223-41d2-8300-a27ae47f7fa3', FALSE, 'auto match: TACAYON, NESTOR') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACSAGON, ARLENE (4 loan(s)) -> member 622a62a3-0143-4047-ac94-f1c5f2ef0ef2
UPDATE public.loans SET member_id = '622a62a3-0143-4047-ac94-f1c5f2ef0ef2' WHERE control_number IN ('TTMPCL-513', 'TTMPCL-514', 'TTMPCL-515', 'TTMPCL-516');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('90ed7ede-5035-4d77-a183-d6df11233730', '622a62a3-0143-4047-ac94-f1c5f2ef0ef2', FALSE, 'auto match: TACSAGON, ARLENE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACSAGON, RHODA (1 loan(s)) -> member 926e9706-978e-4f64-bac4-ce2aabe9be10
UPDATE public.loans SET member_id = '926e9706-978e-4f64-bac4-ce2aabe9be10' WHERE control_number IN ('TTMPCL-522');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('aa1050a4-2a29-47d4-93e1-f9472efbc080', '926e9706-978e-4f64-bac4-ce2aabe9be10', FALSE, 'auto match: TACSAGON, RHODA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACUBAN, SAMPAGUITA (3 loan(s)) -> member c2c11fd7-6cef-4237-bc84-0a4d46480688
UPDATE public.loans SET member_id = 'c2c11fd7-6cef-4237-bc84-0a4d46480688' WHERE control_number IN ('TTMPCL-523', 'TTMPCL-524', 'TTMPCL-525');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('dff6e85a-518a-400c-8ba5-86d2a3c9b3f3', 'c2c11fd7-6cef-4237-bc84-0a4d46480688', FALSE, 'auto match: TACUBAN, SAMPAGUITA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACUEL, JONAH (9 loan(s)) -> member 9715f175-5984-4325-b96d-11cee48aa17f
UPDATE public.loans SET member_id = '9715f175-5984-4325-b96d-11cee48aa17f' WHERE control_number IN ('TTMPCL-532', 'TTMPCL-533', 'TTMPCL-534', 'TTMPCL-535', 'TTMPCL-536', 'TTMPCL-537', 'TTMPCL-538', 'TTMPCL-539', 'TTMPCL-540');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('409c1b72-c7d4-4cdb-a01f-961b56de56d5', '9715f175-5984-4325-b96d-11cee48aa17f', FALSE, 'auto match: TACUEL, JONAH') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACUYAN, IRISH MARIE (3 loan(s)) -> member 228277af-8e50-4f27-a248-ad88a480a16c
UPDATE public.loans SET member_id = '228277af-8e50-4f27-a248-ad88a480a16c' WHERE control_number IN ('TTMPCL-541', 'TTMPCL-542', 'TTMPCL-543');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('6317e02f-2d51-4142-9076-d63023b6f3c3', '228277af-8e50-4f27-a248-ad88a480a16c', FALSE, 'auto match: TACUYAN, IRISH MARIE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACUYAN, MARIA THERESA (7 loan(s)) -> member d368c7ff-b317-4455-925f-871131b361bd
UPDATE public.loans SET member_id = 'd368c7ff-b317-4455-925f-871131b361bd' WHERE control_number IN ('TTMPCL-544', 'TTMPCL-545', 'TTMPCL-546', 'TTMPCL-547', 'TTMPCL-548', 'TTMPCL-549', 'TTMPCL-550');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('233c885d-b654-48e8-9eff-6a26bf66b0cd', 'd368c7ff-b317-4455-925f-871131b361bd', FALSE, 'auto match: TACUYAN, MARIA THERESA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACUYAN, MAIRA GRACE (7 loan(s)) -> member 0d80ddb7-f5ba-4088-8506-55b7defe21d4
UPDATE public.loans SET member_id = '0d80ddb7-f5ba-4088-8506-55b7defe21d4' WHERE control_number IN ('TTMPCL-551', 'TTMPCL-552', 'TTMPCL-553', 'TTMPCL-554', 'TTMPCL-555', 'TTMPCL-556', 'TTMPCL-557');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('a4ab557a-c203-4cfa-95aa-c5b670965420', '0d80ddb7-f5ba-4088-8506-55b7defe21d4', FALSE, 'auto match: TACUYAN, MAIRA GRACE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TACUYAN, MARA (2 loan(s)) -> member 2d0ce89e-f5cf-4b5f-a7d5-bdaf81b307e2
UPDATE public.loans SET member_id = '2d0ce89e-f5cf-4b5f-a7d5-bdaf81b307e2' WHERE control_number IN ('TTMPCL-558', 'TTMPCL-559');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('5947d58f-6f36-4833-a454-7ab54d7d7724', '2d0ce89e-f5cf-4b5f-a7d5-bdaf81b307e2', FALSE, 'auto match: TACUYAN, MARA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TADAYA, TERESITA (1 loan(s)) -> member a7f4f521-8a11-4763-8d1a-2dd09731d000
UPDATE public.loans SET member_id = 'a7f4f521-8a11-4763-8d1a-2dd09731d000' WHERE control_number IN ('TTMPCL-560');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('f7f81a8a-b982-4976-927f-ee4ba332d505', 'a7f4f521-8a11-4763-8d1a-2dd09731d000', FALSE, 'auto match: TADAYA, TERESITA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TADIA, RICHEL (4 loan(s)) -> member d030f1e4-141d-41e5-aaad-723a08cfbe85
UPDATE public.loans SET member_id = 'd030f1e4-141d-41e5-aaad-723a08cfbe85' WHERE control_number IN ('TTMPCL-561', 'TTMPCL-562', 'TTMPCL-563', 'TTMPCL-564');

-- auto: TADIAQUE, JANINE ROSS (1 loan(s)) -> member bda99c65-b1c8-4ae9-aa63-f5969113d2a5
UPDATE public.loans SET member_id = 'bda99c65-b1c8-4ae9-aa63-f5969113d2a5' WHERE control_number IN ('TTMPCL-565');

-- auto: TADIFA, DARWIN (5 loan(s)) -> member 4d15bf6f-120f-4eb3-86d7-3c9b9a0c070d
UPDATE public.loans SET member_id = '4d15bf6f-120f-4eb3-86d7-3c9b9a0c070d' WHERE control_number IN ('TTMPCL-566', 'TTMPCL-567', 'TTMPCL-568', 'TTMPCL-569', 'TTMPCL-570');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('5eea3944-c36c-406b-b462-d29f0622a332', '4d15bf6f-120f-4eb3-86d7-3c9b9a0c070d', FALSE, 'auto match: TADIFA, DARWIN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TADIFA, VERONICA (2 loan(s)) -> member fe75231b-4fd5-4e08-ad9d-672628d7ba95
UPDATE public.loans SET member_id = 'fe75231b-4fd5-4e08-ad9d-672628d7ba95' WHERE control_number IN ('TTMPCL-571', 'TTMPCL-572');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('5c1b8c1f-41f4-437f-820b-69a6bbe53266', 'fe75231b-4fd5-4e08-ad9d-672628d7ba95', FALSE, 'auto match: TADIFA, VERONICA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAGABI, NICOLAS (2 loan(s)) -> member d4a0488e-2383-4c1c-9aed-ef813c397232
UPDATE public.loans SET member_id = 'd4a0488e-2383-4c1c-9aed-ef813c397232' WHERE control_number IN ('TTMPCL-573', 'TTMPCL-574');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('137873ab-0455-49e1-b08b-6aa29dd0080f', 'd4a0488e-2383-4c1c-9aed-ef813c397232', FALSE, 'auto match: TAGABI, NICOLAS') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAGACAY, JOYLENE (3 loan(s)) -> member 191b0acc-0abd-442c-9e6f-b362e82eac2c
UPDATE public.loans SET member_id = '191b0acc-0abd-442c-9e6f-b362e82eac2c' WHERE control_number IN ('TTMPCL-578', 'TTMPCL-579', 'TTMPCL-580');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('ae4124a0-b380-40bd-ab42-edc655112701', '191b0acc-0abd-442c-9e6f-b362e82eac2c', FALSE, 'auto match: TAGACAY, JOYLENE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAGAL, NATIVIDAD (3 loan(s)) -> member 95e5924b-2ad1-4a68-9663-b06df92e6d10
UPDATE public.loans SET member_id = '95e5924b-2ad1-4a68-9663-b06df92e6d10' WHERE control_number IN ('TTMPCL-581', 'TTMPCL-582', 'TTMPCL-583');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('8d249465-bb80-4a07-bfd6-6269ffa15154', '95e5924b-2ad1-4a68-9663-b06df92e6d10', FALSE, 'auto match: TAGAL, NATIVIDAD') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAGAMOLILA, BASILIA (6 loan(s)) -> member 35e6012a-a3c3-4271-9a00-82a1f44b44ed
UPDATE public.loans SET member_id = '35e6012a-a3c3-4271-9a00-82a1f44b44ed' WHERE control_number IN ('TTMPCL-584', 'TTMPCL-585', 'TTMPCL-586', 'TTMPCL-587', 'TTMPCL-588', 'TTMPCL-589');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('152c9c2a-dc1f-42d1-8c3b-75dc0a216b1b', '35e6012a-a3c3-4271-9a00-82a1f44b44ed', FALSE, 'auto match: TAGAMOLILA, BASILIA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAGHAP, TERESITA (7 loan(s)) -> member 77476957-7d13-4928-b3eb-1e01b8657019
UPDATE public.loans SET member_id = '77476957-7d13-4928-b3eb-1e01b8657019' WHERE control_number IN ('TTMPCL-592', 'TTMPCL-593', 'TTMPCL-594', 'TTMPCL-595', 'TTMPCL-596', 'TTMPCL-597', 'TTMPCL-598');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('5b692264-ac12-4848-9321-4efc0e9398e9', '77476957-7d13-4928-b3eb-1e01b8657019', FALSE, 'auto match: TAGHAP, TERESITA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAGUDANDO, JENNIFER (3 loan(s)) -> member 47a97120-62ac-430a-8db6-00ee6e6fd1e9
UPDATE public.loans SET member_id = '47a97120-62ac-430a-8db6-00ee6e6fd1e9' WHERE control_number IN ('TTMPCL-605', 'TTMPCL-606', 'TTMPCL-607');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('daa0f82b-962f-4529-8f5a-f0f87b10d259', '47a97120-62ac-430a-8db6-00ee6e6fd1e9', FALSE, 'auto match: TAGUDANDO, JENNIFER') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAGUDANDO, JUBERT (2 loan(s)) -> member e9c5cac5-719e-4647-9eed-cb27e8b1f17a
UPDATE public.loans SET member_id = 'e9c5cac5-719e-4647-9eed-cb27e8b1f17a' WHERE control_number IN ('TTMPCL-608', 'TTMPCL-609');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('81287920-d2b1-44ac-a333-fa0f663011d4', 'e9c5cac5-719e-4647-9eed-cb27e8b1f17a', FALSE, 'auto match: TAGUDANDO, JUBERT') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAGUDANDO, JHOYCY (1 loan(s)) -> member f6d42cfc-7038-426f-9923-9028ec4f2d0c
UPDATE public.loans SET member_id = 'f6d42cfc-7038-426f-9923-9028ec4f2d0c' WHERE control_number IN ('TTMPCL-610');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('66d84bfe-f371-400d-8329-e308cb840070', 'f6d42cfc-7038-426f-9923-9028ec4f2d0c', FALSE, 'auto match: TAGUDANDO, JHOYCY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAGUDANDO, LEONARD (1 loan(s)) -> member c90e415d-6586-44bd-b2c1-24969cc00228
UPDATE public.loans SET member_id = 'c90e415d-6586-44bd-b2c1-24969cc00228' WHERE control_number IN ('TTMPCL-611');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('475c680d-7fff-407c-987a-ea08a5d2f26c', 'c90e415d-6586-44bd-b2c1-24969cc00228', FALSE, 'auto match: TAGUDANDO, LEONARD') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TALACAN, JOSEPHINE (5 loan(s)) -> member a3ac52e6-4a67-4e35-9ebd-8483dbbf0230
UPDATE public.loans SET member_id = 'a3ac52e6-4a67-4e35-9ebd-8483dbbf0230' WHERE control_number IN ('TTMPCL-616', 'TTMPCL-617', 'TTMPCL-618', 'TTMPCL-619', 'TTMPCL-620');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('5c3856f3-f91e-4ebb-a074-2651d8817bf1', 'a3ac52e6-4a67-4e35-9ebd-8483dbbf0230', FALSE, 'auto match: TALACAN, JOSEPHINE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TALAMILLO, GLEN (5 loan(s)) -> member f647be8a-15e9-48ad-b90e-9e64b6f1f67c
UPDATE public.loans SET member_id = 'f647be8a-15e9-48ad-b90e-9e64b6f1f67c' WHERE control_number IN ('TTMPCL-621', 'TTMPCL-622', 'TTMPCL-623', 'TTMPCL-624', 'TTMPCL-625');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('2dd42d40-4144-43b3-9183-3be2147dad37', 'f647be8a-15e9-48ad-b90e-9e64b6f1f67c', FALSE, 'auto match: TALAMILLO, GLEN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TALENTO, VINCENT REY (4 loan(s)) -> member f8e9dbe1-2e27-402d-8fe3-8075b94013ef
UPDATE public.loans SET member_id = 'f8e9dbe1-2e27-402d-8fe3-8075b94013ef' WHERE control_number IN ('TTMPCL-626', 'TTMPCL-627', 'TTMPCL-628', 'TTMPCL-629');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('f1557f10-bc75-4ad7-a633-1bb5adb9feef', 'f8e9dbe1-2e27-402d-8fe3-8075b94013ef', FALSE, 'auto match: TALENTO, VINCENT REY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TALEON, ROSIE (4 loan(s)) -> member c075841a-4902-4786-be13-a2c9717a5256
UPDATE public.loans SET member_id = 'c075841a-4902-4786-be13-a2c9717a5256' WHERE control_number IN ('TTMPCL-630', 'TTMPCL-631', 'TTMPCL-632', 'TTMPCL-633');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('be955f52-d4be-4258-871f-7fc5604b0968', 'c075841a-4902-4786-be13-a2c9717a5256', FALSE, 'auto match: TALEON, ROSIE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TALHA, ANGELIE (4 loan(s)) -> member a52ef556-9007-46d8-8bcb-45ed4f358c9f
UPDATE public.loans SET member_id = 'a52ef556-9007-46d8-8bcb-45ed4f358c9f' WHERE control_number IN ('TTMPCL-634', 'TTMPCL-635', 'TTMPCL-636', 'TTMPCL-637');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('882484b4-1d69-41db-acbf-dbaf3b71fad9', 'a52ef556-9007-46d8-8bcb-45ed4f358c9f', FALSE, 'auto match: TALHA, ANGELIE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TALHA, CARIDAD (1 loan(s)) -> member f97d47cf-25eb-4dc8-9607-2fe2512ac490
UPDATE public.loans SET member_id = 'f97d47cf-25eb-4dc8-9607-2fe2512ac490' WHERE control_number IN ('TTMPCL-638');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('742bf538-c9e0-4e9e-8a53-ba716c180bf2', 'f97d47cf-25eb-4dc8-9607-2fe2512ac490', FALSE, 'auto match: TALHA, CARIDAD') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TALHA, MARILYN (4 loan(s)) -> member 0576463c-b4de-4c7a-b57f-8f60c6a3a5ab
UPDATE public.loans SET member_id = '0576463c-b4de-4c7a-b57f-8f60c6a3a5ab' WHERE control_number IN ('TTMPCL-639', 'TTMPCL-640', 'TTMPCL-641', 'TTMPCL-642');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('c581c21a-7f75-4d61-8d2a-b7fb3e88c75b', '0576463c-b4de-4c7a-b57f-8f60c6a3a5ab', FALSE, 'auto match: TALHA, MARILYN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TALIBO, GERRLYN MAY (2 loan(s)) -> member 33e583b6-7875-464b-a00e-3db91ce45179
UPDATE public.loans SET member_id = '33e583b6-7875-464b-a00e-3db91ce45179' WHERE control_number IN ('TTMPCL-643', 'TTMPCL-644');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('4a438966-5a46-4cbf-8184-a57e82ae2d60', '33e583b6-7875-464b-a00e-3db91ce45179', FALSE, 'auto match: TALIBO, GERRLYN MAY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TALIDANO, EMELYN (1 loan(s)) -> member 15899d12-1727-4c55-bf59-80e36c671fe3
UPDATE public.loans SET member_id = '15899d12-1727-4c55-bf59-80e36c671fe3' WHERE control_number IN ('TTMPCL-645');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('35500a36-00d5-4039-aef1-031352d401b5', '15899d12-1727-4c55-bf59-80e36c671fe3', FALSE, 'auto match: TALIDANO, EMELYN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAMAGOS, CHARRY ROSE (4 loan(s)) -> member ea72c466-6024-454b-a27b-3a1e6a9e946e
UPDATE public.loans SET member_id = 'ea72c466-6024-454b-a27b-3a1e6a9e946e' WHERE control_number IN ('TTMPCL-651', 'TTMPCL-652', 'TTMPCL-653', 'TTMPCL-654');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('76b33b75-06cc-42d7-b112-fc0027e48fd2', 'ea72c466-6024-454b-a27b-3a1e6a9e946e', FALSE, 'auto match: TAMAGOS, CHARRY ROSE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAMAGOS, GLORIA (5 loan(s)) -> member 3d1ad5d1-9350-47b4-8eed-01e54fb072fc
UPDATE public.loans SET member_id = '3d1ad5d1-9350-47b4-8eed-01e54fb072fc' WHERE control_number IN ('TTMPCL-655', 'TTMPCL-656', 'TTMPCL-657', 'TTMPCL-658', 'TTMPCL-659');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('9985bf61-4677-4e95-a891-57da7ba6e5d8', '3d1ad5d1-9350-47b4-8eed-01e54fb072fc', FALSE, 'auto match: TAMAGOS, GLORIA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAMAGOS, MELANIE (10 loan(s)) -> member b9da093e-1d75-480b-8c81-c5878063f566
UPDATE public.loans SET member_id = 'b9da093e-1d75-480b-8c81-c5878063f566' WHERE control_number IN ('TTMPCL-660', 'TTMPCL-661', 'TTMPCL-662', 'TTMPCL-663', 'TTMPCL-664', 'TTMPCL-665', 'TTMPCL-666', 'TTMPCL-667', 'TTMPCL-668', 'TTMPCL-669');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('37dc82ae-5985-4082-b26b-785838bc6171', 'b9da093e-1d75-480b-8c81-c5878063f566', FALSE, 'auto match: TAMAGOS, MELANIE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAMAYOR, MA LUISA (1 loan(s)) -> member 9587d5a5-3bc9-4b8a-9cfb-2950d3351879
UPDATE public.loans SET member_id = '9587d5a5-3bc9-4b8a-9cfb-2950d3351879' WHERE control_number IN ('TTMPCL-670');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('d99956b8-3445-4d2b-9e85-49a11f67b677', '9587d5a5-3bc9-4b8a-9cfb-2950d3351879', FALSE, 'auto match: TAMAYOR, MA LUISA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAMBA, CRISTINE (3 loan(s)) -> member 9252d86b-5897-4a34-83f7-aea04524feda
UPDATE public.loans SET member_id = '9252d86b-5897-4a34-83f7-aea04524feda' WHERE control_number IN ('TTMPCL-671', 'TTMPCL-672', 'TTMPCL-673');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('4a749ee3-f23d-4774-a140-c33a53235030', '9252d86b-5897-4a34-83f7-aea04524feda', FALSE, 'auto match: TAMBA, CRISTINE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAMBIRAO, JOSEFINE (4 loan(s)) -> member ea84bd99-ce12-4bd0-a3ba-fbf016b31643
UPDATE public.loans SET member_id = 'ea84bd99-ce12-4bd0-a3ba-fbf016b31643' WHERE control_number IN ('TTMPCL-674', 'TTMPCL-675', 'TTMPCL-676', 'TTMPCL-677');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('840b8f73-be17-466d-89ba-c3fb068ba8fc', 'ea84bd99-ce12-4bd0-a3ba-fbf016b31643', FALSE, 'auto match: TAMBIRAO, JOSEFINE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAMISEN, VANESSA KAREN (1 loan(s)) -> member 2a79938a-4a1f-4309-9e22-7a4f7d46c617
UPDATE public.loans SET member_id = '2a79938a-4a1f-4309-9e22-7a4f7d46c617' WHERE control_number IN ('TTMPCL-679');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('226f9d39-c81f-465b-96da-9ba5c8f79d9d', '2a79938a-4a1f-4309-9e22-7a4f7d46c617', FALSE, 'auto match: TAMISEN, VANESSA KAREN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAMONAN, KRISTY JOY (2 loan(s)) -> member 868361fd-1289-4b0d-a3a0-734a4f106337
UPDATE public.loans SET member_id = '868361fd-1289-4b0d-a3a0-734a4f106337' WHERE control_number IN ('TTMPCL-687', 'TTMPCL-688');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('35088317-aa3d-472b-b6e5-6549b0ae928f', '868361fd-1289-4b0d-a3a0-734a4f106337', FALSE, 'auto match: TAMONAN, KRISTY JOY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAMONAN, BARBARA (5 loan(s)) -> member eb46379b-123c-4b17-bb05-4a9b5553e888
UPDATE public.loans SET member_id = 'eb46379b-123c-4b17-bb05-4a9b5553e888' WHERE control_number IN ('TTMPCL-689', 'TTMPCL-690', 'TTMPCL-691', 'TTMPCL-692', 'TTMPCL-693');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('75a41c28-eccb-43f3-9a14-e9fcc03c4911', 'eb46379b-123c-4b17-bb05-4a9b5553e888', FALSE, 'auto match: TAMONAN, BARBARA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TANALLON, MARVIN (1 loan(s)) -> member 69238230-9620-4e35-8093-3a801d3a4b67
UPDATE public.loans SET member_id = '69238230-9620-4e35-8093-3a801d3a4b67' WHERE control_number IN ('TTMPCL-694');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('a4d15110-9fab-4dd3-a137-9da5b0b3384b', '69238230-9620-4e35-8093-3a801d3a4b67', FALSE, 'auto match: TANALLON, MARVIN') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TANATE, ENELIA (6 loan(s)) -> member 7701fd19-ca7e-491d-8f2a-0b13032a6466
UPDATE public.loans SET member_id = '7701fd19-ca7e-491d-8f2a-0b13032a6466' WHERE control_number IN ('TTMPCL-695', 'TTMPCL-696', 'TTMPCL-697', 'TTMPCL-698', 'TTMPCL-699', 'TTMPCL-700');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('bc666198-91a5-4bc1-a8c8-4eb5a2c5c4eb', '7701fd19-ca7e-491d-8f2a-0b13032a6466', FALSE, 'auto match: TANATE, ENELIA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TANATE, VENUS (8 loan(s)) -> member ce1320cf-c680-482e-aa5c-eee19c224ebf
UPDATE public.loans SET member_id = 'ce1320cf-c680-482e-aa5c-eee19c224ebf' WHERE control_number IN ('TTMPCL-701', 'TTMPCL-702', 'TTMPCL-703', 'TTMPCL-704', 'TTMPCL-705', 'TTMPCL-706', 'TTMPCL-707', 'TTMPCL-708');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('cc6107a1-b2d4-40db-b136-f3bbb03d0496', 'ce1320cf-c680-482e-aa5c-eee19c224ebf', FALSE, 'auto match: TANATE, VENUS') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TANILONG, BENITA (2 loan(s)) -> member c3b554a7-6d38-4fc7-a0b6-4df33e7c209e
UPDATE public.loans SET member_id = 'c3b554a7-6d38-4fc7-a0b6-4df33e7c209e' WHERE control_number IN ('TTMPCL-709', 'TTMPCL-710');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('d5662033-bb2d-4f32-98b8-6193989a8cc5', 'c3b554a7-6d38-4fc7-a0b6-4df33e7c209e', FALSE, 'auto match: TANILONG, BENITA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TANO, ADELFA (2 loan(s)) -> member 4de4a25f-62b4-48b1-9485-7d549f3cf92d
UPDATE public.loans SET member_id = '4de4a25f-62b4-48b1-9485-7d549f3cf92d' WHERE control_number IN ('TTMPCL-711', 'TTMPCL-712');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('4b8feae4-f480-4ba5-bc08-e6353c842f3d', '4de4a25f-62b4-48b1-9485-7d549f3cf92d', FALSE, 'auto match: TANO, ADELFA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TANO, CORNEJA MILANE (5 loan(s)) -> member 8f5dab05-bdec-43fa-854f-866b34af983d
UPDATE public.loans SET member_id = '8f5dab05-bdec-43fa-854f-866b34af983d' WHERE control_number IN ('TTMPCL-713', 'TTMPCL-714', 'TTMPCL-715', 'TTMPCL-716', 'TTMPCL-717');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('d66d6adf-24e1-440d-92ab-fe00cbb3e638', '8f5dab05-bdec-43fa-854f-866b34af983d', FALSE, 'auto match: TANO, CORNEJA MILANE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TANO, LOURDES (2 loan(s)) -> member 9b1d3b4d-47ee-405b-beae-9461e9a670ff
UPDATE public.loans SET member_id = '9b1d3b4d-47ee-405b-beae-9461e9a670ff' WHERE control_number IN ('TTMPCL-722', 'TTMPCL-723');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('21005c5c-6ad1-4920-b1bb-5ddf5f8d7d4d', '9b1d3b4d-47ee-405b-beae-9461e9a670ff', FALSE, 'auto match: TANO, LOURDES') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TANO, MERCY (1 loan(s)) -> member 7bda9d54-8e7c-4580-a019-2cc1cd4ab02a
UPDATE public.loans SET member_id = '7bda9d54-8e7c-4580-a019-2cc1cd4ab02a' WHERE control_number IN ('TTMPCL-724');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('7855d9b0-2ff1-4916-950a-aeffc05a9003', '7bda9d54-8e7c-4580-a019-2cc1cd4ab02a', FALSE, 'auto match: TANO, MERCY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAPICULIN, GENEVE (3 loan(s)) -> member d6572a24-bf25-43e3-9f35-be7d48195e05
UPDATE public.loans SET member_id = 'd6572a24-bf25-43e3-9f35-be7d48195e05' WHERE control_number IN ('TTMPCL-725', 'TTMPCL-726', 'TTMPCL-727');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('4cbff9ad-7b8f-472f-9ca1-d3a8886145b3', 'd6572a24-bf25-43e3-9f35-be7d48195e05', FALSE, 'auto match: TAPICULIN, GENEVE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TAPICULIN, MICHAEL (4 loan(s)) -> member fa464e8e-8235-442d-a50b-205c471bebc6
UPDATE public.loans SET member_id = 'fa464e8e-8235-442d-a50b-205c471bebc6' WHERE control_number IN ('TTMPCL-728', 'TTMPCL-729', 'TTMPCL-730', 'TTMPCL-731');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('cd88b632-2cdd-4e01-8f6a-1b384a3c1277', 'fa464e8e-8235-442d-a50b-205c471bebc6', FALSE, 'auto match: TAPICULIN, MICHAEL') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TERRE, KARREN (2 loan(s)) -> member 1669ccd9-9e30-4509-bd17-eb2f388c9b2a
UPDATE public.loans SET member_id = '1669ccd9-9e30-4509-bd17-eb2f388c9b2a' WHERE control_number IN ('TTMPCL-732', 'TTMPCL-733');

-- auto: TIDULA, MARY EDRIANNE (3 loan(s)) -> member 81026685-3111-410d-ba34-b616f1f12e15
UPDATE public.loans SET member_id = '81026685-3111-410d-ba34-b616f1f12e15' WHERE control_number IN ('TTMPCL-734', 'TTMPCL-735', 'TTMPCL-736');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('167424f1-7e22-46e9-b18e-535bd09979dd', '81026685-3111-410d-ba34-b616f1f12e15', FALSE, 'auto match: TIDULA, MARY EDRIANNE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TOMNOG, ELERIANA (3 loan(s)) -> member 70edb261-a84d-4e6d-9f2d-6362ab5882c6
UPDATE public.loans SET member_id = '70edb261-a84d-4e6d-9f2d-6362ab5882c6' WHERE control_number IN ('TTMPCL-737', 'TTMPCL-738', 'TTMPCL-739');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('2ec12379-8dcd-4f82-9c68-7b195b40720d', '70edb261-a84d-4e6d-9f2d-6362ab5882c6', FALSE, 'auto match: TOMNOG, ELERIANA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TONDING, AILEEN (3 loan(s)) -> member 628d52c9-fdc8-46fb-b8cd-61c15fd3e91a
UPDATE public.loans SET member_id = '628d52c9-fdc8-46fb-b8cd-61c15fd3e91a' WHERE control_number IN ('TTMPCL-740', 'TTMPCL-741', 'TTMPCL-742');

-- auto: TOSCANO, LORNA (2 loan(s)) -> member da7d731e-ebd3-4b63-be28-fdb8d9ecb2f0
UPDATE public.loans SET member_id = 'da7d731e-ebd3-4b63-be28-fdb8d9ecb2f0' WHERE control_number IN ('TTMPCL-743', 'TTMPCL-744');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('9eee42c5-de9c-4b5f-999a-7f96bfa4a004', 'da7d731e-ebd3-4b63-be28-fdb8d9ecb2f0', FALSE, 'auto match: TOSCANO, LORNA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: TUAZON, WARLITO (4 loan(s)) -> member f8159f64-3a42-42e1-9828-89ee211faa55
UPDATE public.loans SET member_id = 'f8159f64-3a42-42e1-9828-89ee211faa55' WHERE control_number IN ('TTMPCL-747', 'TTMPCL-748', 'TTMPCL-749', 'TTMPCL-750');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('f54c2267-609e-495e-bd58-0edfe9379c4c', 'f8159f64-3a42-42e1-9828-89ee211faa55', FALSE, 'auto match: TUAZON, WARLITO') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- auto: UY, WARLITA (2 loan(s)) -> member 6b4d5963-bef1-418a-a914-36f42f190234
UPDATE public.loans SET member_id = '6b4d5963-bef1-418a-a914-36f42f190234' WHERE control_number IN ('TTMPCL-751', 'TTMPCL-752');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('832cedd2-18cb-4467-bdf2-67c89cabcc42', '6b4d5963-bef1-418a-a914-36f42f190234', FALSE, 'auto match: UY, WARLITA') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- fuzzy: BUSTILLO, ROBERTO JR (5 loan(s)) -> member 2f882ec1-43b6-44a3-852a-d15f254dbe96
UPDATE public.loans SET member_id = '2f882ec1-43b6-44a3-852a-d15f254dbe96' WHERE control_number IN ('TTMPCL-032', 'TTMPCL-033', 'TTMPCL-034', 'TTMPCL-035', 'TTMPCL-036');

-- fuzzy: DUEÑAS, MARIA FRANCIFEL (4 loan(s)) -> member cee4a173-7d17-4aae-9648-e6c69e3da46f
UPDATE public.loans SET member_id = 'cee4a173-7d17-4aae-9648-e6c69e3da46f' WHERE control_number IN ('TTMPCL-138', 'TTMPCL-139', 'TTMPCL-140', 'TTMPCL-141');

-- fuzzy: GOMEZ, HAZEL JOY (3 loan(s)) -> member 82fca495-8381-45e2-b7ce-20b65fbe017b
UPDATE public.loans SET member_id = '82fca495-8381-45e2-b7ce-20b65fbe017b' WHERE control_number IN ('TTMPCL-219', 'TTMPCL-220', 'TTMPCL-221');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('fbf08454-23b1-4e97-a2b5-da7c8b2a56bd', '82fca495-8381-45e2-b7ce-20b65fbe017b', FALSE, 'fuzzy match: GOMEZ, HAZEL JOY') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- fuzzy: SALIBIO, ARNOLFO (1 loan(s)) -> member 6f92e467-8de5-4894-8b97-6df3ea1e3437
UPDATE public.loans SET member_id = '6f92e467-8de5-4894-8b97-6df3ea1e3437' WHERE control_number IN ('TTMPCL-318');

-- fuzzy: TABUADA, AZRIEL JOY (1 loan(s)) -> member 88282fdf-f9d8-478f-b411-d40a26a36e2a
UPDATE public.loans SET member_id = '88282fdf-f9d8-478f-b411-d40a26a36e2a' WHERE control_number IN ('TTMPCL-449');

-- fuzzy: TACSAGON, MLR (5 loan(s)) -> member ccd0c723-2cf0-4926-950f-4c68357d08c1
UPDATE public.loans SET member_id = 'ccd0c723-2cf0-4926-950f-4c68357d08c1' WHERE control_number IN ('TTMPCL-517', 'TTMPCL-518', 'TTMPCL-519', 'TTMPCL-520', 'TTMPCL-521');

-- fuzzy: TAGACAY, JAY R (3 loan(s)) -> member 6665eca7-048a-4593-833d-ef9f79e33432
UPDATE public.loans SET member_id = '6665eca7-048a-4593-833d-ef9f79e33432' WHERE control_number IN ('TTMPCL-575', 'TTMPCL-576', 'TTMPCL-577');

-- fuzzy: TAGHAP, SHELLA MAY (2 loan(s)) -> member 77476957-7d13-4928-b3eb-1e01b8657019
UPDATE public.loans SET member_id = '77476957-7d13-4928-b3eb-1e01b8657019' WHERE control_number IN ('TTMPCL-590', 'TTMPCL-591');

-- fuzzy: TAGUDANDO, FERNANDO JR (6 loan(s)) -> member d2872cd0-a4e1-44d0-8124-fe72f719cf28
UPDATE public.loans SET member_id = 'd2872cd0-a4e1-44d0-8124-fe72f719cf28' WHERE control_number IN ('TTMPCL-599', 'TTMPCL-600', 'TTMPCL-601', 'TTMPCL-602', 'TTMPCL-603', 'TTMPCL-604');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('1027fb71-2315-445e-95bf-8eddcd83ea2f', 'd2872cd0-a4e1-44d0-8124-fe72f719cf28', FALSE, 'fuzzy match: TAGUDANDO, FERNANDO JR') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- fuzzy: TAGUDINAY, RODELYN (4 loan(s)) -> member e8e63a14-e853-46e2-81e4-01574761ba2c
UPDATE public.loans SET member_id = 'e8e63a14-e853-46e2-81e4-01574761ba2c' WHERE control_number IN ('TTMPCL-612', 'TTMPCL-613', 'TTMPCL-614', 'TTMPCL-615');

-- fuzzy: TALIPAN, MA EMMA GRACE (5 loan(s)) -> member 27d6de32-666d-4925-8ee9-97816ffee1f7
UPDATE public.loans SET member_id = '27d6de32-666d-4925-8ee9-97816ffee1f7' WHERE control_number IN ('TTMPCL-646', 'TTMPCL-647', 'TTMPCL-648', 'TTMPCL-649', 'TTMPCL-650');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('7d38b783-c146-414f-856a-7e09c4b9f395', '27d6de32-666d-4925-8ee9-97816ffee1f7', FALSE, 'fuzzy match: TALIPAN, MA EMMA GRACE') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

-- fuzzy: TAMISES, EUGENIO JR (4 loan(s)) -> member 348b3428-bb22-4507-b6d4-56ef9aded5c9
UPDATE public.loans SET member_id = '348b3428-bb22-4507-b6d4-56ef9aded5c9' WHERE control_number IN ('TTMPCL-680', 'TTMPCL-681', 'TTMPCL-682', 'TTMPCL-683');

-- fuzzy: TANO, JACOBO JR (4 loan(s)) -> member 66ed486d-a1c9-4fc0-ab32-de8d9411b0f5
UPDATE public.loans SET member_id = '66ed486d-a1c9-4fc0-ab32-de8d9411b0f5' WHERE control_number IN ('TTMPCL-718', 'TTMPCL-719', 'TTMPCL-720', 'TTMPCL-721');
INSERT INTO public.legacy_member_link (legacy_master_uuid, member_id, marked_no_history, notes) VALUES ('a696d393-6ed9-46ca-9010-c34db6856bc9', '66ed486d-a1c9-4fc0-ab32-de8d9411b0f5', FALSE, 'fuzzy match: TANO, JACOBO JR') ON CONFLICT (legacy_master_uuid) DO UPDATE SET member_id = EXCLUDED.member_id, marked_no_history = FALSE, notes = EXCLUDED.notes;

COMMIT;