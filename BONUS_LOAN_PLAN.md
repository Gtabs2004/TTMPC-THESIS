# Bonus Loan Module — Analysis & Plan

Status: **Phase 1–3 (analysis + plan). No code written yet.** Implementation waits on the management decisions in §3.

Source policy (TTMPC Bonus Loan sheet):
- Applicant must be in active DepEd service, and a member in good standing.
- 2% monthly interest for regular members, 3% for non-coop members. Service fee ₱100.00.
- Amount equals the bonus the borrower will receive (Mid-Year or Year-End).
- Repaid in May (Mid-Year bonus) or November (Year-End bonus); may repay earlier; TTMPC collects from the bonus.
- May be renewed monthly until the bonus arrives. Failing to renew for the following month: penalty of 1% per month of the remaining balance, added to interest.

Decisions already given (2026-10-12): term = **until the next bonus** (not fixed 5/11); the **1% missed-renewal penalty is built now**.

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
| DepEd employment | **No.** `employer_name` is free text (personal data sheet / loan form). `main.py:3140` keyword-classifies it for payroll, not eligibility. `member_profile.employment_status` holds Full-time/Part-time/…, not the employer. |
| Bonus amount | `bonus_amount_numeric` is captured, but the form copies the loan amount into it, so the two are always equal and it is never verified. |
| Applicant category, eligibility basis, maturity date, verification/approval of the basis | Not stored. |

### 1.5 Existing risks this work touches (not new)

- The release endpoint has no auth dependency; the cashier identity comes from the request body (also listed in QA Round 1).
- Loan amounts and rates are written by the browser at submission; the backend recomputes only at release (rate) and at payment (penalty).

---

## 2. Phase 2 — Confirmed rules

| Rule | Basis |
|---|---|
| 2% (member) / 3% (non-coop member) per month; rate chosen by **membership status**; configurable in Loan Policies | Policy + existing `loan_types` |
| ₱100 service fee, **deducted from proceeds** | Policy amount + existing `net_proceeds` rule |
| Interest = principal × monthly rate (add-on on original principal) | Existing Bonus formula; the policy is silent |
| Repayment month: May (Mid-Year), November (Year-End) | Policy |
| Term = months from release to the target bonus month | Decision 2026-10-12 |
| 1% per month penalty on remaining balance for a missed renewal | Policy; build now |
| Same approval chain, vault debit, receipts, audit log | Existing system (no separate workflow) |

## 3. Decisions requiring management approval

Each decision has a recommendation so management can confirm or change it.

| # | Question | Why it matters | Recommendation |
|---|---|---|---|
| **D1** | What does "renew monthly" mean in practice? (a) Pay that month's interest; principal is collected from the bonus. (b) Pay nothing; all interest is collected from the bonus. | Defines the whole schedule. | (a). Each month is an interest-only installment; the last installment (bonus month) is principal + interest. |
| **D2** | When is a renewal "missed"? On the due date, after N grace days, or after the current 3-month grace? | Today Bonus penalties start only after 3 months. | Missed after the due date + a grace of N days (management sets N); no 3-month grace for Bonus. |
| **D3** | Penalty base — "remaining balance" means unpaid principal only, or principal + unpaid interest? Does it compound? | Changes the amount. | Unpaid principal + unpaid interest; no compounding (penalty is not added to the base). |
| **D4** | Partial months and maturity day: if released Jan 20, due "May" — which day? Is a partial first month charged in full? | Term and interest count. | Maturity = a fixed day of the bonus month (e.g., 15th, set by management); count whole months from release, rounding a partial month up. |
| **D5** | Application window: the system accepts Bonus applications **only in May/November**, but the policy implies borrowing *before* the bonus and repaying *in* May/November. | The current window contradicts the policy. | Accept applications in the months *before* each bonus (e.g., Dec–Apr for Mid-Year, Jun–Oct for Year-End); May/Nov become maturity months. |
| **D6** | Which bonus a loan targets: the nearest upcoming one automatically, or the applicant's choice? | Term. | Nearest upcoming bonus; staff can switch to the other with a recorded reason. |
| **D7** | Eligibility. Policy says "member in good standing" and "active DepEd", yet prices non-coop members at 3%. Allowed categories: (1) member + DepEd, (2) non-member + DepEd, (3) member + non-DepEd, (4) non-member + non-DepEd? | The policy conflicts with itself; categories 3–4 aren't in the policy. | Enable 1–2 now. Allow 3–4 only as **exceptions** that need Manager approval with a recorded alternative basis, until the policy is amended. |
| **D8** | Bonus verification: what proof (payslip / DepEd notice), who verifies, and does the MIGS cap (CBU × 3/5) still apply to Bonus? | The amount cap. | Bookkeeper records the verified bonus amount and its proof; loan ≤ verified bonus. MIGS cap: management to confirm. |
| **D9** | Partial payments and early settlement: reuse the existing order (penalty → arrears → current → credit)? On early payoff, interest only for months elapsed? | Accounting. | Reuse the existing order; early payoff charges interest only through the payoff month. |
| **D10** | Bonus short or late: the remaining balance keeps renewing monthly with penalties until paid? | Delinquency. | Yes. Each later month becomes a new interest-only installment; the 90-day delinquency rule still applies. |
| **D11** | Non-member access to their records (no account). | Portal scope. | Non-members get printed receipts and statements from the Cashier; no new accounts. |
| **D12** | Does the existing loan "Renewal" (new loan paying off the old one, 6-payment rule) still apply to Bonus? | Two different "renewals". | No. For Bonus, "renewal" means paying the monthly installment. Hide the New/Renewal choice on Bonus. |
| **D13** | Non-member storage: (A) keep `koica_loans` and extend release, payment and receipts to it, or (B) store non-member Bonus in `loans` with `member_id = NULL` plus applicant fields. | Size and risk of the change. | **B.** Release, payments, schedules, penalty and receipts already key on `loans`; A would duplicate each of them. See §4.1. |

