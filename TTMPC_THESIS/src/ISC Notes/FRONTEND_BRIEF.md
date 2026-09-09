# ISC Frontend — what to build

**For whoever builds the ISC screen.** The database side is finished, deployed
and tested against live data. Nothing on the frontend exists yet — no page, no
route, no nav entry. This is the brief for that work.

You should not need to read `ISC_DIVIDEND_PLAN.md` (4,000 lines) to start. It is
there when you want the reasoning behind a rule; section numbers below point into
it.

---

## 1. What ISC is, in four sentences

Once a year the cooperative's General Assembly sets aside part of its audited net
surplus to pay members interest on their share capital. Each member earns in
proportion to the **average** share capital they held across the year — not their
closing balance — so someone who deposited in March earns less than someone who
held the same amount since January.

The screen's job is to compute that and show it.

**It pays CASH.** The payout only becomes share capital if the member chooses
that at the General Assembly, which happens the following March. That election is
a separate step and is **not** part of this screen.

---

## 2. What you are building right now

**A calculation screen. Nothing more.**

Enter the amount the GA allocated (optional) → press Calculate → see what every
member would earn.

**One input.** The period is fixed at January–December of the current year, so
there is nothing to pick (§3.1).

**No Post button.** Posting is deliberately deferred. The functions exist and
work, but the cooperative is not using them yet. Say so on the page rather than
showing a disabled button — a control that always fails invites *"why is this
broken?"*.

---

## 3. The only call you need

One RPC. **It writes nothing** — no posting, no member records, no balance
changes. Run it as often as you like.

```js
import { supabase } from "../../supabaseClient";

// The period is ALWAYS January to December of the current year (§3.1).
// There is no period picker; derive it from the clock.
const year = new Date().getFullYear();

const { data, error } = await supabase.rpc("isc_calculate_preview", {
  p_period_start:   `${year}-01-01`,
  p_period_end:     `${year}-12-01`,   // note: the MONTH, not the last day
  p_allocated_pool: 1000000.00,        // or null — see §5.3
});
```

> `p_period_end` takes the first day of the closing month. The function expands
> it to that month's last day itself, so `2026-12-01` means "through 31 December
> 2026". Passing `2026-12-31` works too.

### 3.1 There is no period picker

**The period is always 1 January – 31 December of the current calendar year.**
The bookkeeper does not choose it, so do not build pickers for it. Show the
period as text — *"January – December 2026"* — so it is visible but not
editable.

This removes what would otherwise be the screen's most dangerous input. The
cooperative's opening balances are all dated 31 December 2025, so a period
starting in December reads every member's opening balance as ₱0 and every
average as their closing balance — silently wrong, no error, plausible-looking
numbers. Fixing the period to January removes that failure entirely.

*(Background: plan §22.5. The database still accepts any range and still
enforces its own guards; this is a UI simplification, not a loosening.)*

### 3.2 The grid is READ-ONLY — nothing in it is typed

**Where every figure comes from:**

| Column | Source | Written by |
|---|---|---|
| Share capital carried in | the member's balance before January | the ledger itself |
| **CRJ** | a member paying share capital at the counter | the cashier's CBU deposit screen |
| **CDJ** | 2% retained from a loan disbursement | the loan release, automatically |
| Balance | previous month + CRJ + CDJ | derived |
| Total / Average / Rate / Payout | the seven formulas | the database |

All of it already flows in from parts of the system that work today. **The only
thing anyone types on this screen is the allocated amount.**

So do not build editable cells, and do not carry over the module's
*"Click any CRJ or CDJ figure to edit"* affordance. The CRJ and CDJ are source
books — a distribution screen must not be able to rewrite them.

If a figure looks wrong, the fix is in the cashier or loan record that produced
it, not in this table.

### What comes back — one row per eligible member

| Field | Type | What it is |
|---|---|---|
| `member_id` | uuid | react key |
| `membership_id` | text | e.g. `TTMPC-055` |
| `member_name` | text | |
| `opening_balance` | numeric | share capital carried into the period |
| `month_end_balances` | numeric[] | balance at the end of each month, in order |
| `crj_by_month` | numeric[] | paid in at the cashier, per month |
| `cdj_by_month` | numeric[] | retained from a loan, per month — **this also ADDS** |
| `average_share_capital` | numeric | the member's average |
| `total_share_capital` | numeric | closing balance |
| `total_average` | numeric | cooperative-wide total — same on every row |
| `rate` | numeric | the derived rate as a percent — same on every row |
| `interest_amount` | numeric | the payout. `null` if no amount was given |
| `payout_unrounded` | numeric | before centavo rounding |
| `adjusted` | boolean | true if this row got a residual centavo |
| `month_count` | integer | how many months in the period |

