# Time Deposit Feature — Handoff (Steps 1 & 2 already done)

**Read this first, then `REGANT_Time_Deposit_Tracking_and_Claude_Prompt.md` (the full spec).** Steps 1 (repository reconnaissance) and 2 (reconciliation) from that document's Section 12 are already complete — see Sections 15 and 16 there for full detail. This file is the condensed starting point so you don't redo that work. Start at **Step 3** (implementation) using the conclusions below.

---

## What already exists in the repo (don't duplicate)

- **Regular Savings schema (new, current target):** `savings_accounts` (`account_number text PK`, `member_id uuid FK -> member.id`, `balance`, `status`) + `savings_ledger` (immutable credit/debit rows; a `BEFORE INSERT` trigger `fn_savings_ledger_apply()` keeps balance in sync and blocks negative balances). File: `TTMPC_THESIS/src/server/savings_accounts_schema.sql`.
- **Legacy table** `public."Savings_Transactions"` still exists and is still read by `Member_Dashboard.jsx` — mid-migration, do not build TD against this one.
- **Two existing transaction-safety precedents:**
  - Savings: queue row (`savings_transaction_queue`) → human bookkeeper confirms via FastAPI → ledger insert → trigger applies balance. Has a human-in-the-loop gap.
  - ISC: single Postgres RPC (`isc_calculate_preview()`, `isc_post()`, `isc_settle_posting()`, `isc_reverse()`) — one DB transaction, no gap. **This is the pattern TD should follow**, not the savings queue pattern (see decisions below).
- **Receipts:** `public.receipts` table, immutable, `source_type` CHECK currently `('loan_payment','loan_release','savings','cbu','membership_payment','cbu_payout','isc','grocery')` — no `time_deposit` yet. Savings receipts are auto-issued by an `AFTER INSERT ON savings_ledger` trigger chain (`receipt_issue_savings()`). Files: `receipts_01_schema.sql` through `receipts_06_audit.sql`.
- **Audit log:** `public.audit_log`, `entity_type` CHECK was already widened (by the applied migration `audit_log_cashier_triggers.sql`) to include `'savings'`, `'withdrawal'`, etc., and `action` widened to include `'post'`, `'record'`. Direct precedent: `audit_trg_savings_ledger()` — picks `entity_type` by transaction direction and calls `audit_write(entity_type, id, 'post', before, after, context)`.
- **Known RLS gap (do not copy):** `savings_accounts`/`savings_ledger` RLS policies are `USING (true)` for any authenticated user — no member-id scoping at the DB level; member isolation is enforced client-side only in `Member_Savings.jsx`. This is inconsistent with the rest of the codebase (see decisions below).
- **membership_number_id trap:** this column name means different things in different tables — **uuid** FK to `member.id` in `grocery_transactions`/`attendance_logs`/`member_profile`, but **text** (human code like `"TTMPC-015"`) in `savings_transaction_queue`/`ledger_transactions`. Check the actual column type per table before joining/filtering — never assume.
- **Dashboard UI primitives to reuse as-is:** `src/components/TableToolbar.jsx`, `TableActionButton`, `Pagination`, `TableStateRow`. See `Bookkeeper_Savings_Accounts.jsx` for the pattern.
- **Account opening today** is a dedicated full page (`Cashier/Components/Add_Savings.jsx`), not a modal, posting to FastAPI (`POST /api/savings/transactions`) — not a direct Supabase insert.

---

## Architecture decisions already made (treat as settled, not open questions)

These are implementation choices for *this project*, not cooperative policy — they do not need the bookkeeper's input and should not be re-litigated:

