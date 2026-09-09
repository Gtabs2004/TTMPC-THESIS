-- =============================================================================
-- ISC CHECK 1 of 3  --  "Is the data trustworthy?"
-- =============================================================================
-- WHAT TO DO
--   1. Paste this whole file into the Supabase SQL editor.
--   2. Press Run.
--   3. Look at the VERDICT column. You get 6 rows, one per check.
--
-- WHAT YOU WANT TO SEE
--   Every row says PASS.
--   If any row says FAIL, stop and run 02_WHAT_WENT_WRONG.sql to see why.
--
-- IS THIS SAFE?
--   Yes. It only reads. It changes nothing. Safe on the live database.
--
-- WHY BOTHER
--   ISC calculates interest from each member's share capital history, then
--   writes the result permanently into their balance. If the history is wrong,
--   the interest is wrong -- and it is hard to undo. This was already broken
--   once (2026-09-04: 9 bad links, a PHP 446,478 gap). This re-checks it.
--
-- SCOPE
--   Only the 258 real members brought in by the Python migration
--   (deposit_account = 'historical_import_2025'), plus everything that has
--   happened to them since. Test accounts are ignored on purpose.
-- =============================================================================

WITH

-- The real members and all their CBU rows.
scoped AS (
  SELECT cbu.*
  FROM public.capital_build_up cbu
  WHERE EXISTS (
    SELECT 1 FROM public.capital_build_up seed
    WHERE seed.member_id = cbu.member_id
      AND seed.deposit_account = 'historical_import_2025'
  )
),

-- Each row, plus the ending balance of the row before it (same member).
-- The sort order matters: date first, then the number inside cbu_deposit_id
-- (as a NUMBER, not text), then id. Same-day deposits would otherwise tie and
-- come back in random order -- that was the 2026-09-04 bug.
ordered AS (
  SELECT
    member_id,
    starting_share_capital,
    ending_share_capital,
    capital_added,
    lag(ending_share_capital) OVER (
      PARTITION BY member_id
      ORDER BY
        transaction_date,
        NULLIF(regexp_replace(coalesce(cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer NULLS FIRST,
        id
    ) AS previous_ending
  FROM scoped
),

-- One line per member: what they opened with, what was added, where they ended.
per_member AS (
  SELECT
    member_id,
    round(sum(capital_added), 2) AS total_of_all_rows,
    round((ARRAY_AGG(ending_share_capital ORDER BY
      transaction_date DESC,
      NULLIF(regexp_replace(coalesce(cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer DESC NULLS LAST,
      id DESC
    ))[1], 2) AS current_balance
  FROM scoped
  GROUP BY member_id
),

-- How many "origins" each row has. Every row should have exactly one:
--   the migration | a membership payment | a cashier deposit | a loan | an ISC posting
origins AS (
  SELECT
    (deposit_account = 'historical_import_2025')::int
  + (source_payment_id IS NOT NULL)::int
  + (cbu_deposit_id    IS NOT NULL)::int
  + (source_loan_id    IS NOT NULL)::int
  + (source_isc_id     IS NOT NULL)::int AS origin_count
  FROM scoped
)

-- ---------------------------------------------------------------------------
-- The six checks, stacked into one result table.
-- ---------------------------------------------------------------------------

SELECT 1 AS n,
       'A. Each row adds up by itself'                AS check_name,
       'ending = starting + amount added'             AS what_it_means,
       count(*)                                       AS items_checked,
       count(*) FILTER (
         WHERE round(coalesce(ending_share_capital,0),2)
            <> round(coalesce(starting_share_capital,0) + coalesce(capital_added,0),2)
       )                                              AS problems_found,
       CASE WHEN count(*) FILTER (
         WHERE round(coalesce(ending_share_capital,0),2)
            <> round(coalesce(starting_share_capital,0) + coalesce(capital_added,0),2)
       ) = 0 THEN 'PASS' ELSE 'FAIL' END              AS verdict
FROM scoped

UNION ALL
SELECT 2,
       'B. Rows join up (THE IMPORTANT ONE)',
       'each row starts where the last one ended',
       count(*),
       count(*) FILTER (
         WHERE previous_ending IS NOT NULL
           AND round(starting_share_capital,2) <> round(previous_ending,2)
       ),
       CASE WHEN count(*) FILTER (
         WHERE previous_ending IS NOT NULL
           AND round(starting_share_capital,2) <> round(previous_ending,2)
       ) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM ordered

UNION ALL
SELECT 3,
       'C. Every row says where it came from',
       'exactly one origin per row, never zero or two',
       count(*),
       count(*) FILTER (WHERE origin_count <> 1),
       CASE WHEN count(*) FILTER (WHERE origin_count <> 1) = 0
            THEN 'PASS' ELSE 'FAIL' END
FROM origins

UNION ALL
SELECT 4,
       'D. Member totals are right (THE IMPORTANT ONE)',
       'opening + everything added = current balance',
       count(*),
       count(*) FILTER (WHERE total_of_all_rows <> current_balance),
       CASE WHEN count(*) FILTER (WHERE total_of_all_rows <> current_balance) = 0
            THEN 'PASS' ELSE 'FAIL' END
FROM per_member

UNION ALL
SELECT 5,
       'E. Loan retention adds money',
       'a PHP 500k loan should put +PHP 10k into capital',
       count(*),
       count(*) FILTER (WHERE capital_added < 0),
       CASE WHEN count(*) = 0 THEN 'NO LOAN ROWS YET'
            WHEN count(*) FILTER (WHERE capital_added < 0) = 0 THEN 'PASS'
            ELSE 'FAIL' END
FROM public.capital_build_up
WHERE source_loan_id IS NOT NULL

UNION ALL
SELECT 6,
       'F. Members with no share capital at all',
       'active members the migration never gave a balance',
       (SELECT count(*) FROM public.member
          WHERE lower(coalesce(member_status,'active')) = 'active'),
       (SELECT count(*) FROM public.member m
          WHERE lower(coalesce(m.member_status,'active')) = 'active'
            AND NOT EXISTS (SELECT 1 FROM public.capital_build_up c
                             WHERE c.member_id = m.id)),
       'INFO ONLY'

ORDER BY n;
