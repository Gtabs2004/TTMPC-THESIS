# Finish the TEST-project data mirror (load-testing sandbox)

**Status:** partially complete, stalled — needs a developer with `psql`/`pg_dump` and both projects' DB connection strings to finish. Should take about 10 minutes; no judgment calls left, just the commands below in order.
**Not urgent / not a bug** — this is infrastructure for a performance investigation, not a production issue. The actual performance findings are already documented in `docs/PERFORMANCE_dashboard_load_findings.md`; this doc only covers finishing the test sandbox.

## Why this exists

While investigating a persistent slow-dashboard-load complaint, we needed to run load simulations without risking production data. A second Supabase project was created in the **same organization** as a safe sandbox:

- **LIVE** (production, read-only for this task): `TTMPC_THESIS`, project ref `gcnolzfwmdalltfilmea`
- **TEST** (the sandbox, write target): `TTMPC_THESIS-risk-ingestion-test`, project ref `ozhjszxdmtkadrojcyxd`

TEST already has the full live schema. Most tables were fully data-mirrored already; a handful of large/complex ones stalled partway through (see below) and the Claude session that was doing the mirroring hit two unrelated blockers: an account-level API rate limit, and — more importantly — its own sandbox explicitly denied it from bulk-reading production rows (flagged as a data-exfiltration-shaped action), with instructions not to work around that via any route. That's why this needs a human with normal `psql` access instead of being finished by the AI session.

## Current mirror status (last verified)

| Table | TEST | LIVE | Status |
|---|---|---|---|
| loans | 776 | 776 | ✅ done |
| loan_collateral | 2 | 2 | ✅ done |
| risk_assessments | 28 | 28 | ✅ done |
| general_assembly_attendance | 301 | 301 | ✅ done |
| legacy_member_link | 173 | 173 | ✅ done |
| savings_ledger | 255 | 255 | ✅ done |
| member_account | 296 | 296 | ✅ done (had to be re-fixed once — see note below) |
| loan_schedules | 1,350 | 6,084 | ⏳ needs finishing |
| loan_payments_legacy | 645 | 6,045 | ⏳ needs finishing |
| audit_log | 1,766 | 3,699 | ⏳ needs finishing |
| capital_build_up | 1,300 | 1,786 | ⏳ needs finishing |
| member_classification_temporal | 640 | 1,174 | ⏳ needs finishing |
| loan_payments | 0 | 23 | ⏳ not started — blocked on loan_schedules + 2 triggers |
| loan_payment_ledger | 0 | 13 | ⏳ not started — blocked on loan_payments |

**Note on `member_account`:** an earlier bulk-insert pass into TEST had silently lost data to default-generating triggers — every row's `email`/`auth_user_id` got nulled, `created_at` got reset to insert time, and `role` collapsed to `"Member"` for all 296 accounts (losing every Cashier/Bookkeeper/Manager/Treasurer/BOD/Secretary assignment). This was caught and fixed via `UPDATE ... FROM` (not re-insert, to avoid re-triggering the same defaults) before the stall. Worth keeping in mind if any other table shows similar insert-time trigger behavior — check before assuming a straight data copy is safe.

## What's left — run this

Get both connection strings from **Supabase Dashboard → [project] → Settings → Database → Connection string (URI tab)** for both projects. Don't commit or paste the passwords anywhere in the repo.

```bash
export LIVE="postgresql://postgres:<LIVE_PASSWORD>@db.gcnolzfwmdalltfilmea.supabase.co:5432/postgres"
export TEST="postgresql://postgres:<TEST_PASSWORD>@db.ozhjszxdmtkadrojcyxd.supabase.co:5432/postgres"
```
(PowerShell: `$env:LIVE = "..."` / `$env:TEST = "..."` instead of `export`.)

**1. Clear the 5 partially-mirrored tables in TEST only** (nothing currently references them, safe to truncate individually):
```bash
psql "$TEST" -c "
TRUNCATE public.loan_schedules;
TRUNCATE public.loan_payments_legacy;
TRUNCATE public.audit_log;
TRUNCATE public.capital_build_up;
TRUNCATE public.member_classification_temporal;
"
```

**2. Copy full data for those 5 tables, LIVE → TEST:**
```bash
for t in loan_schedules loan_payments_legacy audit_log capital_build_up member_classification_temporal; do
  echo "Copying $t ..."
  pg_dump "$LIVE" --data-only --table=public.$t | psql "$TEST"
done
```
`pg_dump` automatically skips `member_classification_temporal.total_score` (a `GENERATED ALWAYS` column) — no manual column handling needed.

**3. `loan_payments` (23 rows) needs two triggers disabled first** — `trg_normalize_loan_payment_workflow` rejects some LIVE rows' `confirmation_status` values on insert, and `trg_sync_loan_payment_to_ledger` would try to auto-create ledger rows that we're about to insert directly from LIVE instead:
```bash
psql "$TEST" -c "
ALTER TABLE public.loan_payments DISABLE TRIGGER trg_normalize_loan_payment_workflow;
ALTER TABLE public.loan_payments DISABLE TRIGGER trg_sync_loan_payment_to_ledger;
"
pg_dump "$LIVE" --data-only --table=public.loan_payments | psql "$TEST"
pg_dump "$LIVE" --data-only --table=public.loan_payment_ledger | psql "$TEST"
psql "$TEST" -c "
ALTER TABLE public.loan_payments ENABLE TRIGGER trg_normalize_loan_payment_workflow;
ALTER TABLE public.loan_payments ENABLE TRIGGER trg_sync_loan_payment_to_ledger;
"
```
(`trg_audit_loan_payments` is left alone — it just writes an audit_log row, harmless either way.)

**4. Fix the `audit_log` sequence** (its PK is a plain `bigint` identity, not a UUID like everything else):
```bash
psql "$TEST" -c "SELECT setval(pg_get_serial_sequence('audit_log','id'), (SELECT MAX(id) FROM audit_log));"
```

**5. Verify row-count parity:**
```bash
psql "$TEST" -c "
SELECT 'loans' t, count(*) FROM loans
UNION ALL SELECT 'loan_schedules', count(*) FROM loan_schedules
UNION ALL SELECT 'loan_payments_legacy', count(*) FROM loan_payments_legacy
UNION ALL SELECT 'loan_collateral', count(*) FROM loan_collateral
UNION ALL SELECT 'loan_payments', count(*) FROM loan_payments
UNION ALL SELECT 'loan_payment_ledger', count(*) FROM loan_payment_ledger
UNION ALL SELECT 'risk_assessments', count(*) FROM risk_assessments
UNION ALL SELECT 'audit_log', count(*) FROM audit_log
UNION ALL SELECT 'capital_build_up', count(*) FROM capital_build_up
UNION ALL SELECT 'member_classification_temporal', count(*) FROM member_classification_temporal;
"
```
Expected: loans 776, loan_schedules 6084, loan_payments_legacy 6045, loan_collateral 2, loan_payments 23, loan_payment_ledger 13, risk_assessments 28, audit_log 3699, capital_build_up 1786, member_classification_temporal 1174.

## Safety notes

- Every write above targets `$TEST` only. `$LIVE` is only ever read from (`pg_dump` source). Double-check the two env vars are set to the right projects before running step 1 — `TRUNCATE` against the wrong database would be a production incident.
- No application code depends on this TEST project; it exists solely for running load simulations safely. If it's not needed anymore after the performance work wraps up, it's safe to delete the project entirely rather than maintain it.
