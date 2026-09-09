-- =============================================================================
-- ISC — CALCULATION ONLY.  Nothing is posted. Nothing is written. Ever.
-- =============================================================================
-- isc_calculate_preview is a READ-ONLY function. It computes what every member
-- would receive and returns it. It creates no posting, no line items, and no
-- capital_build_up rows. Run it as often as you like.
--
-- HOW TO USE
--   Each part below is one query. Change the two dates and the pool, run it,
--   read the numbers. Nothing else happens.
--
--     isc_calculate_preview(period_start, period_end, allocated_pool)
--
--   The pool may be NULL -- then you get the basis and no payouts, which
--   answers "how much is our total share capital?" before the General Assembly
--   decides an amount.
--
-- WHICH PERIOD
--   Use JANUARY as the start month. The 2025-12-31 import rows sit INSIDE
--   December, so a period starting 2025-12-01 asks for the balance BEFORE the
--   import existed -- every opening reads PHP 0 and every average equals the
--   closing balance. December 2025 is the OPENING month, not an earning month
--   (plan §22.5).
--
--     GOOD:  '2026-01-01' to '2026-12-01'
--     BAD:   '2025-12-01' to anything
-- =============================================================================


-- =============================================================================
-- PART 1  --  the summary: what would this distribution look like?
-- =============================================================================
-- The five numbers a bookkeeper actually needs before deciding anything.
-- -----------------------------------------------------------------------------
WITH p AS (
  SELECT * FROM public.isc_calculate_preview('2026-01-01', '2026-12-01', 1000000.00)
)
SELECT
  'Period'                                                  AS item,
  'Jan 2026 - Dec 2026'                                     AS value
UNION ALL SELECT 'Months in the period',    (SELECT max(month_count)::text FROM p)
UNION ALL SELECT 'Eligible members',        (SELECT count(*)::text FROM p)
UNION ALL SELECT 'Total average share capital (the basis)',
                 (SELECT to_char(max(total_average), 'FM999,999,999.00') FROM p)
UNION ALL SELECT 'Pool allocated by the General Assembly',
                 (SELECT to_char(max(allocated_pool), 'FM999,999,999.00') FROM p)
UNION ALL SELECT 'Rate this works out to (%)',
                 (SELECT round(max(rate), 4)::text FROM p)
UNION ALL SELECT 'Total to be paid out',
                 (SELECT to_char(sum(interest_amount), 'FM999,999,999.00') FROM p)
UNION ALL SELECT 'Balances exactly? (must equal the pool)',
                 (SELECT CASE WHEN sum(interest_amount) = max(allocated_pool)
                              THEN 'YES - balanced' ELSE 'NO - do not use' END FROM p);


-- =============================================================================
-- PART 2  --  every member, largest first
-- =============================================================================
-- The full list. Export this if the bookkeeper wants it in Excel.
-- -----------------------------------------------------------------------------
SELECT
  membership_id                                        AS member_no,
  member_name,
  to_char(opening_balance,       'FM999,999,999.00')   AS opening_balance,
  to_char(total_share_capital,   'FM999,999,999.00')   AS closing_balance,
  to_char(average_share_capital, 'FM999,999,999.00')   AS average_share_capital,
  round(rate, 4)                                       AS rate_pct,
  to_char(interest_amount,       'FM999,999,999.00')   AS interest_earned,
  CASE WHEN adjusted THEN 'yes' ELSE '' END            AS centavo_adjusted
FROM public.isc_calculate_preview('2026-01-01', '2026-12-01', 1000000.00)
ORDER BY average_share_capital DESC;


-- =============================================================================
-- PART 3  --  the basis only, with NO pool decided yet
-- =============================================================================
-- Answers "what is our total share capital basis?" before the GA sets an
-- amount. The interest column comes back NULL -- deliberately not 0.00, which
-- would look like a decision to pay nothing (plan §12.5).
-- -----------------------------------------------------------------------------
SELECT
  'Eligible members'                                        AS item,
  count(*)::text                                            AS value
FROM public.isc_calculate_preview('2026-01-01', '2026-12-01', NULL)
UNION ALL SELECT
  'Total average share capital (the basis)',
  (SELECT to_char(max(total_average), 'FM999,999,999.00')
     FROM public.isc_calculate_preview('2026-01-01', '2026-12-01', NULL))