Live figures today: **265 members**, Jan–Dec 2026, ₱1,000,000 → rate **3.33%**.

---

## 4. The formulas — do NOT reimplement these

They are in the database and have been checked against the bookkeeper's own
handwritten formula sheet. They are listed here so you recognise the numbers,
**not so you can compute them in JavaScript.**

```
1.  Month balance   = previous month + CRJ + CDJ
2.  Member total    = sum of the 12 month-end balances   (balances, not deposits)
3.  Member average  = member total ÷ 12
4.  Total average   = average₁ + average₂ + … + averageₙ
5.  ISC rate        = allocated amount ÷ total average
6.  Member payout   = member average × ISC rate
7.  Σ payouts       = the allocated amount, EXACTLY
```

> **Rule 7 is a hard constraint, not a tolerance.** The database floors every
> payout to the centavo and hands the leftover centavos to the members with the
> largest discarded fractions, so the total lands exactly on the allocated
> amount. Those rows come back with `adjusted = true`.
>
> This is why the page must never recompute a payout: a second implementation in
> JS would round differently and disagree by centavos.

---

## 5. Things that will bite you

Each of these has a real failure behind it. They are not style preferences.

### 5.1 Totals must cover EVERY member, never the visible page

Paginate the render, not the maths.

```jsx
// totals — over all 265 rows, always
const totals = useMemo(() => rows.reduce(...), [rows]);

// render — this page only
const pageRows = rows.slice(page * 10, page * 10 + 10);
```

The footer carries rule 7. If it sums only the ten rows on screen, it shows a few
thousand pesos against an allocated amount of millions, reads "out of balance",
and looks like a calculation bug rather than a rendering one.

**Same for CSV export** — write every row, not the current page.

### 5.2 Build the period from the clock, not from an input

`const year = new Date().getFullYear()` → `${year}-01-01` to `${year}-12-01`.

Do not add a picker "for flexibility". The one thing a picker would allow is a
December start, and that is the screen's worst failure mode: the cooperative's
opening balances are all dated 31 December 2025, so a period starting in December
asks for each member's balance *before* those rows existed. Every opening reads
₱0, every average equals the closing balance, and nothing errors — the numbers
just look plausible and are wrong.

Fixing the period removes the failure rather than warning about it.

*(Plan §22.5.)*

### 5.3 A blank amount means "not decided yet", never ₱0.00

The bookkeeper needs to ask *"what is our total basis?"* before the General
Assembly picks a figure. Pass `p_allocated_pool: null` and you get the members
and the basis with `interest_amount` as `null`.

Render that as `—`. Showing ₱0.00 looks like a decision to pay nobody anything.

### 5.4 Show the centavo adjustments

Rows with `adjusted = true` received one extra centavo so the batch balances.
Surface it — a small badge or dot with a tooltip. It is what lets an auditor
trace a one-centavo difference instead of assuming the system is broken.

### 5.5 Never do arithmetic on a payout

Format it, paginate it, filter it, sort it. Do not add, average or re-round it
outside the totals footer. Every figure on screen must be a figure the database
produced.

---

## 6. Design

**Follow `DESIGN.md` at the repo root** — it is the actual system, not a
suggestion. The parts you will need:

- **Shell:** `<StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />` +
  `<StaffTopbar />` + `<Breadcrumb />`. Copy the structure from
  `src/Treasurer/Components/ISC_Postings.jsx` — it is the shortest example.
- **`min-w-0`** on the flex child, or wide content pushes the whole page
  sideways instead of scrolling inside its own container.
- **Cards:** white, `rounded-xl`, `border border-gray-200`, `shadow-sm`, `p-5`–`p-6`.
- **Table header:** solid `bg-green-700`, white, `text-[10px]` uppercase, bold.
- **Rows:** `border-b border-gray-100`, `hover:bg-gray-50/50`.
- **Stat cards:** coloured icon chip + uppercase kicker + bold `text-2xl` numeral.
- **Inputs:** `bg-gray-50` at rest, white on focus, `border-gray-300`, `rounded-lg`.
- **Numbers:** `tabular-nums` everywhere, or the columns will not line up.
- **Empty and loading states are required**, not optional.

