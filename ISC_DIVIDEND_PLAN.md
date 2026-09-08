# Interest on Share Capital (ISC) — Design & Implementation Plan

**Status:** ⚠️ **BUILT AND VERIFIED (2026-09-06), BUT TWO CONFIRMATIONS ON
2026-09-08 INVALIDATED PARTS OF IT.** The infrastructure is proven and sound; the
arithmetic layer and the posting model both need correcting.
**Start at §16** for where the plan stands, then §12 and §14 for the two
confirmations that changed it, then §0.

> **1. The rate is derived, not entered (§12).** The cooperative allocates an
> audited net surplus **pool**; the rate is `pool ÷ total average`. §3 assumed a
> bookkeeper-entered rate and is superseded.
>
> **2. ISC pays CASH (§14).** It does not automatically become share capital.
> Members may *elect* to capitalise their payout, decided at the **March General
> Assembly**. The shipped `isc_post` credits `capital_build_up` for every member
> unconditionally — that is wrong and must be split into a posting step and a
> separate, member-elected capitalisation step.

> **⛔ Do not post a real distribution on the current build.** It would compute
> the wrong figure *and* auto-credit every member's share capital. No bad data is
> live today — the verified posting was reversed and nets to ₱0.00.
**Feature:** Annual dividend / Interest on Share Capital posting for members
**Owner module:** Bookkeeper & Cashier — Capital Build-Up (CBU)

---

## 0. Status — end-to-end verification (2026-09-06)

**The feature is built, deployed, and proven against live data.** A complete
post → reverse cycle was executed on the real database and every check passed.

### What was proven

| Area | Result |
|---|---|
| Schema | `isc_postings`, `isc_transactions`, `source_isc_id`, `reverses_posting_id` all live |
| Calculation | 263 eligible members, ₱29,922,087.77 basis, ₱1,496,104.42 at 5% |
| Growth sanity | exactly 5.00% — matches the rate, so the basis is right |
| Divisor | 10 months for Dec 2025 – Sep 2026 ✅ |
| Rate guards | optional to calculate; 0%, 150% and pre-Dec-2025 all rejected |
| Atomic posting | 263 line items + 263 CBU rows + header, one transaction |
| **Chain integrity** | **0 broken links across 263 members** |
| Reversal | net effect exactly **₱0.00**; co-op total back to ₱30,232,587.77 |
| Audit trail | bookkeeper posted, manager reversed with written reason |

### The live record

```
posting   reversed    ₱ 1,496,104.42   bookkeeper@gmail.com
REVERSAL  posted      ₱-1,496,104.42   manager@gmail.com

capital_build_up: 812 rows   coop total ₱30,232,587.77 (baseline restored)
```

Nothing was deleted. The original posting stays visible as `reversed`, the
offsetting entry stays visible as `reversal`, and the ledger nets to zero.

---

### Six bugs found and fixed during verification

None of these were visible from reading the code alone — each was found by
running the feature against real data.

**1. Stale starting balance** *(`isc_post`)* — the CBU row used the member's
balance at *period end* rather than their current balance. On any back-dated
posting (the normal case) this would silently break the running-balance chain,
erasing every deposit made after the period. Measured: ₱16,400 and ₱23,600 lost
on two live members.

**2. Interest paid on interest** *(`isc_calculate_preview`)* — ISC rows from a
previous posting counted as basis for the next. The overlap constraint cannot
catch this because the month ranges genuinely do not overlap. Fixed with
`AND cbu.source_isc_id IS NULL`.

**3. NULL closing balance** *(`isc_calculate_preview`)* — a `period_end` that was
not a month's final day returned NULL.

**4. `posted_by` foreign key** *(`isc_postings`)* — **blocked posting entirely.**
The column referenced `member(id)`, but it stores `auth.uid()`, and none of the
six staff accounts have a member row under that id.

**5. Double reversal** *(`isc_reverse`)* — a reversal row carries
`status='posted'`, so the existing guard passed and a manager could have reversed
a reversal, re-crediting ₱1.49M. Fixed with an explicit `reverses_posting_id`
marker rather than inferring from a negative total.

**6. Co-op total read one member's balance** *(modal)* — showed ₱185,543.13 and
"+806% growth" instead of ₱30.2M and 5%. A direct `capital_build_up` read hit the
member-level RLS policy instead of the staff one. Now derived from the preview
rows, which come from a `SECURITY DEFINER` function.

> Bugs 4 and 6 shared one root cause: **staff accounts have two identities** —
> `member_account.user_id` (which is a member) and `auth_user_id` (which is not).
> `auth.uid()` returns the second. Worth remembering for any future feature that
> stores or filters by the acting user.

---

### Deployment order for a fresh database

Run in the Supabase SQL editor, in this order:

1. `is_cbu_staff_add_bookkeeper.sql` — without it the bookkeeper's RLS check
   fails and their history view returns an empty list with no error
2. `isc_dividend_schema.sql` — tables, functions, RLS, audit trigger
3. `isc_fix_stale_balance.sql` — bugs 1, 2, 3
4. `isc_fix_posted_by_fk.sql` — bug 4
5. `isc_fix_double_reversal.sql` — bug 5

All are idempotent and safe to re-run. Bug 6 is frontend-only, no SQL.

> The schema file has been updated in place, so a fresh deploy of
> `isc_dividend_schema.sql` already carries the bug-4 correction. The separate
> fix files remain for databases where the original was already applied.

---

### Still open

> **CLOSED 2026-09-08 — and the answer changed the design. See §12.**
>
> The formulas were confirmed with the bookkeeper. The cooperative distributes an
> **audited net surplus pool**, from which the rate is *derived* — it does not set
> a rate. The shipped system asks for a rate, so its arithmetic layer must be
> corrected before the next real posting. Migration plan in §12.5.
>
> Nothing wrong is sitting in live balances: the ₱1,496,104.42 posting above was
> reversed, and the ledger nets to ₱0.00.

~~The averaging formula is not confirmed with Romelyn.~~ Everything above proves
the system computes *what we specified* — a month-end average over the chosen
range, divided by the month count. It does not prove that is the formula the
cooperative actually uses.

It lives in one SQL function (`isc_calculate_preview`), so changing it is a
single `CREATE OR REPLACE` with nothing else touched.

---

## 0.5 How each person uses it — a walkthrough

Four people touch this feature, and each sees something different. This section
follows the whole cycle in order, as it happens in real life.

---

### 👤 The Bookkeeper — calculates and posts

**Where:** Bookkeeper portal → **Capital Build-Up** → **ISC Calculator** button

**Step 1 — Open the calculator.** A window appears with a progress strip across
the top: `① Choose period → ② Review → ③ Confirm`, so the shape of the task is
visible from the start.

**Step 2 — Choose the period.** One question: *"Which period are you paying
interest for?"* with two month pickers joined by "to".

As soon as both are valid, the screen shows **`10 months`** and explains:

> Each member's share capital will be averaged over these **10 months** — their
> total across the period divided by 10.

The earliest allowed start is **December 2025**. Earlier dates are refused,
because the cooperative has no month-by-month records before then.

**Step 3 — Enter the rate (optional here).** The rate can be left blank. The
field explains why:

> Leave blank to preview the members and total basis first — you can add the
> rate before posting.

This is useful when the General Assembly has not yet decided the percentage: the
bookkeeper can still ask *"how much is our total share capital basis?"*

**Step 4 — Click Calculate.** Nothing is saved. The database works out each
member's average and returns the preview:

| | |
|---|---|
| Period | Dec 2025 – Sep 2026 |
| Months | 10 |
| Rate | 5% |
| Eligible Members | 263 |
| Total Share Capital Basis | ₱29,922,087.77 |
| **Total Interest** | **₱1,496,104.42** |
| Cooperative share capital after posting | ₱31,728,692.19 (+5.00%) |

Below that, every member with their **total share capital**, their **average
share capital**, and their **interest**.

The bookkeeper can go **Back**, change the rate, and recalculate as often as they
like. Still nothing saved.

**Step 5 — Confirm & Post.** A second window asks *"Are you sure?"* and repeats
the numbers, including an amber panel:

```
EFFECT ON COOPERATIVE SHARE CAPITAL
Before    ₱30,232,587.77
After     ₱31,728,692.19
Growth              +5.00%
```

> **The growth line is a typo guard.** A correct 5% shows about +5%. A mistyped
> 50% would show about +50% — obvious at a glance, in a way a large peso figure
> is not when every figure on screen is already in the millions.

Clicking **Confirm & Post** writes everything in one go: the posting record, one
line per member, one CBU entry per member, and the audit trail. If anything
fails, none of it happens.

---

### 👥 The Members — see their balance grow

Nothing to do. The next time a member opens their dashboard, their share capital
is higher and a new entry appears in their history:

```
Killua F Zoldyck
  Before                        ₱10,000.00
  + INTEREST_ON_SHARE_CAPITAL   +   555.56
  ─────────────────────────────────────────
  New balance                   ₱10,555.56
```

The interest is **added to their share capital**, not paid out in cash. Their
dashboard reads the figure from the database — nothing is faked on screen.

---

### 🧾 The Cashier — looks things up at the counter

**Where:** Cashier portal → **Capital Build-Up** → **View Postings**

The cashier has **no ISC Calculator**. When a member asks *"how much interest did
I get?"*, they open View Postings and read what was actually paid.

They cannot run new calculations at arbitrary rates — viewing a fact and
computing a hypothetical are different things, and only the first is their job.

The Capital Build-Up page itself also now shows three figures at the top —
**total share capital**, **members with capital**, and **average per funded
member** — so a single balance has context.

---

### 📋 The Treasurer — checks the bookkeeper's work

**Where:** Treasurer portal → **ISC Postings**

The treasurer is the bookkeeper's counterpart: the bookkeeper calculates, the
treasurer checks. They see every posting and every member's breakdown, and they
can post nothing, calculate nothing, and reverse nothing.

---

### 🛡️ The Manager — reverses a mistake

**Where:** Manager portal → **ISC Postings**

If the rate was wrong, only the **manager** can undo it — never the bookkeeper
who posted it. That is deliberate: one person should not be able to move
₱1.49 million and quietly move it back.

Clicking **Reverse** requires a **written reason**. It cannot be left blank.

**Nothing is deleted.** The system posts the opposite, like a refund receipt:

| Entry | Rate | Amount | Status |
|---|---|---|---|
| Original posting | 5% | ₱1,496,104.42 | `reversed` |
| Offsetting entry | 5% | −₱1,496,104.42 | `reversal` |

Every member's balance returns to exactly what it was. Both rows stay visible, so
anyone can see what happened, who did it, and why.

A reversal **cannot itself be reversed** — it has no Reverse button, and the
database refuses even if the request is made directly. To pay a corrected amount,
the bookkeeper simply posts the period again at the right rate.

---

### The whole cycle, in one view

```
BOOKKEEPER                MEMBERS           TREASURER        MANAGER
    │                        │                  │               │
 Choose period               │                  │               │
    │                        │                  │               │
 Calculate ──► preview only  │                  │               │
    │          nothing saved │                  │               │
    │                        │                  │               │
 Confirm & Post ─────────────┼──────────────────┼───────────────┤
    │                        │                  │               │
    │                   balance up          reviews         can reverse
    │                        │              the work        with a reason
    │                        │                  │               │
    │                   balance back ◄──────────┼───────────────┘
                                                        (nothing deleted)
```

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

> ⚠️ **PARTIALLY SUPERSEDED 2026-09-08 — see §12 before implementing from this
> section.**
>
> The month-end averaging basis below is **still correct**. What is wrong is the
> rate: this section assumes the bookkeeper *enters* a percentage. The bookkeeper
> has since confirmed the cooperative approves an **audited net surplus pool** and
> the rate is *derived* from it (`pool ÷ total cooperative average`). Every rule
> below about entering, validating, and guarding the rate now applies to the
> **pool** instead, and payouts must reconcile to that pool exactly (§12.3).

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

Work out the member's balance at the end of **each month in the chosen range**,
then divide by **how many months are in that range**.

```
Average Share Capital  =  sum of each month-end balance
                          ──────────────────────────── 
                            number of months in range
```

**Worked example** — range Jan 2026 – Dec 2026 (12 months)

| Period | What happened | Balance |
|---|---|---|
| Jan–Feb | carried in from before | ₱20,000 |
| Mar–Jul | deposited ₱5,000 in March | ₱25,000 |
| Aug–Dec | loan released, CBU credited ₱1,000 | ₱26,000 |

```
Average = (20,000×2 + 25,000×5 + 26,000×5) ÷ 12
        = ₱296,000 ÷ 12
        = ₱24,666.67

Interest at 5% = ₱1,233.33
```

Had the bookkeeper chosen Jan–Jun 2026 instead, the same balances would be summed
over six months and divided by **6**, not 12.

**Rule for members with no movement in the range:** every month uses their
carry-in balance — the balance they held entering the range. They still hold
share capital, so they still earn interest.

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
| Validated as `0 < rate ≤ 100` | line 80 |
| Whatever is typed is what gets used | line 43 |

### The rate is optional to *calculate*, required to *post*

The bookkeeper can click **Calculate** with the rate left blank. This is useful:
it answers *"how many members are eligible, and what is our total share capital
basis for 2026?"* — a question worth asking before deciding on a rate at all.

| Stage | Rate blank? | What happens |
|---|---|---|
| **Calculate** | allowed | Shows eligible members, each member's average share capital, and the total basis. The interest column shows `—` rather than ₱0.00. |
| **Confirm & Post** | **blocked** | The Post button stays disabled. A short message explains that a rate is needed before posting. |

**Why blank is not treated as 0%.** Posting at 0% would create a full set of
permanent records paying every member nothing — an expensive, confusing, and
hard-to-undo no-op. A blank rate means *"not decided yet"*, so the interest
column shows `—` and posting is simply unavailable until a rate is entered.

**Rules for the implementation:**

- The SQL functions take the rate as a **parameter**. They must never contain a
  default rate, a fallback rate, or a `COALESCE(rate, 0.05)`.
- The rate actually used is **stored** on both `isc_postings` and
  `isc_transactions`, so every record shows the rate it was posted at.
- The **preview** function accepts a null rate and returns the averages with no
  interest computed.
- The **posting** function rejects a null, zero, or out-of-range rate by
  **raising an error**. It must not quietly substitute a default — a wrong rate
  silently applied to every member's balance is far worse than a failed posting.
  This is the real guard; the disabled button is only a convenience.

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

## 5.4 Who can do what

> ⚠️ **The Reverse column is SUPERSEDED — reversal is discarded (§17.1).** The
> current table is:
>
> | Role | View | Calculate | Post | Delete (unsettled only) | Settle |
> |---|---|---|---|---|---|
> | **Bookkeeper** | ✅ | ✅ | ✅ | ✅ | ✅ |
> | **Treasurer** | ✅ | ❌ | ❌ | ❌ | ❌ |
> | **Manager** | ✅ | ❌ | ❌ | ❌ | ❌ |
> | **Cashier** | ✅ | ❌ | ❌ | ❌ | ❌ |
>
> **The manager now has no ISC action** — `/manager-isc` becomes read-only.
> Segregation of duties has not been lost, it has moved: the bookkeeper can only
> correct *before* anything settles, and after that nobody can alter the record.
> That is a stronger control than reversal, which let one role undo a ₱1.49M
> posting after the fact. The historical table below is kept for context.

