# Transaction Receipts — Plan

Status: **Design approved 2026-10-11. Steps 0–5 and 6a (CBU deposits) done (§12.1–§12.2g). Paused 2026-10-11 at the user's request. Next when resumed: Step 6b — savings first, then membership fees, CBU payouts, ISC, grocery; then Step 7.**

---

## Principles

- **Receipts prove money that actually moved.** A receipt is issued only when the transaction is complete (posted / validated / released). Approval is not payment: an approved loan that hasn't been released gets no receipt.
- **The financial tables stay the source of truth.** A receipt is a frozen copy of a completed transaction, not a new financial record. It never changes balances.
- **One receipt per transaction.** Enforced by the database, so retries, double clicks and two people approving at once can't create duplicates.
- **Receipts never change after they're issued.** A later change to a fee policy, a member's name, or a reference string doesn't rewrite an old receipt.
- **Not a BIR Official Receipt.** Every receipt says: *"System-generated transaction receipt. This is not a BIR Official Receipt."* (confirmed 2026-10-11)
- **Only transactions done through the system.** No receipts for legacy or imported data: the 743 reconstructed loans, `loan_payments_legacy`, imported CBU rows. (confirmed 2026-10-11)
- **Opening a receipt only reads data.** Viewing, downloading or printing never calls a write endpoint and never creates a transaction.

---

## 1. Which transactions get a receipt, and when

| Transaction | Receipt is issued when | Source row |
|---|---|---|
| Loan payment | Bookkeeper validates it (`loan_payments.confirmation_status = 'validated'`). **Not** when the cashier records it. (confirmed 2026-10-11) | `loan_payments.id` |
| Loan release / disbursement | Cashier releases the loan (a `disbursement_confirmations` row is saved) | `disbursement_confirmations.id` |
| Savings deposit | Cashier posts it (deposits are validated immediately) | `savings_ledger.id` (credit) |
| Savings withdrawal | Bookkeeper confirms it (queue → `validated`, ledger debit written) | `savings_ledger.id` (debit) |
| CBU deposit | Cashier records it | `capital_build_up.id` (cashier-entered rows only) |
| Membership fee / paid-up capital | Cashier records it as paid | `membership_payments.id` |
| CBU exit payout | Cashier records it | `cbu_payouts.id` |
| ISC dividend | Posting is settled (capitalised or paid in cash) | ISC settlement row |
| Grocery (POS) | POS sends a `Completed` transaction ("On Credit" left out for now) | `GROCERY_TRANSACTIONS` row |

**No receipt:** loan application, approval or rejection (status changes only); restructure / reschedule (no money moves); pending or rejected payments and withdrawals; Treasurer vault and payroll entries (internal, no member).

