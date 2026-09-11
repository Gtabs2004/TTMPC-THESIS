-- =============================================================================
-- Does "<LastName>1234" still work for the hashed accounts?   (READ-ONLY)
-- =============================================================================
-- The convention is real: _build_default_password() returns
-- "<LastName>1234" with non-alphanumerics stripped
-- (applicationConfirmation.py:361).
--
-- But a bcrypt hash tells you NOTHING about what it hashes. An account whose
-- member changed their password looks identical to one that never did. So a
-- list reconstructed from surnames would be right for some rows and silently
-- wrong for others — and you could not tell which.
--
-- WHAT THIS DOES INSTEAD
--   pgcrypto's crypt() cannot REVERSE a hash, but it can TEST a guess against
--   one:  extensions.crypt(guess, stored_hash) = stored_hash
--   So each account gets a verified yes/no rather than an assumption.
--
-- SAFETY
--   Reads only. Changes nothing. No password is written or modified.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 0 — is pgcrypto available?  Run this first.
-- -----------------------------------------------------------------------------
-- Supabase ships it, usually in the "extensions" schema. If installed = false,
-- enable it under Database -> Extensions -> pgcrypto, then re-run.
-- -----------------------------------------------------------------------------
SELECT
  'pgcrypto'                                              AS extension,
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto')   AS installed,
  (SELECT n.nspname FROM pg_extension e
     JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pgcrypto')                         AS in_schema;


-- -----------------------------------------------------------------------------
-- PART 1 — how many hashed accounts still use the default?
-- -----------------------------------------------------------------------------
-- pgcrypto lives in the "extensions" schema on this project (confirmed
-- 2026-09-11), so every crypt() call below is qualified as extensions.crypt().
-- -----------------------------------------------------------------------------
WITH guessed AS (
  SELECT
    ma.membership_id,
    ma.password AS stored_hash,
    -- Rebuild the default exactly as the Python does: strip every
    -- non-alphanumeric from the surname, then append 1234.
    regexp_replace(coalesce(m.last_name, ''), '[^A-Za-z0-9]', '', 'g') || '1234'
      AS guess
  FROM public.member_account ma
  LEFT JOIN public.member m ON m.membership_id = ma.membership_id
  WHERE ma.password ~ '^\$2[aby]\$'
)
SELECT
  count(*)                                                      AS hashed_accounts,
  count(*) FILTER (WHERE extensions.crypt(guess, stored_hash) = stored_hash) AS default_still_works,
  count(*) FILTER (WHERE extensions.crypt(guess, stored_hash) <> stored_hash) AS password_was_changed,
  round(100.0 * count(*) FILTER (WHERE extensions.crypt(guess, stored_hash) = stored_hash)
        / nullif(count(*), 0), 1)                               AS pct_on_default
FROM guessed;


-- -----------------------------------------------------------------------------
-- PART 2 — THE LIST: every account with a password that actually works
-- -----------------------------------------------------------------------------
-- Combines both groups into one export:
--   * the 22 rows stored as plaintext
--   * every hashed row where "<LastName>1234" is VERIFIED correct
--
-- Rows whose password was changed are excluded — there is genuinely nothing to
-- put in the column for them.
--
-- *** Live credentials. Keep the file off shared drives and email. ***
-- -----------------------------------------------------------------------------
WITH resolved AS (
  SELECT
    ma.membership_id,
    btrim(concat_ws(' ',
      m.first_name,
      nullif(btrim(coalesce(m.middle_initial, '')), ''),
      m.last_name))                                             AS member_name,
    ma.email,
    ma.role,
    ma.auth_user_id,
    regexp_replace(coalesce(m.last_name, ''), '[^A-Za-z0-9]', '', 'g') || '1234'
      AS default_guess,
    ma.password                                                 AS stored,
    (ma.password ~ '^\$2[aby]\$')                               AS is_hash
  FROM public.member_account ma
  LEFT JOIN public.member m ON m.membership_id = ma.membership_id
  WHERE ma.password IS NOT NULL
)
SELECT
  membership_id,
  member_name,
  email,
  role,
  CASE
    WHEN NOT is_hash THEN stored                 -- already readable
    ELSE default_guess                           -- verified below
  END                                                           AS password,
  CASE
    WHEN NOT is_hash THEN 'stored as plaintext'
    ELSE 'verified against the hash'
  END                                                           AS source,
  CASE WHEN auth_user_id IS NULL
       THEN 'NO — no auth account yet' ELSE 'yes' END           AS can_sign_in
FROM resolved
WHERE NOT is_hash
   OR extensions.crypt(default_guess, stored) = stored
ORDER BY
  CASE WHEN lower(coalesce(role, '')) = 'member' THEN 1 ELSE 0 END,
  lower(coalesce(role, '')),
  membership_id;


-- -----------------------------------------------------------------------------
-- PART 3 — the ones still unavailable, and why
-- -----------------------------------------------------------------------------
-- Accounts whose password was changed from the default, plus the 19 with
-- nothing stored. No password column: there is nothing recoverable to show.
--
-- To get into one of these, RESET it rather than trying to read it:
--   Supabase dashboard -> Authentication -> the user -> Reset password
--   or  supabase.auth.admin.update_user_by_id(user_id, {"password": "..."})
-- -----------------------------------------------------------------------------
WITH resolved AS (
  SELECT
    ma.membership_id, ma.email, ma.role, ma.password, ma.auth_user_id,
    btrim(concat_ws(' ', m.first_name, m.last_name))            AS member_name,
    regexp_replace(coalesce(m.last_name, ''), '[^A-Za-z0-9]', '', 'g') || '1234'
      AS default_guess
  FROM public.member_account ma
  LEFT JOIN public.member m ON m.membership_id = ma.membership_id
)
SELECT
  membership_id,
  member_name,
  email,
  role,
  CASE
    WHEN password IS NULL THEN 'no password stored'
    ELSE 'changed from the default — hash cannot be reversed'
  END                                                           AS why_not
FROM resolved
WHERE password IS NULL
   OR (password ~ '^\$2[aby]\$' AND extensions.crypt(default_guess, password) <> password)
ORDER BY
  CASE WHEN lower(coalesce(role, '')) = 'member' THEN 1 ELSE 0 END,
  membership_id;
