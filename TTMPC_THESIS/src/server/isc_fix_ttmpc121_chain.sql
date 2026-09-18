-- =============================================================================
-- CBU CHAIN REPAIR (2026-09-18) — TTMPC-121, MA. DULZURA C TABAGO
-- =============================================================================
-- ** THIS FILE MODIFIES DATA. ** Every other isc_fix_*.sql only replaces
-- functions. Read the whole header before running it.
--
-- Two rows change. The member's final share capital is UNCHANGED at
-- 670,596.49 — only the month in which PHP 500 is recognised moves.
--
-- -----------------------------------------------------------------------------
-- HOW IT BROKE
-- -----------------------------------------------------------------------------
-- Found by isc_checks/27_ASSERT_CHAIN.sql TEST 1 on 2026-09-18, the day the
-- assertion was first built. It was the only genuine break on the table: a
-- full sweep for `starting_share_capital <> previous ending_share_capital`
-- returned this row plus three dummy accounts (TTMPC-297/298/299, a different
-- and unrelated cause — the duplicate paid-up-capital writer of §15.6/§21).
--
-- Her chain as found:
--
--   2025-12-31  CBUD_1860  yearly  +  7,300.00   650,096.49  <- true carry-in
--   2026-09-17  CBUD_2747  Cash    + 20,000.00   start 650,596.49  end 670,596.49
--   2026-12-31  CBUD_1861  yearly  +    500.00   start 650,096.49  end 650,596.49
--
-- The 2026-09-17 cashier deposit took its starting balance from the row dated
-- 2026-12-31 — a row IN THE FUTURE. The yearly-history import writes a year-END
-- snapshot per member per year, so the current year's sits in the future until
-- 31 December. Sorted purely by transaction_date it outranked the real
-- 2025-12-31 row, and the deposit absorbed the placeholder's PHP 500 into its
-- own starting balance.
--
-- The PHP 500 IS REAL. Confirmed against the cooperative's share-capital sheet
-- (2026-09-18): the source column is a payroll-deduction ledger of regular
-- PHP 500 contributions with occasional larger entries. It is her 2026
-- contribution, correctly imported. What is wrong is only that the September
-- deposit recognised it three months early.
--
-- -----------------------------------------------------------------------------
-- WHY NO CODE CHANGE IS NEEDED
-- -----------------------------------------------------------------------------
-- All three writers that touch this chain are ALREADY guarded against exactly
-- this. The deposit predates the guard on its path; it is the last casualty,
-- not a new one:
--
--   * cashier CRJ deposit endpoint   main.py:3321  (fix dated 2026-09-17 —
--                                     the same day as this deposit)
--   * loan disbursement trigger      cbu_disbursement_trigger_fix_future_date.sql:103
--   * ISC balance walk               isc_fix_future_dated_balance.sql (2026-09-18)
--
-- A full-table sweep after all three landed found no other affected real
-- member. This file repairs the one row that slipped through before the guards
-- existed. It does not need to be generalised.
--
-- -----------------------------------------------------------------------------
-- WHY IT MATTERS EVEN THOUGH HER TOTAL IS CORRECT
-- -----------------------------------------------------------------------------
-- 670,596.49 is right either way — the PHP 500 she absorbed in September is the
-- same PHP 500 December was going to add. The damage is to the BASIS, not the
-- balance. Rule 2 (§12.2) averages the twelve MONTH-END balances, so carrying
-- an extra PHP 500 from September to November inflates her average, and rule 4
-- sums those averages into the denominator that derives everyone's rate (rule
-- 5). One member's early PHP 500 shifts the whole cooperative's split while
-- rule 7 still reconciles to the pool exactly.
--
-- This is the "books balance perfectly and the split is wrong" failure the
-- assertion exists to catch. No ISC posting has been made on this data, so
-- nothing incorrect has reached any member.
--
-- -----------------------------------------------------------------------------
-- THE REPAIR — rebase, do not drop
-- -----------------------------------------------------------------------------
--                        BEFORE                     AFTER
--   CBUD_2747  starting  650,596.49                 650,096.49
--              ending    670,596.49                 670,096.49
--   CBUD_1861  starting  650,096.49                 670,096.49
--              ending    650,596.49                 670,596.49
--
--   capital_added is NOT touched on either row (20,000.00 and 500.00 stand —
--   both are real and correctly recorded). Only the running-balance columns
--   move, so the PHP 500 lands in December where the source data puts it.
--
-- Dropping the PHP 500 instead was considered and REJECTED: the contribution is
-- evidenced in the cooperative's own sheet, and reducing a member's recorded
-- share capital on an inference is the worse of the two errors.
--
-- -----------------------------------------------------------------------------
-- SAFETY
-- -----------------------------------------------------------------------------
--   * Scoped to two literal cbu_deposit_id values. It cannot touch another row.
--   * GUARDED: each UPDATE matches the BEFORE values as well as the id, so a
--     second run changes nothing (0 rows) rather than shifting the chain again.
--     This is what makes it safe to re-run — do not remove those predicates.
--   * VERIFIED: the transaction re-reads both rows and RAISES (rolling
--     everything back) unless the chain lands exactly as tabulated above.
--     Nothing is committed on a partial or unexpected result.
--   * capital_build_up carries audit triggers (audit_log_schema.sql), so both
--     updates are recorded with actor and timestamp.
--
-- TO VERIFY AFTERWARDS: re-run isc_checks/27_ASSERT_CHAIN.sql TEST 1.
-- TTMPC-121 must be gone. The remaining rows are the mid-year joiners whose
-- INITIAL_PAID_UP_CAPITAL opening sits inside the period — benign by §15.6,
-- and named as such in the benign_cause_if_any column.
-- =============================================================================

