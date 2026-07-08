# REGANT Demo Guide — Adviser Presentation

**System:** REGANT — Decision Support System for TTMPC
**Duration target:** 20–30 minutes
**Audience:** Thesis adviser

---

## 0. Pre-Demo Checklist (do this 15 min before)

- [ ] Backend running: `cd TTMPC_THESIS/src/server` → `uvicorn main:app --reload --host 127.0.0.1 --port 8000`
- [ ] Frontend running: `cd TTMPC_THESIS` → `npm run dev` (should open at http://localhost:5173)
- [ ] Confirm `.env` has valid Supabase + Resend keys
- [ ] Open browser at 100% zoom, close unrelated tabs
- [ ] Have test credentials ready for each role you plan to show (Member, Bookkeeper, Manager, Treasurer, Cashier, BOD)
- [ ] Seed / verify at least ONE loan application is in *Pending Bookkeeper* state (so the loan lifecycle walkthrough works end-to-end)
- [ ] Verify SARIMAX PKL files load — hit `GET http://127.0.0.1:8000/demand-forecast` once to warm it up
- [ ] Silence notifications, close Discord/Messenger

---

## 1. Opening — Frame the Problem (2 min)

Say out loud:
> "REGANT is a web-based Decision Support System for the Tubungan Teachers' Multi-Purpose Cooperative. It replaces their manual, paper-based operations with a role-based digital workflow and adds three analytics engines the cooperative did not previously have: **credit risk scoring, loan demand forecasting, and MIGS classification.**"

Key points to hit:
- 8 distinct user roles, 150+ routes
- Combines *operations management* + *ML-driven decision support*
- Backed by Supabase (Postgres + RLS) and FastAPI for ML inference

---

## 2. Landing & Role Selection (1 min)

- Show the landing page → Role Selection screen
- Briefly point out the portals: Member, Cashier, Bookkeeper, Manager, Treasurer, BOD, Non-member/KOICA

---

## 3. Membership Application — Sign-Up Flow (3 min)

Start from the public landing page (not logged in).

1. Click **Sign Up** → open the **Membership Form** (`src/LOANFORMS/Membership_Form.jsx`)
2. Fill in a new applicant's details (name, contact, employment, initial CBU/share capital, etc.)
3. Submit → point out the account is created but marked *Pending BOD Approval*
4. Mention the two provisioning paths:
   - **New sign-ups** — go through Supabase Auth normally
   - **Legacy/imported members** — `auth_user_id` is NULL until backfilled via `POST /api/admin/backfill-member-auth` (per the `member_account` linking table)

---

## 4. BOD Portal — Member Approval (2 min)

Log in as **BOD**.

1. Open **Member Approvals** — the new applicant appears in the queue
2. Open **Member Approval Details** → review submitted info
3. Approve → account becomes active, member can now log in
4. Mention this is when the CBU / share capital record is officially opened

---

## 5. Cashier — Membership Payment & Initial Deposit (2 min)

Log in as **Cashier**.

1. **Membership Payments** (`Cashier_MembershipPayments.jsx`) — record the membership fee
2. **CBU Deposit** (`Cashier_CBU_Deposit.jsx`) — record initial share capital
3. Optionally record a **Savings** deposit to seed the account

This puts the new member in a state where they can actually apply for a loan.

---

## 6. Member Portal — Self-Service & Loan Application (3 min)

Log in as the **newly approved Member**.

1. **Member Dashboard** — savings balance, CBU, active loans
2. **Apply for a Loan** → walk into **Consolidated Loan** form
   - Point out the auto-computation (fees, insurance, interest)
   - Mention: "This is governed by the policy rules documented in `WHAT_IFS_AND_CONSTRAINTS.txt`"
3. Submit the application → show it enters *Pending Bookkeeper Evaluation*
4. Show **Statement of Account** and **Member Lifecycle**

---

## 7. Bookkeeper Portal — Evaluation + MIGS (5 min) ★ Highlight

Log in as **Bookkeeper**. This is the analytics-heavy portal.

1. **Bookkeeper Dashboard** — pending applications count
2. Open the **Loan Application** just submitted
3. Run **MIGS Scoring** (`src/Bookkeeper/Components/MIGS.jsx`)
   - Explain the **7 criteria totaling 100 points**, threshold 50
   - Show how MIGS status flips the loan multiplier: **5× vs 3×**
4. **Credit Risk Score** — trigger `POST /score-loan`
   - Explain inputs: `LoanAmount`, `Stability_Score`, `Advance_Payment_Count`, `Income_Is_Missing`, `Repayment_Stress_Index`
   - Output: default probability (0–1) from a **Logistic Regression** model
5. **Loan Demand Forecast Card** (`LoanDemandForecastCard.jsx`)
   - 12-month SARIMAX forecast with 80% confidence intervals
   - Separate models for Consolidated vs Emergency loans
6. Forward the loan to Manager

**Talking point for adviser:** "These three engines — MIGS, credit risk, demand forecast — are the analytical contribution of the thesis on top of the operational system."

---

## 8. Manager Portal — Approval (2 min)

Log in as **Manager**.

- Open **Loan Approval** queue
- Open the loan → show the Bookkeeper's evaluation + MIGS + risk score are visible
- Approve → show email notification is triggered (Resend API via `/send-loan-status-email`)

---

## 9. Treasurer Portal — Disbursement (2 min)

Log in as **Treasurer**.

- Open **Disbursement** queue → the approved loan appears
- Disburse funds
- Point out: **CBU auto-syncs** from disbursement via the trigger (`cbu_sync_from_loan_disbursement_include_emergency.sql`)
- Show **Accounting** / **Schedule** briefly

---

## 10. Cashier Portal — Repayment & POS (2 min)

Log in as **Cashier** again (closing the loop).

- Show **Payments** → record a loan repayment against the loan you just disbursed
- Show **Savings** deposit/withdrawal
- Briefly open **Grocery / POS** — mention webhook integration (per `POS_WEBHOOK_INTEGRATION_NOTES.md`)

---

## 11. BOD Portal — Governance (1–2 min)

Log in as **BOD** again for the non-approval functions.

- **Loan Policies** — show that policy thresholds are configurable
- **Secretary functions** — Attendance, General Assembly, Records
- **Audit Log** — governance-side visibility

---

## 12. Cross-cutting Features (1 min)

Show one or two quickly:
- **Audit Trail** (Bookkeeper → Audit Trail) — every mutation is logged
- **PDF Generation** — open a generated loan form (pdf-lib overlay on templates in `src/PDF/`)
- **Row-Level Security** — mention that Supabase RLS enforces role boundaries at the DB layer

---

## 13. Closing — Thesis Contribution (2 min)

Summarize:
1. **Operational contribution** — digitized the full loan lifecycle across 8 roles
2. **Analytical contribution** — 3 ML/statistical engines: Credit Risk (Logistic Regression), Demand Forecast (SARIMAX), MIGS Scoring
3. **Innovation stance** — the workflow intentionally improves on the printed manual policy; that's a *feature* of the thesis, not a bug (per your scope memo)

Invite questions.

---

## Backup Plan — If Something Breaks

| Failure | Fallback |
|---|---|
| Backend won't start | Skip credit-risk + demand-forecast live calls; show the code files and screenshots |
| Supabase auth fails | Use a pre-recorded screen video of each portal |
| Email doesn't send | Show the Resend template file `loan_email_templates.py` instead |
| PDF generation errors | Open a previously generated PDF from disk |

Keep this open in a second tab so you can recover fast.

---

## Questions Your Adviser Might Ask

- **"Why Logistic Regression for credit risk?"** — Interpretable coefficients, appropriate for a small cooperative dataset, gives a probability output usable by non-technical bookkeepers.
- **"Why SARIMAX?"** — Captures seasonality in loan demand (school year cycles for teachers) with exogenous regressors; separate models per loan type because their drivers differ.
- **"What's MIGS?"** — Member In Good Standing; the 7-criteria/100-point rubric decides the loan multiplier (5× vs 3×).
- **"How is data secured?"** — Supabase RLS per role, `sessionStorage` (not localStorage) for multi-tab isolation, full audit trail on all mutations.
- **"What's not implemented yet?"** — Be honest here; check your current TODOs before the demo.