UNION ALL SELECT
  'Interest column',
  (SELECT CASE WHEN count(interest_amount) = 0 THEN 'NULL - no pool decided yet'
               ELSE 'unexpectedly populated' END
     FROM public.isc_calculate_preview('2026-01-01', '2026-12-01', NULL));


-- =============================================================================
-- PART 4  --  try several pools side by side
-- =============================================================================
-- "What rate would each of these amounts work out to?" Useful for the General
-- Assembly deciding how much to allocate.
-- -----------------------------------------------------------------------------
WITH pools(pool) AS (
  VALUES (500000.00), (750000.00), (1000000.00), (1250000.00), (1500000.00)
)
SELECT
  to_char(p.pool, 'FM999,999,999.00')                       AS pool,
  (SELECT round(max(rate), 4)
     FROM public.isc_calculate_preview('2026-01-01','2026-12-01', p.pool))   AS works_out_to_pct,
  (SELECT count(*)
     FROM public.isc_calculate_preview('2026-01-01','2026-12-01', p.pool))   AS members,
  (SELECT to_char(max(interest_amount), 'FM999,999,999.00')
     FROM public.isc_calculate_preview('2026-01-01','2026-12-01', p.pool))   AS largest_payout,
  (SELECT to_char(min(interest_amount), 'FM999,999,999.00')
     FROM public.isc_calculate_preview('2026-01-01','2026-12-01', p.pool))   AS smallest_payout
FROM pools p
ORDER BY p.pool;


-- =============================================================================
-- PART 5  --  one member's year, month by month
-- =============================================================================
-- Shows exactly how a member's average was arrived at: the balance at each
-- month end, and the movements that changed it. This is what answers "why did
-- this member get this amount?".
--
-- Change the membership_id to whoever is being queried.
-- -----------------------------------------------------------------------------
WITH one AS (
  SELECT * FROM public.isc_calculate_preview('2026-01-01', '2026-12-01', 1000000.00)
  WHERE membership_id = 'TTMPC-055'          -- <-- change this
)
SELECT
  o.membership_id                                                   AS member_no,
  o.member_name,
  to_char(DATE '2026-01-01' + ((s.i - 1) || ' month')::interval, 'Mon YYYY') AS month,
  to_char(o.crj_by_month[s.i],       'FM999,999,999.00')            AS paid_at_cashier,
  to_char(o.cdj_by_month[s.i],       'FM999,999,999.00')            AS from_loan_retention,
  to_char(o.month_end_balances[s.i], 'FM999,999,999.00')            AS balance_at_month_end
FROM one o
CROSS JOIN generate_series(1, o.month_count) AS s(i)
ORDER BY s.i;


-- =============================================================================
-- PART 6  --  the arithmetic, spelled out for one member
-- =============================================================================
-- Every step of the seven rules, so the figure can be checked by hand.
-- -----------------------------------------------------------------------------
WITH one AS (
  SELECT * FROM public.isc_calculate_preview('2026-01-01', '2026-12-01', 1000000.00)
  WHERE membership_id = 'TTMPC-055'          -- <-- change this
)
SELECT 'Member'                                    AS step,
       (SELECT membership_id || ' ' || member_name FROM one) AS value
UNION ALL SELECT '1. Balance carried in',
       (SELECT to_char(opening_balance, 'FM999,999,999.00') FROM one)
UNION ALL SELECT '2. Sum of the 12 month-end balances',
       (SELECT to_char((SELECT sum(x) FROM unnest(month_end_balances) x), 'FM999,999,999.00') FROM one)
UNION ALL SELECT '3. Divided by 12 = average share capital',
       (SELECT to_char(average_share_capital, 'FM999,999,999.00') FROM one)
UNION ALL SELECT '4. Cooperative total average (all members)',
       (SELECT to_char(total_average, 'FM999,999,999.00') FROM one)
UNION ALL SELECT '5. Rate = pool / total average',
       (SELECT round(rate, 6)::text || ' %' FROM one)
UNION ALL SELECT '6. Payout = average x rate',
       (SELECT round(payout_unrounded, 6)::text FROM one)
UNION ALL SELECT '7. Rounded to the centavo',
       (SELECT to_char(interest_amount, 'FM999,999,999.00') FROM one)
UNION ALL SELECT '   (centavo adjustment applied?)',
       (SELECT CASE WHEN adjusted THEN 'yes - received a residual centavo'
                    ELSE 'no' END FROM one);
