# Rescheduled Loans Sub-Tab & Vault Wiring — Design & Implementation Plan

**Status:** 🟡 **DESIGN AGREED, NOT YET BUILT (as of 2026-09-23).** No code has
been written. This document is the agreed brief; read §7 (decisions locked) and
§8 (audit findings) before implementing.

> **⚠️ The vault ledger is not currently trustworthy as a decision input.**
> Two independent problems: it never decreases on disbursement (§8.1), and its
> write endpoint has no authentication (§8.2). Any "can we afford this?" check
> built on today's balance is built on a number that only grows and that anyone
> can forge. **Pass 2 is not optional polish** — it is what makes the feature
> mean anything.

**Feature:** A Rescheduled Loans sub-tab in the Treasurer Loan Approval page,
for loans approved but not disbursable due to insufficient vault funds.
**Owner module:** Treasurer — Loan Approval & Vault
**Constraint:** Treasurer-only. Manager, Bookkeeper, and BOD approval flows
must not change.

---

## 1. Purpose

A Manager-approved loan reaches the Treasurer with
`loan_status = 'to be disbursed'`. The Treasurer checks whether the cooperative
actually has the cash to release it. If not, the loan is **rescheduled** —
parked until funds exist.

Today that loan then disappears: the Treasurer queue filters to
`'to be disbursed'` only, so a rescheduled loan is written to the database and
never displayed again. This feature adds the tab where those loans live, and
wires the vault arithmetic that makes the decision honest.

---

## 2. Corrections absorbed during brainstorming

The initial reading of the codebase was wrong in five places. Recorded so they
are not re-litigated:

| Initial claim | Reality |
| --- | --- |
| Vault disconnected from approval | Details page already reads `vault_balance_v`, computes coverage and shortfall (`Treasurer_ApprovalDetails.jsx:115`, `:910`) |
| Need a new "rescheduled" status | `pending rescheduling` already means exactly this; the modal already reads "⚠️ Insufficient Funds" |
| Manual vs. fund-blocked reschedule would collide | They are the same thing. No migration needed |
| Priority-queue endpoint needs building | Already exists, already ranks by TTMPC policy (`main.py:2449`) |
| Deduct gross principal from the vault | **Wrong** — must be net cash out (§4) |

---

## 3. The two-moment vault model

The Treasurer's approval and the Cashier's release are two different events with
two different meanings. Collapsing them is the main modelling error to avoid.

```
TREASURER APPROVES                 CASHIER RELEASES
  = the decision                     = the cash event
        │                                   │
        ▼                                   ▼
  Can we afford it?                  Money leaves the vault
  available = balance                vault_entries insert
            − committed              amount = −net cash out
        │                                   │
        ▼                                   ▼
  enough → "ready for                Vault balance drops
           disbursement"
  short  → Reschedule
```

### 3.1 Why `committed` is mandatory

Checking each loan against the raw balance in isolation allows over-commitment:

```
Vault ₱500,000

Treasurer approves Loan A ₱300,000  → balance still reads ₱500,000
Treasurer approves Loan B ₱300,000  → balance still reads ₱500,000 → "affordable"
        ↓
Both approved. Cashier releases both.
        ↓
₱500,000 − ₱600,000 = −₱100,000   ✗
```

Both looked affordable *individually*. The check must therefore be against
available funds, not the balance:

```sql
committed = SUM(loan_amount) WHERE loan_status = 'ready for disbursement'
available = vault_balance − committed
```

Derived live — no schema change, and it self-corrects when a loan flips to
`released` and drops out of the sum.

---

## 4. The amount is net cash out, not principal

Three different figures exist for a ₱500,000 loan.

**Fee deductions** — already computed by the backend
(`/api/cashier/disbursements/{loan_id}/preview`, `main.py:3965`):

```
principal 500,000
  − service fee        (per fee policy, by loan type)
  − CBU deduction      (principal × cbu_rate)
  − insurance fee      (per ₱1,000)
  − notarial fee
  ──────────────────
  = net_proceeds       ← cash actually handed over
```

**Renewal payoff** — currently computed only in the frontend
(`LOANFORMS/Consolidated_Loan.jsx:503`):

```js
netProceeds = principal − existingBalance − RENEWAL_DEDUCTIONS
```