| Role | View | Calculate | Post | ~~Reverse~~ |
|---|---|---|---|---|
| **Bookkeeper** | ✅ | ✅ | ✅ | ❌ |
| **Treasurer** | ✅ | ❌ | ❌ | ❌ |
| **Manager** | ✅ | ❌ | ❌ | ~~✅~~ |
| **Cashier** | ✅ | ❌ | ❌ | ❌ |

This mirrors the cooperative's existing process: **the bookkeeper does the
calculation, and the treasurer checks it.** Only the bookkeeper runs the
calculation; everyone else sees the result.

**Posting and reversing are deliberately split between two people.**

The bookkeeper prepares and posts the interest. If it turns out to be wrong, the
**manager** — not the bookkeeper — is the one who reverses it.

This is *segregation of duties*, a standard accounting control. If one person
could both post ₱365,000 and quietly undo it, a mistake or an abuse could come
and go without anyone else ever seeing it. Requiring a second person to
acknowledge the correction means every reversal has a witness.

It also matches how the rest of the system already works — loan approvals route
through the manager rather than being self-approved by whoever prepared them.

### How it works in practice

The modal is a single shared component rendered on both pages
(`Bookkeeper_CBU.jsx:337` and `Cashier_CBU.jsx:275`). Rather than duplicating it,
it takes a **`canPost`** prop:

**"View" and "Calculate" are different things**, and the difference matters:

| Action | What it means | Who |
|---|---|---|
| **Calculate** | Open the ISC modal and run a new calculation over any period and rate | Bookkeeper only |
| **View** | Browse `IscPostingHistory` — the postings that were actually made, who made them, and what each member received | Bookkeeper, Treasurer, Manager, Cashier |

So the Cashier CBU page carries a **View Postings** button and **no ISC
Calculator**. A cashier answering a member at the counter needs to know what that
member *was actually paid* — a historical fact — not to run speculative
calculations at arbitrary rates.

> **Design note.** An earlier version of this document said the cashier could
> "Calculate and Preview only, with no Post button", and the code was built that
> way. That contradicted the table above and was wrong: with no stored preview,
> Calculate *is* the only way to see anything, so "view but not calculate" was
> unimplementable as written. Splitting the two — modal for calculating, history
> for viewing — makes the permission real rather than nominal.

The modal still takes a `canPost` prop. It stays `false` everywhere except the
Bookkeeper page, because the interface guard is only a courtesy — `isc_post()`
checks the caller's role itself regardless of which page called it.

Reversal is a separate action on the manager's side and is not part of this
modal — see §8.2.

**Where each role exercises "View":**

| Role | Page | Reversal |
|---|---|---|
| Bookkeeper | Capital Build-Up → *View Postings* | no |
| Treasurer | **ISC Postings** (`/treasurer-isc`) | no |
| Manager | ISC Postings (`/manager-isc`) | **yes** |
| Cashier | Capital Build-Up → *View Postings* | no |

The treasurer has a dedicated page because they are the bookkeeper's
counterpart — the bookkeeper calculates and posts, the treasurer checks. They
get the full posting history and per-member breakdown, and no way to post,
calculate, or reverse.

No database change was needed: `is_cbu_staff()` already allows *treasurer*, so
the RLS policies on `isc_postings` and `isc_transactions` admit them for SELECT.

### The real guard is in the database

`canPost` controls the interface only. Hiding a button is a courtesy, not
security — anyone can call the database function directly.

So **each database function checks the caller's role itself**:

- the **posting** function raises unless the caller is a **bookkeeper**
- the **reversal** function raises unless the caller is a **manager**

Even if the interface were bypassed entirely, a cashier could not post and a
bookkeeper could not reverse.

> `is_cbu_staff()` — which gates read access to `capital_build_up` — allows
> *bookkeeper, cashier, BOD, manager, treasurer*. That is correct for **reading**
> CBU data and stays as it is. Posting and reversing need **narrower** checks, so
> each function tests for its specific role rather than reusing `is_cbu_staff()`.
>
> Note this means the bookkeeper is deliberately **denied** by the reversal
> function even though they created the posting. That is the control working as
> intended, not an oversight — worth a code comment so nobody later "fixes" it.

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
isc_postings                        -- one row per posting
  id              uuid PK
  period_start    date              -- first month of the range (see §8.1)
  period_end      date              -- last month of the range
  month_count     integer           -- the divisor actually used
  rate            numeric(6,4)
  total_members   integer
  total_basis     numeric
  total_interest  numeric
  status          text DEFAULT 'posted'   -- 'posted' | 'reversed'
  posted_by       uuid → member(id) -- auth.uid(), the real bookkeeper
  posted_by_email text
  posted_at       timestamptz
  -- reversal fields, null until reversed (see §8.2)
  reversed_by       uuid → member(id)
  reversed_by_email text
  reversed_at       timestamptz
  reversal_reason   text

  CHECK (period_start >= DATE '2025-12-01')   -- §8.1.1
  CHECK (period_end   >= period_start)

  -- no two live postings may cover the same month (see below)
  EXCLUDE USING gist (
    daterange(period_start, period_end, '[]') WITH &&
  ) WHERE (status = 'posted')

isc_transactions                    -- one row per member per posting
  id                     uuid PK
  isc_posting_id         uuid → isc_postings(id) ON DELETE CASCADE
  member_id              uuid → member(id)
  average_share_capital  numeric    -- the basis used, retained for audit
  total_share_capital    numeric    -- closing balance at period_end
  rate                   numeric(6,4)
  interest_amount        numeric    -- negative on a reversal posting
  UNIQUE (isc_posting_id, member_id)

capital_build_up                    -- existing table, one column added
  + source_isc_id  uuid → isc_transactions(id), UNIQUE WHERE NOT NULL
```

Requires `CREATE EXTENSION IF NOT EXISTS btree_gist;` for the exclusion
constraint.

The rate is stored on both tables deliberately — a line item should be
self-describing when read on its own.

---

### 8.0 Overlap prevention — no month may be paid twice

With a single fiscal year, a `UNIQUE(year)` constraint was enough. **A free date
range needs more.**

Consider:

```
January   →  posts Dec 2025 – Dec 2026    ✅ everyone paid
March     →  posts Jan 2026 – Dec 2026    ❌ Jan–Dec 2026 paid AGAIN
```

Nothing about the second posting is obviously wrong — it is simply a different
range — yet twelve months of interest would be paid twice.

**The rule: two live postings may never share a month.** The second posting above
is refused because its months overlap an existing one.

This is enforced by a Postgres **exclusion constraint**, which is the range
equivalent of a UNIQUE index. It lives in the database, so it holds even if the
interface is bypassed entirely.

The `WHERE (status = 'posted')` clause matters for the same reason the old
partial UNIQUE did: once a posting is reversed it no longer occupies its months,
so a corrected posting covering the same period can go in normally.

**Allowed:**

| Existing | New | Result |
|---|---|---|
| Dec 2025 – Dec 2026 | Jan 2027 – Dec 2027 | ✅ no shared months |
| Dec 2025 – Dec 2026 *(reversed)* | Dec 2025 – Dec 2026 | ✅ reversed frees the range |

**Refused:**

| Existing | New | Result |
|---|---|---|
| Dec 2025 – Dec 2026 | Jan 2026 – Dec 2026 | ❌ 12 months overlap |
| Dec 2025 – Dec 2026 | Dec 2026 – Jun 2027 | ❌ Dec 2026 overlaps |

A frontend check is added only for a friendlier message, never as the actual
guard.

---

### 8.1 A month range, not a fiscal year

**There is no fiscal year in this design.** The bookkeeper picks a **start month
and an end month** — for example December 2025 to December 2026, or January 2026
to June 2026. The range can span several years.

This is because the basis is the member's **total share capital over the chosen
period**, and the cooperative does not always compute interest over a neat
twelve-month block.

**The divisor is the number of months in the range**, not a fixed 12:

| Range chosen | Months | Divisor |
|---|---|---|
| Dec 2025 – Dec 2026 | 13 | ÷ 13 |
| Jan 2026 – Dec 2026 | 12 | ÷ 12 |
| Jan 2026 – Jun 2026 | 6 | ÷ 6 |

```
Average Share Capital  =  sum of each month-end balance in the range
                          ─────────────────────────────────────────
                              number of months in the range
```

The posting stores `period_start` and `period_end`, so every record shows exactly
which months it covered.

---

### 8.1.1 The earliest possible start month is December 2025

**Ranges cannot begin before December 2025.** The system rejects an earlier start
month.

**Why.** The cooperative's share capital data was imported from a single
spreadsheet, `Normalized_Share_Capital.csv`. Every one of its 260 rows carries
the same `AsOfDate` of **2025-12-31** — it is a *balance snapshot*, not a history
of transactions. The column name says so.

That means no month-by-month history exists before December 2025. It was never
recorded, so it cannot be recovered.

If a range were allowed to start in, say, January 2023, the system would count
₱0 for 35 months for almost every member — not because they held nothing, but
because nobody wrote down what they held. Averages would come out far below the
truth, and members would be underpaid on the strength of missing data.

> **The alternative was rejected deliberately.** The system could have assumed
> each member held their December 2025 balance all the way back through 2023.
> That invents history and pays real money based on it, and it would tend to
> overpay long-standing members. Refusing the range is honest; guessing is not.

**This limit relaxes on its own.** Every genuine deposit, loan retention, and
membership payment from December 2025 onward is recorded properly, so the usable
window grows a month at a time. By the end of 2027, a two-year range is fully
supported by real data.

---

### 8.2 Reversal — correcting a posting that has already gone out

**The situation.** The bookkeeper posts FY2026 at 5%. The General Assembly then
resolves that it should have been 4%. The money has already been added to every
member's share capital.

**The rule: never delete, never edit. Post the opposite.**

A reversal does **not** remove the original records. It creates a second posting
whose amounts are negative, cancelling the first. This is how accounting systems
handle corrections, and it is the only approach that:

- keeps the original posting visible and auditable — it genuinely happened
- works with the CBU running-balance model, which only ever appends rows
- leaves a clear record of *who* corrected it, *when*, and *why*

**What happens on reversal:**

1. The original posting's `status` becomes `'reversed'`, and `reversed_by`,
   `reversed_at`, and `reversal_reason` are filled in.
2. A **new** posting row is created for the same fiscal year, carrying negative
   totals.
3. One negative `isc_transactions` row per member — the exact amount they
   originally received, negated.
4. One `capital_build_up` row per member with a **negative** `capital_added`,
   bringing each balance back down to where it was.

All of it in a single transaction, exactly like the original posting.

**Why the UNIQUE index is partial.** `UNIQUE (fiscal_year) WHERE status =
'posted'` means only one *live* posting per fiscal year. Once FY2026 is reversed,
it no longer occupies the slot, so a corrected FY2026 posting at 4% can go in
normally. Without the `WHERE` clause, a reversed year would be permanently
blocked and the correction impossible.

**The resulting history for FY2026** — three rows, telling the whole story:

| Posting | Rate | Total | Status |
|---|---|---|---|
| Original | 5% | ₱365,000.00 | `reversed` |
| Reversal | 5% | −₱365,000.00 | `posted` |
| Corrected | 4% | ₱292,000.00 | `posted` |

Net effect on members: 4%. Nothing was hidden, and every step is attributable.

**Guardrails:**

- A posting can only be reversed **once** — reversing an already-`'reversed'`
  posting raises an error.
- A reversal requires a written `reversal_reason`. It is not optional.
- Reversal is a **separate, deliberate action** — never a side effect of posting.
  The bookkeeper must open the existing posting and explicitly choose to reverse.
- Members' balances can go **down** as a result. This is correct and intended,
  but it means the confirmation dialog for a reversal must be at least as
  explicit as the one for a posting.
- **Only a manager may reverse** — the reversal function raises for any other
  role, including the bookkeeper who created the posting (§5.4).

**Where reversal lives in the interface.** Reversal is *not* part of the ISC
modal — that modal belongs to the bookkeeper, who cannot reverse. It is a
separate action on the manager's side, reached from the list of past postings.
Its confirmation dialog must state plainly that member balances will decrease,
and must require the written reason before the button becomes available.

---

### 8.3 Rounding

Money must round consistently or the totals will not match the line items.

- Each member's interest is rounded to **2 decimal places** at the moment it is
  calculated: `round(average_share_capital * rate, 2)`.
- The posting's `total_interest` is the **sum of those already-rounded amounts**,
  never a separate calculation on the grand total.

If the total were computed independently, it could differ from the sum of the
rows by a few centavos — and the member table would visibly fail to add up.
Rounding first, then summing, guarantees they always agree.

---

## 9. The flow — step by step

Here is the whole feature told as a story. Imagine it is January 2027 and the
cooperative has decided to give members 5% interest on their share capital
for the year 2026.

### Step 1 — The bookkeeper opens the modal

They are on the Capital Build-Up page and click the **Interest on Share Capital**
button. A window pops up over the page.

> **The cashier can open this too — but only to look.** They see the same
> figures, which is useful when a member asks about their interest at the
> counter. But the **Post** button does not appear on their screen. Only the
> bookkeeper can actually post.

### Step 2 — They choose the months, and optionally the rate

| Field | What they enter | Required? |
|---|---|---|
| From month | `December 2025` | Yes |
| To month | `December 2026` | Yes |
| Interest Rate | `5` | **Optional at this stage** |

The range does not have to be a whole year. It could be six months, or two
years — whatever period the cooperative is paying interest for.

> **The earliest you can start is December 2025.** Before that date the
> cooperative has no month-by-month records — only a single balance snapshot —
> so the system would have to guess. It refuses instead. This limit moves
> forward on its own as real transactions build up.

The rate can be left blank for now. Sometimes the bookkeeper wants to see the
membership figures *before* deciding on a rate — for example, to check the total
share capital before the General Assembly agrees on a percentage.

### Step 3 — They click **Calculate**

The system asks the database: *"For every active member, what was their average
share capital across these months?"*

It looks at each member's balance at the end of every month in the range, adds
those up, and divides by the number of months. A 13-month range divides by 13; a
6-month range divides by 6.

**If a rate was entered**, the database also multiplies each average by that rate
and returns each member's interest.

**If the rate was left blank**, the preview still shows every eligible member and
their average share capital — the interest column simply shows a dash (`—`)
instead of an amount. The bookkeeper can then type a rate and click Calculate
again to fill it in.

> **Nothing is saved at this point.** This is only a preview. The bookkeeper can
> try 5%, then 4%, then 4.5%, as many times as they like. No member's money is
> touched.

### Step 4 — They review the preview

The modal now shows a summary at the top:

- Accounting Year: **2026**
- Interest Rate: **5%**
- Eligible Members: **100**
- Total Share Capital Basis: **₱7,300,000.00**
- Total Interest to Pay: **₱365,000.00**

And underneath, a table of every member:

| Member | Total Share Capital | Average Share Capital | Rate | Interest |
|---|---|---|---|---|
| Juan dela Cruz | ₱50,000.00 | ₱45,000.00 | 5% | ₱2,250.00 |
| Maria Santos | ₱30,000.00 | ₱28,000.00 | 5% | ₱1,400.00 |
| … | | | | |

### Step 5 — They click **Confirm & Post**

**A rate is required here.** If it was left blank, the Post button stays greyed
out with a short note explaining that a rate is needed. Calculating without a
rate is fine; posting without one is not.

Once a rate is entered, a second smaller window appears asking *"Are you sure?"*
It repeats the important numbers — the year, the rate, how many members, and the
total amount — and warns that this will create permanent records.

This second step exists so nobody posts ₱365,000 by clicking the wrong button.

The bookkeeper clicks **Confirm & Post**, or **Cancel** to go back.

> A blank rate is never treated as 0%. Posting at 0% would create a full set of
> permanent records paying everyone nothing — easy to do by accident and awkward
> to undo. Blank means *"not decided yet"*, so posting is simply unavailable.

### Step 6 — The database does the actual work

This is the important part. The database does **four things at once**:

1. Creates **one record for the whole posting** — year 2026, rate 5%, 100
   members, ₱365,000 total, who posted it, and the date and time.
2. Creates **one record per member** — showing that member's average balance and
   their exact interest amount.
3. **Adds the interest to each member's share capital**, so their balance goes up.
4. **Writes an audit entry** recording who did this and when.

> **All four either succeed together, or none of them happen.**
>
> This matters. Without it, the system could pay 60 members, hit an error, and
> stop — leaving 40 members unpaid while the records claim the posting finished.
> By doing everything in one go, that situation cannot occur. If anything goes
> wrong, the database undoes everything and the bookkeeper simply tries again.

### Step 7 — Members see their new balance

The next time a member opens their dashboard, it reads their balance **from the
database** and shows the higher figure.

The member's balance went up because the database record says so — not because
the screen was told to display a bigger number.

---

### What stops the same months being paid twice?

Imagine the bookkeeper posts interest for **December 2025 to December 2026**.
Everyone gets paid.

Two months later, someone posts interest for **January 2026 to December 2026**.

Nothing looks wrong — it is a different range. But twelve of those months were
already paid, so members would receive interest **twice** for the same period.

**The database refuses the second posting.** The rule is simple:

> No two postings may cover the same month.

The system checks the months, sees the overlap, and stops it before anything is
saved.

| Already posted | Trying to post | Result |
|---|---|---|
| Dec 2025 – Dec 2026 | Jan 2027 – Dec 2027 | ✅ Allowed — no shared months |
| Dec 2025 – Dec 2026 | Jan 2026 – Dec 2026 | ❌ Refused — 12 months overlap |
| Dec 2025 – Dec 2026 | Dec 2026 – Jun 2027 | ❌ Refused — Dec 2026 overlaps |

This protection lives in the database itself, not just on the screen. Even if
someone bypassed the app entirely, they still could not pay the same month twice.

*(If a posting is reversed, its months become free again — so a corrected
posting for the same period is allowed.)*

---

### What if the rate was wrong and needs correcting?

Say FY2026 was posted at 5%, and the General Assembly then decides it should
have been 4%. The money is already in members' accounts.

**The system does not delete or edit the original posting.** Instead it does what
accountants do: it posts the *opposite* to cancel it out, then posts the correct
one.

Think of it like a receipt. If a shop charges you ₱500 by mistake, they do not
erase the receipt — they issue a refund receipt for −₱500, then charge the right
amount. All three records exist, and anyone can see what happened.

For FY2026 that gives three entries:

| What | Rate | Amount | Status |
|---|---|---|---|
| The original posting | 5% | ₱365,000.00 | Reversed |
| The cancelling entry | 5% | −₱365,000.00 | Posted |
| The corrected posting | 4% | ₱292,000.00 | Posted |

Members end up with 4%, which is right. And the records show exactly what
happened, who corrected it, when, and why.

**Four rules protect this:**

- **Only the manager can reverse** — not the bookkeeper who posted it.
- Reversing requires a **written reason**. It cannot be left blank.
- A posting can only be reversed **once**.
- Reversing is a **separate deliberate action** — the manager has to open the
  posting and choose to reverse it. It never happens automatically.

> **Why can't the bookkeeper reverse their own posting?**
>
> Because then one person could post ₱365,000 and quietly undo it with nobody
> else ever knowing. Requiring the manager means every correction has a second
> person who saw it happen. This is a normal accounting control, and it is the
> same reason the manager approves loans rather than the person who prepared them.

> Members' balances go **down** when a posting is reversed. That is correct — the
> money is being taken back so the right amount can be given instead — but it
> means the confirmation warning for a reversal is just as serious as the one
> for a posting.

---

### Two things worth remembering

**Calculate never saves anything.** Only Confirm & Post does. So the bookkeeper
can experiment with different rates safely.

**The member's balance comes from the database.** The app never edits a balance
on screen and calls it done — it saves to the database, then reads it back.

---

### The same flow, in short

```
Bookkeeper enters year + rate
        ↓
   [ Calculate ]  ──►  preview only, nothing saved
        ↓
   Reviews the numbers
        ↓
   [ Confirm & Post ]  ──►  "Are you sure?"
        ↓
   Database saves everything at once (or nothing at all)
        ↓
   Members see their updated balance
