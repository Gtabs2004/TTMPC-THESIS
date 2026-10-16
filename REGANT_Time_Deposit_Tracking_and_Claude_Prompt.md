# REGANT Time Deposit — Requirements, Tracking, and Claude Implementation Prompt

**Project:** REGANT — TTMPC Cooperative Decision-Support System  
**Document purpose:** Track agreed Time Deposit requirements and provide a repository-aware implementation brief for Claude Code.  
**Status:** Draft for implementation planning; unresolved cooperative policies must be confirmed rather than invented.

---

## 1. Summary

Integrate a Time Deposit (TD) feature into REGANT's existing savings management system. The feature should let authorized staff open and manage TD placements, calculate interest using the bookkeeper's official bracket table, process maturity and settlement, and let members view their own certificates and expected earnings.

The existing system must remain the source of truth for member records, account balances, transactions, withdrawals, permissions, and audit history. Inspect the repository and actual database schema before deciding how to integrate the feature.

### Known project context

- Frontend: React + Vite
- Database/authentication: Supabase (PostgreSQL)
- Backend: FastAPI in `TTMPC_THESIS/src/server/`
- Existing areas include member management, regular savings, cashier operations, withdrawals, and member portals.
- The developer applies SQL changes manually in the Supabase SQL Editor. Claude should prepare migrations/scripts and instructions, not apply changes to production.

---

## 2. Bookkeeper-Confirmed Interest Rules

The bookkeeper supplied the following amount brackets and rates:

| Placement principal | 180 days (6 months) | 365 days (1 year) |
|---|---:|---:|
| ₱50,000.00–₱199,999.99 | 1.5% | 2.0% |
| ₱200,000.00–₱499,999.99 | 2.0% | 2.5% |
| ₱500,000.00–₱799,999.99 | 2.5% | 3.0% |
| ₱800,000.00 and above | 3.0% | 4.0% |

### Formula for 365 days

`Interest = Principal × Annual Interest Rate`

### Formula for 180 days

`Interest = Principal × Annual Interest Rate ÷ 365 × 180`

Use the rate as a decimal in calculations (for example, 2.5% = 0.025).

### Example calculations

| Principal | Term | Rate | Expected interest | Principal + interest |
|---:|---:|---:|---:|---:|
| ₱50,000.00 | 180 days | 1.5% | ₱369.86 | ₱50,369.86 |
| ₱50,000.00 | 365 days | 2.0% | ₱1,000.00 | ₱51,000.00 |
| ₱200,000.00 | 180 days | 2.0% | ₱1,972.60 | ₱201,972.60 |
| ₱200,000.00 | 365 days | 2.5% | ₱5,000.00 | ₱205,000.00 |
| ₱500,000.00 | 180 days | 2.5% | ₱6,164.38 | ₱506,164.38 |
| ₱500,000.00 | 365 days | 3.0% | ₱15,000.00 | ₱515,000.00 |
| ₱800,000.00 | 180 days | 3.0% | ₱11,835.62 | ₱811,835.62 |
| ₱800,000.00 | 365 days | 4.0% | ₱32,000.00 | ₱832,000.00 |

The table uses the minimum principal at each bracket. The 180-day examples round interest to two decimal places for display.

### Calculation requirements

- Select the rate using the principal amount of the individual placement and the chosen term, subject to confirmation that TTMPC applies brackets per placement.
- Handle boundaries exactly: ₱199,999.99 versus ₱200,000.00; ₱499,999.99 versus ₱500,000.00; ₱799,999.99 versus ₱800,000.00.
- The lowest listed bracket begins at ₱50,000. Do not assume whether lower amounts are permitted; flag this for confirmation before enforcing a new rejection rule.
- Use decimal-safe monetary arithmetic for authoritative calculations.
- Follow the project's established currency precision and rounding conventions if they exist. If no convention exists, document the proposed rounding behavior and do not silently treat it as a confirmed cooperative policy.
- Keep the rate and terms applied to each certificate as historical contract data so a future rate-table change does not rewrite an existing certificate's terms.
- Frontend previews must match the authoritative backend/database calculation.
- Do not add unsupported terms, compounding, tax, fees, penalties, or a different day-count convention.

---

## 3. Dashboard and UI Requirements

### Split dropdown action

Replace the single add-account action in the savings dashboard toolbar with a split dropdown:

`[ + Open Account ▾ ]`

Options:
- Open Regular Savings Account
- Create Time Deposit Placement

Preserve the current Regular Savings opening workflow.

### Pill tabs

Allow staff to switch between these views on the same dashboard:
- Regular Savings
- Time Deposits

### Regular Savings table

Keep the current columns and behavior:
- Account No.
- Account Name
- Kind
- Balance
- Last Activity
- Status
- Action

### Time Deposits table

Show:
- TD No.
- Account Name
- Term & Rate
- Principal
- Expected Tubo
- Maturity Date
- Status
- Action

Use existing UI conventions and handle loading, empty, error, and pagination states. Format money in Philippine pesos. Do not show fabricated fallback data as real account data.

---

## 4. KPI Summary Requirements

### Card 1 — Total Cooperative Deposits

Show an aggregate of eligible Regular Savings balances and eligible Time Deposit principal, with a breakdown of liquid Regular Savings and locked TD principal.

Avoid double-counting money moved from Regular Savings into a TD. Define which statuses are included based on the existing schema and cooperative rules. Do not automatically add expected interest to deposit totals unless the accounting policy and data model support that treatment.

### Card 2 — Regular Member Accounts

Show the number of active Regular Savings accounts and their aggregate balances.

### Card 3 — Time Deposits

Show the number of active TD placements, active/locked principal total, and number of matured certificates awaiting settlement. A matured certificate is not automatically settled or closed.

Calculate these summaries from trusted database/backend queries. Avoid fetching every transaction into the browser solely to calculate aggregate totals.

---

## 5. Opening a Time Deposit