BEGIN;

-- 1. The September cashier deposit — rebase onto the true 2025 carry-in.
UPDATE public.capital_build_up
SET starting_share_capital = 650096.49,
    ending_share_capital   = 670096.49
WHERE cbu_deposit_id       = 'CBUD_2747'
  AND starting_share_capital = 650596.49   -- guard: only the broken state
  AND ending_share_capital   = 670596.49;

-- 2. The December import row — now stacks on top of the deposit.
UPDATE public.capital_build_up
SET starting_share_capital = 670096.49,
    ending_share_capital   = 670596.49
WHERE cbu_deposit_id       = 'CBUD_1861'
  AND starting_share_capital = 650096.49   -- guard: only the broken state
  AND ending_share_capital   = 650596.49;

-- 3. Verify, or roll the whole thing back.
DO $$
DECLARE
  v_sep_start numeric;
  v_sep_end   numeric;
  v_dec_start numeric;
  v_dec_end   numeric;
BEGIN
  SELECT starting_share_capital, ending_share_capital
    INTO v_sep_start, v_sep_end
  FROM public.capital_build_up WHERE cbu_deposit_id = 'CBUD_2747';

  SELECT starting_share_capital, ending_share_capital
    INTO v_dec_start, v_dec_end
  FROM public.capital_build_up WHERE cbu_deposit_id = 'CBUD_1861';

  IF v_sep_start IS NULL OR v_dec_start IS NULL THEN
    RAISE EXCEPTION
      'One of the target rows does not exist (CBUD_2747 / CBUD_1861). Nothing was changed.';
  END IF;

  IF v_sep_start <> 650096.49 OR v_sep_end <> 670096.49
     OR v_dec_start <> 670096.49 OR v_dec_end <> 670596.49 THEN
    RAISE EXCEPTION
      'Chain did not land as expected - rolled back. Sep % -> %, Dec % -> % (wanted 650096.49 -> 670096.49, 670096.49 -> 670596.49). If the rows were already repaired, the guards correctly matched nothing and this is the expected refusal on a re-run.',
      v_sep_start, v_sep_end, v_dec_start, v_dec_end;
  END IF;

  RAISE NOTICE 'TTMPC-121 chain repaired: Sep 650096.49 -> 670096.49, Dec 670096.49 -> 670596.49. Final balance 670596.49 (unchanged).';
END $$;

COMMIT;


-- =============================================================================
-- VERIFY — her full chain, in ledger order. Every starting_share_capital must
-- equal the row above's ending_share_capital.
-- =============================================================================
SELECT
  cbu.transaction_date::date,
  cbu.cbu_deposit_id,
  cbu.deposit_account,
  cbu.capital_added,
  cbu.starting_share_capital,
  cbu.ending_share_capital,
  CASE
    WHEN lag(cbu.ending_share_capital) OVER w IS NULL THEN 'first row'
    WHEN cbu.starting_share_capital = lag(cbu.ending_share_capital) OVER w THEN 'ok'
    ELSE '*** BREAK ***'
  END AS chain_check
FROM public.capital_build_up cbu
JOIN public.member m ON m.id = cbu.member_id
WHERE m.membership_id::text = 'TTMPC-121'
WINDOW w AS (
  ORDER BY
    cbu.transaction_date,
    NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer NULLS LAST
)
ORDER BY
  cbu.transaction_date,
  NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer NULLS LAST;