```

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

## 11. Verified against the live database

The schema was checked directly against Supabase on **2026-09-04** (read-only).

| Checked | Result |
|---|---|
| Does an ISC/dividend table already exist? | **No** — safe to create |
| `capital_build_up` columns | **Exactly as documented** (all 10) |
| `member_status` column present | **Yes** — 295 members, all `active`, 0 terminated |
| Total CBU rows | 288 |
| Members holding CBU | 263 of 295 active |
| `total_share_capital` = closing balance | **Confirmed** — ₱29,901,108.93 across active members |

### 11.1 ✅ Prerequisite RESOLVED — the running balance chain (fixed 2026-09-04)

ISC computes each member's average by walking `ending_share_capital` forward
month by month. That chain was broken, which would have produced wrong interest
written permanently into member balances. **Both the data and the cause are now
fixed.**

#### What was wrong

Every row was individually correct (`ending = starting + added` held on all 288),
but rows did not join up — a row's `starting_share_capital` did not always
continue from the previous row's `ending_share_capital`.

**9 broken links** across the 5 members with more than one CBU row. Two ways of
totalling the cooperative's share capital disagreed by **₱446,478.84**.

#### The root cause

`main.py` picked the member's "latest" row with:

```python
.order("transaction_date", desc=True)
.order("id", desc=True)          # ← id is gen_random_uuid()
```

The comment claimed `id` made "the most recently inserted row consistently win".
It does not — `id` is a **random** UUID with no relation to insertion order. And
**270 of 285 rows store date-only timestamps**, so same-day deposits always tie
on `transaction_date` and fall through to that random tiebreaker.

> This was **not** a race condition. It was a deterministic ordering bug that
> fired whenever a member had two deposits on the same day.

Measured by simulation over 200 trials of three same-day deposits:

| Ordering | Wrong starting balance |
|---|---|
| Old — `transaction_date`, then random UUID | **106 / 200 (53%)** |
| New — `transaction_date`, then CBUD sequence | **0 / 200 (0%)** |

#### The two fixes applied

**1. Data repaired.** A dry-run-first script deleted 3 duplicate
`INITIAL_PAID_UP_CAPITAL` rows and recomputed 15 running-balance rows across 3
members. `capital_added` was never modified — only the two running-balance
columns. Verified afterwards: **0 broken links across 285 rows.**

The one repair that mattered was a real member:

```
YOLANDA TADIT [TTMPC-183]   ₱40,000.00  →  ₱160,978.84
```

Her ₱120,978.84 imported opening balance was being ignored. The other affected
accounts were test accounts.

**2. Endpoint corrected.** The tiebreaker is now `cbu_deposit_id`'s numeric
suffix, which `trg_set_cbu_deposit_id` assigns sequentially. It is parsed to an
integer in Python rather than sorted as text, so `CBUD_100` sorts after
`CBUD_099` — text sorting would have reintroduced the bug at 100 deposits.

> **Backup:** `cbu_backup_20260904_223531.json` holds all 288 original rows.

#### Still open (not blocking)

`capital_build_up` has **no `created_at` column**, so `cbu_deposit_id` is the
best available proxy for insertion order. A proper timestamp column would be more
robust, and would also let the ISC averaging function order rows without relying
on the deposit-ID convention.

### 11.2 What the current data means for ISC

- **258 of 288 rows** are the single `historical_import_2025` batch dated
  2025-12-31 (₱29.6M). Only **6 members** have any movement after it.
- A posting today would therefore use the carry-in rule for nearly everyone —
  correct and well defined, but the average will barely differ from the opening
  balance until real transactions accumulate.
- **32 active members hold no CBU row at all** and would be excluded under
  `average > 0`. Worth confirming this is intended.

### 11.4 ⛔ DO NOT USE `member.membership_date` — it is an import artifact

**This field looks authoritative and is not. Do not build eligibility, tenure,
or ISC rules on it.**

#### The evidence

| Check | Result |
|---|---|
| Members whose `membership_date` == `created_at` | **295 / 295** |
| Distinct `membership_date` values across 295 members | **8** |
| Members sharing 2026-04-23 (the bulk upload day) | **264** |
| Members whose **first CBU row predates** their `membership_date` | **258** |

That last row is the proof. 258 members hold share capital dated 2025-12-31 —
*before* the date the system claims they joined. Impossible if the field were
real. It records the day the row was inserted, nothing more.

#### The real dates exist, but were lost in normalisation

The cooperative's raw spreadsheet has a **"Date of Membership"** column with
genuine values (07/17/2021, 07/13/2019 — long-standing members, as expected).

`Normalized_Profiles.csv` carries a `DateJoined` column for it — **empty in all
264 rows**. The column survived normalisation; the data did not. The raw
spreadsheet is not in the repository.

#### Why this matters for ISC — a bug that was proposed and rejected

Filtering the averaging window by `membership_date <= month_end` looks obviously
correct: don't pay a member for months before they joined. Applied to this data
it would be **catastrophic**.

Posting Dec 2025 – Dec 2026, the 264 members stamped 2026-04-23 would count as
non-members for December through March. Their balances would read ₱0 for those
four months, and nearly every long-standing member in the cooperative would be
underpaid by roughly a third.

**The current behaviour is correct precisely because it ignores this field.**
The carry-in rule (§3) uses the imported 2025-12-31 balance for earlier months,
which is right for someone who has been a member since 2019.

> This is the same failure mode as `Normalized_Share_Capital.csv`'s `AsOfDate`
> (§8.1.1): a column whose name promises more than its contents deliver. Both
> were caught by checking the data rather than trusting the schema.

#### To make the field usable

Backfill it from the cooperative's raw membership spreadsheet, matching on name
the way `import_share_capital.py` did. That import needed a review step for
ambiguous matches, so this one would too — dry run first, then approve.

Until that happens, treat `membership_date` as **unreliable**, and leave the ISC
averaging window as it is.

> **ISC does not need this backfill** (confirmed 2026-09-08, §12.6). The basis is
> the CBU ledger, and rule 1's carry-forward already tells a June joiner (no CBU
> rows before June, so a genuine ₱0) apart from a member since 2019 (a Dec 2025
> closing balance carried into January). The backfill remains worth doing for
> *other* features that need a real join date — it is simply not a prerequisite
> for a distribution.

### 11.3 Remaining open items

**~~The averaging formula is still unconfirmed.~~ CLOSED 2026-09-08 — see §12.**
Confirmed with the bookkeeper; the confirmed spec is pool-based, not rate-based,
and supersedes §3. The swap is still a single `CREATE OR REPLACE` on
`isc_calculate_preview`, plus the column additions in §12.5.

**The ÷12 divisor is also confirmed (§12.6)** — always 12, never a per-member
month count. `membership_date` is *not* involved and needs no backfill: the basis
comes from the CBU ledger, and rule 1's carry-forward (a historical member's
January opening = their December 2025 CBU closing balance) separates a real
mid-year joiner from a long-standing member on its own.

**Two things block a first posting:** the §12.5 pool-based SQL correction, and the
§14 cash-vs-capitalisation split. Both rewrite `isc_post`, so do them in one
migration rather than in series (§14.5).

**`ttmpc_erd.dbml` needs updating.**
It is missing `deposit_account`, `cbu_deposit_id`, and `member_status`, and will
need the two new ISC tables once they exist.

---

## 12. CONFIRMED SPEC — the ISC Distribution Module supersedes §3 (2026-09-08)

**Status: the averaging and distribution formulas are no longer open.** They were
confirmed directly with the bookkeeper. The authority is now:

- `TTMPC_THESIS/src/ISC Notes/ISC_DISTRIBUTION_MODULE.md` — the seven accounting
  rules, transcribed from the cooperative's accounting spec
- `TTMPC_THESIS/src/ISC Notes/ISCDistributionModule.tsx` — the approved UI and a
  working reference implementation of the arithmetic

Everything in §3 that describes a bookkeeper-entered rate is **superseded**. §11.3's
"averaging formula still unconfirmed" is **closed**. The rest of this document —
the CBU mechanics, the RPC/atomicity argument, the permissions split, the reversal
model, the six bugs — still stands unchanged.

> Where this document and the module's note disagree on arithmetic, **the module's
> note wins.** It is the transcription of the cooperative's own spec.

---

### 12.1 What changed: the rate is derived, not entered

This is the substantive change, and it inverts the core of the shipped feature.

The shipped system asks **"what rate?"** and computes the total interest from it.
The confirmed spec asks **"what is the pool?"** — the audited net surplus allocated
for ISC — and derives the rate:

```
ISC Rate = Audited Net Surplus Allocated for ISC ÷ Total Cooperative Average
```

The General Assembly approves an *amount* out of the audited surplus. The rate is
whatever that amount works out to across the membership. §3 assumed the opposite,
and that assumption is now known to be wrong.

Everything else follows from it. Once the pool is the authority, the payouts must
sum to it **exactly** — that is rule 7, a hard constraint, not a tolerance — which
is why the spec requires largest-remainder reconciliation that the shipped system
does not have.

---

### 12.2 The seven confirmed rules

Transcribed from the module's note. These are the authority; where code disagrees,
the formulas win.

**1. Monthly running balance (per member)**

```
Month m Balance = Month (m-1) Balance + CRJ_m − CDJ_m
```

For January, the previous balance is the starting share capital carried forward
from the prior fiscal year. The balance carries forward month to month; it does not
reset.

**2. Member annual cumulative total**

```
Member Total = Σ (Month m Balance) for m = 1..12
```

This sums the twelve **month-end balances**, not the transactions. A member holding
a flat ₱10,000 all year with no deposits has an annual total of ₱120,000, not zero.
The note flags this as the single most common misreading of the spec.

**3. Individual member average (AMSC)**

```
Member Average = Member Total ÷ 12
```

**Always 12**, including for members who joined mid-year — their early months simply
carry zero. Confirmed with the bookkeeper: a member joining in June with ₱10,000
gets ₱70,000 ÷ **12** = ₱5,833.33, not ÷ 7. They earn 7/12 of a full share, which
is the intent — the average is time-weighted. **Never compute a per-member
divisor.** §12.6 has the worked example and explains why `membership_date` plays
no part in it.

**4. Total cooperative average share capital**

```
Total Cooperative Average = Σ Member Average
```

The sum of the individual averages. Do **not** compute it as the grand cumulative
total ÷ 12 as a shortcut — the two agree arithmetically, but the spec defines it
this way and the footer must display the sum of the column above it.

**5. Cooperative ISC rate**

```
ISC Rate = Audited Net Surplus Allocated for ISC ÷ Total Cooperative Average
```

Computed once per batch, applied identically to every member.

**6. Individual member payout**

```
Member Payout = Member Average × ISC Rate
```

**7. Reconciliation check**

```
Σ Member Payouts = Total Audited Net Surplus Allocated for ISC
```

Exactly. Not approximately, not within a tolerance.

**Precision.** The rate is held unrounded and used unrounded in every payout.
Rounding happens only at display time. Do not round the rate into storage, do not
store it as a fixed-decimal string, and do not round intermediate averages.

---

### 12.3 Largest-remainder reconciliation

Rounding each payout independently leaves the batch a few centavos off the pool,
the journal entry does not balance, and the batch cannot be posted. The spec's
`reconcileToPool` floors every payout to the centavo, then assigns the residual
centavos to the rows with the largest discarded fractions.

Rows that receive a residual centavo are flagged `adjusted` and render a small amber
dot; the tooltip shows the unrounded value. **Keep this** — it lets an auditor trace
a one-centavo difference instead of assuming a bug.

> **Both sides must implement the same allocation and agree to the centavo.** The
> posting is server-side (§7), so the SQL is authoritative and the frontend must
> reproduce it exactly. Never let the two round independently.

**Regression fixture.** `SAMPLE_MEMBERS` in the module is a test in disguise. With
the pool at ₱20,000.00 it must produce exactly:

| Member | Annual total | Average | Payout |
| --- | ---: | ---: | ---: |
| Gero, Juan Miguel | 438,000.00 | 36,500.00 | ₱4,104.97 |
| Bautista, Maria Corazon | 1,296,000.00 | 108,000.00 | ₱12,146.20 |
| Delos Santos, Ramon | 70,000.00 | 5,833.33 | ₱656.04 |
| Villanueva, Anna Liza | 90,000.00 | 7,500.00 | ₱843.49 |
| Ocampo, Jose Enrique | 120,000.00 | 10,000.00 | ₱1,124.65 |
| Fernandez, Grace Ann | 120,000.00 | 10,000.00 | ₱1,124.65 |
| **Total** | **2,134,000.00** | **177,833.33** | **₱20,000.00** |

ISC rate `0.11246485473289597` (displayed `11.246485%`). Four residual centavos land
on Ocampo, Fernandez, Gero, Villanueva, in that order of fractional size.

**Port this fixture into a SQL test.** The same pool and the same twelve month-end
balances must come back from `isc_calculate_preview` to the centavo, with the same
four rows adjusted. A frontend-only test does not protect the posting path.

---

### 12.4 What this costs the shipped system

The feature verified end-to-end on 2026-09-06 (§0) computes a *different number*
than the confirmed spec. It is not wrong in its mechanics — the atomicity, the chain
integrity, the reversal model, and the audit trail all hold, and all six bugs stay
fixed. What changes is the arithmetic layer sitting on top.

| Component | Status |
|---|---|
| `isc_postings`, `isc_transactions`, `source_isc_id` | keep — needs new columns |
| `isc_post` atomicity, CBU chain, pre-supplied deposit ids | keep unchanged |
| `isc_reverse` + double-reversal guard | keep unchanged |
| Overlap `EXCLUDE` constraint | keep unchanged |
| Permissions (bookkeeper posts, manager reverses) | keep unchanged |
| `isc_calculate_preview` rate handling | **rewrite** — derive, don't accept |
| Rounding | **replace** — largest-remainder, not per-row round |
| Modal rate input | **replace** — pool input |
| §3's rate-entry rules | **superseded** |

The ₱1,496,104.42 figure in §0 was posted and then reversed, so **nothing wrong is
sitting in live balances.** The net is ₱0.00 and the co-op total is back to
₱30,232,587.77. There is no data repair to do — only a correction to make before the
next real posting.

---

### 12.5 Migration plan (SQL)

Additive and idempotent, matching the deployment pattern in §0. Nothing here touches
the CBU chain or the reversal logic.

**Step 1 — `isc_add_pool_column.sql`**

```sql
ALTER TABLE isc_postings
  ADD COLUMN IF NOT EXISTS allocated_pool numeric,
  ADD COLUMN IF NOT EXISTS total_average  numeric;