The opening flow should:

1. Select an eligible existing member/account using the identifiers and relationships actually used by REGANT.
2. Retrieve relevant member information from existing records rather than collecting duplicate member data.
3. Accept principal and one of the supported terms (180 or 365 days).
4. Show the selected bracket, annual rate, interest formula, expected interest, maturity date, and expected maturity value.
5. Recalculate the preview when principal or term changes.
6. Require an authorized user to confirm the placement.
7. Generate a unique certificate number following an existing convention if available.
8. Persist the placement and its original contract terms.
9. Record funding through the existing financial transaction mechanism where applicable.
10. Return a transaction reference and clear result to the cashier.

**Funding source is not yet confirmed.** The current implementation records a member-linked placement and TD-ledger entry without debiting Regular Savings or recording a cash receipt. Inspect existing workflows, then identify whether TTMPC allows funding from Regular Savings, new cash deposits, or both before enabling real fund movement.

If a placement is funded by transferring from Regular Savings, the debit and TD creation must be atomic. A failed transaction must not leave a funded-looking certificate or an incorrect balance. Prevent duplicate processing on retries.

---

## 6. Lifecycle, Maturity, and Settlement

Conceptual statuses:

- `LOCKED`: placement is within its active term.
- `MATURED`: maturity date has been reached, but settlement has not completed.
- `CLOSED`: settlement of the certificate has completed.

Use established project status conventions if present. Determine maturity consistently using the cooperative's business timezone and agreed date convention; avoid browser-timezone errors.

At maturity, the currently discussed settlement choices are:

### Option A — Withdraw Tubo Only / Principal Rollover

Expected business result:
- Pay the interest earned for the matured cycle through the authorized payout/withdrawal process.
- Record the actual interest payment in the appropriate ledger.
- Retain the principal for a new TD cycle.
- Preserve the original certificate and settlement history.
- Create a linked renewal/cycle record rather than overwriting the original placement dates and terms.
- Record the new cycle's dates, rate, and terms.
- Ensure the retained principal is not debited or credited a second time.

**Unresolved:** Whether the renewed cycle uses the original rate or the rate effective when the new cycle starts; whether renewal starts on the maturity date or when the cashier actually processes it; and whether rollover is manual or automatic. Do not assume these rules.

### Option B — Withdraw All

Expected business result:
- Pay principal plus the interest payable under the contract, subject to any confirmed deductions or policies.
- Record the payment in the appropriate ledger.
- Mark the certificate `CLOSED` only after the financial settlement succeeds.
- Preserve the contract and full settlement history.

### Transaction safety

- Settlement must be atomic and idempotent.
- Prevent duplicate payment from double-clicks, concurrent requests, retries, or network interruptions.
- Use an existing secure transactional pattern or a suitable database transaction/function; do not implement a multi-table financial settlement as unrelated client-side updates.
- A failed payout must not close the certificate or create duplicate ledger entries.
- Do not create a second source of truth for balances.

---

## 7. Member Portal

Add a TD section to the existing member portal so members can both review their placements and track each placement's progress from opening through maturity and final settlement.

### Member portal overview

Show:
- Member's active TD placements and placement/certificate numbers
- Total active principal
- Expected interest earnings, clearly labeled as estimates until earned/settled under the cooperative's policy
- Maturity dates and lifecycle statuses
- A visible progress indicator for each active placement (elapsed days / total term and percentage of term completed)
- Alerts for approaching maturity and matured certificates awaiting settlement, using existing notification capabilities where available

### Per-certificate progress and details

The certificate detail view should include:
- Certificate number and placement date
- Principal, term, applied rate, and applicable bracket
- Formula used, expected interest, and expected maturity value
- Maturity date and days remaining (or days overdue if maturity has passed but settlement is pending)
- A clear timeline or stepper with dated milestones, such as **Placement opened → Term in progress → Matured / awaiting settlement → Settled or renewed**
- Current status and next expected action, written in member-friendly language
- Rollover and settlement history when available, including whether the member withdrew interest only, withdrew principal plus interest, or renewed the placement
- Receipt/certificate and settlement transaction references where supported by existing REGANT functionality

### Progress calculation and status rules

- Calculate progress from the persisted placement date, contractual term, and maturity date—not from a client-only timer or hard-coded percentage.
- Clamp the displayed active-term progress to 0–100%. Once the maturity date is reached, show **Matured — awaiting settlement** (or the actual verified status), not an indefinitely increasing progress percentage.
- Show exact elapsed/total days and a readable percentage together; for example, “210 of 365 days · 58% complete.” Any example values are illustrative only.
- The backend/database status and dates are authoritative. Reconcile the UI's progress with the cooperative-approved day-count and timezone convention; do not silently assume how weekends, holidays, or date boundaries work.
- Distinguish **term progress** from **financial progress**: do not imply that interest is paid out or compounded daily unless the approved policy and actual calculation support that claim. Display expected interest separately from interest actually paid.
- Maturity is not the same as settlement. A matured placement remains visible as awaiting settlement until a successful withdrawal or renewal is recorded. Show renewed placements as a new linked cycle while preserving the prior certificate's history.
- Handle missing or inconsistent dates/status data without inventing progress; show a clear unavailable/needs-review state instead.

Members may only view certificates belonging to their own authorized account. Enforce access in backend authorization and Supabase RLS where applicable; frontend filtering alone is insufficient.

Reuse the existing notification mechanism if available. Do not add expensive polling or redundant notification infrastructure without need.

---

## 8. Audit and Financial Integrity

Reuse existing transaction references, receipt generation, audit logs, and ledger patterns where appropriate. Financial activity should be traceable to the authorized operator and relevant member/account.

The system should be able to reconstruct:
- Original placement and contract terms
- Funding source and funding transaction
- Applied rate and calculation basis
- Expected interest
- Maturity event/status
- Interest paid
- Principal paid or retained for rollover
- New cycle and its relationship to the prior cycle
- Settlement date and ledger references
- Responsible authorized operator