A ₱500,000 renewal against a ₱300,000 outstanding balance releases roughly
₱200,000. The ₱300,000 is an internal offset that never physically leaves the
vault.

**Consequence:** using gross principal would both over-deduct the vault on every
renewal *and* wrongly reschedule renewals that are perfectly affordable. Both
the affordability check and the deduction must use net cash out.

---

## 5. Net cash out must be computed server-side

This is forced by the schema, not merely preferred.

`loans` has **no** `net_proceeds` column and **no** renewal → superseded-loan
link. Renewal is tracked only as `application_type = 'renewal'`
(`LOANFORMS/loanSubmission.js:201`). There is therefore nothing stored that the
backend could trust; it must compute the figure itself.

This also happens to be what an authoritative backend check requires. The
superseded loan is resolved the way the system already identifies active loans
per `(member_id, loan_type)` — the same approach used by the
`get_active_cashier_loan_ids` RPC and the existing renewal-deduplication logic.

---

## 6. Implementation steps

### Backend

1. Extend `/api/cashier/disbursements/{loan_id}/preview` to subtract the renewal
   payoff, yielding a true `net_cash_out`.
2. Add `GET /api/treasurer/vault/available` returning
   `{balance, committed, available}`.
3. Add Postgres RPC `disburse_loan_with_vault_check()` — lock the loan row,
   re-read the balance, verify funds, insert the `vault_entries` row, flip the
   status. One transaction. Idempotent via the existing partial index on
   `reference_id`, so a double-click cannot double-deduct.
4. Wire the deduction into the Cashier release:
   `amount = −net_cash_out`, `change_type = 'disbursement'`,
   `reference_id = loan id`.

**No migration required.** `change_type = 'disbursement'` and `reference_id`
already exist in `vault_entries_schema.sql`, commented *"system-recorded"* and
*"auto-created from a loan disbursement"*. This finishes plumbing that was
designed and left unconnected.

### Frontend (Treasurer only)

5. Reschedule modal: replace the hardcoded `"Pending Review"` string with real
   available / required / shortfall figures. The vault balance is already in
   scope as `vaultBalance` — the modal simply does not use it.