ALTER TABLE isc_transactions
  ADD COLUMN IF NOT EXISTS payout_unrounded numeric,
  ADD COLUMN IF NOT EXISTS adjusted         boolean NOT NULL DEFAULT false;
```

`allocated_pool` is the GA-approved amount and becomes the primary input.
`total_average` is rule 4's denominator, stored so the rate is reproducible from the
record alone. `payout_unrounded` and `adjusted` carry the audit trail for the
centavo allocation — without them a one-centavo difference is untraceable after the
fact, which is the whole point of the amber dot.

`rate` stays on both tables. It is now *derived* rather than entered, but a line item
must still be self-describing (§8).

**Step 2 — `isc_pool_based_calculation.sql`** — `CREATE OR REPLACE` on
`isc_calculate_preview`:

- take `p_allocated_pool numeric` in place of `p_rate`
- keep the existing month-end balance walk and the `source_isc_id IS NULL` guard
  (bug 2 — interest must never be paid on interest)
- compute each member average per rule 3, sum them per rule 4 into `total_average`
- derive `rate := p_allocated_pool / total_average`, **unrounded**
- compute `payout_unrounded := average * rate` per rule 6
- apply largest-remainder allocation: `floor(payout * 100) / 100` for every row,
  distribute `pool − Σ floored` centavos to the largest fractional parts, mark those
  rows `adjusted`
- pool null → return averages and `total_average` with payout `NULL` (not 0.00), so
  the "what is our basis?" preview still works before the GA decides an amount

**Step 3 — same file** — `CREATE OR REPLACE` on `isc_post`:

- accept the pool; reject null, zero, or negative by `RAISE` (§3's guard, retargeted
  from rate to pool — never `COALESCE` a default)
- **re-verify rule 7 server-side before writing**: `Σ interest_amount = pool` exactly,
  or `RAISE`. The client's arithmetic is never trusted for the posting itself; the
  disabled button is a convenience, not a control.
- persist `allocated_pool`, `total_average`, the derived `rate`, and per row
  `payout_unrounded` and `adjusted`

**Step 4 — reversal.** `isc_reverse` needs no formula change: it negates stored
amounts. Confirm the negated set still sums to `−allocated_pool` exactly and store
the negated pool on the reversal header for symmetry.

> **§14 changes Steps 3 and 4 substantially.** `isc_post` must also stop writing
> `capital_build_up` rows (ISC pays cash; capitalisation is a separate elected
> step), and reversal becomes mostly a status change because there are usually no
> CBU rows to undo. Fold §14.3 into this migration rather than doing it after —
> both rewrite the same two functions.

**Step 5 — frontend. See §13 — the UI moves out of the modal onto its own page.**
The ledger grid does not fit a `max-w-2xl` dialog, so posting moves to a new
`/bookkeeper-isc` page and the modal is demoted to a read-only "what's our basis?"
lookup on both CBU pages. The modal's rate field becomes a pool field with the
derived rate shown read-only alongside the total average. The growth-percentage
typo guard (§0.5) still works and is still worth keeping — a mistyped pool shows an
obviously wrong growth figure.

> **§13.5 and §15.3 add one requirement to Step 2:** `isc_calculate_preview` must
> also return the **per-month series** — `month_end_balances`, `crj_by_month`,
> `cdj_by_month` and `opening_balance`. The balances already exist inside the
> function and are collapsed by `AVG()`; the CRJ/CDJ movements are new and come
> from `capital_added`, **not** from differencing `ending_share_capital` (§15.3).
> Keep the existing scalar columns so the modal keeps working unchanged.

**Deployment order** — append to §0's list as steps 6 and 7. All idempotent.

---

### 12.6 Mid-year joiners — confirmed, and why `membership_date` is irrelevant

**Confirmed with the bookkeeper 2026-09-08.** Rule 3 is literal: the divisor is
**always 12**, even for a member who was not a member for all twelve months.

**Worked example — a member joins in June with ₱10,000 starting share capital:**

| Months | Balance |
|---|---:|
| Jan – May | ₱0 (no CBU rows yet — not a member) |
| Jun – Dec | ₱10,000 |

```
Member Total   = ₱10,000 × 7 months        = ₱70,000
Member Average = ₱70,000 ÷ 12  (NOT ÷ 7)   = ₱5,833.33
```

Divide by 7 and they would receive a full year's interest on capital they held
for seven months — the same amount as someone who held ₱10,000 since January.
Dividing by 12 gives them **7/12 of a full share**, which is the point: the
average is a *time-weighted* measure of how much capital the member had working
in the cooperative across the whole period.

> The fixture in §12.3 already encodes exactly this case. **Delos Santos, Ramon**
> — ₱70,000 annual total → ₱5,833.33 average → ₱656.04 payout. That row is a
> mid-year-joiner regression test, and the reference implementation passes it.

**Implementation note:** do not "optimise" the divisor to a per-member month
count. It is a constant 12 (or, for a non-calendar range, the month count of the
range — the same constant for every member in the batch). A per-member divisor is
a plausible-looking bug that would silently overpay every mid-year joiner.

---

#### `membership_date` is not involved — the CBU ledger already answers this

An earlier draft of this section worried that a June joiner and a long-standing
member could not be told apart, and proposed backfilling `membership_date` first.
**That was wrong, and the backfill is not a prerequisite.** Confirmed with the
bookkeeper: the basis comes from the CBU ledger and nothing else.

The rule is rule 1, applied without exception: **January's opening balance is the
carried-forward closing balance from the previous period.** For a 2026
distribution, every member's January opening is their **December 2025 CBU closing
balance**.

That single rule separates the two cases automatically:

| Case | Dec 2025 CBU row? | Jan–May 2026 balance | Why |
|---|---|---:|---|
| Historical member (since 2019) | yes — the 2025-12-31 import | their carried-forward balance | rule 1 carry-forward |
| Genuine June 2026 joiner | none | ₱0 | no capital in the ledger yet |

A historical member is **never** zero-filled, because they are not zero — the
2025-12-31 import gave them a closing balance and rule 1 carries it into January.
A June joiner's ₱0 for January–May is not missing data either; it is the ledger
correctly stating they had no share capital in the cooperative during those
months.

**So the zeros are ledger facts, not gaps.** No join date is consulted, none is
needed, and `membership_date` stays unused by the ISC calculation — which is also
why §11.2's warning about that field never applied here.

> This is consistent with what §11.2 already concluded for a different reason:
> filtering the averaging window by `membership_date <= month_end` was *proposed
> and rejected*. The current behaviour is correct **precisely because it ignores
> the field.** §12.6 now reaches the same answer from the other direction — the
> field is not just unreliable, it is unnecessary.

**One consequence worth keeping in view.** This makes the December 2025 floor
(§8, `period_start >= 2025-12-01`) load-bearing rather than merely cautious. The
carry-in it protects *is* the mechanism that keeps historical members whole. A
range starting before the import has no closing balance to carry forward, every
long-standing member reads ₱0, and the underpayment §11.2 warned about arrives
after all. The existing `CHECK` constraint and the `RAISE` in
`isc_calculate_preview` already prevent this; **do not relax either** until real
month-by-month history exists before December 2025.

---

### 12.7 Notes on the module itself

Carried over from its implementation note; these apply if the grid is adopted as UI.

**The UI is approved — do not redesign it.** No metric cards above the table; the
pinned footer *is* the summary, which is how the auditors read it.

**Inline CRJ/CDJ editing should be read-only here.** The module's own note reaches
the same conclusion: the CRJ and CDJ are source books and must not be silently
rewritten from a distribution screen. Keep editing for the pool amount only. This
also matches §9 — a member's balance moves because the database says so, never
because frontend state was patched.

> ⚠️ **SUPERSEDED FOR THE BACKFILL PHASE — see §20.** The coop's 2026 records are
> incomplete and there is no other route by which they become complete, so the
> bookkeeper types the missing months directly into the grid and those edits
> persist to `capital_build_up`. The reasoning above was sound but assumed the
> books were already complete.
>
> **The part that survives:** backfill never overwrites a real transaction (a
> month already holding a cashier, loan-trigger or membership-payment row is
> read-only), and the cells go read-only again once a period is complete and
> posted. §20.3 has the containment rules — they matter more than the feature.

**Layout details that look cosmetic but are not:** `table-fixed` with an explicit
table width (without it the sticky column desyncs from its header during horizontal
scroll); the tier-two header's `top-[29px]` offset, which must be updated if tier-one
padding or font size changes; the z-index ladder (40/20/10/30/40); `tabular-nums` on
numeric cells, without which the digits do not align — the entire point of a ledger.

**Scale.** The grid renders every member row. At 263 members this is on the edge; the
note recommends row virtualisation above roughly 300, and warns that footer totals
must then come from the full dataset, not the rendered window.

> **Superseded by §19.5 — we paginate at 10 rows instead.** Virtualisation is not
> needed at any member count. The warning about totals still stands and applies
> word-for-word to pagination: **the footer must sum every member, never the
> visible page.**

**Stack.** TypeScript + Tailwind + `lucide-react`, no shadcn imports. The shipped ISC
feature is `.jsx`. Adopting the grid means either introducing TSX to this part of the
tree or porting it.

**Posting requirements in the note agree with ours:** idempotent or reject a second
post for the same period, permission-gated, and re-verified server-side. Already
satisfied by `isc_post` and the overlap constraint.

---

## 13. Navigation & page plan — ISC gets its own page (planned 2026-09-08)

**Status: PLANNED, NOT BUILT.** Nothing in this section has been implemented. It
is the agreed shape of the work, written down so it can be picked up directly.

### 13.1 Why the modal has to go

The bookkeeper's ISC entry point today is a modal
(`components/InterestOnShareCapitalModal.jsx`, 582 lines) opened from an "ISC
Calculator" button on `Bookkeeper_CBU.jsx:240`. That was the right call when the
feature was *"pick a range, type a rate, review a list"* — the modal is capped at
`max-w-2xl` and that was enough.

The confirmed spec (§12) is a **spreadsheet ledger**: a sticky member column, up
to 36 monthly columns (CRJ / CDJ / balance for twelve months), four summary
columns, and a pinned footer of vertical totals. That does not fit in a
`max-w-2xl` dialog at any zoom level, and the module's note is explicit that the
grid and its footer are the approved presentation and must not be redesigned.

A modal is also the wrong container for the task. Distribution is a
sit-down, cross-check-against-the-audited-figures job, not a quick confirm. It
wants a URL that can be returned to, a breadcrumb, and room to scroll.

### 13.2 What already exists (verified by reading the code)

The navigation is config-driven and clean, so this is genuinely small:

- `components/StaffSidebar/index.jsx` is a single shared sidebar for **all** six
  staff portals. Pages never hand-roll an `<aside>`; they render
  `<StaffSidebar portal="..." items={...} />`.
- Menus live one-file-per-role in `components/StaffSidebar/configs/`
  (`bod.js`, `bookkeeper.js`, `cashier.js`, `manager.js`, `secretary.js`,
  `treasurer.js`). An entry is `{ name, icon, path }`, or
  `{ name, icon, isDropdown: true, subItems: [...] }` for a group.
- **ISC already has pages for two roles**, and they are the pattern to copy:
  `Manager/Components/ISC_Postings.jsx` (54 lines) and
  `Treasurer/Components/ISC_Postings.jsx` (60 lines). Both are thin shells —
  `StaffSidebar` + `StaffTopbar` + `Breadcrumb` + a shared body component
  (`components/IscPostingHistory.jsx`, 333 lines).
- Their nav entries already exist: `manager.js:19` → `/manager-isc`,
  `treasurer.js:22` → `/treasurer-isc`.
- Routes are flat entries in `Router.jsx` wrapped in a per-role guard
  (`bookkeeperGuarded`, `managerGuarded`, …).

**So the bookkeeper is the only role with an ISC responsibility and no ISC page.**
That is the gap to close.

### 13.3 The change

**One nav entry** — `configs/bookkeeper.js`, alongside the existing imports
(`Banknote` is already imported in that file):

```js
{ name: "ISC Distribution", icon: Banknote, path: "/bookkeeper-isc" },
```

Place it after "Payments" / the Savings Accounts group and before "MIGS
Scoring", so the money-movement items stay together. Deliberately **not** inside
the Savings Accounts dropdown — ISC is a once-a-year cooperative-wide
distribution, not a per-member savings operation, and burying it two levels down
misrepresents what it is.

Name it **"ISC Distribution"**, not "ISC Postings". The manager's and treasurer's
pages are read-and-reverse views of past postings; the bookkeeper's page is where
a distribution is *computed and posted*. Different verbs, different names.

**One route** — `Router.jsx`, next to the other bookkeeper routes:

```js
{ path: "/bookkeeper-isc", element: bookkeeperGuarded(<Bookkeeper_ISC />) },
```

**One page** — `Bookkeeper/Components/ISC_Distribution.jsx`, following the
Manager/Treasurer shell exactly:

```jsx
<div className="flex min-h-screen bg-gray-50">
  <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />
  <div className="flex-1 flex flex-col h-screen overflow-y-auto min-w-0">
    <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />
    <main className="p-8 min-w-0">
      <Breadcrumb portal="Bookkeeper" page="ISC Distribution" />
      {/* ledger grid */}
    </main>
  </div>
