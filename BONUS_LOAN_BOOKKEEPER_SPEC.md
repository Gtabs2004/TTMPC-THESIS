# Bonus Loan — Bookkeeper Workflow Specification

Scope: this document describes the Bonus Loan feature **as it concerns the Bookkeeper role only**. It is a Bookkeeper-focused slice of the full design in `BONUS_LOAN_PLAN.md` (the canonical source for rates, penalty math, non-member storage, etc.) — read that file for anything not repeated here. This doc exists because a request asked for a Bookkeeper-specific spec; it does not introduce new rules.

Status: the behavior described below is **already built** (2026-10-14/15). This is documentation of current state, not a new feature plan.

---

## 1. Where the Bookkeeper touches a Bonus Loan

| Stage | Bookkeeper action | File |
|---|---|---|
| Queue | Sees pending Bonus Loan applications (member and non-member) alongside other loan types | `src/Bookkeeper/Components/Loan-Approval.jsx` |
| Detail / verification | Verifies the borrower's bonus amount from a payslip, types it in, saves it | `src/Manager/Components/LoanApprovalDetails.jsx` (shared by Bookkeeper/Manager/BOD) |
| Recommend | Recommends the loan forward to the Manager — gated by verification | same file |
| Payment approval | Approves Cashier-recorded payments (payoff or partial) against the Bonus loan's single installment | `main.py` → `approve_bookkeeper_payment` |

The Bookkeeper does not set the interest rate, penalty rate, or term — those are computed server-side (`/api/loans/compute`, `disburse_cashier_loan`). The Bookkeeper's only data entry for Bonus is the **verified bonus amount**.

## 2. Bonus amount verification (the Bookkeeper's core Bonus-specific task)

- **No file or photo is stored.** The Bookkeeper physically checks the borrower's payslip and types the verified peso amount into a text field. This mirrors the existing collateral-appraisal pattern (no photo stored there either) — confirmed with the user; a `bonus_proof_reference` field was deliberately dropped from the design as unnecessary.
- **Fields written** (`loans` table, migration `bonus_verified_amount_schema.sql`):
  - `verified_bonus_amount` (numeric)
  - `bonus_verified_by` (uuid, FK to `auth.users` — stamped with the logged-in Bookkeeper's id)
  - `bonus_verified_at` (timestamptz)
- **UI:** "Bonus Amount Verification" panel in `LoanApprovalDetails.jsx` (~line 2592) — one text input + Save button. Editable only by the Bookkeeper; read-only for Manager/BOD viewers of the same page.
- **Save path:** `saveVerifiedBonusAmount()` (~line 244) writes directly to Supabase, no FastAPI round-trip.
- **Applies to non-member Bonus too** — since Step 8 moved non-member Bonus into the `loans` table with real columns, the same verification gate fires for `member_id IS NULL` rows as well (`isNonMemberSource` is only used to skip other member-only checks, not this one).

## 3. Recommend gate (hard enforcement)

Before the Bookkeeper can click **Recommend** on a Bonus loan (`~line 1303` onward in `LoanApprovalDetails.jsx`):

1. `isBonusLoan` is detected from `loanDetails.summary.loanType` containing "bonus" (case-insensitive).
2. If `verifiedBonusAmountSaved` is `null`/`undefined` → **blocked**: "bonus amount must be verified first."
3. If the requested `loan_amount` exceeds `verifiedBonusAmountSaved` → **blocked**: shows both figures in the error.
4. The check reads the **DB-saved** value (`verifiedBonusAmountSaved`, loaded from `data.verified_bonus_amount` on page load/refresh — line ~687), not whatever is currently typed into the input box. A typed-but-unsaved edit cannot slip a bad amount past the gate.

This replaces the MIGS CBU×3/5 cap that every other loan type uses — Bonus is capped by the member's actual bonus/salary, not their CBU, per management decision (Q8 in `BONUS_LOAN_PLAN.md` §2).

## 4. What the Bookkeeper does NOT do for Bonus

- No eligibility/category gate to check — "anyone can avail of a Bonus Loan" (Q7, resolved 2026-10-14); DepEd-employment is not validated anywhere.
- No separate "renewal" decision — there is no mid-cycle renewal row for Bonus. If a member already has an unpaid Bonus loan, the system blocks a new application outright (`can_apply_new: false` from `get_loan_eligibility`); the Bookkeeper never sees a renewal choice to make.
- No manual penalty entry — penalty (1%/month of original principal, no grace period) is computed server-side on each payment via `compute_loan_penalty` / `_server_side_penalty_for_loan`.

## 5. Payment approval (same endpoint as other loan types, Bonus-aware)

`approve_bookkeeper_payment` (`main.py`) handles Bonus the same way as any other loan's payment approval, with two Bonus-specific branches already built:

- **No "next installment" is created** once the single Bonus installment is paid in full — guarded by `is_single_installment_loan = normalized_loan_type == "bonus"`. The loan goes straight to `fully paid`.
- **Partial/early payment** is allowed and reduces the remaining balance; this lowers future interest accrual (Q19) since Bonus interest accrues on the outstanding balance, not a fixed schedule.
- The Bookkeeper's approval screen still shows the normal allocation order (penalty → arrears → current installment → credit) — unchanged for Bonus.

## 6. Known gaps that affect the Bookkeeper's view (not fixed, by design)

- **Risk-assessment button** (Manager's optional feature, visible from the same shared detail page) may error for a non-member Bonus loan — `/api/risk/predict`'s skip-check only recognizes the old `non_member_loans` table name, not `member_id IS NULL` rows in `loans`. Flagged, not fixed — belongs to the analytics subsystem (explicit user instruction, 2026-10-15).
- **MIGS "Loan Availed" scoring** (a different Bookkeeper-facing screen, `Bookkeeper/Components/MIGS.jsx`) has a known-unfixed maturity-window calculation for Bonus loans (`main.py` ~lines 10898, 11481) — the double-counting bug there was fixed, but the maturity-window date math assumes `term_months` counts from application date, which is no longer true for Bonus post-redesign. Left as a flagged TODO per explicit user instruction — do not fix without a dedicated review.
- **Financial/audit report display** (`main.py` ~4062/4119/4180) does not yet show `applicant_full_name` fallback for non-member Bonus rows — cosmetic only, does not block any Bookkeeper workflow.

## 7. Not yet built

- Step 7 of `BONUS_LOAN_PLAN.md` — Cashier payment-screen copy cleanup ("monthly renewal" language removal) — does not affect the Bookkeeper directly but is still outstanding.
- Step 9 — formal end-to-end tests of the Bonus flow, including the Bookkeeper verification/recommend gate, have not been run on the TEST mirror yet.
