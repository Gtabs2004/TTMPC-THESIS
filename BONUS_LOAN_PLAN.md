# Bonus Loan Module — Analysis & Plan

> **SUPERSEDED 2026-10-18.** The Bookkeeper (real person, asked directly) confirmed the **Saka upfront-interest-deduction model** is the correct Bonus Loan logic, overriding the lump-sum model described below (which came from management's 2026-10-14 Q&A). Under Saka: interest for the whole term is deducted from proceeds **at release** (net proceeds = principal − upfront interest − fees); the borrower owes only the **principal** at the bonus month, since interest was already collected upfront. This is now live — see the "2026-10-18 Saka implementation" note at the bottom of this file and `BONUS_LOAN_BOOKKEEPER_SPEC.md`. Everything below this point describes the **old, now-replaced** lump-sum design — kept for history, not current behavior.

Status: **D1–D13 resolved 2026-10-14 via management Q&A (21-question sheet, handwritten answers) + Messenger clarification from Mimzy. Steps 1–6 + Step 8 of §4 BUILT 2026-10-14/15.** 4 SQL migrations already applied to LIVE 2026-10-14 (no errors): `rename_koica_loans_to_non_member_loans.sql`, `bonus_verified_amount_schema.sql`, `get_loan_eligibility_rpc.sql`, `bonus_loan_window_trigger.sql`. **One more migration still needs to be run: `bonus_nonmember_in_loans_schema.sql`** (Step 8, adds `applicant_full_name`/`applicant_credentials` to `loans`). Also found and fixed a real window-constant bug on 2026-10-15 (a fifth hardcoded copy in `Member_ApplyLoans.jsx` was missed in the first pass). **Step 7 not started** (Cashier UI copy — minor). **Step 9 (formal tests) not started** — recommend testing the full flow end-to-end, including non-member intake, before relying on this in production.

Source policy (TTMPC Bonus Loan sheet):
- Applicant must be in active DepEd service, and a member in good standing.
- 2% monthly interest for regular members, 3% for non-coop members. Service fee ₱100.00.
- Amount equals the bonus the borrower will receive (Mid-Year or Year-End).
- Repaid in May (Mid-Year bonus) or November (Year-End bonus); may repay earlier; TTMPC collects from the bonus.
- May be renewed monthly until the bonus arrives. Failing to renew for the following month: penalty of 1% per month of the remaining balance, added to interest.

Decisions already given (2026-10-12): term = **until the next bonus** (not fixed 5/11); the **1% missed-renewal penalty is built now**.

**2026-10-14 superseding clarification (Messenger, Mimzy):** "Monthly renewal" does **not** mean the borrower pays interest every month. Nothing is collected until the bonus arrives — at that point the borrower pays off the full balance (principal + all accrued interest), *before* any new Bonus Loan is released to them. If they want another Bonus Loan for the next cycle, it is submitted and released as a **new loan application** — not a continuation/renewal of the old row. This resolves D1 and D12/Q11 below and overrides the plan's earlier D1(a) recommendation (interest-only monthly installments). It is consistent with Q9's answer ("interest charged only for the months passed") — interest still accrues monthly on the books, it's just not collected until payoff.

---

## 1. Phase 1 — How the system works today

### 1.1 Bonus Loan surfaces

| Piece | Where | Notes |
|---|---|---|
| Member application | `src/LOANFORMS/Bonus_Loan.jsx`, route `/Bonus_Loan` | Inserts into `loans` (code `BONUS`) directly from the browser via `submitUnifiedLoan()` (`loanSubmission.js`). |
| Non-member application | Same component with `staffIntake`, route `/Cashier_NonMember_Bonus` (Cashier only) | Inserts into `koica_loans` (code `NONMEMBER_BONUS`). Submitter stamped by trigger (`koica_loans_staff_submitted_by.sql`). |
| Computation | `POST /api/loans/compute` (`main.py:1632`, bonus branch `:1733`) **and** a duplicate browser fallback `loanComputeApi.js` | Two formulas for the same thing. |
| Rates | `loan_types.interest_rate`: BONUS = 2, NONMEMBER_BONUS = 3 (set 2026-10-12) | BOD edits via Loan Policies (`loan_types_bod_update_rate.sql`). |
| Fees | `loan_fee_policies`: flat ₱100 service fee, no CBU/insurance/notarial | Deducted from proceeds: `net_proceeds = principal − fees`. |
| Application window | May/Nov only — form, `get_loan_eligibility` RPC, `bonus_loan_window_trigger.sql` (on `loans` and `koica_loans`), Bookkeeper override `bonus_window_override.sql` | See decision D5: the window limits *applying*, while the policy uses May/Nov as *repayment* months. |
| Term | Dropdown: 5 ("May Midyear") / 11 ("Year-end November") | Fixed; not tied to the release date. |

### 1.2 Member loan lifecycle (`loans` table) — reused by every loan type

1. **Submit** — browser insert, status `pending`. The MIGS cap (CBU × 3 or 5) is checked in the browser (`loanSubmission.js`). Amount, rate and term are not re-validated by the backend.
2. **Bookkeeper** reviews → recommended (`Bookkeeper/Components/Loan-Approval.jsx`, `LoanApprovalDetails`), bell notification.
3. **Manager** → to be disbursed (`Manager/Components/LoanApprovalDetails.jsx`). BOD high-value approval applies only to Consolidated > ₱500k.
4. **Treasurer** → `ready for disbursement` (`Treasurer/Components/Treasurer_ApprovalDetails.jsx`), with vault coverage shown.
5. **Cashier release** — `POST /api/cashier/disbursements/{id}/disburse` (`main.py:4692`):
   - debits the vault atomically via `vault_debit_for_disbursement` (net cash out; 409 on insufficient funds);
   - creates **installment 1 only**, due one month after release (`build_single_schedule_row`, `main.py:1416`);
   - writes `disbursement_confirmations` → receipt trigger issues the `loan_release` receipt;
   - sets status `released`.
6. **Payments** — Cashier records (`POST /api/cashier/loan-payments`, status `pending_bookkeeper`) → Bookkeeper approves (`POST /api/bookkeeper/payments/{id}/approve`, `main.py:11769`). Approval allocates the money in this order: penalty, then arrears, then the current installment, then credit. It then creates the **next** installment (rolling schedule, `main.py:12051`), and a receipt trigger issues the `loan_payment` receipt.
7. **Penalty** — `compute_loan_penalty` (`main.py:1057`): starts only after a **3-month grace** past the earliest unpaid due date (`PENALTY_GRACE_MONTHS = 3`). It is remaining balance × rate × months overdue, where the rate is **1% for Bonus** and 2% for other loans. It is recomputed server-side on each payment, not stored per period, and legacy loans are exempt.
8. **"Renewal" in this system** means a *new loan row that pays off the old one* (`application_type = 'renewal'`, 6-payment rule, Bookkeeper override). This is **not** the policy's "monthly renewal".
9. **Member portal** — dashboard, statement of account and loan journey read `loans` by `member_id`. Receipts are served via `/api/member/transactions`.

### 1.3 Non-member Bonus (`koica_loans`) — where it stops

- It appears in the Bookkeeper, Manager and Treasurer queues, and the Treasurer can set it to `ready for disbursement`.
- **The Cashier cannot release it.** `ready-loans` (`main.py:2292`), the release endpoint (`:4692`) and the payment lookups read only `loans`. The Treasurer's decision queue marks these rows `is_estimated` / "review", never fundable (`main.py:2717`, `:2826`).
- The result: no vault debit, no schedule, no payments, no receipts. **A non-member Bonus Loan currently ends at Treasurer approval.**
- Non-members have no account, so they have no portal.
- `loans.member_id` is **nullable**, which matters for option B in §4.1.

### 1.4 Eligibility data available

| Need | Exists? |
|---|---|
| Cooperative membership | Yes: a `member` row with `member_status` (active / exiting / terminated / closed) and `is_bona_fide`. There is no explicit "good standing" flag. |
| DepEd employment | **No.** `employer_name` is free text (personal data sheet / loan form). Nothing keyword-classifies it for eligibility (a payroll-agency classifier that once read it was removed with the payroll delay feature). `member_profile.employment_status` holds Full-time/Part-time/…, not the employer. |
| Bonus amount | `bonus_amount_numeric` is captured, but the form copies the loan amount into it, so the two are always equal and it is never verified. |
| Applicant category, eligibility basis, maturity date, verification/approval of the basis | Not stored. |

### 1.5 Existing risks this work touches (not new)

- The release endpoint has no auth dependency; the cashier identity comes from the request body (also listed in QA Round 1).
- Loan amounts and rates are written by the browser at submission; the backend recomputes only at release (rate) and at payment (penalty).

---

## 2. Phase 2 — Confirmed rules (as answered 2026-10-14)

| Rule | Basis |
|---|---|
| 2% (member) / 3% (non-coop member) per month; rate chosen by **membership status** | Policy + Q15 |
| ₱100 service fee, **deducted from proceeds** (release ₱19,900 on a ₱20,000 loan) | Q14 |
| Interest = principal × monthly rate, accrued **only for months actually elapsed** (not pre-charged for the full term) | Q1 (chat) + Q9 |
| **Nothing is paid monthly.** At bonus release, borrower pays principal + all accrued interest in one lump sum. No interest-only installments. | Q1 override (Messenger, Mimzy, 2026-10-14) |
| "Renewal" = a **new loan application** for the next cycle, submitted only after the current one is fully paid off. There is no mid-cycle renewal row — the existing New/Renewal toggle is irrelevant to Bonus. | Q11 (chat) |
| Due date = **end of the month** of May / November | Q4 |
| Partial first month (e.g. released Jan 20) is charged as a full month | Q5 |
| Application window = **Dec–Apr for Mid-Year bonus, Jun–Oct for Year-End bonus** (literal Q6(a) wording — excludes May and November themselves, not "always open") | Q6(a) |
| Loan always targets the **next upcoming bonus** | Q13(a) |
| Missed deadline = **day after the due date** (end of May / Nov) | Q2(a) |
| 1% per month penalty, based on **principal only** (not principal + unpaid interest), no compounding | Q3(a) |
| If bonus is late/short, balance keeps accruing interest + 1% penalty monthly until paid | Q10(a) |
| Early/partial payment before the bonus is allowed, and **lowers next month's interest accrual** | Q19 (yes/yes) |
| Verification proof = **payslip**; amount is **not capped by CBU × 3/5 (MIGS cap)** — capped by the member's **gross salary / actual bonus amount** instead | Q8 |
| Same approval chain, vault debit, audit log | Existing system (no separate workflow) |

## 3. Eligibility, payment flow, and non-member handling (as answered 2026-10-14)

| # | Question | Answer |
|---|---|---|
| **Q7 / D7** | Who can get a Bonus Loan? | **Resolved 2026-10-14: anyone can avail of a Bonus Loan** — no DepEd-employment restriction and no membership-category restriction. All four categories (member/non-member × DepEd/non-DepEd) are eligible, no Manager-approval exception needed just for category. Membership status still picks the **rate** (2% member / 3% non-coop, Q15/§2), and Manager-approval-for-exception no longer applies to eligibility — only the DepEd-active-service proof (Q8, payslip) stays as a verification step for amount/cap purposes, not as a gate on who may apply. |
| **Q16 (payment method)** | How does the borrower pay? | **(a) Cash at the Cashier** and **(c) ATM held by TTMPC** — not salary deduction, not GCash/bank transfer. |
| **Q17** | How does TTMPC collect at bonus time? | **(b) Borrower withdraws the bonus and pays at the Cashier**, and **(c) TTMPC withdraws it using the borrower's ATM**. Not DepEd-remitted. |
| **Q18** | If DepEd deducted and remitted (17a) — reconciliation process | **Not applicable** — 17a wasn't selected, so there's no DepEd remittance list to reconcile. |
| **Q12** | Non-member receipts (no system account) | **Yes**, a printed Cashier receipt is sufficient. |
| **Q20** | Do non-members pay the same way as members? | **Yes** — same cash/ATM mechanism; no salary-deduction dependency either way since neither path uses it. |
| **Q21** | What does the borrower receive? | **(a) An official receipt for every payment.** Since there's no monthly installment anymore (per the Q1 override), this effectively means: a receipt for any partial/early payment plus the final payoff receipt. |

### Resolved former D-items (superseded by the above)

- **D1 (renewal mechanics):** resolved — no interest-only monthly installment; see §2.
- **D2/D3 (missed-renewal timing & penalty base):** resolved — day-after-due-date, 1% of principal only, no compounding. Note this **does not reuse** the system's existing 3-month-grace penalty logic (`PENALTY_GRACE_MONTHS`) or the 2%-of-remaining-balance formula used by other loan types — Bonus needs its own penalty branch with 0-month grace and a principal-only base.
- **D4 (maturity day):** resolved — end of month, partial first month counts in full.
- **D5 (application window):** resolved — open any month before the target bonus.
- **D6 (which bonus):** resolved — always the nearest upcoming one (no borrower choice per the sheet; Q13 answer was flatly "A").
- **D9 (partial payments):** resolved — allowed, reduces future interest accrual; still reuse existing payment-allocation ordering unless that conflicts with "principal-only" penalty base (needs a small branch, not a new system).
- **D10 (short/late bonus):** resolved — keeps accruing interest + penalty monthly until paid; 90-day delinquency rule still applies on top.
- **D11 (non-member access):** resolved — printed receipts only, no portal.
- **D12 (does existing "Renewal" apply):** resolved — no. Hide the New/Renewal toggle entirely for Bonus; every Bonus application is a new loan by construction once the prior one is paid off.
- **D13 (non-member storage, A vs B):** **still open** — the Q&A sheet didn't address storage architecture. Recommendation B (store non-member Bonus in `loans` with `member_id = NULL`) stands unless management objects, since it's an implementation detail they don't need to weigh in on.
- **D8 (verification & cap):** resolved — payslip proof; cap is bonus/gross-salary based, **not** the MIGS CBU×3/5 cap. This is a meaningful departure from every other loan type in the system and needs its own cap-check branch, not the shared MIGS cap helper.
- **D7 (eligibility categories):** **resolved 2026-10-14** — anyone can avail of a Bonus Loan, all four categories eligible, no Manager-approval exception gate on eligibility itself.

---

## 4. Phase 3 — Step-by-step implementation plan (rewritten 2026-10-14 against current code)

Grounded in the actual code as of 2026-10-14 (`main.py` is 20,019 lines; line numbers below are current, not the stale ones from the original §4). Key finding that simplifies this a lot: **`loan_schedules` already only ever holds one open row per loan** (`idx_loan_schedules_one_active_due_per_loan`, a partial unique index on `loan_id` scoped to unpaid/pending/overdue rows — `loan_schedule_single_active_cleanup.sql`). Disbursement creates installment #1 only (`disburse_cashier_loan`, main.py:5029, row insert at :5184); the payment-approval endpoint creates installment #2, #3, … one at a time as each prior one is paid off (`approve_bookkeeper_payment`, main.py:12501, next-row insert at :12837, via the shared `build_single_schedule_row`, main.py:1477). So the system was never actually generating a bulk multi-row schedule for Bonus at disbursement time — `/api/loans/compute` previews the full term (main.py:1971–1997, for display only), but what lands in the DB is always incremental.

**That means the lump-sum model doesn't need a new schedule architecture.** It needs: (1) Bonus's *term* to collapse to 1 installment instead of 5 or 11, with that single installment's `expected_amount` equal to principal + interest accrued for the actual elapsed months; (2) the payment-approval endpoint to NOT create a "next installment" for Bonus once that one row is paid (loan closes instead); (3) a Bonus-specific penalty base (principal only, no grace) instead of reusing `compute_loan_penalty`'s per-installment/2-month-grace logic; (4) the eligibility-cap check to use salary/verified-bonus instead of the MIGS CBU×3/5 cap; (5) removing the New/Renewal toggle for Bonus on the frontend, since the system's existing `application_type='renewal'` payoff-netting machinery (`_resolve_renewal_predecessors` / `_compute_net_cash_out`, main.py:4779–4907) is reused as-is for "new loan after the bonus is paid off" rather than invented fresh — a Bonus application that follows a fully-paid prior Bonus loan for the same member is submitted as `application_type='renewal'` under the hood (reusing the existing payoff-netting so a same-day double-loan can't happen), but the UI never shows the member a New/Renewal *choice* — it's inferred automatically from whether a prior Bonus loan exists and is unpaid/paid.