Do not overwrite the original contract to represent a rollover. Do not treat expected interest as an already completed payment. Do not report operational dashboard totals as formal accounting balances unless the underlying accounting model supports that claim.

---

## 9. Security and Implementation Constraints

- Inspect the existing codebase and actual schema before changing anything.
- Preserve existing Regular Savings behavior.
- Reuse current member records, authorization, ledgers, transaction references, and UI patterns when appropriate.
- Do not invent table names, fields, relationships, or business rules.
- Do not create duplicate member records, duplicate ledgers, or redundant APIs without a demonstrated need.
- Do not weaken RLS, authentication, or authorization.
- Do not expose service-role secrets in frontend code.
- Do not use mock data in production-facing components.
- Avoid unrelated refactoring and unnecessary dependencies.
- Use migration scripts for schema changes.
- Do not execute destructive operations or apply migrations to production without authorization.
- Prepare SQL scripts in execution order; the developer will apply them manually in Supabase SQL Editor.

---

## 10. Testing and Acceptance Criteria

Test, using the project's existing test tools where available:

1. Rate selection for both terms and every bracket.
2. Boundary amounts immediately below, at, and above each threshold.
3. Minimum amount behavior after the cooperative rule is confirmed.
4. Decimal precision and rounding.
5. Expected maturity date behavior.
6. Active, matured, and closed lifecycle behavior.
7. Funding source and atomicity, according to confirmed policy.
8. Interest-only settlement and principal rollover.
9. Full settlement.
10. Duplicate submissions and concurrent settlement attempts.
11. Failed transactions and safe retry behavior.
12. KPI totals without double-counting transfers.
13. Member-level authorization and RLS.
14. Regression tests for Regular Savings opening, deposits, withdrawals, balances, and portal views.

Never claim tests passed unless they were actually executed. Clearly report failures, skipped tests, and anything blocked by missing environment access or unresolved policy.

---

## 11. Implementation Tracking Checklist

Use this checklist to track progress. Update it as work is completed.

- [x] Inspect Regular Savings dashboard and account-opening flow. (2026-10-16 — see Section 15)
- [x] Inspect database schema, migrations, RLS, triggers, and current ledger architecture. (2026-10-16 — see Section 15)
- [x] Trace existing deposits, withdrawals, receipts, and audit records. (2026-10-16 — see Section 15)
- [ ] Confirm the allowed TD funding source(s) with the bookkeeper.
- [ ] Confirm whether ₱50,000 is a strict minimum placement.
- [ ] Confirm whether rate brackets are based on each placement's principal.
- [ ] Confirm maturity-date counting and timezone convention.
- [ ] Confirm rollover rate and rollover effective date.
- [ ] Confirm whether rollover is manual or automatic.
- [ ] Confirm applicable tax, deduction, and rounding policies, if any.
- [x] Design schema changes after repository/schema inspection. (2026-10-16 — dedicated TD tables, tier policies, RLS, ledger, and KPI view)
- [x] Prepare SQL migrations and manual application instructions. (2026-10-16 — `time_deposit_01_schema.sql` through `time_deposit_03_kpis.sql`)
- [x] Implement authoritative interest calculation and validation. (2026-10-16 — BOD-managed tiers and 180/365-day formulas)
- [x] Implement member-linked placement creation without fund movement. (2026-10-16 — idempotent `td_open()` RPC and TD ledger entry)
- [ ] Implement maturity-state handling.
- [ ] Implement atomic/idempotent settlement paths.
- [x] Integrate staff dashboard and KPIs. (2026-10-16 — cashier tabs, TD table, total TD principal, account count, and settlement count)
- [x] Integrate member portal and authorization. (2026-10-16 — member-owned TD endpoint and certificate progress)
- [x] Add audit trail/receipt integration as appropriate. (2026-10-16 — TD ledger triggers and receipt source type)
- [ ] Run unit, integration, security, and regression tests available in the project. (Pytest is not installed in the available virtual environments; frontend build passed.)
- [ ] Document modified files, migration order, test results, and unresolved items.

---

## 12. Detailed Prompt for Claude Code

You are working in the existing REGANT repository for the TTMPC cooperative. Implement the Time Deposit feature described in this document. Treat the bookkeeper-confirmed rate matrix and formulas in Section 2 as the authoritative calculation requirements. Treat unresolved items explicitly listed in this document as unknown business policies, not as permission to invent behavior.

### Step 1 — Repository reconnaissance

Inspect the relevant frontend pages/components, API routes/services, database access layer, SQL migrations, Supabase tables/views/functions/triggers, RLS policies, authentication/authorization checks, savings/withdrawal ledgers, receipt flows, and tests. Start with targeted searches and trace the actual call paths. Do not scan or rewrite unrelated modules unnecessarily.

Produce a concise findings summary identifying the existing source of truth for member identity, account balances, transaction history, withdrawal/payout handling, audit logs, and access control. Identify the precise files and schema objects that would need changes. Do not guess names or relationships.

### Step 2 — Reconcile design with the repository

Map each requirement in this document to existing code and data structures. Reuse existing patterns where appropriate. Identify conflicts, missing capabilities, migration needs, and policy questions that block safe implementation. Do not create duplicate ledgers, balance sources, or parallel account systems.

If a genuinely blocking business-policy decision is unresolved, do not silently choose an answer. Implement independent, safe parts where possible and clearly isolate the blocked behavior. Ask a concise question only when needed to prevent an unsafe or materially incorrect financial implementation.

### Step 3 — Implement in small, verifiable stages

Work in this order:

1. Calculation function and tests.
2. Required schema/migration proposals and constraints.
3. Secure backend/database placement creation and funding.
4. Maturity state and settlement logic with transaction safety.
5. Staff dashboard, table switching, and KPI integration.
6. Member portal and access restrictions.
7. Audit/receipt integration and regression verification.

