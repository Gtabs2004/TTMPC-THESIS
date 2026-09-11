-- =============================================================================
-- What is actually stored in member_account.password?   (READ-ONLY)
-- =============================================================================
-- Run this BEFORE 21_ACCOUNT_LIST.sql. It decides whether that export is
-- useful or pointless.
--
-- WHY THE QUESTION IS OPEN
--   The Python writes what LOOKS like plaintext:
--       password = _build_default_password(last_name)   # -> "Tabiolo1234"
--       update_payload["password"] = password           # main.py:11179, 11200
--   and there is no bcrypt/passlib anywhere in the codebase (the only hashing
--   is SHA-256, used for OTP codes and webhook signatures — never for this
--   column).
--
--   But the column may still hold hashes: rows created by a different route,
--   an older migration, or a Supabase-side default could have written them.
--
-- HOW TO READ THE RESULT
--   A bcrypt hash always starts "$2a$", "$2b$" or "$2y$" and is exactly 60
--   characters. Plaintext will not match that.
--
--   If the verdict says PLAINTEXT  -> 21_ACCOUNT_LIST.sql works as written.
--   If it says HASHED              -> the password cannot be recovered. Bcrypt
--                                     is one-way; there is no decrypt function
--                                     and no setting that reveals it. Use the
--                                     reset options at the bottom instead.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1 — the verdict
-- -----------------------------------------------------------------------------
SELECT
  count(*)                                                          AS rows_total,
  count(ma.password)                                                AS password_not_null,
  count(*) FILTER (WHERE ma.password ~ '^\$2[aby]\$')               AS looks_like_bcrypt,
  count(*) FILTER (WHERE ma.password IS NOT NULL
                     AND ma.password !~ '^\$2[aby]\$')              AS looks_like_plaintext,
  max(length(ma.password))                                          AS longest_value,
  CASE
    WHEN count(ma.password) = 0
      THEN 'EMPTY — no passwords stored at all'
    WHEN count(*) FILTER (WHERE ma.password ~ '^\$2[aby]\$') > 0
     AND count(*) FILTER (WHERE ma.password IS NOT NULL
                            AND ma.password !~ '^\$2[aby]\$') > 0
      THEN 'MIXED — some hashed, some plaintext'
    WHEN count(*) FILTER (WHERE ma.password ~ '^\$2[aby]\$') > 0
      THEN 'HASHED — cannot be recovered, see the note at the bottom'
    ELSE 'PLAINTEXT — 21_ACCOUNT_LIST.sql will work'
  END                                                               AS verdict
FROM public.member_account ma;


-- -----------------------------------------------------------------------------
-- PART 2 — see it for yourself (masked)
-- -----------------------------------------------------------------------------
-- Shows only the first 4 characters and the length, so you can tell the shape
-- without putting real credentials on screen.
--
--   "Tabi… (11 chars)"  -> plaintext, matches <LastName>1234
--   "$2b$… (60 chars)"  -> bcrypt hash, unrecoverable
-- -----------------------------------------------------------------------------
SELECT
  ma.role,
  ma.membership_id,
  CASE
    WHEN ma.password IS NULL THEN '(null)'
    ELSE left(ma.password, 4) || '… (' || length(ma.password) || ' chars)'
  END                                                               AS password_shape,
  CASE
    WHEN ma.password IS NULL              THEN 'none stored'
    WHEN ma.password ~ '^\$2[aby]\$'      THEN 'BCRYPT HASH — not recoverable'
    ELSE 'plaintext'
  END                                                               AS kind,
  ma.is_temporary
FROM public.member_account ma
ORDER BY
  CASE WHEN lower(coalesce(ma.role, '')) = 'member' THEN 1 ELSE 0 END,
  ma.membership_id
LIMIT 20;


-- =============================================================================
-- IF THE VERDICT IS "HASHED"
-- =============================================================================
-- There is no way to convert it back. Bcrypt is a one-way function — that is
-- its entire purpose, and it is what protects the cooperative's members if the
-- database is ever copied. No Postgres setting, extension or Supabase option
-- reveals the original.
--
-- What works instead, depending on what you actually need:
--
--   1. YOU NEED TO LOG IN AS SOMEONE (testing a portal)
--      Impersonate in SQL — no password required. This is what we used for the
--      bookkeeper in isc_checks/13_POST_ONE_BLOCK.sql:
--
--        PERFORM set_config('request.jwt.claims',
--          json_build_object('sub', '<auth_user_id>', 'email', '<email>',
--                            'role', 'authenticated')::text, true);
--
--   2. YOU NEED A WORKING PASSWORD FOR AN ACCOUNT
--      Set a new one — Supabase dashboard → Authentication → the user →
--      "Reset password", or from the backend:
--
--        supabase.auth.admin.update_user_by_id(user_id, {"password": "..."})
--
--      You choose the value, so you know it. main.py:12238 already does this.
--
--   3. YOU NEED A HANDOVER SHEET
--      Reset each staff account to a known password and record those. The sheet
--      then reflects reality rather than guessing at it.
--
-- In every case the answer is to SET a password you know, never to recover one.
-- =============================================================================
