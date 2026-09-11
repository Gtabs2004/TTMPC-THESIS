-- =============================================================================
-- Why did 0 of 256 match, when the login IS LastName1234?   (READ-ONLY)
-- =============================================================================
-- 0.0% is the signature of a WRONG GUESS STRING, not of everyone changing
-- their password. If LastName1234 genuinely works at the login form, then the
-- string this project builds must differ from what you type — casing, a space,
-- a middle name, or the hash sitting in a different column.
--
-- This tries several plausible variants of the guess against the real hash so
-- we can see which one matches. Reads only; nothing is written.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1 — pick ONE account you can personally log into, then test variants
-- -----------------------------------------------------------------------------
-- Put that member's membership_id in the WHERE clause below. Each column tries
-- a different way of spelling "<LastName>1234". A `true` shows which the hash
-- was actually made from.
-- -----------------------------------------------------------------------------
WITH one AS (
  SELECT ma.membership_id, ma.email, ma.password AS hash, m.first_name,
         m.middle_initial, m.last_name
  FROM public.member_account ma
  LEFT JOIN public.member m ON m.membership_id = ma.membership_id
  WHERE ma.membership_id = 'TTMPC-055'          -- <-- CHANGE to an account you know
)
SELECT
  membership_id,
  last_name,
  hash IS NOT NULL                                                         AS has_hash,
  -- as the code builds it: strip non-alphanumerics, keep original case
  extensions.crypt(regexp_replace(last_name,'[^A-Za-z0-9]','','g')||'1234', hash) = hash  AS v_asis,
  -- lower case
  extensions.crypt(lower(regexp_replace(last_name,'[^A-Za-z0-9]','','g'))||'1234', hash) = hash AS v_lower,
  -- UPPER case (the member table stores names in CAPS)
  extensions.crypt(upper(regexp_replace(last_name,'[^A-Za-z0-9]','','g'))||'1234', hash) = hash AS v_upper,
  -- Title case (first letter capital)
  extensions.crypt(initcap(regexp_replace(last_name,'[^A-Za-z0-9]','','g'))||'1234', hash) = hash AS v_title,
  -- spaces kept, not stripped
  extensions.crypt(last_name||'1234', hash) = hash                         AS v_with_spaces,
  -- Title-cased with spaces kept
  extensions.crypt(initcap(last_name)||'1234', hash) = hash                AS v_title_spaces
FROM one;


-- -----------------------------------------------------------------------------
-- PART 2 — is the real hash maybe in a DIFFERENT column?
-- -----------------------------------------------------------------------------
-- member_account also has `password_hash`. If `password` holds one thing and
-- the login checks another, that would explain a total mismatch. This shows
-- both, masked.
-- -----------------------------------------------------------------------------
SELECT
  ma.membership_id,
  ma.role,
  CASE WHEN ma.password IS NULL THEN '(null)'
       ELSE left(ma.password,4)||'… ('||length(ma.password)||')' END        AS password_col,
  CASE WHEN ma.password_hash IS NULL THEN '(null)'
       ELSE left(ma.password_hash,4)||'… ('||length(ma.password_hash)||')' END AS password_hash_col
FROM public.member_account ma
WHERE ma.membership_id = 'TTMPC-055'          -- <-- same account
   OR ma.password_hash IS NOT NULL
LIMIT 10;


-- -----------------------------------------------------------------------------
-- PART 3 — the ground truth: check against Supabase Auth's OWN hash
-- -----------------------------------------------------------------------------
-- The login does NOT check member_account at all — it checks
-- auth.users.encrypted_password. THAT is the hash that actually matters. If
-- LastName1234 works at the form, it must verify against THIS column.
--
-- Tries the same variants against auth.users for the one account.
-- -----------------------------------------------------------------------------
WITH one AS (
  SELECT
    ma.membership_id,
    au.encrypted_password AS hash,
    m.last_name
  FROM public.member_account ma
  JOIN auth.users au ON au.id = ma.auth_user_id
  LEFT JOIN public.member m ON m.membership_id = ma.membership_id
  WHERE ma.membership_id = 'TTMPC-055'          -- <-- same account
)
SELECT
  membership_id,
  last_name,
  hash IS NOT NULL                                                           AS auth_has_hash,
  extensions.crypt(regexp_replace(last_name,'[^A-Za-z0-9]','','g')||'1234', hash) = hash AS v_asis,
  extensions.crypt(upper(regexp_replace(last_name,'[^A-Za-z0-9]','','g'))||'1234', hash) = hash AS v_upper,
  extensions.crypt(initcap(regexp_replace(last_name,'[^A-Za-z0-9]','','g'))||'1234', hash) = hash AS v_title,
  extensions.crypt(lower(regexp_replace(last_name,'[^A-Za-z0-9]','','g'))||'1234', hash) = hash AS v_lower
FROM one;
