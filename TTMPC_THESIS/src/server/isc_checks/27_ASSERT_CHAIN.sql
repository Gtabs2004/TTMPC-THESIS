-- =============================================================================
-- ISC CHECK 27  --  the §15.4 chain assertion  (the regression test, finally)
-- =============================================================================
-- ISC_DIVIDEND_PLAN.md §15.4 specifies this check and §18.1 calls it
-- "a regression test rather than a question". It was never built. Had it
-- existed, the future-dated-placeholder bug fixed by
-- isc_fix_future_dated_balance.sql would have been caught the day the yearly
-- import landed instead of by reading the SQL.
--
-- THE ASSERTION, per member, over the chosen period:
--
--     opening_balance + SUM(crj_by_month) + SUM(cdj_by_month)
--       ==  month_end_balances[last]
--
-- Note the PLUS on CDJ. Per §18.1 loan CBU retention INCREASES share capital --
-- a PHP 500,000 loan puts 2% = PHP 10,000 INTO the member's capital. CDJ sits
-- in the disbursements book because of the transaction the money moved through,
-- not because it subtracts. Rule 1's minus sign is a generic-ledger-template
-- artifact and does not apply to this data.
--
-- -----------------------------------------------------------------------------
-- WHY THIS CATCHES WHAT NOTHING ELSE DOES
-- -----------------------------------------------------------------------------
-- The two halves of the grid come from INDEPENDENT sources:
--   * the balance column  -> ending_share_capital, via the month-end walk
--   * CRJ / CDJ           -> capital_added, via the movements CTE
-- so they can disagree, and when they do, nothing else notices. §15.3 spells
-- out why: "the running balance would still have been right, which is exactly
-- why it would have gone unnoticed."
--
-- It is also why isc_fix_future_dated_balance.sql deliberately did NOT add its
-- current_date guard to the `movements` CTE. The two halves must stay
-- independent or this assertion cannot detect a disagreement between them.
--
-- A FAILURE MEANS ONE OF:
--   1. a future-dated row is winning the balance walk   (the 2026-09-18 bug)
--   2. the member's capital_build_up chain is broken    (the §11.1 failure mode)
--   3. a movement is classified into no column at all   (a new deposit_account
--      label reaching neither CRJ, CDJ, nor 'opening')
-- Per §15.4, a failure means the posting "should be blocked rather than quietly
-- averaging a corrupt series" -- so investigate before posting, do not post and
-- reconcile after.
--
-- EXPECTED RESULT ON A HEALTHY PERIOD: zero rows from TEST 1.
--
-- Reads only. Changes nothing. Safe to run against live data, repeatedly.
-- =============================================================================


-- =============================================================================
-- TEST 1  --  the assertion itself
-- =============================================================================
-- Lists every member whose grid does not foot, worst first. Empty = PASS.
--
-- Openings are legitimately in NEITHER movement column (§15.6: the historical
-- import and new members' paid-up capital open the ledger, they are not
-- movements). So an opening row landing INSIDE the period is an expected,
-- benign cause of a mismatch -- the last column names it, so a real break is
-- not mistaken for one. Change the period below to test another year.
-- -----------------------------------------------------------------------------
WITH p AS (
  SELECT DATE '2026-01-01' AS period_start, DATE '2026-12-01' AS period_end
),
preview AS (
  SELECT v.*
  FROM p, LATERAL public.isc_calculate_preview(p.period_start, p.period_end, NULL) v
),
checked AS (
  SELECT
    pv.membership_id,
    pv.member_name,
    pv.opening_balance,
    (SELECT coalesce(sum(x), 0) FROM unnest(pv.crj_by_month) AS x) AS crj_total,
    (SELECT coalesce(sum(x), 0) FROM unnest(pv.cdj_by_month) AS x) AS cdj_total,
    pv.month_end_balances[array_length(pv.month_end_balances, 1)]  AS last_balance,
    pv.member_id
  FROM preview pv
)
SELECT
  c.membership_id,
  c.member_name,
  c.opening_balance,
  c.crj_total,
  c.cdj_total,
  c.opening_balance + c.crj_total + c.cdj_total AS expected_last_balance,
  c.last_balance                                AS actual_last_balance,
  round(c.last_balance - (c.opening_balance + c.crj_total + c.cdj_total), 2) AS difference,
  -- Name the benign cause when there is one, so a real break stands out.
  coalesce((
    SELECT string_agg(DISTINCT cbu.deposit_account, ', ')
    FROM public.capital_build_up cbu, p
    WHERE cbu.member_id = c.member_id
      AND cbu.transaction_date::date BETWEEN p.period_start
                                         AND (date_trunc('month', p.period_end)
                                              + interval '1 month' - interval '1 day')::date
      AND cbu.transaction_date::date <= current_date
      AND cbu.source_isc_id IS NULL
      AND (
        cbu.deposit_account IN ('historical_import_2025', 'historical_yearly_2019_2026')
        OR regexp_replace(lower(coalesce(cbu.deposit_account, '')), '[^a-z0-9]+', '_', 'g')
             = 'initial_paid_up_capital'
      )
  ), '*** NO OPENING ROW IN PERIOD - INVESTIGATE ***') AS benign_cause_if_any
