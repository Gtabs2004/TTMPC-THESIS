-- =============================================================================
-- FASTER EXPORT — same result as 26 Part 2, crypt() computed once per row
-- =============================================================================
-- The original inlines the same crypt(guess, hash) expression in the WHERE
-- clause. Postgres may or may not re-evaluate it once vs relying on caching
-- ordering — putting it in a CTE column makes it explicit and guaranteed
-- single-evaluation per row, avoiding any duplicate bcrypt work.
--
-- Still ~293 bcrypt verifications total (that part is unavoidable — bcrypt is
-- deliberately expensive), but this removes any doubled work and only touches
-- rows that could plausibly match (auth_user_id set, password set).
-- =============================================================================

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
),
checked AS (
  SELECT
    *,
    (extensions.crypt(guess, hash) = hash) AS matches   -- computed ONCE here
  FROM candidates
)
SELECT
  membership_id,
  btrim(concat_ws(' ', first_name, nullif(btrim(coalesce(middle_initial, '')), ''), last_name)) AS member_name,
  email,
  role,
  guess AS password,
  'verified against auth.users' AS source
FROM checked
WHERE matches
ORDER BY
  CASE WHEN lower(coalesce(role, '')) = 'member' THEN 1 ELSE 0 END,
  lower(coalesce(role, '')),
  membership_id;
