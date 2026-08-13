# UI/UX & Design System Consistency Audit — REGANT (TTMPC)

**Scope:** `TTMPC_THESIS/src/**` — all role portals (Member, Cashier, Bookkeeper, Manager, Treasurer, BOD/Secretary), `LOANFORMS/`, `Index_Pages/`, shared `components/`, and `src/index.css`. `node_modules`, `dist`, `.venv`, `dev-dist` excluded.

**Ground truth used:** this project already has a documented design system at `DESIGN.md` (Cooperative Green `#389734`/`#2E7A2A` deep, System Green `#16A34A`/`#15803D`, `#F8FAFC` canvas, Poppins-only type scale, `rounded-lg`/`rounded-xl`/`rounded-2xl` shape scale, outlined/ringed badges). This audit measures the actual code against **that** spec, not a generic external standard — so severities reflect deviation from a system this codebase already committed to in writing.

---

## 1. UI Health Score: **D+**

| Pillar | Grade | Why |
|---|---|---|
| 1. Typography | C | Single font family, clean heading hierarchy — but the most-used "micro" text size (350+ instances) sits outside the documented scale entirely. |
| 2. Color & Tokens | **F** | ~900+ raw hex arbitrary-value colors across 104 files; no token system wired into Tailwind at all; the single most-used color in the entire app isn't in the design doc. |
| 3. Layout & Spacing | B | Container rhythm (`p-8`, KPI grids) is genuinely consistent; arbitrary spacing is a minor, contained problem, not systemic. |
| 4. Interactive Polish | C+ | Icons are 100% consistent (Lucide only); hover/focus treatment is inconsistent between "newer" and "older" screens, matching a gap the project's own DESIGN.md already admits to. |
| 5. Component Reuse | D | No shared UI primitives directory exists (`Button`/`Modal`/`Badge`/`Input`) — every portal hand-rolls these from scratch; a deprecated badge pattern is baked into global CSS as a reusable class. |

The color-token failure is severe enough to be the dominant factor in the overall grade — it isn't a handful of stray hex codes, it's the primary way color is authored across the app.

---

## 2. Executive Summary

**Strongest patterns:**
- One shell, reused correctly: sidebar/topbar/`p-8` canvas structure is genuinely uniform across all 6+ role portals — `p-8` appears 139 times as the content-padding convention with no competing pattern.
- Icons are 100% Lucide (`lucide-react`) across all 103 files that import icons — zero fragmentation, a real win most React codebases this size don't achieve.
- A design system is documented at all (`DESIGN.md`) with named rules, explicit Do's/Don'ts, and known-debt items already called out — rare for a thesis-stage project and worth preserving.
- Container/grid rhythm (KPI grids, table cards) is consistent enough that pillar 3 is the strongest-scoring dimension.

**Most frequent, most consequential bugs:**
- **Color tokens aren't real tokens.** `src/index.css` has no `@theme` block registering `--color-primary` etc. — Tailwind v4 has zero first-class `bg-primary`/`text-primary` utilities in this project. Every component that needs brand green re-types a hex value from memory, and they don't agree with each other (see itemization row 1).
- **The most-used color in the whole codebase isn't documented.** `#1D6021` appears **288 times** — more than double the *documented* Primary token (`#389734`, 119 uses) — and doesn't appear anywhere in `DESIGN.md`'s palette.
- **DESIGN.md undercounts its own known drift.** It flags `#66B538` as isolated to "the login page," but it's actually in 12+ files across `LOANFORMS/` and `Index_Pages/`, 215 times total — the second-most-used color in the app.
- **Micro-typography has quietly become its own untracked tier.** `text-[10px]` (350 uses) is more common than the documented 12px Label token — the app's real "smallest text" size was never written down.
- **No shared component library exists**, so "component reuse" findings aren't isolated copy-paste — they're the default way every portal builds a modal, badge, or button.

---

## 3. Inconsistency Itemization

