-- =============================================================================
-- ISC v2 — STEPS 3-5: isc_post, isc_settle_posting, isc_delete_posting,
--                     and the removal of isc_reverse
-- =============================================================================
-- Run AFTER isc_v2_01_schema.sql and isc_v2_02_preview.sql.
--
-- THIS IS THE FIRST FILE THAT WRITES. Everything before it was additive or
-- read-only. Take the §12.5 baseline (isc_checks/03_BASELINE_NUMBERS.sql)
-- IMMEDIATELY before running this -- the table is live and moves during the day
-- (§21.4), so a baseline captured yesterday proves nothing.
--
-- WHAT CHANGES, AND WHY
--
--   1. isc_post STOPS WRITING capital_build_up.            (§14)
--      ISC pays CASH. It becomes share capital only if the member elects that
--      at the March General Assembly. The old isc_post credited every member
--      automatically, which is not what the cooperative does. It now records a
--      PAYABLE: a header row plus one line item per member, and nothing else.
--
--      This removes bugs 1 and 2 from the posting path entirely -- no starting
--      balance is read, no running chain is touched, nothing can go stale.
--
--   2. isc_settle_posting APPLIES THE MARCH CHECKLIST.     (§17.2)
--      Every member defaults to CAPITALISE. The bookkeeper passes the ids of
--      those who want CASH instead. One call, one transaction, all or nothing.
--
--   3. isc_delete_posting REPLACES REVERSAL.               (§17.1)
--      A posting is deletable while every line item is unsettled, and permanent
--      once any member is settled. This works precisely BECAUSE posting no
--      longer moves money: an unsettled posting has moved nothing, so deleting
--      it moves nothing back. That is why reversal was hard before and is
--      unnecessary now.
--
--   4. isc_reverse IS DROPPED.                             (§17.1)
--      With it go the double-reversal guard and the manager-only reverse
--      permission. /manager-isc becomes read-only. Segregation of duties is not
--      lost, it MOVES: correction is possible only before settlement, and after
--      that nobody can alter the record -- a stronger control than reversal,
--      which let one role undo PHP 1.49M after the fact.
--
--   5. BUG 2'S GUARD COMES OUT -- and only now.            (§14.2)
--      `AND cbu.source_isc_id IS NULL` excluded ISC rows from the basis. Once
--      isc_post writes no CBU rows, the only ISC rows in capital_build_up are
--      ELECTED capitalisations, which SHOULD earn interest -- a member who
--      converts their payout into share capital has made a real contribution.
--      Dropping this guard before step 3 lands would reintroduce automatic
--      interest-on-interest, which is why it is last.
-- =============================================================================

BEGIN;


-- =============================================================================
-- STEP 5a — retire the old rate-based entry points
-- =============================================================================
-- isc_post's signature changes (rate -> pool), so the old one must go rather
-- than sit alongside as an overload a caller could reach by accident.
DROP FUNCTION IF EXISTS public.isc_post(date, date, numeric);
DROP FUNCTION IF EXISTS public.isc_reverse(uuid, text);
DROP FUNCTION IF EXISTS public.isc_reverse(uuid);


