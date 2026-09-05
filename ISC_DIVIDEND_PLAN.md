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

| Role | View | Calculate | Post | Reverse |
|---|---|---|---|---|
| **Bookkeeper** | ✅ | ✅ | ✅ | ❌ |
| **Treasurer** | ✅ | ❌ | ❌ | ❌ |
| **Manager** | ✅ | ❌ | ❌ | ✅ |
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

| Page | `canPost` | What the user sees |
|---|---|---|
| Bookkeeper | `true` | Full workflow: Calculate → Preview → Confirm & Post |
| Cashier | `false` | Calculate and Preview only. No Post button. |

On the cashier's copy the Post button is **not rendered at all** — not shown-and-
disabled. A button that always fails is worse than no button; it invites the
question "why is this broken?" A short line reading *"Posting is performed by the
Bookkeeper"* explains the absence.

Everything else is identical. The cashier still sees the year, the rate, the
eligible members, every member's average share capital, and the totals.

Reversal is a separate action on the manager's side and is not part of this
modal — see §8.2.

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

### 11.3 Remaining open items

**The averaging formula is still unconfirmed.**
Kept in one SQL function so it can be swapped with a single `CREATE OR REPLACE`.
Confirm with Romelyn that a month-end average over the chosen range is right.

**`ttmpc_erd.dbml` needs updating.**
It is missing `deposit_account`, `cbu_deposit_id`, and `member_status`, and will
need the two new ISC tables once they exist.