CBU rows the system creates as a side effect (a loan's CBU deduction, ISC capitalisation, a termination offset) are shown as a line on the parent receipt, not as their own receipt.

---

## 2. Who can see receipts

| Role | Access |
|---|---|
| **Member** | Their own receipts only. Identity comes from the login token, never from the URL or request. Asking for someone else's receipt returns **404**, so a member can't even learn that it exists. |
| **Cashier** | **Only the pop-up** right after the cashier completes a transaction (see §5). No reprinting later and no access to receipts for payments or withdrawals validated afterwards — the member gets those from the member portal. (confirmed 2026-10-11) |
| **Bookkeeper** | All receipts, read-only |
| **Manager** | All receipts, read-only |
| **Treasurer** | All receipts, read-only |
| **BOD** | All receipts, read-only |
| **Secretary** | None |

No new role is added. There is no Auditor or Administrator role; the account-admin BOD is a normal BOD for receipts. (confirmed 2026-10-11)

All checks run in one backend helper, `_authorize_receipt(current_user, receipt)`. Hiding buttons in the frontend is not the protection.

---

## 3. Member portal

Flow:

```
Dashboard → "Recent Transaction" (header link or a row)
   → Statement of Account → Transactions tab (table)
      → click a transaction → receipt opens → Download Receipt / Print / Close
```

### 3.1 Dashboard — Recent Transaction (`Member/Components/Member_Dashboard.jsx`)

- Keep the current table look.
- The header gets a **"View all →"** link to `/member-statement-of-account?tab=transactions`.
- Clicking a row goes to the same tab **with that row's receipt already open** (`?tab=transactions&receipt=<receipt_no>`). Closing the receipt leaves the member on the Transactions tab. A pending or rejected row opens the tab with that row's status note instead. (confirmed 2026-10-11)
- The rows come only from real transactions:
  - remove the made-up "Share Capital Contribution" row (it shows the total CBU balance, not a transaction);
  - no more rows with random IDs (`Math.random()` fallback);
  - pending and rejected items are no longer shown as if they were paid.
- The three copies of the row-building code (lines ~311, ~508, ~637) are replaced by one call to the new endpoint (§6).

### 3.2 New "Transactions" tab in Statement of Account (`Member/Components/Member_StatementOfAccount.jsx`)

- No new sidebar or mobile-nav item. Transactions is a **new tab beside Savings**: **Loan · Savings · Transactions · Capital Build-Up**. (confirmed 2026-10-11)
- The tab can be opened directly by URL (`?tab=transactions`, optional `&receipt=`), so the dashboard can link to it.
- Table: **Date · Description · Category · Status · Amount**.
- Search by reference number. Filters: type, date range, status. Pages of 10 (`components/Pagination.jsx`).
- Works on phone (card list, like the dashboard's mobile view) and PC (table).
- What a row does:
  - **Completed:** opens the receipt.
  - **Pending:** status chip + "Awaiting Bookkeeper validation — your receipt will be available once it's posted." No receipt.
  - **Rejected:** status chip + "Not posted." No receipt.
- Status chips use the existing `utils/transactionStatus.js` vocabulary.
- States: loading skeleton (`components/Skeleton.jsx`), empty, error with retry.

### 3.3 Not changed

- The existing Loan, Savings and Capital Build-Up tabs are not changed (no receipt icons on their rows).
- Member Profile is not touched.

### 3.4 Grocery

Members can see receipts for **completed** grocery purchases on the Transactions tab. "On Credit" purchases are left out for now (no receipt, no special handling). (confirmed 2026-10-11) The member-portal grocery view itself isn't built yet; receipts don't depend on it.

---

## 4. Staff portals — Bookkeeper, Manager, Treasurer, BOD

- **Receipts lookup page** in each of these portals: the same table and filters as the member page, plus filters for member name and membership ID.
- **Audit log:** a **"View receipt"** button on transaction entries in `components/AuditLogViewer.jsx` (entity types `payment`, `disbursement`, `cbu`, `savings`, `membership_payment`, `grocery`). It looks the receipt up by the audit row's `entity_id`. Non-BOD staff still only see their own audit entries, as today.
- Read-only everywhere. Staff can't edit or reissue a receipt.

---

## 5. Cashier — receipt pops up on completion

When the cashier finishes a transaction, its receipt opens right away in the shared receipt viewer, with Download Receipt and Print. The pop-up shows the receipt that was saved with the transaction, so it is the same document the member and other staff see later.

| Cashier action | Endpoint | Pop-up |
|---|---|---|
| Loan release / disbursement | `POST /api/cashier/disbursements/{loan_id}/disburse` | **Yes.** Principal, each deduction, net proceeds. Replaces the "coming soon" button in `Cashier_Disbursement.jsx` (~line 650). |
| Savings deposit | `POST …/savings/accounts/{id}/deposit` | **Yes** |
| CBU deposit | `POST /api/cashier/cbu/deposits` | **Yes** |
| Membership fee payment | `POST /api/cashier/membership-payments` | **Yes** |
| CBU exit payout | `POST /api/cashier/cbu-payouts` | **Yes.** The current print-only receipt (`printReceipt` in `Cashier_CBU_Exit_Payout.jsx`) moves into the shared viewer. |
| Loan payment | `POST /api/cashier/loan-payments` | **No.** Still waiting for Bookkeeper validation. The current "Payment collected — pending Bookkeeper confirmation" panel in `Cashier_Payments.jsx` stays. |
| Savings withdrawal | `POST …/withdraw` | **No.** Still waiting for Bookkeeper confirmation. |

Each of these endpoints returns the new `receipt_no` in its response; the page then fetches the receipt through the normal receipt endpoint.

**After the pop-up is closed, the cashier can't reopen it.** A member who needs a copy gets it from their own portal (Statement of Account → Transactions tab). The same goes for loan payments and withdrawals the Bookkeeper validates later. (confirmed 2026-10-11)

The backend enforces this: the cashier can fetch a receipt only for the transaction they just completed (the receipt's `issued_by` is the cashier's own login, within a short window after issue), and gets no lookup list.

The other "Print receipt — coming soon" placeholders (`Savings_Details.jsx` lines ~204/430/515, `Bookkeeper/Components/Savings-Transactions.jsx` ~308) are **not** turned into reprint buttons. They stay as they are; removing them is a separate cleanup decision.

---

## 6. Architecture

### 6.1 `receipts` table (new)

| Column | Purpose |
|---|---|
| `id` | uuid |
| `receipt_no` | `TTMPC-TR-<year>-<6 digits>`, from a per-year sequence. Unique. |
| `source_type`, `source_id` | Which transaction this is for. **`UNIQUE (source_type, source_id)`** — one receipt per transaction. |
| `member_id` | Owner. Nullable for applicants who pay membership fees before getting a member record (then `application_id` is used). |
| `application_id` | For membership-fee receipts before membership. |
| `amount` | Main amount, for listing and filtering. |
| `snapshot` | jsonb: every field printed on the receipt, frozen at issue time. |
| `snapshot_hash` | sha256 of `snapshot`, to detect tampering. |
| `issued_at`, `issued_by` | When and by whom (actor from the login token, not the request body). |

RLS on, **no client policies**: all reads go through FastAPI (the same pattern as `cbu_payouts` and `loan_renewal_override_requests`). No client can insert or edit a receipt.

### 6.2 How receipts are created — database triggers

A trigger on each source table issues the receipt **inside the same database transaction** as the posting:

- `loan_payments`: `confirmation_status` changes to `validated`
- `disbursement_confirmations`: insert
- `savings_ledger`: insert
- `capital_build_up`: insert of a cashier-entered row
- `membership_payments`: changes to paid
- `cbu_payouts`: insert
- ISC settlement
- `GROCERY_TRANSACTIONS`: completed

Why triggers:
- **Same transaction as the posting.** The receipt is written while the payment or release is saved.
- **A receipt failure never blocks a posting** (changed in Step 1, see §12.2): if building the receipt fails, the error is saved in `receipt_issue_errors` and `receipts_backfill()` issues it later. The payment approval endpoint swallows update errors and retries with another status, so a trigger that raised would leave a half-posted payment.
- They catch writes from FastAPI **and** direct Supabase writes from the browser (the app does both).
- Each insert uses `ON CONFLICT (source_type, source_id) DO NOTHING`, so a retried request or two approvals at once still give one receipt.

Building the snapshot treats optional fields carefully (missing value → shown as "—"), so a missing detail never blocks a real posting.

**Catch-up function** `receipts_backfill()`: issues receipts for past transactions that were done through the system (skips legacy and imported data). Safe to run more than once. Also a safety net if a trigger was ever disabled.

### 6.3 Endpoints (FastAPI, new "Receipts" section in `main.py`)

All require a login (`_get_current_user`, not the optional version) and go through `_authorize_receipt`.

| Endpoint | Use |
|---|---|
| `GET /api/member/transactions` | Member's own transaction feed (completed + pending + rejected) with `receipt_no` where one exists. Used by the dashboard (limit 6) and the Transactions tab. |
| `GET /api/receipts` | Staff lookup list: search, filters, paging. |
| `GET /api/receipts/{receipt_no}` | One receipt. |
| `GET /api/receipts/by-source/{source_type}/{source_id}` | Receipt for a transaction (audit log, cashier pop-up). |

Why not read the tables directly from the browser: in the repo SQL, `loan_payments` and `savings_ledger` let **any** logged-in user read every row (`USING (true)`), and the SOA view inherits that. Receipts must not depend on those policies.

### 6.4 Frontend (new, shared)

- `src/components/Receipt/ReceiptModal.jsx`: the viewer (modal on PC, full-screen sheet on phone).
- `src/components/Receipt/ReceiptDocument.jsx`: the receipt layout, used by the viewer.
- `src/utils/receiptPdf.js`: draws the same snapshot with jsPDF (already installed). File name `Receipt-<receipt_no>.pdf`.
- Print: opens the generated PDF and calls the browser's print.

### 6.5 Format — phone and PC

- **On screen:** a card about 420px wide, centered on PC, full width on phone.
- **PDF:** **A5 portrait, one page.** Readable on a phone; prints on A5 or centered on A4.
- The viewer, the PDF and the printout all read the same snapshot, so they always match.

---

## 7. Receipt layout (draft — needs approval)

Inspired by GoTyme (grouped cards, large centered amount), Maya (fields that change by transaction type, honest status) and GCash (reference and date together). Original TTMPC design in the member-portal green; no other provider's branding.

1. **Header:** TTMPC logo, cooperative name and address, "Transaction Receipt".
2. **Hero:** check mark + "Completed", the large signed amount, the type (e.g. "Loan Payment · Consolidated").
3. **Member card:** name, membership ID, account (loan control number or savings account number).
4. **Breakdown card** (depends on type):

| Type | Fields |
|---|---|
| Loan payment | Amount paid, applied to penalty / arrears / current / credit, remaining balance |
| Loan release | Principal, service fee, CBU deduction, insurance, notarial fee, previous loan balance deducted (renewals), **net proceeds**, first due date |
| Savings deposit / withdrawal | Amount, balance after |
| CBU deposit | Amount added, share capital after |
| Membership fee | Fee type, amount, payment method |
| CBU exit payout | Amount paid out, amount still owed |
| ISC | Basis period, amount, capitalised or cash |
| Grocery | Amount, items/event reference, date |

5. **Reference card:** receipt number, transaction reference, date and time (Asia/Manila), processed by, validated by and when (if any).
6. **Footer:** *"System-generated transaction receipt. This is not a BIR Official Receipt."*

---

## 8. Corrections and reversals

- The system has no general reversal for payments, savings or disbursements today. Rejection only happens **before** validation, so a rejected transaction never had a receipt.
- If a reversal feature is added later: issue a separate **void** document that points to the original receipt. The original is never edited or deleted; it shows a "Voided" stamp.
- Reference strings have been renamed in the past (`loan_payment_reference_remap`), so receipts link to row IDs, and the snapshot keeps the reference as it was when issued.

---

## 9. Audit trail

- Widen the `audit_log` CHECK constraints to allow entity type `receipt` (actions `issue`, `reprint`).
- Log when staff view or download **another member's** receipt. Don't log members viewing their own (too noisy).
- `audit_log` stays a log: it doesn't store PDFs or receipt contents.

---

## 10. Risks to handle during the build

1. **Open read policies** on `loan_payments` / `savings_ledger` (repo SQL). Receipts avoid them; tightening them is a separate decision. Verify the live policies first.
2. **Actor IDs from the request body** on disburse and payment approval. The receipt's "processed by" / "validated by" must come from the login token.
3. **Old loans with no fee snapshot** fall back to the live fee policy. Only matters for the catch-up; affected receipts get a note.
4. **Payment approval isn't atomic** (read, then update). The unique constraint protects the receipt, not the money allocation.
5. **Applicants without a member record** pay membership fees: ownership goes through `application_id` until they become members.
6. **Telling system CBU rows from imported ones** for the catch-up: rule to be confirmed against the data before running it.

---

## 11. SQL (new files, apply in order)

1. `src/server/receipts_01_schema.sql`: `receipts` table, per-year counter `receipt_counters` + `receipt_next_no()`, no-edit/no-delete trigger, RLS lock-down, `receipt_issue_errors`, release breakdown columns on `disbursement_confirmations`. **(written, Step 1)**
2. `src/server/receipts_02_triggers.sql`: `receipt_issue()` + snapshot builders and triggers for loan payments and loan releases. **(written, Step 1)** Later steps add the other source tables.
3. `src/server/receipts_03_backfill.sql`: `receipts_backfill()` for loan payments and releases. **(written, Step 1)**
4. `src/server/receipts_04_cbu.sql`: CBU deposit receipts. **(written, Step 6a)**
5. `src/server/receipts_05_audit.sql`: widen `audit_log` constraints. (Step 7)

Checks (read-only) live in `src/server/receipt_checks/`: `00_step0_checks.sql`, `01_step1_verify.sql`.

---

## 12. Build order

| Step | Work | Needs |
|---|---|---|
| 0 | Answers to §14, approved design, read-only check of live RLS | — |
| 1 | `receipts` table + triggers for loan payments and disbursements | 0 |
| 2 | Receipt endpoints + `_authorize_receipt` | 1 |
| 3 | Shared viewer, jsPDF renderer, print | 2, approved design |
| 4 | Cashier pop-ups (release first) | 3 |
| 5 | Member: `GET /api/member/transactions`, dashboard changes, Transactions tab in Statement of Account | 2, 3 |
| 6 | Triggers for savings, CBU, membership, payouts, ISC, grocery; run catch-up | 1 |
| 7 | Staff Receipts lookup page + audit log button + receipt audit events | 3 |
| 8 | Testing (§13) | all |

The first slice is **loan payments and loan releases only**, end to end. The other transaction types (step 6) follow the same pattern once that works.

### 12.1 Step 0 — Check the live database (read-only)

Nothing is changed. The repo's `schema_dump.json` is old, so the live database is checked before writing any SQL:

- **Read policies** on `loan_payments` and `savings_ledger` (`pg_policies`): are they still `USING (true)`, so any logged-in user can read every row?
- **Real columns** of `loan_payments`, `disbursement_confirmations` and `loans` (`information_schema.columns`), including the allocation columns (`applied_to_*`) and the fee snapshot columns (`service_fee`, `cbu_deduction`, `insurance_fee`, `notarial_fee`, `net_proceeds`).
- **System vs imported data**: how to recognise legacy rows so the catch-up skips them (for loans, anything with history in `loan_payments_legacy`).

How it runs: **the user runs all SQL in the Supabase SQL Editor** (confirmed 2026-10-11). Claude writes the SQL; the user pastes back the results.

**Status: DONE 2026-10-11.**

**Part 1 — found 2026-10-11** (two read-only queries, policies and columns, run before the "user runs SQL" decision; nothing changed):

| Finding | Effect on the receipt build |
|---|---|
| `loan_payments`, `savings_ledger`, `savings_transaction_queue` and `membership_payments` all have a SELECT policy `USING (true)` for any logged-in user — **confirmed live**. | Receipts and the member transaction feed must come from FastAPI, never from direct table reads. (Tightening these policies is a separate decision, not part of this build.) |
| `loans` and `capital_build_up`: members read only their own rows; staff read all. | OK as is. |
| `disbursement_confirmations`: staff only (Treasurer, Cashier, Bookkeeper, Manager, BOD); members can't read it. | Members see release details only through their receipt. |
| `loan_payments` has `applied_to_penalty/arrears/current/credit`, `validated_by`, `reviewed_by`, `entered_by`, `payment_reference`. | Payment receipt can show the allocation and who validated it. |
| `disbursement_confirmations` stores only `loan_amount` (principal), not fees. | The release receipt reads the fee breakdown from `loans` (`service_fee`, `cbu_deduction`, `insurance_fee`, `notarial_fee`, `net_proceeds`) when the receipt is created, and freezes it. |
| No column stores a renewal's **previous loan balance** (the loan forms compute `existingBalance` but don't save it as a column). | Check 09/10 below. If it isn't stored, the release receipt shows the gap between principal − fees and net proceeds as "Other deductions". |
| `member` has `membership_id`, `first_name`, `middle_initial`, `last_name`; `member_account.user_id` = `member.id`. | Member name and ID for the snapshot. |

**Part 2 — results 2026-10-11** (`src/server/receipt_checks/00_step0_checks.sql`, run by the user):

| # | Result | What it means for the build |
|---|---|---|
| 01–02 | 23 loan payments: 13 `validated`, 10 `pending_bookkeeper`; all entered by the cashier | 13 payments get a receipt in the catch-up; the 10 pending get one when validated |
| 03 | 0 validated payments on loans with legacy history | No legacy conflict in today's data |
| 04 | **All 13 validated payments have no `validated_by` / `reviewed_by`** | The Bookkeeper page sends a login token but not `validated_by`, so the validator was never recorded. **Fix in Step 1:** the approve endpoint stamps the validator from the login token. Receipts for the 13 existing payments show "Bookkeeper" with no name |
| 05 | All validated payments have the allocation (`applied_to_*`) | Breakdown is available |
| 06–07 | Only **7** `disbursement_confirmations` rows; 164 non-legacy released/paid loans have none | Those 164 were released before the confirmation table existed (or imported), so they get **no** release receipt — only releases done through the system's cashier release step do |
| 08–10 | **All 7 confirmed releases have no fee snapshot / `net_proceeds` on `loans`**, and the renewal's old balance isn't stored anywhere | `loans` can't be the source for the release breakdown. **Fix in Step 1:** the disburse endpoint already computes the breakdown (`_compute_net_cash_out`: fees, renewal payoff, net cash out) — it now saves it on the `disbursement_confirmations` row (new columns), and the receipt freezes it from there. The 7 existing releases get a receipt showing the principal only, marked "Breakdown not recorded" |
| 11 | Existing triggers: audit + realtime on both tables; `trg_normalize_loan_payment_workflow` and `trg_sync_loan_payment_to_ledger` on `loan_payments` | New receipt triggers get distinct names (`trg_receipt_*`) and run AFTER, so they don't interfere |
| 12 | No `receipts` table yet | Clean start |
| 13 | `pgcrypto` 1.3 installed | Snapshot hash can use `digest()` |
| 14 | Roles: bod, bookkeeper, cashier, manager, secretary, treasurer (one each), 290 members | Matches the access matrix (§2) |

**Interpretation (check 03 shows it doesn't affect any current data):** "no receipts for legacy loans" is read as *no receipts for imported history* (`loan_payments_legacy`, imported rows). A payment the cashier records **through the system** today on an older loan **does** get a receipt, because it was done through the system.

### 12.2 Step 1 — `receipts` table and the first triggers

Two new files in `src/server/`, applied in Supabase like the other migrations:

**`receipts_01_schema.sql`**
- The `receipts` table (§6.1).
- `UNIQUE (source_type, source_id)`: one receipt per transaction, enforced by the database.
- A per-year counter for receipt numbers (`TTMPC-TR-2026-000001`).
- RLS on with no client policies: only the backend (service role) can read receipts, and nobody can edit them.

**`receipts_02_triggers.sql`**
- **Loan payment validated** (`loan_payments.confirmation_status` changes to `validated`): creates the receipt with a frozen copy of the payment: amount, how it was applied (penalty / arrears / current / credit), remaining balance, cashier, bookkeeper, times.
- **Loan released** (insert into `disbursement_confirmations`): creates the receipt with principal, each deduction and net proceeds.
- The receipt is written in the same database transaction as the payment or release, so one can't exist without the other.
- `ON CONFLICT DO NOTHING`, so repeating the action never creates a second receipt.

**How to test Step 1**
- Validate one test payment and release one test loan in the app.
- Check that exactly one receipt row appears for each.
- Repeat the action: still one receipt each.

**Status: DONE 2026-10-11.** SQL applied; catch-up issued 13 loan payment + 7 loan release receipts (0 failed). Live test passed: one payment validated by the Bookkeeper and one loan released by the Cashier each produced exactly one receipt automatically.

**Verification (`receipt_checks/01_step1_verify.sql`, 2026-10-11):** 14 loan payment + 8 loan release receipts; 0 validated payments without a receipt; 0 pending/rejected with a receipt; 0 releases without a receipt; 0 duplicate numbers; 0 without an owner; 0 hash mismatches; no issue errors; counter 2026 → 22. Newest release receipt `TTMPC-TR-2026-000021` (Lorelie M. Rios, ₱48,732.50) has its breakdown recorded.

**As built — differences from the plan above:**
- **A receipt failure never blocks the posting.** Instead of "both saved or neither", a failed receipt is logged in `receipt_issue_errors` and issued later by `receipts_backfill()`. Reason: `approve_bookkeeper_payment` swallows update errors and retries with a different status, so a raising trigger would leave a half-posted payment.
- **`main.py` changes (two, small):**
  - `approve_bookkeeper_payment`: the validator (`validated_by` / `reviewed_by` / `confirmed_by`) now comes from the login token, so receipts can name the Bookkeeper (Step 0 check 04).
  - `disburse_cashier_loan`: saves the release breakdown it already computes (`_compute_net_cash_out`: principal, each fee, renewal payoff, net proceeds, term, amortization, releasing cashier) on the `disbursement_confirmations` row (Step 0 checks 08–10). If the new columns aren't there yet, it saves the row without them, as before.
- Receipts also accept `confirmed` / `bookkeeper_confirmed` / `approved` as "validated" (the approve endpoint falls back to `confirmed`).
- Receipt number year uses Philippine time (Asia/Manila).
- The 13 existing validated payments get receipts with "Bookkeeper" (no name); the 7 existing releases get receipts showing the principal only (`breakdown.recorded = false`).

**To apply (user), in order:**
1. `src/server/receipts_01_schema.sql`
2. `src/server/receipts_02_triggers.sql`
3. `src/server/receipts_03_backfill.sql`
4. `SELECT * FROM public.receipts_backfill();` — expected about 13 loan payments + 7 releases issued, 0 failed. **Done: 13 + 7 issued, 0 failed.**
5. Restart the FastAPI backend (the `main.py` changes).
6. In the app: validate one pending payment (Bookkeeper) and release one loan (Cashier).
7. `src/server/receipt_checks/01_step1_verify.sql` and paste the result back.

### 12.2b Step 2 — Receipt endpoints

**Status: DONE 2026-10-11.** Live test passed: as staff, the list returned `200` with `total: 22` and receipt `TTMPC-TR-2026-000021` returned `200`; as an ordinary member (not the owner), the list returned `403` and the same receipt returned `404 Receipt not found`.

**As built** (new "Receipts" section at the end of `src/server/main.py`):

| Endpoint | Who | Notes |
|---|---|---|
| `GET /api/receipts/{receipt_no}` | owner, BOD, Bookkeeper, Manager, Treasurer; Cashier only for a receipt they issued in the last 15 minutes | 404 for anyone else (doesn't reveal that it exists) |
| `GET /api/receipts/by-source/{source_type}/{source_id}` | same | For the audit log link and the cashier pop-up |
| `GET /api/receipts` | BOD, Bookkeeper, Manager, Treasurer only (403 otherwise) | Staff lookup: `search` (receipt no.), `source_type`, `member` (name or membership ID), `date_from`, `date_to`, `page`, `page_size` ≤ 50, newest first |

- All three require a login (`_get_current_user`); the caller's role and member record come from `member_account` via the verified token (`_receipt_caller`), never from the request.
- The access rule lives in one function, `_authorize_receipt`. "Owner" is checked first, so staff always see their own receipts as members too.
- Cashier rule: `receipts.issued_by` must be the cashier's own login and the receipt must be under 15 minutes old (`_RECEIPT_CASHIER_WINDOW`). For a loan release, `issued_by` is the releasing cashier (`released_by_auth_id`).
- Members don't use the list endpoint; their list comes with Step 5 (`GET /api/member/transactions`).
- Also added `import re` and `timezone` to the top-level imports of `main.py`.

**Tested 2026-10-11 (offline, no database):** `_authorize_receipt` against 12 cases — owner, other member, member with no record, BOD, Bookkeeper, Manager, Treasurer, Secretary, cashier fresh / 30 min old / not the issuer, cashier who owns the receipt as a member — all as expected.

**Live test (user):** restart the backend, log in, open the browser console (F12) and run:

```js
const { supabase } = await import('/src/supabaseClient.js');
const token = (await supabase.auth.getSession()).data.session.access_token;
const get = async (p) => { const r = await fetch('http://127.0.0.1:8000' + p, { headers: { Authorization: 'Bearer ' + token } }); return [r.status, await r.json()]; };
console.log(await get('/api/receipts?page_size=3'));
console.log(await get('/api/receipts/TTMPC-TR-2026-000021'));
```

| Logged in as | Expected |
|---|---|
| BOD or Bookkeeper | list: `200`, `total: 22`; receipt 000021: `200` (Lorelie M. Rios, ₱48,732.50) |
| Secretary | list: `403`; receipt 000021: `404` |
| A member who is not Lorelie Rios | list: `403`; receipt 000021: `404` |

### 12.2c Step 3 — Receipt viewer, PDF and print

**Status: DONE 2026-10-11** (viewer confirmed in the Step 4 live test; Download Receipt / Print not separately reported yet).

**As built** — new folder `src/components/Receipt/`:

| File | What it does |
|---|---|
| `receiptView.js` | Turns a receipt's snapshot into the rows shown (title, amount, groups of label/value rows) for loan payments and loan releases, plus a plain fallback for types added later. **Both the viewer and the PDF read this**, so they always show the same fields. Times shown in Philippine time; plain dates as-is. |
| `ReceiptDocument.jsx` | The receipt as approved in the mockup: logo, cooperative name and address, ✓ Completed, big amount, Member / Breakdown / Reference cards, disclaimer. Stays light in dark mode (it's a document, like the PDF). |
| `receiptPdf.js` | A5 portrait PDF with jsPDF (already installed): `downloadReceiptPdf()` saves `Receipt-<receipt no>.pdf`; `printReceiptPdf()` opens it in a new tab with the print dialog. Uses "PHP" instead of "₱" (the PDF's built-in fonts have no peso sign). |
| `ReceiptModal.jsx` | Loads a receipt by number or by source (read-only), shows it full-screen on a phone and as a centred modal on PC, with Download Receipt / Print, a loading state, and "Try again" on error. Escape or ✕ closes it. Optional notice line (used by the cashier). |

- **Logo and address resolved:** uses the logo already in the app (`public/img/ttmpc logo.png`) and the address from the landing page ("Tubungan, Iloilo, Philippines"). No contact number is shown (none in the app).
- **Checked:** ESLint clean on the new files; production build passes; the formatter run on a sample release receipt gave the expected rows (02:00 UTC → "10:00 AM" Philippine time; old releases show "Deductions: Not recorded for this release").

### 12.2d Step 4 — Cashier pop-up after a loan release

**Status: DONE 2026-10-11.** Live test passed: releasing a loan as the Cashier popped up its receipt.

**As built:**
- `main.py` `disburse_cashier_loan`: after saving the confirmation, reads the receipt the trigger just issued and returns it as `data.receipt_no`.
- `Cashier/Components/Cashier_Disbursement.jsx`: when `receipt_no` comes back, opens `ReceiptModal` titled "Loan released" with the notice *"Print or download now. After you close this, the receipt stays available to the member in their portal."* The old "Disbursement Successful" panel (with the "Print Voucher · Soon" button) is now only a fallback when no receipt number comes back.
- The release request now also sends the cashier's login token (`authHeaders()`), so the audit trail has the real actor.
- The cashier can open the receipt because they issued it (`issued_by` = their login) and it is under 15 minutes old (Step 2 rule).
- (Unchanged and not mine: ESLint reports an unused `navigate` at line 64 of `Cashier_Disbursement.jsx`, which was already there.)

**Live test (user):** restart the backend and refresh the app; as the Cashier, release a loan that is "Ready for Disbursement". Expected: the receipt pops up with the full breakdown and net proceeds; Download Receipt saves `Receipt-TTMPC-TR-2026-0000xx.pdf` (A5); Print opens the print dialog; ✕ closes it.

### 12.2e Step 5 — Member: Transactions tab + Recent Transaction

**Status: DONE 2026-10-11.** Live test: as a member, a CBU deposit receipt (Romelyn I. Delos Reyes I, TTMPC-270, ₱5,000, Paid by Cash) opened from the portal with Download Receipt / Print.

**As built:**
- **Backend** `GET /api/member/transactions` (end of `main.py`, after the receipt endpoints): the logged-in member's own transactions, picked on the server from the login token (never from the browser). Filters `search` (receipt no., reference, description), `type` (`loan` / `savings`), `status` (`completed` / `pending` / `rejected`), `date_from` / `date_to` (Philippine dates), `page`, `page_size` ≤ 50. Each row carries its status and, when completed, its `receipt_no`.
  - Sources today: **loan payments** (pending / completed / rejected), **loan releases** (`disbursement_confirmations`), **savings** deposits and withdrawals (`savings_transaction_queue`).
  - CBU deposits, membership fees, grocery and ISC join in Step 6, together with their receipts. Completed savings rows show "Receipt not available yet" until then.
  - `_receipt_caller` now also returns the member's `membership_id` (savings rows use it).
- **Statement of Account** (`Member_StatementOfAccount.jsx`): new **Transactions** tab between Savings and Capital Build-Up. `?tab=transactions` opens it; `&receipt=<no>` opens that receipt; `&open=<row id>` opens a pending/rejected row's note. The extra parameters are removed from the address bar after reading, so a refresh doesn't reopen the receipt.
- **New** `Member/Components/MemberTransactionsTab.jsx`: search, type, status and date filters; table on PC, cards on a phone; pages of 10; status chips. Completed → opens the receipt (`ReceiptModal`); pending → "Waiting for validation"; rejected → "This transaction was not posted". Refreshes on realtime loan/savings changes.
- **Dashboard** (`Member_Dashboard.jsx`): Recent Transaction now reads the same feed (latest 6); **"View all ›"** link to the tab; clicking a row opens the tab with that row's receipt (or note) already open; pending/rejected rows carry a small status label.
  - Removed the three duplicated row builders, the made-up "Share Capital Contribution" balance row, and the two Supabase queries that only fed them (savings queue, loan payments).
- **Checked:** production build passes; `main.py` compiles; ESLint reports no new problems (the dashboard's 8 and Statement of Account's 2 existing warnings were already there); date helper gives Philippine dates (20:30 UTC Sep 30 → Oct 1).

**Live test (user):** restart the backend, refresh the app, log in as a member who has loan payments or a release (e.g. Lorelie Rios):
1. Dashboard → Recent Transaction shows real rows; pending ones are labelled.
2. Click a completed loan payment or release → Statement of Account opens on **Transactions** with that receipt already open.
3. **View all ›** → the Transactions tab; try the filters and search.
4. Click a pending row → "Waiting for validation" note.

### 12.2f Change 2026-10-11 — on-screen receipt header removed

At the user's request the on-screen receipt (`ReceiptDocument.jsx`) no longer shows the logo, cooperative name or address; it starts at ✓ Completed and the amount. **The PDF keeps the full header** (logo, name, address).

### 12.2g Step 6a — CBU deposit receipts

**Status: DONE 2026-10-11.** SQL applied; catch-up issued 11 CBU receipts (0 failed). Live test: a new cashier deposit popped up its receipt for the cashier and got `TTMPC-TR-2026-000036` (Nash E. Siaton, ₱10,000, share capital after ₱25,000, received by MA. FE T. TACADAO) automatically.

**Verification (`receipt_checks/03_step6_cbu_verify.sql`):** 26 deposits match the rule; 12 have receipts; 0 system-recorded deposits without a receipt; 0 receipts on non-deposit rows; no errors. Receipts now: cbu 12, loan_payment 14, loan_release 10. **14 deposits dated 2026-05-09 to 2026-07-01 have no audit entry and were skipped** — decided 2026-10-11: they stay without receipts (only new deposits get one).

Why CBU deposits had no receipt: Step 1 only added triggers for loan payments and loan releases; CBU was planned for Step 6.

**Check results** (`receipt_checks/02_step6_cbu_checks.sql`, 2026-10-11): 1,789 CBU rows — `historical_yearly_2019_2026` 1,745, `Cash` 25, `LOAN_CBU_RETENTION` 12, `INITIAL_PAID_UP_CAPITAL` 4, `Initial Paid-Up Capital` 2, `TERMINATION_PAYOUT` 1. Audit roles: 1,678 rows have no audit entry, 93 bookkeeper, 16 service_role, only 2 cashier — so **the audit log can't identify cashier deposits**. Of the 25 `Cash` rows, 14 have no audit entry.

**Rule used instead** (`receipt_is_cbu_deposit()`): `deposit_account` is one of the Cashier form's "Paid by" options (Cash / Check / GCash / Bank Transfer — every system writer uses its own code), no source key (`source_loan_id`, `source_payment_id`, `source_isc_id`, `source_backfill_id`), `capital_added > 0`.

**As built:**
- `src/server/receipts_04_cbu.sql`: `capital_build_up.recorded_by` column; `receipt_is_cbu_deposit()`; `receipt_issue_cbu()` (snapshot: amount added, share capital before/after, CBU deposit ID, paid by, date received, received by); AFTER INSERT trigger `trg_receipt_capital_build_up`; catch-up `receipts_backfill_cbu()`.
- **Catch-up is conservative:** a past deposit gets a receipt only if the audit log shows it was recorded through the system; deposits with no audit entry (possibly imported) are skipped and counted by the verify check. Catch-up receipts carry the audit time as their issue time.
- `main.py` `POST /api/cashier/cbu/deposits`: saves `recorded_by` from the login (falls back without it before the SQL is applied); returns `receipt_no`.
- `main.py` `GET /api/member/transactions`: CBU deposits (same rule) join the feed as category `cbu`.
- Frontend: `receiptView.js` CBU layout; `Cashier_CBU_Deposit.jsx` pops up the receipt after a deposit; member Transactions tab gets a "Capital Build-Up" type filter and refreshes on CBU changes.
- Checked: `main.py` compiles; production build passes; no new ESLint problems (`totalShares` unused in `Cashier_CBU_Deposit.jsx` was already there).

**To apply (user):**
1. `src/server/receipts_04_cbu.sql`
2. `SELECT * FROM public.receipts_backfill_cbu();`
3. Restart the backend, refresh the app.
4. As the Cashier: record a CBU deposit → the receipt pops up.
5. `src/server/receipt_checks/03_step6_cbu_verify.sql` → paste the result.

### 12.3 After Step 1

| Order | Work | Result you can see |
|---|---|---|
| 2 | Receipt endpoints in `main.py`: a receipt is returned only to its owner (member) or to BOD / Bookkeeper / Manager / Treasurer; the Cashier only for the transaction they just completed | — |
| 3 | Shared receipt viewer + A5 PDF + print, built from the approved mockup | — |
| 4 | Cashier pop-up after a loan release | **First working demo:** release a loan → receipt pops up |
| 5 | Member: Transactions tab in Statement of Account + clickable Recent Transaction rows | Members open their own receipts |
| 6 | Savings, CBU, membership fee, CBU payout, ISC and grocery receipts; run the catch-up | All transaction types covered |
| 7 | Staff Receipts lookup page + "View receipt" in the audit log | Staff access |

### 12.4 Needed before Step 0 starts

- Approval of the receipt design (the mockup), or the changes wanted.
- How Step 0 runs: through the Supabase connection, or SQL pasted into the SQL Editor.

---

## 13. Testing

The repo has no automated tests today.

- **SQL checks** (like `src/server/isc_checks/`): every completed system transaction has exactly one receipt; no receipt for pending or rejected ones; receipt numbers unique; no receipts for legacy rows.
- **Access** (tokens for member A, member B, and each staff role): B can't get A's receipt by number, by source or through the list (404); Secretary gets nothing; Bookkeeper / Manager / Treasurer / BOD see all; Cashier pop-up works only for the transaction they just completed, and the cashier can't fetch any other receipt or a list.
- **Duplicates:** retried requests and two approvals at once give one receipt.
- **Status:** pending → no receipt; validated → receipt; rejected → no receipt.
- **History:** change a fee policy or a member's name after issue → receipt unchanged.
- **UI:** dashboard row → Statement of Account Transactions tab with the clicked row's receipt already open; "View all" opens the tab; PDF downloads with the right name; prints on one A5 page; viewer and PDF show the same fields; opening a receipt makes no write requests; works on phone and PC.
- **Regression:** payments, releases, savings, CBU, membership fees and payouts still post and audit as before.

---

## 14. Open questions

1. **Contact number (optional):** the receipt uses the app's logo and "Tubungan, Iloilo, Philippines". Give a phone number or email if the receipt should show one.

---

## Decisions log

- 2026-10-11 — No BIR Official Receipt for now; generated layout, not a pre-printed form overlay.
- 2026-10-11 — Loan payment receipt only after Bookkeeper validation.
- 2026-10-11 — Must work on phone and PC.
- 2026-10-11 — Receipt access: Member (own), BOD, Bookkeeper, Manager, Treasurer; no new role.
- 2026-10-11 — Cashier added: receipt pops up when the cashier completes a transaction (e.g. loan release).
- 2026-10-11 — Cashier gets the pop-up only: no reprints, no access to receipts validated later. Members get copies from the member portal.
- 2026-10-11 — No receipts for legacy loans or imported data; only transactions done through the system.
- 2026-10-11 — Receipt creation: the most reliable option (same-transaction trigger + catch-up).
- 2026-10-11 — Grocery receipts visible to members (completed purchases only; "On Credit" ignored for now).
- 2026-10-11 — Members reach receipts through Recent Transaction → Statement of Account → new Transactions tab (beside Savings) → click a row. No sidebar item. Existing SOA tabs unchanged.
- 2026-10-11 — Dashboard row click opens the Transactions tab with that row's receipt already open.
- 2026-10-11 — Design mockup requested before coding.
- 2026-10-11 — The 14 CBU deposits with no audit entry (2026-05-09 to 2026-07-01) get no receipt; only deposits recorded through the system from now on (plus the 11 already audited) have receipts.
- 2026-10-11 — Receipt design approved (mockup: https://claude.ai/artifact/VDsoS9QzYKSWqiTXMCzxS1).
- 2026-10-11 — The user runs all SQL in the Supabase SQL Editor; Claude only writes it.
- 2026-10-11 — This file is updated after every finished step.
- 2026-10-11 — The download button is labelled **"Download Receipt"** (not "Download PDF") everywhere; it still saves the A5 PDF `Receipt-<receipt no>.pdf`.
