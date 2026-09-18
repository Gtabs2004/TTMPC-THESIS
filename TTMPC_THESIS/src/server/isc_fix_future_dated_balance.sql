-- =============================================================================
-- ISC POINT FIX (2026-09-18) — future-dated rows must not win the balance walk
-- =============================================================================
-- Re-deploys isc_calculate_preview() from isc_v2_06_allow_historical_years.sql
-- with ONE added line in each of its two balance lookups. No schema changes,
-- no data changes. Safe on a live database, safe to re-run.
--
-- isc_post() is NOT re-deployed: it calls isc_calculate_preview() for both the
-- per-member rows and the header totals (isc_v2_06 lines 341-362), so fixing
-- the preview fixes the posting path with it. Nothing else calls the balance
-- walk.
--
-- -----------------------------------------------------------------------------
-- THE BUG
-- -----------------------------------------------------------------------------
-- The yearly-history import (migration/cbu_yearly_history_import.sql) writes a
-- year-END snapshot row per member per year, 2019..2026. The 2026 row is dated
-- 2026-12-31 -- IN THE FUTURE for the whole of 2026. Measured in the import
-- file: 259 such rows, one for every member; 88 carry a non-zero capital_added.
--
-- monthly_balances takes, per month-end, the member's latest CBU row at or
-- before that month-end. It filtered on source_isc_id and on the month-end, but
-- NOT on current_date. So from the December month-end's point of view the
-- 2026-12-31 placeholder is the latest row and wins on transaction_date DESC --
-- and its ending_share_capital was frozen when the import ran, so it knows
-- nothing about any 2026 movement recorded since.
--
-- Worked through on live data. Member e074308d-58eb-4d7a-9297-28d71003f6cf,
-- whose imported rows are:
--     2025-12-31  ending 121,299.31
--     2026-12-31  ending 121,599.31   <- the placeholder
-- Release a PHP 500,000 consolidated loan on 2026-09-18. The disbursement
-- trigger correctly retains 2% and writes
--     2026-09-18  added 10,000.00  ending 131,299.31  LOAN_CBU_RETENTION
-- The grid then reads:
--     Jan..Aug  121,299.31   (correct)
--     Sep..Nov  131,299.31   (correct -- the retention)
--     Dec       121,599.31   (WRONG -- the placeholder, PHP 9,700 short)
--
-- -----------------------------------------------------------------------------
-- WHY THIS IS NOT A DISPLAY BUG
-- -----------------------------------------------------------------------------
-- Rule 2 (ISC_DIVIDEND_PLAN.md §12.2) makes the month-end balances THE BASIS:
--     Member Total   = SUM of the month-end balances
--     Member Average = Member Total / 12
-- so a corrupted December balance flows straight into the payout:
--     correct  (121,299.31 x 8 + 131,299.31 x 4) / 12 = 124,632.64
--     actual   (121,299.31 x 8 + 131,299.31 x 3 + 121,599.31) / 12 = 123,824.31
--
-- And it does not stop at one member. Rule 4 sums the averages; rule 5 derives
-- the rate as pool / that sum. An understated denominator makes the rate too
-- HIGH, so every unaffected member is slightly overpaid -- while rule 7 still
-- reconciles to the pool exactly. The books balance perfectly and the split is
-- wrong, which is precisely why this needs a test (see 27_ASSERT_CHAIN.sql)
-- rather than an eyeball.
--
-- -----------------------------------------------------------------------------
-- THE FIX -- and where it is already proven
-- -----------------------------------------------------------------------------
-- Add, to BOTH balance lookups:
--     AND cbu.transaction_date::date <= current_date
--
-- This is the same guard, in the same words, already applied twice to the same
-- class of bug:
--   * the disbursement trigger, cbu_disbursement_trigger_fix_future_date.sql:103
--   * the cashier CRJ deposit endpoint, main.py:3321 (_cbu_row_order / today_str)
-- The ISC read path was the third site and the only one still unguarded.
--
-- WHAT CHANGES FOR THE MONTHS AFTER TODAY
--   With the guard, Oct..Dec 2026 all read the latest real row instead of the
--   placeholder -- i.e. the balance carries forward from today. That is what
--   rule 1 says should happen (§3, "every month uses their carry-in balance"),
--   and it is what the grid already does for a member with no movement.
--
--   A Jan-Dec 2026 posting made in January 2027 is unaffected: by then
--   2026-12-31 is in the past, the guard admits it, and it is the correct
--   year-end balance. The placeholders are therefore left in place -- they are
--   not junk, they are simply not evidence yet. Do NOT delete or re-date them.
--
-- WHAT DELIBERATELY DID NOT CHANGE
--   * The `movements` CTE gets NO guard. It is already bounded by
--     `BETWEEN me.month_start AND me.month_end`, and the placeholders classify
--     as 'opening' (deposit_account = 'historical_yearly_2019_2026'), so they
--     never reach CRJ or CDJ. Guarding it would change nothing except to break
--     the assertion in 27_ASSERT_CHAIN.sql, which needs the movement columns to
--     stay independent of the balance walk to be able to detect a disagreement.
--   * The cbu_deposit_id numeric-suffix tiebreaker (§11.1, §18.3). Load-bearing:
--     270+ rows store date-only timestamps, so same-day rows tie, and the old
--     random-uuid tiebreak was wrong 53% of the time in simulation.
--   * `AND cbu.source_isc_id IS NULL` -- bug 2's guard (isc_fix_stale_balance).
--     Removing it reintroduces interest-paid-on-interest.
--   * The 2019-01-01 floor from isc_v2_06, and the carry-in behaviour §12.6
--     depends on.
--   * Every rule in §12.2: the averaging, the derived rate, and the
--     largest-remainder reconciliation are copied forward untouched.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.isc_calculate_preview(
  p_period_start   date,
  p_period_end     date,
  p_allocated_pool numeric DEFAULT NULL
)
RETURNS TABLE (
  member_id              uuid,
  membership_id          text,
  member_name            text,
  average_share_capital  numeric,
  total_share_capital    numeric,
  month_count            integer,
  rate                   numeric,
  interest_amount        numeric,
  payout_unrounded       numeric,
  adjusted               boolean,
  total_average          numeric,
  allocated_pool         numeric,
  opening_balance        numeric,
  month_end_balances     numeric[],
  crj_by_month           numeric[],
  cdj_by_month           numeric[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
#variable_conflict use_column
DECLARE
  v_period_start date := date_trunc('month', p_period_start)::date;
  v_period_end   date := (date_trunc('month', p_period_end) + interval '1 month' - interval '1 day')::date;
  v_month_count  integer;
BEGIN
  IF v_period_start < DATE '2019-01-01' THEN
    RAISE EXCEPTION 'ISC period cannot start before January 2019 - no CBU history exists before that date.';
  END IF;

  IF v_period_end < v_period_start THEN
    RAISE EXCEPTION 'ISC period end must not be before the period start.';
  END IF;

  IF p_allocated_pool IS NOT NULL AND p_allocated_pool <= 0 THEN
    RAISE EXCEPTION 'Allocated pool must be greater than zero (got %).', p_allocated_pool;
  END IF;

  v_month_count :=
      (EXTRACT(YEAR  FROM date_trunc('month', p_period_end)) - EXTRACT(YEAR  FROM v_period_start))::int * 12
    + (EXTRACT(MONTH FROM date_trunc('month', p_period_end)) - EXTRACT(MONTH FROM v_period_start))::int
    + 1;

  RETURN QUERY
  WITH
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
          -- THE FIX. A row dated after today is not evidence of anything yet:
          -- the 2026-12-31 import placeholder would otherwise win every
          -- month-end from December's point of view and erase the year's real
          -- movements. Same guard as
          -- cbu_disbursement_trigger_fix_future_date.sql:103 and main.py:3321.
          AND cbu.transaction_date::date <= current_date
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
  movements AS (
    SELECT
      cbu.member_id,
      me.idx,
      CASE
        WHEN cbu.source_isc_id IS NOT NULL                       THEN 'isc'
        WHEN cbu.deposit_account = 'historical_import_2025'      THEN 'opening'
        WHEN cbu.deposit_account = 'historical_yearly_2019_2026' THEN 'opening'
        WHEN regexp_replace(lower(coalesce(cbu.deposit_account, '')), '[^a-z0-9]+', '_', 'g')
               = 'initial_paid_up_capital'                       THEN 'opening'
        WHEN cbu.source_loan_id IS NOT NULL                      THEN 'cdj'
        WHEN cbu.deposit_account = 'LOAN_CBU_RETENTION'          THEN 'cdj'
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
  openings AS (
    SELECT
      em.id AS member_id,
      COALESCE((
        SELECT cbu.ending_share_capital
        FROM public.capital_build_up cbu
        WHERE cbu.member_id = em.id
          AND cbu.transaction_date::date < v_period_start
          -- THE FIX, second site. Matters when the bookkeeper browses an
          -- earlier year: without it, a period starting before today would
          -- still carry in a balance taken from a future-dated row.
          AND cbu.transaction_date::date <= current_date
          AND cbu.source_isc_id IS NULL
        ORDER BY
          cbu.transaction_date DESC,
          NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer DESC NULLS LAST,
          cbu.id DESC
        LIMIT 1
      ), 0) AS opening_balance
    FROM eligible_members em
  ),
  eligible AS (
    SELECT a.*, o.opening_balance
    FROM aggregated a
    JOIN openings o ON o.member_id = a.member_id
    WHERE a.average_share_capital > 0
  ),
  coop AS (
    SELECT sum(average_share_capital) AS total_average FROM eligible
  ),
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
    SELECT r.*, r.average_share_capital * r.derived_rate AS raw_payout FROM rated r
  ),
  floored AS (
    SELECT
      p.*,
      floor(p.raw_payout * 100)                      AS base_cents,
      p.raw_payout * 100 - floor(p.raw_payout * 100) AS fraction
    FROM payouts p
  ),
  ranked AS (
    SELECT
      f.*,
      row_number() OVER (ORDER BY f.fraction DESC, f.member_id) AS rn,
      (round(p_allocated_pool * 100) - sum(f.base_cents) OVER ())::bigint AS residual
    FROM floored f
  ),
  reconciled AS (
    SELECT
      r.*,
      CASE
        WHEN r.derived_rate IS NULL THEN NULL
        WHEN r.residual > 0 AND r.rn <= r.residual THEN (r.base_cents + 1) / 100.0
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
$func$;

REVOKE ALL ON FUNCTION public.isc_calculate_preview(date, date, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.isc_calculate_preview(date, date, numeric) TO authenticated;

COMMENT ON FUNCTION public.isc_calculate_preview(date, date, numeric) IS
  'ISC v2 preview. Derives the rate from the GA-allocated pool (plan 12.1); payouts reconcile exactly by largest-remainder (12.3). Returns the per-month ledger series (15.3). Excludes future-dated CBU rows from the balance walk (2026-09-18 fix) so the yearly-import year-end placeholder cannot erase the current year''s movements. Writes nothing.';

COMMIT;


-- =============================================================================
-- VERIFY -- run 27_ASSERT_CHAIN.sql for the real check. This is a smoke test.
-- =============================================================================
SELECT 'preview 2019' AS test,
       (SELECT count(*)::text FROM public.isc_calculate_preview('2019-01-01','2019-12-01', NULL)) AS members
UNION ALL SELECT 'preview 2025',
       (SELECT count(*)::text FROM public.isc_calculate_preview('2025-01-01','2025-12-01', NULL))
UNION ALL SELECT 'preview 2026',
       (SELECT count(*)::text FROM public.isc_calculate_preview('2026-01-01','2026-12-01', NULL));
