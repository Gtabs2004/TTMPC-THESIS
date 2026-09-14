-- =============================================================================
-- ISC v2 — allow ISC to be computed for 2019..2025, not just the current year
-- =============================================================================
-- WHY THE OLD FLOOR EXISTED
--   isc_calculate_preview and isc_post both refused any period starting before
--   2025-12-01, with the message "no month-by-month CBU history exists before
--   that date". That was TRUE at the time: capital_build_up held exactly one
--   snapshot row per member, dated 2025-12-31 (plan §8.1.1, §20).
--
-- WHY IT IS NOW WRONG
--   The yearly-history import (import_cbu_yearly_history.py) replaced that
--   single snapshot with 1,745 year-end rows covering 2019..2026 for 259
--   members. There IS history before December 2025 now, so the floor blocks
--   periods the data can actually answer.
--
-- WHAT THIS DOES AND DOES NOT CHANGE
--   Lowers the floor to 2019-01-01 in both functions and in the table CHECK.
--   It does NOT invent monthly detail. The imported history is YEAR-END only,
--   so for any year the twelve month-end balances all read that year's ending
--   balance, and the average therefore EQUALS the year-end balance.
--
--   That is arithmetically correct - it is the only balance on record for the
--   year - but it is not the same thing as a true monthly average. Once real
--   monthly transactions exist for a year, that year's average becomes a
--   genuine average with no further change needed here.
--
-- Idempotent. Changes no data.
-- =============================================================================

BEGIN;

-- 1. Table constraint -------------------------------------------------------
-- Postgres named this inline CHECK automatically. Drop whichever name it got,
-- then re-add under an explicit name so it is never ambiguous again.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.isc_postings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%2025-12-01%'
  LOOP
    EXECUTE format('ALTER TABLE public.isc_postings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.isc_postings
  DROP CONSTRAINT IF EXISTS isc_postings_period_start_floor;
ALTER TABLE public.isc_postings
  ADD CONSTRAINT isc_postings_period_start_floor
  CHECK (period_start >= DATE '2019-01-01');

-- 2. The two live functions -------------------------------------------------
-- Only the guard changes; everything else in each function is untouched.
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
        WHEN cbu.source_isc_id IS NOT NULL                     THEN 'isc'
        WHEN cbu.deposit_account = 'historical_import_2025'    THEN 'opening'
        WHEN cbu.deposit_account = 'historical_yearly_2019_2026' THEN 'opening'
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

-- isc_post: same one-line guard change, nothing else.
CREATE OR REPLACE FUNCTION public.isc_post(
  p_period_start   date,
  p_period_end     date,
  p_allocated_pool numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
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
  IF NOT public.has_portal_role(auth.uid(), auth.email(), ARRAY['bookkeeper']) THEN
    RAISE EXCEPTION 'Only a bookkeeper may post Interest on Share Capital.';
  END IF;

  IF p_allocated_pool IS NULL OR p_allocated_pool <= 0 THEN
    RAISE EXCEPTION 'An allocated pool greater than zero is required to post Interest on Share Capital.';
  END IF;

  IF v_period_start < DATE '2019-01-01' THEN
    RAISE EXCEPTION 'ISC period cannot start before January 2019 - no CBU history exists before that date.';
  END IF;

  IF v_period_end < v_period_start THEN
    RAISE EXCEPTION 'ISC period end must not be before the period start.';
  END IF;

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

  RETURN v_posting_id;
END;
$func$;

COMMIT;


-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT 'preview 2019' AS test,
       (SELECT count(*)::text FROM public.isc_calculate_preview('2019-01-01','2019-12-01', NULL)) AS members
UNION ALL SELECT 'preview 2022',
       (SELECT count(*)::text FROM public.isc_calculate_preview('2022-01-01','2022-12-01', NULL))
UNION ALL SELECT 'preview 2025',
       (SELECT count(*)::text FROM public.isc_calculate_preview('2025-01-01','2025-12-01', NULL))
UNION ALL SELECT 'preview 2026',
       (SELECT count(*)::text FROM public.isc_calculate_preview('2026-01-01','2026-12-01', NULL));