---

## 4. Phase 3 — File-by-file plan

The plan assumes the recommendations above. Items that depend on a decision are tagged.

### 4.1 Data model — `src/server/bonus_loan_v1_schema.sql` (new; you run it)

- `loans`: add `bonus_cycle` (`midyear` / `yearend` / `other`), `maturity_date`, `applicant_category` (4 values, D7), `is_coop_member`, `is_deped`, `eligibility_basis` (text), `verified_bonus_amount`, `bonus_verified_by`, `bonus_verified_at`, `exception_required`, `exception_approved_by`, `exception_approved_at`, `submitted_by_staff_id/role/email`.
- **D13-B:** non-member applicant identity goes in `applicant_full_name` and `applicant_credentials` (jsonb) with `member_id = NULL`. The RLS insert policy allows `NONMEMBER_BONUS` with no `member_id` for Cashiers only. `koica_loans` is no longer written; existing rows stay as history.
- `loan_schedules`: a **unique index on (loan_id, installment_no)**. This blocks duplicate monthly installments, renewals and penalties.
- `bonus_penalty_assessments` (new): `loan_id`, `installment_no`, `base_amount`, `rate`, `amount`, `assessed_at`, and **unique (loan_id, installment_no)**. This gives a stored, non-duplicating penalty history (D2/D3).
- A trigger `loans_bonus_enforce` (BEFORE INSERT) on Bonus codes:
  - sets `interest_rate` from `loan_types` by membership;
  - computes `bonus_cycle`, `maturity_date` and `term` (D4–D6);
  - requires `loan_amount ≤ verified_bonus_amount` once verified;
  - sets `exception_required` for categories 3–4.
  
  Browser values are never trusted.
- Update `bonus_loan_window_trigger.sql` / `get_loan_eligibility` for the new window (**D5**).

### 4.2 Backend — `src/server/main.py` (one computation for everyone)

- New helper `compute_bonus_schedule(principal, rate, release_date, maturity_date)` returns installments 1…n: n−1 interest-only rows, then a final row of principal + interest (**D1**). It is used by:
  - `/api/loans/compute` bonus branch (`:1733`) — returns the full schedule plus `maturity_date` and `term`;
  - `build_single_schedule_row` (`:1416`) — the Bonus branch emits the correct row for any installment number;
  - release (`:4692`) and Bookkeeper payment approval (`:12051`), unchanged apart from calling the Bonus branch.
- Penalty: a Bonus branch in `compute_loan_penalty` / `_server_side_penalty_for_loan` (`:1057`, `:1087`). For Bonus there is no 3-month grace (**D2**); each missed installment after its deadline gets one row in `bonus_penalty_assessments` (idempotent through the unique key). The amount is folded into the existing penalty allocation at payment. A paid-off loan stops accruing.
- **D13-B:** the release, payment and lookup endpoints already read `loans`; join the member name with a fallback to `applicant_full_name` where `member_id` is NULL (`:2292`, `:4625`, `:4692`, `:1792`, `:5108`, `:12640`).
- Add an auth dependency to the release endpoint (`:4692`) as part of touching it.

### 4.3 Frontend

| File | Change |
|---|---|
| `LOANFORMS/Bonus_Loan.jsx` | Replace the 5/11 dropdown with a target bonus picker (D6) that shows the computed maturity date and term. Add an applicant category (DepEd yes/no; membership is known). Separate the bonus amount from the loan amount. Show the full schedule (interest-only months + final). Hide New/Renewal for Bonus (D12). |
| `LOANFORMS/loanComputeApi.js` | Remove the Bonus browser fallback formula; if the backend is down, show "computation unavailable" instead of a second formula. |
| `LOANFORMS/loanSubmission.js` | D13-B: non-member Bonus inserts into `loans` with `member_id = NULL` and applicant fields. |
| Bookkeeper `LoanApprovalDetails` | "Verify bonus" panel: verified amount, proof reference, eligibility basis; exception flag; blocks recommending until verified. |
| Manager `LoanApprovalDetails` | Exception approval for categories 3–4 (D7); shows category, basis and rate. |
| Treasurer / Cashier disbursement | Shows maturity date and category; non-member Bonus becomes releasable (via D13-B). |
| Cashier payments | Bonus rows labelled "Monthly renewal (interest)" vs "Bonus collection (final)"; penalty line shown. |
| Member portal (`Member_StatementOfAccount`, `LoanJourneyPanel`, dashboard) | Show maturity date, renewal months paid/missed, penalties. Reuse existing receipts. |

### 4.4 Tests (manual + SQL checks; the repo has no automated test suite)

The scenarios from the request (1–22), run against the TEST Supabase mirror first:
- Rates 2%/3%; maturity and term for several release dates.
- Release debits the vault once; the unique index rejects a duplicate installment.
- A missed renewal adds exactly one penalty per month (re-running assessment adds nothing); a paid-off loan stops accruing.
- Payment allocation; release and payment receipts; Consolidated/Emergency unchanged.
- `npm run build` + `npm run lint`.

## 5. Build order (after decisions)

1. D13 storage + schema migration.
2. Bonus schedule computation (backend) + compute endpoint.
3. Release and payment approval Bonus branch + non-member release.
4. Penalty assessment.
5. Form and staff verification UI.
6. Member portal views.
7. Window change (D5).
8. Tests on TEST, then LIVE.
