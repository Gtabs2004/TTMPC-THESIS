---
format: 1920x1080
duration: 60s
message: "TTMPC/REGANT is a modern, integrated digital cooperative platform connecting members and cooperative officers through desktop and mobile experiences"
arc: "Demo Loop × Feature-Benefit Cascade — user-fixed six-act structure (see BRIEF.md), not freely chosen: Branding open -> Admin Dashboard demo -> Module cascade -> Mobile demo loop -> Connected-ecosystem proof -> Ecosystem + Brand close"
audience: "cooperative officers and members evaluating TTMPC/REGANT; thesis panel / academic presentation context"
mode: collaborative
music: none
---

## Changes from v1

User feedback on the v1 sketch sheet, verbatim: "for the act 1 can you make the background white so that the logo is more visible, same for the outro, and also can you make the UI for the mobile app, the same as our mobile app."

Applied in v2:
- Frame 1 (Branding open): background changed from the dark field to white so the real logo reads clearly.
- Frame 13 (Brand outro): same change, white instead of the green field.
- Frames 8–10 (Mobile act): rebuilt to match the real `Member_Dashboard.jsx` / `MemberMobileNav.jsx` UI — `#F8F9FA` body, white header bar, real profile card (avatar ring, green "Active" pill, Member ID/Join Date), real MIGS progress card, and the real 6-icon bottom nav (Dashboard/Apply/Loans/Statement/Lifecycle/Profile) with the member-green active-tab glow. Frame 9 also now uses the real loan-type selector tones (Consolidated blue, Emergency red, Bonus green).

No other frames changed.

## Locked

Layout, copy, and brand treatment confirmed on `storyboard.html` v2 by the user ("locked"). All 13 frames proceed from `built` to the real build (`animated`). Workers dress the confirmed sketch — placement, hierarchy, and copy are settled; they add full design treatment, real assets/registry blocks (device mockups), and motion, never redrawing the approved layout. Confirmed specifically: white fields on Frames 1 & 13 (not dark/green); Frames 8–10 built to match the real `Member_Dashboard.jsx` / `MemberMobileNav.jsx` UI (body color, header bar, profile/MIGS cards, 6-icon bottom nav with member-green active glow, real loan-selector tones on Frame 9).

## Frame 1 — Branding open

- scene: TTMPC mark assembles with depth on a clean dark-tinted field, then the frame opens into the system
- voiceover:
- sfx: whoosh-cinematic
- duration: 5s
- transition_in: cut
- status: animated
- src: compositions/frames/01-branding-open.html
- type: product_intro
- persuasion: Authority by association
- beat: intrigue -> clarity
- blueprint: logo-assemble-lockup
- asset_candidates: assets/ttmpc-logo.png — real cooperative logo (transparent), brand mark for the open

Cold open on the real TTMPC mark with cinematic depth (parallax layers, subtle 3D settle) — never a static logo-on-background. The mark resolves and the frame pushes THROUGH it into the system interface (Frame 2), so the logo becomes the door into the product rather than a title card that just cuts away. This is the only frame with no prior transition (`transition_in: cut` is a placeholder, per format).

narrativeRole: names the brand and immediately proves it's a real, running system, not a slide.
keyMessage: this is TTMPC, and it's software you can open.

## Frame 2 — Admin dashboard reveal

- scene: The BOD admin dashboard assembles — stat cards, forecast chart, gender/loan charts, live activity feed
- voiceover:
- sfx: click, notification
- duration: 10s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/02-admin-dashboard.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: clarity -> confidence
- blueprint: device-surface-showcase
- asset_candidates: source:src/BOD/Components/B-Dashboard.jsx — real BOD admin dashboard component (no-capture path; authored from this source, not a screenshot)

