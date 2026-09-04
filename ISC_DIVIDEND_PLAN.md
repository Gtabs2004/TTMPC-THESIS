# Interest on Share Capital (ISC) — Design & Implementation Plan

**Status:** Designed, not yet implemented (as of 2026-09-04)
**Feature:** Annual dividend / Interest on Share Capital posting for members
**Owner module:** Bookkeeper & Cashier — Capital Build-Up (CBU)

---

## 1. What the feature does

A bookkeeper opens a modal, picks an accounting year and an interest rate
(e.g. 2026 at 5%), the system shows what every eligible member would earn, the
bookkeeper reviews it and confirms, and the system posts it permanently to the
database.

It stays a **modal** — not a new page or Accounting module. The modal is only the
user interface; the database does the actual financial work.

---

## 2. Current state

The modal already exists at `TTMPC_THESIS/src/components/InterestOnShareCapitalModal.jsx`
and is opened from both `Bookkeeper_CBU.jsx` and `Cashier_CBU.jsx`.

**Already working:**

- Two-stage flow (enter values → review preview)
- Second confirmation dialog before posting
- Summary cards (eligible members, total basis, total interest)
- Member-by-member breakdown table
- Reads real member CBU data (no dummy data)

**The one thing that is fake:**

`handleConfirmPost()` waits 600 milliseconds and shows a success message
**without writing anything to the database**. Making that one function real is
the whole job.

---

## 3. The calculation problem (the main reason for this revision)

### What it does now — and why it's wrong

The modal currently computes:

```
interest = current_balance × rate
```

A member's share capital **changes throughout the year**. Deposits land in March,
CBU is credited when a loan is released in August, a new member joins in June.

Using only the December balance means:

- Members who deposited late get **overpaid**
- Members who held money all year get **underpaid**

### The correct basis — average share capital

Work out the member's balance at the end of each of the 12 months, then average
those 12 numbers.

**Worked example**

| Period | What happened | Balance |
|---|---|---|
| Jan–Feb | carried in from last year | ₱20,000 |
| Mar–Jul | deposited ₱5,000 in March | ₱25,000 |
| Aug–Dec | loan released, CBU credited ₱1,000 | ₱26,000 |

```
Average = (20,000×2 + 25,000×5 + 26,000×5) ÷ 12
        = ₱296,000 ÷ 12
        = ₱24,666.67

Interest at 5% = ₱1,233.33
```

**Rule for members with no movement that year:** all 12 months use their
carry-in balance. They still hold share capital, so they still earn interest.

### Consequence for the code

The browser only receives current balances — it **cannot** compute this average.
So the "Calculate" button must ask the database rather than calculating locally.

> **Note:** the averaging formula is still subject to confirmation. It must live
> in **one** SQL function so a change later is a single `CREATE OR REPLACE` and
> nothing else moves.

### The interest rate is entered by the bookkeeper — never hardcoded

The rate is **not** a fixed value anywhere in the system. It is typed in by the
bookkeeper for each posting, because the General Assembly sets a different rate
each year (2026 might be 5%, 2027 might be 4.5%).

This is already correct in the existing modal:

| Behaviour | Where |
|---|---|
| Field starts **empty** — no preset value | `useState("")`, line 65 |
| `placeholder="5.00"` is grey hint text, **not** a value | line 187 |
| Calculate stays disabled until a valid rate is typed | line 296 |
| Validated as `0 < rate ≤ 100` | line 80 |
| Whatever is typed is what gets used | line 43 |

**Rules for the implementation:**

- The SQL functions take the rate as a **parameter**. They must never contain a
  default rate, a fallback rate, or a `COALESCE(rate, 0.05)`.
- The rate actually used is **stored** on both `isc_postings` and
  `isc_transactions`, so every record shows the rate it was posted at.
- If the rate parameter is missing or invalid, the function **raises an error**.
  It must not quietly substitute a default — a wrong rate silently applied to
  every member's balance is far worse than a failed posting.