</div>
```

`min-w-0` on the flex child matters here — without it the wide grid forces the
whole page to scroll horizontally instead of scrolling inside its own container.
The existing ISC pages already carry it.

### 13.4 Keep the modal, change what it does

Do **not** delete `InterestOnShareCapitalModal.jsx`, and do not remove the ISC
Calculator button from the CBU pages.

It is mounted on **two** pages — `Bookkeeper_CBU.jsx:346` and, per §5.4, the
cashier's CBU page in read-only form (`canPost={false}`). Deleting it breaks the
cashier's only view of the calculation.

The cleaner split:

| Surface | Role | Purpose |
|---|---|---|
| `/bookkeeper-isc` (new page) | Bookkeeper | compute, review, **post** a distribution |
| ISC Calculator modal (existing) | Bookkeeper, Cashier | quick "what's our basis?" lookup, **no posting** |
| `/manager-isc` (exists) | Manager | review past postings, **reverse** |
| `/treasurer-isc` (exists) | Treasurer | review past postings, read-only |

Once posting moves to the page, the modal's `canPost` can go to `false` at both
call sites and the Post button stops rendering anywhere in it. The permission
model in §5.4 is unchanged — and the real guard stays server-side (`isc_post`
and `isc_reverse` each check the caller's role themselves), so this is
presentation only.

### 13.5 The ordering problem — read this before starting

**The page needs data the current RPC does not return, and should post through
SQL that does not exist yet.**

`isc_calculate_preview` returns one row per member:

```
member_id, membership_id, member_name,
average_share_capital, total_share_capital,
month_count, rate, interest_amount
```

The grid needs the **twelve month-end balances per member**, plus the CRJ and CDJ
movements behind them. Those are computed inside the function and thrown away.
And `isc_post` still takes `p_rate`, not a pool.

So the build order is:

1. **§12.5 SQL first.** Add the pool columns, rewrite `isc_calculate_preview` to
   derive the rate and reconcile to the pool, and — new requirement from this
   section — have it **also return the per-month balance series** the grid
   renders. A `numeric[]` column (`month_end_balances`, plus `crj_by_month` /
   `cdj_by_month`) is the least disruptive shape; the existing scalar columns
   stay so the modal keeps working unchanged.
2. **Then the page.** With the RPC returning the series, the page is a rendering
   job.

Building the page first means running the confirmed formulas client-side over
whatever the current RPC returns, then posting through the rate-based
`isc_post` by back-deriving a rate from the pool. That works, and it would demo,
but it puts the authoritative arithmetic in the browser — which §12.3 and §5.4
both say it must never be, because the posting must be re-verified server-side
against rule 7 and the client's numbers are never trusted. It would also mean
two rounding implementations, exactly what §12.3 warns against.

**Recommendation: do §12.5 first.** It is the same work either way; doing it
first avoids writing arithmetic that has to be deleted.

### 13.6 Shared pure functions

When the page is built, put the seven rules in one module —
`utils/iscCalculations.js` — rather than inline in the component:

- `computeMonthEndBalances(opening, crj, cdj)` — rule 1
- `computeMemberTotals(rows)` — rules 2, 3
- `computeTotalAverage(rows)` — rule 4
- `deriveRate(pool, totalAverage)` — rule 5
- `reconcileToPool(rawPayouts, pool)` — rules 6, 7, largest-remainder

`reconcileToPool` can be lifted almost verbatim from
`ISC Notes/ISCDistributionModule.tsx` (lines ~156–194); it is already correct,
handles negative residuals, and breaks fractional ties on ledger order.

This is also what makes §12.3's regression fixture testable without rendering
anything, and it gives the SQL port a reference to check against to the centavo.

### 13.7 Checklist

**One migration (§12.5 + §14.3 together — both rewrite `isc_post`):**

- [ ] §12.5 SQL — pool columns, derived rate, largest-remainder reconciliation
- [ ] §14.3 — `settlement` columns on `isc_transactions`
- [ ] §14.3 — `isc_post` **stops writing `capital_build_up`** (records the payable only)
- [ ] §17.2 — `isc_settle_posting(posting, cash_member_ids[], effective_date)`
      (replaces §14.3's `isc_capitalise()` + `isc_settle_cash()`)
- [ ] §17.1 — **remove** `isc_reverse`, `reverses_posting_id`,
      `status = 'reversed'`, the double-reversal guard, and the reversal UI
- [ ] §17.1 — `isc_delete_posting()`, allowed only while every line item is unsettled
- [ ] §17.1 — drop `WHERE (status = 'posted')` from the overlap `EXCLUDE` constraint
- [ ] §17.1 — update §5.4's permission table: the manager has no ISC action left
- [ ] §14.2 — drop `AND cbu.source_isc_id IS NULL` from the averaging query, but
      **only in the same migration** that stops `isc_post` writing CBU rows —
      dropping it earlier reintroduces Bug 2
- [ ] §14.2 — `isc_capitalise` rejects an effective date before the posting's
      `period_end` (back-dating = Bug 1's broken chain)
- [ ] §15.3 — extend `isc_calculate_preview` to return `month_end_balances`,
      `crj_by_month`, `cdj_by_month`, `opening_balance` (keep the existing
      scalars; the modal depends on them)
- [ ] §15.3 — split CRJ/CDJ on **origin** (`cbu_deposit_id` / `source_loan_id`),
      not on sign; both increase share capital
- [ ] §15.6 — membership payments are the **opening balance**, not a CRJ/CDJ
      column; assert no movement falls outside the four known origins
- [ ] §15.4 — assert `opening + Σcrj + Σcdj == last month-end` per member; block
      the posting if it fails (broken CBU chain, §11.1). Signs confirmed in §18.1,
      so this is a regression test, not an experiment.
- [ ] §18.1 — read `capital_added` for CDJ, never recompute `principal × 2%`; the
      retention that actually happened is what the member holds

**Backfill (§20) — must land before any 2026 distribution:**

- [ ] §20.3 — `source_backfill_id` UNIQUE column + `deposit_account = 'BACKFILL_2026'`,
      acting bookkeeper and timestamp recorded
- [ ] §20.3 — write path recomputes the member's **full chain forward** from the
      edited month, in one transaction (never patch a single row — §11.1)
- [ ] §20.3 — reject writes to a month already holding a real transaction
      (cashier / loan trigger / membership payment); enforce in SQL, not just UI
- [ ] §20.3 — re-run §15.4's assertion after every save, per member
- [ ] §20.3 — lock backfill for a period once a posting exists for it
- [ ] §20.1 — support members with **no** opening balance (2026 joiners: opening
      ₱0, membership payment as the joining month's movement)
- [ ] §20.4 — readiness indicator ("14 members have no data for Mar–Aug"); don't
      block Calculate, the bookkeeper knows which gaps are real

**Frontend:**

- [ ] `utils/iscCalculations.js` — the seven rules as pure functions
- [ ] Unit tests: the §12.3 fixture + a property test (payouts sum to pool exactly)
- [ ] `configs/bookkeeper.js` — "ISC Distribution" nav entry
- [ ] `Router.jsx` — `/bookkeeper-isc`, `bookkeeperGuarded`
- [ ] `Bookkeeper/Components/ISC_Distribution.jsx` — shell + ledger grid (port
      the module's grid from `.tsx` to `.jsx`)
- [ ] §17.2 — settlement checklist (all rows checked = capitalise; uncheck for
      cash; header count + select-all/clear-all), run after the March GA
- [ ] §17.1 — remove the reverse control from `/manager-isc`, keep it read-only
- [ ] §14.4 — move the before/after share-capital panel off posting onto capitalisation
- [ ] Flip both modal call sites to `canPost={false}`
- [ ] §19.3 — three density levels: Summary (default) / Quarters / Full journal
- [ ] §19.4 — per-member drill-down drawer (one member's 12-month ledger)
- [ ] §19.5 — paginate at **10 members per page** (25/50 optional); slice the
      render only — **totals and CSV export always cover every member**
- [ ] §19.5 — search by name, filter (`adjusted` / zero-movement / newly
      eligible), sort by payout descending; all applied before slicing
- [ ] ~~Row virtualisation~~ — **not needed.** Pagination supersedes §12.7's note;
      10 rendered rows never requires it

**Before any real posting:**

- [ ] §15.4 — the CBU chain assertion passes for every member
- [ ] ~~Backfill `membership_date`~~ — **not required.** The CBU carry-forward
      already separates joiners from historical members (§12.6). Keep the
      Dec-2025 floor in place; it is what makes that work.

---

## 14. ISC pays CASH — capitalising it is a separate, member-elected event (confirmed 2026-09-08)

**This contradicts what is currently built.** `isc_post` writes a
`capital_build_up` row for every member as part of posting, which silently assumes
every payout becomes share capital. Confirmed with the bookkeeper: it does not.

### 14.1 The rule

**Interest on Share Capital is paid out as cash.** It does not increase the
member's share capital by default.

A member *may* choose to add their payout to their share capital instead of taking
the cash — but that is the member's election, not an automatic consequence of the
distribution. Those elections are collected and applied at the **General Assembly
in March**, which is when new share capital figures are determined for the
membership.

So the two things the shipped code does in one transaction are actually two events,
separated in time and by who decides them:

| | Event | When | Decided by |
|---|---|---|---|
| 1 | ISC is computed and posted; each member is owed a cash payout | after the audited surplus is allocated | Board / bookkeeper |
| 2 | Some members elect to capitalise instead of taking cash | **March General Assembly** | each member, individually |

Event 2 applies to *some* members, not all, and may never happen for a given
posting.

### 14.2 A capitalised payout is a March deposit — confirmed 2026-09-08

**Confirmed with the bookkeeper.** When a member elects at the General Assembly to
put their payout into share capital instead of taking the cash, **it increases their
capital, dated March** — the month of the assembly, not the period the interest was
earned for.

This settles §14.6 q1 and q2 together:

| | Answer |
|---|---|
| **Effective date** | **March** (the assembly), not the posting's period end |
| **Earns interest afterwards?** | **Yes** — from March onward, like any deposit |

#### Why the March date is the important half

Dating it March is not a bookkeeping preference; it is what keeps the ledger honest
in both directions.

**It matches when the capital actually existed.** The member did not hold that money
as share capital during the period the interest was earned for — they held it as an
unsettled claim, and could have taken it in cash. Capital starts working for them in
March, so March is when it starts earning.

**It keeps the CBU chain sound.** A back-dated capitalisation would insert a row
*before* deposits the member has already made since, carrying a
`starting_share_capital` read from those later rows — which is precisely the broken
chain of Bug 1 (§0), measured at ₱16,400 and ₱23,600 on two live members. The
existing schema file already records this reasoning: *"dating the ISC row at
period_end was considered and REJECTED."* The confirmed March date makes that
rejection permanent rather than a workaround.

**It also disposes of the double-count risk.** A March-dated row cannot fall inside
the averaging window of the period it was earned for (that period has already
closed), so a payout can never inflate the basis that produced it.

#### What it means for Bug 2's guard

Bug 2 added `AND cbu.source_isc_id IS NULL` to the averaging query (§0), excluding
ISC rows from the basis. **That guard now needs to become conditional rather than
absolute**, and the reasoning behind it stays intact:

- **Cash payouts** never enter `capital_build_up` at all, so there is nothing to
  exclude. The guard is simply inert for them.
- **Capitalised payouts** *should* count as basis from March onward. The member made
  a deliberate contribution; from that moment it is share capital they hold,
  indistinguishable in substance from a cashier deposit.

That is not the failure Bug 2 prevented. Bug 2 stopped **automatic** compounding —
an unelected, auto-credited ISC row silently inflating the next period's basis
without the member ever choosing anything, in a period the money had not been held.
A March-dated, member-elected capitalisation is the opposite on every count:
deliberate, dated when the capital began, and outside the earning period.

**Implementation:** once `isc_post` no longer writes CBU rows (§14.3), the only ISC
rows in `capital_build_up` are capitalisations — which should count. The guard can
then be dropped entirely rather than made conditional, because the rows it was
written to exclude will no longer exist.

> **Do not drop it before §14.3 lands.** On the current build, `isc_post` still
> auto-credits every member, and removing the guard would immediately reintroduce
> Bug 2. The two changes go in the same migration.

Keep a `source_isc_id`-tagged row distinguishable regardless (§4's pattern) — it is
what lets an auditor see that a member's March increase came from their dividend
rather than from cash they paid in.

### 14.3 What has to change

The schema needs to represent *a payable* and, separately, *a settlement*.

**`isc_transactions` gains a settlement state.** The line item records what the
member is owed; how it was settled is a later fact:

```sql
ALTER TABLE isc_transactions
  ADD COLUMN IF NOT EXISTS settlement      text NOT NULL DEFAULT 'unsettled',
      -- 'unsettled' | 'cash' | 'capitalised'
  ADD COLUMN IF NOT EXISTS settled_at      timestamptz,
  ADD COLUMN IF NOT EXISTS settled_by      uuid,
  ADD COLUMN IF NOT EXISTS capitalised_cbu_id uuid;  -- FK to the CBU row, if elected

ALTER TABLE isc_transactions
  ADD CONSTRAINT isc_settlement_valid
  CHECK (settlement IN ('unsettled','cash','capitalised'));
