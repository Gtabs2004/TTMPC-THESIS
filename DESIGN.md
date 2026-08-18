---
name: REGANT
description: The Cooperative Ledger — the shared visual system across TTMPC's role-based portals.
colors:
  primary: "#389734"
  primary-deep: "#2E7A2A"
  system-green: "#16A34A"
  system-green-deep: "#15803D"
  member-green: "#1D6021"
  member-green-dark: "#4ADE80"
  neutral-bg: "#F8FAFC"
  surface-white: "#FFFFFF"
  neutral-border: "#E5E7EB"
  neutral-border-soft: "#F3F4F6"
  text-strong: "#111827"
  text-secondary: "#6B7280"
  text-faint: "#9CA3AF"
  danger: "#DC2626"
  danger-bg: "#FEF2F2"
  info: "#2563EB"
  info-bg: "#EFF6FF"
  warning: "#B45309"
  warning-bg: "#FFFBEB"
typography:
  display:
    fontFamily: "Poppins, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Poppins, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Poppins, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Poppins, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.05em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "20px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-secondary:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  badge-status:
    rounded: "{rounded.full}"
    padding: "4px 10px"
    typography: "{typography.label}"
---

# Design System: REGANT

## Overview

**Creative North Star: "The Cooperative Ledger"**

REGANT reads as a trustworthy, exact bookkeeping instrument, not a generic admin template. Every screen is built around the same shell — a fixed green-accented sidebar, a light slate canvas, and white cards that hold numbers, tables, and ledger-style records — because the people using it (bookkeepers, treasurers, cashiers, managers, board members) are trusting it with real cooperative money and member trust. The voice is warm and institutional: approachable enough for a small teachers' cooperative office, precise enough that a treasurer would trust it with a disbursement ledger. It should never read as a cold, generic enterprise SaaS dashboard, nor as a playful consumer app.

Components are tactile and confident: cards lift and gain shadow on hover, KPI numerals are bold and oversized, and primary actions commit to a single, deliberate green. The system favors clarity over decoration — status is always color-coded and labeled, currency is always formatted as PHP, and every list ends in a real empty/loading state rather than a silent blank.

**Key Characteristics:**
- One shell (sidebar + topbar + `p-8` content canvas) reused verbatim across every role portal.
- Cooperative Green (`#389734`) as the singular brand accent; Tailwind's system green is its close functional sibling, not a second brand color.
- White, `rounded-xl`, `shadow-sm` cards on a light slate canvas — flat at rest, lifted on interaction.
- Bold, oversized KPI numerals paired with small uppercase kicker labels.
- Status is never color-only: every badge carries a label, and rank/priority badges are ringed and tinted, not solid-filled.

## Colors

A cooperative green anchors a mostly neutral, white-and-slate system; color elsewhere is reserved for status and semantic meaning, never decoration.

### Primary
- **Cooperative Green** (`#389734`): the TTMPC brand accent. Used for large headline-as-text (≥24px, or ≥18.66px bold), icon fills, and non-text decoration (borders, glows, indicator dots) — anywhere only the 3:1 non-text/large-text contrast minimum applies. This is the color new work should reach for in those roles.
- **Cooperative Green — Deep** (`#2E7A2A`): the color for any real body/label text or a button — white text on a green fill, or green text on white — regardless of size. `#389734` only clears ~3.7:1 against white, which fails the 4.5:1 body-text requirement; `#2E7A2A` clears ~5.3:1 either direction. This is also the resting fill for any full-bleed green section or gradient that carries text (not just a hover state).

### Named Rules
**The Text-on-Green Rule.** If it's real text under the large-text threshold (< 24px regular / < 18.66px bold) — a button label, a nav link, a paragraph — sitting on or rendered in Cooperative Green, use the Deep step (`#2E7A2A`), never the base Primary. Reserve base Primary for large headline text, icons, and decoration where only 3:1 is required.

### Secondary
- **System Green** (`#16A34A`, Tailwind `green-600`, deepening to `#15803D` on hover/`green-700`): the interactive green used for sidebar nav active/hover states, the "Sign out" button, table header bands, and chart strokes across every portal. It is functionally the same hue family as Cooperative Green and should be treated as its sibling, not a competing brand color — new sidebar/nav work should keep using it exactly as built rather than swapping in the primary hex.