> Compare with `loan_fee_policies.cbu_rate`, which *is* stored as a policy
> because it rarely changes. The ISC rate is deliberately **not** stored that
> way — it is a per-posting decision, so it is entered each time and recorded
> with the posting it belongs to.

---

## 4. How CBU currently works

### The `capital_build_up` table

| Column | Notes |
|---|---|
| `id` | uuid, primary key |
| `member_id` | → `member(id)`, ON DELETE CASCADE |
| `transaction_date` | timestamptz |
| `starting_share_capital` | numeric |
| `capital_added` | numeric |
| `deposit_account` | text — used in practice as a *source tag* |
| `ending_share_capital` | numeric — **the running balance** |
| `source_loan_id` | varchar, UNIQUE — added by a later migration |
| `source_payment_id` | text, UNIQUE — added by a later migration |
| `cbu_deposit_id` | text, UNIQUE — added by a later migration |

> The ERD (`ttmpc_erd.dbml` line 218) is slightly behind the SQL files — it does
> not yet list `deposit_account` or `cbu_deposit_id`. The SQL migrations are the
> source of truth.

**The established pattern:** every writer adds its own `source_*` column with a
UNIQUE constraint, and stamps `deposit_account` with a tag. ISC will follow this
same pattern rather than inventing a new one.

### Four things already write to this table

| Writer | `deposit_account` tag | Duplicate-prevention key |
|---|---|---|
| Loan disbursement trigger | `LOAN_CBU_RETENTION` | `source_loan_id` |
| Membership payment trigger | varies | `source_payment_id` |
| Cashier deposit (FastAPI) | `Cash` / `GCash` / etc. | `cbu_deposit_id` |
| Confirmation seed (Python) | `Initial Paid-Up Capital` | *(none)* |

ISC becomes the fifth: tag `INTEREST_ON_SHARE_CAPITAL`, key `source_isc_id`.

### Key relationship

```
member.id  ==  auth.uid()  ==  capital_build_up.member_id
```

`create_member()` sets the member's `id` to the Supabase auth UID
(`applicationConfirmation.py:496`). This means ISC needs **no join** to
`member_account` — only `member` and `capital_build_up`.

---

## 5. Three findings that shaped the design

### 5.1 Post from the frontend, not from FastAPI

`audit_resolve_actor()` returns the role `'service_role'` when the backend calls
it (`audit_log_schema.sql:53`).

So if FastAPI performed the posting, the audit trail would record
**"service_role"** instead of the bookkeeper's identity — silently breaking the
requirement to record *who* posted the dividend.

**Therefore:** the posting function is called directly from the browser with
`supabase.rpc()`, so `auth.uid()` is the real signed-in bookkeeper.

This is already the established pattern in this codebase — there are five
existing call sites, e.g. `useLoanEligibility.js:106` and `AuthContext.jsx:15`.

### 5.2 Auditing is already automatic

`audit_log_cashier_triggers.sql:118` places an AFTER INSERT trigger on
`capital_build_up` that writes an `audit_log` row (`entity_type = 'cbu'`) for
**every** insert.

ISC therefore gets audited for free. **Do not build a second audit system.** The
only work needed is stamping the `context` field so ISC rows are distinguishable
from hundreds of ordinary cashier deposits.

### 5.3 The deposit-ID trigger is a performance risk

`set_cbu_deposit_id()` runs BEFORE INSERT on every row and scans the entire table
with `MAX()` to compute the next `CBUD_NNN`. Posting for 300 members would mean
300 sequential full-table scans.

**Fix:** the ISC function supplies its own `cbu_deposit_id` values, so the
trigger's `IF NULL` branch never fires.

---

## 6. Eligibility rule

```
eligible  =  member_status = 'active'  AND  average_share_capital > 0
```

`member.member_status` is `'active'` or `'terminated'`, and is indexed
(`add_member_status_column.sql`).

That migration exists **because** read paths kept forgetting to filter out
terminated members. Paying interest to a terminated member would be a genuine
financial error, so this filter is mandatory.

---

## 7. Why database functions (RPC) instead of Python

