# Savings Interest — v2 Plan (confirmed cooperative rule, 2026-10-17)

**Status: Draft engine built and unit-tested. Not wired into `main.py`, Supabase, or any live UI yet.**

## Relationship to the earlier plan

[`SAVINGS_INTEREST_PLAN.md`](SAVINGS_INTEREST_PLAN.md) (2026-10-13) was shelved because the cooperative's real rate/basis/posting-frequency was unconfirmed, and its draft code assumed **monthly** interest on the **month-end balance**.

The user has now confirmed the real rule is different in three ways:

| | v1 (shelved draft) | v2 (confirmed, this plan) |
|---|---|---|
| Rate | Placeholder 1% p.a. | **1.00% p.a.** (confirmed) |
| Day-count | Implicit 1/12 of annual rate | **Actual/365** |
| Posting frequency | Monthly | **Quarterly** (Mar 31 / Jun 30 / Sep 30 / Dec 31) |
| Interest basis | Month-end balance snapshot | **Running balance after every transaction**, accrued per day-interval between consecutive ledger lines |
| Minimum balance | From `deposit_interest_policies.minimum_balance` | Same column, same semantics — kept |

This is a different calculation engine, not a parameter tweak, so it's built fresh (`savings_interest_v2/`) rather than patching v1's Appendix A/B. v1's schema (`deposit_interest_policies`) already supports this: `crediting_frequency` already has a `'quarterly'` option (see `deposit_interest_policies_schema.sql:36`), it was simply never set to it.

## 1. Formula (confirmed)

For each ledger line (deposit, withdrawal, or quarterly interest post), in date order:

```
elapsed_days   = (this_line_date - previous_line_date).days
line_interest  = elapsed_days × resulting_balance_of_this_line × (annual_rate / 365)
```

- `resulting_balance_of_this_line` — the balance **after** this line's deposit/withdrawal is applied (confirmed against the spec's worked example: the Jan-25 deposit's line interest is computed on 10,000, the post-deposit balance, not the 5,000 pre-deposit balance).
- `annual_rate` = 0.01 (1%), from `deposit_interest_policies.product_code = 'SAVINGS'`.
- Day-count: Actual/365, always divide by 365 regardless of leap year.
- Rounding: half-up to the centavo (`ROUND_HALF_UP`, `Decimal`), on every posted figure. Never float/IEEE-754.
- **Eligibility / minimum balance:** if `resulting_balance_of_this_line < minimum_balance` (when a minimum is configured), that interval accrues **zero** interest. Same `minimum_balance` field and semantics as v1 — unchanged.
- **Quarter-end posting:** at Mar 31 / Jun 30 / Sep 30 / Dec 31, the sum of all line interest accrued since the last posting is capitalized as one credit (`Int.`), increasing the balance. Interest between quarter-ends is accrued/displayed but not yet capitalized (doesn't compound until posted — matches the spec's worked example).

### Verified against the reference dataset

All 9 reference transactions (`§ Reference Dataset` of the original prompt) were implemented and unit-tested. The **posted interest** and **resulting total balance** columns — the figures that actually get booked to the ledger — match the spec exactly on every row. Three of the spec's printed **intra-quarter line-interest breakdown** numbers (Mar 31, Jun 30, Sep 30 rows) contain small rounding typos (off by 0.03-0.06) that don't propagate into the posted totals; the engine computes the mathematically correct value for those display cells and documents the discrepancy in `test_ledger_engine.py`. If the panel/coop wants the engine to byte-for-byte match the spec's printed (slightly wrong) line values instead, that's a one-line change to round per-sub-interval rather than carry unrounded precision — flag if that's actually wanted.

## 2. What's built in this session

```
TTMPC_THESIS/src/server/savings_interest_v2/
├── ledger_engine.py        # SavingsLedgerEngine, Transaction, LedgerRow, render_passbook()
└── test_ledger_engine.py   # 10 tests, all passing, incl. exact reference-row agreement
```

