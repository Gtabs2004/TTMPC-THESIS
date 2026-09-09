-- =============================================================================
-- ISC CHECK 17  --  Show the 2 pre-existing broken links  (READ-ONLY, ONE query)
-- =============================================================================
-- Check 16 PART 3 proved these breaks PRE-DATE settlement: excluding every
-- ISC-created row still shows 2. So isc_settle_posting did not cause them.
--
-- They were invisible to check 01 because that check scoped to members holding
-- a 'historical_import_2025' row. These two are therefore almost certainly
-- members created THROUGH THE APP since the import -- exactly the 41 rows
-- check 01 deliberately excluded (§21).
--
-- That scoping was right for proving the cooperative's BOOKS are sound, but it
-- means "0 broken links" was never a statement about the whole table.
--
-- One query, so the Supabase editor shows it.
-- Safe: reads only.
-- =============================================================================

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
    lag(cbu.ending_share_capital) OVER w AS previous_ending,
    lag(cbu.transaction_date)     OVER w AS previous_date,
    lag(cbu.deposit_account)      OVER w AS previous_type
  FROM public.capital_build_up cbu
  WINDOW w AS (
    PARTITION BY cbu.member_id
    ORDER BY cbu.transaction_date,
      NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''),'^CBUD_0*',''),'')::integer NULLS FIRST,
      cbu.id
  )
)
SELECT
  m.membership_id                                        AS member_no,
  btrim(concat_ws(' ', m.first_name, m.last_name))       AS member_name,
  -- is this member part of the migrated cooperative books, or app-created?
  CASE WHEN EXISTS (
    SELECT 1 FROM public.capital_build_up c
    WHERE c.member_id = o.member_id
      AND c.deposit_account = 'historical_import_2025'
  ) THEN 'MIGRATED MEMBER - real books'
    ELSE 'app-created (outside check 01 scope)'
  END                                                    AS member_origin,
  o.previous_date::date                                  AS prev_date,
  o.previous_type                                        AS prev_type,
  o.previous_ending                                      AS prev_ending,
  o.transaction_date::date                               AS this_date,
  o.deposit_account                                      AS this_type,
  o.starting_share_capital                               AS this_starting,
  o.capital_added                                        AS this_added,
  o.ending_share_capital                                 AS this_ending,
  round(o.starting_share_capital - o.previous_ending, 2) AS gap,
  CASE WHEN o.source_isc_id IS NOT NULL
       THEN 'ISC row' ELSE 'not an ISC row' END          AS created_by
FROM ordered o
JOIN public.member m ON m.id = o.member_id
WHERE o.previous_ending IS NOT NULL
  AND round(o.starting_share_capital, 2) <> round(o.previous_ending, 2)
ORDER BY abs(o.starting_share_capital - o.previous_ending) DESC;
