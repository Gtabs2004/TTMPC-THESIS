# SOA test scenarios — three loan accounts

Test data for checking how REGANT handles current, delinquent and nearly-finished
loans, and what the Statement of Account (SOA) shows for each. Target database:
**LIVE** (`gcnolz…`), by the owner's decision on 2026-10-13. Test date: **2026-10-13**.

## Run order (Supabase SQL Editor)

| File | Writes? | Purpose |
|---|---|---|
| `00_precheck.sql` | no | Map emails → member, list existing loans and triggers. Review before seeding. |
| `01_seed.sql` | **yes** | Creates the three loans. Aborts with nothing written if any account is missing, not active, already has an open loan of that type, or was already seeded. |
| `02_validate.sql` | no | Expected-vs-actual checks (V1–V10). Re-run after each app action. |
| `99_rollback.sql` | **yes** | Removes every `TESTSOA-*` row, including rows the app adds during testing. |

## What gets written on LIVE

Per scenario: 1 `loans` row, N+1 `loan_schedules` rows, N validated `loan_payments`
rows, N `loan_payment_ledger` rows (N = 9 / 6 / 10). Every row is tagged `TESTSOA`.
Existing records are not changed. Side effects:

- `audit_log` gets INSERT rows for the loans and payments. Rollback leaves them in place, because the audit log is append-only.
- **Test loans will show up in LIVE dashboards, Bookkeeper Reports, loan-demand actuals and the credit-risk queue** until you roll them back.
- No receipts are issued at seed time. A payment you record in the app during testing **will use up a real receipt number**. Rollback deletes that receipt, but the number is not reused.
- The CBU sync does not fire (it only fires on a transition *into* `released`).
- No `loan_payments_legacy` rows are written, so the loans are **not** exempt from penalties.

## How the app represents a loan (affects what you will see)

- **One open schedule row per loan.** Row N+1 is created only when a bookkeeper approves a payment that settles row N. Disbursement creates only row 1.
- **Scenario 2's two missed months are therefore one overdue row (#7, due 2026-08-15).** Row #8 never exists, and a missed month does not create arrears (only a short payment does). This is how the system works, not a seeding shortcut.

## Scenario specifications

Formulas come from `build_single_schedule_row` (`src/server/main.py`).

- **Consolidated:** add-on interest. Principal ÷ term, plus principal × 0.83% every month.
- **Emergency:** equal principal, computed in centavos. Interest is 2% of the balance *after* that month's principal, so installment 12 has ₱0 interest.

| | 1 — `TESTSOA-CL-0001` | 2 — `TESTSOA-CL-0002` | 3 — `TESTSOA-EL-0003` |
|---|---|---|---|
| Account | lynxridao@gmail.com | erdenjhed.teope@wvsu.edu.ph | serevee7@gmail.com |
| Type / term / rate | Consolidated / 24 / 0.83% add-on | Consolidated / 24 / 0.83% add-on | Emergency / 12 / 2% diminishing |
| Principal | ₱300,000.00 | ₱200,000.00 | ₱20,000.00 |
| Installment | ₱14,990.00 (12,500 + 2,490) | ₱9,993.33 (8,333.33 + 1,660) | varies (table below) |
| Total interest | ₱59,760.00 | ₱39,840.00 | ₱2,200.00 |
| Disbursed | 2025-12-15 | 2026-01-15 | 2025-11-15 |
| Due dates | 15th, from 2026-01-15 | 15th, from 2026-02-15 | 15th, from 2025-12-15 |
| Payments (13th of each month, on time) | #1–#9 = ₱134,910.00 | #1–#6 = ₱59,959.98 | #1–#10 = ₱18,833.27 |
| Open row | #10, due 2026-10-15 | #7, due 2026-08-15 (**59 days overdue**) | #11, due 2026-10-15 |
| Remaining principal | ₱187,500.00 | ₱150,000.02 | ₱3,333.40 |
| Remaining interest | ₱37,350.00 | ₱29,880.00 | ₱33.33 |
| Remaining total payable | ₱224,850.00 | ₱179,880.02 | ₱3,366.73 |
| Overdue | — | #7 + #8 = ₱19,986.66 (the app can show only #7) | — |
| Penalty today | ₱0 | ₱0 (still inside the 3-month grace) | ₱0 |
| Loan status | partially paid | partially paid | partially paid |

Scenario 3 schedule:

| # | Principal | Interest | Installment | Balance after |
|---|---|---|---|---|
| 1 | 1,666.66 | 366.67 | 2,033.33 | 18,333.34 |
| 2 | 1,666.66 | 333.33 | 1,999.99 | 16,666.68 |
| 3 | 1,666.66 | 300.00 | 1,966.66 | 15,000.02 |
| 4 | 1,666.66 | 266.67 | 1,933.33 | 13,333.36 |
| 5 | 1,666.66 | 233.33 | 1,899.99 | 11,666.70 |
| 6 | 1,666.66 | 200.00 | 1,866.66 | 10,000.04 |
| 7 | 1,666.66 | 166.67 | 1,833.33 | 8,333.38 |
| 8 | 1,666.66 | 133.33 | 1,799.99 | 6,666.72 |
| 9 | 1,666.66 | 100.00 | 1,766.66 | 5,000.06 |
| 10 | 1,666.66 | 66.67 | 1,733.33 | 3,333.40 |
| **11** (open) | 1,666.66 | 33.33 | 1,699.99 | 1,666.74 |
| **12** | 1,666.74 | 0.00 | 1,666.74 | 0.00 |