- `SavingsLedgerEngine` — sequential processor: `post_transaction()`, `post_quarter_close()`, or `run(transactions, quarter_closes)` to interleave both in date order.
- Fixed-point `Decimal` throughout; no floats.
- Null/edge-case guarded: rejects back-dated transactions, over-withdrawals, non-quarter-end close dates, non-CD/WD codes, non-positive amounts; `render_passbook()` skips a stray `None` row instead of raising (spreadsheet-`#NUM!`-style defensive guard per the spec's "Null Safety" requirement).
- `render_passbook(rows)` — table-rendering function producing the member passbook columns (Date, Transaction Code, Withdrawals, Interest, Deposits, Total Balance, Accrued Line Interest), each monetary field formatted to 2 decimals as a string.

## 3. Wiring plan (not yet done — next steps when ready to go live)

### 3a. BOD Interest Policies
- `deposit_interest_policies` row `SAVINGS`: set `annual_rate = 1.0000`, `crediting_frequency = 'quarterly'` (column already supports this value; no schema change needed — just a data update + exposing the "quarterly" choice in the BOD UI if the picker is currently hiding it).
- Check `DepositInterestPanel.jsx` (`src/BOD/Components/`) and `Loan-Policies.jsx` — confirm the frequency selector actually offers "quarterly" and that copy/help text describes Actual/365 running-balance accrual, not a flat monthly % of month-end balance, so BOD members aren't misled about what the rate means.

### 3b. Backend ledger engine integration
- New Postgres schema `savings_interest_v2_schema.sql`, modeled on v1's Appendix A (`savings_interest_batches` / `savings_interest_lines`) but:
  - `period_month` → `period_quarter` (date, must be a quarter-end: Mar 31/Jun 30/Sep 30/Dec 31).
  - Compute function walks `savings_ledger` lines in order (not just a month-end snapshot) replicating `ledger_engine.py`'s math in plpgsql, OR keep the authoritative calculation in Python (FastAPI) and have Postgres only store results — recommend the latter since `Decimal`/`ROUND_HALF_UP` is simpler to get right in Python than numeric SQL, and this engine is now tested there.
- FastAPI endpoints mirroring v1's Appendix B (`/api/savings-interest/preview`, `/post`, `/batches`, `/batches/{id}/reverse`), but `period` becomes a quarter, and preview computation calls into `savings_interest_v2/ledger_engine.py` fed by `savings_ledger` rows per account instead of a single `SUM(credits-debits)`.
- Keep v1's segregation-of-duties decisions (Bookkeeper posts, Manager reverses, never their own posting) — these aren't rate-rule-dependent and don't need to change.

### 3c. Savings module (member + staff passbook views)
- `Member_Savings.jsx` / `Member_StatementOfAccount.jsx`: the passbook table should show the `render_passbook()` columns (Date / Code / Withdrawals / Interest / Deposits / Total Balance), with "Int." rows visually distinct (e.g. highlighted row) from CD/WD rows, consistent with how `savings_ledger.source = 'savings_interest'` is already distinguishable.
- `Savings-Transactions.jsx` (Bookkeeper) / `Savings_Details.jsx` (Cashier): same column set for staff-side ledger views, so all portals agree on what a passbook line looks like.
- Add a quarter-progress / "next interest posting" indicator reusing the eligibility logic (balance ≥ minimum) so members understand why they may see ₱0.00 accrued for a given interval.

## 4. Open items before going live

1. Confirm whether intra-quarter "Accrued Line Interest" should be **visible to members** between postings (informational, not yet booked) or only shown after quarter-close. The spec's passbook table implies it's shown live.
2. Confirm statutory reserve / withholding deductions (spec mentions "optional cooperative statutory deductions" as configurable) — no such deduction exists in `deposit_interest_policies` today; if required, needs a new column and a deduction step between accrual and posting.
3. Decide whether a posted quarterly interest credit is capitalized only (increases share/savings balance) or can ever be paid in cash — this mirrors the ISC distinction (`ISC_DIVIDEND_PLAN.md` §14) and the panel may ask about it directly; this plan assumes capitalization-only (interest credited straight into the savings balance), consistent with the spec's worked example.
4. Run the v1 test matrix (§6 of `SAVINGS_INTEREST_PLAN.md`: concurrency, duplicate-posting guard, reversal-after-withdrawal) against the new quarterly schema once 3b is built.