**The grid layout is already approved** — see `ISCDistributionModule.tsx` and
`ISC_DISTRIBUTION_MODULE.md` in this folder. That is a TypeScript reference; the
app is `.jsx`, so port it rather than dropping it in.

> ⚠️ **The module renders, and four things in that render are out of date.**
> Copy the layout, not these:
>
> | On screen | Actually |
> |---|---|
> | "Post batch" button | posting is deferred — no Post button (§2) |
> | "Fiscal year 2025" dropdown | no picker — Jan–Dec of the current year (§3.1) |
> | Legend: *"CDJ share capital withdrawn"* | **wrong** — CDJ is loan retention and it **ADDS** |
> | *"Click any CRJ or CDJ figure to edit"* | **the grid is READ-ONLY** — see §3.2 |
>
> The CDJ legend matters most: it states a definition and gets it backwards. A
> ₱500,000 loan retains 2% — ₱10,000 — and puts it **into** the member's share
> capital. Both CRJ and CDJ increase the balance; they differ by where the money
> came from, not by sign.
>
> Everything else in that render is correct, including the reconciliation line
> and the fixture's figures.

### Where it goes

```js
// components/StaffSidebar/configs/bookkeeper.js
{ name: "ISC Distribution", icon: Banknote, path: "/bookkeeper-isc" },

// Router.jsx
{ path: "/bookkeeper-isc", element: bookkeeperGuarded(<Bookkeeper_ISC/>) },
```

`Banknote` is already imported in the config file.

---

## 7. Scope — build this, skip that

### Build now

- [ ] Nav entry + route + page shell
- [ ] Period shown as read-only text (Jan–Dec of the current year) — no picker
- [ ] Amount input (optional) + Calculate button
- [ ] Summary: members, months, basis, rate, total interest
- [ ] Member table, paginated **10 per page**
- [ ] Search by name or membership number, applied **before** slicing
- [ ] CSV export of **all** rows
- [ ] Empty, loading and error states

### Skip for now, and why

- **Post button** — posting is deferred (§2)
- **Settlement checklist** — only relevant once posting is enabled
- **The full 12-month grid** — the month columns are mostly empty until the
  2026 backfill happens, so a summary table is more honest today
- **Row virtualisation** — pagination at 10 makes it unnecessary at any size
- **`utils/iscCalculations.js`** — do not build this. See §4 and §5.5.

---

## 8. Try the calculation before you write any code

Run this in the Supabase SQL editor. It writes nothing:

```sql
-- Jan-Dec of the current year, PHP 1,000,000 allocated.
SELECT membership_id, member_name,
       average_share_capital, rate, interest_amount
FROM isc_calculate_preview(
       date_trunc('year', now())::date,                       -- Jan 1
       (date_trunc('year', now()) + interval '11 months')::date, -- Dec 1
       1000000.00)
ORDER BY average_share_capital DESC
LIMIT 20;
```

`src/server/isc_checks/20_CALCULATE_ONLY.sql` has more of these — including one
that walks a single member's year month by month, and one that compares several
allocated amounts side by side.

Seeing the real shape of the data first will save you guessing at it.

---

## 9. One caveat about the data

Of the nine months since the December 2025 import, **five have no CBU activity at
all** and the rest touch only two to five members out of 258. Real 2026 records
are still mostly on paper.

So the numbers are arithmetically correct but thin: a 2026 average today is
essentially the December balance carried forward. That is a data-entry gap, not a
bug, and it does not affect what you build — but do not be surprised when most
members show an average identical to their closing balance.

---

## Questions

`ISC_DIVIDEND_PLAN.md` has the full reasoning. The sections you are most likely
to want:

| Section | Subject |
|---|---|
| §12 | the seven formulas and why the rate is derived |
| §14, §23 | cash vs capital, and the March timing |
| §19 | screen size, density, pagination |
| §22 | the build log — every bug found and how |
| §24 | this brief, in the plan's own words |
| §25 | the bookkeeper's handwritten formulas, checked against the code |