Keep changes focused. After each stage, inspect the diff and run the relevant available tests before proceeding. Do not stop after writing a plan if the requirements are clear and implementation can safely proceed.

### Step 4 — Financial correctness

Implement the exact bookkeeper formulas:
- 365 days: principal × annual rate.
- 180 days: principal × annual rate ÷ 365 × 180.

Use decimal-safe arithmetic. Ensure the displayed preview and authoritative calculation agree. Persist the applied contractual rate and calculation inputs for historical reproducibility. Do not invent lower-principal eligibility, tax, compounding, penalties, rollover rate, automatic renewal, or maturity-date conventions. Use confirmed existing project conventions where demonstrably applicable; otherwise document the unresolved decision.

Any operation affecting money, ledgers, certificate status, or balances must use a safe transaction pattern and prevent duplicate processing. The client must not be authoritative for interest or payout amounts. Never claim a payout succeeded until the underlying transaction confirms it.

### Step 5 — Security and compatibility

Preserve current Regular Savings behavior. Enforce staff permissions and member ownership using existing backend controls and RLS as applicable. Never rely only on hidden UI controls for authorization. Do not expose privileged credentials in the frontend. Do not use mock data as production data. Do not apply destructive SQL or make production database changes.

### Step 6 — SQL delivery

Provide the necessary SQL migration scripts in dependency/execution order and explain how to apply them manually through Supabase SQL Editor. Include any required rollback or recovery notes where practical. Do not run migrations against production or claim the database was updated when only scripts were created.

### Step 7 — Final report

At completion, report:
- What was implemented and what was not
- Files created/modified
- SQL migrations and their execution order
- Any environment/configuration requirements
- Actual tests run and their results
- Security and transaction-safety measures added
- Any failures or blocked checks
- Remaining policy decisions that require confirmation
- A short manual verification checklist for staff and members

Do not fabricate test results, schema facts, successful database changes, or completed payouts. Be concise but specific. Keep the implementation aligned with this tracking document and update the checklist as work progresses.

---

## 13. Known Open Decisions — Do Not Guess

1. **Funding:** Regular Savings transfer, cash deposit, or both?
2. **Minimum placement:** Are amounts below ₱50,000 prohibited, or are there exceptions?
3. **Bracket basis:** Is the bracket always based on the individual certificate's principal?
4. **Rollover rate:** Original rate or rate in effect for the new cycle?
5. **Rollover timing:** Starts on maturity date or when processed by staff?
6. **Maturity behavior:** Manual member choice or automatic renewal under an approved default?
7. **Maturity date convention:** How are placement date, day counting, weekends/holidays, and timezone handled?
8. **Deductions:** Are withholding tax or other deductions applicable to interest payouts?
9. **Rounding:** What rounding convention does the bookkeeper use for the actual ledger entry?
10. **Approval controls:** Does opening or settling a TD require a second staff approval?

Do not block safe repository inspection, calculation tests, or UI planning while these are being clarified. Do not implement a financial behavior dependent on an unresolved answer without clearly isolating it.

## 14. UI/UX Design for Opening a Time Deposit — Required Addition

### Why this section exists

The initial specification covered dashboard tabs and table columns, but it did not sufficiently define the actual user journey for opening a Time Deposit: how the cashier starts, enters details, sees the live calculation, reviews the contract, submits the placement, handles errors, and receives proof that the account was opened. This is a required feature, not a cosmetic extra.

### Benchmark findings (research references)

Use these as workflow references, not as instructions to copy another bank's branding or business rules:

- **Metrobank Online Time Deposit:** A logged-in user chooses an eligible settlement account, starts from an “Open a time deposit” entry point, enters placement details, and submits. It emphasizes an existing eligible account as the funding/settlement source. https://www.metrobank.com.ph/personal/services/digital/online-time-deposit
- **Maybank Philippines:** The flow is presented as place TD → enter/select details → review details and accept terms → make placement/authorize → view receipt and receive a certificate. This supports a distinct review-and-confirm step and visible proof of completion. https://www.maybank.com.ph/en/personal/maybank2u-ph/Time-Deposit-Online.html
- **PSBank Philippines:** The documented mobile flow selects a source account, enters the amount, selects the term and maturity payout instruction, reviews the details, then submits. Its maturity choices illustrate that maturity instructions should be explicit rather than hidden. https://www.psbank.com.ph/other-products-and-services/other-products-and-services/product-lists/peso-td-via-psbank-mobile-faqs/
- **Bank of Cyprus:** The documented flow selects term, source account, and amount; displays the rate; then asks the user to review and confirm. This supports showing the rate as a result of the chosen amount and term before final submission. https://www.bankofcyprus.com/en-gb/help/mobile-app/eFixed_deposit/

### Recommended REGANT cashier opening experience

Build a clear, guided flow rather than putting every field into one crowded modal. Prefer a full-page workflow or a sufficiently wide, accessible multi-step dialog, consistent with the existing REGANT design system. Choose the pattern after inspecting existing app conventions and screen sizes.

#### Entry point

- On the Savings dashboard, the primary action is **`+ Open Account`** with a dropdown/menu option for **Regular Savings Account** and **Time Deposit Placement**.
- Selecting **Time Deposit Placement** opens a dedicated flow titled **Open Time Deposit**.
- The user should always be able to tell they are creating a TD placement, not opening a regular passbook account.

#### Step 1 — Select member and funding source

- Search and select an existing member using the project's established member identifiers and search behavior.
- Show verified member details (e.g. member name and member code) as a compact read-only summary after selection. Do not ask staff to retype information already stored in REGANT.
- Ask for the funding source only after inspecting existing transaction and account capabilities. If funding is from Regular Savings, show eligible source accounts and their available balances. Do not assume cash funding or a source-account transfer is approved until TTMPC policy is confirmed.
- Prevent continuing if the member is not eligible or the selected source account cannot fund the requested amount. Explain the reason in plain language.

