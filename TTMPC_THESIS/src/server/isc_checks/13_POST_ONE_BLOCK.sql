-- =============================================================================
-- ISC CHECK 13  --  POST, as a bookkeeper, in ONE block   *** WRITES ***
-- =============================================================================
-- WHY THIS FILE EXISTS
--   The Supabase SQL editor may use a DIFFERENT CONNECTION for each query you
--   run. set_config(..., false) is SESSION-local, so running it separately from
--   the post leaves auth.uid() NULL again -- which is exactly what happened:
--
--     uid NULL | email NULL | is_bookkeeper false
--
--   Everything below is therefore a SINGLE statement. The claims are set and
--   used inside one execution, so they cannot be lost between queries.
--
-- HOW TO RUN
--   Select this WHOLE FILE and press Run. Do not run it line by line.
--
-- WHAT IT DOES
--   Sets the session to bookkeeper@gmail.com, verifies the role took effect,
--   then posts Jan-Dec 2026 with a PHP 1,000,000 pool.
--
--   If the role did NOT take effect it raises instead of posting, so a failed
--   impersonation can never post as nobody.
-- =============================================================================

DO $$
DECLARE
  v_posting_id uuid;
  v_uid        uuid;
  v_email      text;
  v_ok         boolean;
BEGIN
  -- --- become the bookkeeper -------------------------------------------------
  -- auth_user_id, NOT user_id. auth.uid() returns auth_user_id; user_id is a
  -- member row. Confusing the two caused bugs 4 and 6 in the Sep-6 build (§0).
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',   'e7e2ed14-1b67-4c55-a010-2911c0fc6bc3',
      'email', 'bookkeeper@gmail.com',
      'role',  'authenticated'
    )::text,
    true                    -- true = local to this transaction
  );

  v_uid   := auth.uid();
  v_email := auth.email();
  v_ok    := public.has_portal_role(v_uid, v_email, ARRAY['bookkeeper']);

  RAISE NOTICE 'acting as: uid=% email=% is_bookkeeper=%', v_uid, v_email, v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'Impersonation failed (uid=%, email=%). Nothing was posted.', v_uid, v_email;
  END IF;

  -- --- post ------------------------------------------------------------------
  v_posting_id := public.isc_post('2026-01-01', '2026-12-01', 1000000.00);

  RAISE NOTICE 'POSTED: %', v_posting_id;
END $$;


-- =============================================================================
-- Did it work?  (safe to run separately -- reads only)
-- =============================================================================
SELECT
  p.id                                                     AS posting_id,
  p.status,
  p.period_start,
  p.period_end,
  p.month_count                                            AS months,
  p.total_members                                          AS members,
  to_char(p.allocated_pool,  'FM999,999,999.00')           AS pool,
  round(p.rate, 4)                                         AS rate_pct,
  to_char(p.total_average,   'FM999,999,999.00')           AS total_average,
  to_char(p.total_interest,  'FM999,999,999.00')           AS payouts,
  p.posted_by_email
FROM public.isc_postings p
WHERE p.reverses_posting_id IS NULL
  AND p.status <> 'reversed'
ORDER BY p.posted_at DESC
LIMIT 1;