```

**`isc_post` stops writing to `capital_build_up`.** It records the posting header
and the per-member line items — the amounts owed — and nothing else. This removes
the entire class of bugs 1 and 2 from the posting path: no starting balance is read,
no chain is touched, nothing to go stale.

> Bug 1's fix (read the member's *current* `ending_share_capital` at insert time)
> moves to the capitalisation step, where it is still exactly right and still
> necessary. Do not delete that logic — relocate it.

**A new function `isc_capitalise(p_posting_id, p_member_ids[], p_effective_date)`**
performs event 2, for the subset of members who elected it:

- reject unless the line item is `settlement = 'unsettled'`
- insert one `capital_build_up` row per elected member, `deposit_account =
  'INTEREST_ON_SHARE_CAPITAL'`, `source_isc_id` set, `starting_share_capital` read
  from the member's current `ending_share_capital` (the Bug 1 discipline)
- `transaction_date = p_effective_date` — **the March assembly date** (§14.2), which
  is normally at or near `now()`, never back-dated to the posting's period end
- **reject a `p_effective_date` earlier than the posting's `period_end`.** A
  back-dated capitalisation is exactly the Bug 1 broken chain, and there is no
  legitimate reason to date the election before the period it settles.
- pre-supply `cbu_deposit_id` so `set_cbu_deposit_id()`'s `MAX()` scan never fires
  (§5.3)
- flip the line item to `settlement = 'capitalised'` and record the CBU row id
- one transaction, all or nothing, same as `isc_post`

**A matching `isc_settle_cash(p_posting_id, p_member_ids[])`** marks the rest as
paid in cash. It writes no CBU row; it exists so that "unsettled" means genuinely
outstanding, and the cooperative can see who has not yet been paid.

> **SUPERSEDED BY §17.1 — reversal is discarded entirely.** `isc_reverse` and its
> whole apparatus (double-reversal guard, `reverses_posting_id`,
> `status = 'reversed'`, the manager-only reverse permission) come out. A posting
> is instead **deletable while every line item is unsettled** and permanent once
> any member is settled. This works precisely because posting no longer writes to
> `capital_build_up`: an unsettled posting has moved no money, so deleting it
> moves none back. See §17.1 for `isc_delete_posting`.
>
> §17.2 also merges the two settlement functions below into a single
> `isc_settle_posting(p_posting_id, p_cash_member_ids[], p_effective_date)`.

### 14.4 What this means for the page (§13)

The ledger grid is unchanged — it computes the distribution, which is event 1.

But the page now needs a **second surface for settlement**: a list of a posting's
members with their payout and a per-member election (cash / capitalise), batch-
selectable, run after the March assembly. That is naturally a tab or a second view
on `/bookkeeper-isc` rather than another page.

The posting confirmation copy also has to change. §0.5's amber "EFFECT ON
COOPERATIVE SHARE CAPITAL / Before / After / Growth" panel is **now wrong at
posting time** — posting no longer changes share capital at all. That panel belongs
on the capitalisation step, where it would show the effect of the elections
actually made. At posting time it should state the total cash payable instead.

> The growth-percentage typo guard was genuinely useful (§0.5) and should not just
> be deleted. Move it: at posting time, sanity-check the pool against the total
> basis (a mistyped pool shows an absurd implied rate); at capitalisation time,
> keep the before/after share-capital panel as it stands today.

### 14.5 Sequencing against §12 and §13

This is a bigger change than the pool rewrite, and it touches the same functions, so
do them together rather than in series:

1. §12.5 pool-based calculation **and** §14.3 payable/settlement split in one
   migration — both rewrite `isc_post`, and doing them separately means writing
   `isc_post` twice.
2. Then §13's page, with the settlement view included from the start.

**Do not post a real distribution on the current build.** It would credit every
member's share capital automatically, which is not what the cooperative does, and
unwinding it means a reversal plus manual CBU repair.

### 14.6 Open questions for the bookkeeper

1. ~~**Does a capitalised payout earn interest in later periods?**~~
   **ANSWERED 2026-09-08 — yes, from March onward. See §14.2.**
2. ~~**What is the effective date of a capitalised payout?**~~
   **ANSWERED 2026-09-08 — the March assembly, not the posting's period end.
   See §14.2.** This is also what keeps the CBU chain sound (Bug 1) and makes it
   impossible for a payout to inflate the basis that produced it.
3. ~~**Can a posting be reversed after some members have capitalised?**~~
   **ANSWERED 2026-09-08 — reversal is DISCARDED entirely. See §17.1.** Replaced
   by: correctable (deletable) while every line item is unsettled, permanent once
   any member is settled.
4. ~~**Is the cash actually disbursed through the cashier?**~~
   **ANSWERED 2026-09-08 — settlement is a CHECKLIST. See §17.2.** Every member
   defaults to checked (add to capital); the bookkeeper unchecks whoever wants
   cash, then commits the list in one action.
5. ~~**Does rule 1's `− CDJ` apply to our data?**~~
   **ANSWERED 2026-09-08 — no. See §18.1.** A ₱500,000 loan puts 2% (₱10,000)
   *into* the member's share capital, so CDJ **adds**. Rule 1 reads
   `+ CRJ + CDJ` here; the minus sign is a generic-ledger-template artifact.
6. ~~**Where do membership payments (`source_payment_id`) belong?**~~
   **ANSWERED 2026-09-08 — see §15.6.** Neither book: a membership payment *is*
   the member's starting share capital. For a June joiner it is the opening
   balance the ledger row begins from. The code already writes it that way
   (`starting_share_capital = 0`, dated `payment_date`), so the basis needs no
   change. One presentational choice remains open in §15.6.

---

## 15. Every CBU movement feeds the ISC ledger — confirmed 2026-09-08

**Confirmed with the bookkeeper:** every increase in a member's share capital must
be reflected in the ISC ledger for **the month it happened**, because the month-end
balances are what the average is built from. Specifically:

- **Cashier CBU deposits** — a member paying in share capital over the counter
- **Loan CBU retention** — the share capital withheld when a loan is released
- **Membership payments** — the initial paid-up capital and subsequent payments

All three already write to `capital_build_up` and work today. The requirement is
that ISC *see* them, in the right month.

### 15.1 The good news: the basis is already correct

The averaging query in `isc_calculate_preview` takes, for each member and each
month-end in the range, their latest `capital_build_up` row at or before that date:

```sql
SELECT cbu.ending_share_capital
FROM public.capital_build_up cbu
WHERE cbu.member_id = em.id
  AND cbu.transaction_date::date <= me.month_end
  AND cbu.source_isc_id IS NULL
ORDER BY cbu.transaction_date DESC, <cbu_deposit_id numeric> DESC, cbu.id DESC
LIMIT 1
```

There is **no filter on `deposit_account` or on any `source_*` column**, so every
writer is picked up automatically. §4 lists them: `LOAN_CBU_RETENTION` (loan
disbursement trigger), membership payments, cashier deposits, and the
`Initial Paid-Up Capital` seed. A March deposit raises `ending_share_capital`, and
every month-end from March onward reads the higher balance.

**So a member who deposits in March genuinely earns interest on the larger balance
for March–December, and the smaller one for January–February.** That is the
requirement, and it already holds. Nothing to fix in the basis.

> The single exclusion is `source_isc_id IS NULL` — ISC's *own* previously-posted
> rows. That is Bug 2's guard and is deliberate (§0). Note §14.2 revisits it: once
> a payout is *electively capitalised* it is arguably an ordinary contribution and
> should count. Cashier deposits and loan retention are unaffected either way.

### 15.2 The real gap: the movements are computed and thrown away

The grid renders three cells per month per member — **CRJ** (money in), **CDJ**
(money out), and the resulting **balance**. The query above produces only the third,
and even that is aggregated away before it is returned:

```
average_share_capital, total_share_capital, month_count, rate, interest_amount
```

The twelve month-end balances exist inside `monthly_balances` and are collapsed by
`AVG()`. The CRJ and CDJ movements are never derived at all.

This is the same gap §13.5 flagged from the page's side. §15 explains *why* it
matters beyond rendering: without the per-month movements, the bookkeeper cannot see
**which deposit** produced a jump in a member's average, so the figure cannot be
checked against the cashier's records. A ledger that shows only the result is not
auditable, and auditability is the entire argument for the grid (§12.7).

### 15.3 What CRJ and CDJ actually mean here

**Confirmed with the bookkeeper 2026-09-08:**

| Column | Book | What it holds |
|---|---|---|
| **CRJ** | Cash Receipts Journal | share capital **paid in at the cashier** |
| **CDJ** | Cash Disbursements Journal | share capital **retained from a loan disbursement** |

This is a **source classification, not a sign convention** — and that is the part
most likely to be implemented wrongly.

Both books *increase* the member's share capital. A loan's CBU retention is money
the cooperative keeps back out of the loan proceeds and credits to the member's
capital; the member's balance goes **up**, not down. Verified in
`cbu_sync_from_loan_disbursement_include_emergency.sql:91-101` — the trigger writes
a positive `capital_added` and
`ending_share_capital = v_existing_balance + v_cbu_credit`, tagged
`deposit_account = 'LOAN_CBU_RETENTION'`.

It sits in the *disbursements* journal because that is the transaction the money
moved through — a loan disbursement — not because it reduces anything.

> An earlier draft of this section had CDJ as "withdrawals/reversals" and computed
> it as `SUM(GREATEST(-capital_added, 0))`. **That was wrong.** It would have
> reported ₱0 in CDJ for every member (no such rows exist) while silently folding
> loan retention into CRJ, so the grid would show every loan-retained peso as a
> counter deposit. The running balance would still have been right, which is
> exactly why it would have gone unnoticed.

#### The consequence for rule 1

The module's rule 1 is stated as:

```
Month m Balance = Month (m-1) Balance + CRJ_m − CDJ_m
```

With CDJ meaning loan retention — an increase — **the minus sign does not apply to
our data.** Both columns add:

```
Month m Balance = Month (m-1) Balance + CRJ_m + CDJ_m
```

**CONFIRMED 2026-09-08 (§18.1): both books add.** A ₱500,000 loan retains 2% —
₱10,000 — *into* the member's share capital. Rule 1's minus sign is an artifact of
the generic ledger template and does not apply to this data.

The risk this posed is worth remembering even though it is resolved: because the
*balance* column comes from `ending_share_capital` rather than from CRJ/CDJ, a sign
error would still have footed correctly. It would have surfaced only as an
unexplainable mismatch between the movement columns and the balance.

§15.4's assertion catches exactly that, and should still be written — as a
regression test now rather than as the thing that decides the sign.

#### What to add to the function

Extend `isc_calculate_preview` to return the series alongside the existing scalars
(keep those — the modal depends on them):

```sql
opening_balance    numeric,     -- carried into the range (§15.4)
month_end_balances numeric[],   -- one per month, chronological
crj_by_month       numeric[],   -- cashier receipts,   per month
cdj_by_month       numeric[]    -- loan CBU retention, per month
```

`month_end_balances` needs no new logic — it is `ARRAY_AGG(mb.balance ORDER BY
mb.month_end)` over the CTE that already exists, rather than `AVG()` alone.

CRJ and CDJ are new, and they split on **origin**, not on sign:

```sql
-- CRJ — paid in at the cashier
SUM(cbu.capital_added) FILTER (WHERE cbu.cbu_deposit_id IS NOT NULL)