| File Path & Line # | Category | Found Violation | Recommended Design Token / Fix | Severity |
|---|---|---|---|---|
| App-wide, e.g. [Savings_Forms.jsx:6-235](TTMPC_THESIS/src/LOANFORMS/Savings_Forms.jsx#L6) (13x in this file alone), [Consolidated_Loan.jsx](TTMPC_THESIS/src/LOANFORMS/Consolidated_Loan.jsx) (26x), [Bonus_Loan.jsx](TTMPC_THESIS/src/LOANFORMS/Bonus_Loan.jsx) (24x) | 2. Color Tokens | `#1D6021` (288 uses, undocumented), `#66B538` (215 uses, DESIGN.md-flagged drift but far more widespread than documented), `#2C7A3F` (61, undocumented), `#1a4a2f` (37, undocumented), `#A0D284` (33, undocumented), `#154718` (28, undocumented) — at least 6 distinct greens in heavy rotation beyond the 2 documented tokens. | Register real Tailwind v4 tokens via `@theme { --color-primary: #389734; --color-primary-deep: #2E7A2A; --color-system-green: #16A34A; }` in `index.css`, then codemod every arbitrary hex to `bg-primary`/`text-primary-deep`/etc. | 🔴 Critical |
| [index.css:11](TTMPC_THESIS/src/index.css#L11) | 2. Color Tokens | Global `body { background-color: #F5F5F5; }` — does not match DESIGN.md's canonical page background (`#F8FAFC`, "Cooperative Slate"). Every route flashes/shows through this base color before its own container paints. | `background-color: #F8FAFC;` to match the documented token exactly. | 🟠 Major |
| [Cashier_CBU_Deposit.jsx:392](TTMPC_THESIS/src/Cashier/Components/Cashier_CBU_Deposit.jsx#L392), [Cashier_Disbursement.jsx:836,977](TTMPC_THESIS/src/Cashier/Components/Cashier_Disbursement.jsx#L836), [Treasurer/Disbursement.jsx:316,567](TTMPC_THESIS/src/Treasurer/Components/Disbursement.jsx#L316) | 2. Color/Contrast | `bg-[#389734] ... text-white` — uses base Primary as a button fill under white text. DESIGN.md's own "Text-on-Green Rule" states `#389734` only clears ~3.7:1 against white, failing the 4.5:1 body-text/button-label requirement; Deep (`#2E7A2A`) is the documented fix for exactly this case. | Swap fill to `#2E7A2A` (or `bg-primary-deep` once tokenized) on all button/label contexts; reserve `#389734` for large headline text, icons, and non-text decoration only. | 🟠 Major (WCAG 1.4.3) |
| App-wide, e.g. [LoanApprovalDetails.jsx](TTMPC_THESIS/src/Manager/Components/LoanApprovalDetails.jsx) and 349 other sites | 1. Typography Scale | `text-[10px]` used 350 times, `text-[11px]` 93 times, `text-[9px]` 17 times, `text-[13px]` 12 times — none of these are steps in Tailwind's default scale or in DESIGN.md's documented Label tier (`0.75rem`/12px). The app's real smallest/most-common label size (10px) is below the documented floor. | Either promote `10px` to a named `label-sm` token in `@theme` (if genuinely needed for dense tables) or standardize on `text-xs` (12px) per DESIGN.md and stop reaching for `text-[10px]` as the default kicker size. | 🟠 Major |
| [index.css:15-24](TTMPC_THESIS/src/index.css#L15) | 2/5. Legacy CSS | `.migs-status`/`.non-migs` classes hardcode `#16A34A` and an undocumented gray `#A9AEB8` (not in DESIGN.md's neutral scale of `#E5E7EB`/`#9CA3AF`/`#6B7280`) directly in global CSS rather than using the badge component pattern. | Replace with the documented outlined/ringed badge classes; delete the bespoke `.migs-status`/`.non-migs` rules. | 🟡 Minor |
| [index.css:21](TTMPC_THESIS/src/index.css#L21) | 6. Implementation Bug | `font-size: 15x;` — invalid CSS unit (should be `15px`). The browser silently drops this declaration, so `.migs-status` falls back to inherited font-size instead of the intended 15px. | Fix typo to `15px` (or remove the rule per the fix above). | 🟡 Minor |
| [index.css:184-198](TTMPC_THESIS/src/index.css#L184) | 5. Component Reuse | `.status-pending`/`.status-success`/`.status-error`/`.status-info` are defined as reusable global classes using the **solid** badge pattern (`bg-yellow-100 text-yellow-700` etc.) — DESIGN.md explicitly lists this exact pattern under "Don't: add new solid-pill badges... the ringed/outlined style is canonical." Because it's centrally defined in `index.css`, any component that reaches for `.status-badge .status-X` perpetuates the deprecated pattern by construction. | Rewrite these four classes to the outlined form (`bg-{tone}-50 text-{tone}-700 ring-1 ring-{tone}-200`) so the canonical pattern becomes the path of least resistance, not the exception. | 🟠 Major |
| 11 files, e.g. [ConfirmDialog.jsx](TTMPC_THESIS/src/components/ConfirmDialog.jsx), [MemberApprovalDetails.jsx](TTMPC_THESIS/src/BOD/Components/MemberApprovalDetails.jsx), [LoanCalculatorModal.jsx](TTMPC_THESIS/src/Member/Components/LoanCalculatorModal.jsx), [Cashier_Disbursement.jsx](TTMPC_THESIS/src/Cashier/Components/Cashier_Disbursement.jsx) | 5. Component Reuse | 11 separate files independently hand-roll the exact same modal shell (`fixed inset-0 z-50 flex items-center justify-center ...` scrim + card), matching DESIGN.md's documented Modal spec closely enough to prove it's the same design intent implemented 11 times over, not 11 different designs. There is no shared `<Modal>` in `src/components/`. | Extract one `<Modal>` primitive (scrim, `rounded-2xl` card, header/footer slot per DESIGN.md's spec) into `src/components/`; migrate call sites incrementally. | 🟠 Major |
| n/a — architectural | 5. Component Reuse | `src/components/` holds only app-specific composites (`Toast`, `ConfirmDialog`, `PasswordInput`, etc.) — there is no `src/components/ui/` (or equivalent) housing primitive `Button`, `Badge`, `Input`, `Card` components. Every one of the 123 `.jsx` files under `src/` builds these from raw Tailwind classes locally. | Stand up a small primitives layer (`Button`, `Badge`, `Card`, `Input`, `Modal`) that encodes DESIGN.md's documented specs once; this is also the fastest path to fixing rows 1–7 above, since fixing the primitive fixes every consumer. | 🟠 Major (root cause of most rows above) |
| 16 files, e.g. [Member_StatementOfAccount.jsx](TTMPC_THESIS/src/Member/Components/Member_StatementOfAccount.jsx) (3x), [Secretary_Attendance.jsx](TTMPC_THESIS/src/BOD/Components/Secretary_Attendance.jsx) (6x) | 3. Spacing Scale | 24 arbitrary pixel spacing values (`p-[…px]`, `gap-[…px]`, `w-[…px]`, `h-[…px]`) that don't land on Tailwind's 4px scale steps. Small in count relative to the color problem, but still scale drift. | Round each to the nearest scale step (`gap-3`/`gap-4` etc.) unless there's a documented pixel-exact reason (e.g. matching a PDF template coordinate) — if so, comment why inline. | 🟡 Minor |
| App-wide (self-acknowledged in DESIGN.md) | 4. Interactive Polish | DESIGN.md itself documents that only "the more recently built screens" have the `-translate-y-1 hover:shadow-md` card-lift treatment, and calls out "older screens are static at rest and should adopt the same hover lift when touched" — i.e. hover-state coverage is known to be inconsistent across the portal set, not a hypothesis this audit is introducing. | Treat as tracked debt: apply the lift treatment opportunistically whenever an older screen is touched for other reasons, per DESIGN.md's own instruction, rather than a dedicated pass. | 🟡 Minor (already tracked) |

---

## 4. Design Token Refactoring Checklist

Ordered so each step un-blocks the next — the root cause (no real token layer) is fixed first, then the highest-volume drift, then the structural component gap that would otherwise keep regenerating the same drift.

1. **Wire DESIGN.md's palette into Tailwind for real.** Add an `@theme` block to `src/index.css` defining `--color-primary`, `--color-primary-deep`, `--color-system-green`, `--color-canvas` (`#F8FAFC`), `--color-danger`, `--color-info`, `--color-warning`, etc. Until this exists, "use the token" has no compiler-enforced meaning — it's a convention nobody can lint for.
2. **Fix `index.css` itself first** — it's 5 minutes of work and removes 3 confirmed bugs: `body` background (`#F5F5F5` → `#F8FAFC`), the `font-size: 15x` typo, and the `.migs-status`/`.non-migs` bespoke hex colors.
3. **Rewrite the four `.status-*` classes to the outlined/ringed pattern** so the path of least resistance for new badges is the canonical one, not the deprecated one.
4. **Triage the green palette by volume, biggest first**: `#1D6021` (288) → decide whether it's actually a legitimate darker functional tone (e.g. "green-900"-equivalent for high-contrast text) that DESIGN.md should adopt as a real token, or drift to eliminate — then `#66B538` (215, confirmed drift per DESIGN.md) → `#2C7A3F` (61) → `#1a4a2f` (37) → `#A0D284` (33) → `#154718` (28). Don't touch the long tail of 1-9-use one-offs until the top 6 are resolved; they're not the systemic problem.
5. **Fix the 5 documented contrast violations** (`bg-[#389734]` + white text on buttons) by swapping to Deep — quick, high-value, directly tied to a WCAG criterion.
6. **Stand up `src/components/ui/{Button,Badge,Card,Input,Modal}.jsx`** encoding DESIGN.md's specs once each, using the new `@theme` tokens from step 1. This is the step that stops new drift from being written, not just cleans up old drift.
7. **Migrate the 11 hand-rolled modals to the shared `<Modal>`**, then the badge call sites, then buttons — in that order, since modals are the most copy-pasted and highest-risk (backdrop/escape-key/focus-trap behavior currently reimplemented 11 times).
8. **Decide the fate of the `text-[10px]`/`text-[11px]` tier**: either formalize it as a documented `label-sm` token (if dense financial tables genuinely need sub-12px labels) or normalize to `text-xs` per the existing spec — but stop leaving it undocumented, since 350+ call sites currently depend on a size nobody wrote down.
9. **Re-run this audit's color/typography counts after steps 4 and 8** to confirm the arbitrary-value count is trending toward zero rather than being backfilled by new one-offs.

No changes were made to the codebase as part of this audit — this is a report only, per the requested deliverable.
