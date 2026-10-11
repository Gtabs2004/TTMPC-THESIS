# REGANT QA Results — Round 1

| | |
|---|---|
| Guide used | `REGANT_QA_Guide.pdf` (tailored from `Generic_System_QA_Guide.pdf`) |
| Build | commit `7cd1ab7` (main, clean) |
| Environment | Local: frontend `localhost:5173`, API `127.0.0.1:8000`, **pointing at the live Supabase project** |
| Date | 2026-10-11 |
| Method | Code review + **read-only** probes (unauthenticated GET requests to the API, anon-key reads through Supabase REST). Nothing was written to the database, no emails were sent. |

> Because the environment points at live data, no case that writes (apply, approve, release, pay, terminate) was executed. Those are listed under "Still to run manually" and need a Supabase branch or copy first (guide §5).

---

## Summary

| Severity | Count | Defects |
|---|---|---|
| Critical | 3 | D-01, D-02, D-03 |
| High | 3 | D-04, D-05, D-06 |
| Medium | 4 | D-07, D-08, D-09, D-11 |
| Low | 1 | D-10 |

**Exit criteria are not met** (guide §8: no open Critical or High defects). D-01 to D-03 should be fixed before the panel demo or any wider use, because they expose members' personal and financial data to anyone who can reach the API or has the public anon key (which is shipped in the browser bundle).

---

## Defects

### D-01 · Critical · `member_account` table readable with the public anon key
- **Cases:** AC-09, SE-02, SE-11
- **Steps:** `GET {SUPABASE_URL}/rest/v1/member_account?select=*` with only the anon key (no sign-in).
- **Expected:** 0 rows / permission denied (like `loans`, `member`, `personal_data_sheet`, which correctly returned 0 rows, and `receipts`, which returned permission denied).
- **Actual:** all **296** rows returned, with columns `email`, `role`, `can_manage_accounts`, `is_active`, `auth_user_id`, `membership_id`, **`password`**, **`password_hash`**, `pending_email`, `is_temporary`.
- **Not checked:** whether `password` / `password_hash` actually hold values. I stopped there on purpose; please check it yourself in the SQL editor. If they hold real or weakly hashed passwords this is the top priority.
- **Direction:** RLS on `member_account` so a user reads only their own row (staff reads go through FastAPI on the service key); drop or stop selecting the password columns (Supabase Auth already owns passwords).

### D-02 · Critical · 39 FastAPI GET endpoints return data with no sign-in
- **Cases:** AC-08, AC-09, SE-03, SE-11
- **Steps:** call each GET endpoint without an `Authorization` header.
- **Actual (200 OK, no auth):** among others
  - `/api/personal_data_sheet`: 299 members with full name, address, permanent address, contact number, email
  - `/api/savings/accounts`: 250 accounts with balances
  - `/api/secretary/membership-records`: 299 members, paid-up capital, shares, status
  - `/api/cashier/loan-payments/loans` (885 KB), `/api/treasurer/disbursements/released-loans`, `/api/cashier/cbu/members`, `/api/cashier/cbu/transactions`, `/api/migs/members`, `/api/credit-risk/queue`, `/api/treasurer/vault`, `/api/treasurer/vault/entries`, `/api/treasurer/cash-ledger`, `/api/bookkeeper/payments/pending`, `/api/bookkeeper/savings-transactions`, `/api/cashier/membership-payments`, `/api/admin/unlinked-legacy-members`, `/api/bookkeeper/reports`, `/api/bookkeeper/dashboard-summary`, `/api/bod/member-loan-summary`, `/api/dev/pos-simulator/members` …
- **Correctly protected (401):** `/api/receipts`, `/api/member/transactions`, `/api/audit-log*`, `/api/admin/accounts/*`, `/api/cashier/cbu-payouts`, renewal-override endpoints, `/api/account/security-status`.
- **Direction:** apply the same `_get_current_user` + role check the 401 endpoints already use to every staff endpoint (a router-level dependency avoids missing one).