Build in this order. Each step is independently testable on the TEST Supabase mirror before touching LIVE.

### Step 1 — ~~Lock down the open question (D7)~~ — resolved, skip

D7 is resolved (2026-10-14): anyone can avail of a Bonus Loan, no DepEd-employment or category gate. No eligibility-category blocking logic is needed in Step 6's frontend gate or any backend eligibility check — only the rate (member 2% / non-coop 3%, Q15) and the per-loan verified-bonus-amount cap (Step 5) vary by who's applying.

### Step 2 — ✅ BUILT 2026-10-14 — Backend: collapse the schedule to one installment

File: `main.py`, `/api/loans/compute` Bonus branch (lines 1971–2001 as built).

- The `for installment_no in range(1, term + 1)` loop is now a single row: `installment_no=1`, `due_date = add_months(first_due_date, term - 1)`, `interest_component = principal * monthly_rate * term` (term now semantically means "months elapsed to the bonus date"), `principal_component = principal`, `expected_amount = principal_component + interest_component`.
- New helpers added near `add_months` (main.py ~line 698): `next_bonus_month_end(from_date)` (nearest upcoming May 31/Nov 30, Q13) and `months_between_rounded_up(start, end)` (whole months, partial month rounds up, Q5). Both unit-verified by hand (Jan 20→May 31 = 5 months, Oct 14→Nov 30 = 2 months, etc.).