Source: `src/BOD/Components/B-Dashboard.jsx`. Real KPI stat cards — "Total Loan Applications," "Number of Late Payments," "Total Active Loans," "Approved Loan This Month" — land first (this frame's `frame.md` Dashboard treatment: the one dense 3-up metric-grid exception). Then the 12-month loan demand forecast chart draws in, a gender-split donut and an "Approved Loans per Month" bar chart (by loan type) populate, and a recent-activity feed ticks in real rows (payments, disbursals, applications). Slight continuous camera perspective/parallax across the full 10s — this is the brief's "dashboard statistics / loan information / charts / notifications / recent transactions" ask, built from the real component, not invented metrics. `zoom-through` in from Frame 1 marks the section boundary (branding -> the actual product).

narrativeRole: proves the desktop side is a real, data-dense operational tool.
keyMessage: officers see everything — loans, risk, money — in one real-time view.

## Frame 3 — Module: Member Management

- scene: Member roster table — active vs. terminated split, per-member loan counts
- voiceover:
- duration: 2s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/03-module-members.html
- type: feature_showcase
- persuasion: Value stacking
- beat: confidence
- asset_candidates: source:src/BOD/Components/Manage-Member.jsx — real member-management table (no-capture path)

Source: `src/BOD/Components/Manage-Member.jsx`. One hero visual only — the member table with its active-loan / paid-loan counts and Active/Terminated split — not a full walkthrough (this and Frames 4–7 are the module cascade; each gets ~2s). No blueprint forced; compose from `motion-language.md` per the brief's own ask (zooms/slides/perspective between screens). `zoom-through` in from Frame 2 marks the Admin Dashboard -> Module Cascade section boundary.

narrativeRole: first proof point in the module cascade — membership is centrally managed.
keyMessage: every member's status, at a glance.

## Frame 4 — Module: Loan Ledger

- scene: Payment-history ledger — date, reference, paid, penalty, remaining balance, status chips
- voiceover:
- sfx: whoosh-short
- duration: 2s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/04-module-ledger.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: confidence
- asset_candidates: source:src/Bookkeeper/Components/Loan-Ledger.jsx — real loan-ledger payment-history table (no-capture path)

Source: `src/Bookkeeper/Components/Loan-Ledger.jsx`. Real column set and color logic: validated=green, partial=amber, rejected=red, upcoming=blue; penalty column highlights red only when non-zero. `push-slide LEFT` — the lateral "next card" feel for this run of module beats.

narrativeRole: proves financial tracking is precise, not manual.
keyMessage: every payment, penalty, and balance — tracked to the peso.

## Frame 5 — Module: Loan Policies

- scene: Policy editor — tabbed by loan type, fee/interest/CBU/insurance fields
- voiceover:
- duration: 2s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/05-module-policies.html
- type: feature_showcase
- persuasion: Authority by association
- beat: confidence -> trust
- asset_candidates: source:src/BOD/Components/Loan-Policies.jsx — real loan-policy editor, tabbed by loan type (no-capture path)

Source: `src/BOD/Components/Loan-Policies.jsx`. Real tab strip — Consolidated / Emergency / Bonus / Non-member Bonus — with the actual per-type field set (service fee style, interest, CBU deposit, insurance, notarial, max amount, penalty). View-only by default, matching the real app's edit-gate. `push-slide LEFT` continues the cascade.

narrativeRole: proves governance — the Board sets the rules, in software.
keyMessage: policy isn't a memo, it's a live control panel.

## Frame 6 — Module: Capital Build-Up (CBU)

- scene: CBU members + transactions ledger
- voiceover:
- sfx: whoosh-short
- duration: 2s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/06-module-cbu.html
- type: feature_showcase
- persuasion: Value stacking
- beat: confidence
- asset_candidates: source:src/Bookkeeper/Components/Bookkeeper_CBU.jsx — real CBU members + transactions ledger (no-capture path)

Source: `src/Bookkeeper/Components/Bookkeeper_CBU.jsx`. Real two-table structure: CBU members, CBU transactions. `push-slide LEFT` continues the cascade.

narrativeRole: shows the system covers equity/capital, not just loans.
keyMessage: capital build-up, tracked automatically.

## Frame 7 — Module: Audit Log

- scene: Audit trail — date/time, performed by, role, transaction type, action, reference, status
- voiceover:
- duration: 2s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/07-module-audit.html
- type: feature_showcase
- persuasion: Risk reversal
- beat: confidence -> trust
- asset_candidates: source:src/components/AuditLogViewer.jsx — real shared audit-log table component (no-capture path)

Source: `src/components/AuditLogViewer.jsx` (shared by every portal's Audit Log page). Real column set: Date & Time, Performed By, Role, Transaction Type, Action, Reference/Record, Status. Closes the module cascade on the system's accountability story. `push-slide LEFT` continues the cascade; Frame 8 breaks it with `zoom-through` (new section).

narrativeRole: closes the module cascade on trust — every action is logged.
keyMessage: nothing happens off the record.

## Frame 8 — Mobile: open + member dashboard

- scene: Realistic phone mockup boots into the member app — savings, active loans, recent transactions
- voiceover:
- sfx: pop
- duration: 4s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/08-mobile-open-dashboard.html
- type: product_intro
- persuasion: Future pacing
- beat: curiosity -> ease
- blueprint: device-surface-showcase
- asset_candidates: source:src/Member/Components/Member_Dashboard.jsx — real member mobile dashboard (no-capture path)

Source: `src/Member/Components/Member_Dashboard.jsx`. A real device-mockup frame (registry block, per BRIEF.md Customizations — physical depth, shadow, reflection, not a flat screenshot) holds the member dashboard: savings balance, active loans, categorized recent transactions (equity/savings/loan/earning, color-coded). `zoom-through` marks the Module Cascade -> Mobile App section boundary (desktop -> mobile, per the brief's "short musical transition when moving from desktop to mobile" — realized here as a visual state-change cut since there is no music bed).

narrativeRole: opens the mobile act — the member's own front door into the same real system.
keyMessage: members carry the whole cooperative in their pocket.

## Frame 9 — Mobile: apply for loan + submit

- scene: Loan-type selector (Consolidated / Emergency / Bonus) then the application form, ending on Submit
- voiceover:
- sfx: click-soft, chime
- duration: 5s
- transition_in: push-slide UP
- status: animated
- src: compositions/frames/09-mobile-apply-submit.html
- type: feature_showcase
- persuasion: Friction reduction
- beat: ease -> relief
- blueprint: device-surface-showcase
- asset_candidates: source:src/Member/Components/Member_ApplyLoans.jsx — real loan-type selector cards; source:src/LOANFORMS/Consolidated_Loan.jsx — real application form (no-capture path)

Source: `src/Member/Components/Member_ApplyLoans.jsx` (three real selector cards — Consolidated/blue, Emergency/red, Bonus/green with its May/November window messaging) into `src/LOANFORMS/Consolidated_Loan.jsx` (or the matching form for the chosen type). Same phone hero, continuous — the stepwise-flow variant of `device-surface-showcase` (cursorless, narrated by the UI itself). `push-slide UP` mimics real mobile screen-to-screen navigation and keeps this a continuous flow with Frame 8, not a hard cut.

narrativeRole: this is the beat that proves the product actually works, not just looks nice — a real application, really submitted.
keyMessage: applying for a loan takes minutes, not a trip to the office.

## Frame 10 — Mobile: check loan status

- scene: The submitted application's status card — Pending -> tracked in Member Loans / Loan Lifecycle
- voiceover:
- duration: 4s
- transition_in: push-slide UP
- status: animated
- src: compositions/frames/10-mobile-status.html
- type: benefit_highlight
- persuasion: Risk reversal
- beat: relief -> control
- blueprint: device-surface-showcase
- asset_candidates: source:src/Member/Components/Member_Loans.jsx — real loan status view; source:src/Member/Components/Member_Lifecycle.jsx — real lifecycle tracker (no-capture path)

Source: `src/Member/Components/Member_Loans.jsx` / `Member_Lifecycle.jsx`. Closes the member's own loop on the submitted application's status, setting up Frame 11's payoff (the SAME application, seen from the officer's side, then the status update flowing back here). `push-slide UP` continues the mobile flow.

narrativeRole: closes the member's loop and plants the exact object Frame 11 will pay off.
keyMessage: you're never left wondering where your application stands.

## Frame 11 — Connected system

- scene: One continuous camera journey — the submitted application travels from the phone to the admin queue, gets reviewed, and the status updates flow back to the phone
- voiceover:
- sfx: whoosh-short, click, notification
- duration: 12s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/11-connected-system.html
- type: benefit_highlight
- persuasion: Future pacing
- beat: awe -> triumph
- blueprint: camera-journey
- asset_candidates: source:src/Member/Components/Member_ApplyLoans.jsx — the submit that fires this; source:src/BOD/Components/Member-Approvals.jsx — real officer-side approval queue; source:src/BOD/Components/BOD_Loan_Approval.jsx — real review action; source:src/Member/Components/Member_Loans.jsx — where the status update shows up (no-capture path)

Sources: `src/Member/Components/Member_ApplyLoans.jsx` (the submit that fires this), `src/BOD/Components/Member-Approvals.jsx` + `BOD_Loan_Approval.jsx` (the officer-side queue and review the application really lands in), `src/Member/Components/Member_Loans.jsx` (where the status update really shows up). This is `camera-journey` sub-shape A (action roundtrip) — not two separate cuts: dive to the phone, the submit fires, the camera swoops to the desktop where the row lands in the approval queue and an officer reviews it, then swoops back to the phone as the status updates. Animated data-flow lines / traveling particles along the camera's own path connect the two devices — this is the frame that makes them read as one ecosystem instead of two apps, per the brief's explicit ask. `zoom-through` in from Frame 10 marks the Mobile App -> Connected System section boundary; this is the video's structural climax.

narrativeRole: the payoff of the entire video — proves the desktop and mobile sides are one real, live system.
keyMessage: what happens on the phone, the officer sees instantly — and the member sees it close the loop.

## Frame 12 — Final showcase: the ecosystem

- scene: Desktop and phone held together at a slight 3D angle, subtle parallax, both very lightly alive (dashboard ticking, phone screen glowing)
- voiceover:
- duration: 5s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/12-final-ecosystem.html
- type: benefit_highlight
- persuasion: Rule of three
- beat: confidence -> pride
- asset_candidates: source:src/BOD/Components/B-Dashboard.jsx — reprises the desktop dashboard hero from Frame 2; source:src/Member/Components/Member_Dashboard.jsx — reprises the mobile dashboard hero from Frame 8 (no-capture path; composite summary shot)

No single blueprint fits "two hero devices held together" cleanly; compose from `motion-language.md` + `hyperframes-keyframes` (angled dual-device hero, parallax, slow push). Represents "Cooperative Officers + Members" as one system, per the brief's explicit closing framing. `zoom-through` in from Frame 11 marks the Connected System -> Final Showcase section boundary (climax -> resolution).

narrativeRole: the calm, confident summary shot before the brand close.
keyMessage: one system, two experiences, everyone served.

## Frame 13 — Brand outro

- scene: Devices clear the stage; the TTMPC mark draws itself back in over a clean field, closing message settles
- voiceover:
- sfx: chime
- duration: 5s
- transition_in: crossfade
- status: animated
- src: compositions/frames/13-brand-outro.html
- type: branding
- persuasion: Authority by association
- beat: pride -> inevitability
- blueprint: logo-assemble-lockup
- asset_candidates: assets/ttmpc-logo.png — real cooperative logo, brand mark for the close

Mirrors Frame 1's mark treatment so the video feels bookended, not just ended. Confident and polished, not overly dramatic, per the brief's explicit instruction. `crossfade` — a sub-beat within the same Final Showcase section, not a new section boundary, so it stays the calmer transition.

narrativeRole: the confident, unhurried sign-off.
keyMessage: TTMPC/REGANT — one cooperative, fully connected.
