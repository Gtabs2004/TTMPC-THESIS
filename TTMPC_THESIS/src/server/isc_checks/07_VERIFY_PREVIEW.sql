-- =============================================================================
-- ISC CHECK 7  --  Does the new preview compute the right numbers?
-- =============================================================================
-- Run AFTER isc_v2_02_preview.sql.
--
-- This is THE checkpoint of the migration. The preview writes nothing, so it is
-- safe to run repeatedly. If these numbers are wrong, stop -- everything built
-- on top of them would be wrong too.
--
-- Run ONE test at a time (Supabase shows only the last query's results).
-- Every test prints its own PASS / FAIL.
-- =============================================================================


-- =============================================================================
-- TEST 1  --  Rule 7: do the payouts add up to the pool EXACTLY?
-- =============================================================================
-- This is the hard constraint (§12.3). Not "within a tolerance" -- exactly.
-- If this fails, largest-remainder reconciliation is broken and nothing can be
-- posted, because isc_post will refuse a batch that does not balance.
--
-- Tries several awkward pool amounts. Odd values and small pools are where
-- centavo allocation goes wrong.
-- -----------------------------------------------------------------------------
WITH pools(pool) AS (
  VALUES (1000000.00), (1496104.42), (20000.00), (333333.33), (0.07), (999999.99)
),
results AS (
  SELECT
    p.pool,
    (SELECT count(*)                     FROM isc_calculate_preview('2025-12-01','2026-09-01', p.pool)) AS members,
    (SELECT round(sum(interest_amount),2) FROM isc_calculate_preview('2025-12-01','2026-09-01', p.pool)) AS paid_out,
    (SELECT count(*) FILTER (WHERE adjusted)
                                          FROM isc_calculate_preview('2025-12-01','2026-09-01', p.pool)) AS centavos_moved
  FROM pools p
)
SELECT
  to_char(pool, 'FM999,999,999.00')      AS pool_in,
  members,
  to_char(paid_out, 'FM999,999,999.00')  AS paid_out,
  round(paid_out - pool, 2)              AS difference,
  centavos_moved                         AS rows_adjusted,
  CASE WHEN paid_out = pool THEN 'PASS' ELSE '*** FAIL ***' END AS verdict
FROM results
ORDER BY pool DESC;


-- =============================================================================
-- TEST 2  --  Is the rate derived correctly, and is the basis unchanged?
-- =============================================================================
-- rate = pool / total_average  (§12.1). Cross-checked against the figures the
-- 2026-09-06 build produced: 263 members, basis PHP 29,922,087.77.
-- The basis should be close to that (it moves as real deposits come in), and
-- the member count should still be 263.
-- -----------------------------------------------------------------------------
SELECT
  'members eligible'                                   AS item,
  (SELECT count(*)::text
     FROM isc_calculate_preview('2025-12-01','2026-09-01', 1496104.42))     AS value,
  '263 on 2026-09-06'                                  AS compare_with
UNION ALL SELECT
  'total average (rule 4 denominator)',
  (SELECT to_char(max(total_average), 'FM999,999,999.00')
     FROM isc_calculate_preview('2025-12-01','2026-09-01', 1496104.42)),
  'PHP 29,922,087.77 on 2026-09-06'
UNION ALL SELECT
  'derived rate (percent)',
  (SELECT round(max(rate), 6)::text
     FROM isc_calculate_preview('2025-12-01','2026-09-01', 1496104.42)),
  'about 5.0 -- that pool WAS 5% of the basis'
UNION ALL SELECT
  'month count (divisor)',
  (SELECT max(month_count)::text
     FROM isc_calculate_preview('2025-12-01','2026-09-01', 1496104.42)),
  '10 for Dec 2025 - Sep 2026'
UNION ALL SELECT
  'rate is the SAME for every member',
  (SELECT CASE WHEN count(DISTINCT rate) = 1 THEN 'yes - PASS' ELSE 'NO - FAIL' END
     FROM isc_calculate_preview('2025-12-01','2026-09-01', 1496104.42)),
  'one rate per batch (rule 5)';


-- =============================================================================
-- TEST 3  --  Pool left blank: basis only, no payouts
-- =============================================================================
-- The bookkeeper must be able to ask "what is our basis?" before the General
-- Assembly decides an amount (§12.5 step 2). Interest must come back NULL --
-- never 0.00, which would look like a real decision to pay nothing.
-- -----------------------------------------------------------------------------
SELECT
  'members returned'                            AS item,
  count(*)::text                                AS value,
  CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM isc_calculate_preview('2025-12-01','2026-09-01', NULL)
UNION ALL SELECT
  'total average still computed',
  to_char(max(total_average), 'FM999,999,999.00'),
  CASE WHEN max(total_average) > 0 THEN 'PASS' ELSE 'FAIL' END
FROM isc_calculate_preview('2025-12-01','2026-09-01', NULL)
UNION ALL SELECT
  'interest is NULL, not 0.00',
  coalesce(max(interest_amount)::text, '(all null)'),
  CASE WHEN count(interest_amount) = 0 THEN 'PASS' ELSE '*** FAIL - should be NULL ***' END
FROM isc_calculate_preview('2025-12-01','2026-09-01', NULL);


-- =============================================================================
-- TEST 4  --  §15.4 identity: opening + CRJ + CDJ = last month-end balance
-- =============================================================================
-- Both books ADD (§18.1). If this fails, either the origin split is wrong or a
-- member's CBU chain is broken (§11.1). This is the regression test that the
-- signs are right.
-- -----------------------------------------------------------------------------
WITH p AS (
  SELECT * FROM isc_calculate_preview('2025-12-01','2026-09-01', 1496104.42)
),
checked AS (
  SELECT
    membership_id,
    member_name,
    opening_balance,
    (SELECT coalesce(sum(x), 0) FROM unnest(crj_by_month) x) AS crj_total,
    (SELECT coalesce(sum(x), 0) FROM unnest(cdj_by_month) x) AS cdj_total,
    month_end_balances[array_length(month_end_balances, 1)]  AS closing
  FROM p
)
SELECT
  count(*)                                                       AS members_checked,
  count(*) FILTER (WHERE round(opening_balance + crj_total + cdj_total, 2) <> round(closing, 2)) AS mismatches,
  CASE WHEN count(*) FILTER (WHERE round(opening_balance + crj_total + cdj_total, 2) <> round(closing, 2)) = 0
       THEN 'PASS' ELSE '*** FAIL - run the detail query below ***' END AS verdict
FROM checked;


-- =============================================================================
-- TEST 4b --  Detail for test 4. Returns nothing if test 4 passed.
-- =============================================================================
WITH p AS (
  SELECT * FROM isc_calculate_preview('2025-12-01','2026-09-01', 1496104.42)
),
checked AS (
  SELECT
    membership_id, member_name, opening_balance,
    (SELECT coalesce(sum(x), 0) FROM unnest(crj_by_month) x) AS crj_total,
    (SELECT coalesce(sum(x), 0) FROM unnest(cdj_by_month) x) AS cdj_total,
    month_end_balances[array_length(month_end_balances, 1)]  AS closing
  FROM p
)
SELECT
  membership_id, member_name, opening_balance, crj_total, cdj_total, closing,
  round(opening_balance + crj_total + cdj_total - closing, 2) AS gap
FROM checked
WHERE round(opening_balance + crj_total + cdj_total, 2) <> round(closing, 2)
ORDER BY abs(opening_balance + crj_total + cdj_total - closing) DESC;


-- =============================================================================
-- TEST 5  --  Are the array series the right shape?
-- =============================================================================
-- The grid renders one cell per month. Every array must have exactly
-- month_count elements, or columns and data go out of alignment.
-- -----------------------------------------------------------------------------
SELECT
  'rows returned'                                            AS item,
  count(*)::text                                             AS value,
  '' AS verdict
FROM isc_calculate_preview('2025-12-01','2026-09-01', 1496104.42)
UNION ALL SELECT
  'month_end_balances length = month_count',
  count(*) FILTER (WHERE array_length(month_end_balances,1) = month_count)::text || ' of ' || count(*)::text,
  CASE WHEN count(*) = count(*) FILTER (WHERE array_length(month_end_balances,1) = month_count)
       THEN 'PASS' ELSE 'FAIL' END
FROM isc_calculate_preview('2025-12-01','2026-09-01', 1496104.42)
UNION ALL SELECT
  'crj_by_month length = month_count',
  count(*) FILTER (WHERE array_length(crj_by_month,1) = month_count)::text || ' of ' || count(*)::text,
  CASE WHEN count(*) = count(*) FILTER (WHERE array_length(crj_by_month,1) = month_count)
       THEN 'PASS' ELSE 'FAIL' END
FROM isc_calculate_preview('2025-12-01','2026-09-01', 1496104.42)
UNION ALL SELECT
  'cdj_by_month length = month_count',
  count(*) FILTER (WHERE array_length(cdj_by_month,1) = month_count)::text || ' of ' || count(*)::text,
  CASE WHEN count(*) = count(*) FILTER (WHERE array_length(cdj_by_month,1) = month_count)
       THEN 'PASS' ELSE 'FAIL' END
FROM isc_calculate_preview('2025-12-01','2026-09-01', 1496104.42);


-- =============================================================================
-- TEST 6  --  Guards still refuse bad input
-- =============================================================================
-- Run each line separately. Each MUST raise an error. If one returns rows
-- instead, that guard is broken.
-- -----------------------------------------------------------------------------
-- Expect: "cannot start before December 2025"
--   SELECT * FROM isc_calculate_preview('2025-01-01','2026-09-01', 1000000);
--
-- Expect: "period end must not be before the period start"
--   SELECT * FROM isc_calculate_preview('2026-09-01','2026-01-01', 1000000);
--
-- Expect: "Allocated pool must be greater than zero"
--   SELECT * FROM isc_calculate_preview('2025-12-01','2026-09-01', 0);
--   SELECT * FROM isc_calculate_preview('2025-12-01','2026-09-01', -500);


-- =============================================================================
-- TEST 7  --  Eyeball the top ten
-- =============================================================================
-- The numbers a bookkeeper would actually read. Check that:
--   * average <= total share capital (an average cannot exceed the closing
--     balance unless the balance FELL during the period)
--   * the biggest holders get the biggest payouts
--   * only a handful of rows are marked adjusted (one centavo each)
-- -----------------------------------------------------------------------------
SELECT
  membership_id                                        AS member_no,
  member_name,
  to_char(opening_balance,       'FM999,999,999.00')   AS opening,
  to_char(total_share_capital,   'FM999,999,999.00')   AS closing,
  to_char(average_share_capital, 'FM999,999,999.00')   AS average,
  round(rate, 4)                                       AS rate_pct,
  to_char(interest_amount,       'FM999,999,999.00')   AS payout,
  round(payout_unrounded, 6)                           AS payout_exact,
  CASE WHEN adjusted THEN 'yes (+1 centavo)' ELSE '' END AS adjusted
FROM isc_calculate_preview('2025-12-01','2026-09-01', 1496104.42)
ORDER BY average_share_capital DESC
LIMIT 10;
