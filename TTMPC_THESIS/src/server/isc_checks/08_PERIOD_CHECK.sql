-- =============================================================================
-- ISC CHECK 8  --  Which period is the right one to calculate?
-- =============================================================================
-- Test 7 showed opening_balance = 0.00 for every member, and average exactly
-- equal to the closing balance. Both point at the PERIOD used in the test, not
-- at the arithmetic.
--
-- The import rows are dated 2025-12-31 -- INSIDE December. So a period starting
-- 2025-12-01 asks for the balance BEFORE 1 December, which is nothing, while
-- December's own month-end picks the import up. Every later month then carries
-- the same figure forward, so the average equals the closing balance.
--
-- December 2025 is the OPENING BALANCE month, not an earning month. The first
-- real distribution period is Jan-Dec 2026, with December 2025 as carry-in --
-- exactly what plan §12.6 describes.
--
-- Safe: reads only.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1  --  the same member, three different periods
-- -----------------------------------------------------------------------------
-- TTMPC-055 (Jessie Gargaritano) holds PHP 1,510,000 from the import.
--
-- Expect:
--   Dec2025-Sep2026  opening 0.00        -- WRONG QUESTION: asks for the
--                                           balance before the import existed
--   Jan2026-Sep2026  opening 1,510,000   -- correct: December carried in
--   Jan2026-Dec2026  opening 1,510,000   -- the real first ISC period
-- -----------------------------------------------------------------------------
SELECT
  'Dec 2025 - Sep 2026'                                 AS period,
  to_char(opening_balance,       'FM999,999,999.00')    AS opening,
  to_char(average_share_capital, 'FM999,999,999.00')    AS average,
  to_char(total_share_capital,   'FM999,999,999.00')    AS closing,
  month_count                                           AS months
FROM isc_calculate_preview('2025-12-01','2026-09-01', 1000000)
WHERE membership_id = 'TTMPC-055'
UNION ALL
SELECT
  'Jan 2026 - Sep 2026',
  to_char(opening_balance,       'FM999,999,999.00'),
  to_char(average_share_capital, 'FM999,999,999.00'),
  to_char(total_share_capital,   'FM999,999,999.00'),
  month_count
FROM isc_calculate_preview('2026-01-01','2026-09-01', 1000000)
WHERE membership_id = 'TTMPC-055'
UNION ALL
SELECT
  'Jan 2026 - Dec 2026  <-- the real period',
  to_char(opening_balance,       'FM999,999,999.00'),
  to_char(average_share_capital, 'FM999,999,999.00'),
  to_char(total_share_capital,   'FM999,999,999.00'),
  month_count
FROM isc_calculate_preview('2026-01-01','2026-12-01', 1000000)
WHERE membership_id = 'TTMPC-055';


-- -----------------------------------------------------------------------------
-- PART 2  --  a member who actually moved during 2026
-- -----------------------------------------------------------------------------
-- Only ~12 members have any 2026 activity (§21 query G). For those, the average
-- should sit BETWEEN the opening and the closing balance -- that is what proves
-- the month-by-month walk is doing real work rather than repeating one number.
--
-- Members with no movement correctly show average = opening = closing.
-- -----------------------------------------------------------------------------
SELECT
  membership_id                                        AS member_no,
  member_name,
  to_char(opening_balance,       'FM999,999,999.00')   AS opening,
  to_char(average_share_capital, 'FM999,999,999.00')   AS average,
  to_char(total_share_capital,   'FM999,999,999.00')   AS closing,
  (SELECT coalesce(sum(x),0) FROM unnest(crj_by_month) x) AS crj_in_period,
  (SELECT coalesce(sum(x),0) FROM unnest(cdj_by_month) x) AS cdj_in_period,
  CASE
    WHEN average_share_capital > opening_balance
     AND average_share_capital < total_share_capital
      THEN 'PASS - average sits between'
    WHEN opening_balance = total_share_capital
      THEN 'no movement - average = balance is correct'
    ELSE '*** CHECK THIS ***'
  END                                                  AS verdict
FROM isc_calculate_preview('2026-01-01','2026-12-01', 1000000)
WHERE (SELECT coalesce(sum(x),0) FROM unnest(crj_by_month) x) <> 0
   OR (SELECT coalesce(sum(x),0) FROM unnest(cdj_by_month) x) <> 0
ORDER BY average_share_capital DESC;


-- -----------------------------------------------------------------------------
-- PART 3  --  month-by-month, for one member who moved
-- -----------------------------------------------------------------------------
-- The clearest proof the walk works. Balance should step up in the month a
-- deposit lands and hold flat otherwise.
--
-- Change the membership_id to any member from PART 2.
-- -----------------------------------------------------------------------------
WITH one AS (
  SELECT *
  FROM isc_calculate_preview('2026-01-01','2026-12-01', 1000000)
  WHERE (SELECT coalesce(sum(x),0) FROM unnest(crj_by_month) x) <> 0
  ORDER BY average_share_capital DESC
  LIMIT 1
)
SELECT
  o.membership_id                                     AS member_no,
  o.member_name,
  to_char(DATE '2026-01-01' + ((s.i - 1) || ' month')::interval, 'YYYY-Mon') AS month,
  to_char(o.crj_by_month[s.i],       'FM999,999,999.00') AS cashier_in,
  to_char(o.cdj_by_month[s.i],       'FM999,999,999.00') AS loan_retention,
  to_char(o.month_end_balances[s.i], 'FM999,999,999.00') AS balance_at_month_end
FROM one o
CROSS JOIN generate_series(1, o.month_count) AS s(i)
ORDER BY s.i;


-- -----------------------------------------------------------------------------
-- PART 4  --  does rule 7 still hold on the corrected period?
-- -----------------------------------------------------------------------------
-- Re-runs the reconciliation test on Jan-Dec 2026. Payouts must equal the pool
-- EXACTLY for every pool amount.
-- -----------------------------------------------------------------------------
WITH pools(pool) AS (
  VALUES (1000000.00), (1496104.42), (20000.00), (333333.33), (0.07), (999999.99)
)
SELECT
  to_char(p.pool, 'FM999,999,999.00')                  AS pool_in,
  (SELECT count(*)
     FROM isc_calculate_preview('2026-01-01','2026-12-01', p.pool))            AS members,
  to_char((SELECT round(sum(interest_amount),2)
     FROM isc_calculate_preview('2026-01-01','2026-12-01', p.pool)), 'FM999,999,999.00') AS paid_out,
  (SELECT round(sum(interest_amount),2) - p.pool
     FROM isc_calculate_preview('2026-01-01','2026-12-01', p.pool))            AS difference,
  (SELECT count(*) FILTER (WHERE adjusted)
     FROM isc_calculate_preview('2026-01-01','2026-12-01', p.pool))            AS rows_adjusted,
  CASE WHEN (SELECT round(sum(interest_amount),2)
               FROM isc_calculate_preview('2026-01-01','2026-12-01', p.pool)) = p.pool
       THEN 'PASS' ELSE '*** FAIL ***' END             AS verdict
FROM pools p
ORDER BY p.pool DESC;