File: `main.py`, `build_single_schedule_row` — added a third branch (`elif loan_type == "bonus":`) alongside `emergency` and the flat/add-on `else`, computing the same single lump-sum shape. `penalty_rate_percent = 1` for bonus was already correct and untouched.

File: `main.py`, `disburse_cashier_loan` — **went further than the original plan**: the shared `first_due_date = add_months(disbursed_at, 1)` is wrong for Bonus (not aware of the actual bonus month), so disbursement now branches: for Bonus, `first_due_date = next_bonus_month_end(release date)` and `term_months` is **recomputed from the real release date** via `months_between_rounded_up`, not read from whatever was stored at application time (still the old 5/11 picker until Step 6 ships). The corrected `term` is also written back onto `loans.term` at release (new `if normalized_loan_type == "bonus": update_payload["term"] = term_months` before the loans update) — this was necessary so Step 3/4's logic, which reads `loans.term` directly, sees the right value post-release.

### Step 3 — ✅ BUILT 2026-10-14 — Backend: stop creating a "next installment" after Bonus payoff

File: `main.py`, `approve_bookkeeper_payment`, next-row creation block.

- **Verified the original plan's assumption was wrong, not right.** `term_months` for Bonus is no longer an installment count (it's "months elapsed") after Step 2, so `current_installment_no < term_months` (`1 < 7`, say) would still fire and wrongly try to create installment #2. Added an explicit `is_single_installment_loan = normalized_loan_type == "bonus"` guard to the condition instead of relying on the term-count coincidence.
- The existing `loan_status_update = "fully paid" if remaining_loan_balance <= 0 else "partially paid"` logic (unconditional on loan type) already does the right thing for Bonus with no change — confirmed by reading it, not assumed.
- **Found and fixed a real bug along the way:** `total_interest_amount` had a fallback formula (`monthly_amortization * term_months - principal`) used when `loans.total_interest` isn't populated. Since Step 2 makes `monthly_amortization` hold the *full* lump sum for Bonus (not a per-month figure), this fallback would double/triple/etc.-count interest. Fixed with a Bonus-specific branch (`monthly_amortization - principal`, no `* term_months`). **This same bug pattern was found and fixed in 7 other places** across the codebase wherever this formula was duplicated (Cashier payment listing ×2, manage-loans listing ×2, `_loan_total_payable` helper, `_remaining_for`/`_loan_summary` in the Bookkeeper reports function, and two MIGS "Loan Availed" scoring loops) — see as-built notes below for the MIGS caveat.