### Member Portal Accent
- **Member Green** (`#1D6021`): a third, deliberately scoped dark green — the Member self-service portal's (`src/Member/Components/`) own accent for real text and icons: currency amounts, status labels, stepper text, outlined-button text/border, and icon fills across Dashboard, Apply, Loans, Statement, Lifecycle, Profile, and Savings. Predates this documentation pass; recorded here rather than migrated because it's used consistently across an entire portal (150+ call sites), not a one-off. **In dark mode it must pair with Member Green — Dark (`#4ADE80`, Tailwind `green-400`)** — the bare `#1D6021` value measures 1.9–2.6:1 against the portal's dark surfaces (`gray-950`/`gray-800`), well under the 4.5:1 text minimum; paired with `#4ADE80` it clears 11.6:1. Any element using `#1D6021` for text or an icon must carry a `dark:` override to the Dark step — never ship it bare.

### Neutral
- **Cooperative Slate** (`#F8FAFC`): the canonical page background. This is the newer, more polished treatment (seen in Disbursement, Payments) and is the direction the rest of the app should converge toward.
- **Surface White** (`#FFFFFF`): all cards, tables, modals, the sidebar, and the topbar.
- **Border** (`#E5E7EB`): default card/table/input borders.
- **Border — Soft** (`#F3F4F6`): row dividers inside tables and lists.
- **Text — Strong** (`#111827`): headings, KPI numerals, primary data values.
- **Text — Secondary** (`#6B7280`): labels, supporting copy, secondary table cells.
- **Text — Faint** (`#9CA3AF`): placeholder text, icon-only affordances, deep-secondary metadata (IDs, timestamps).

### Semantic (status & priority)
- **Danger** (`#DC2626` on `#FEF2F2`): errors, "Late" status, destructive emphasis.
- **Info** (`#2563EB` on `#EFF6FF`): informational notices (e.g. "read-only record" banners).
- **Warning** (`#B45309` on `#FFFBEB`): pending/attention states.
- Extended priority-rank tones (orange, amber, yellow, emerald, sky, violet, all at the `-50` background / `-700` text / `-200` ring step) are used only in the Disbursement priority-rank system — don't introduce new hues elsewhere without a matching semantic reason.