Scenario 2: 24 × 9,993.33 = 239,839.92, which is ₱0.08 short of the ₱239,840 total payable. The app has no final-installment adjustment for Consolidated loans, so expect an 8-centavo leftover at the end.

## Scenario 2 penalty timeline (rule in code: `accrue_loan_penalties`)

| Date | Expected state |
|---|---|
| 2026-08-15 | #7 due and not paid |
| after 2026-09-15 | Cashier list shows the "delayed" warning (1 month past the oldest unpaid due date) |
| 2026-10-13 (test date) | Third delinquency month. **No penalty yet** |
| 2026-11-15 | Grace ends (oldest unpaid due date + 3 months). Still ₱0 on this day |
| from 2026-11-16 | First charge for period 2026-11-15. **₱3,597.60** = 2% × ₱179,880.02 (code's base: remaining total payable). Under the printed policy's base (remaining principal) it would be **₱3,000.00**, which is unresolved |
| each later month | One more charge per month (period 2026-12-15, …) |

The charge is **written to the database only when a cashier submits a payment** on this loan. Until then the cashier screen shows a calculated figure that is not saved, and the member SOA shows nothing.

To test the penalty before 2026-11-16, move every Scenario 2 date back 3 months (disbursal 2025-10-15, first due 2025-11-15) before seeding.

## Expected-vs-actual SOA checklist

Mark each row Pass / Fail. "Known defect" means the app is expected to fail this today (see the audit below).

| Check | 1 | 2 | 3 |
|---|---|---|---|
| Original amount shown | ₱300,000 | ₱200,000 | ₱20,000 |
| Payment history rows | 9 | 6 | 10 |
| Each row: date, reference, amount | 13th of each month, `TESTSOA-1-01`…, 14,990 | …, 9,993.33 | …, as per table |
| Missed installments listed individually | n/a | **Known defect**: neither appears in the member SOA, and the bookkeeper sees only #7 | n/a |
| Remaining / future schedule shown | **Known defect**: not shown in the member SOA | same | same |
| Outstanding balance (member SOA) | expect ₱224,850. **Known defect**: shows 165,090 | expect ₱179,880.02. Shows 140,040.02 | expect ₱3,366.73. Shows 1,166.73 |
| Outstanding balance (bookkeeper ledger) | ₱224,850.00 | ₱179,880.02 | ₱3,366.73 |
| Penalty today | 0 | 0 | 0 |
| Penalty after 2026-11-16 and a cashier submission | 0 | one row, ₱3,597.60 (or ₱3,000, depending on policy) | 0 |
| Refreshing the SOA or cashier screen 5× creates no extra penalty rows (V7) | — | 0 duplicates | — |
| Penalty total after two payments while a penalty is outstanding | — | **Known defect**: the member SOA adds up each payment's `penalties` snapshot, so it counts the penalty twice | — |
| Renewal button available (6-payment rule) | yes | yes (no delinquency gate; confirm whether that is intended) | yes |
| Restructure: bookkeeper can lengthen or shorten the term | test 12, 36, 48 | test | test |
| Restructure: base used | **Known defect**: recalculated on the original ₱300,000, not ₱187,500 remaining. Only `loans.term` and `monthly_amortization` change; open row #10 keeps 14,990 | | |
| Nothing renews or restructures automatically on reaching month 10 | yes | — | — |
| Early settlement / advance payment | no dedicated flow. An overpayment becomes `applied_to_credit` on the next row | | test paying 3,366.73 on #11 |

## Audit summary (Phase 2 findings, with code locations)

| Area | Verdict | Where |
|---|---|---|
| Missed installments as individual records | Missing | single-open-row design, `approve_bookkeeper_payment` (`main.py` ~12329) |
| Overdue status | Partial: calculated on the fly, never saved | cashier loan list (`main.py` ~2200) |
| Penalty calculation | Partial: base differs from policy | `accrue_loan_penalties` (`main.py` ~1234) |
| Penalty saved to the database | Partial: only when a cashier submits a payment | `_server_side_penalty_for_loan` (`main.py` ~5392) |
| Duplicate penalty prevention | Working by design (unique `loan_id, period_due_date`) | `loan_penalties_schema.sql` |
| Penalty in member SOA | Defective: totals snapshots; `accumulated_penalty` unused | `Member_StatementOfAccount.jsx` ~285 |
| SOA outstanding / interest columns | Defective | `member_statement_of_account_view_v2.sql` |
| Member vs bookkeeper balance | Inconsistent | view vs `/api/bookkeeper/loan-ledger` |
| Restructure | Partial: original-principal base, schedule untouched, direct PATCH skips Manager, review endpoints have no login check | `main.py` ~8205–8380 |
| Renewal eligibility | Counts payments of any status; no delinquency gate | `get_loan_eligibility` (`bonus_window_override.sql`) |

## Open policy questions

1. Penalty base: remaining **principal** (printed policy) or remaining **total payable** (code)?
2. Restructure base: remaining principal, or original principal (code)?
3. Should a delinquent member be blocked from renewing?
