# Performance finding: dashboards slow down as data volume grows

**Status:** UPDATED — verified against the live database via the Supabase MCP tools (`get_advisors`, `execute_sql` with real `EXPLAIN ANALYZE`, `pg_indexes`, `pg_stat_activity`). This revises the original version of this document, which was static-code-review only and got the index findings wrong — see "What changed" immediately below before reading anything else.
**Reported symptom:** BOD/Manager/other module dashboards get slower and laggier as more data is loaded (noticed during data-load simulation testing).

## What changed from the first version of this doc

The first pass was static code review only — I had no way to query the live database at the time, and said so explicitly. That access became available later in the same review. Running the actual checks reversed the headline finding:

- **The "missing indexes" theory was wrong.** `loans.member_id`, `loans.application_date`, and `loan_schedules.due_date`/`schedule_status` all already have indexes live in the database (`idx_loans_member_id`, `idx_loans_application_date`, `idx_loan_schedules_due_date`, `idx_loan_schedules_status`) — none of them are in this repo's committed `.sql` migrations, which is why grepping the repo missed them. They exist, and `EXPLAIN ANALYZE` confirms Postgres is using them (a `Bitmap Heap Scan` combining both `loan_schedules` indexes, not a sequential scan).
- **Current data volume is tiny.** `loans` = 776 rows, `loan_payments` = 23 rows, `loan_schedules` = 6,084 rows, `member` = 296 rows (live counts via `pg_stat_user_tables`). At these sizes, `EXPLAIN ANALYZE` shows every query this doc originally flagged completing in 0.03-5ms, including the ones doing a sequential scan (`loans`, `loan_payments`) — and the sequential scan is the **correct, planner-optimal choice** at this size, not a bug. There is no live evidence of a query-speed problem today.
- **The real, confirmed culprits are different**, and don't depend on data volume the same way: `max_connections = 60` on this project with ~27 already in use at idle (via `pg_stat_activity`), and 64 separate RLS policies across the database that re-evaluate `auth.uid()`/`auth.email()` per row instead of once per query (confirmed via `get_advisors`, type `performance`) — both detailed below. These are exactly the kind of thing that gets *worse under concurrent load* (a bulk-load script running while people have dashboards open) without needing millions of rows to matter.
- One thing that's still valid and still worth fixing regardless: `GET /api/bookkeeper/reports` still fetches two whole tables into Python with no cache, uncached, on every request. It's just not *currently* slow in absolute terms — at 776/23 rows it runs in under 2ms — so it's a "fix before it becomes a problem" item, not today's bottleneck.

## Root causes, ranked by evidence strength (updated)

### 1. `max_connections = 60`, and roughly 27 are already in use at idle — this is the most likely explanation for lag specifically *during* a bulk-load simulation

Confirmed live via `pg_settings`/`pg_stat_activity`:
```sql
SELECT setting FROM pg_settings WHERE name='max_connections';        -- 60
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;         -- idle: 17, active: 2, (background): 8
```
That's ~27 of 60 already in use with the app sitting essentially idle and no load test running. Every dashboard page view opens several of these (see finding #3 below — 7 to 12 parallel queries per page), the FastAPI backend holds its own pool, and a bulk-data-simulation script adds more on top. This ceiling doesn't care how many rows are in a table — it's about how many things are *connected at once*. A simulation script that opens connections faster than it releases them (no batching/backoff, exactly the concern in the original request) can exhaust this 60-connection ceiling on a project this size well before row count becomes the issue, and everyone else's dashboard queries queue or fail while that's happening. This is the best-supported explanation for lag *specifically during* simulated load, as opposed to steady-state slowness.

