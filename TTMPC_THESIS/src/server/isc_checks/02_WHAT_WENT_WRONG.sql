-- =============================================================================
-- ISC CHECK 2 of 3  --  "Show me the actual bad rows"
-- =============================================================================
-- ONLY RUN THIS IF 01_RUN_THIS_FIRST.sql SHOWED A FAIL.
--
-- There are three sections below. Run the one matching whichever check failed:
--
--   B failed  ->  run SECTION B   (rows that don't join up)
--   C failed  ->  run SECTION C   (rows with no origin)
--   D failed  ->  run SECTION D   (members whose totals don't match)
--
-- Highlight one section, press Run. Each shows the real names and amounts, so
-- you can take them to the bookkeeper.
--
-- Safe: reads only, changes nothing.
-- =============================================================================


-- =============================================================================
-- SECTION B  --  rows that do not continue from the row above
-- =============================================================================
-- "expected_starting" is where the row SHOULD have started (the previous row's
-- ending). "actual_starting" is where it did start. "gap" is the money that
-- appeared or vanished. Biggest gaps first.
-- -----------------------------------------------------------------------------
WITH scoped AS (
  SELECT cbu.*
  FROM public.capital_build_up cbu
  WHERE EXISTS (
    SELECT 1 FROM public.capital_build_up seed
    WHERE seed.member_id = cbu.member_id
      AND seed.deposit_account = 'historical_import_2025'
  )
),
ordered AS (
  SELECT
    member_id, transaction_date, deposit_account,
    starting_share_capital, capital_added, ending_share_capital,
    lag(ending_share_capital) OVER (
      PARTITION BY member_id
      ORDER BY
        transaction_date,
        NULLIF(regexp_replace(coalesce(cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer NULLS FIRST,
        id
    ) AS previous_ending
  FROM scoped
)
SELECT
  m.membership_id                                        AS member_no,
  btrim(concat_ws(' ', m.first_name, m.last_name))       AS member_name,
  o.transaction_date::date                               AS date,
  o.deposit_account                                      AS came_from,
  o.previous_ending                                      AS expected_starting,
  o.starting_share_capital                               AS actual_starting,
  round(o.starting_share_capital - o.previous_ending, 2) AS gap
FROM ordered o
JOIN public.member m ON m.id = o.member_id
WHERE o.previous_ending IS NOT NULL
  AND round(o.starting_share_capital, 2) <> round(o.previous_ending, 2)
ORDER BY abs(o.starting_share_capital - o.previous_ending) DESC;


-- =============================================================================
-- SECTION C  --  rows that don't say where they came from
-- =============================================================================
-- These rows change a member's balance but belong to no known source, so they
-- would be invisible in the ISC ledger grid. Grouped by their label.
-- -----------------------------------------------------------------------------
WITH scoped AS (
  SELECT cbu.*
  FROM public.capital_build_up cbu
  WHERE EXISTS (
    SELECT 1 FROM public.capital_build_up seed
    WHERE seed.member_id = cbu.member_id
      AND seed.deposit_account = 'historical_import_2025'
  )
)
SELECT
  coalesce(deposit_account, '(no label)')  AS label_on_the_row,
  count(*)                                 AS how_many_rows,
  count(DISTINCT member_id)                AS how_many_members,
  min(transaction_date)::date              AS earliest,
  max(transaction_date)::date              AS latest,
  round(sum(capital_added), 2)             AS total_amount
FROM scoped
WHERE deposit_account IS DISTINCT FROM 'historical_import_2025'
  AND source_payment_id IS NULL
  AND cbu_deposit_id    IS NULL
  AND source_loan_id    IS NULL
  AND source_isc_id     IS NULL
GROUP BY 1
ORDER BY how_many_rows DESC;


-- =============================================================================
-- SECTION D  --  members whose numbers don't add up
-- =============================================================================
-- "should_be" is opening plus everything added. "actually_is" is the balance
-- the system currently shows. If they differ, that member's interest would be
-- calculated on a wrong figure.
-- -----------------------------------------------------------------------------
WITH scoped AS (
  SELECT cbu.*
  FROM public.capital_build_up cbu
  WHERE EXISTS (
    SELECT 1 FROM public.capital_build_up seed
    WHERE seed.member_id = cbu.member_id
      AND seed.deposit_account = 'historical_import_2025'
  )
),
per_member AS (
  SELECT
    member_id,
    round(coalesce(sum(capital_added) FILTER (
      WHERE deposit_account = 'historical_import_2025'
         OR source_payment_id IS NOT NULL), 0), 2)                                    AS opening,
    round(coalesce(sum(capital_added) FILTER (WHERE cbu_deposit_id IS NOT NULL), 0), 2) AS cashier_deposits,
    round(coalesce(sum(capital_added) FILTER (WHERE source_loan_id IS NOT NULL), 0), 2) AS from_loans,
    round(coalesce(sum(capital_added) FILTER (
      WHERE deposit_account IS DISTINCT FROM 'historical_import_2025'
        AND source_payment_id IS NULL
        AND cbu_deposit_id    IS NULL
        AND source_loan_id    IS NULL
        AND source_isc_id     IS NULL), 0), 2)                                        AS unexplained,
    round(sum(capital_added), 2)                                                      AS should_be,
    round((ARRAY_AGG(ending_share_capital ORDER BY
      transaction_date DESC,
      NULLIF(regexp_replace(coalesce(cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer DESC NULLS LAST,
      id DESC
    ))[1], 2)                                                                         AS actually_is
  FROM scoped
  GROUP BY member_id
)
SELECT
  m.membership_id                                  AS member_no,
  btrim(concat_ws(' ', m.first_name, m.last_name)) AS member_name,
  pm.opening,
  pm.cashier_deposits,
  pm.from_loans,
  pm.unexplained,
  pm.should_be,
  pm.actually_is,
  round(pm.should_be - pm.actually_is, 2)          AS gap
FROM per_member pm
JOIN public.member m ON m.id = pm.member_id
WHERE pm.should_be <> pm.actually_is
ORDER BY abs(pm.should_be - pm.actually_is) DESC;