-- CDJ — retained from a loan disbursement
SUM(cbu.capital_added) FILTER (WHERE cbu.source_loan_id IS NOT NULL)
```

Splitting on the `source_*` columns is more reliable than matching
`deposit_account` text: `source_loan_id` and `cbu_deposit_id` are UNIQUE, indexed,
and are the established dedup keys (§4), whereas `deposit_account` is a free-text
tag that varies by writer ("Cash", "GCash", …).

**Membership payments are a third origin** (`source_payment_id`) and belong in
neither column — **they are the member's opening balance. See §15.6.** They need no
CRJ/CDJ column of their own, and must not be folded into CRJ.

Still assert that no row falls outside every filter: a `SUM` over rows matching
none of the four known origins (cashier / loan / membership / ISC) should be zero.
Otherwise a movement can vanish from the grid while still moving the balance.

**Use `capital_added`, not the difference between consecutive `ending_share_capital`
values.** The running balance is a derived column maintained by several writers and
has been repaired once already (§11.1); `capital_added` is what each writer actually
recorded. Differencing the balance would also silently attribute any chain
irregularity to a phantom deposit.

Apply the same `source_isc_id IS NULL` filter used for the balances, so the two
halves of the grid agree.

**Keep the ordering discipline.** The balance subquery orders by
`transaction_date DESC`, then the numeric suffix of `cbu_deposit_id`, then `id`.
That tiebreaker exists because 270+ rows store date-only timestamps and same-day
deposits would otherwise tie — the deterministic-ordering bug of §11.1, which
failed 53% of the time on simulated same-day deposits. Month-level sums are immune
(order within a month does not change a sum), but **do not "simplify" the balance
ordering while editing this function.**

### 15.4 Where the grid's opening balance comes from

The module's `MemberLedgerRow.openingBalance` is the share capital carried forward
into the range — for a Jan–Dec 2026 distribution, the member's **December 2025
closing balance**, exactly as §12.6 describes. That is `month_end_balances[0]` minus
January's net movement, or more directly: the same balance subquery evaluated at
`v_period_start - 1 day`. Return it explicitly as `opening_balance` rather than
making the frontend reconstruct it.

This also gives the grid a self-check worth asserting: for every member,

```
opening_balance + Σ(crj) + Σ(cdj)  ==  month_end_balances[last]
```

**Note the `+` on CDJ** — per §15.3, loan CBU retention increases share capital, so
both books add. This is the assertion that settles the sign question empirically:
run it both ways against live data and only one will hold for every member. Write
it before writing the columns.

If it fails with the correct signs, the member's CBU chain is broken — the §11.1
failure mode — and the posting should be blocked rather than quietly averaging a
corrupt series.

The balance column comes from `ending_share_capital`, *not* from CRJ/CDJ, so the
grid would still foot correctly with the signs inverted. Without this assertion a
sign error is invisible.

### 15.5 Effect on §13 and §14

- **§13.5** already listed "extend the preview to return the per-month balance
  series" as a prerequisite. §15.3 makes that concrete and adds CRJ/CDJ and
  `opening_balance` to it.
- **§14** is unaffected. Deposits and loan retention flow *into* the basis; ISC's
  payout flows *out* as cash and only re-enters CBU if the member elects to
  capitalise. The two directions do not interact.
- Both changes land in the same `CREATE OR REPLACE` as §12.5, so there is one
  migration touching `isc_calculate_preview`, not three.

### 15.6 Membership payments are the OPENING balance, not a movement

**Confirmed with the bookkeeper 2026-09-08**, and it resolves §14.6 q6 better than
either option that question offered.

A member's `INITIAL_PAID_UP_CAPITAL` payment is not a CRJ or CDJ entry to be filed
under one of the two books. For a member who joins in June, **that payment is their
starting share capital** — the figure the ledger row begins from.

This is exactly the §12.6 example seen from the other side:

| Months | Balance | Where it comes from |
|---|---:|---|
| Jan – May | ₱0 | not yet a member; no CBU rows exist |
| June | ₱10,000 | **the membership payment — the opening balance** |
| Jul – Dec | ₱10,000 | carried forward by rule 1 |

```
Member Total   = ₱70,000
Member Average = ₱70,000 ÷ 12 = ₱5,833.33
```

#### Why the code already agrees

`cbu_sync_from_membership_payments.sql:170-187` writes the member's **first**
`capital_build_up` row when an `INITIAL_PAID_UP_CAPITAL` payment reaches `paid`:

- `starting_share_capital` = 0 (there is no prior row to read)
- `capital_added` = the payment amount
- `ending_share_capital` = 0 + amount
- `transaction_date` = `payment_date`
- tagged `deposit_account = 'INITIAL_PAID_UP_CAPITAL'`, keyed `source_payment_id`

Structurally that *is* an opening balance: a row whose starting balance is zero,
dated the month the member joined. The averaging query already picks it up (§15.1 —
it filters on nothing but member, date, and `source_isc_id IS NULL`), so **the
basis is already correct today**. No SQL change is needed for the calculation.

> A second writer exists for the same event —
> `applicationConfirmation.py:785-833`, tagged `Initial Paid-Up Capital` — from the
> confirmation flow. Same shape, different tag. Any `deposit_account` text matching
> would have to handle both spellings, which is one more reason §15.3 splits on the
> `source_*` columns instead.

#### What this means for the grid

**Do not give membership payments their own CRJ/CDJ column, and do not fold them
into CRJ.** Presenting a joiner's initial capital as a June "receipt" would be
double-counting in appearance: the opening-balance column already carries it, and
the month cell would show the same money again.

The grid's `openingBalance` (§15.4) handles this correctly with no special case,
*provided* it is computed as the balance at the last month-end **before** the range
— for an existing member that is their carried-forward balance, and for a June
joiner it is ₱0, with the payment landing as June's movement.

There is a presentational choice left, and it is worth putting to the bookkeeper:

- **(a)** June shows ₱10,000 in a movement column and the balance steps up. Honest
  about *when* the capital arrived; a mid-year joiner visibly starts at zero.
- **(b)** The row's opening balance shows ₱10,000 and the months before June are
  blank rather than ₱0. Reads as "this member's ledger starts in June".

**(a) is the safer default** — it keeps every row on the same twelve-month grid, so
the footer totals still add up column by column, and it keeps rule 1 literally true
for every member. (b) needs a per-row start month and quietly breaks the vertical
totals. Recommend (a) unless the bookkeeper's own ledger paper does otherwise.

Either way the *arithmetic* is unchanged: ₱70,000 ÷ 12 = ₱5,833.33.

#### Net effect on §15.3

The third-origin gap §15.3 warned about is now closed by definition rather than by
adding a column:

| Origin | Key | Grid treatment |
|---|---|---|
| Cashier deposit | `cbu_deposit_id` | **CRJ** |
| Loan CBU retention | `source_loan_id` | **CDJ** |
| Membership payment | `source_payment_id` | **opening balance** (option (a): shown as the joining month's movement) |
| ISC capitalisation | `source_isc_id` | excluded from basis (§0 bug 2; revisit per §14.2) |

The "assert nothing falls outside every filter" check from §15.3 still stands — it
is now a check that these four origins account for every row, which is a stronger
guarantee than the three-way split it replaces.

---

## 16. Where the plan stands (2026-09-08)

The **accounting model is settled.** Eight questions that were open at the start of
the day are now answered, and every one of them came from the bookkeeper rather than
from inference. What remains is implementation, plus three decisions the cooperative
still has to make.

### 16.1 Settled — do not reopen without a new conversation

| # | Question | Answer | § |
|---|---|---|---|
| 1 | Rate or pool? | **Pool.** The GA allocates an audited net surplus; the rate is `pool ÷ total average` | §12.1 |
| 2 | The formulas | The seven rules, transcribed from the coop's own spec | §12.2 |
| 3 | Divisor for a mid-year joiner | **Always 12**, never per-member | §12.6 |
| 4 | Does `membership_date` matter? | **No.** The CBU carry-forward separates joiners from historical members by itself | §12.6 |
| 5 | Is the payout cash or capital? | **Cash.** Capitalising is a member election | §14.1 |
| 6 | When does a capitalisation take effect? | **March**, at the General Assembly | §14.2 |
| 7 | Does a capitalised payout earn interest? | **Yes**, from March onward | §14.2 |
| 8 | What are CRJ and CDJ? | Cashier receipts / loan CBU retention — a **source** split, both increasing | §15.3 |
| 9 | Where do membership payments go? | They **are** the opening balance | §15.6 |

Two of these contradicted working code (§12 the rate, §14 the auto-credit), which
is why the shipped build cannot be used as-is.

### 16.2 Decisions — all made (2026-09-08)

Three were open when §16 was written; all three are now answered.

**q3 — Reversal? DISCARDED (§17.1).** Not deferred — removed. `isc_reverse`, the
double-reversal guard, `reverses_posting_id`, `status = 'reversed'` and the
manager-only reverse permission all come out. Replaced by: a posting is deletable
while every line item is unsettled, permanent once any member is settled. This works
only because §14.3 stops posting from writing `capital_build_up` — an unsettled
posting has moved no money.

**q4 — Cash payout? A CHECKLIST (§17.2).** Every member in the posting defaults to
**checked = add to share capital**; the bookkeeper unchecks whoever wants cash and
commits the whole list in one action. §14.3's two settlement functions merge into one
`isc_settle_posting()`.

**q5 — The CDJ sign.** Settles empirically via §15.4's assertion; never blocked
anything.

**ALL QUESTIONS ARE CLOSED (§18).** Nothing is waiting on the bookkeeper.

| | Item | Resolution |
|---|---|---|
| q5 | Does rule 1's `− CDJ` apply? | **No** — a ₱500k loan puts 2% *into* share capital; both books add (§18.1) |
| — | Mid-year joiner display | **Option (a)** — ₱0 months, payment as the joining month's movement (§18.2) |
| — | No `created_at` on `capital_build_up` | **Leave as is** — `cbu_deposit_id` stays the ordering proxy (§18.3) |

The schema, the arithmetic, the permissions and the presentation are all settled.
The next step is writing the migration.

### 16.3 What is left to build

22 checklist items in §13.7, in three groups:

**One SQL migration** (§12.5 + §14.3 + §15.3 all rewrite the same two functions —
do them together, not in series):
- pool columns, derived rate, largest-remainder reconciliation
- `settlement` state on `isc_transactions`; `isc_post` stops writing CBU
- `isc_capitalise()` and `isc_settle_cash()`
- per-month series (`month_end_balances`, `crj_by_month`, `cdj_by_month`,
  `opening_balance`) returned from the preview
- drop Bug 2's guard — **in this migration only** (§14.2)

**Frontend** — `utils/iscCalculations.js`, the §12.3 fixture as tests, the nav entry,
the route, the page with the ledger grid, and the settlement view.

**Before a real posting** — q3 and q4 answered; the §15.4 chain assertion passing for
every member.

### 16.4 The one standing instruction

**Do not post a real distribution on the current build.** It computes the wrong
figure (rate-based, not pool-based) *and* auto-credits every member's share capital.
Nothing bad is live today — the 2026-09-06 verification posting was reversed and
nets ₱0.00 — and it should stay that way until the migration lands.

---

## 17. Reversal is discarded; settlement is a checklist (confirmed 2026-09-08)

Two decisions from the bookkeeper close §14.6 q3 and q4. Together they simplify the
feature considerably — one whole subsystem comes out, and the part that replaces it
is smaller than what it replaces.

### 17.1 q3 — No reversal. Discard it.

**Confirmed: reversal is removed from the design.** Not deferred, not gated behind a
permission — removed.

This retires a genuinely complex piece of machinery: `isc_reverse`, the
double-reversal guard (bug 5, §0), the `reverses_posting_id` marker, the
`status = 'reversed'` state, the reversal reason, and the manager-only permission
that existed solely to hold it (§5.4).

#### What replaces it: correct before settlement, lock after

A posting is **editable while every line item is still unsettled** — nothing paid in
cash, nothing capitalised. Once any member has been settled, the posting is
permanent.

```
posted ──────────────► settling ──────────────► closed
  │                        │
  │ nothing settled yet    │ ≥1 member settled
  │ CORRECTABLE            │ LOCKED
  │                        │
  └── delete + re-post     └── permanent
```

This is a real correction path, and it costs nothing to provide, because §14.3
already establishes that **posting no longer writes to `capital_build_up` at all.**
An unsettled posting is pure bookkeeping: a header row and N line items recording
what members are *owed*. Nothing has moved. Deleting it moves nothing back.

That is precisely why reversal was hard before and is unnecessary now. The old
`isc_post` credited every member's share capital immediately, so undoing it meant
writing compensating negative CBU rows and hoping the running-balance chain
survived. With §14.3's split there is nothing to compensate.

The window is also natural rather than arbitrary: settlement happens at the **March
General Assembly** (§14.2), so a posting computed beforehand has a genuine review
period, and it locks exactly when real money starts moving.

#### Implementation

```sql
-- Allowed only while no line item has been settled.
CREATE OR REPLACE FUNCTION public.isc_delete_posting(p_posting_id uuid)
```

- raise unless **every** `isc_transactions` row for the posting is
  `settlement = 'unsettled'`
- delete the line items and the header (the existing `ON DELETE CASCADE` on
  `isc_transactions.isc_posting_id` already does this)
- no `capital_build_up` rows exist to clean up — assert this rather than assume it:
  raise if any CBU row carries a `source_isc_id` belonging to this posting
- bookkeeper-only, matching who creates the posting

**The `EXCLUDE` overlap constraint gets simpler too.** It currently carries
`WHERE (status = 'posted')` so that a *reversed* posting frees its months for a
corrected one (§8). With no reversal, a deleted posting frees its months by ceasing
to exist, and the partial predicate can go — every posting that exists occupies its
months.

> **Do not drop `status` outright.** It still distinguishes `posted` from
> `closed`/`settled` if that distinction is wanted for reporting. What goes is the
> `reversed` value and everything that produced it.

#### What this means for the Manager

§5.4 split post and reverse across two roles for segregation of duties — the
bookkeeper posts, the manager reverses, so a mistake or abuse leaves a witness. With
reversal gone, **the manager has no ISC action left.**

That does not make `/manager-isc` pointless: reviewing what was posted and settled
is still worth having, and the existing `IscPostingHistory` component already serves
it read-only. But the page's reverse control comes out, and §5.4's permission table
should be updated to say so rather than leaving a row describing a capability that
no longer exists.

**Segregation of duties is not lost — it moves.** The bookkeeper can correct only
*before* anything settles; after that no one can alter the record. That is a
stronger control than reversal was, because reversal let a single role undo a
₱1.49M posting after the fact.

### 17.2 q4 — Settlement is a checklist, defaulting to capitalise

**Confirmed:** rather than recording each member's election one at a time, the March
settlement screen is a **checklist of every member in the posting**, with each row
checked by default.

- **Checked = add the payout to share capital** (the default for everyone)
- **Unchecked = the member takes the cash**

The bookkeeper unchecks the members who want cash, then commits the whole list in
one action.

#### Why the default matters

Defaulting to *capitalise* is the right way round for this cooperative, and it is
worth stating why so nobody flips it later for symmetry:

- It matches the common case. Most members leave the payout in, so the default
  should be the outcome that requires no action.
- It fails safe. An overlooked row adds money to the member's share capital, where
  it stays visible on their record and keeps earning. The opposite default would
  quietly mark someone as paid cash they never received — a discrepancy that only
  surfaces when they ask for it.

#### What it changes in §14.3

§14.3 specified two functions taking member id arrays, `isc_capitalise()` and
`isc_settle_cash()`. The checklist makes that a single call carrying the whole
posting's decisions:

```sql
CREATE OR REPLACE FUNCTION public.isc_settle_posting(
  p_posting_id     uuid,
  p_cash_member_ids uuid[],   -- the UNCHECKED rows; everyone else capitalises
  p_effective_date  date      -- the March assembly date (§14.2)
)
```

- reject unless every line item is currently `unsettled` — settlement is one event,
  not an incremental drip
- reject any id in `p_cash_member_ids` that is not in this posting
- for members **not** listed: insert the `capital_build_up` row exactly as §14.3
  describes (current `ending_share_capital` as the starting balance, pre-supplied
  `cbu_deposit_id`, `source_isc_id` set, dated `p_effective_date`), and mark the line
  item `capitalised`
- for members **listed**: mark the line item `cash`, write no CBU row
- one transaction, all or nothing

Passing the *cash* list rather than the capitalise list keeps the payload small and
makes the default explicit in the API: omission means capitalise.

> **Sanity guard worth having:** if `p_cash_member_ids` covers every member in the
> posting, that is a legitimate but unusual outcome — the whole distribution paid in
> cash. Worth a confirmation in the UI, not a rejection in SQL.

#### The screen

A single table on the ISC page (§13), shown once a posting exists and is unsettled:

| ✓ | Member | Payout | |
|---|---|---:|---|
| ☑ | Bautista, Maria Corazon | ₱12,146.20 | → share capital |
| ☐ | Delos Santos, Ramon | ₱656.04 | → cash |

With a header count — *"231 of 263 adding to capital · 32 taking cash · ₱1,344,908.11
to capital · ₱151,196.31 cash"* — so the split is visible before committing, and a
select-all / clear-all for the bulk case.

**This is also where §0.5's before/after share-capital panel belongs** (§14.4). At
settlement time it can finally show something true: the effect of the elections
actually made, not a projection of a capitalisation that may never happen.

### 17.3 Net effect on the plan

**Removed:** `isc_reverse`, double-reversal guard, `reverses_posting_id`,
`status = 'reversed'`, reversal reason, manager reverse permission, the reversal
confirmation UI, and the partial predicate on the overlap constraint.

**Added:** `isc_delete_posting` (small, guarded by settlement state) and
`isc_settle_posting` (replaces the two functions §14.3 proposed, so this is net
neutral).

**§14.6 is now fully answered** — q3 and q4 here, q5 settles empirically via §15.4's
assertion. There are no open questions for the bookkeeper left.

---

## 18. The last three items — closed (2026-09-08)

### 18.1 q5 CLOSED — CDJ is loan CBU retention, and it ADDS

**Confirmed with the bookkeeper:** when a member takes a ₱500,000 loan, **2% of
that — ₱10,000 — goes to their share capital.**

That settles the sign with no ambiguity. CDJ *increases* the member's capital.

```
Loan principal            ₱500,000.00
CBU retention @ 2%        ₱ 10,000.00   ← CDJ, added to share capital
```

The code already does exactly this, and the numbers line up:

- `cbu_sync_from_loan_disbursement_include_emergency.sql:60-67` computes
  `round(v_principal * get_cbu_rate_for_loan_type(...), 2)`, falling back to `0.02`
- `seed_loan_types_and_policies.sql:37` seeds `cbu_rate = 0.02` on
  `loan_fee_policies`
- the row is written with a **positive** `capital_added` and
  `ending_share_capital = existing + credit` (§15.3)

So rule 1, as it applies to this cooperative's data, is:

```
Month m Balance = Month (m-1) Balance + CRJ_m + CDJ_m
```

Both books add. The module's `− CDJ` is a generic-ledger-template artifact, not a
rule being broken — **§14.6 q5 is answered, and the minus sign does not apply.**

> **Still write §15.4's assertion.** It is now a regression test rather than a
> question: `opening + Σcrj + Σcdj == last month-end` must hold for every member. If
> it ever fails, the CBU chain is broken (§11.1) — not the sign convention.

**The rate is per loan type and lives in policy, not in ISC.** `cbu_rate` is read
from `loan_fee_policies` at disbursement time and baked into the CBU row. ISC must
never recompute it: the retention that actually happened is what the member holds,
even if the policy rate changes later. Read `capital_added`, never `principal × 2%`.

### 18.2 Mid-year joiner display — option (a) confirmed

**Confirmed: (a).** A June joiner's row shows ₱0 for January–May, the ₱10,000
membership payment as June's movement, and the balance stepping up from there.

| | Jan | … | May | Jun | … | Dec |
|---|---:|---|---:|---:|---|---:|
| Movement | — | | — | **10,000.00** | | — |
| Balance | 0.00 | | 0.00 | 10,000.00 | | 10,000.00 |

This keeps every member on the same twelve-month grid, so the footer totals still
add column by column, and rule 1 stays literally true for every row with no
per-member special case. The alternative — starting the row at June — needed a
per-row start month and quietly broke the vertical totals.

It is also the honest presentation: a mid-year joiner *visibly* starts at zero,
which is exactly why their average is ₱5,833.33 rather than ₱10,000 (§12.6).

### 18.3 `created_at` on `capital_build_up` — keep the current approach

**Confirmed: leave it as it is.** `cbu_deposit_id`'s numeric suffix stays the
ordering proxy, parsed as an integer (never sorted as text — that breaks at
`CBUD_100` vs `CBUD_099`, §11.1).

This is a deliberate decision to leave a known imperfection alone, not an oversight:

- It **works.** The ordering is deterministic, and the §11.1 simulation showed the
  current scheme failing 0 of 200 trials where the old UUID tiebreaker failed 53%.
- Adding a timestamp column would mean **backfilling 288+ existing rows** with
  values nobody actually knows — the insertion order of historical rows is precisely
  what is missing. A backfilled `created_at` would be a fiction dressed as evidence.
- ISC does not need it. The averaging query orders by `transaction_date` first, and
  the tiebreaker only matters for same-day rows, which the deposit-ID sequence
  already resolves correctly.

If a `created_at` is ever added, add it with a default for *new* rows only and leave
historical rows NULL, ordering `NULLS LAST` behind the deposit-ID proxy. Do not
invent history.

---

**All questions are now closed.** Nothing is waiting on the bookkeeper. The next
step is the single migration (§12.5 + §14.3 + §15.3 + §17), then the frontend.

---

## 19. Fitting the ledger on a real screen (2026-09-08)

The module's grid is designed at full ledger width. Measured against this app's
shell, it does not fit — not on a laptop, and not on a 1920px monitor either.

### 19.1 The measurement

From the module's own width constants (`ISCDistributionModule.tsx:113-117`,
`tableWidth` at line 516):

```
full journal   = 236 + 148 + 12×(112×3) + 148×3 + 122  =  4,982 px
month totals   = 236 + 148 + 12×124     + 148×3 + 122  =  2,438 px
```

Against the staff shell — a fixed 256px `StaffSidebar` plus the standard `p-8`
padding — the usable width is `viewport − 320`:

| Screen | Usable | Full journal | Month totals |
|---|---:|---|---|
| 1366 (common laptop) | 1046px | **4.8× over** (+3,936px) | 2.3× over (+1,392px) |
| 1440 | 1120px | 4.4× over | 2.2× over |
| 1920 (desktop) | 1600px | **3.1× over** (+3,382px) | 1.5× over (+838px) |

The module's existing full-journal ↔ month-totals toggle is a 2× reduction on a
problem that needs 4.8×. **Even the compact view overflows the widest common
screen.** This is not a matter of tightening padding.

### 19.2 The sidebar stays — confirmed 2026-09-08

**Decision: the sidebar is fixed at 256px on the ISC page, exactly as on every
other staff page.** No collapse, no icon rail, no per-page exception.

The reason is consistency: `StaffSidebar` is the single shared navigation for all
six staff portals (§13.2), and a page where the menu behaves differently teaches
the user that this screen is special in a way that has nothing to do with the work.
192px is not worth that.

So the fix has to come entirely from the grid. That is the right place for it
anyway — the grid is what is oversized.

### 19.3 Three views, not two

Replace the single toggle with three levels of density. The default is the one
people spend the most time in, not the widest.

**Level 1 — Summary (the default landing view)**

```
┌──────────────┬─────────────┬───────────┬──────────┬───────────┐
│ Member       │ Share cap.  │ Average   │ Rate     │ Payout    │
├──────────────┼─────────────┼───────────┼──────────┼───────────┤
│ Gero, J.M.   │  37,000.00  │ 36,500.00 │ 11.2465% │  4,104.97 │
└──────────────┴─────────────┴───────────┴──────────┴───────────┘
                                             ≈ 830px — fits everywhere
