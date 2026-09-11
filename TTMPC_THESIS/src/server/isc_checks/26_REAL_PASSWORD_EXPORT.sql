-- =============================================================================
-- THE REAL EXPORT — verified against auth.users, not member_account   (READ-ONLY)
-- =============================================================================
-- 25_WHY_NO_MATCH.sql found the actual bug: the login checks
-- auth.users.encrypted_password, NOT member_account.password. Every earlier
-- query (21, 23, 24) tested the guess against the WRONG hash, which is why
-- 24 came back 0/256 even though LastName1234 genuinely works at the form.
--
-- Confirmed on TTMPC-055 (GARGARITANO): the surname AS STORED (already CAPS
-- in public.member), with "1234" appended, verifies against
-- auth.users.encrypted_password. No case transform needed — just the raw
-- last_name value.
--
-- Safe: reads only. Nothing is written or modified.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1 — how many of the 256 "hashed" accounts actually match now?
-- -----------------------------------------------------------------------------
-- Re-runs 24's question against the CORRECT hash column.
-- -----------------------------------------------------------------------------
WITH guessed AS (
  SELECT
    ma.membership_id,
    au.encrypted_password                                            AS real_hash,
    regexp_replace(coalesce(m.last_name, ''), '[^A-Za-z0-9]', '', 'g') || '1234'
                                                                       AS guess
  FROM public.member_account ma
  LEFT JOIN public.member m  ON m.membership_id = ma.membership_id
  LEFT JOIN auth.users au    ON au.id = ma.auth_user_id
  WHERE ma.auth_user_id IS NOT NULL
)
SELECT
  count(*)                                                            AS accounts_with_auth,
  count(*) FILTER (WHERE real_hash IS NULL)                           AS no_auth_password_set,
  count(*) FILTER (WHERE extensions.crypt(guess, real_hash) = real_hash) AS default_still_works,
  count(*) FILTER (WHERE real_hash IS NOT NULL
                     AND extensions.crypt(guess, real_hash) <> real_hash) AS password_was_changed,
  round(100.0 * count(*) FILTER (WHERE extensions.crypt(guess, real_hash) = real_hash)
        / nullif(count(*) FILTER (WHERE real_hash IS NOT NULL), 0), 1)  AS pct_on_default
FROM guessed;


-- -----------------------------------------------------------------------------
-- PART 2 — THE EXPORT: every account whose default password is VERIFIED
-- -----------------------------------------------------------------------------
-- This is the one to download. `password` is the real, working login for
-- every row — checked against auth.users, the table the login form actually
-- uses.
--
-- *** Live credentials. Keep the file off shared drives and email. ***
-- -----------------------------------------------------------------------------
SELECT
  ma.membership_id,
  btrim(concat_ws(' ',
    m.first_name,
    nullif(btrim(coalesce(m.middle_initial, '')), ''),
    m.last_name))                                                    AS member_name,
  ma.email,
  ma.role,
  regexp_replace(coalesce(m.last_name, ''), '[^A-Za-z0-9]', '', 'g') || '1234'
                                                                       AS password,
  'verified against auth.users'                                      AS source
FROM public.member_account ma
LEFT JOIN public.member m  ON m.membership_id = ma.membership_id
LEFT JOIN auth.users au    ON au.id = ma.auth_user_id
WHERE ma.auth_user_id IS NOT NULL
  AND au.encrypted_password IS NOT NULL
  AND extensions.crypt(
        regexp_replace(coalesce(m.last_name, ''), '[^A-Za-z0-9]', '', 'g') || '1234',
        au.encrypted_password
      ) = au.encrypted_password
ORDER BY
  CASE WHEN lower(coalesce(ma.role, '')) = 'member' THEN 1 ELSE 0 END,
  lower(coalesce(ma.role, '')),
  ma.membership_id;


-- -----------------------------------------------------------------------------
-- PART 3 — the ones this does NOT cover
-- -----------------------------------------------------------------------------
-- Either no auth account yet, or the password was genuinely changed from the
-- default. These need a password RESET, not recovery.
-- -----------------------------------------------------------------------------
SELECT
  ma.membership_id,
  btrim(concat_ws(' ', m.first_name, m.last_name))                    AS member_name,
  ma.email,
  ma.role,
  CASE
    WHEN ma.auth_user_id IS NULL       THEN 'no auth account — cannot sign in at all'
    WHEN au.encrypted_password IS NULL THEN 'auth account exists, no password set'
    ELSE 'password changed from the default'
  END                                                                 AS why_not
FROM public.member_account ma
LEFT JOIN public.member m  ON m.membership_id = ma.membership_id
LEFT JOIN auth.users au    ON au.id = ma.auth_user_id
WHERE ma.auth_user_id IS NULL
   OR au.encrypted_password IS NULL
   OR extensions.crypt(
        regexp_replace(coalesce(m.last_name, ''), '[^A-Za-z0-9]', '', 'g') || '1234',
        au.encrypted_password
      ) <> au.encrypted_password
ORDER BY
  CASE WHEN lower(coalesce(ma.role, '')) = 'member' THEN 1 ELSE 0 END,
  ma.membership_id;