FROM checked c
WHERE round(c.last_balance - (c.opening_balance + c.crj_total + c.cdj_total), 2) <> 0
ORDER BY abs(c.last_balance - (c.opening_balance + c.crj_total + c.cdj_total)) DESC;


-- =============================================================================
-- TEST 2  --  is any future-dated row still reachable by the balance walk?
-- =============================================================================
-- Directly targets the 2026-09-18 bug. Counts CBU rows dated after today.
-- These are not junk -- the yearly import writes a year-END snapshot per member
-- per year, so the current year's is legitimately in the future until 31 Dec,
-- and it becomes the correct year-end balance on its own. They must simply not
-- be readable as evidence yet.
--
-- AFTER the fix this should report rows_dated_in_future > 0 (they still exist,
-- that is fine and expected) while TEST 1 comes back empty. If TEST 1 fails AND
-- this reports rows, the fix has not been applied to this database.
-- -----------------------------------------------------------------------------
SELECT
  count(*)                                                   AS rows_dated_in_future,
  count(DISTINCT member_id)                                  AS members_affected,
  min(transaction_date::date)                                AS earliest_future_date,
  max(transaction_date::date)                                AS latest_future_date,
  string_agg(DISTINCT coalesce(deposit_account, '(none)'), ', ') AS labels,
  CASE
    WHEN count(*) = 0 THEN 'none - nothing to guard against right now'
    ELSE 'present - TEST 1 must still pass; if it does not, apply isc_fix_future_dated_balance.sql'
  END AS note
FROM public.capital_build_up
WHERE transaction_date::date > current_date;


-- =============================================================================
-- TEST 3  --  does every movement land in a known column?
-- =============================================================================
-- §15.3: "assert that no row falls outside every filter ... otherwise a
-- movement can vanish from the grid while still moving the balance."
--
-- CRJ is a catch-all, so a new or misspelled label lands there SILENTLY and
-- still totals correctly -- that is how the 'Initial Paid-Up Capital' hyphen
-- bug hid (§21.6, 3 rows / PHP 30,000 misfiled). This lists every label
-- reaching CRJ so an unexpected one is visible.
--
-- Anything not a genuine cashier tender type is a misclassification.
-- -----------------------------------------------------------------------------
SELECT
  coalesce(deposit_account, '(no label)')                   AS label_reaching_crj,
  count(*)                                                  AS rows,
  to_char(round(sum(capital_added), 2), 'FM999,999,999.00') AS total_added,
  CASE
    WHEN deposit_account IN ('Cash', 'GCash', 'Check', 'Bank Transfer')
      THEN 'ok - cashier tender'
    ELSE '*** UNEXPECTED - investigate ***'
  END                                                       AS status
FROM public.capital_build_up cbu
WHERE cbu.source_isc_id IS NULL
  AND cbu.source_loan_id IS NULL
  AND cbu.deposit_account IS DISTINCT FROM 'LOAN_CBU_RETENTION'
  AND cbu.deposit_account IS DISTINCT FROM 'historical_import_2025'
  AND cbu.deposit_account IS DISTINCT FROM 'historical_yearly_2019_2026'
  AND regexp_replace(lower(coalesce(cbu.deposit_account, '')), '[^a-z0-9]+', '_', 'g')
        <> 'initial_paid_up_capital'
GROUP BY deposit_account
ORDER BY rows DESC;


-- =============================================================================
-- TEST 4  --  the worked example from isc_fix_future_dated_balance.sql
-- =============================================================================
-- Member e074308d-... is row 1 of migration/cbu_yearly_history_import.sql:
--     2025-12-31  ending 121,299.31
--     2026-12-31  ending 121,599.31   <- the placeholder
--
-- With NO 2026 movement, Jan..Dec 2026 should every month read 121,299.31 and
-- the average should be exactly that -- NOT 121,599.31, and not a blend.
-- A blend is the signature of the placeholder leaking into the walk.
--
-- If this member has since had real 2026 movement the expectation changes;
-- read the balances column and check it against their actual CBU rows rather
-- than against the literal below.
-- -----------------------------------------------------------------------------
SELECT
  membership_id,
  member_name,
  opening_balance,
  month_end_balances,
  average_share_capital,
  CASE
    WHEN 121599.31 = ANY(month_end_balances)
      THEN '*** FAIL - the 2026-12-31 placeholder is in the walk ***'
    ELSE 'ok - no placeholder balance present'
  END AS placeholder_check
FROM public.isc_calculate_preview('2026-01-01', '2026-12-01', NULL)
WHERE member_id = 'e074308d-58eb-4d7a-9297-28d71003f6cf'::uuid;
