-- =============================================================================
-- Which form of "<LastName>1234" actually matches?   (READ-ONLY)
-- =============================================================================
-- Check 24 tested ONE spelling and got 0 of 256. But the accounts DO log in
-- with LastName1234 and were never changed — so the guess was built wrong, not
-- the convention.
--
-- The member table stores surnames in UPPERCASE ("GARGARITANO", "TABAGO"),
-- while a password created from a differently-cased source would hash
-- differently. bcrypt is case-sensitive: GARGARITANO1234, Gargaritano1234 and
-- gargaritano1234 are three different passwords.
--
-- This tries every plausible form against the real hashes and reports which
-- one wins. Reads only; nothing is written.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1 — try every variant, count the matches
-- -----------------------------------------------------------------------------
WITH base AS (
  SELECT
    ma.membership_id,
    ma.password                                                   AS h,
    regexp_replace(coalesce(m.last_name, ''),  '[^A-Za-z0-9]', '', 'g') AS ln,
    regexp_replace(coalesce(m.first_name, ''), '[^A-Za-z0-9]', '', 'g') AS fn
  FROM public.member_account ma
  LEFT JOIN public.member m ON m.membership_id = ma.membership_id
  WHERE ma.password ~ '^\$2[aby]\$'
),
tests AS (
  SELECT
    h,
    -- surname, exactly as stored (usually UPPERCASE here)
    extensions.crypt(ln            || '1234', h) = h AS as_stored,
    -- Capitalised: first letter upper, rest lower  -> "Gargaritano1234"
    extensions.crypt(initcap(lower(ln)) || '1234', h) = h AS capitalised,
    -- all lower                                    -> "gargaritano1234"
    extensions.crypt(lower(ln)     || '1234', h) = h AS lowercase,
    -- all upper                                    -> "GARGARITANO1234"
    extensions.crypt(upper(ln)     || '1234', h) = h AS uppercase,
    -- first name instead of surname
    extensions.crypt(initcap(lower(fn)) || '1234', h) = h AS firstname_cap,
    extensions.crypt(lower(fn)     || '1234', h) = h AS firstname_lower,