**Not something to fix with SQL** — this is a Supabase compute-tier setting (`max_connections` scales with the project's compute add-on) and a client-side discipline question (the batched/throttled simulation script recommended at the bottom of this doc exists specifically to avoid tripping this). Worth a developer checking the project's current compute tier in the Supabase dashboard and deciding whether it needs to go up, separately from any code fix.

### 2. 64 RLS policies re-evaluate `auth.uid()`/`auth.email()` per row instead of once per query

Confirmed via `get_advisors(type="performance")`, lint `auth_rls_initplan`, WARN level, 64 findings — 41 of them on tables this review has directly touched (`loans`, `member`, `member_account`, `audit_log`, `koica_loans`, `member_profile`, `member_classification_temporal`, `capital_build_up`). Example finding: `Table public.loans has a row level security policy "staff read all loans" that re-evaluates ... auth.<function>() for each row.` Every one of these policies calls `auth.uid()`/`auth.email()`/`public.has_portal_role(auth.uid(), ...)` directly inside its `USING`/`WITH CHECK` clause; Postgres then invokes that function once *per row scanned*, instead of once for the whole query. At today's row counts this is genuinely cheap in absolute terms (confirmed — the `EXPLAIN ANALYZE` runs below all completed in single-digit milliseconds even through RLS), but it's the one finding in this document that gets strictly worse both as data grows *and* under concurrent load, since it multiplies by rows-scanned × concurrent-requests. It's also directly relevant to the `loan_payments_restrict_select_rls.sql` file drafted earlier in this project's review, which is not yet applied — see the note in that file's own history for the fix applied there before you run it.

**The fix Supabase itself recommends** (and the remediation link in every one of these 64 findings points to): wrap the call in a scalar subquery so it's evaluated once, not per row —
```sql
-- before (re-evaluated per row)
USING (public.has_portal_role(auth.uid(), auth.email(), ARRAY['manager','bod']))
-- after (evaluated once per query)
USING (public.has_portal_role((select auth.uid()), (select auth.email()), ARRAY['manager','bod']))
```
This is a mechanical, low-risk rewrite of every affected policy's `USING`/`WITH CHECK` clause — the semantics don't change, only when the function runs. Given there are 64 of these across the whole database, this is worth its own migration/ticket rather than a spot-fix; I did NOT apply this broadly since it touches every RLS-protected table in the app and should go through the same review this whole document has.

### 3. Dashboards fan out many parallel Supabase queries per page load

`B-Dashboard.jsx` fires **12** parallel `supabase.from(...)` queries in one `Promise.all` on every load; `M-Dashboard.jsx` fires **7**. Each is its own PostgREST round-trip and its own connection from the pool — directly compounding finding #1's tight 60-connection ceiling. This isn't a bug by itself, and at today's volumes each individual query is fast, but it means every dashboard page view claims 7-12 connections at once, which matters a great deal when the ceiling is 60 and something else (a load test) is also competing for connections concurrently.

### 4. `GET /api/bookkeeper/reports` reads two entire tables into Python, uncached, on every request

Still real, still worth fixing, but **confirmed not currently the bottleneck** — see "What changed" above. `EXPLAIN ANALYZE` on both of its unfiltered queries completed in under 2ms at today's row counts (776 loans, 23 payments). This is a "fix it before it becomes a problem" item: the pattern is architecturally wasteful and its cost is directly proportional to row count with no caching, so it will start to matter as real data accumulates, even though it isn't the explanation for today's reported lag.

`main.py:16885-16895`:
```python
loans_resp = (
    supabase.table("loans")
    .select("control_number,member_id,loan_amount,principal_amount,loan_status,application_date,loan_type:loan_type_id(code,name)")
    .execute()   # no filter, no .range(), no .limit() — the entire loans table
)
```

`main.py:16971-16979`:
```python
payments_resp = (
    supabase.table("loan_payments")
    .select("id,loan_id,amount_paid,penalties,payment_date,confirmation_status")
    .execute()   # no filter, no .range(), no .limit() — the entire loan_payments table
)
```

Both result sets are then aggregated **in Python** (monthly collections summed by iterating every payment row, delinquency computed by set operations over every loan, loan-type distribution by dict accumulation — `main.py:16924-17020`+). There is **no caching at all** on this endpoint (I grepped for a cache dict the way two sibling endpoints have one — see below — and found none). So the cost of loading the Bookkeeper Reports page is directly proportional to `COUNT(loans) + COUNT(loan_payments)`, recomputed from scratch, in Python, on every single page view. This is exactly the shape of problem that would look fine with a handful of rows and get progressively worse the more data you load — matching the reported symptom precisely.

**The fix already exists as a proven pattern in this same file** — two sibling endpoints solve the identical problem with an in-process TTL cache plus a startup warm-up, and this endpoint should use the same one instead of a new approach:

```python
# main.py:6181-6182 (get_bookkeeper_manage_loans)
_MANAGE_LOANS_CACHE: dict = {"payload": None, "expires_at": 0.0}
_MANAGE_LOANS_CACHE_TTL_SECONDS = 120.0

# main.py:6529-6530 (get_bookkeeper_dashboard_summary)
_DASHBOARD_SUMMARY_CACHE: dict = {"payload": None, "expires_at": 0.0}
_DASHBOARD_SUMMARY_CACHE_TTL_SECONDS = 90.0
```

Both are warmed at startup (`_warm_manage_loans_cache()`, `main.py:165`) so the first request after a deploy isn't slow either. **Recommendation: give `get_bookkeeper_reports` the same `_REPORTS_CACHE` treatment** (90-120s TTL is reasonable for a reporting page) — this alone would likely fix the single worst offender without touching a single SQL query.

Longer-term (worth a separate ticket, not urgent): move the aggregation itself into Postgres (a materialized view or a `SUM()`/`COUNT()` RPC) instead of pulling every row into Python and summing there — see the "Materialized view / RPC" section below for a concrete sketch.

### 5. Three endpoints fetch entire tables and filter in Python (still valid, unrelated to the index correction above)

These were flagged in this repo's own `docs/research/phase2_disbursement_migs_risk.md` and I re-confirmed the line numbers still stand:

- `get_treasurer_released_loans` — fetches all of `loans`, filters to released/disbursed statuses in Python.
- `get_treasurer_priority_queue` — same pattern, fetches all of `loans` before ranking.
- `get_bookkeeper_pending_payments` — fetches all of `loan_payments`, filters to `pending_bookkeeper` in Python.

Same caveat as finding #4: at 776 loans / 23 payments this isn't slow today, but the pattern (fetch everything, filter in application code) doesn't benefit from any index no matter how well-indexed the table is, since no `WHERE` clause is ever sent to Postgres. **The fix is already proven elsewhere in this same file** — `get_credit_risk_queue` does this correctly: it pushes the status filter to Postgres with `.in_("application_status", sorted(_CREDIT_RISK_QUEUE_STATUSES))` instead of fetching everything. Recommend the same `.in_()`/`.eq()` push-down for the three endpoints above.

### 6. Indexes on `loans` and `loan_schedules`: mostly already fine, confirmed live — one real gap remains

Correcting the first version of this doc: live `pg_indexes` shows `loans` already has `idx_loans_member_id`, `idx_loans_application_date`, `idx_loans_loan_type_id`, `idx_loans_manager_queue`, and `idx_loans_bod_pending`, and `loan_schedules` already has `idx_loan_schedules_due_date`, `idx_loan_schedules_status`, `idx_loan_schedules_loan_id`, plus three uniqueness constraints. `EXPLAIN ANALYZE` confirms both `loan_schedules` indexes are actively used together via a `Bitmap Heap Scan` for exactly the date-range + status-list query `B-Dashboard.jsx` and `main.py:16906` run. None of this is in the repo's committed `.sql` files — it was added directly against the live database at some point, same as several other things this review has found outside the committed migration history (`member`, `loans`, `loan_payments_legacy` base tables, the `loan_payments_legacy` RLS policy).

**One genuine gap remains:** `loans.disbursal_date` has no index at all (confirmed absent from the live `pg_indexes` listing). It's used in the BOD/Manager trend charts and the `GET /api/manager/approval-metrics` endpoint. Not urgent at 776 rows, but cheap to add now:
```sql
CREATE INDEX IF NOT EXISTS idx_loans_disbursal_date ON public.loans (disbursal_date);
```

### 7. `audit_log`: already indexed and already using the index, confirmed via `EXPLAIN ANALYZE` — a composite index would still be a minor improvement

Ran the actual query `GET /api/manager/approval-metrics` uses (`entity_type='loan' AND action IN ('approve','reject') AND occurred_at >= X`) through `EXPLAIN ANALYZE`: Postgres uses `idx_audit_log_action` (an `Index Scan`, not a sequential scan) and applies `entity_type`/`occurred_at` as a post-filter — total execution time 12.9ms at 3,699 rows. Not a problem today, but a composite index would let Postgres filter on all three conditions via the index directly instead of index-then-filter:
```sql
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_action_occurred
  ON public.audit_log (entity_type, action, occurred_at DESC);
```
Low priority given the confirmed-fast current numbers — include it in the same migration as the `disbursal_date` index above if a developer is touching this anyway, not worth a special trip.

## Recommended index migration (draft — a developer should review and run `EXPLAIN ANALYZE` before and after)

This is the full remaining list — everything else this doc originally recommended here already exists live (see finding #6):
```sql
CREATE INDEX IF NOT EXISTS idx_loans_disbursal_date ON public.loans (disbursal_date);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity_action_occurred
  ON public.audit_log (entity_type, action, occurred_at DESC);
```
Also worth doing while touching indexes, from `get_advisors(type="performance")`'s `duplicate_index` finding (WARN, real, zero-risk to fix): `member` has two pairs of byte-identical indexes — `{member_id_key, member_pkey}` and `{member_membership_id_key, member_membership_id_unique}`. Duplicate indexes cost extra write overhead on every insert/update with no read benefit; drop one of each pair.

## `EXPLAIN ANALYZE` results — actually run against the live database, not just commands to try

Ran these via the Supabase MCP tools directly against the `TTMPC_THESIS` project (`gcnolzfwmdalltfilmea`):

| Query | Plan | Actual time | Rows |
|---|---|---|---|
| Full `loans` scan (finding #4's original query) | `Seq Scan` — correct choice at this size | 1.88ms | 776 |
| Full `loan_payments` scan (finding #4's original query) | `Seq Scan` — correct choice at this size | 0.08ms | 23 |
| `loan_schedules` overdue-window query (finding #5/#6) | `Bitmap Heap Scan` using both `idx_loan_schedules_due_date` and `idx_loan_schedules_status` | 5.10ms | 22 of 6,084 |
| `audit_log` approval-metrics query (finding #7) | `Index Scan` using `idx_audit_log_action` | 12.9ms | 4 of 3,699 |

None of these show a real problem today. If a developer wants to re-run these after a load test to see whether the picture changes at higher volume, the queries are:
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT control_number, member_id, loan_amount, principal_amount, loan_status, application_date FROM public.loans;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, loan_id, amount_paid, penalties, payment_date, confirmation_status FROM public.loan_payments;

EXPLAIN (ANALYZE, BUFFERS)
SELECT loan_id, due_date, schedule_status FROM public.loan_schedules
WHERE schedule_status IN ('Unpaid','unpaid','Overdue','overdue','Pending','pending')
  AND due_date >= now() - interval '6 months' AND due_date < now();

EXPLAIN (ANALYZE, BUFFERS)
SELECT entity_id, action, occurred_at FROM public.audit_log
WHERE entity_type = 'loan' AND action IN ('approve','reject') AND occurred_at >= now() - interval '30 days';

-- Connection pressure — re-check this one specifically during/right after a load test:
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
```

## Materialized view / RPC sketch for `get_bookkeeper_reports` (longer-term, beyond the quick cache fix)

If the in-process cache (recommended above) isn't enough once data volume is much larger, the next step is moving the aggregation into Postgres so it isn't recomputed in Python at all:

```sql
CREATE MATERIALIZED VIEW public.bookkeeper_reports_mv AS
SELECT
  (SELECT COUNT(*) FROM public.member WHERE member_status = 'active') AS active_members,
  (SELECT COALESCE(SUM(amount_paid), 0) FROM public.loan_payments WHERE confirmation_status = 'validated') AS total_collections_all_time,
  date_trunc('month', lp.payment_date) AS month,
  SUM(lp.amount_paid) FILTER (WHERE lp.confirmation_status = 'validated') AS monthly_collections
FROM public.loan_payments lp
GROUP BY date_trunc('month', lp.payment_date);

CREATE UNIQUE INDEX ON public.bookkeeper_reports_mv (month);
```

This needs a refresh strategy (`REFRESH MATERIALIZED VIEW CONCURRENTLY public.bookkeeper_reports_mv;` on a schedule, e.g. every 15 minutes via `pg_cron` if the project has it enabled, or triggered from the app after a payment validation) — a developer should design the exact grouping/columns against what the Reports page actually needs, this is a sketch of the mechanism, not a drop-in replacement for the full query in `main.py:16861-17100`+.

## Server-side pagination example (`.range()`)

For any dashboard list that currently pulls a large, unbounded result set (the three endpoints in finding #5), the fix is the same shape already used correctly elsewhere in this file (`read_audit_log`, `main.py:16600-16608`):

```python
page = 1
page_size = 25
start = (page - 1) * page_size
resp = (
    supabase.table("loans")
    .select("*", count="exact")
    .in_("loan_status", ["released", "disbursed", "fully paid", "partially paid"])
    .order("disbursal_date", desc=True)
    .range(start, start + page_size - 1)
    .execute()
)
total = resp.count
```

## Reference: safe batched data-simulation script (for developers, not to run against production)

This is a template for whoever on the dev team does load testing — **it should never be pointed at the same Supabase project as `TTMPC_THESIS/.env`**. Confirmed via `list_projects`: there is currently only **one** Supabase project on this account (`TTMPC_THESIS`, `gcnolzfwmdalltfilmea`) — no separate dev/staging project exists yet. Until one is created, there is nowhere safe to run this script; creating a disposable project (or a Supabase branch, if the plan supports it) should happen before anyone runs a bulk simulation, not after. It batches in chunks of 100 with a small delay between batches specifically to avoid the CPU-spike/connection-pool-exhaustion problem the original ask described, and connection-pool exhaustion is now a confirmed real risk on this project (finding #1 — `max_connections = 60`, ~27 already in use at idle), not just a theoretical concern.

```python
"""
Reference load-simulation script — FOR DEVELOPERS, run against a disposable
Supabase project only. This is not wired into the app and does not run
automatically. Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the
environment, and an explicit --i-know-this-is-not-production flag as a
guard rail against pointing it at the real cooperative's data by accident.
"""
import argparse
import os
import time
import uuid
from datetime import date, timedelta

from supabase import create_client

BATCH_SIZE = 100          # rows per batch — tune down if you still see spikes
BATCH_DELAY_SECONDS = 0.15  # pause between batches so PostgREST/connection
                             # pool isn't saturated by back-to-back writes


def make_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def chunked(items, size):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def simulate_members(supabase, count: int):
    rows = [
        {
            "id": str(uuid.uuid4()),
            "membership_id": f"SIM-{i:06d}",
            "first_name": f"TestFirst{i}",
            "last_name": f"TestLast{i}",
            "member_status": "active",
            "membership_date": (date.today() - timedelta(days=i)).isoformat(),
        }
        for i in range(count)
    ]
    inserted = 0
    for batch in chunked(rows, BATCH_SIZE):
        supabase.table("member").insert(batch).execute()
        inserted += len(batch)
        print(f"  member: {inserted}/{count}")
        time.sleep(BATCH_DELAY_SECONDS)
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--members", type=int, default=500)
    parser.add_argument("--i-know-this-is-not-production", action="store_true", required=True)
    args = parser.parse_args()

    supabase = make_client()
    print(f"Target: {os.environ['SUPABASE_URL']}")
    simulate_members(supabase, args.members)
    # Extend with simulate_loans(...), simulate_loan_payments(...) following
    # the same chunked+delay pattern, respecting the real FK relationships
    # (loans.member_id -> member.id, loan_payments.loan_id -> loans.control_number)
    # and the loan_status/schedule_status values the app's CHECK constraints allow.
```

This is intentionally a starting skeleton, not a complete generator — a developer who knows the exact fields the dashboards need stressed (loan volume vs. payment volume vs. member volume) should extend `simulate_loans`/`simulate_loan_payments` to match, and decide the target row counts based on what they're actually trying to reproduce.
