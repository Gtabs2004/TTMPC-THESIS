# Navigation, Action Alignment & Microcopy Audit — REGANT (TTMPC)

**Scope:** `Router.jsx` (ground truth for valid routes) cross-referenced against every sidebar/nav construction across all 6 role portals, the public landing page (`App.jsx`), the loan-approval decision flow, the loan-submission forms, and every Cashier money-moving screen. `node_modules`, `dist`, `.venv`, `dev-dist` excluded.

**Method:** `Router.jsx` was read in full to build a canonical list of the 91 registered routes. Every portal's sidebar/nav-building code was then read directly (not just grepped) to extract its actual route map, and each target was checked against that canonical list. Button handlers for approve/reject/disburse/sign-out/submit flows were traced to their actual implementation (Supabase `.update()`, backend `fetch()`, or a no-op) rather than judged by label alone. This is a full read of every sidebar/dashboard file (6/6 portals) plus deep tracing of the highest-stakes action flows (loan decisions, cashier money movement, loan submission) — not a label-only grep pass.

---

## 1. Audit Overview

| Metric | Count |
|---|---|
| Routes registered in `Router.jsx` | 91 |
| `.jsx` files scanned | 123 |
| Total `onClick` handlers | 494 |
| Total `navigate()` calls | 153 |
| Total `<Link>` / `<NavLink>` elements | 45 / 82 |
| Role-portal sidebars fully traced & route-checked | 6 / 6 (Bookkeeper, BOD, Manager, Treasurer, Cashier, Member) |
| **Dead/broken sidebar or nav links found** | **0** (all 6 portal sidebars route-check clean) |
| **Dead/misaligned links found on the public landing page** | **2** (see itemization) |
| **Fake / non-functional "Submit"-class actions found** | **0** — every sampled Submit/Approve/Reject/Disburse handler traced to a real Supabase write or backend `fetch()` |
| Destructive/money-moving screens missing a confirm gate | 3 (Cashier Withdrawals, CBU deposit, CBU) |
| Distinct labels found for the same membership-number field | 4 ("Member ID", "Membership ID", "Membership No", "Membership Number") |
| Vague button microcopy ("Click Here", "Process", generic "Submit") | 0 found |
| Files using URL-synced list/filter state (`useSearchParams`) | 2 / 123 |

**Headline finding:** the app's core navigation is more solid than this pillar list implies — every sidebar in every role portal was traced by hand and every single link resolves to a real route. The actual bugs cluster in two places: (1) the **public marketing landing page** (`App.jsx`), which nobody guards with the same rigor as the authenticated portals, and (2) **cross-screen inconsistency** (confirm-dialog coverage, field-label naming, URL state) rather than individually-broken code.

---

## 2. Broken / Misaligned Actions Itemization