```

This is what the bookkeeper actually reviews before posting: who is eligible, what
each is owed, does the total reconcile. The twelve months of journal detail are
supporting evidence, not the primary reading.

**Level 2 — Quarters (the middle setting)**

Twelve month columns collapse into Q1–Q4, each showing the quarter-end balance.
Clicking a quarter header expands just that quarter into its three months.

```
┌──────────────┬──────────┬──────────┬──────────┬──────────┬───────────┐
│ Member       │    Q1    │    Q2    │    Q3    │    Q4    │  Payout   │
│ Gero, J.M.   │ 29,000.00│ 35,000.00│ 41,000.00│ 37,000.00│  4,104.97 │
└──────────────┴──────────┴──────────┴──────────┴──────────┴───────────┘
                                          ≈ 1,030px — fits a 1366 laptop
```

Expanding one quarter adds ~250px, which still fits. This is the level at which a
bookkeeper can see the shape of a member's year and drill into the one quarter that
looks wrong.

**Level 3 — Full journal (unchanged, scrolls)**

The module's existing 4,982px view, kept exactly as designed. It scrolls
horizontally inside its own container, and that is acceptable *because it is now an
opt-in view for a specific audit task* rather than the default screen.

> The module's note says the layout is approved and must not be redesigned (§12.7).
> **This does not redesign it** — level 3 is that grid, untouched. Levels 1 and 2 are
> new, less dense views of the same data, added above it. The sticky column,
> `table-fixed`, the z-index ladder, the banded rows and the footer all survive
> intact in level 3.

### 19.4 Per-member drill-down

Independently of the density level, clicking a member row opens a drawer with that
one member's full twelve-month ledger — CRJ, CDJ, running balance, and the
arithmetic that produced their average and payout.

This is what actually answers *"why did this member get ₱4,104.97?"*, and it answers
it better than the wide grid does, because it shows one member's year without the
other 262 rows competing for attention.

It also means level 3 is genuinely optional: the drill-down covers the
single-member question, and level 3 covers the compare-across-members question.

### 19.5 Row count — pagination at 10 per page

**Confirmed 2026-09-08: the table paginates at 10 members per page.**

263 eligible members is too many rows to scroll regardless of column width, and
pagination is the same pattern the rest of the staff portals already use — so it
keeps the ISC page consistent with the system rather than inventing a behaviour
just for this screen.

It also disposes of the virtualisation question: **10 rendered rows never needs
`@tanstack/react-virtual`.** §12.7's note about virtualising above ~300 members is
superseded — pagination solves the same problem with no new dependency and no
interaction with the sticky footer. Drop that item.

#### The footer must total the WHOLE posting, never the page

This is the one place pagination can quietly break the feature, and it is worth
being explicit because the failure is invisible.

The footer row *is* the summary — it is how the cooperative's auditors read the
ledger (§12.7), and it carries the reconciliation check that gates posting: rule 7,
`Σ payouts = pool`, exactly. If the footer sums only the ten rows on screen, it
shows ₱-something-small against a pool of ₱1.49M, the balance indicator reads "out
of balance", and the Post button never enables.

The module already has the right structure for this. Its `ledger` memo
(`ISCDistributionModule.tsx:348-401`) computes `totalAverage`, `totalPayout`,
`variance` and `balanced` across **all** members, and only line 847 renders rows.

**So pagination slices the render, not the maths:**

```jsx
// totals — over every member, always
const ledger = useMemo(() => { /* all rows */ }, [members, pool]);

// render — this page only
const pageRows = ledger.rows.slice(page * 10, page * 10 + 10);
```

Never paginate before computing. Never recompute totals from `pageRows`.

> The same rule applies to **CSV export** (`exportCsv`, line ~430): it must write
> every member, not the current page. It already maps `ledger.rows`, so it is
> correct as written — do not "fix" it to match the visible table.

#### What pagination does not solve

Paging through 27 pages to find one member is worse than scrolling. Pagination needs
the controls from the original §19.5 to be usable at all:

- **Search by member name** — filters the full set, then paginates the result. The
  single most-used control on this screen.
- **Filter** for rows that need attention: `adjusted` rows (those that received a
  residual centavo, §12.3), members with no movement in the period, members newly
  eligible this period.
- **Sort by payout descending by default.** The largest amounts are where an error
  costs the most, so page 1 should be the ten payouts most worth checking — not the
  ten members whose surnames happen to start with A.

Filters and sort apply to the whole set before slicing, so page 1 of a filtered view
is the top of that filtered set.

#### Page size

10 is confirmed as the default. Worth allowing 25 and 50 as options from the same
control — a bookkeeper on a large monitor reviewing a whole posting will want fewer
page turns, and the cost is one `<select>`. The default stays 10.

#### Interaction with the density levels (§19.3)

Independent. Pagination controls how many *rows* render; the density level controls
how many *columns*. Summary view at 10 rows is a compact screen; full journal at 10
rows still scrolls horizontally but is now only ten rows deep, which makes the
horizontal scroll far less punishing than scrolling a 263-row table sideways.

The per-member drawer (§19.4) is unaffected — it shows one member regardless of
which page they were on.

### 19.6 What this changes in §13

§13.3's page shell is unchanged — `StaffSidebar` at its normal width, `StaffTopbar`,
`Breadcrumb`, `min-w-0` on the flex child so the grid scrolls inside its own
container rather than pushing the page.

What changes is the body: a density control (Summary / Quarters / Full journal) in
the toolbar, the drill-down drawer, and search/filter/sort on the summary view. The
settlement checklist (§17.2) is a separate tab and has no width problem — it is a
name, an amount and a checkbox.

---

## 20. Backfilling 2026 — the grid becomes writable (confirmed 2026-09-08)

The cooperative's records for January 2026 onward are incomplete: the system holds
the 2025-12-31 import and only the handful of transactions entered since. The real
CBU activity of 2026 — deposits taken at the counter, loan retentions, new members
joining — largely exists on paper and not in the database.

**Confirmed: the bookkeeper types the missing months directly into the ISC ledger
grid**, and those edits persist to `capital_build_up`.

This is the module's original design (`ISCDistributionModule.tsx` ships with
editable CRJ/CDJ cells) and it **reverses §12.6's recommendation**, which argued the
CRJ and CDJ are source books that should not be rewritten from a distribution
screen. That recommendation assumed the books were already complete. They are not,
and there is no other route by which they become complete — so the grid is where
the data gets entered.

### 20.1 What is missing

Both kinds of gap, which need different handling:

**(a) Members who exist but whose 2026 movements are missing.** They have a
2025-12-31 closing balance; what is absent is deposits and loan retentions from
January onward. Their opening balance is known and correct — only the monthly
movements need typing.

**(b) Members with no CBU row at all.** The 32 active members holding no CBU row
(§11), plus anyone who joined during 2026. These need an opening balance *and* their
movements. For a 2026 joiner the opening is ₱0 and their membership payment is the
joining month's movement (§15.6, §18.2) — the grid must not force an opening balance
onto someone who had none.

### 20.2 This moves the December 2025 floor

§8.1.1 refuses any period starting before December 2025, because no month-by-month
history exists earlier. **That constraint stays**, and it stays for the same reason.

But the floor's *purpose* changes. Today it protects against averaging months the
system knows nothing about. Once 2026 is typed in, the months from January 2026
onward are real data rather than a carried-forward snapshot — which is precisely
what makes a Jan–Dec 2026 distribution defensible instead of a projection from one
December figure.

> §12.6 notes the Dec-2025 floor is load-bearing because carry-in keeps historical
> members whole. **That is still true and does not change.** A member's January 2026
> opening is still their December 2025 closing balance. What backfilling adds is the
> movement *within* 2026, which the carry-in alone cannot supply.

### 20.3 The risk this introduces, and how to contain it

Writing to `capital_build_up` from the ISC screen touches the table that four other
writers already maintain (§4) and whose running-balance chain was broken once
already (§11.1, 9 broken links, a ₱446,478.84 discrepancy). **The containment
matters more than the feature.**

**Every backfilled row is tagged and traceable.** Follow the established pattern
(§4): a `source_backfill_id` UNIQUE column and `deposit_account` tagged
`'BACKFILL_2026'`, plus the acting bookkeeper and a timestamp. A backfilled row must
never be mistakable for a transaction the cashier actually processed.

**Recompute the chain, never patch one row.** A backfilled deposit in March changes
`ending_share_capital` for March *and every row after it*. Writing one row and
leaving the rest stale is exactly the §11.1 failure. The write path must recompute
the member's full chain forward from the edited month, in one transaction.

**Never write over a real transaction.** If a month already holds a row from the
cashier, the loan trigger, or a membership payment, the grid shows it **read-only**.
Backfill fills gaps; it does not overwrite the books. This is the part of §12.6's
warning that survives intact and should be enforced in SQL, not just in the UI.

**Re-run §15.4's assertion after every save.** `opening + Σcrj + Σcdj == last
month-end` for the edited member. It is cheap, and it turns a corrupted chain into
an immediate error instead of a silently wrong average months later.

**Lock backfill once a posting exists for the period.** Editing the basis under a
posted distribution would make the posting unreproducible. Backfill is a
before-you-post activity; after §17.1's settlement lock, the months it covers are
closed.

### 20.4 Where it fits in the flow

Backfill is a **phase**, not a mode toggle buried in the grid:

```
1. BACKFILL   type the missing 2026 months, per member
                  ↓  (chain assertion passes for all members)
2. CALCULATE  preview the distribution from the now-complete basis
                  ↓
3. POST       record the payable (§14.3)
                  ↓  (March General Assembly)
4. SETTLE     the checklist — capitalise or cash (§17.2)
```

The page should make the current phase obvious, and should not offer Calculate while
known gaps remain. A simple readiness indicator — *"14 members have no data for
Mar–Aug"* — is worth more than a blocking modal, because the bookkeeper is the one
who knows whether a gap is missing data or a genuinely inactive member.

### 20.5 What changes elsewhere in the plan

**§12.6's "make the month cells read-only" recommendation is superseded** for the
backfill phase. It still holds afterwards: once a period's data is complete and a
posting exists, the cells are read-only again.

**§19.3's density levels gain a purpose.** Backfill is done in the full journal view
— it is the only one with CRJ/CDJ cells to type into. Summary and Quarters remain
read-only review views. This is a good split: the wide, scrolling view is where the
slow, careful data entry happens, and the compact default is where the review
happens.

**§19.5's pagination helps here.** Typing twelve months for 263 members is long work;
ten members per page with a filter for *"members with gaps"* turns it into a
finishable task rather than an endless scroll.

**The §15.4 assertion moves from a pre-posting check to a continuous one.** It runs
after each backfill save, not only before posting.

### 20.6 Open question

**Does a backfilled row need to be distinguishable from a real one in the ISC
basis?** It should not be — a deposit that happened in March is basis for March
whether it was entered in March or typed in September. The tag exists for audit and
for the "never overwrite a real transaction" rule, not to exclude the row from
averaging. Confirm with the bookkeeper, but proceed on that reading: excluding
backfilled rows would defeat the entire point of typing them in.
