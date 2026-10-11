# Security finding: `loan_payments` / `loan_payment_ledger` / `loan_payments_legacy` are readable by any logged-in user

**Status:** confirmed live, fix drafted, **not yet applied**. Requires a developer with Supabase SQL editor access.
**Severity:** High — full member payment history is exposed to any authenticated session, not just staff or the owning member. ISO/IEC 25010 Security characteristic; likely a Data Privacy Act (RA 10173) exposure for a financial cooperative.

## How this was found

While verifying `Dashboard_Spec_v1.md`'s claim V15 ("the data behind the BOD and Manager dashboards is protected by auth/RLS"), `loans` itself was confirmed correctly role-scoped via `public.has_portal_role()` (`loan_form_policies.sql`, policy `"staff read all loans"`), but `loan_payments` and `loan_payment_ledger` were not. A live query then found `loan_payments_legacy` has the same gap, and it isn't defined in any committed migration at all (see "Provenance gap" below).

## Evidence (live, confirmed by the developer running the discovery query)

```sql
SELECT tablename, policyname, cmd, permissive, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('loan_payments', 'loan_payment_ledger', 'loan_payments_legacy')
  AND permissive = 'PERMISSIVE'
  AND (roles @> ARRAY['authenticated']::name[] OR roles @> ARRAY['public']::name[]);
```

Result:

| tablename | policyname | cmd | permissive | roles |
|---|---|---|---|---|
| loan_payment_ledger | loan_payment_ledger_authenticated_select | SELECT | PERMISSIVE | {authenticated} |
| loan_payments | loan_payments_authenticated_select | SELECT | PERMISSIVE | {authenticated} |
| loan_payments_legacy | loan_payments_legacy_authenticated_select | SELECT | PERMISSIVE | {authenticated} |

All three policies' `USING` clause is `true` — every row, to every authenticated session, no exceptions. (The `INSERT`/`UPDATE` policies also visible in that same scan — `loan_payments_authenticated_insert_cashier`, `loan_payments_authenticated_bookkeeper_review` — already carry their own `WITH CHECK` conditions and are out of scope for this fix; they're listed here only because they showed up in the same discovery query.)

## Impact

Any logged-in user — including a plain Member, from the browser, via the Supabase client directly (no FastAPI involved) — can currently read:
- Every member's loan payment records (`loan_payments`): amounts, penalties, dates, confirmation status.
- The double-entry payment ledger (`loan_payment_ledger`) — not read anywhere in the current frontend, so this half is a latent exposure rather than an actively-exploited one today, but the policy is live regardless.
- Pre-2025 imported payment history (`loan_payments_legacy`).

This is trivially reachable: open devtools on any logged-in session (a Member's own portal is enough) and query the Supabase REST endpoint for either table with no filter.

### Provenance gap worth a separate look

`loan_payments_legacy` has no `CREATE TABLE` or `CREATE POLICY` anywhere in `src/server/*.sql` — like `member`, `loans`, and `member_account`, it was created outside this repo's committed migration history (Supabase dashboard or an uncommitted script). Its RLS policy exists live but nobody can point to where it came from. Worth asking whoever has Supabase dashboard history whether other undocumented policies exist on these out-of-repo tables.

## The fix

Already written at `TTMPC_THESIS/src/server/loan_payments_restrict_select_rls.sql`, **not yet applied to the live database**. Summary of what it does:

1. Explicitly drops all three confirmed permissive SELECT/`authenticated` policies above, by exact name, before creating anything — this matters because Postgres ORs every permissive policy that matches the same role+command, so leaving any one of the three in place (even under a policy of a different name) would silently defeat the replacement.
2. Recreates each SELECT policy as: **staff role** (`public.has_portal_role(auth.uid(), auth.email(), ARRAY['manager','bod','bookkeeper','treasurer','cashier'])` — the same function and role set already live on `loans`' own `"staff read all loans"` policy) **OR the member who owns the underlying loan** — joined `loan_id → loans.control_number`, then the identical ownership predicate `loans` itself already uses (`loan_form_policies.sql`'s `"authenticated read own loans"`: `loans.user_email = auth.email()` OR a `member_account` row links `auth.uid()` to `loans.member_id`).
3. For `loan_payments_legacy` specifically, also runs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (idempotent, harmless if already on) and adds an explicit `service_role` bypass policy, matching the convention every other RLS-enabled table in this codebase already follows.

None of this affects FastAPI/backend reads of these tables — `main.py` runs on the Supabase service-role key, which always bypasses RLS regardless of policy content.

## Frontend files that read these tables directly (need testing after the fix is applied)

**`loan_payments`:**
| File | Route / role | Query pattern |
|---|---|---|
| `Member/Components/Member_Dashboard.jsx` | Member | Own loans only |
| `Member/Components/LoanCalculatorModal.jsx` | Member | Own active loan only |
| `LOANFORMS/Emergency_Loan.jsx` | Member (`memberGuarded`) | Own prior loans (renewal check) |
| `LOANFORMS/Consolidated_Loan.jsx` | Member (`memberGuarded`) | Own prior loans (renewal check) |
| `LOANFORMS/Consolidated_Up.jsx` | Member — **was unguarded, now fixed** (see below) | Own prior loans (renewal check) |
| `BOD/Components/B-Dashboard.jsx` | BOD | Broad, unfiltered (recent payments feed) |
| `Cashier/Components/Cashier_Dashboard.jsx` | Cashier | Broad, unfiltered (day-window feed) |
| `Member/Components/Member_StatementOfAccount.jsx` | Member (indirect, via the `member_statement_of_account` view, which is `security_invoker = on` and selects from `loan_payments` + `loan_payments_legacy`) | Own statement |

**`loan_payment_ledger`:** no frontend file reads this table directly anywhere in `src/` today — the policy change here is inert for the UI, just brings it in line with `loan_payments`.

## Already fixed in code (not the database) during this same review

- `Router.jsx`: `/Consolidated_Up` had **no `RequireRole` guard at all** — any authenticated session, not just Members, could open it. Now wrapped with `memberGuarded(...)`, matching its sibling `/Consolidated_Loan`.
- `main.py`: five routes that had no server-side role check at all now require a verified session and the matching staff role — `GET /api/bookkeeper/reports`, `POST /api/migs/recompute-all`, `POST /api/cashier/disbursements/{id}/disburse`, `POST /api/bookkeeper/payments/{id}/approve`, `POST /api/bookkeeper/payments/{id}/reject`. Their frontend callers were updated to send the required bearer token.

## Verification checklist once the SQL is applied

- [ ] Log in as a Member with at least one loan (ideally one with pre-2025/legacy history): dashboard, loan calculator, statement of account, and a renewal application all still show payment data.
- [ ] Log in as Bookkeeper/Manager/Treasurer/Cashier/BOD: existing screens unaffected (most go through the now-role-gated FastAPI endpoints, not direct reads of these two tables).
- [ ] As a Member, attempt to query another member's `loan_id` directly against the Supabase REST endpoint (devtools) — should now return zero rows.
- [ ] Confirm `member_statement_of_account` still returns legacy-era rows for a member with pre-live history (this is the one path that depends on the `loan_payments_legacy` half of the fix).
