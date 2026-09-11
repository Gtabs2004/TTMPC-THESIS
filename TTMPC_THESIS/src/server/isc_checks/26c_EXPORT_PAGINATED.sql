-- =============================================================================
-- PAGINATED EXPORT — run each part separately, export each, then combine
-- =============================================================================
-- The Supabase SQL editor caps results/export at 100 rows regardless of the
-- query. 276 matching rows means 3 pages. Run PART 1, export, run PART 2,
-- export, run PART 3, export. Then paste the 3 CSVs together (keep only one
-- header row).
--
-- To avoid recomputing all ~293 bcrypt checks three times, we materialize the
-- matches ONCE into a temp table, then just page through that (cheap).
-- =============================================================================

-- Step 0 — run this ONCE. Builds the full verified list into a temp table.
-- (Temp tables are session-scoped — stays available for the SELECTs below as
-- long as you don't open a new query tab / reconnect.)
DROP TABLE IF EXISTS _isc_password_export;
CREATE TEMP TABLE _isc_password_export AS
WITH candidates AS (
  SELECT
    ma.membership_id,
    ma.email,
    ma.role,
    m.first_name,
    m.middle_initial,
    m.last_name,
    au.encrypted_password AS hash,
    regexp_replace(coalesce(m.last_name, ''), '[^A-Za-z0-9]', '', 'g') || '1234' AS guess
  FROM public.member_account ma
  LEFT JOIN public.member m ON m.membership_id = ma.membership_id
  LEFT JOIN auth.users au ON au.id = ma.auth_user_id
  WHERE ma.auth_user_id IS NOT NULL
    AND au.encrypted_password IS NOT NULL
)
SELECT
  membership_id,
  btrim(concat_ws(' ', first_name, nullif(btrim(coalesce(middle_initial, '')), ''), last_name)) AS member_name,
  email,
  role,
  guess AS password,
  'verified against auth.users' AS source,
  row_number() OVER (
    ORDER BY
      CASE WHEN lower(coalesce(role, '')) = 'member' THEN 1 ELSE 0 END,
      lower(coalesce(role, '')),
      membership_id
  ) AS rn
FROM candidates
WHERE extensions.crypt(guess, hash) = hash;

-- Check the count matches Part 1's 276
SELECT count(*) AS total_rows FROM _isc_password_export;


-- -----------------------------------------------------------------------------
-- PART 1 — rows 1-100. Run this, then Export.
-- -----------------------------------------------------------------------------
SELECT membership_id, member_name, email, role, password, source
FROM _isc_password_export
WHERE rn BETWEEN 1 AND 100
ORDER BY rn;


-- -----------------------------------------------------------------------------
-- PART 2 — rows 101-200. Run this, then Export.
-- -----------------------------------------------------------------------------
-- SELECT membership_id, member_name, email, role, password, source
-- FROM _isc_password_export
-- WHERE rn BETWEEN 101 AND 200
-- ORDER BY rn;


-- -----------------------------------------------------------------------------
-- PART 3 — rows 201+ (last chunk). Run this, then Export.
-- -----------------------------------------------------------------------------
-- SELECT membership_id, member_name, email, role, password, source
-- FROM _isc_password_export
-- WHERE rn >= 201
-- ORDER BY rn;