#### Step 2 — Enter placement details

- Principal amount (PHP) with currency formatting and sensible input validation.
- Term selector limited to the bookkeeper-confirmed options: **180 days (6 months)** and **365 days (1 year)**. Do not add other terms without approval.
- Display the applicable bracket and annual rate after the amount and term are valid.
- Recalculate the preview immediately when amount or term changes.
- Clearly state the minimum/eligibility rule only after the cooperative confirms whether ₱50,000 is an absolute minimum.

#### Step 3 — Live earnings preview

Show a prominent but not overly decorative summary with:

- Principal amount
- Selected term and day count
- Applied annual interest rate
- Bracket that determined the rate
- Formula used
- Expected gross interest (*tubo*)
- Expected maturity value (principal + expected gross interest)
- Placement date and projected maturity date

Use the bookkeeper's exact calculation rules:

- 365 days: principal × annual rate.
- 180 days: principal × annual rate ÷ 365 × 180.

Round displayed PHP amounts to two decimal places, but use an authoritative decimal-safe backend/database calculation for financial values. If applicable deductions are not yet confirmed, label the preview as **estimated gross interest** and do not invent a net payout.

Provide a short, readable explanation such as: “Your ₱200,000 placement falls in the ₱200,000–₱499,999.99 bracket. The 365-day annual rate is 2.5%.” Do not force the cashier to mentally infer why a rate was selected.

#### Step 4 — Review and submit

Before creating or funding anything, show a final review screen/card containing:

- Member identity
- Funding source and amount
- Principal
- Term and rate
- Expected gross interest
- Expected maturity value
- Placement and maturity dates
- Any approved maturity instruction, if that decision has been made

The final action should be explicit, for example **Review Placement** followed by **Confirm and Open Time Deposit**. Avoid a vague button such as “Submit” when the operation moves money. Use a clear confirmation step for the consequential financial action.

The confirmation screen must not claim success until the backend transaction actually succeeds. Disable repeat submission while a request is in progress, and protect against duplicate submissions server-side as well.

#### Step 5 — Success, certificate, and receipt

After confirmed success, show a completion page or result panel with:

- Success status
- TD certificate number
- Member name and principal
- Term, rate, and maturity date
- Expected interest and maturity value
- Funding transaction reference, where applicable
- A link/action to view or print/download the certificate or receipt if supported by the existing receipt architecture
- A clear **Back to Time Deposits** action

The placement and its funding ledger transaction must be committed consistently. If funding fails, do not show a successful placement or issue a certificate that falsely implies the money was received. If the response is lost after a committed transaction, the UI should be able to retrieve the transaction result rather than create a second placement.

### UX states and validation

The opening flow must design and implement these states explicitly:

- Initial state, member search, selected member
- Loading member/account details
- No search results
- Invalid amount / amount below allowed minimum
- No eligible funding source or insufficient available balance
- Valid amount but no applicable bracket (if policy/data makes this possible)
- Live calculation loading/error if calculation depends on an API
- Review/confirmation state
- Submission in progress
- Successful placement
- Failed funding or placement with a safe retry path
- Duplicate submission or uncertain network outcome
- Permission denied / session expired

Validation messages should appear beside the relevant field and explain how to correct the problem. Preserve entered values when a recoverable validation or network error occurs. Do not show raw database exceptions or sensitive details to the user.

### Design quality requirements

- Reuse existing REGANT components, typography, spacing, form controls, modal conventions, notifications, and accessibility patterns where suitable.
- Keep the workflow responsive for typical cashier desktop screens and smaller screens.
- Use visible labels; do not rely on placeholders alone.
- Make keyboard focus, dropdown behavior, and error states accessible.
- Use PHP-style? No: all monetary values should be formatted as Philippine pesos (₱), with consistent decimal precision.
- Avoid visual clutter, unnecessary animation, excessive cards, and duplicate member information.
- Keep Regular Savings opening behavior unchanged unless a shared component can safely be reused without regressions.
- Do not copy Metrobank, Maybank, PSBank, or another bank's exact visual branding. Benchmark the workflow patterns and adapt them to REGANT and TTMPC's teller process.

### Required implementation work for Claude

1. Inspect the current savings dashboard, existing account-opening forms, modal/drawer patterns, form validation, toast/notification components, and receipt/certificate functionality.
2. Report the best integration point and whether a dedicated page or multi-step dialog best fits the current application. Avoid building a second design system.
3. Implement the end-to-end TD opening UI, including the entry point, member lookup, amount/term form, live rate and interest preview, review step, submission state, error handling, and success result.
4. Connect it to the real backend and schema after verifying the repository. Do not use mock data in the production flow.
5. Ensure the frontend preview and backend calculation agree, but treat backend/database calculations as authoritative.
6. Ensure final confirmation is explicit and the operation is safe against double-clicks, retries, and concurrent requests.
7. Add tests for form validation, bracket changes, preview calculations, review summary, failure state, successful completion, and regression of Regular Savings account opening.
8. Include screenshots or a concise before/after description in the final report if the tooling supports it; do not claim visual verification if none was performed.

### Tracking checklist — UI/UX

