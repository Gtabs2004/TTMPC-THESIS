-- =============================================================================
-- ISC CHECK 5  --  "What labels are on the rows?"  (ONE query only)
-- =============================================================================
-- The Supabase editor shows only the LAST query when several are run together,
-- so this file contains exactly one.
--
-- Paste, Run, and send back the whole table.
--
-- HOW TO READ IT
--   Each line is one kind of row. The four "has_*" columns say how many of
--   those rows carry each identifying key.
--
--   A line where all four has_* columns are 0 is a row the ISC grid cannot
--   place in a column -- it would move a member's balance while being
--   invisible. Those are what we need to find.
--
-- Safe: reads only, changes nothing.
-- =============================================================================

SELECT
  coalesce(deposit_account, '(no label)')                   AS label,
  count(*)                                                  AS rows,
  count(DISTINCT member_id)                                 AS members,
  count(*) FILTER (WHERE cbu_deposit_id    IS NOT NULL)     AS has_deposit_id,
  count(*) FILTER (WHERE source_loan_id    IS NOT NULL)     AS has_loan_id,
  count(*) FILTER (WHERE source_payment_id IS NOT NULL)     AS has_payment_id,
  count(*) FILTER (WHERE source_isc_id     IS NOT NULL)     AS has_isc_id,
  count(*) FILTER (
    WHERE cbu_deposit_id    IS NULL
      AND source_loan_id    IS NULL
      AND source_payment_id IS NULL
      AND source_isc_id     IS NULL
  )                                                         AS has_NO_key,
  min(transaction_date)::date                               AS earliest,
  max(transaction_date)::date                               AS latest,
  to_char(round(sum(capital_added), 2), 'FM999,999,999.00') AS total_added
FROM public.capital_build_up
GROUP BY 1
ORDER BY rows DESC;