1. **TD gets its own dedicated tables** (e.g. `time_deposits`, `time_deposit_ledger`) — do not bolt TD onto `savings_accounts`/`savings_ledger`.
2. **TD open and settlement are Postgres RPCs** (mirroring the ISC pattern: `td_calculate_preview()`, `td_open()`, `td_settle()` or similar), not a queue-and-human-confirm flow. This is required to satisfy the spec's atomicity requirement (a failed transaction must never leave a funded-looking certificate).
3. **TD RLS is backend-enforced** (service-role key + identity from the verified JWT, no client-writable policies) — matching `receipts` and `loan_renewal_override_requests`, explicitly *not* matching the open `USING (true)` policy found on `savings_accounts`/`savings_ledger`.
4. **Audit:** add one additive migration extending `audit_log_entity_type_check` to include `'time_deposit'` (same style as the existing `audit_log_cashier_triggers.sql` migration), then write events via `audit_write('time_deposit', <id>, 'post'|'create'|..., before, after, context)`.
5. **Receipts:** one additive migration extending `receipts.source_type` CHECK to include `'time_deposit'`, plus a new `receipt_issue_time_deposit()` function + `AFTER INSERT` trigger, mirroring `receipt_issue_savings()`.

## Current implementation status (2026-10-16)

- Completed: BOD-managed TD bracket policies, decimal-safe preview, dedicated TD tables and RLS, idempotent member-linked `td_open()` placement RPC, TD ledger entry, audit/receipt wiring, cashier dashboard, member certificate progress, and member-picker modal.
- Placement behavior: creates a certificate and TD-ledger placement record without debiting `savings_ledger` or recording a cash receipt. This is the working non-funding path used until the funding policy is confirmed.
- Still blocked: real funding, maturity transition automation, interest-only settlement, full settlement, rollover, deductions/tax, maturity-date convention, and second-approval rules.

---

## What's still genuinely blocked on the bookkeeper (do not guess)

From the spec's Section 13 — these determine real money-movement logic, not architecture:

1. Funding source: Regular Savings transfer, cash deposit, or both?
2. Is ₱50,000 a strict minimum, or are there exceptions?
3. Is the rate bracket always based on the individual certificate's principal?
4. Rollover: original rate or the rate in effect at the new cycle's start?
5. Rollover timing: starts on maturity date or when staff actually processes it?
6. Maturity handling: manual member choice, or automatic renewal under an approved default?
7. Exact maturity-date/timezone/day-count convention (cooperative business timezone, weekends/holidays handling).
8. Any withholding tax or other deduction on interest payouts?
9. Rounding convention the bookkeeper actually uses for ledger entries.
10. Does opening or settling a TD require a second staff approval?

**Isolate these behind the RPC boundary** (decision #2 above) so the rest of the feature (calculation preview, dashboard, member portal UI, audit/receipt wiring) can be built and tested now without them, and the money-movement logic can be filled in once policy is confirmed.

---

## What to build now (safe, unblocked)

1. Interest calculation function + unit tests — exact formulas:
   - 365 days: `principal × annual_rate`
   - 180 days: `principal × annual_rate ÷ 365 × 180`
   - Brackets: ₱50k–199,999.99 (1.5%/2.0%), ₱200k–499,999.99 (2.0%/2.5%), ₱500k–799,999.99 (2.5%/3.0%), ₱800k+ (3.0%/4.0%) for 180/365 days respectively. Use decimal-safe arithmetic; verify against the worked examples in the spec's Section 2.
2. Schema/migration proposal for `time_deposits` / `time_deposit_ledger` with backend-enforced RLS (decision #1/#3), plus the two additive migrations from decisions #4/#5. Prepare as SQL scripts only — the developer applies them manually in the Supabase SQL Editor; do not apply migrations yourself.
3. Dashboard scaffolding: split dropdown (`+ Open Account ▾` → Regular Savings / Time Deposit), pill tabs (Regular Savings / Time Deposits), TD table columns per spec Section 3, reusing the existing table primitives.
4. Opening-flow UI and non-funding placement path (spec Section 14) — implemented for member selection, amount/term entry, live preview, confirmation, certificate creation, TD-ledger recording, and member progress. Real funding remains disabled until Q1 is confirmed.
5. KPI aggregates computed DB-side (a view), not fetched client-side and summed.

Do not implement actual fund movement, settlement, or rollover logic until the bookkeeper answers above are confirmed. The current `td_open()` RPC is intentionally limited to member-linked placement and TD-ledger recording; settlement RPCs remain isolated for the next stage.