### Step 4 — ✅ BUILT 2026-10-14 — Backend: Bonus-specific penalty (principal-only base, no grace)

File: `main.py`, `compute_loan_penalty` and `accrue_loan_penalties` (the two had near-duplicate logic; both updated in parallel) plus `_server_side_penalty_for_loan`.

- Added an `is_bonus` branch to both: `grace_end = earliest_unpaid_due` (no `add_months`, i.e. no grace period, Q2) and `base = original_principal` (a new parameter threaded through both functions and every call site, Q3) instead of `min(installment_amount, remaining_balance)`. Rate selection (1% bonus / 2% other) was already correct and untouched.
- **Decision needed and resolved with the user:** Q3's "principal only" base doesn't define what "principal" means after a partial payment (Bonus has no separate principal/interest split once lump-sum). Resolved: the base stays fixed at the loan's **original** `principal_amount` regardless of partial payments, until the loan is fully paid (at which point `remaining_balance <= 0` already zeroes the penalty via the existing guard). Do not revisit this without asking the user again — a different interpretation was explicitly declined.
- `original_principal` threaded through 3 call sites: `_server_side_penalty_for_loan` (the authoritative write-path wrapper), the Cashier payment-listing display call, and the manage-loans `_accrued_penalty`/`_loan_summary` display calls.