- [ ] Dashboard action clearly offers Regular Savings vs Time Deposit.
- [ ] Dedicated “Open Time Deposit” flow is designed in line with existing REGANT UI.
- [ ] Existing-member search and selected-member summary work.
- [ ] Funding source is explicit and follows confirmed TTMPC policy.
- [ ] Principal and term inputs validate correctly.
- [ ] Rate bracket and annual rate update dynamically.
- [ ] Live interest and maturity-value preview uses the bookkeeper's exact formulas.
- [ ] Final review screen shows all material placement details before money moves.
- [ ] Confirmation button wording makes the financial action clear.
- [ ] Loading, validation, insufficient-funds, permission, failure, retry, and duplicate-submit states are handled.
- [ ] Successful placement shows the certificate/transaction reference and next actions.
- [ ] Member portal shows each member's own TD placements and a per-certificate term-progress indicator (elapsed/total days and percentage).
- [ ] Certificate detail shows a member-friendly lifecycle timeline from placement through maturity and settlement/renewal.
- [ ] Progress and statuses use authoritative stored dates/statuses, stop at maturity, and distinguish maturity from completed settlement.
- [ ] Expected interest is not presented as already-paid interest; no unsupported daily-accrual or compounding claim is made.
- [ ] Member authorization/RLS prevents viewing another member's certificate or progress.
- [ ] Receipt/certificate viewing or download follows existing REGANT capabilities.
- [ ] Keyboard, responsive layout, and accessible field/error behavior are checked.
- [ ] Regular Savings opening flow remains functional.
- [ ] UI and backend integration tests are run and actual results documented.

The Time Deposit feature of REGANT is designed to support placement recording, interest computation, maturity monitoring, and member progress tracking. At the current stage, the system does not automatically identify the original source of the funds used for each placement because the necessary funding-source information is not yet available in the cooperative's records.

Rather than assume or fabricate financial data, REGANT records and processes the information that can be verified. The system calculates expected interest using the cooperative's prescribed rates and formulas, monitors the deposit term, and distinguishes projected interest from actual settlement transactions. Once the cooperative provides the necessary funding and accounting information, the system can be extended to support more complete fund-source tracing and reconciliation.

---

## 15. Repository Reconnaissance Findings (Step 1 — completed 2026-10-16)

This section records the factual findings from inspecting the existing Regular Savings feature, so the Time Deposit design (Section 12, Step 2 onward) reuses existing patterns instead of inventing new ones. No design decisions are made here — findings only.

### 15.1 Savings dashboard & account-opening UI

- Per-portal dashboard/table components (no shared table component, but shared primitives): `Bookkeeper_Savings_Accounts.jsx`, `Cashier_Savings.jsx` + `Savings_Details.jsx`, `Manager_Savings_Accounts.jsx` + `Manager_Savings_Details.jsx`, `Treasurer_Savings_Accounts.jsx` + `Treasurer_Savings_Details.jsx`, and the pending-verification queue UI `Bookkeeper/Components/Savings-Transactions.jsx`.
- Shared toolbar primitives used across all: `src/components/TableToolbar.jsx`, `TableActionButton`, `Pagination`, `TableStateRow`. The TD dashboard (Section 3) should reuse these.
- Opening an account today is **a dedicated full page**, not a modal/drawer: `Cashier/Components/Add_Savings.jsx` (622 lines), cashier-only (no Bookkeeper/Manager/Treasurer open-account page exists). Submits via `POST /api/savings/transactions` (FastAPI, not direct Supabase insert) — server generates the account/savings ID and auto-creates both a `savings_accounts` bridge row and an `"OPEN-<savings_id>"` ledger mirror entry.

### 15.2 Database schema for savings

Two generations of schema coexist, bridged:

- **Legacy:** `public."Savings_Transactions"` (quoted CamelCase columns incl. `"Savings_ID"`, `"Account_Number"`, `"Balance"`, `membership_number_id` as **text**). Still read by `Member_Dashboard.jsx`.
- **New (current target):** `savings_accounts_schema.sql` —
  - `savings_accounts`: `account_number text PK` (convention `SA-000123`), `account_name`, `member_id uuid FK → member.id`, `account_kind` (`member`/`standalone`), `balance numeric(14,2)`, `status` (`active`/`closed`/`frozen`).
  - `savings_ledger`: immutable double-entry rows — `account_number FK`, `entry_type` (`credit`/`debit`), `amount > 0`, `running_balance`, `reference`, `source`, `posted_by/posted_at`.
- **Verification queue layer:** `savings_transaction_queue` (`pending_verification`/`validated`/`rejected`) and a generic cross-feature mirror `ledger_transactions` — overlap/purpose vs `savings_ledger` not fully clear (flagged below).
- **Bridge/reconciliation:** `savings_accounts_bridge.sql` adds `legacy_savings_id` + view `v_savings_balance_reconciliation` diffing new vs legacy balances.

**Confirmed `membership_number_id` trap:** this column is **uuid** FK to `member.id` in `grocery_transactions`, `attendance_logs`, `member_profile`/`member_classification_temporal` — but **text** (human membership code, e.g. `"TTMPC-015"`) in `savings_transaction_queue`, `ledger_transactions`, and cashier audit triggers. Must check column type per table before any TD join/filter touches it.

### 15.3 Transaction/ledger architecture

- Balance sync is a **DB trigger**, not application code: `fn_savings_ledger_apply()` (BEFORE INSERT on `savings_ledger`) locks the account row, computes the new balance, raises on insufficient funds, and updates `savings_accounts.balance` — same pattern as the CBU sync trigger (CLAUDE.md).
- Real workflow: Cashier inserts into `savings_transaction_queue` (no balance change yet) → Bookkeeper confirms via `POST /api/bookkeeper/savings-transactions/{id}/confirm` → confirm inserts the real `savings_ledger` row → trigger applies the balance change atomically → receipt auto-issued (15.5).
- `mirror_savings_ledger_entry()` (legacy→new bridge helper) is **best-effort**: failures are swallowed with a print, not raised, so the new-table mirror can silently drift from the legacy table — this is exactly what the reconciliation view exists to catch.

### 15.4 Withdrawal/payout processing

- `Cashier_Withdrawals.jsx` → `POST /api/savings/accounts/{account_number}/withdraw` (main.py ~10586): validates account is `active`, member `is_bona_fide`, `amount > 0` and `<= balance`, then **queues** (`savings_transaction_queue`, `pending_verification`) — no balance change at this step. Balance only changes when Bookkeeper confirms (same pattern as 15.3).
- This is a **different transaction-safety pattern** than ISC (`isc_calculate_preview()`/`isc_post()`/`isc_settle_posting()`/`isc_reverse()` — Postgres RPCs called via `supabase.rpc(...)`). TD settlement (interest/principal payout) will need to choose between "queue + FastAPI confirm" (savings precedent) or "DB RPC" (ISC precedent) — **open design question, not decided**.

