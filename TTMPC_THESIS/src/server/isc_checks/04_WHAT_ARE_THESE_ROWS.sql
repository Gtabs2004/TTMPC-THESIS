-- =============================================================================
-- ISC CHECK 4  --  "Why did check C fail on nearly every row?"
-- =============================================================================
-- Check C said 774 of 775 rows have no recognisable origin. That ratio means
-- the CHECK is wrong, not the data. This shows what is actually in the table so
-- the origin rules can be corrected.
--
-- Safe: reads only, changes nothing.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1  --  every distinct label, and which key columns are filled in
-- -----------------------------------------------------------------------------
-- Read this as: for rows labelled X, how many carry a deposit id / loan id /
-- payment id / isc id? A label where all four are 0 is one the origin rules do
-- not yet know about.
-- -----------------------------------------------------------------------------
SELECT
  coalesce(deposit_account, '(no label)')                        AS label,
  count(*)                                                       AS rows,
  count(DISTINCT member_id)                                      AS members,
  count(*) FILTER (WHERE cbu_deposit_id    IS NOT NULL)          AS has_deposit_id,
  count(*) FILTER (WHERE source_loan_id    IS NOT NULL)          AS has_loan_id,
  count(*) FILTER (WHERE source_payment_id IS NOT NULL)          AS has_payment_id,
  count(*) FILTER (WHERE source_isc_id     IS NOT NULL)          AS has_isc_id,
  min(transaction_date)::date                                    AS earliest,
  max(transaction_date)::date                                    AS latest,
  to_char(round(sum(capital_added), 2), 'FM999,999,999.00')      AS total_added
FROM public.capital_build_up
GROUP BY 1
ORDER BY rows DESC;


-- -----------------------------------------------------------------------------
-- PART 2  --  a sample of the rows check C could not classify
-- -----------------------------------------------------------------------------
-- 20 real examples, so we can see what they are rather than guessing.
-- -----------------------------------------------------------------------------
SELECT
  m.membership_id                                  AS member_no,
  btrim(concat_ws(' ', m.first_name, m.last_name)) AS member_name,
  cbu.transaction_date::date                       AS date,
  coalesce(cbu.deposit_account, '(no label)')      AS label,
  cbu.starting_share_capital                       AS starting,
  cbu.capital_added                                AS added,
  cbu.ending_share_capital                         AS ending,
  cbu.cbu_deposit_id,
  cbu.source_loan_id,
  cbu.source_payment_id
FROM public.capital_build_up cbu
JOIN public.member m ON m.id = cbu.member_id
WHERE cbu.deposit_account IS DISTINCT FROM 'historical_import_2025'
  AND cbu.source_payment_id IS NULL
  AND cbu.cbu_deposit_id    IS NULL
  AND cbu.source_loan_id    IS NULL
  AND cbu.source_isc_id     IS NULL
ORDER BY cbu.transaction_date DESC
LIMIT 20;


-- -----------------------------------------------------------------------------
-- PART 3  --  did the migration tag survive at all?
-- -----------------------------------------------------------------------------
-- import_share_capital.py writes deposit_account = 'historical_import_2025'.
-- If this returns 0, the rows were relabelled or re-imported some other way,
-- and every check that keys off that tag needs rewriting.
-- -----------------------------------------------------------------------------
SELECT
  'rows tagged historical_import_2025'  AS what,
  count(*)::text                        AS how_many
FROM public.capital_build_up
WHERE deposit_account = 'historical_import_2025'
UNION ALL
SELECT
  'rows dated 2025-12-31 (import date)',
  count(*)::text
FROM public.capital_build_up
WHERE transaction_date::date = DATE '2025-12-31'
UNION ALL
SELECT
  'rows where starting = 0 (opening-balance shape)',
  count(*)::text
FROM public.capital_build_up
WHERE coalesce(starting_share_capital, 0) = 0
UNION ALL
SELECT
  'total rows in capital_build_up',
  count(*)::text
FROM public.capital_build_up;