6. `Treasurer_Approval.jsx`: add two tab pills in the established house style
   (`bg-member-green` when active, `rounded-full text-xs font-bold`, copied from
   the Bookkeeper's Loan-Approval page). Tab 1 renders today's table unchanged.
7. Tab 2 table: same table shell and `bg-primary-deep` header, reusing the
   `Loader2` loading state, `Inbox` empty state and `getLoanTypeStyle` chips,
   plus Shortfall and Rescheduled-date columns.
8. Vault banner on tab 2: Balance / Committed / Available.
9. Action `Review` → existing details page → existing "Approve for Disbursement"
   button.

---

## 7. Decisions locked

- **Historical loans — untouched.** No backfill. Loans already `released` get no
  vault entry; the ledger is correct from go-live forward. If the balance needs
  squaring against physical cash, the Treasurer posts one manual `adjustment`
  row — that is what the enum value exists for. Backfilling was rejected because
  it risked swinging the balance sharply negative.
- **Shortfall — recomputed live**, never persisted. A rescheduled row therefore
  self-heals as soon as the vault refills, with no stale figure and no manual
  re-check.
- **`committed` — derived, not stored.** No reservation rows; the
  `vault_entries` `change_type` enum has no "commitment" value and adding one
  would make `vault_balance_v` show money as gone before it left.
- **Member notification — keep the existing policy.**
  `Treasurer_ApprovalDetails.jsx:620` deliberately states *"'reject' /
  'reschedule' do NOT email the member."* Reversing this is a policy decision,
  not a bug fix; it is out of scope unless explicitly requested.
- **No Treasurer disbursement endpoint.** Action is `Review` handoff only. The
  disburse endpoint is `/api/cashier/...` and gates on
  `"ready for disbursement"`; adding a Treasurer equivalent would arguably
  create a new approval level, which is explicitly forbidden.

---

## 8. Vault audit findings (2026-09-23)

Asked directly whether the Treasurer/vault logic is sound, the answer is **no**.
The data model is good; the wiring and access control are not.

### 8.1 The vault never moves on disbursement

`POST /api/cashier/disbursements/{loan_id}/disburse` contains **zero**
references to `vault`. It writes `loans`, `loan_schedules`,
`disbursement_confirmations`, and `capital_build_up` — never `vault_entries`.

The schema author wrote an auto-sync trigger and commented it out
(`vault_entries_schema.sql:178-201`) with *"leave commented until you want
auto-sync from disbursements."* It was never enabled. The vault is a manual
journal that only changes when a Treasurer types an entry.

**Note:** the commented trigger uses `-1 * disbursed_amount` — gross, not net.
Uncommenting it as-is would over-deduct on every renewal (§4). It fires on
`disbursement_confirmations` rather than at the point of decision, and cannot
perform the insufficient-funds refusal, which is why §6 step 3 specifies an RPC
instead.

### 8.2 The vault write endpoint has no authentication

```python
async def create_treasurer_vault_entry(payload: dict = Body(...)):
```

No `Depends(_get_current_user)`, no token verification. Worse, `entered_by` is
read **from the request body** — the caller declares their own identity. Anyone
able to reach the API can post an arbitrary `deposit` and attribute it to any
user.

This is the single most serious finding: if the balance can be forged, every
affordability decision built on it is meaningless.

### 8.3 RLS is bypassed on writes

The schema defines `is_vault_writer()` and an insert policy, but FastAPI uses
the service-role key, which ignores RLS entirely. The policies protect the
direct Supabase call from `Vault.jsx:497` and do nothing for the endpoint in
§8.2. Two doors, one locked.

### 8.4 Nothing prevents a negative balance

No constraint and no check. `SUM(amount)` may go below zero freely.

### 8.5 The `amount` sign is caller-supplied

`change_type` and non-zero are validated, but the sign is never checked against
the type. A `deposit` with a negative amount, or a `withdrawal` with a positive
one, both insert successfully. The docstring concedes this: *"The frontend
should compute the sign."*

### 8.6 `reference_id` is not a real foreign key

The schema comments call it *"FK-ish."* Nothing prevents an entry pointing at a
nonexistent loan.

### What is sound

- **Append-only ledger** is the correct design — balance as `SUM(amount)`,
  corrections as reversing rows, no destructive overwrites.
- **`security_invoker = on`** on `vault_balance_v` is correct and deliberate,
  with a comment explaining the SECURITY DEFINER pitfall it avoids.
- **`change_type` CHECK constraint** is well chosen and covers the real cases.
- **Indexes** are appropriate, including the partial index on `reference_id`.
- **The Treasurer read path** — `vault_balance_v` into the details page —
  works correctly today.

---

## 9. Guardrails

**Must not be touched:**

- Manager, Bookkeeper, and BOD components
- The `isBookkeeperFlow` branches in `Treasurer_ApprovalDetails.jsx`
  (lines 580, 695, 1131)
- Approval order, levels, or conditions — no new approval stage, no
  auto-approve, no auto-reject, no bypass
- The existing Loan Approval tab's behaviour
- Sidebar, header, navigation, global styles

**Why this is safe:** the Reschedule modal is already gated behind
`!isBookkeeperFlow`, so the Bookkeeper never sees that button. Fixing the modal
cannot affect their flow.

**Scope exception:** §6 step 4 modifies the Cashier disburse endpoint. This is
unavoidable — that is where cash physically moves — and is flagged explicitly
because it crosses the Treasurer-only boundary.

---

## 10. Remaining loose end

Pagination on the Treasurer approval page is fake: the `[1, 2, 3, 4, 5]` buttons
at `Treasurer_Approval.jsx:301` are hardcoded and wired to nothing.
Recommendation: wire both tabs to the `limit` / `offset` parameters the
priority-queue endpoint already supports.

---

## 11. Sequencing

**Pass 1 — frontend (~1 file):** steps 5–7. The tab exists, shows real rows and
a shortfall computed against the raw balance.

**Pass 2 — backend:** steps 1–4, plus the §8 security items (authentication on
the vault endpoint with `entered_by` taken from the verified JWT rather than the
body; sign validation against `change_type`; the negative-balance guard inside
the RPC). The vault becomes authoritative and self-maintaining.

**Honest caveat on Pass 1 alone:** until Pass 2 lands, the vault does not
decrease on disbursement, so the "Funds Available" signal drifts upward after
every release. Acceptable for demonstrating the UI; not defensible if the panel
probes the arithmetic.