### Step 5 — ✅ BUILT 2026-10-14 — Backend + frontend: verification + cap (payslip, no file stored)

**Clarified with the user before building:** no file/document storage exists in the system and none is needed — the Bookkeeper checks the borrower's payslip in person (same as collateral, where no photo is stored either) and types in the verified amount. Dropped the `bonus_proof_reference` text field from the original plan — unnecessary ceremony per the user.

- **Migration:** `src/server/bonus_verified_amount_schema.sql` (new, additive) — `loans.verified_bonus_amount` (numeric), `bonus_verified_by` (uuid, FK to auth.users), `bonus_verified_at` (timestamptz). **You run it** (per your own SQL workflow).
- **Backend (`main.py`, `disburse_cashier_loan`):** real enforcement where money actually moves, not just a frontend guard — if `verified_bonus_amount` is null, disbursement is blocked outright (400); if `loan_amount > verified_bonus_amount`, also blocked. Added `verified_bonus_amount` to the disbursement select.
- **Frontend (`Manager/Components/LoanApprovalDetails.jsx`, shared by Bookkeeper/Manager/BOD flows):** new "Bonus Amount Verification" panel mirrors the existing collateral-appraisal UI pattern exactly — one text input + Save button, Bookkeeper-editable only, read-only display for everyone else. Saves directly to `loans.verified_bonus_amount` via Supabase (`saveVerifiedBonusAmount`), stamping `bonus_verified_by`/`bonus_verified_at`.
- **Hard gate, per explicit user decision:** `applyLoanStatusUpdate`'s existing Recommend-gate block (same place as the co-maker and collateral-appraisal gates) now also blocks Recommend for a Bonus loan until `verified_bonus_amount` is saved, and blocks it if the requested amount exceeds the verified amount. Checked against the **DB-saved** value (`verifiedBonusAmountSaved`), not the unsaved input, so a typed-but-unsaved edit can't slip through.
- Only applies to member Bonus (`!isNonMemberSource`) — non-member Bonus loans still have no disbursement path at all (Step 8), so this gate doesn't fire for them yet.
- `npm run build` clean; `main.py` syntax-checked clean.

### Step 6 — ✅ BUILT 2026-10-14 — Frontend: Bonus_Loan.jsx term picker + hide New/Renewal

**Design fork confirmed with the user before building:** block, not net — matches the chat ("pay first, before release").

