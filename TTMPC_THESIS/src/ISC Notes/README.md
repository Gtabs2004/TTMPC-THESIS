# ISC Notes — what is in this folder

Three files, written at different times for different purposes. Read them in
this order.

---

## 1. `FRONTEND_BRIEF.md` ← **START HERE**

**Current. Written 2026-09-09, after the backend was finished.**

What to build, the one RPC call to make, the fields it returns, and the five
things that will bite you if you get them wrong. Written to be read on its own —
you should not need the 4,000-line plan to start.

If you only read one file in this folder, read this one.

---

## 2. `ISC_DISTRIBUTION_MODULE.md`

**Design reference. Written BEFORE the backend existed.**

The approved grid layout and the seven accounting formulas, transcribed from the
cooperative's own specification. **Both are still authoritative.**

Its "what to build next" sections are not. They assume the component owns its own
data and posting, which is no longer true — the arithmetic moved into the
database and posting is deferred. A banner at the top of the file says so.

---

### What the rendered module looks like — and what to ignore in it

The `.tsx` renders and is worth running to see the intended screen. The fixture
reproduces exactly: total average ₱177,833.33, rate 11.246485%, Gero ₱4,104.97,
Bautista ₱12,146.20, footer landing on ₱20,000.00 with *"Distribution reconciles
to ₱20,000.00"*. Those are the same numbers the database produces, so the design
and the backend agree.

**Four things on that screen are superseded. Do not copy them:**

| On screen | What is actually true |
|---|---|
| **"Post batch"** button | Posting is deferred. No Post button (§2 of the brief) |
| **"Fiscal year 2025"** dropdown | No picker — always Jan–Dec of the current year (§3.1) |
| Legend: **"CDJ share capital withdrawn"** | **Wrong.** CDJ is loan retention and it ADDS. A ₱500k loan puts ₱10k *into* share capital |
| *"Click any CRJ or CDJ figure to edit"* | **The grid is READ-ONLY.** CRJ comes from cashier deposits, CDJ from loan retention — both arrive automatically. Nothing in this table is typed |

Two of these matter more than the others.

**The CDJ legend states a definition and gets it backwards.** Both books add.

**The grid is not editable.** Every figure in it is derived from transactions the
cashier and loan flows already record. There is no data entry on this screen at
all — only the allocated amount is typed.

---

## 3. `ISCDistributionModule.tsx`

**A reference implementation. Not shipping code.**

TypeScript; the app is `.jsx`. **Port it, do not import it.**

Useful for two things: the exact grid layout, and `reconcileToPool()` as a
readable statement of how the centavo reconciliation works. The database does
that reconciliation now — this is here so you can see what it is doing, not so
you can run it.

`SAMPLE_MEMBERS` is a fixture with known-correct answers (₱20,000 allocated →
₱4,104.97 for the first member, rate `0.11246485473289597`). Useful for checking
your understanding; not useful as data.

---

## Where everything else lives

| | |
|---|---|
| Full design reasoning | `ISC_DIVIDEND_PLAN.md` (repo root) |
| Deployed SQL | `src/server/isc_v2_*.sql` |
| Verification queries | `src/server/isc_checks/` |
| Try the calculation | `src/server/isc_checks/20_CALCULATE_ONLY.sql` |
| Visual design system | `DESIGN.md` (repo root) |

---

## Status, in one paragraph

The database side is **built, deployed and tested against live data**: the
calculation, the posting path, settlement, and deletion all work, and the full
cycle was run end to end and then unwound with the books returning to exactly
their starting figures. The frontend is **not started** — no page, no route, no
nav entry. Posting is **deliberately switched off** for now; the cooperative is
using the calculation only.
