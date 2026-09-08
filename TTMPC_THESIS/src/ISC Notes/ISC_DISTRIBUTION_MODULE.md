# ISC Distribution Module — implementation note

**File:** `ISCDistributionModule.tsx`
**Status:** UI is approved. The layout, the ledger structure, and the arithmetic in this
component are correct and match the cooperative's accounting specification. **This is the
UI we are shipping.** Do not redesign it.

**What is still missing:** everything behind it. The component holds its data in local
React state and ships with a hardcoded fixture. The work is to replace that fixture with
real data and to persist edits and posted batches.

---

## 1. What this component is

A spreadsheet-style ledger for computing and distributing Interest on Share Capital to
members for one fiscal year.

The treasurer sees a single scrollable grid: one row per member, a sticky member column,
twelve months of Cash Receipts Journal / Cash Disbursements Journal / running balance,
and four summary columns on the right (annual total, average share capital, ISC rate,
payout). A pinned footer carries the vertical totals. There are no metric cards or
dashboard tiles above the table, and none should be added — the footer row *is* the
summary, which is how the cooperative's auditors read it.

---

## 2. The accounting rules (do not change these)

These are transcribed verbatim from the cooperative's accounting spec. They are the
authority. Any refactor must preserve them exactly, and where the code and these formulas
disagree, the formulas win.

### 1. Monthly running balance (per member)

$$\text{Month } m \text{ Balance} = \text{Month }(m-1)\text{ Balance} + \text{CRJ}_m - \text{CDJ}_m$$

For January, the previous balance is the starting share capital carried forward from the
prior fiscal year. The balance carries forward month to month; it does not reset.

*In code:* the `for` loop over the twelve months inside the `ledger` memo, accumulating
into `running`.

### 2. Member annual cumulative total

$$\text{Member Total} = \sum_{m=1}^{12} \text{Month } m \text{ Balance} = \text{Jan} + \text{Feb} + \dots + \text{Dec}$$

Note this sums the twelve *month-end balances*, not the transactions. A member who holds a
flat ₱10,000 all year and makes no deposits has an annual total of ₱120,000, not zero.
This is the single most common misreading of the spec.

*In code:* `monthEnd.reduce((a, b) => a + b, 0)` → `cumulative`.

### 3. Individual member average (AMSC)

$$\text{Member Average} = \frac{\text{Member Total}}{12}$$

Always divided by 12, including for members who joined mid-year — their early months
simply carry a zero or low balance.

*In code:* `cumulative / 12` → `average`.

### 4. Total cooperative average share capital

$$\text{Total Cooperative Average} = \sum \text{Member Average} = \text{Average}_1 + \text{Average}_2 + \dots + \text{Average}_n$$

The sum of the individual averages. Do not compute this as the grand cumulative total
divided by 12 as a shortcut — the two happen to agree arithmetically, but the spec defines
it this way and the footer must display the sum of the column above it.

*In code:* `rows.reduce((a, r) => a + r.average, 0)` → `totalAverage`.

### 5. Cooperative ISC rate

$$\text{ISC Rate} = \frac{\text{Audited Net Surplus Allocated for ISC}}{\text{Total Cooperative Average}}$$

Computed once for the whole batch and applied identically to every member. See the
precision note below.

*In code:* `pool / totalAverage` → `rate`.

### 6. Individual member ISC payout

$$\text{Member Payout} = \text{Member Average} \times \text{ISC Rate}$$

*In code:* `r.average * rate` → `payoutRaw`, before centavo reconciliation.

### 7. Reconciliation check

$$\sum \text{Member Payouts} = \text{Total Audited Net Surplus Allocated for ISC}$$

Exactly. Not approximately, not within a tolerance. This is a hard constraint, and it is
why `reconcileToPool` exists — see below.

*In code:* `totalPayout` versus `pool`, surfaced in the footer and in the toolbar readout.

### Precision

The rate is held as an unrounded JavaScript number in state and used unrounded in every
payout calculation. Rounding happens only at display time via `Intl.NumberFormat`. Do not
round the rate into state, do not store it as a fixed-decimal string, and do not round
intermediate averages.

### Why `reconcileToPool` exists

Rounding each payout independently leaves the batch a few centavos off the pool, which
means the journal entry does not balance and the batch cannot be posted. The function
floors every payout to the centavo, then assigns the residual centavos to the rows with
the largest discarded fractions (largest-remainder allocation). This guarantees rule 7
holds for any pool amount and any member set.

Rows that received a residual centavo are flagged `adjusted: true` and render a small
amber dot; the cell's tooltip shows the unrounded value and explains the adjustment. Keep
this. It is what lets an auditor trace a one-centavo difference instead of assuming a bug.

If the payout calculation is ever moved to the backend, the backend must implement the
same allocation, and the frontend and backend must agree to the centavo. Do not let the
two round independently.

---

## 3. Verified figures

The fixture in `SAMPLE_MEMBERS` is a regression test in disguise. With the pool at
₱20,000.00 the component must render exactly this:

| Member | Annual total | Average | Payout |
| --- | ---: | ---: | ---: |
| Gero, Juan Miguel | 438,000.00 | 36,500.00 | ₱4,104.97 |
| Bautista, Maria Corazon | 1,296,000.00 | 108,000.00 | ₱12,146.20 |
| Delos Santos, Ramon | 70,000.00 | 5,833.33 | ₱656.04 |
| Villanueva, Anna Liza | 90,000.00 | 7,500.00 | ₱843.49 |
| Ocampo, Jose Enrique | 120,000.00 | 10,000.00 | ₱1,124.65 |
| Fernandez, Grace Ann | 120,000.00 | 10,000.00 | ₱1,124.65 |
| **Total** | **2,134,000.00** | **177,833.33** | **₱20,000.00** |

