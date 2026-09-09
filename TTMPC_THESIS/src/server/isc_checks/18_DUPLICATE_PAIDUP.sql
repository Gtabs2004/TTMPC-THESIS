-- =============================================================================
-- ISC CHECK 18  --  The duplicate paid-up capital rows   (READ-ONLY)
-- =============================================================================
-- The 2 "broken links" are not a chain bug. They are DOUBLE-WRITTEN initial
-- paid-up capital:
--
--   TTMPC-297 Nash Siaton    2026-09-08  'Initial Paid-Up Capital'  0 -> 10,000
--                            2026-09-08  'INITIAL_PAID_UP_CAPITAL'  0 -> 10,000
--   TTMPC-298 Romely Teope   same shape
--
-- TWO WRITERS, ONE EVENT -- exactly what §15.6 predicted and §21.3 measured:
--   applicationConfirmation.py:785-833  writes 'Initial Paid-Up Capital'
--   cbu_sync_from_membership_payments   writes 'INITIAL_PAID_UP_CAPITAL'
-- For these two members BOTH fired.
--
-- Neither writer can see the other's row, because they dedupe on DIFFERENT
-- keys: the trigger on source_payment_id, the Python seed on nothing at all
-- (§4 lists it as the one writer with no dedup key).
--
-- WHY IT SHOWS AS A BROKEN LINK
--   The second row starts at 0 rather than continuing from 10,000. That IS a
--   chain break -- but the real defect is that the row exists.
--
-- WHY IT DOES NOT AFFECT THE COOPERATIVE'S BOOKS
--   Both rows carry ending_share_capital = 10,000, and every balance read takes
--   the LATEST row, so the member's balance reads 10,000 -- correct. The
--   duplicate inflates capital_added, not the balance.
--
-- Safe: reads only.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1  --  every member with more than one paid-up capital row
-- -----------------------------------------------------------------------------
-- Catches the same fault for anyone else, not just the two already found.
-- -----------------------------------------------------------------------------
WITH paidup AS (
  SELECT
    cbu.member_id,
    count(*)                                                   AS rows,
    count(DISTINCT cbu.deposit_account)                        AS distinct_labels,
    string_agg(DISTINCT cbu.deposit_account, ' + ')            AS labels,
    sum(cbu.capital_added)                                     AS total_added,
    max(cbu.ending_share_capital)                              AS ending,
    count(*) FILTER (WHERE cbu.source_payment_id IS NOT NULL)  AS with_payment_key
  FROM public.capital_build_up cbu
  WHERE regexp_replace(lower(coalesce(cbu.deposit_account,'')), '[^a-z0-9]+', '_', 'g')
        = 'initial_paid_up_capital'
  GROUP BY cbu.member_id
)
SELECT
  m.membership_id                                    AS member_no,
  btrim(concat_ws(' ', m.first_name, m.last_name))   AS member_name,
  p.rows                                             AS paidup_rows,
  p.labels,
  p.total_added                                      AS capital_added_total,
  p.ending                                           AS balance_shown,
  p.with_payment_key                                 AS rows_with_source_payment_id,
  CASE WHEN p.rows > 1 THEN '*** DUPLICATE ***' ELSE 'ok' END AS verdict
FROM paidup p
JOIN public.member m ON m.id = p.member_id
ORDER BY p.rows DESC, m.membership_id;


-- -----------------------------------------------------------------------------
-- PART 2  --  does it change anyone's BALANCE?
-- -----------------------------------------------------------------------------
-- The balance read takes the latest row, and both duplicates end at the same
-- figure -- so the balance should be right even though the ledger is wrong.
-- This confirms it rather than assuming it.
-- -----------------------------------------------------------------------------
WITH dupes AS (
  SELECT member_id
  FROM public.capital_build_up
  WHERE regexp_replace(lower(coalesce(deposit_account,'')), '[^a-z0-9]+', '_', 'g')
        = 'initial_paid_up_capital'
  GROUP BY member_id
  HAVING count(*) > 1
)
SELECT
  m.membership_id                                              AS member_no,
  btrim(concat_ws(' ', m.first_name, m.last_name))             AS member_name,
  (SELECT cbu.ending_share_capital
     FROM public.capital_build_up cbu
    WHERE cbu.member_id = d.member_id
    ORDER BY cbu.transaction_date DESC,
      NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''),'^CBUD_0*',''),'')::integer DESC NULLS LAST,
      cbu.id DESC
    LIMIT 1)                                                   AS balance_the_system_shows,
  (SELECT sum(cbu.capital_added) FROM public.capital_build_up cbu
    WHERE cbu.member_id = d.member_id)                         AS sum_of_all_movements,
  CASE WHEN (SELECT cbu.ending_share_capital
               FROM public.capital_build_up cbu
              WHERE cbu.member_id = d.member_id
              ORDER BY cbu.transaction_date DESC,
                NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''),'^CBUD_0*',''),'')::integer DESC NULLS LAST,
                cbu.id DESC LIMIT 1)
          < (SELECT sum(cbu.capital_added) FROM public.capital_build_up cbu
              WHERE cbu.member_id = d.member_id)
       THEN 'ledger overstates contributions - balance is still correct'
       ELSE 'consistent' END                                   AS assessment
FROM dupes d
JOIN public.member m ON m.id = d.member_id
ORDER BY m.membership_id;


-- -----------------------------------------------------------------------------
-- PART 3  --  is the cooperative's total affected?
-- -----------------------------------------------------------------------------
-- The migrated 258 are the cooperative's books. These two are app-created and
-- sit outside that set, so the PHP 29,678,787.77 baseline is untouched. Confirm.
-- -----------------------------------------------------------------------------
SELECT
  'duplicated members inside the migrated books'     AS item,
  (SELECT count(*)::text FROM (
     SELECT member_id FROM public.capital_build_up
     WHERE regexp_replace(lower(coalesce(deposit_account,'')), '[^a-z0-9]+','_','g')
           = 'initial_paid_up_capital'
     GROUP BY member_id HAVING count(*) > 1) d
   WHERE EXISTS (SELECT 1 FROM public.capital_build_up c
                  WHERE c.member_id = d.member_id
                    AND c.deposit_account = 'historical_import_2025'))  AS value,
  'must be 0 - otherwise the coop books are affected'              AS expected
UNION ALL SELECT
  'coop share capital (migrated members only)',
  (SELECT to_char(round(sum(l.ending_share_capital),2), 'FM999,999,999.00') FROM (
     SELECT DISTINCT ON (cbu.member_id) cbu.ending_share_capital
     FROM public.capital_build_up cbu
     WHERE cbu.member_id IN (SELECT DISTINCT member_id FROM public.capital_build_up
                              WHERE deposit_account = 'historical_import_2025')
     ORDER BY cbu.member_id, cbu.transaction_date DESC,
       NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id,''),'^CBUD_0*',''),'')::integer DESC NULLS LAST,
       cbu.id DESC) l),
  'baseline 29,678,787.77 + capitalised 928,068.69';