### 15.5 Receipt/certificate generation

- Full system exists (`RECEIPT_SYSTEM_PLAN.md`, `receipts_01_schema.sql`–`receipts_06_audit.sql`). `receipts` table: `receipt_no` (format `TTMPC-TR-<year>-<000001>`), `source_type` CHECK (`loan_payment`, `loan_release`, `savings`, `cbu`, `membership_payment`, `cbu_payout`, `isc`, `grocery`) — **no `time_deposit` value yet**. Receipts are immutable (trigger blocks UPDATE/DELETE even for service_role). RLS: service_role only; member/staff access is gated entirely through FastAPI (`_authorize_receipt()`).
- Savings receipts are issued automatically by an `AFTER INSERT ON savings_ledger` trigger chain (`receipt_issue_savings()`). **Implication for TD:** if TD payouts post into `savings_ledger`, certificates/receipts happen for free via this existing trigger. If TD uses its own ledger table, it needs an equivalent `receipt_issue_*` function + trigger + a migration adding a `time_deposit` (or similar) value to the `source_type` CHECK.
- `_AUDIT_RECEIPT_TYPES` (main.py ~19810) maps `audit_log.entity_type` values to receipt lookups — also has no `time_deposit`/`td` entry yet.

### 15.6 RLS and authorization

- Shared helper: `public.has_portal_role(p_user_id, p_email, p_roles[])` (SECURITY DEFINER) checks `member_account` role membership — used across loan/audit policies.
- **Flagged gap:** `savings_accounts` and `savings_ledger` RLS policies are `USING (true)` / `WITH CHECK (true)` for any `authenticated` role — **no member-vs-staff distinction, no member_id scoping at the DB level.** Member-only access is enforced only client-side in `Member_Savings.jsx` (`.eq('member_id', memberId)`). This is inconsistent with:
  - the legacy `"Savings_Transactions"` table, which *does* properly scope (`savings_transactions_read_own_or_staff` policy: member sees own row via `member_account.membership_id` match, or staff role allowed), and
  - the lockdown pattern used for `receipts` and `loan_renewal_override_requests` (RLS on, no client policies, backend/service-role enforces identity from the verified JWT).
- **This matters directly for Section 7 of this document** ("Enforce access in backend authorization and Supabase RLS where applicable; frontend filtering alone is insufficient") — if TD reuses the `savings_accounts`/`savings_ledger` tables/pattern as-is, it inherits this same access gap. If TD gets dedicated tables, this is a concrete example of what *not* to copy. **This is a design decision, not yet made — see Section 16.**

### 15.7 Member portal

- `Member/Components/Member_Savings.jsx` (533 lines): direct Supabase reads (`savings_accounts` / `savings_ledger` filtered by `member_id`), with caching (`memberDataCache`) and realtime refetch (`useRealtimeRefetch`, `RT.SAVINGS`).
- **No maturity/progress-bar concept exists today** — Regular Savings has no maturity concept, so there is nothing analogous to copy for Section 7's per-certificate progress indicator; that UI will be new.
- Related: `Member_StatementOfAccount.jsx` + `member_statement_of_account_view.sql` may need to surface TD balances once added. Non-transactional explainer pages (`Index_Pages/savings_services.jsx`, `deposit.jsx`, `withdrawal.jsx`) suggest a similar public-facing TD explainer page would fit existing site structure.

### 15.8 Audit log pattern

- `public.audit_log`: the base schema's `entity_type` CHECK was `('loan','member','account','termination','application','policy')`, but **`audit_log_cashier_triggers.sql` (applied migration) already widened it** to also include `'payment','disbursement','cbu','savings','withdrawal','membership_payment','grocery'` — and widened `action` to add `'record','post'` alongside the original list. **Verified directly against the file's actual `ALTER TABLE ... ADD CONSTRAINT` statements on 2026-10-16** (not just comments — this corrects an earlier, more cautious reading of the recon).
- Concrete precedent for TD: `audit_trg_savings_ledger()` (trigger on `savings_ledger` AFTER INSERT) picks `entity_type := 'savings'` normally, or `'withdrawal'` when `entry_type = 'debit'`, and calls `audit_write(v_entity, NEW.id::text, 'post', NULL, after_jsonb, context_jsonb)`. The same entity-type-by-direction pattern applies to `savings_transaction_queue` inserts (`'create'` action).
- Single write path: `audit_write(p_entity_type, p_entity_id, p_action, p_before, p_after, p_context)` (SECURITY DEFINER).

### 15.9 Open items this recon surfaced (in addition to Section 13's list)

1. `membership_number_id` type trap — must verify per table, not assumed (15.2).
2. `savings_accounts`/`savings_ledger` RLS gap (`USING (true)`) — must decide whether TD inherits this or gets properly scoped policies (15.6). This should be resolved as part of this project's security requirements (Section 9), independent of bookkeeper input.
3. ~~`audit_log.entity_type` ... no time-deposit-shaped value~~ — **resolved 2026-10-16**: `audit_log.entity_type` already accepts `'loan','member','account','termination','application','policy','payment','disbursement','cbu','savings','withdrawal','membership_payment','grocery'` per the applied `audit_log_cashier_triggers.sql` migration; still no `time_deposit` literal, but adding one is a one-line precedent-following migration, not a gap to route around. `receipts.source_type` still has no time-deposit value and does need its own small migration (15.5).
4. Legacy `"Savings_Transactions"` vs new `savings_accounts`/`savings_ledger` migration is still mid-flight (Member_Dashboard still reads legacy) — need to decide whether TD targets only the new schema (recommended, but not yet confirmed as a project decision).
5. `ledger_transactions` (generic cross-feature mirror) vs `savings_ledger` (per-account ledger) purpose/overlap is unclear from schema alone — affects whether TD should write to both.
6. No existing minimum-deposit or rounding logic was found anywhere in the Regular Savings opening flow to mirror — confirms Section 13 Q2 (minimum) and Q9 (rounding) have no existing precedent to fall back on and must come from the bookkeeper.