-- =============================================================================
-- STEP 3 — isc_post: record the PAYABLE, move no money
-- =============================================================================
CREATE OR REPLACE FUNCTION public.isc_post(
  p_period_start   date,
  p_period_end     date,
  p_allocated_pool numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_period_start   date := date_trunc('month', p_period_start)::date;
  v_period_end     date := (date_trunc('month', p_period_end) + interval '1 month' - interval '1 day')::date;
  v_posting_id     uuid := gen_random_uuid();
  v_month_count    integer;
  v_total_members  integer := 0;
  v_total_basis    numeric := 0;
  v_total_interest numeric := 0;
  v_total_average  numeric := 0;
  v_rate           numeric;
BEGIN
  -- The disabled Post button is a courtesy. This is the real guard (§5.4).
  IF NOT public.has_portal_role(auth.uid(), auth.email(), ARRAY['bookkeeper']) THEN
    RAISE EXCEPTION 'Only a bookkeeper may post Interest on Share Capital.';
  END IF;

  -- The pool is OPTIONAL to preview but REQUIRED to post (§12.5 step 3).
  -- Never COALESCE a default: a wrong amount applied to every member is far
  -- worse than a failed posting.
  IF p_allocated_pool IS NULL OR p_allocated_pool <= 0 THEN
    RAISE EXCEPTION 'An allocated pool greater than zero is required to post Interest on Share Capital.';
  END IF;

  IF v_period_start < DATE '2025-12-01' THEN
    RAISE EXCEPTION 'ISC period cannot start before December 2025 - no month-by-month CBU history exists before that date.';
  END IF;

  IF v_period_end < v_period_start THEN
    RAISE EXCEPTION 'ISC period end must not be before the period start.';
  END IF;

  -- Reserve the header FIRST so the EXCLUDE constraint rejects an overlapping
  -- posting before any line items are written (§8.2).
  INSERT INTO public.isc_postings (
    id, period_start, period_end, month_count,
    allocated_pool, total_average, rate,
    total_members, total_basis, total_interest,
    status, posted_by, posted_by_email, posted_at
  ) VALUES (
    v_posting_id, v_period_start, v_period_end, 1,
    p_allocated_pool, NULL, NULL,
    0, 0, 0,
    'posted', auth.uid(), auth.email(), now()
  );

  -- Line items, straight from the preview. Preview and post therefore share ONE
  -- implementation of the arithmetic, so the bookkeeper can never post a number
  -- different from the one they reviewed (§7).
  INSERT INTO public.isc_transactions (
    isc_posting_id, member_id,
    average_share_capital, total_share_capital,
    rate, interest_amount, payout_unrounded, adjusted,
    settlement
  )
  SELECT
    v_posting_id, p.member_id,
    p.average_share_capital, p.total_share_capital,
    p.rate, p.interest_amount, p.payout_unrounded, p.adjusted,
    'unsettled'
  FROM public.isc_calculate_preview(p_period_start, p_period_end, p_allocated_pool) p;

  SELECT
    count(*), coalesce(sum(average_share_capital), 0), coalesce(sum(interest_amount), 0),
    max(rate)
  INTO v_total_members, v_total_basis, v_total_interest, v_rate
  FROM public.isc_transactions
  WHERE isc_posting_id = v_posting_id;

  IF v_total_members = 0 THEN
    RAISE EXCEPTION 'No eligible members for % to % - nothing to post.', v_period_start, v_period_end;
  END IF;

  SELECT max(month_count), max(total_average)
  INTO v_month_count, v_total_average
  FROM public.isc_calculate_preview(p_period_start, p_period_end, p_allocated_pool);

  -- -------------------------------------------------------------------------
  -- RULE 7, RE-VERIFIED SERVER-SIDE. The client's arithmetic is never trusted
  -- for the posting itself (§12.3, §17). Exact equality, not a tolerance.
  -- -------------------------------------------------------------------------
  IF v_total_interest <> p_allocated_pool THEN
    RAISE EXCEPTION
      'Reconciliation failed: payouts total % but the allocated pool is % (difference %). Nothing was posted.',
      v_total_interest, p_allocated_pool, v_total_interest - p_allocated_pool;
  END IF;

  UPDATE public.isc_postings
  SET month_count    = v_month_count,
      total_average  = v_total_average,
      rate           = v_rate,
      total_members  = v_total_members,
      total_basis    = v_total_basis,
      total_interest = v_total_interest
  WHERE id = v_posting_id;

  -- NOTE: no capital_build_up write. That is the point of §14. Share capital
  -- moves only when a member elects it, via isc_settle_posting below.

  RETURN v_posting_id;
END;
$$;

REVOKE ALL ON FUNCTION public.isc_post(date, date, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.isc_post(date, date, numeric) TO authenticated;

COMMENT ON FUNCTION public.isc_post(date, date, numeric) IS
  'Records an ISC distribution as a PAYABLE (plan §14): header + one line item per member, and NO capital_build_up write. Re-verifies rule 7 server-side before committing. Bookkeeper only.';


-- =============================================================================
-- STEP 4a — isc_settle_posting: the March General Assembly checklist
-- =============================================================================
-- Everyone defaults to CAPITALISE; pass the ids of members taking CASH.
-- Passing the cash list rather than the capitalise list makes the default
-- explicit in the API: omission means capitalise (§17.2).
CREATE OR REPLACE FUNCTION public.isc_settle_posting(
  p_posting_id      uuid,
  p_cash_member_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_effective_date  date   DEFAULT current_date
)
RETURNS TABLE (
  capitalised_count integer,
  cash_count        integer,
  capitalised_total numeric,
  cash_total        numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_posting     record;
  v_row         record;
  v_cbu_id      uuid;
  v_next_seq    integer;
  v_cbud        text;
  v_balance     numeric;
  v_cap_count   integer := 0;
  v_cash_count  integer := 0;
  v_cap_total   numeric := 0;
  v_cash_total  numeric := 0;
BEGIN
  IF NOT public.has_portal_role(auth.uid(), auth.email(), ARRAY['bookkeeper']) THEN
    RAISE EXCEPTION 'Only a bookkeeper may settle Interest on Share Capital.';
  END IF;

  SELECT * INTO v_posting FROM public.isc_postings WHERE id = p_posting_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISC posting % does not exist.', p_posting_id;
  END IF;

  -- Settlement is ONE event, not an incremental drip. Re-running it would
  -- double-credit anyone already capitalised.
  IF EXISTS (SELECT 1 FROM public.isc_transactions
              WHERE isc_posting_id = p_posting_id AND settlement <> 'unsettled') THEN
    RAISE EXCEPTION 'This posting has already been settled. Settlement cannot be repeated.';
  END IF;

  -- Back-dating a capitalisation would insert a CBU row BEFORE deposits made
  -- since, carrying a starting balance read from those later rows -- exactly
  -- bug 1's broken chain (§14.2). There is no legitimate reason to date an
  -- election before the period it settles.
  IF p_effective_date < v_posting.period_end THEN
    RAISE EXCEPTION
      'Settlement date % is before the posting period ends (%). A capitalisation cannot be back-dated.',
      p_effective_date, v_posting.period_end;
  END IF;

  -- Every id passed must belong to this posting -- catches a stale or wrong list.
  IF EXISTS (
    SELECT 1 FROM unnest(p_cash_member_ids) AS cid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.isc_transactions
      WHERE isc_posting_id = p_posting_id AND member_id = cid
    )
  ) THEN
    RAISE EXCEPTION 'The cash list contains a member who is not part of this posting.';
  END IF;

  -- ---- members taking CASH: mark only, write no CBU row ---------------------
  UPDATE public.isc_transactions
  SET settlement       = 'cash',
      settled_at       = now(),
      settled_by       = auth.uid(),
      settled_by_email = auth.email()
  WHERE isc_posting_id = p_posting_id
    AND member_id = ANY(p_cash_member_ids);

  SELECT count(*), coalesce(sum(interest_amount), 0)
  INTO v_cash_count, v_cash_total
  FROM public.isc_transactions
  WHERE isc_posting_id = p_posting_id AND settlement = 'cash';

  -- ---- everyone else CAPITALISES -------------------------------------------
  FOR v_row IN
    SELECT * FROM public.isc_transactions
    WHERE isc_posting_id = p_posting_id
      AND settlement = 'unsettled'
      AND interest_amount > 0
    ORDER BY member_id
  LOOP
    -- Bug 1's discipline, relocated here rather than deleted: read the member's
    -- CURRENT ending balance at insert time, never a period-end snapshot.
    SELECT coalesce(ending_share_capital, 0)
    INTO v_balance
    FROM public.capital_build_up
    WHERE member_id = v_row.member_id
    ORDER BY
      transaction_date DESC,
      NULLIF(regexp_replace(coalesce(cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer DESC NULLS LAST,
      id DESC
    LIMIT 1;

    v_balance := coalesce(v_balance, 0);

    -- Supply cbu_deposit_id ourselves so set_cbu_deposit_id()'s MAX() scan
    -- never fires -- otherwise this loop does one full table scan per member
    -- (§5.3).
    SELECT coalesce(max(NULLIF(regexp_replace(coalesce(cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer), 0) + 1
    INTO v_next_seq
    FROM public.capital_build_up;

    v_cbud := 'CBUD_' || lpad(v_next_seq::text, 3, '0');
    v_cbu_id := gen_random_uuid();

    INSERT INTO public.capital_build_up (
      id, member_id, transaction_date,
      starting_share_capital, capital_added, ending_share_capital,
      deposit_account, cbu_deposit_id, source_isc_id
    ) VALUES (
      v_cbu_id, v_row.member_id, p_effective_date,
      v_balance, v_row.interest_amount, v_balance + v_row.interest_amount,
      'INTEREST_ON_SHARE_CAPITAL', v_cbud, v_row.id
    );

    UPDATE public.isc_transactions
    SET settlement         = 'capitalised',
        settled_at         = now(),
        settled_by         = auth.uid(),
        settled_by_email   = auth.email(),
        capitalised_cbu_id = v_cbu_id
    WHERE id = v_row.id;

    v_cap_count := v_cap_count + 1;
    v_cap_total := v_cap_total + v_row.interest_amount;
  END LOOP;

  UPDATE public.isc_postings SET status = 'settled' WHERE id = p_posting_id;

  RETURN QUERY SELECT v_cap_count, v_cash_count, v_cap_total, v_cash_total;
END;
$$;

REVOKE ALL ON FUNCTION public.isc_settle_posting(uuid, uuid[], date) FROM public;
GRANT EXECUTE ON FUNCTION public.isc_settle_posting(uuid, uuid[], date) TO authenticated;

COMMENT ON FUNCTION public.isc_settle_posting(uuid, uuid[], date) IS
  'Applies the March GA checklist (plan §17.2). Members default to CAPITALISE; pass the ids of those taking CASH. One transaction, all or nothing. Bookkeeper only.';


-- =============================================================================
-- STEP 4b — isc_delete_posting: correction before settlement
-- =============================================================================
CREATE OR REPLACE FUNCTION public.isc_delete_posting(p_posting_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_settled integer;
  v_cbu     integer;
BEGIN
  IF NOT public.has_portal_role(auth.uid(), auth.email(), ARRAY['bookkeeper']) THEN
    RAISE EXCEPTION 'Only a bookkeeper may delete an ISC posting.';
  END IF;

  SELECT count(*) INTO v_settled
  FROM public.isc_transactions
  WHERE isc_posting_id = p_posting_id AND settlement <> 'unsettled';

  IF v_settled > 0 THEN
    RAISE EXCEPTION
      'This posting has been settled (% members). A settled posting is permanent - correct it with a further posting instead.',
      v_settled;
  END IF;

  -- Belt and braces: an unsettled posting should own no CBU rows at all. If it
  -- does, something wrote outside the settlement path and deleting would strip
  -- real share capital.
  SELECT count(*) INTO v_cbu
  FROM public.capital_build_up cbu
  JOIN public.isc_transactions t ON t.id = cbu.source_isc_id
  WHERE t.isc_posting_id = p_posting_id;

  IF v_cbu > 0 THEN
    RAISE EXCEPTION
      'This posting owns % capital_build_up rows despite being unsettled. Refusing to delete - investigate first.',
      v_cbu;
  END IF;

  -- isc_transactions cascades on the FK.
  DELETE FROM public.isc_postings WHERE id = p_posting_id;
END;
$$;

REVOKE ALL ON FUNCTION public.isc_delete_posting(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.isc_delete_posting(uuid) TO authenticated;

COMMENT ON FUNCTION public.isc_delete_posting(uuid) IS
  'Deletes an ISC posting while every line item is still unsettled (plan §17.1). Replaces reversal, which is discarded. Bookkeeper only.';


-- =============================================================================
-- STEP 5b — the overlap constraint no longer needs its partial predicate
-- =============================================================================
-- It carried WHERE (status = 'posted') so that a REVERSED posting freed its
-- months for a corrected one. With reversal gone, a deleted posting frees its
-- months by ceasing to exist, and every posting that exists occupies its months.
--
-- 'reversed' rows from 2026-09-06 remain in the table, so they must still be
-- excluded or they would block a legitimate new posting over the same months.
ALTER TABLE public.isc_postings
  DROP CONSTRAINT IF EXISTS isc_postings_no_overlap;

ALTER TABLE public.isc_postings
  ADD CONSTRAINT isc_postings_no_overlap
  EXCLUDE USING gist (
    daterange(period_start, period_end, '[]') WITH &&
  ) WHERE (status <> 'reversed');


COMMIT;


-- =============================================================================
-- STEP 5c — REMOVE BUG 2'S GUARD  (run this LAST, and read the note)
-- =============================================================================
-- Deliberately OUTSIDE the transaction above, so it is a conscious second
-- action rather than something that slips through with the rest.
--
-- The guard excluded ISC rows from the averaging basis. It was right when
-- isc_post auto-credited every member: those rows were unelected, and counting
-- them paid interest on interest.
--
-- Now the only ISC rows in capital_build_up are ELECTED capitalisations, dated
-- at the March assembly. A member who converts their payout into share capital
-- has made a real contribution, indistinguishable in substance from a deposit,
-- and it SHOULD earn interest from that date (§14.2).
--
-- DO NOT RUN THIS until isc_post above is deployed. Removing it while the old
-- isc_post is live reinstates automatic compounding immediately.
--
-- The 2026-09-06 test posting and its reversal are still in the table and net
-- to zero, so including them changes no member's basis -- verified: the pair
-- sums to PHP 0.00 per member (§21.3).
--
-- Uncomment and run only when the above has been verified:
--
--   -- (re-run isc_v2_02_preview.sql with the line
--   --   `AND cbu.source_isc_id IS NULL`
--   --  removed from BOTH the monthly_balances and openings subqueries)
--
-- Left as a manual step on purpose. See isc_checks/09_VERIFY_POST.sql first.
-- =============================================================================
