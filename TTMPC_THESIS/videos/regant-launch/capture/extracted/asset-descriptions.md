# Asset inventory (no-capture path — source-code read, not a crawl)

## Real files in `capture/assets/`

- `ttmpc-logo.png` — the real TTMPC cooperative logo (circular hands-around-people mark, green/gold). Source: `TTMPC_THESIS/public/img/ttmpc logo.png`. Use for open/close branding beats; transparent background, safe on both light and dark/green fields.

## Screen content (authored from real source, not screenshotted)

No live-running instance was captured; every screen below is built as an HTML/CSS recreation from the actual React/Tailwind source so the video shows real field names, real labels, real numbers formatting (₱, en-PH locale) — not invented UI. Each entry names its source file so a frame-worker can go verify specifics if needed.

### Admin / officer desktop (Act 2 — Admin Dashboard)
- **BOD Dashboard** — `src/BOD/Components/B-Dashboard.jsx`. 4 stat cards: "Total Loan Applications", "Number of Late Payments", "Total Active Loans", "Approved Loan This Month". Plus: `LoanDemandForecastCard` (12-month forecast chart, reused component), a gender-split pie chart (Male/Female, green/orange), an "Approved Loans per Month" bar chart broken out by loan type (Consolidated/Bonus/Emergency, tabbed), and a recent-activity feed (payments, disbursals, applications, savings, fees, grocery). This is the strongest "admin dashboard" candidate for the brief's stats/charts/notifications/transactions ask.

### Core system modules (Act 3 — module tour, ~2s each)
- **Member Management** — `src/BOD/Components/Manage-Member.jsx`. Personal-datasheet table with active-loan-count / paid-count per member, Active vs. Terminated member split.
- **Member Applications** — `src/BOD/Components/Member-Approvals.jsx` + `MemberApprovalDetails.jsx` (approval queue + detail drill-in).
- **Loan Management** — `src/BOD/Components/BOD_Loan_Approval.jsx` / `Manage-Loans.jsx` (officer-side loan review/approval).
- **Loan Ledger** — `src/Bookkeeper/Components/Loan-Ledger.jsx`. Payment-history table: Date, Reference (mono), Paid (₱), Penalty (₱, red when >0), Remaining Balance (₱), Status chip (validated=green, partial=amber, rejected=red, upcoming=blue).
- **Loan Policies** — `src/BOD/Components/Loan-Policies.jsx`. Tabbed by loan type (Consolidated / Emergency / Bonus / Non-member Bonus); editable fields: service fee, interest rate, CBU deposit, insurance, notarial fee, max loan amount, penalty rate. View-only until BOD clicks Edit.
- **Capital Build-Up (CBU)** — `src/Bookkeeper/Components/Bookkeeper_CBU.jsx` (also `Cashier/Components/Cashier_CBU.jsx`). Members + transactions ledger.
- **Audit Log** — `src/components/AuditLogViewer.jsx` (used by every portal's `Audit_Log.jsx`). Columns: Date & Time, Performed By, Role, Transaction Type, Action, Reference/Record, Status.

### Mobile member app (Act 4 — mobile loan-application flow)
- **Member Dashboard** — `src/Member/Components/Member_Dashboard.jsx`. Nav: Dashboard / Apply for Loan / Member Loans / Statement of Account / Loan Lifecycle / Member Profile. Cards: savings balance, active loans, recent transactions (categorized equity/savings/loan/earning, color-coded).
- **Apply for Loan** — `src/Member/Components/Member_ApplyLoans.jsx`. Three loan-type selector cards: Consolidated Loan (blue, Library icon), Emergency Loan (red, AlertCircle icon), Bonus Loan (green, Gift icon, May/November-only window messaging).
- **Loan forms** — `src/LOANFORMS/Consolidated_Loan.jsx`, `Emergency_Loan.jsx`, `Bonus_Loan.jsx` — the actual application forms (member details, loan amount, term, computed monthly amortization).
- Submit → status tracking: `src/Member/Components/Member_Loans.jsx` / `Member_Lifecycle.jsx` show application/loan status progression.

### Connected system (Act 5)
- Same **Member Applications** (Act 3) queue is the desktop-side landing point for a submitted mobile application — this is the real data path: member submits in `Member_ApplyLoans` → row appears in BOD/Manager's approval queue → officer approves in `BOD_Loan_Approval` → status updates propagate back to `Member_Loans` / `Member_Lifecycle` on mobile. This is a real, traceable workflow, not an invented one.

## Brand

See `capture/extracted/tokens.json` for the real color/font tokens (from `src/index.css`), already used consistently in the project's earlier `/brag` video (`TTMPC_THESIS/brag-output/`).