**Speed.** Averaging per member in Python means one network round trip per
member — several seconds with a few hundred members, and it gets worse as the
cooperative grows. In SQL it is a single query.

**Atomicity — the real reason.** Posting touches three tables across every
member. The Supabase REST client has no multi-statement transaction, so a failure
halfway through would leave 60 members paid and 40 unpaid while the system
believes it finished. A database function runs as **one transaction**: either all
of it lands, or none of it does.

**No drift.** The preview and the posting call the *same* averaging function, so
the bookkeeper can never post a figure different from the one they reviewed.

**The honest cost:** `plpgsql` is harder to debug than Python and changes require
a migration rather than a redeploy. Worth it for this feature; not a general rule.

RPC is already an established pattern here — see `get_loan_eligibility_rpc.sql`.

---

## 8. Schema to be created

```sql
isc_postings                        -- one row per year posted
  id              uuid PK
  year            integer UNIQUE    -- duplicate prevention at the DATA layer
  rate            numeric(6,4)
  total_members   integer
  total_basis     numeric
  total_interest  numeric
  posted_by       uuid → member(id) -- auth.uid(), the real bookkeeper
  posted_by_email text
  posted_at       timestamptz
  status          text DEFAULT 'posted'

isc_transactions                    -- one row per member per posting
  id                     uuid PK
  isc_posting_id         uuid → isc_postings(id) ON DELETE CASCADE
  member_id              uuid → member(id)
  average_share_capital  numeric    -- the basis used, retained for audit
  total_share_capital    numeric    -- year-end figure, shown in the table
  rate                   numeric(6,4)
  interest_amount        numeric
  UNIQUE (isc_posting_id, member_id)

capital_build_up                    -- existing table, one column added
  + source_isc_id  uuid → isc_transactions(id), UNIQUE WHERE NOT NULL
```

The rate is stored on both tables deliberately — a line item should be
self-describing when read on its own.

**Duplicate-year prevention requires no application code.** The UNIQUE constraint
on `isc_postings.year` raises an error, the transaction aborts, and nothing is
written. A frontend check is added only for a friendlier message, never as the
actual guard.

---

## 9. The flow

```
Bookkeeper opens modal, selects 2026, enters 5%
        │
        ▼
[ Calculate ] ──► supabase.rpc('isc_calculate_preview')
        │           READ ONLY — nothing is saved
        ▼
   Preview shown: year, rate, eligible members,
   total basis, total interest, member breakdown
        │
        ▼
[ Confirm & Post ] ──► confirmation dialog ──► supabase.rpc('isc_post')
        │
        │   ONE TRANSACTION:
        │     1. INSERT isc_postings       (UNIQUE year blocks duplicates)
        │     2. INSERT isc_transactions   (one row per member)
        │     3. INSERT capital_build_up   (one row per member)
        │          └─► audit_log trigger fires with the REAL actor
        │   all of it, or none of it
        ▼
Member dashboard re-reads capital_build_up ──► shows updated balance
```

Two properties worth preserving:

- **Calculate writes nothing**, so the bookkeeper can try different rates freely.
- **The member's balance rises because the database says so** — never patched
  into frontend state.

---

## 10. Build order

1. **SQL migration** — the two tables, the `source_isc_id` column, the averaging
   function, and the posting function
2. **Wire the modal** — add the Average Share Capital column, replace the fake
   post with the real RPC call
3. *(No FastAPI endpoint required — the frontend calls the RPC directly)*

All changes are **additive**. The existing CBU triggers, the cashier deposit
flow, and the member dashboard query all continue to work unchanged.

---

## 11. Open items

- **The averaging formula is not final.** Kept in one SQL function so it can be
  swapped without touching anything else.
- **The schema described here comes from reading the SQL migration files**, not
  from querying the live database. If migrations were applied out of order, or
  something was changed directly in the Supabase editor, reality may differ.
  Worth verifying against the live schema before running the migration.
- **`ttmpc_erd.dbml` needs updating** once these tables exist — it is already
  missing `deposit_account`, `cbu_deposit_id`, and `member_status`.