---

## 16. Design Reconciliation (Step 2 — completed 2026-10-16)

Maps Sections 2–8 and 14 against the Section 15 findings. Marks each area **Unblocked** (safe to build now), **Blocked** (needs a Section 13 bookkeeper answer), or **Architecture decision** (a call this project can make independently, not a cooperative policy question).

### 16.1 Section 2 — Interest calculation
**Unblocked.** Pure function, no schema/table dependency. Only the minimum-amount rule (Q2) and rounding convention (Q9) are blocked, and they affect validation/display only, not the core formula — the formula itself can be implemented and tested now.

### 16.2 Section 3/4 — Dashboard & KPIs
**Unblocked.** Reuse `TableToolbar`/`TableActionButton`/`Pagination`/`TableStateRow` (15.1) exactly as `Bookkeeper_Savings_Accounts.jsx` does. KPI aggregates must be computed DB-side (a view, mirroring `v_savings_balance_reconciliation`'s pattern), not fetched client-side and summed, per Section 4's requirement.

### 16.3 Section 5 — Opening a TD
**Blocked** on Q1 (funding source). Two existing transaction-safety precedents were found (15.4):
- **Savings pattern:** queue row → human (Bookkeeper) confirms → ledger insert → trigger applies balance. This has a window between "queued" and "confirmed" where no atomic guarantee covers both the debit and the TD's existence together.
- **ISC pattern:** single Postgres RPC (`isc_post()`-style) — one DB transaction covers the whole operation.

Section 5's explicit requirement ("the debit and TD creation must be atomic... a failed transaction must not leave a funded-looking certificate") can only be satisfied by the **RPC pattern**, not the savings queue pattern, if funding ever comes from an existing account transfer. **Architecture decision (independent of bookkeeper policy): TD open/fund should be implemented as a Postgres RPC, not a queue-and-confirm flow**, regardless of which funding source Q1 resolves to — this is a transaction-safety requirement already in the spec, not something that depends on which source is approved.

### 16.4 Section 6 — Lifecycle & settlement
**Blocked** on Q4–Q6 (rollover rate/timing/automatic-vs-manual) and partially Q7/Q8 (maturity convention, deductions). The atomicity/idempotency requirement itself is unblocked and follows 16.3's conclusion: settlement (Option A/B) should also be an RPC (mirrors `isc_settle_posting()`), not client-side multi-step calls.

### 16.5 Section 7 — Member portal
**Unblocked except RLS.** The read/progress-display UI has no existing analog to copy (15.7 — Regular Savings has no maturity concept) but is not blocked by any open policy question. The access-control sub-requirement depends on an architecture decision:

**Architecture decision: TD gets its own tables with backend-enforced RLS** (service-role + verified-JWT identity, no client policies) — matching the `receipts` / `loan_renewal_override_requests` precedent, **not** the `savings_accounts`/`savings_ledger` precedent, which was found to have an open `USING (true)` policy (15.6) inconsistent with the rest of the codebase. This directly satisfies Section 7's "frontend filtering alone is insufficient" requirement and avoids inheriting a known gap.

### 16.6 Section 8 — Audit
**Unblocked — verified 2026-10-16.** `audit_log_cashier_triggers.sql` (an already-applied migration) widened `entity_type`'s CHECK beyond the base schema to include `'savings'`/`'withdrawal'` (among others) and widened `action` to add `'record'`/`'post'`. The project already has a direct precedent for exactly this situation: `audit_trg_savings_ledger()` picks `entity_type` based on transaction direction (`'savings'` for credit, `'withdrawal'` for debit) and writes `action = 'post'`.

**Architecture decision:** add a small additive migration extending `audit_log_entity_type_check` with a `'time_deposit'` value (same style as the cashier-triggers migration — drop and re-add the CHECK with the fuller list), and write TD ledger/lifecycle events via `audit_write('time_deposit', <id>, 'post'|'create'|..., ...)`, mirroring `audit_trg_savings_ledger()`'s trigger shape. This is additive-only, follows an existing applied-migration pattern exactly, and needs no context-discriminator workaround. Receipts still need their own small migration (`receipts.source_type` CHECK extended to include `'time_deposit'`), since receipts have no context-discriminator equivalent (15.5).

### 16.7 Section 14 — Opening-flow UI/UX
**Unblocked in structure** (steps, states, review/confirm pattern) — can be built against the RPC from 16.3 once it exists. Step 1 (funding source selection) and Step 5 (success/certificate reference) are blocked on Q1 and 16.6's receipt migration respectively, but the surrounding form/validation/preview UI (Steps 2–4) is not.

### 16.8 Conclusion — what proceeds now vs. what waits

**Proceeds now (Step 3, Section 12):**
1. Interest calculation function + unit tests (Section 2).
2. Schema/migration proposal for dedicated `time_deposits` / `time_deposit_ledger` tables, backend-enforced RLS, and the `receipts.source_type` migration (16.5, 16.6).
3. Dashboard scaffolding (tabs, split dropdown, TD table) using existing primitives (16.2).
4. Opening-flow UI and non-funding placement path (amount/term entry, live preview, confirmation, certificate creation, TD-ledger recording, and member progress) is implemented. Real funding remains isolated pending Q1.

**Waits on bookkeeper (Section 13, Q1–Q9):** actual fund movement (Section 5 Step 9), settlement/rollover logic (Section 6), and anything that writes a real ledger entry. These stay isolated behind the RPC boundary decided in 16.3/16.4 so they can be filled in without restructuring the rest of the feature once policy is confirmed.