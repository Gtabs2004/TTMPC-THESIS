-- =============================================================================
-- ACCOUNT LIST — every account, with stored password   (READ-ONLY)
-- =============================================================================
-- Run in the Supabase SQL editor, then export the result to CSV/Excel with the
-- editor's own download button (top-right of the results panel).
--
-- *** THE OUTPUT IS A WORKING CREDENTIAL LIST. ***
-- Anyone holding the file can sign in as any member or staff account in it.
-- Keep it off shared drives and email; delete it when the handover is done.
--
-- WHERE THE PASSWORD COMES FROM
--   Supabase Auth itself stores only a bcrypt hash — the plaintext is NOT
--   recoverable from auth.users. What IS readable is `member_account.password`,
--   which the provisioning code writes alongside the hash.
--
--   The convention is `<LastName>1234`, from _build_default_password()
--   (applicationConfirmation.py:361) — non-alphanumerics stripped, so
--   "Delos Santos" -> DelosSantos1234, "Ca-aya" -> Caaya1234, and a blank
--   surname falls back to member1234.
--
-- THE IMPORTANT CAVEAT
--   That column is only true while the account is still on its default.
--   If someone has changed their password, auth.users holds the new hash and
--   this column is STALE — it will show the old default, which no longer works.
--   `is_temporary` is the flag that tells you which is which:
--     true  -> never changed, the password below is live
--     false -> changed, the password below is out of date
-- =============================================================================

SELECT
  ma.membership_id                                   AS membership_id,
  btrim(concat_ws(' ',
    m.first_name,
    nullif(btrim(coalesce(m.middle_initial, '')), ''),
    m.last_name))                                    AS member_name,
  ma.email                                           AS email,
  ma.role                                            AS role,

  -- The credential itself.
  ma.password                                        AS password,

  -- Is that password still the live one?
  CASE
    WHEN ma.is_temporary IS TRUE  THEN 'yes - never changed'
    WHEN ma.is_temporary IS FALSE THEN 'NO - user changed it, value is stale'
    ELSE 'unknown'
  END                                                AS password_still_valid,

  -- Can this account actually sign in? Imported members have no auth row until
  -- the backfill runs (POST /api/admin/backfill-member-auth).
  CASE
    WHEN ma.auth_user_id IS NULL THEN 'NO - no auth account, cannot sign in'
    ELSE 'yes'
  END                                                AS can_sign_in,

  lower(coalesce(m.member_status, 'active'))         AS member_status,
  ma.auth_user_id                                    AS auth_user_id,
  ma.user_id                                         AS user_id

FROM public.member_account ma
LEFT JOIN public.member m ON m.membership_id = ma.membership_id
ORDER BY
  -- Staff first (they are the ones usually needed for testing), then members.
  CASE WHEN lower(coalesce(ma.role, '')) = 'member' THEN 1 ELSE 0 END,
  lower(coalesce(ma.role, '')),
  ma.membership_id;


-- =============================================================================
-- SUMMARY — run separately if you want the shape of it first
-- =============================================================================
-- SELECT
--   coalesce(ma.role, '(no role)')                        AS role,
--   count(*)                                              AS accounts,
--   count(*) FILTER (WHERE ma.auth_user_id IS NOT NULL)   AS can_sign_in,
--   count(*) FILTER (WHERE ma.is_temporary IS TRUE)       AS still_on_default,
--   count(*) FILTER (WHERE ma.password IS NULL)           AS no_password_stored
-- FROM public.member_account ma
-- GROUP BY ma.role
-- ORDER BY 1;
