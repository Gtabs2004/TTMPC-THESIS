-- =============================================================================
-- ISC CHECK 16  --  Which 2 chain links broke, and why?   (READ-ONLY)
-- =============================================================================
-- Settlement wrote 263 rows dated 2027-03-15 and the chain check now reports
-- 2 broken links (it was 0 before). Find them before touching anything.
--
-- LIKELY CAUSE, to be confirmed below:
--   The 2 CASH members were skipped -- correctly, they get no CBU row. But the
--   two largest payouts were chosen as the cash list, and those are the two
--   biggest holders. If the break is on OTHER members, the cause is different.
--
--   More probable: isc_settle_posting reads each member's CURRENT balance with
--   ORDER BY transaction_date DESC, and the new rows are dated 2027-03-15 --
--   in the FUTURE relative to every existing row. For a member whose latest
--   real row is dated LATER than another member's, that is fine. But if a
--   member already had a row dated after 2027-03-15, or two members' rows tie,
--   the "current balance" read and the chain order can disagree.
--
-- Safe: reads only.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1  --  the 2 broken links, in full
-- -----------------------------------------------------------------------------
WITH ordered AS (
  SELECT
    cbu.member_id,
    cbu.id,
    cbu.transaction_date,
    cbu.deposit_account,
    cbu.cbu_deposit_id,
    cbu.starting_share_capital,
    cbu.capital_added,
    cbu.ending_share_capital,
    cbu.source_isc_id,
    lag(cbu.ending_share_capital) OVER w   AS previous_ending,
    lag(cbu.transaction_date)     OVER w   AS previous_date,
    lag(cbu.cbu_deposit_id)       OVER w   AS previous_cbud
  FROM public.capital_build_up cbu
  WINDOW w AS (
    PARTITION BY cbu.member_id
    ORDER BY cbu.transaction_date,
      NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''),'^CBUD_0*',''),'')::integer NULLS FIRST,
      cbu.id
  )
)
SELECT
  m.membership_id                                       AS member_no,
  btrim(concat_ws(' ', m.first_name, m.last_name))      AS member_name,
  o.previous_date::date                                 AS prev_row_date,
  o.previous_cbud                                       AS prev_deposit_id,
  o.previous_ending                                     AS prev_ending,
  o.transaction_date::date                              AS this_row_date,
  o.cbu_deposit_id                                      AS this_deposit_id,
  o.deposit_account                                     AS this_row_type,
  o.starting_share_capital                              AS this_starting,
  round(o.starting_share_capital - o.previous_ending, 2) AS gap,
  (o.source_isc_id IS NOT NULL)                         AS is_an_isc_row
FROM ordered o
JOIN public.member m ON m.id = o.member_id
WHERE o.previous_ending IS NOT NULL
  AND round(o.starting_share_capital, 2) <> round(o.previous_ending, 2)
ORDER BY abs(o.starting_share_capital - o.previous_ending) DESC;


-- -----------------------------------------------------------------------------
-- PART 2  --  full ledger for the affected members
-- -----------------------------------------------------------------------------
-- Shows every row for anyone with a break, in chain order, so the discontinuity
-- is visible in context.
-- -----------------------------------------------------------------------------
WITH ordered AS (
  SELECT
    cbu.*,
    lag(cbu.ending_share_capital) OVER (
      PARTITION BY cbu.member_id
      ORDER BY cbu.transaction_date,
        NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''),'^CBUD_0*',''),'')::integer NULLS FIRST,
        cbu.id
    ) AS previous_ending
  FROM public.capital_build_up cbu
),
affected AS (
  SELECT DISTINCT member_id FROM ordered
  WHERE previous_ending IS NOT NULL
    AND round(starting_share_capital,2) <> round(previous_ending,2)
)
SELECT
  m.membership_id                                       AS member_no,
  btrim(concat_ws(' ', m.first_name, m.last_name))      AS member_name,
  cbu.transaction_date::date                            AS date,
  cbu.cbu_deposit_id                                    AS deposit_id,
  cbu.deposit_account                                   AS type,
  cbu.starting_share_capital                            AS starting,
  cbu.capital_added                                     AS added,
  cbu.ending_share_capital                              AS ending
FROM public.capital_build_up cbu
JOIN affected a ON a.member_id = cbu.member_id
JOIN public.member m ON m.id = cbu.member_id
ORDER BY
  m.membership_id,
  cbu.transaction_date,
  NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''),'^CBUD_0*',''),'')::integer NULLS FIRST,
  cbu.id;


-- -----------------------------------------------------------------------------
-- PART 3  --  were these members ALREADY broken before settlement?
-- -----------------------------------------------------------------------------
-- Re-runs the chain check while IGNORING every row settlement created. If this
-- reports 2 breaks as well, the breaks pre-date settlement and were simply not
-- visible while those members had only one row. If it reports 0, settlement
-- caused them.
-- -----------------------------------------------------------------------------
WITH pre AS (
  SELECT
    starting_share_capital,
    lag(ending_share_capital) OVER (
      PARTITION BY member_id
      ORDER BY transaction_date,
        NULLIF(regexp_replace(coalesce(cbu_deposit_id,''),'^CBUD_0*',''),'')::integer NULLS FIRST,
        id
    ) AS previous_ending
  FROM public.capital_build_up
  WHERE source_isc_id IS NULL          -- exclude ALL isc-created rows
)
SELECT
  'breaks EXCLUDING every ISC-created row'              AS item,
  count(*) FILTER (WHERE previous_ending IS NOT NULL
    AND round(starting_share_capital,2) <> round(previous_ending,2))::text AS breaks,
  CASE
    WHEN count(*) FILTER (WHERE previous_ending IS NOT NULL
      AND round(starting_share_capital,2) <> round(previous_ending,2)) = 0
    THEN 'settlement CAUSED the 2 breaks'
    ELSE 'the breaks PRE-DATE settlement'
  END                                                   AS conclusion
FROM pre;
