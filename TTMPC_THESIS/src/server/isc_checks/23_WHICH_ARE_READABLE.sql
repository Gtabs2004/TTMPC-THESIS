-- =============================================================================
-- Which accounts have a READABLE password, and which do not?   (READ-ONLY)
-- =============================================================================
-- Measured 2026-09-11 on 297 accounts:
--     256  bcrypt hash    -> NOT recoverable, ever
--      22  plaintext      -> readable
--      19  nothing stored
--
-- This splits them so you can see whether the 22 cover what you actually need.
-- Staff accounts are the ones usually wanted for testing; if they are in the
-- readable group, the 256 hashed member rows may not matter.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1 — the split, by role
-- -----------------------------------------------------------------------------
SELECT
  coalesce(ma.role, '(no role)')                                     AS role,
  count(*)                                                           AS accounts,
  count(*) FILTER (WHERE ma.password IS NOT NULL
                     AND ma.password !~ '^\$2[aby]\$')               AS readable,
  count(*) FILTER (WHERE ma.password ~ '^\$2[aby]\$')                AS hashed,
  count(*) FILTER (WHERE ma.password IS NULL)                        AS none_stored,
  count(*) FILTER (WHERE ma.auth_user_id IS NULL)                    AS cannot_sign_in
FROM public.member_account ma
GROUP BY ma.role
ORDER BY
  CASE WHEN lower(coalesce(ma.role, '')) = 'member' THEN 1 ELSE 0 END,
  lower(coalesce(ma.role, ''));


-- -----------------------------------------------------------------------------
-- PART 2 — THE USABLE LIST: only accounts whose password actually works
-- -----------------------------------------------------------------------------
-- Export THIS one, not 21_ACCOUNT_LIST.sql. Every row here carries a real,
-- working credential — a hashed row would only give you a 60-character string
-- that cannot be typed into a login form.
--
-- *** These are live credentials. Keep the file off shared drives and email. ***
-- -----------------------------------------------------------------------------
SELECT
  ma.membership_id,
  btrim(concat_ws(' ',
    m.first_name,
    nullif(btrim(coalesce(m.middle_initial, '')), ''),
    m.last_name))                                                    AS member_name,
  ma.email,
  ma.role,
  ma.password                                                        AS password,
  CASE
    WHEN ma.auth_user_id IS NULL THEN 'NO — no auth account yet'
    WHEN ma.is_temporary IS TRUE THEN 'yes — still the default'
    ELSE 'probably not — user may have changed it'
  END                                                                AS still_works
FROM public.member_account ma
LEFT JOIN public.member m ON m.membership_id = ma.membership_id
WHERE ma.password IS NOT NULL
  AND ma.password !~ '^\$2[aby]\$'
ORDER BY
  CASE WHEN lower(coalesce(ma.role, '')) = 'member' THEN 1 ELSE 0 END,
  lower(coalesce(ma.role, '')),
  ma.membership_id;


-- -----------------------------------------------------------------------------
-- PART 3 — the accounts you CANNOT get a password for
-- -----------------------------------------------------------------------------
-- 256 hashed + 19 empty. Listed without the password column, because there is
-- nothing useful to show: a bcrypt hash is not a credential you can use.
--
-- To get into any of these, RESET the password rather than trying to read it:
--   Supabase dashboard -> Authentication -> the user -> Reset password
--   or  supabase.auth.admin.update_user_by_id(user_id, {"password": "..."})
-- You choose the value, so you know it.
-- -----------------------------------------------------------------------------
SELECT
  ma.membership_id,
  btrim(concat_ws(' ', m.first_name, m.last_name))                   AS member_name,
  ma.email,
  ma.role,
  CASE
    WHEN ma.password IS NULL          THEN 'no password stored'
    ELSE 'bcrypt hash — not recoverable'
  END                                                                AS why_not,
  CASE WHEN ma.auth_user_id IS NULL THEN 'no auth account' ELSE 'can sign in' END AS auth_status
FROM public.member_account ma
LEFT JOIN public.member m ON m.membership_id = ma.membership_id
WHERE ma.password IS NULL
   OR ma.password ~ '^\$2[aby]\$'
ORDER BY
  CASE WHEN lower(coalesce(ma.role, '')) = 'member' THEN 1 ELSE 0 END,
  lower(coalesce(ma.role, '')),
  ma.membership_id;


-- =============================================================================
-- WHY THE DEFAULT CONVENTION IS NOT A SHORTCUT
-- =============================================================================
-- _build_default_password() makes "<LastName>1234" (applicationConfirmation.py
-- :361), so it is tempting to reconstruct passwords from surnames instead of
-- reading them.
--
-- That only holds for an account still on its original default and never
-- changed. For the 256 hashed rows you cannot tell which those are — the hash
-- reveals nothing about what it hashes. Guessing would give you a list that is
-- right for some rows and silently wrong for others, which is worse than
-- knowing you do not have them.
-- =============================================================================