### Named Rules
**The One Green Rule.** Cooperative Green (`#389734`) and System Green (`#16A34A`) are the two shell-level greens shared by every portal, close enough in hue to read as one brand color at a glance. Member Green (`#1D6021`) is the single sanctioned exception — scoped entirely to the Member self-service portal, never used elsewhere. Any other green value (see Don'ts) is drift, not a variant to keep.

## Typography

**Display / Body Font:** Poppins (weights 300–800, plus 400 italic), falling back to sans-serif.

**Character:** A single geometric sans across the whole system — no serif, no mono, no second family. Weight and case carry the hierarchy: extrabold for numbers people are scanning for, uppercase-and-tracked for labels that categorize rather than communicate content.

### Hierarchy
- **Display** (800, 1.875rem / `text-3xl`, tight tracking): page titles ("Released Loans", "Payment Records").
- **Headline** (800, 1.5rem / `text-2xl`–`1.875rem`): KPI numerals inside stat cards.
- **Title** (700, 1.125rem / `text-lg`): card and table section headings.
- **Body** (500, 0.875rem / `text-sm`): table cell content, form labels, descriptive copy.
- **Label** (700, 0.75rem / `text-xs`, uppercase, 0.05em tracking): kicker labels above KPI numbers, table column headers, status badges.

### Named Rules
**The Kicker Rule.** Any label that categorizes rather than states a value (stat card captions, table headers, breadcrumbs) is uppercase, `text-xs`, bold, and tracked-out. Any label that states a value (numbers, names, dates) is not uppercased.

## Layout

Every role portal shares one shell: a fixed `w-64` white sidebar (logo + wordmark, nav list, sign-out button pinned to the bottom) beside a flexible main column with a `h-16` white topbar (search, notification bell, avatar, portal identity) and an `overflow-y-auto` content area padded at `p-8` (32px).

Content stacks in a consistent rhythm: a breadcrumb + page-title header block, then a KPI stat-card grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`, `gap-5`–`gap-6`), then the primary data surface (table or chart cards), with `mb-6`–`mb-8` between major blocks. Cards sit on the `#F8FAFC` canvas with consistent internal padding (`p-5`–`p-6`, 20–24px).

Staff device context is still open (see PRODUCT.md) — the shell is currently built and verified at desktop width; treat narrower breakpoints as unproven rather than assuming they already work.

## Elevation & Depth

Flat at rest, lifted on interaction. Cards and inputs carry only `shadow-sm` by default — a bare hint of depth, not a drop shadow system. On the more recently built screens, cards additionally respond to hover with `-translate-y-1 hover:shadow-md`, a deliberate tactile lift; older screens are static at rest and should adopt the same hover lift when touched. Dropdown menus and modals break from the flat baseline with real elevation (`shadow-xl`, `shadow-2xl`) because they sit above the page, not on it.

### Shadow Vocabulary
- **Resting** (`shadow-sm`): default for every card, input, and toolbar chip.
- **Lifted** (`shadow-md`, paired with `-translate-y-1`): hover state for interactive cards.
- **Overlay** (`shadow-xl`): dropdown/action menus.
- **Modal** (`shadow-2xl`): modal dialogs, paired with a `bg-gray-900/60 backdrop-blur-sm` scrim.

### Named Rules
**The Lift-on-Hover Rule.** Interactive cards (stat cards, list rows meant to be clicked) go from `shadow-sm` at rest to `shadow-md` with a 4px upward translate on hover. Static, non-interactive cards stay flat.

## Shapes

Corner radius scales with a surface's size and weight: small controls stay tight, containers open up, and overlays are the roundest thing on screen.

- **Small** (`rounded-md`, 6px): menu items, small inline pills.
- **Medium** (`rounded-lg`, 8px): buttons, inputs, toolbar filter chips, stat-card icon chips.
- **Large** (`rounded-xl`, 12px): cards, tables, the table's outer container.
- **Extra-large** (`rounded-2xl`, 16px): modals, the login card.
- **Full** (`rounded-full`): avatars, notification dots, status/priority badges.

Borders are hairline (`1px`, `#E5E7EB` or the softer `#F3F4F6`) and used instead of shadows to separate flat regions — table header from body, card from card, modal header/footer from body.

## Components

### Buttons
- **Shape:** `rounded-lg` (8px), never sharp corners.
- **Primary:** Cooperative Green background (`#389734`), white bold/semibold text, `shadow-sm`, hover darkens to `#2E7A2A` and (on the newest screens) adds a subtle upward lift. Reserve for the one committed action on a page (e.g. "Refresh Data").
- **System / nav-adjacent primary:** System Green (`#16A34A`→`#15803D` hover) — used for the sidebar "Sign out" button and any button living inside the nav chrome itself.
- **Secondary / Ghost:** white background, `border border-gray-300`, gray-700 text, `hover:bg-gray-50`. Used for "Close", "Previous/Next", and other non-committing actions.

### Cards
- **Corner Style:** `rounded-xl` (12px).
- **Background:** white on the `#F8FAFC` canvas.
- **Shadow Strategy:** `shadow-sm` resting, `shadow-md` + lift on hover for interactive cards (see Elevation).
- **Border:** `1px solid #E5E7EB` (or the softer `#F3F4F6` on older screens — converge to `#E5E7EB`).
- **Internal Padding:** 20–24px (`p-5`/`p-6`).

### Stat / KPI Card
A card whose top row is a colored icon chip (`bg-{tone}-50 text-{tone}-500` or `-600`, `rounded-lg`/`rounded-xl` icon container) paired with an uppercase kicker label, and whose body is a bold `text-2xl`–`3xl` numeral with an optional small trend line (`TrendingUp`/`TrendingDown` icon + colored delta text + muted comparison copy). This pairing — colored icon chip + kicker + numeral + trend — is the system's signature building block; reuse it for any new metric rather than inventing a new stat layout.

### Data Table
- **Header:** solid System-Green band (`bg-green-700`), white, `text-[10px]` uppercase, bold, tracked-out column labels.
- **Rows:** `border-b border-gray-100`, `hover:bg-gray-50/50` transition.
- **Cells:** primary value bold gray-900, supporting metadata (IDs, dates) gray-400/500, `font-mono` for reference/loan IDs.
- **Status/rank column:** badge component (see below).
- **Empty & loading states are required, not optional:** a centered icon-in-a-circle + bold headline + muted supporting line for empty results; a spinning ring + muted caption for loading. Never leave a table silently blank.

### Status / Priority Badges
Canonical style is **outlined, not solid**: `bg-{tone}-50 text-{tone}-700 ring-1 ring-{tone}-200`, `rounded-full` or `rounded-md`, `text-xs font-bold`, optional leading icon. This is the direction to converge on system-wide (see Don'ts for the legacy solid variant still present in older screens).

### Inputs / Fields
- **Style:** `bg-gray-50` at rest (brightening to white on focus on the newer screens), `border border-gray-300`, `rounded-lg`, left-aligned icon inset via `pl-9`–`pl-10`.
- **Focus:** `focus:ring-2 focus:ring-{accent}/50 focus:border-{accent}` where `{accent}` is Cooperative Green (`#389734`) on newer screens, System Green on older ones — both acceptable, neither is `#66B538` (see Don'ts).
- **Error:** red-bordered/red-tinted banner (`bg-red-50 border-red-200 text-red-800`) below or above the field, not inline red borders.

### Navigation (Sidebar)
- Fixed `w-64` white column, `border-r border-gray-200`, logo mark + "TTMPC" wordmark in Cooperative Green at the top, `hr` divider, then a vertical nav list.
- **Default:** gray-700 text, no background.
- **Hover:** `bg-green-50 text-green-700`.
- **Active:** identical to hover but `font-semibold` — active state is a weight change, not a new color.
- Sign-out button pinned to the bottom via `mt-auto`, full-width, System Green fill.

### Modal
- Full-screen scrim: `bg-gray-900/60 backdrop-blur-sm`, centered flex.
- Card: white, `rounded-2xl`, `shadow-2xl`, entrance animation `zoom-in-95`.
- Header and footer: `bg-gray-50`, hairline border separating them from the body; footer right-aligns its actions.
- Body: a `bg-gray-50` "data grid" (`dl`/`dt`/`dd` rows) is the standard way to present a record's fields inside a modal.

## Do's and Don'ts

### Do:
- **Do** use Cooperative Green (`#389734`) for the one primary, page-level commit action and for brand touchpoints (wordmark, active breadcrumb).
- **Do** use System Green (`#16A34A`/`#15803D`) for sidebar nav and the sign-out button, exactly as already built.
- **Do** use the colored-icon-chip + kicker + numeral + trend pattern for any new stat/KPI card.
- **Do** give every table an explicit empty state and loading state.
- **Do** use the outlined/ring badge style (`bg-{tone}-50 text-{tone}-700 ring-1 ring-{tone}-200`) for new status and rank badges.
- **Do** canonicalize new page backgrounds on `#F8FAFC`.
- **Do** use Member Green (`#1D6021`) for Member-portal text/icon accents, always paired with `dark:` Member Green — Dark (`#4ADE80`) — never ship the bare hex without its dark-mode partner.

### Don't:
- **Don't** introduce a fourth green, or use Member Green (`#1D6021`) outside the Member portal. The login page's `#66B538` is drift, not a variant — new work should use Cooperative Green (`#389734`/`#2E7A2A`) instead, and existing occurrences should migrate to it when touched. The public landing page (`App.jsx`) previously had the same drift (`#66B539`/`#529E2E`) and has been migrated to the canonical tokens.
- **Don't** use Member Green (`#1D6021`) for text or an icon without its `dark:text-green-400` (`#4ADE80`) pairing — bare, it drops to 1.9–2.6:1 contrast on the portal's dark surfaces.
- **Don't** use base Primary (`#389734`) for real text under the large-text threshold or for button fills — it fails 4.5:1 body-text contrast. Use Deep (`#2E7A2A`) there (see the Text-on-Green Rule).
- **Don't** mix `bg-gray-50`/`bg-gray-100` page backgrounds into new screens — `#F8FAFC` is canonical; treat gray-50/100 pages as legacy to migrate, not a pattern to repeat.
- **Don't** add new solid-pill badges (`bg-{tone}-100 text-{tone}-700`) — the ringed/outlined style is canonical going forward.
- **Don't** invent a new card radius, shadow step, or font. The system has exactly one radius scale, one shadow vocabulary, and one typeface (Poppins); reuse it.
- **Don't** design a new sidebar or topbar per portal — every role reuses the same shell verbatim; only the nav item list and route map change.
