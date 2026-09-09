-- =============================================================================
-- ISC v2 — STEP 2 of 5: isc_calculate_preview (READ-ONLY function)
-- =============================================================================
-- Run AFTER isc_v2_01_schema.sql.
--
-- This function writes NOTHING. It can be run against live data as often as you
-- like. It is the checkpoint of the whole migration: if the numbers here are
-- wrong, everything built on top is wrong, so verify it before going further.
--
-- WHAT CHANGED FROM THE OLD VERSION
--   1. Takes a POOL, not a rate. The rate is DERIVED (plan §12.1):
--          rate = allocated_pool / total_cooperative_average
--   2. Payouts are reconciled to the pool EXACTLY by largest-remainder
--      allocation (§12.3, rule 7). Not "within a tolerance" -- exactly.
--   3. Returns the per-month series the ledger grid renders (§15.3):
--      month_end_balances, crj_by_month, cdj_by_month, opening_balance.
--   4. Classifies CRJ vs CDJ by deposit_account, NOT by cbu_deposit_id
--      (§21.2 -- a trigger stamps that column on every row, so it identifies
--      nothing; the old rule would have put every row in CRJ).
--
-- WHAT DELIBERATELY DID NOT CHANGE
--   * The month-end balance walk, including its ordering. The tiebreaker on
--     cbu_deposit_id's numeric suffix is load-bearing (§11.1): 270+ rows store
--     date-only timestamps, so same-day deposits tie, and the old random-uuid
--     tiebreak was wrong 53% of the time in simulation. Do not simplify it.
--   * `AND cbu.source_isc_id IS NULL` -- bug 2's guard. It comes out in STEP 5,
--     not here. Removing it before isc_post stops writing CBU rows would
--     immediately reintroduce interest-paid-on-interest (§14.2).
--   * The Dec-2025 floor. It is load-bearing (§12.6): the carry-in it protects
--     is what keeps long-standing members whole.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.isc_calculate_preview(date, date, numeric);