- **Term picker replaced.** The 5/11 `loan_term_months` dropdown is gone. New JS helpers (`nextBonusMonthEnd`, `monthsBetweenRoundedUp`) mirror the backend's `main.py` helpers exactly (same month-end-rounding and partial-month-rounds-up logic), computed once via `useMemo` and written into `formData.loan_term_months`/`payment_start_date` on mount. The loan agreement paragraph now reads "payable in full on the [Mid-Year/Year-End Bonus — date] ([n] months from today)" instead of the old "for a term of [dropdown] months with a monthly amortization of [x]" — since there's no monthly amortization anymore, just a lump-sum payoff.
- **Computation summary card rewritten.** Dropped the "Monthly Principal / Monthly Interest / Monthly Amortization" trio (meaningless for a single lump sum); now shows Loan Amount, Months to Bonus, Interest Rate, Total Interest (accrued, not paid monthly), and Total Payable at the Bonus.
- **New/Renewal radio removed entirely for Bonus.** Replaced with a red warning banner (shown only when `eligibility.can_apply_new` is false) reusing the existing `get_loan_eligibility` RPC's `bonus` bucket — which already treats any Bonus loan not yet `fully paid` as blocking (`can_apply_new: false`), so no new eligibility logic was needed, just a different UI reaction to the same signal (block instead of offering a disabled Renewal radio). **Enforced twice**: the Submit button is disabled, and `handleSubmit` itself re-checks and refuses before calling `submitUnifiedLoan`, so a stale page can't slip a blocked submission through.
- **Window updated everywhere it's defined — turned out to be FIVE copies, not one.** `main.py`'s `BONUS_APPLICATION_MONTHS`/`BONUS_WINDOW_REASON`, the `get_loan_eligibility` RPC (`get_loan_eligibility_rpc.sql`), the DB insert trigger (`bonus_loan_window_trigger.sql`, also renamed its `non_member_loans`-side trigger to match the earlier koica rename), `Bonus_Loan.jsx`'s own constant — and **two more found only after the user reported "WINDOW CLOSED" showing on 2026-10-14 (a Jun-Oct-open month) on the Member's loan-picker page**: `Member/Components/Member_ApplyLoans.jsx` (the actual bug — this is the card the member sees *before* reaching the Bonus_Loan form, and it still had the old `[5, 11]`) and `hooks/useLoanEligibility.js` (a dead/unused copy, fixed for consistency anyway). All five now open Dec–Apr and Jun–Oct, closed in May/Nov themselves (the literal Q6(a) wording, not "always open" — confirmed by re-reading the handwritten answer, which picked option (a) exactly as worded). **Lesson: grep the whole repo for a constant before declaring a step done, not just the files the plan named** — `Member_ApplyLoans.jsx` was never in Step 6's file list.
- **Client-side compute fallback fixed too.** `loanComputeApi.js`'s `buildMonthlyBreakdown` (used only when the FastAPI backend is unreachable) had the same `n`-repeated-installments bug the backend had before Step 2 — added a matching single-lump-sum branch so the fallback produces the same shape as the real backend.
- `npm run build` and `npx eslint` both clean (one pre-existing unrelated dead-var finding left untouched; `canRenew`, newly dead from removing the radio, was cleaned up).
- **Pre-existing bug found and fixed while re-running the migration (2026-10-14, after first reported failure):** `get_loan_eligibility_rpc.sql`'s original query used `MAX(...) KEEP (DENSE_RANK LAST ORDER BY ...)` — that's Oracle/MySQL syntax, not valid Postgres at all, so this RPC would have failed to even install (`ERROR: syntax error at or near "("`) regardless of the Bonus window edit. Rewrote the "latest active loan per type" lookup as three plain `SELECT ... ORDER BY ... DESC NULLS LAST LIMIT 1` queries (the Postgres-native equivalent), one per loan type, replacing the single broken 3-column query. Also fixed a second stale message (the closed-window `reason` text under "Build bonus bucket" still said the old "only in May/Nov" instead of the new Dec–Apr/Jun–Oct wording). **You must re-run `get_loan_eligibility_rpc.sql` for Steps 1–6 to actually work at all** — the function likely never successfully deployed before this fix.

### Step 7 — Frontend: Cashier payment screen copy