### D-03 · Critical · Write endpoints that do not check who is calling
- **Cases:** AC-19, PF0-04, PF6-03, SE-03
- **Confirmed by reading the handler:**
  - `POST /api/cashier/disbursements/{loan_id}/disburse`: no auth; `cashier_id` / `cashier_name` are taken from the request body. Anyone can release a loan that is `ready for disbursement` in a cashier's name.
  - `POST /api/cashier/savings/accounts/{id}/withdraw`: no auth.
  - `POST /api/bookkeeper/payments/{id}/reject`: no auth.
  - `POST /api/confirm-membership`: no auth.
  - `POST /api/admin/backfill-member-auth`: `_require_service_role()` only checks that the server *has* a service key; it does not check the caller. Anyone can trigger auth-account provisioning.
- **Flagged by scan, verify:** `POST /api/cashier/loan-payments` (auth is optional), `/api/cashier/savings/accounts/{id}/deposit`, `/api/savings/transactions`, `/api/bookkeeper/savings-transactions/{id}/reject`, `/api/confirm-membership/batch`, `/api/migs/recompute-all`, `/api/migs/members/{key}/outside-loan`, `PATCH /api/manager/restructure-requests/{id}/review`, `PATCH /api/bookkeeper/loan-ledger/{id}/restructure`, `/api/bookkeeper/loan-ledger/{id}/restructure-request`, `/api/treasurer/payroll/log`, `/api/secretary/general-assembly/save`, `/api/admin/legacy-member-link/confirm` and `/no-history`, `/api/send-status-email`, `/api/loans/notifications/*`, `/api/loans/email/dispatch` (lets anyone send email through the coop's Resend account), `/api/dev/simulate-pos-event`.
- **Not executed:** calling them would change live data.

### D-04 · High · BOD loan decision trusts a user ID from the request body
- **Cases:** AC-19, PF3-04
- `POST /api/bod/loan-decision` checks that `payload.actor_user_id` belongs to a BOD account, but never checks that the caller *is* that user. Anyone who knows a BOD's user ID can approve or reject a > ₱500,000 loan. WHAT_IFS says "derived from DB, never trusted from body", but the ID it looks up comes from the body.
- **Direction:** take the ID from the verified JWT (`_get_current_user`), as the renewal-override endpoints do.

### D-05 · High · Loan status changes are not tied to the current status
- **Cases:** PF2-06, PF4-07, RC-04
- `LoanApprovalDetails.jsx` (~L1323) and `Treasurer_ApprovalDetails.jsx` (~L688) run `.update({loan_status}).eq('control_number', id)` with no `.eq('loan_status', <expected current>)`. Two approvers acting at once both "succeed" (last write wins), and a stale page can move a loan backwards or sideways (e.g. reject a loan that was already released).
- **Direction:** add the current-status condition and treat 0 updated rows as "already decided"; ideally move transitions server-side (also closes the WHAT_IFS "no transition guard" note).

### D-06 · High · Developer POS simulator reachable without sign-in
- **Cases:** AC-21
- `/dev/pos-simulator` route has no guard; `GET /api/dev/pos-simulator/members` returned 200 (35 KB member list) without auth; `POST /api/dev/simulate-pos-event` has no auth (creates grocery transactions and receipts).
- **Direction:** register these only when an explicit dev flag is set.

### D-07 · Medium · Dates shift one day back in Manila time (UTC conversion)
- **Cases:** TL-01, MO-04
- 36 places use `toISOString().slice(0,10)`, which converts to UTC (8 hours behind Manila). Examples:
  - `B-Dashboard.jsx:113-114`: `new Date(y, m, 1).toISOString()` becomes the **last day of the previous month**, so "this month" figures include one extra day.
  - `Account_Management.jsx:317` (termination effective date) and `IscPayoutPreferencesModal.jsx:61` (ISC effective date) default to **yesterday** when used before 8:00 AM.
  - `B-Dashboard.jsx:148`: the overdue cutoff is a day early before 8:00 AM.
- **Direction:** one local-date helper (`toLocaleDateString('en-CA', {timeZone:'Asia/Manila'})`) used everywhere.

### D-08 · Medium · Manager dashboard delinquency figure
- **Cases:** MO-01, MO-08, MO-23
- `M-Dashboard.jsx:106-109` counts loans with *any* schedule marked `overdue`, not the cooperative's 90-days-without-payment rule, so it over-reports (especially on reconstructed legacy due dates).
- The same query has no paging, so Supabase returns at most 1,000 rows (default max-rows); `.limit(10000)` on L92/L96 is also capped at 1,000 unless the project setting was raised. **Verify:** compare the KPI with a SQL count.

### D-09 · Medium · Raw exception text returned to the browser
- **Cases:** SE-08, IN-02
- 121 places in `main.py` return `detail=str(e)` or `f"...{e}"`. Database errors (constraint names, SQL fragments) can reach users. Example seen: `/api/admin/legacy-member-link/candidates` returns 500.

### D-10 · Low · Native browser dialogs
- **Case:** XC-03
- 17 `alert()` / `confirm()` calls remain, e.g. `Savings_Details.jsx`, `MIGS-Details.jsx`, `Account_Management.jsx`, `LoanApprovalDetails.jsx`, `Cashier_Payments.jsx`, `Cashier_MembershipPayments.jsx`, `Cashier_Disbursement.jsx`, `Cashier_CBU_Exit_Payout.jsx`.

### D-11 · Medium · Resend key also stored as a `VITE_` variable
- **Case:** SE-02
- `.env` holds `VITE_RESEND_API_KEY`. It is **not referenced** in frontend code today, so Vite does not bundle it (pass for now), but any future `import.meta.env.VITE_RESEND_API_KEY` would ship the key to every browser. Remove the `VITE_` copy.

---

## Passed (by probe or code review)

| Case | Result | Evidence |
|---|---|---|
| AC-08 | P (code) | `RequireRole` renders nothing until the role is resolved, then redirects: no flash of staff data. |
| AC-12 | P (code) | `passwordValidation.js`: ≥ 8 chars, upper, lower, number, with per-rule messages. |
| AC-10 (API part) | P | `/api/receipts`, `/api/member/transactions` → 401 without auth. |
| SE-03 (anon REST, partial) | P | anon reads of `loans`, `member`, `personal_data_sheet`, `savings_ledger`, `loan_payments`, `audit_log`, `capital_build_up` → 0 rows; `receipts` → permission denied. |
| OU-02 (API part) | P | `/api/audit-log` → 401 without auth. |
| SE-02 (partial) | P | service-role, Resend and Gemini keys are not referenced in frontend code (see D-11). |
| PE-07 | P (code) | slowapi 100 req/min per IP; 1 MB body cap. |
| A2 rules | P (code) | Emergency cap, term sets, ₱500,000 exclusive threshold, `RENEWAL_MIN_PAYMENTS = 6`, `MIGS_THRESHOLD = 50` match the guide. |

---

## Still to run manually

Needs a **Supabase branch or copy** and the test accounts from guide §6. None of these were executed:

- **Part A loan lifecycle:** PF1–PF8, RC-01…RC-10 (apply → evaluate → BOD → Manager → Treasurer → release → pay → renew).
- **Part A2:** MB, SV, CB, IS, TM, GR.
- **Access by sign-in:** AC-01–AC-07, AC-11, AC-13–AC-18, AC-20, AC-22.
- **Monitoring and charts by eye:** MO-01–MO-22, VZ-01–VZ-18 (compare each figure with a SQL count).
- **Inputs, outputs, reports:** IN, OU-01, OU-03–OU-09, RP-01–RP-12.
- **Cross-cutting:** XC, RL, AX, BC, PE-01–PE-06, NW, SE-01, SE-04–SE-07, SE-09–SE-12, DI, TL-02–TL-04.

Retest D-01 to D-06 after fixes, then rerun AC-08–AC-10, AC-19, AC-21 and SE-03 as regression.