CREATE OR REPLACE FUNCTION public.isc_calculate_preview(
  p_period_start   date,
  p_period_end     date,
  p_allocated_pool numeric DEFAULT NULL   -- the GA-approved amount; NULL = basis only
)
RETURNS TABLE (
  member_id              uuid,
  membership_id          text,
  member_name            text,
  -- Scalars (the existing modal reads these; keep them).
  average_share_capital  numeric,
  total_share_capital    numeric,
  month_count            integer,
  rate                   numeric,     -- DERIVED, unrounded (§12.2 precision note)
  interest_amount        numeric,     -- after centavo reconciliation
  -- New for v2.
  payout_unrounded       numeric,
  adjusted               boolean,     -- received a residual centavo (§12.3)
  total_average          numeric,     -- rule 4, same on every row
  allocated_pool         numeric,
  -- The ledger grid series (§15.3). One element per month, chronological.
  opening_balance        numeric,
  month_end_balances     numeric[],
  crj_by_month           numeric[],
  cdj_by_month           numeric[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
-- The RETURNS TABLE column names (member_id, rate, adjusted, month_count, ...)
-- are also plpgsql variables in this function's scope, and several of them
-- collide with real column names used in the query below -- "member_id" most
-- obviously. Without this directive Postgres raises
--   42702: column reference "member_id" is ambiguous
-- Telling plpgsql to prefer the COLUMN is right here: every bare name in the
-- query body refers to a table column, and the OUT parameters are only ever
-- assigned positionally by RETURN QUERY.
#variable_conflict use_column
DECLARE
  v_period_start date := date_trunc('month', p_period_start)::date;
  v_period_end   date := (date_trunc('month', p_period_end) + interval '1 month' - interval '1 day')::date;
  v_month_count  integer;
BEGIN
  -- ---------------------------------------------------------------------------
  -- Guards
  -- ---------------------------------------------------------------------------
  IF v_period_start < DATE '2025-12-01' THEN
    RAISE EXCEPTION 'ISC period cannot start before December 2025 - no month-by-month CBU history exists before that date.';
  END IF;

  IF v_period_end < v_period_start THEN
    RAISE EXCEPTION 'ISC period end must not be before the period start.';
  END IF;

  -- The pool is optional HERE (preview the basis before the GA decides) but
  -- required to post. A zero or negative pool is always nonsense.
  IF p_allocated_pool IS NOT NULL AND p_allocated_pool <= 0 THEN
    RAISE EXCEPTION 'Allocated pool must be greater than zero (got %).', p_allocated_pool;
  END IF;

  v_month_count :=
      (EXTRACT(YEAR  FROM date_trunc('month', p_period_end)) - EXTRACT(YEAR  FROM v_period_start))::int * 12
    + (EXTRACT(MONTH FROM date_trunc('month', p_period_end)) - EXTRACT(MONTH FROM v_period_start))::int
    + 1;

  RETURN QUERY
  WITH
  -- Every month-end in the range, chronological.
  month_ends AS (
    SELECT
      (gs + interval '1 month' - interval '1 day')::date AS month_end,
      gs::date                                           AS month_start,
      row_number() OVER (ORDER BY gs)                    AS idx
    FROM generate_series(v_period_start, date_trunc('month', p_period_end)::date, interval '1 month') AS gs
  ),

  eligible_members AS (
    SELECT
      m.id,
      m.membership_id::text AS membership_id,
      btrim(concat_ws(' ', m.first_name,
                           nullif(btrim(coalesce(m.middle_initial, '')), ''),
                           m.last_name)) AS member_name
    FROM public.member m
    WHERE lower(coalesce(m.member_status, 'active')) = 'active'
  ),

  -- ---------------------------------------------------------------------------
  -- Rule 1: the month-end balance walk.
  -- For each member and month-end, the balance is the ending_share_capital of
  -- their latest CBU row at or before that date. Carry-forward is implicit:
  -- a month with no movement reads the previous row's balance (§12.6).
  -- ---------------------------------------------------------------------------
  monthly_balances AS (
    SELECT
      em.id   AS member_id,
      me.idx,
      me.month_end,
      me.month_start,
      COALESCE((
        SELECT cbu.ending_share_capital
        FROM public.capital_build_up cbu
        WHERE cbu.member_id = em.id
          AND cbu.transaction_date::date <= me.month_end
          -- Bug 2 guard. Removed in STEP 5, not here -- see the header.
          AND cbu.source_isc_id IS NULL
        ORDER BY
          cbu.transaction_date DESC,
          NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer DESC NULLS LAST,
          cbu.id DESC
        LIMIT 1
      ), 0) AS balance
    FROM eligible_members em
    CROSS JOIN month_ends me
  ),

  -- ---------------------------------------------------------------------------
  -- The movements inside each month, split by ORIGIN (§15.3, §21.2).
  --
  -- CRJ = paid in at the cashier.  CDJ = retained from a loan disbursement.
  -- BOTH ADD (§18.1): a PHP 500k loan puts 2% = PHP 10k INTO share capital.
  -- CDJ sits in the "disbursements" journal because of the transaction the
  -- money moved through, not because it subtracts.
  --
  -- Openings (the 2025-12-31 import and new members' paid-up capital) are
  -- NEITHER -- they open the ledger (§15.6). They still reach the balance walk
  -- above, so they are never lost; they just do not appear as a movement.
  --
  -- The paid-up-capital label is normalised across EVERY non-alphanumeric run,
  -- not just spaces: 'Initial Paid-Up Capital' contains a HYPHEN, and matching
  -- on spaces alone silently misfiled 3 rows / PHP 30,000 into CRJ (§21.6).
  -- ---------------------------------------------------------------------------
  movements AS (
    SELECT
      cbu.member_id,
      me.idx,
      CASE
        WHEN cbu.source_isc_id IS NOT NULL                     THEN 'isc'
        WHEN cbu.deposit_account = 'historical_import_2025'    THEN 'opening'
        WHEN regexp_replace(lower(coalesce(cbu.deposit_account, '')), '[^a-z0-9]+', '_', 'g')
               = 'initial_paid_up_capital'                     THEN 'opening'
        WHEN cbu.source_loan_id IS NOT NULL                    THEN 'cdj'
        WHEN cbu.deposit_account = 'LOAN_CBU_RETENTION'        THEN 'cdj'
        ELSE 'crj'
      END AS origin,
      cbu.capital_added
    FROM public.capital_build_up cbu
    JOIN month_ends me
      ON cbu.transaction_date::date BETWEEN me.month_start AND me.month_end
  ),

  movements_by_month AS (
    SELECT
      member_id,
      idx,
      round(coalesce(sum(capital_added) FILTER (WHERE origin = 'crj'), 0), 2) AS crj,
      round(coalesce(sum(capital_added) FILTER (WHERE origin = 'cdj'), 0), 2) AS cdj
    FROM movements
    GROUP BY member_id, idx
  ),

  -- ---------------------------------------------------------------------------
  -- Rules 2 and 3, plus the arrays the grid renders.
  --   Member Total   = SUM of the month-end balances  (NOT the transactions)
  --   Member Average = Member Total / month_count     (always the full count,
  --                    never a per-member divisor -- §12.6, §18.2)
  -- ---------------------------------------------------------------------------
  aggregated AS (
    SELECT
      mb.member_id,
      avg(mb.balance)                                              AS average_share_capital,
      (ARRAY_AGG(mb.balance ORDER BY mb.idx DESC))[1]              AS total_share_capital,
      ARRAY_AGG(round(mb.balance, 2) ORDER BY mb.idx)              AS month_end_balances,
      ARRAY_AGG(coalesce(mv.crj, 0) ORDER BY mb.idx)               AS crj_by_month,
      ARRAY_AGG(coalesce(mv.cdj, 0) ORDER BY mb.idx)               AS cdj_by_month
    FROM monthly_balances mb
    LEFT JOIN movements_by_month mv
      ON mv.member_id = mb.member_id AND mv.idx = mb.idx
    GROUP BY mb.member_id
  ),

  -- Balance carried INTO the range: the closing balance at the last month-end
  -- BEFORE it. For a member who joined mid-range this is 0 (§15.6).
  openings AS (
    SELECT
      em.id AS member_id,
      COALESCE((
        SELECT cbu.ending_share_capital
        FROM public.capital_build_up cbu
        WHERE cbu.member_id = em.id
          AND cbu.transaction_date::date < v_period_start
          AND cbu.source_isc_id IS NULL
        ORDER BY
          cbu.transaction_date DESC,
          NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer DESC NULLS LAST,
          cbu.id DESC
        LIMIT 1
      ), 0) AS opening_balance
    FROM eligible_members em
  ),

  -- Eligibility: active AND holding some share capital (§6).
  eligible AS (
    SELECT a.*, o.opening_balance
    FROM aggregated a
    JOIN openings o ON o.member_id = a.member_id
    WHERE a.average_share_capital > 0
  ),

  -- Rule 4: the cooperative's total average = SUM of the individual averages.
  -- Deliberately the sum of the column, not the grand total / months (§12.2).
  coop AS (
    SELECT sum(average_share_capital) AS total_average FROM eligible
  ),

  -- ---------------------------------------------------------------------------
  -- Rules 5 and 6, then LARGEST-REMAINDER RECONCILIATION (rule 7).
  --
  -- Rounding each payout independently leaves the batch a few centavos off the
  -- pool, the journal entry does not balance, and the batch cannot be posted.
  -- So: floor every payout to the centavo, then hand the residual centavos to
  -- the rows with the LARGEST discarded fractions. Ties break on member_id so
  -- the result is deterministic and reproducible.
  --
  -- The rate is used UNROUNDED throughout; it is rounded only for display.
  -- ---------------------------------------------------------------------------
  rated AS (
    SELECT
      e.*,
      c.total_average,
      CASE WHEN p_allocated_pool IS NULL OR c.total_average IS NULL OR c.total_average = 0
           THEN NULL
           ELSE p_allocated_pool / c.total_average
      END AS derived_rate
    FROM eligible e
    CROSS JOIN coop c
  ),

  payouts AS (
    SELECT
      r.*,
      r.average_share_capital * r.derived_rate AS raw_payout
    FROM rated r
  ),

  floored AS (
    SELECT
      p.*,
      floor(p.raw_payout * 100)                            AS base_cents,
      p.raw_payout * 100 - floor(p.raw_payout * 100)       AS fraction
    FROM payouts p
  ),

  ranked AS (
    SELECT
      f.*,
      -- Rows with the biggest discarded fraction get the spare centavos first.
      row_number() OVER (ORDER BY f.fraction DESC, f.member_id) AS rn,
      -- How many centavos are left over for the whole batch.
      (round(p_allocated_pool * 100) - sum(f.base_cents) OVER ())::bigint AS residual
    FROM floored f
  ),

  reconciled AS (
    SELECT
      r.*,
      CASE
        WHEN r.derived_rate IS NULL THEN NULL
        -- Positive residual: the top |residual| rows each gain one centavo.
        WHEN r.residual > 0 AND r.rn <= r.residual        THEN (r.base_cents + 1) / 100.0
        -- Negative residual (possible with an odd pool): the bottom rows lose one.
        WHEN r.residual < 0 AND r.rn > (SELECT count(*) FROM floored) + r.residual
                                                          THEN (r.base_cents - 1) / 100.0
        ELSE r.base_cents / 100.0
      END AS final_payout,
      CASE
        WHEN r.derived_rate IS NULL THEN false
        WHEN r.residual > 0 AND r.rn <= r.residual THEN true
        WHEN r.residual < 0 AND r.rn > (SELECT count(*) FROM floored) + r.residual THEN true
        ELSE false
      END AS was_adjusted
    FROM ranked r
  )

  SELECT
    em.id,
    em.membership_id,
    em.member_name,
    round(rc.average_share_capital, 2),
    round(rc.total_share_capital, 2),
    v_month_count,
    -- Rate as a PERCENT for display, matching the old column's units.
    CASE WHEN rc.derived_rate IS NULL THEN NULL ELSE rc.derived_rate * 100.0 END,
    rc.final_payout,
    rc.raw_payout,
    rc.was_adjusted,
    round(rc.total_average, 2),
    p_allocated_pool,
    round(rc.opening_balance, 2),
    rc.month_end_balances,
    rc.crj_by_month,
    rc.cdj_by_month
  FROM reconciled rc
  JOIN eligible_members em ON em.id = rc.member_id
  ORDER BY rc.average_share_capital DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.isc_calculate_preview(date, date, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.isc_calculate_preview(date, date, numeric) TO authenticated;

COMMENT ON FUNCTION public.isc_calculate_preview(date, date, numeric) IS
  'ISC v2 preview. Takes the GA-allocated POOL and derives the rate (plan §12.1). Payouts reconcile to the pool exactly by largest-remainder allocation (§12.3). Returns the per-month ledger series for the grid (§15.3). Writes nothing.';

COMMIT;
