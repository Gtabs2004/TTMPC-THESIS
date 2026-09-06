-- =============================================================================
-- ISC HARDENING FIX  (2026-09-06)
-- =============================================================================
-- Re-deploys isc_calculate_preview() and isc_post() from isc_dividend_schema.sql.
-- No schema changes, no data changes. Safe on a live database, safe to re-run.
--
-- -----------------------------------------------------------------------------
-- BUG 1 (isc_post) — stale starting balance
-- -----------------------------------------------------------------------------
-- The CBU row used v_row.total_share_capital as starting_share_capital. That is
-- the member's closing balance at PERIOD END — a historical snapshot used as the
-- interest basis. For any back-dated posting (the normal case: pay 2026 interest
-- in January 2027) a member may have deposited since, so the posting wrote a
-- stale starting balance and silently broke the capital_build_up running-balance
-- chain, erasing every deposit made after period_end.
--
-- Measured on live data, posting Dec 2025 - Jun 2026:
--     Romelyn Delos Reyes   would write 105,400.00  actual 121,800.00   -16,400
--     Nash Ervine Siaton    would write 314,800.00  actual 338,400.00   -23,600
--
-- Fixed by reading the member's CURRENT ending_share_capital at insert time,
-- exactly as isc_reverse() already did. The interest basis is unchanged.
--
-- -----------------------------------------------------------------------------
-- BUG 2 (isc_calculate_preview) — interest paid on interest
-- -----------------------------------------------------------------------------
-- The averaging query read capital_build_up with no filter on origin, so ISC
-- rows written by a previous posting counted as basis for the next one.
--
-- The EXCLUDE constraint cannot catch this: post Dec2025-Jun2026 in September,
-- then post Jul2026-Dec2026 — the month ranges genuinely do not overlap, yet
-- the September-dated ISC row sits inside the Jul-Dec averaging window and
-- earns interest for months the member never held it.
--
-- Fixed with `AND cbu.source_isc_id IS NULL`. Interest is earned on capital the
-- member CONTRIBUTED. If the cooperative later decides interest should compound,
-- that is a policy change — remove this one line deliberately, do not let it
-- happen as a side effect of posting order.
--
-- NOTE: dating the ISC row at period_end was considered and REJECTED. It would
-- place a back-dated row after later deposits in the ledger while carrying a
-- starting balance taken from those later rows — reintroducing exactly the
-- broken-chain failure Bug 1 fixes. transaction_date stays now().
--
-- -----------------------------------------------------------------------------
-- BUG 3 (isc_calculate_preview) — total_share_capital could be NULL
-- -----------------------------------------------------------------------------
-- It used MAX(balance) FILTER (WHERE month_end = v_period_end), which returns
-- NULL when period_end is not the final day of its month. Now takes the balance
-- at the last month_end in the generated series.
--
-- -----------------------------------------------------------------------------
-- VERIFIED SOUND (no change needed)
-- -----------------------------------------------------------------------------
--   * Rounding: isc_post sums per-member rounded amounts, so the header total
--     always equals the sum of the line items (drift vs naive calc: PHP 0.03).
--   * Eligibility: 263 of 295 active members included; 32 excluded for zero
--     CBU. No member with average <= 0 is ever included.
--   * Concurrency: the posting row is inserted before the member loop, so the
--     EXCLUDE constraint rejects a competing overlapping posting before any
--     member rows are written.
--   * Reversal: loops isc_transactions, not the preview, so it reverses exactly
--     who was paid even if they were terminated afterwards.
--   * Audit: audit_trg_capital_build_up is extended to carry source_isc_id, so
--     ISC rows are distinguishable from ordinary cashier deposits.
--   * Performance: 9 months x 295 members previews in ~0.46s.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.isc_calculate_preview(
  p_period_start date,
  p_period_end   date,
  p_rate         numeric DEFAULT NULL
)
RETURNS TABLE (
  member_id              uuid,
  membership_id          text,
  member_name            text,
  average_share_capital  numeric,
  total_share_capital    numeric,
  month_count            integer,
  rate                   numeric,
  interest_amount        numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start date := date_trunc('month', p_period_start)::date;
  v_period_end   date := (date_trunc('month', p_period_end) + interval '1 month' - interval '1 day')::date;
  v_month_count  integer;
BEGIN
  IF v_period_start < DATE '2025-12-01' THEN
    RAISE EXCEPTION 'ISC period cannot start before December 2025 — no month-by-month CBU history exists before that date.';
  END IF;
  IF v_period_end < v_period_start THEN
    RAISE EXCEPTION 'ISC period end must not be before the period start.';
  END IF;
  IF p_rate IS NOT NULL AND (p_rate <= 0 OR p_rate > 100) THEN
    RAISE EXCEPTION 'ISC rate must be between 0 and 100.';
  END IF;

  v_month_count := (EXTRACT(YEAR FROM date_trunc('month', p_period_end)) - EXTRACT(YEAR FROM v_period_start))::int * 12
                 + (EXTRACT(MONTH FROM date_trunc('month', p_period_end)) - EXTRACT(MONTH FROM v_period_start))::int
                 + 1;

  RETURN QUERY
  WITH month_ends AS (
    SELECT (gs + interval '1 month' - interval '1 day')::date AS month_end
    FROM generate_series(v_period_start, date_trunc('month', p_period_end)::date, interval '1 month') AS gs
  ),
  eligible_members AS (
    SELECT
      m.id,
      m.membership_id::text AS membership_id,
      btrim(concat_ws(' ', m.first_name, nullif(btrim(coalesce(m.middle_initial, '')), ''), m.last_name)) AS member_name
    FROM public.member m
    WHERE lower(coalesce(m.member_status, 'active')) = 'active'
  ),
  monthly_balances AS (
    SELECT
      em.id AS member_id,
      me.month_end,
      COALESCE(
        (
          SELECT cbu.ending_share_capital
          FROM public.capital_build_up cbu
          WHERE cbu.member_id = em.id
            AND cbu.transaction_date::date <= me.month_end
            -- Interest is earned on capital the member CONTRIBUTED, not on
            -- interest already paid to them. Without this, a posting made in
            -- September for Dec2025-Jun2026 lands a September-dated ISC row
            -- that the NEXT posting (Jul-Dec2026) would count as basis --
            -- paying interest on interest for months it was never held. The
            -- EXCLUDE constraint cannot catch that: the month ranges genuinely
            -- do not overlap. Compounding should be a deliberate coop policy,
            -- not an emergent side effect of posting order.
            AND cbu.source_isc_id IS NULL
          ORDER BY
            cbu.transaction_date DESC,
            NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer DESC NULLS LAST,
            cbu.id DESC
          LIMIT 1
        ),
        0
      ) AS balance
    FROM eligible_members em
    CROSS JOIN month_ends me
  ),
  aggregated AS (
    SELECT
      mb.member_id,
      AVG(mb.balance) AS average_share_capital,
      -- Closing balance = the balance at the LAST month_end in the series.
      -- Matching on = v_period_end would silently return NULL if the caller
      -- passed a period_end that is not its month's final day.
      (ARRAY_AGG(mb.balance ORDER BY mb.month_end DESC))[1] AS total_share_capital
    FROM monthly_balances mb
    GROUP BY mb.member_id
  )
  SELECT
    em.id,
    em.membership_id,
    em.member_name,
    round(a.average_share_capital, 2),
    round(a.total_share_capital, 2),
    v_month_count,
    p_rate,
    CASE WHEN p_rate IS NULL THEN NULL ELSE round(a.average_share_capital * p_rate / 100.0, 2) END
  FROM aggregated a
  JOIN eligible_members em ON em.id = a.member_id
  WHERE a.average_share_capital > 0
  ORDER BY a.average_share_capital DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.isc_post(
  p_period_start date,
  p_period_end   date,
  p_rate         numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start   date := date_trunc('month', p_period_start)::date;
  v_period_end     date := (date_trunc('month', p_period_end) + interval '1 month' - interval '1 day')::date;
  v_month_count    integer;
  v_posting_id     uuid := gen_random_uuid();
  v_actor          record;
  v_next_seq       integer;
  v_row            record;
  v_isc_tx_id      uuid;
  v_cbud           text;
  v_total_members  integer := 0;
  v_total_basis    numeric := 0;
  v_total_interest numeric := 0;
  v_current_balance numeric;
BEGIN
  -- The disabled Post button is only a courtesy — this is the real guard.
  IF NOT public.has_portal_role(auth.uid(), auth.email(), ARRAY['bookkeeper']) THEN
    RAISE EXCEPTION 'Only a bookkeeper may post Interest on Share Capital.';
  END IF;

  -- Never silently substitute a default rate — a blank/zero/out-of-range
  -- rate must fail loudly, not post at 0%.
  IF p_rate IS NULL OR p_rate <= 0 OR p_rate > 100 THEN
    RAISE EXCEPTION 'A valid interest rate greater than 0 and at most 100 is required to post.';
  END IF;

  IF v_period_start < DATE '2025-12-01' THEN
    RAISE EXCEPTION 'ISC period cannot start before December 2025 — no month-by-month CBU history exists before that date.';
  END IF;
  IF v_period_end < v_period_start THEN
    RAISE EXCEPTION 'ISC period end must not be before the period start.';
  END IF;

  v_month_count := (EXTRACT(YEAR FROM date_trunc('month', p_period_end)) - EXTRACT(YEAR FROM v_period_start))::int * 12
                 + (EXTRACT(MONTH FROM date_trunc('month', p_period_end)) - EXTRACT(MONTH FROM v_period_start))::int
                 + 1;

  SELECT * INTO v_actor FROM public.audit_resolve_actor();

  -- Reserve the posting row first so the EXCLUDE constraint rejects an
  -- overlapping period before any per-member work happens.
  INSERT INTO public.isc_postings (
    id, period_start, period_end, month_count, rate,
    total_members, total_basis, total_interest,
    status, posted_by, posted_by_email, posted_at
  ) VALUES (
    v_posting_id, v_period_start, v_period_end, v_month_count, p_rate,
    0, 0, 0,
    'posted', v_actor.uid, v_actor.email, now()
  );

  -- One MAX() scan up front, then a local counter — so the per-row
  -- set_cbu_deposit_id() trigger's own MAX() scan never fires for these
  -- inserts (ISC_DIVIDEND_PLAN.md §5.3).
  SELECT coalesce(
    max(nullif(regexp_replace(cbu_deposit_id, '^CBUD_0*', ''), '')::integer), 0
  ) + 1
  INTO v_next_seq
  FROM public.capital_build_up;

  FOR v_row IN
    SELECT * FROM public.isc_calculate_preview(p_period_start, p_period_end, p_rate)
  LOOP
    v_total_members := v_total_members + 1;
    v_total_basis := v_total_basis + v_row.average_share_capital;
    v_total_interest := v_total_interest + v_row.interest_amount;

    v_isc_tx_id := gen_random_uuid();
    INSERT INTO public.isc_transactions (
      id, isc_posting_id, member_id,
      average_share_capital, total_share_capital, rate, interest_amount
    ) VALUES (
      v_isc_tx_id, v_posting_id, v_row.member_id,
      v_row.average_share_capital, v_row.total_share_capital, p_rate, v_row.interest_amount
    );

    v_cbud := 'CBUD_' || lpad(v_next_seq::text, 3, '0');
    v_next_seq := v_next_seq + 1;

    -- The CBU row must continue from the member's CURRENT running balance,
    -- not from v_row.total_share_capital. total_share_capital is the closing
    -- balance at PERIOD END — a historical snapshot used as the interest
    -- basis. For any back-dated period (the normal case: pay 2026 interest in
    -- January 2027) a member may have deposited since, so posting the snapshot
    -- would write a stale starting_share_capital and silently break the
    -- running-balance chain, erasing every deposit made after period_end.
    -- isc_reverse() below already reads the live balance for the same reason.
    SELECT cbu.ending_share_capital
    INTO v_current_balance
    FROM public.capital_build_up cbu
    WHERE cbu.member_id = v_row.member_id
    ORDER BY
      cbu.transaction_date DESC,
      NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer DESC NULLS LAST,
      cbu.id DESC
    LIMIT 1;
    v_current_balance := coalesce(v_current_balance, 0);

    -- transaction_date stays now(): the ledger must stay in true
    -- chronological order or the running-balance chain breaks (a back-dated
    -- row would carry a starting balance taken from a LATER row). The related
    -- risk -- ISC being counted as basis in a future period -- is handled in
    -- isc_calculate_preview instead, which excludes ISC-sourced rows outright.
    INSERT INTO public.capital_build_up (
      id, member_id, transaction_date,
      starting_share_capital, capital_added, deposit_account,
      ending_share_capital, cbu_deposit_id, source_isc_id
    ) VALUES (
      gen_random_uuid(), v_row.member_id, now(),
      v_current_balance, v_row.interest_amount, 'INTEREST_ON_SHARE_CAPITAL',
      v_current_balance + v_row.interest_amount, v_cbud, v_isc_tx_id
    );
  END LOOP;

  UPDATE public.isc_postings
  SET total_members = v_total_members,
      total_basis = v_total_basis,
      total_interest = v_total_interest
  WHERE id = v_posting_id;

  RETURN v_posting_id;
END;
$$;

COMMIT;
