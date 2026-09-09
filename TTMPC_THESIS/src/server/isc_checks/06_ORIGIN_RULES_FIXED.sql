-- =============================================================================
-- ISC CHECK 6  --  origin coverage, with the CORRECT rules
-- =============================================================================
-- Replaces check C in 01_RUN_THIS_FIRST.sql, which was wrong.
--
-- WHAT CHECK C GOT WRONG
--   It treated "cbu_deposit_id IS NOT NULL" as meaning "a cashier receipt".
--   It does not. A trigger (set_cbu_deposit_id) stamps a CBUD_nnn number on
--   EVERY row on insert -- import rows, loan retentions, ISC postings, all of
--   them. Confirmed 2026-09-09: all 816 rows carry one.
--   So that column identifies NOTHING, and loan rows appeared to have two
--   origins (deposit id + loan id), which is why C failed 774 of 775 rows.
--
-- THE ACTUAL CLASSIFIER IS deposit_account.
--   Measured 2026-09-09:
--     historical_import_2025             258 rows  PHP 29,638,787.77  OPENING
--     Cash                                17 rows  PHP    422,000.00  CRJ
--     LOAN_CBU_RETENTION                   7 rows  PHP     41,800.00  CDJ
--     INITIAL_PAID_UP_CAPITAL              5 rows  PHP    140,000.00  OPENING
--     Initial Paid-Up Capital              3 rows  PHP     30,000.00  OPENING
--     INTEREST_ON_SHARE_CAPITAL          263 rows  PHP  1,496,104.42  excluded
--     INTEREST_ON_SHARE_CAPITAL_REVERSAL 263 rows  PHP -1,496,104.42  excluded
--
--   NOTE THE DUPLICATE: 'INITIAL_PAID_UP_CAPITAL' (trigger, 5 rows) and
--   'Initial Paid-Up Capital' (applicationConfirmation.py, 3 rows) are the SAME
--   EVENT written by two different writers -- exactly what §15.6 warned about.
--   Any rule must match BOTH spellings or 3 members' opening balances get
--   misfiled. Matching is done case-insensitively on a normalised string below.
--
--   ALSO: source_payment_id is NULL on all 8 membership rows, so §15.6's plan
--   to identify openings by that key does not work. Use the label.
--
-- Safe: reads only, changes nothing.
-- =============================================================================

WITH classified AS (
  SELECT
    cbu.member_id,
    cbu.capital_added,
    cbu.deposit_account,
    CASE
      -- ISC's own rows: excluded from the basis (§0 bug 2). Identified by the
      -- FK, not the label, because the FK is what isc_post actually sets.
      WHEN cbu.source_isc_id IS NOT NULL                     THEN 'isc'
      -- Opening balances: the migration, plus new members' paid-up capital in
      -- either spelling (§15.6, §18.2).
      WHEN cbu.deposit_account = 'historical_import_2025'    THEN 'opening'
      -- Normalise BOTH separators. 'Initial Paid-Up Capital' contains a HYPHEN
      -- as well as spaces; replacing only spaces yields 'initial_paid-up_capital',
      -- which does not match, and the row silently falls through to CRJ.
      -- Measured 2026-09-09: that mistake misfiled 3 rows / PHP 30,000.
      WHEN regexp_replace(lower(coalesce(cbu.deposit_account,'')), '[^a-z0-9]+', '_', 'g')
             = 'initial_paid_up_capital'                     THEN 'opening'
      -- CDJ: share capital retained out of a loan disbursement (2% of
      -- principal). Identified by the FK, which is reliable here.
      WHEN cbu.source_loan_id IS NOT NULL                    THEN 'cdj'
      WHEN cbu.deposit_account = 'LOAN_CBU_RETENTION'        THEN 'cdj'
      -- CRJ: everything the cashier took in. 'Cash' today; GCash and other
      -- tender types use their own labels, so this is the catch-all rather
      -- than a fixed list.
      ELSE 'crj'
    END AS origin
  FROM public.capital_build_up cbu
)
SELECT
  origin,
  count(*)                                                  AS rows,
  count(DISTINCT member_id)                                 AS members,
  to_char(round(sum(capital_added), 2), 'FM999,999,999.00') AS total_added,
  string_agg(DISTINCT coalesce(deposit_account, '(none)'), ', ') AS labels_included
FROM classified
GROUP BY origin
ORDER BY
  CASE origin WHEN 'opening' THEN 1 WHEN 'crj' THEN 2
              WHEN 'cdj' THEN 3 ELSE 4 END;


-- -----------------------------------------------------------------------------
-- GUARD: which labels are falling into the CRJ catch-all?
-- -----------------------------------------------------------------------------
-- CRJ is a catch-all, so a mislabelled or misspelled row lands there SILENTLY
-- and still totals correctly -- which is exactly how the hyphen bug above hid.
-- This lists every label reaching CRJ. Anything here that is not a genuine
-- cashier tender type (Cash, GCash, ...) is a misclassification.
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
  AND cbu.deposit_account IS DISTINCT FROM 'historical_import_2025'
  AND cbu.deposit_account IS DISTINCT FROM 'LOAN_CBU_RETENTION'
  AND regexp_replace(lower(coalesce(cbu.deposit_account,'')), '[^a-z0-9]+', '_', 'g')
        <> 'initial_paid_up_capital'
GROUP BY deposit_account
ORDER BY rows DESC;