- Since there's only ever one installment per Bonus loan, remove any "monthly renewal (interest)" language from the Cashier payment UI for Bonus rows — it's just "Bonus payoff" (full amount) or a partial/early payment toward it (Q19: allowed, reduces future accrual — recompute `expected_amount`'s interest component live if a partial payment is recorded before the due date).

### Step 8 — ✅ BUILT 2026-10-14/15 — Non-member Bonus now stored in `loans` (D13-B, user-confirmed)

Previously `non_member_loans` (renamed from `koica_loans` earlier) had **no disbursement or payment-approval path at all** — a non-member Bonus loan dead-ended at Treasurer approval. Recommendation B confirmed by the user: store non-member Bonus in `loans` with `member_id = NULL` instead of building a second parallel implementation.

- **Migration:** `src/server/bonus_nonmember_in_loans_schema.sql` (new, additive) — `loans.applicant_full_name`, `loans.applicant_credentials` (jsonb), plus a Cashier-only INSERT RLS policy for `member_id IS NULL` + `NONMEMBER_BONUS` rows. **You need to run this.** `non_member_loans` itself is retired for new writes; existing rows stay as read-only history.
- **`loanSubmission.js`:** the old `targetTable !== 'loans'` branch (minimal insert into `non_member_loans`) is gone. `submitUnifiedLoan` now takes an explicit `isNonMemberApplicant` flag; a non-member applicant goes through the same `loans` insert path as a member, with `member_id = null`, `applicant_full_name`/`applicant_credentials` populated instead of a member join, and `user_email` taken from the typed-in applicant email (not the signed-in Cashier's own login email — a real bug in the old code path that would have stamped the Cashier's email instead of the applicant's).
- **`Bonus_Loan.jsx`:** `targetTable` is now always `'loans'`; `isNonMemberApplicant: isNonMemberBonus` passed explicitly.
- **Display fallback added across the core workflow** (not reports/audit, see below) — every place that assumed a `loans` row always has a `member` join now falls back to `applicant_full_name` when `member_id` is null: Bookkeeper queue (`Loan-Approval.jsx` + its backend `/api/bookkeeper/loan-approval-queue`), Manager queue (`loan-approval.jsx`), the shared `LoanApprovalDetails.jsx` (Bookkeeper/Manager/BOD — also now correctly gates Bonus-amount verification for non-member rows too, since they're real `loans` rows with real `verified_bonus_amount` columns now), `Treasurer_Approval.jsx` + `Treasurer_ApprovalDetails.jsx`, the Cashier's `/api/cashier/disbursements/ready-loans`, the Treasurer decision-queue/rescheduled-tab/priority-queue endpoints, and `notification_service.py` (email notifications) / `_resolve_loan_member_meta` (in-app notifications).
- **Payment creation/approval endpoints needed no changes** — confirmed by reading them: `/api/cashier/loan-payments` and `approve_bookkeeper_payment` were already member-agnostic (work purely off `control_number`/amounts), so they handle non-member Bonus loans correctly with zero code change, same as the disbursement endpoint from Step 2.
- **Known gap, deliberately left alone (user's direction):** `/api/risk/predict`'s "skip member-feature assembly" check only fires for `source == "non_member_loans"` (the old table), not for a `loans` row with `member_id = None`. The Manager's optional "Run risk assessment" button may error or misbehave for a non-member Bonus loan. This touches the ML credit-risk subsystem, which belongs to the analytics team — **do not fix this without them**, per explicit instruction (2026-10-15).
- **Not touched, by design:** financial/audit report display (`main.py` ~4062/4119/4180, a ledger/transaction-history function) — informational only, doesn't block processing a loan. Flagged as a known cosmetic gap, not fixed.
- `npm run build` and Python syntax checks clean throughout.

### Step 9 — Tests (TEST mirror first)

- Compute endpoint: single-installment output, interest only for elapsed months, for several release dates straddling May/Nov.
- Disbursement: creates exactly 1 schedule row; vault debit matches `principal − fee`.
- Payment approval: paying the single installment in full closes the loan (`fully paid`, no next row created); a partial payment leaves it open with a recomputed remaining balance and lowered future interest per Q19.
- Penalty: missed due date accrues 1%/month of principal only starting the day after due date (no 2-month grace) — verify this doesn't leak into non-Bonus loan types.
- Blocked-resubmission: member with an unpaid Bonus loan cannot submit a new one; can once the prior is `fully paid`.
- `npm run build` + `npm run lint`.

## 5. Build order

1. ~~Step 1~~ — D7 resolved, skip straight to Step 2.
2. Step 2 (single-installment compute + `build_single_schedule_row` Bonus branch).
3. Step 3 (verify no-next-installment behavior — likely needs no code change).
4. Step 4 (Bonus penalty branch).
5. Step 5 (verification + salary-based cap; small migration).
6. Step 6 (frontend term/window/renewal-block changes) — confirm the block-vs-net question with management first.
7. Step 7 (Cashier UI copy).
8. Step 8 (non-member storage decision + retire `koica_loans` insert path).
9. Step 9 (tests on TEST, then LIVE).

## 6. As-built notes (2026-10-14, Steps 2–4)

Caveats and deviations discovered while actually writing the code, kept here so a future session doesn't have to rediscover them:

- **The double-counting bug was systemic, not local.** `monthly_amortization * term - principal` was the standard fallback formula for computing `total_interest` when it's not stored, duplicated across ~9 call sites in `main.py` (loan listings, penalty calcs, the Bookkeeper reports helper, MIGS scoring). Every one of them assumed `monthly_amortization` was a *per-installment* figure — true for every loan type except the new Bonus model, where it's now the *full lump sum*. All were found and fixed in this pass except two MIGS scoring call sites (next point).
- **MIGS "Loan Availed" scoring — balance fix applied, maturity-window math left as a flagged TODO.** Two near-identical loops (`main.py` ~lines 10898 and ~11481, the MIGS summary and MIGS detail endpoints) had the same double-count bug — fixed. But the same loops also compute a loan's "maturity window" (whether it's still active during a scoring year) as `application_year*12 + (application_month-1) + term_months`, which assumed `term_months` counts installments from the application date. For Bonus, `term_months` now means "months from *release* to the bonus date" — a different basis entirely. This was explicitly left unfixed per the user's direction (2026-10-14): it needs its own dedicated review, not a fold-in patch, since MIGS scoring is a separate, sensitive subsystem. **Do not touch this without discussing it first.**
- **Penalty base for partial payments — explicit user decision, don't relitigate.** Q3 says the Bonus penalty is based on "principal only," but doesn't define what that means after a partial payment reduces the balance (Bonus has no principal/interest split once it's a single lump sum). Asked the user directly: the base stays **fixed at the original `principal_amount`**, not reduced by payments, until the loan is fully paid off. Implemented as a new `original_principal` parameter threaded through `compute_loan_penalty`, `accrue_loan_penalties`, and `_server_side_penalty_for_loan`.
- **Disbursement now recomputes `term` and writes it back.** The frontend still submits the old 5/11-month term at application time (Step 6 hasn't shipped). Since Step 3's "is this the last installment" check and Step 4's penalty logic both read `loans.term` directly, disbursement recomputes the real elapsed-months value from the actual release date and **overwrites `loans.term`** at release. This means `loans.term` for a Bonus loan is unreliable between application and disbursement (still the old picker value) but correct from disbursement onward — worth knowing if anything reads `loans.term` for a Bonus loan that hasn't been released yet.
- **New shared helpers** (`main.py`, near `add_months`): `next_bonus_month_end(from_date)` and `months_between_rounded_up(start, end)`. Both are generic enough to reuse elsewhere if another feature needs "nearest May/Nov" or "whole months rounded up" logic.
- **Not yet addressed by Steps 2–4** (still open for Step 5 onward): the frontend (`Bonus_Loan.jsx`) still shows the old 5/11 dropdown and still computes a multi-row schedule preview client-side from the old `/api/loans/compute` response shape — Step 6 must update it to read the new single-row response. Until Step 6 ships, a Bonus application submitted today will store a stale `term` (corrected only at disbursement, per the point above) and the UI will likely misrender the now-single-row `monthly_breakdown` array as if it still had multiple rows — **do not let a real Bonus loan go through the full cycle on LIVE until at least Step 6 is done**, test on the TEST mirror only for now.

## 7. Tests (manual + SQL checks; the repo has no automated test suite)

Run on the TEST Supabase mirror first, not LIVE, until Step 6 ships (see as-built notes above):
- Compute endpoint: single-installment output, interest only for elapsed months, for several release dates straddling May/Nov.
- Disbursement: creates exactly 1 schedule row; vault debit matches `principal − fee`; `loans.term` is corrected to the real elapsed-months count.
- Payment approval: paying the single installment in full closes the loan (`fully paid`, no next row created); a partial payment leaves it open with a recomputed remaining balance.
- Penalty: missed due date accrues 1%/month of the *original* principal only, starting the day after due date (no grace) — verify this doesn't leak into non-Bonus loan types, and that the base doesn't shrink after a partial payment.
- `npm run build` + `npm run lint` (already run clean as of this pass — no new errors introduced).

---

## 8. 2026-10-18 — Saka upfront-deduction model (SUPERSEDES §1–7 above)

**Trigger:** the Bookkeeper (real person) was asked directly and confirmed the Bonus Loan deducts interest upfront at release ("Saka"), not at the bonus month as the lump-sum model (§1–7) assumed. User explicitly chose the Bookkeeper's answer as final over the 2026-10-14 management Q&A.

**What changed, conceptually:**
- **Old (lump-sum):** nothing deducted at release; borrower owes principal + accrued interest at the bonus month.
- **New (Saka):** `upfront_interest = principal × monthly_rate × term`, deducted from proceeds at release (`net_proceeds = principal − upfront_interest − fees`, blocked if ≤ 0). Borrower owes **principal only** at the bonus month — interest is already fully collected.
- Term/rate/penalty/eligibility/non-member-storage rules from §2–§3 above are otherwise **unchanged** — only the *timing* of interest collection flipped.

**Built 2026-10-18:**
- `main.py` `/api/loans/compute` Bonus branch — `expected_amount` (amount due at bonus month) is now `principal_component` only; `total_deductions`/`net_proceeds` now include the upfront interest and raise 400 if proceeds would be ≤ 0.
- `main.py` `build_single_schedule_row` Bonus branch — the single schedule row's `expected_amount`/`interest_component` reflects principal-only due (interest already collected).
- `main.py` `_compute_net_cash_out` — new optional `bonus_upfront_interest` param; `disburse_cashier_loan` passes the real figure computed from the actual release-date term; `preview_cashier_disbursement` and `_compute_vault_available`/`_net_cash_out_for_rows` fall back to a new `_estimate_bonus_upfront_interest()` helper (reads the loan row's stored term/rate — an estimate pre-release, since the true term is only final at the real release date, same caveat as the old model's as-built notes in §6 above). Added `term`/`interest_rate` to those endpoints' `loans` selects so the estimator has data to work with.
- `main.py` `disburse_cashier_loan` — blocks release with 400 if net cash out would be ≤ 0 for Bonus.
- Frontend: `Bonus_Loan.jsx` agreement copy and computation summary card now describe upfront deduction ("Upfront Interest (deducted at release)" / "Principal Due at the Bonus") instead of "nothing paid until the bonus." `loanComputeApi.js` (offline fallback) mirrors the backend exactly, including the ≤0 guard. `LoanDeductionsCard.jsx` gained an optional `bonus_upfront_interest` row so the Cashier/Bookkeeper deductions card totals correctly for Bonus.

**Not touched / still needs review:**
- Penalty logic (`compute_loan_penalty` et al.) — unaffected, already based on original principal, which is still correct since the bonus-month amount due is principal either way.
- The Bookkeeper's bonus-amount verification gate (`verified_bonus_amount` cap) — unaffected; still caps the loan principal, not interest.
- No DB schema change was needed — `bonus_upfront_interest` is a computed/display value, not a stored column. If a dedicated receipt line-item for it is wanted later, that needs a migration (not done here).
- Formal end-to-end testing (old §7 checklist) needs to be redone against the Saka numbers — not done in this pass.