| File Path & Line # | UI Label / Button Text | Actual Code Behavior | Expected Behavior | Severity |
|---|---|---|---|---|
| [App.jsx:275](TTMPC_THESIS/src/App.jsx#L275) | Mobile nav "Contact" | `<Link to="/" onClick={...}>Contact</Link>` — navigates to the homepage. | Should behave like the desktop nav's equivalent ([App.jsx:247](TTMPC_THESIS/src/App.jsx#L247)), `<a href="#contact">`, which scrolls to the real `<div id="contact">` section that exists at [App.jsx:512](TTMPC_THESIS/src/App.jsx#L512). This reads as a copy-paste of the "Home" link above it that was never changed. | 🔴 Critical — public-facing, first thing a visitor can click |
| [App.jsx:246](TTMPC_THESIS/src/App.jsx#L246) vs [App.jsx:274](TTMPC_THESIS/src/App.jsx#L274) | "Features" (desktop) vs "Features" (mobile) | Desktop: `<Link to="loan_services">` — navigates to a whole different page. Mobile: `<a href="#features">` — scrolls to the in-page `<section id="features">` at [App.jsx:383](TTMPC_THESIS/src/App.jsx#L383). Same label, two unrelated behaviors depending on viewport width. | Pick one behavior for "Features" and use it on both breakpoints — most likely the in-page anchor scroll (mobile's version), since the section already exists on the page. | 🟠 Major |
| [App.jsx:246](TTMPC_THESIS/src/App.jsx#L246) | "Features" (desktop) | `<Link to="loan_services">` — no leading slash. Currently resolves correctly only because `App` always renders at the router's root path `/` with no nesting; it is one route-tree change away from silently breaking. | Use the absolute path `to="/loan_services"` to match every other `<Link>` in the same file. | 🟡 Minor (works today, fragile) |
| [Cashier_Withdrawals.jsx](TTMPC_THESIS/src/Cashier/Components/Cashier_Withdrawals.jsx), [Cashier_CBU_Deposit.jsx](TTMPC_THESIS/src/Cashier/Components/Cashier_CBU_Deposit.jsx), [Cashier_CBU.jsx](TTMPC_THESIS/src/Cashier/Components/Cashier_CBU.jsx) | Withdrawal / CBU deposit submit buttons | No `useConfirm()` / `ConfirmDialog` anywhere in these three files (`grep` count: 0). A misclick submits a real withdrawal or capital-build-up deposit immediately. | Their sibling screens in the same portal — [Cashier_Payments.jsx:612](TTMPC_THESIS/src/Cashier/Components/Cashier_Payments.jsx#L612) and [Cashier_Disbursement.jsx:243](TTMPC_THESIS/src/Cashier/Components/Cashier_Disbursement.jsx#L243) — both gate the equivalent real-money action behind `await confirm({...})`. Add the same gate here for consistency. | 🟠 Major |
| App-wide, 14+ files, e.g. [Cashier_CBU.jsx:349](TTMPC_THESIS/src/Cashier/Components/Cashier_CBU.jsx#L349), [Cashier_Payments.jsx:1298](TTMPC_THESIS/src/Cashier/Components/Cashier_Payments.jsx#L1298) | "Member ID" | Bound to the `membership_number_id` field (same underlying data as the next two rows). | — | 🟡 Minor |
| [member_details.jsx:372](TTMPC_THESIS/src/Bookkeeper/Components/member_details.jsx#L372) | "Membership ID" | Also bound to `record?.membership_number_id` — the *same field* as "Member ID" above, different label. | Standardize on one label — "Member ID" is the incumbent majority usage (14+ files), so it's the cheaper migration target. | 🟡 Minor |
| [Treasurer_ApprovalDetails.jsx:1035](TTMPC_THESIS/src/Treasurer/Components/Treasurer_ApprovalDetails.jsx#L1035) | "Membership No" | Also bound to `row.membership_number_id` — same field again, third label. | Same fix as above. | 🟡 Minor |
| [Record_Details.jsx:157](TTMPC_THESIS/src/BOD/Components/Record_Details.jsx#L157) | "Membership Number" (form label) | Fourth distinct label for the same concept. | Same fix as above. | 🟡 Minor |
| [Member_Lifecycle.jsx:871](TTMPC_THESIS/src/Member/Components/Member_Lifecycle.jsx#L871) vs [Member_Dashboard.jsx:658](TTMPC_THESIS/src/Member/Components/Member_Dashboard.jsx#L658) | "Member ID" in both, but... | ...one reads `profile?.memberId`, the other reads `profile?.membershipId` — different property names on what should be the same `profile` object shape, mirroring the label drift above at the data layer. | Confirm both components actually receive the same profile shape; standardize the property name. | 🟡 Minor |
| App-wide, 34 files / 51 sites, e.g. [Member-Approvals.jsx](TTMPC_THESIS/src/BOD/Components/Member-Approvals.jsx) (4x), [MemberApprovalDetails.jsx](TTMPC_THESIS/src/BOD/Components/MemberApprovalDetails.jsx) (3x) | Various row/card click targets | `onClick={() => navigate(path)}` used instead of `<Link to={path}>`. Not broken — these mostly wrap non-anchor elements like table rows and cards where a semantic `<Link>` would need extra wrapping anyway — but it means no "open in new tab" / "copy link" / middle-click support, and no `<a href>` for crawlers or a11y tools to see. | Where the clickable element *is* naturally link-shaped (a text link, a "View Details" button), swap to `<Link>`. Leave genuine whole-row/whole-card click targets as `onClick` — wrapping a `<tr>` in `<Link>` isn't more semantic, just differently non-semantic. | 🟡 Minor (mixed bag, not uniformly wrong) |
| App-wide | List/table pagination & tab filters | Only [Members_Profile.jsx](TTMPC_THESIS/src/Member/Components/Members_Profile.jsx) and [MIGS-Details.jsx](TTMPC_THESIS/src/Bookkeeper/Components/MIGS-Details.jsx) use `useSearchParams`. Every other paginated/filterable table (loan ledgers, member records, payment logs, audit logs) holds page number and active tab in local `useState`, so refreshing the page or sharing a URL loses your place. | Adopt `useSearchParams` for page/tab/filter state on the highest-traffic tables first (Loan-Ledger, Member-Records, Reports) so state survives refresh and is shareable/bookmarkable. | 🟡 Minor (systemic, not a single bug) |

**Positive findings, verified, worth keeping:**
- [LoanApprovalDetails.jsx:957-986](TTMPC_THESIS/src/Manager/Components/LoanApprovalDetails.jsx#L957-L986) — the shared Approve/Reject flow used by Manager, Bookkeeper, and BOD (`/loan-approval/:id`, `/bookkeeper-loan-approval/:id`, `/bod-loan-approval/:id` all mount the same component) genuinely writes `decision`/`nextStatus` (`'recommended for approval'` / `'rejected'` / `'bod rejected'`) and **requires a non-empty rejection reason before it will let you reject** — a real safeguard, not decoration.
- [Consolidated_Loan.jsx:1483,928](TTMPC_THESIS/src/LOANFORMS/Consolidated_Loan.jsx#L1483) — the loan-submission Submit button has a *double* duplicate-submission guard: `disabled={loading || printing || exceedsCeiling || renewalBlocked || eligibilityFailed || stressIndexExceeded}` on the button itself, **and** an `if (loading) return;` early-exit inside the submit handler as a second line of defense.
- Sign-out is correctly wired everywhere sampled: `await signOut(); navigate("/");` inside a `try/catch`, not a fake link.
- Zero instances of vague button copy ("Click Here", "Process", "Submit" with no object) found anywhere in the scanned `.jsx` files.
- Zero raw `window.confirm()` calls found — every destructive-action confirmation that exists goes through the shared `ConfirmDialog`/`useConfirm()` system, not a jarring native browser dialog.

---

## 3. Route & Role Alignment Matrix

Built by reading each portal's actual `menuItems`/`routeMap` (or per-item `path`) construction, not by guessing from labels.

### Bookkeeper (`bookkeeperDashboard.jsx`)
| Sidebar Label | Target Route | In `Router.jsx`? |
|---|---|---|
| Dashboard | `/dashboard` | ✅ |
| Manage Member | `/manage-member` | ✅ |
| Loan Approval | `/bookkeeper-loan-approval` | ✅ |
| Manage Loans | `/manage-loans` | ✅ |
| Payments | `/payments` | ✅ |
| Savings Withdrawals | `/bookkeeper-savings-transactions` | ✅ |
| Accounting | `/accounting` | ✅ |
| MIGS Scoring | `/migs` | ✅ |
| Reports | `/reports` | ✅ |
| Audit Trail | `/audit-trail` | ✅ |
| Grocery | `/grocery` | ✅ |
| Legacy Member Validation | `/legacy-member-validation` | ✅ |

### BOD / Secretary (`B-Dashboard.jsx`)
| Sidebar Label | Target Route | In `Router.jsx`? |
|---|---|---|
| Dashboard | `/BOD-dashboard` | ✅ |
| Member Approvals | `/member-approvals` | ✅ |
| Loan Approvals | `/bod-loan-approvals` | ✅ |
| Loan Ledger | `/bod-manage-loans` | ✅ (routes to the Manage-Loans list component — label says "Ledger," worth a naming pass but not a dead link) |
| Manage Member | `/bod-manage-member` | ✅ |
| Audit Log | `/bod-audit-log` | ✅ |
| Loan Policies | `/bod-loan-policies` | ✅ |
| Training Attendance | `/Secretary_Attendance` | ✅ |
| General Assembly | `/Secretary_General_Assembly` | ✅ |
| Membership Records | `/Secretary_Records` | ✅ |

### Manager (`M-Dashboard.jsx`)
| Sidebar Label | Target Route | In `Router.jsx`? |
|---|---|---|
| Dashboard | `/manager-dashboard` | ✅ |
| Loan Approval | `/loan-approval` | ✅ |
| Manage Member | `/manager-manage-member` | ✅ |
| Reports | `/manager-reports` | ✅ |
| Audit Log | `/manager-audit-log` | ✅ |

### Treasurer (`Treasurer_Dashboard.jsx`)
| Sidebar Label | Target Route | In `Router.jsx`? |
|---|---|---|
| Dashboard | `/Treasurer_Dashboard` | ✅ |
| Disbursement | `/disbursement` | ✅ |
| Vault | `/treasurer-vault` | ✅ |
| Schedule | `/schedule` | ✅ |
| Payments | `/treasurer-payments` | ✅ |
| Loan Approval | `/treasurer-approval` | ✅ |
| Accounting | `/treasurer-accounting` | ✅ |
| Audit Log | `/treasurer-audit-log` | ✅ |

### Cashier (`Cashier_Dashboard.jsx`)
| Sidebar Label | Target Route | In `Router.jsx`? |
|---|---|---|
| Dashboard | `/Cashier_Dashboard` | ✅ |
| Payments | `/Cashier_Payments` | ✅ |
| Disbursement | `/Cashier_Disbursement` | ✅ |
| Membership Payments | `/Cashier_MembershipPayments` | ✅ |
| Deposits → Savings | `/Cashier_Savings` | ✅ |
| Deposits → Capital Build-Up | `/Cashier_CBU` | ✅ |
| Withdrawals | `/Cashier_Withdrawals` | ✅ |
| Grocery | `/Cashier_Grocery` | ✅ |
| Payroll Schedule | `/Cashier_Schedule` | ✅ |
| Audit Log | `/cashier-audit-log` | ✅ |

### Member (`MemberMobileNav.jsx`)
| Nav Label | Target Route | In `Router.jsx`? |
|---|---|---|
| Dashboard | `/member-dashboard` | ✅ |
| Loans | `/member-loans` | ✅ |
| Statement | `/member-statement-of-account` | ✅ |
| Savings | `/member-savings` | ✅ |
| Profile | `/members-profile` | ✅ |

**Result: 41/41 sidebar links checked across all 6 portals resolve to a real, registered route. Zero orphaned in-app navigation found.** The only broken/misaligned links in this audit are on the public, unauthenticated landing page (§2).

**Architectural note (not a live bug, but a latent risk):** Bookkeeper, BOD, Manager, and Treasurer sidebars all build their route via `routeMap[item.name] || \`/${item.name.toLowerCase().replace(/\s+/g,'-')}\``. Every current entry has an explicit `routeMap` mapping, so the fallback never fires today — but the *pattern* means a future menu item added without a matching `routeMap` entry fails silently (no error, just a `/kebab-cased-name` URL that likely doesn't exist and falls through to the catch-all `Navigate to="/"`). Cashier's sidebar avoids this entirely by giving every item an explicit `path` — worth adopting that pattern everywhere, and worth extracting all four duplicated sidebars into one shared component either way (see the companion `UI_CONSISTENCY_AUDIT.md`, which independently found no shared UI primitives exist in this codebase).

---

## 4. Action Items Checklist

Ordered by pre-demo priority.

1. **🔴 Fix the "Contact" mobile-nav link in `App.jsx:275`.** Change `<Link to="/">Contact</Link>` to `<a href="#contact">Contact</a>`, matching the desktop nav and the section that already exists on the page. This is the single highest-visibility bug in the whole audit — it's on the public landing page, in the mobile hamburger menu, one tap away from the site's actual contact information.
2. **🟠 Reconcile the "Features" nav item's behavior between desktop and mobile** (`App.jsx:246` vs `:274`) so the same label does the same thing regardless of viewport.
3. **🟠 Add a `confirm()` gate to Cashier_Withdrawals, Cashier_CBU_Deposit, and Cashier_CBU** before their submit actions, matching the pattern already built and working in `Cashier_Payments.jsx` and `Cashier_Disbursement.jsx` in the same portal.
4. **🟡 Fix `App.jsx:246`'s relative `to="loan_services"`** to the absolute `/loan_services` while touching that line for fix #2.
5. **🟡 Pick one label for the membership-number field** ("Member ID" is the incumbent majority — 14+ files) and migrate `member_details.jsx`, `Treasurer_ApprovalDetails.jsx`, and `Record_Details.jsx` to match; align the underlying `memberId`/`membershipId` property naming while there.
6. **🟡 Extend `useSearchParams` to the highest-traffic paginated tables** (Loan-Ledger, Member-Records, Reports, Audit logs) so page/tab state survives a refresh — not urgent for the demo itself, but likely to surface as an odd "it forgot where I was" moment if a panelist refreshes mid-review.
7. **🟡 Consider giving BOD's "Loan Ledger" sidebar item a label that matches what `/bod-manage-loans` actually shows**, or point it at a real ledger view if one exists — low priority, verify during demo rehearsal rather than blind-fixing.

No changes were made to the codebase as part of this audit — this is a report only, per the requested deliverable.