ISC rate: `0.11246485473289597` (displayed as `11.246485%`).

Four residual centavos are assigned, landing on Ocampo, Fernandez, Gero, and Villanueva
in that order of fractional size.

The monthly movements behind these totals are constructed, not asserted — each member's
twelve month-end balances genuinely sum to the annual total shown. Editing a cell moves
the totals correctly rather than drifting away from a hardcoded answer.

**Please write these as unit tests** (`ISCDistributionModule.test.ts` or similar) before
touching the calculation code. Test the pure functions: the running-balance derivation,
the average, the rate, and `reconcileToPool`. Add a property test asserting that for any
pool and any member set, the payouts sum to the pool exactly.

---

## 4. Layout details that look cosmetic but are not

**`table-fixed` with an explicit `tableWidth`.** The sticky share-capital column is
positioned with `left: W_MEMBER` (236px). Under the browser's automatic table layout the
member column renders narrower than its declared width, which desyncs the sticky column
from its own header and causes the two to overlap during horizontal scroll. Fixed layout
keeps the `colgroup` widths authoritative so the offset is always correct. If you change
`W_MEMBER`, the sticky offset follows automatically — but do not remove `table-fixed`.

**Header `top-[29px]`.** The second header tier is offset by the measured height of the
first tier. If you change the padding or font size of the tier-one header cells, this
value must be updated or the two rows will overlap when scrolled.

**Z-index ladder.** Header corners are `z-40`, scrolling headers `z-20`, sticky body cells
`z-10`, footer `z-30`/`z-40`. Changing one in isolation will cause cells to render over
the wrong neighbours.

**Compact view uses `rowSpan`.** In "Month totals only" the month header spans both header
rows rather than repeating "Balance" twelve times. The summary columns keep their
sub-header row. This is why the two views branch in the header markup.

---

## 5. What to build next

### 5.1 Data loading

Replace the `SAMPLE_MEMBERS` default with a fetch. The component already accepts
`initialMembers`, `initialPool`, `initialFiscalYear`, and `fiscalYears` as props, so wrap
it in a container that loads by fiscal year and passes them down. Keep the exported
fixture — it is useful for Storybook and tests.

Suggested endpoint shape:

```
GET  /api/isc/ledger?fiscalYear=2025
→ { fiscalYear, allocatedPool, members: MemberLedgerRow[] }
```

The `MemberLedgerRow` interface is exported from the component. The backend should return
`openingBalance` as the audited prior-year closing share capital, and `crj` / `cdj` as
12-element arrays indexed January to December. Send zeros, not nulls, for months with no
movement.

### 5.2 Fiscal year selector

Changing the year currently only changes the label. It must refetch the ledger and reset
local edits, with a confirmation prompt if there are unsaved changes.

### 5.3 Persisting edits

CRJ, CDJ, and opening-balance edits currently live in component state and vanish on
refresh. Decide with the team whether inline edits should:

- **(a)** write back to the journal (each edit becomes a journal adjustment with an audit
  trail), or
- **(b)** stay as a local what-if scratchpad, with the grid read-only against posted
  journal data.

Option (b) is likely correct for a cooperative — the CRJ and CDJ are source books and
should not be silently rewritten from a distribution screen. If the team agrees, make the
month cells read-only and keep editing only for the pool amount. Confirm before
implementing either.

### 5.4 Posting the batch

`onPostBatch` receives a `PostBatchPayload` with the fiscal year, pool, unrounded rate,
total average share capital, and the fully computed rows. It should:

- Persist the batch and its per-member payouts.
- Be idempotent, or reject a second post for the same fiscal year. A double-posted ISC
  distribution is a serious accounting problem.
- Be gated on permissions — treasurer or manager only.
- Re-verify the reconciliation server-side before writing. Never trust the client's
  arithmetic for the posting itself.

The button is already disabled when the ledger does not balance, but that is a UX
convenience, not a control.

### 5.5 Export

`Export` currently produces a UTF-8 CSV with a BOM, which opens correctly in Excel with
the peso sign intact. The spec mentions Excel — if a genuine `.xlsx` is wanted, add it as
a second option rather than replacing the CSV.

### 5.6 Scale

The grid renders every member row. Six is fine; a few thousand is not. If the cooperative
has more than roughly 300 members, add row virtualisation (`@tanstack/react-virtual`)
before rollout. Note that virtualisation interacts with the sticky footer — the footer
totals must be computed from the full dataset, not from the rendered window.

---

## 6. Things to leave alone unless asked

- The dark toolbar and the pale-green banded rows. The banding is a deliberate reference
  to ledger paper and helps the eye track across twelve months of columns.
- The single-line reconciliation readout under the toolbar. It replaces metric cards on
  purpose.
- Currency formatting via `Intl.NumberFormat("en-PH")`. Bare numbers in the grid, full
  `₱` formatting in the payout column and footer. This is intentional density management —
  a peso sign on every one of ~40 numeric columns is unreadable.
- The `tabular-nums` class on numeric cells. Without it the digits do not align in
  columns, which is the entire point of a ledger.

---

## 7. Dependencies

React 18+, TypeScript, Tailwind CSS, `lucide-react`. No shadcn/ui imports, so the
component drops in without pulling in primitives that may be themed differently in this
repo. It follows the same Tailwind conventions, so swapping the buttons and the select for
shadcn equivalents later is straightforward if the team prefers consistency.

Type-checks clean under `strict` with `noUnusedLocals`.
