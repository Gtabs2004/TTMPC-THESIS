<p align="center">
  <img width="1400" height="400" alt="TTMPC Banner" src="https://github.com/user-attachments/assets/7d74705f-52e3-46f8-9b62-64295635a376" />
</p>

<h3 align="center">
Integrated Management and Finance System for TTMPC <br>
with Parallel Risk Prediction, Debt Capacity Framework, and Loan Demand Forecasting
</h3>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active%20Development-22c55e?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/Type-Thesis-16a34a?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/System-Decision%20Support%20System-518e2e?style=for-the-badge"/>
</p>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Inter&weight=600&size=16&pause=1000&color=22c55e&center=true&vCenter=true&width=800&lines=Transforming+cooperative+management+through+data-driven+intelligence;Predicting+loan+demand+and+financial+risk+in+real-time;Bridging+manual+systems+to+intelligent+decision+support;Built+for+transparency%2C+sustainability%2C+and+growth" />
</p>

---

## 💻 About the System

This project is a **web-based Integrated Management and Finance System** developed for the **Tubungan Teachers’ Multi-Purpose Cooperative (TTMPC)**.

It is designed as a **Decision Support System (DSS)** that transforms fragmented and manual cooperative operations into a **centralized, intelligent, and predictive platform**.

Unlike traditional systems, this solution integrates:

- Member Profiling  
- Loan & Savings Management  
- Risk Prediction Models  
- Time-Series Forecasting  

to enable **data-driven decision-making and proactive financial management**.

---

## 🧠 Intelligent System Capabilities

<p align="center">
  <table>
    <tr>
      <th>Capability</th>
      <th>Description</th>
    </tr>
    <tr>
      <td>Parallel Risk Prediction</td>
      <td>Uses Logistic Regression to estimate probability of default</td>
    </tr>
    <tr>
      <td>Payment Capability Assessment</td>
      <td>Evaluates member’s ability to repay loans based on net take-home pay and overall financial capacity</td>
    </tr>
    <tr>
      <td>MIGS Scoring Engine</td>
      <td>Automated multi-criteria evaluation (0–100 scoring system)</td>
    </tr>
    <tr>
      <td>Loan Demand Forecasting</td>
      <td>Time-Series Analysis for forecasting seasonal borrowing patterns</td>
    </tr>
    <tr>
      <td>Repayment Stress Index</td>
      <td>Visual tool for monitoring financial burden of members</td>
    </tr>
  </table>
</p>

---

## ✨ Core Features

<p align="center">
  <table>
    <tr>
      <th>Feature</th>
      <th>Details</th>
    </tr>
    <tr>
      <td>Member Profiling System</td>
      <td>Centralized database of member records and classifications</td>
    </tr>
    <tr>
      <td>Loan Management Module</td>
      <td>Handles Consolidated, Bonus, and Emergency Loans</td>
    </tr>
    <tr>
      <td>Multi-Loan Tracking</td>
      <td>Supports concurrent loans with aggregate debt monitoring</td>
    </tr>
    <tr>
      <td>Automated MIGS Evaluation</td>
      <td>Eliminates manual scoring and reduces human error</td>
    </tr>
    <tr>
      <td>POS Integration</td>
      <td>Links grocery transactions with financial records</td>
    </tr>
    <tr>
      <td>Admin Dashboard</td>
      <td>Real-time KPIs, loan trends, and risk insights</td>
    </tr>
    <tr>
      <td>Member Web Portal</td>
      <td>Loan calculator, status tracking, and financial visibility</td>
    </tr>
  </table>
</p>

---

## 🖥️ Architecture Overview

<p align="center">
  <table>
    <tr>
      <th>Layer</th>
      <th>Function</th>
    </tr>
    <tr>
      <td>Presentation Layer</td>
      <td>Web portal, kiosk interface, dashboards</td>
    </tr>
    <tr>
      <td>Application Layer</td>
      <td>Business logic, risk models, forecasting engine</td>
    </tr>
    <tr>
      <td>Data Layer</td>
      <td>Centralized database with Row-Level Security</td>
    </tr>
  </table>
</p>

---

## ⚙️ Analytical Models Used

- 📊 **Logistic Regression** → Default & delinquency prediction  
- 📈 **Time-Series Analysis** → Loan demand forecasting  
- ⚖️ **Multi-Criteria Decision Analysis (MCDA)** → MIGS scoring  
- 📉 **Rule-Based Engine** → Debt capacity enforcement  

---

## 🛠 Tech Stack

<p align="center">
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/react/react-original-wordmark.svg" width="48"/>
  <img src="https://www.vectorlogo.zone/logos/tailwindcss/tailwindcss-icon.svg" width="48"/>
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg" width="48"/>
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/javascript/javascript-original.svg" width="48"/>
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/postgresql/postgresql-original-wordmark.svg" width="48"/>
  <img src="https://www.vectorlogo.zone/logos/supabase/supabase-icon.svg" width="48"/>
  <img src="https://www.vectorlogo.zone/logos/figma/figma-icon.svg" width="48"/>
</p>

---

## 📚 System Facts (For LLM Training)

This section compiles key facts about how the system works across frontend, backend, APIs, data model, and intended roadmap. It is written for model-training ingestion (bullet facts, short clauses).

### ✅ Current System (Implemented)

**Frontend (Web Portal)**
- SPA built with React 19 + Vite, React Router, Tailwind CSS. See [TTMPC_THESIS/package.json](TTMPC_THESIS/package.json).
- Routes defined in [TTMPC_THESIS/src/Router.jsx](TTMPC_THESIS/src/Router.jsx) and render role-based portals (BOD, Manager, Bookkeeper, Treasurer, Cashier, Member).
- Supabase client uses per-tab session storage and anon key from env; see [TTMPC_THESIS/src/supabaseClient.js](TTMPC_THESIS/src/supabaseClient.js).

**Backend (API Server)**
- Python FastAPI app in [TTMPC_THESIS/src/server/main.py](TTMPC_THESIS/src/server/main.py).
- Uses Supabase Python client for database CRUD and storage; Resend for email notifications.
- Uses Pydantic models for request validation and Decimal for money accuracy.
- CORS is permissive for dev: allow all origins/headers/methods.

**Env Vars (Backend/Frontend)**
- Required: `VITE_SUPABASE_URL`.
- Supabase key priority: `SUPABASE_SERVICE_ROLE_KEY` > `VITE_SUPABASE_SERVICE_ROLE_KEY` > `VITE_SUPABASE_ANON_KEY`.
- Email: `RESEND_API_KEY` or `VITE_RESEND_API_KEY`, optional `RESEND_FROM_EMAIL`.

**Core Domains**
- Membership: applications, confirmations, training attendance, and member records.
- Loans: consolidated, emergency, bonus, and KOICA/ABFF variants.
- Savings: account creation, deposits, withdrawals, verification workflow.
- CBU: capital build-up deposits and balances.
- Role-based staff workflows: BOD, Secretary, Bookkeeper, Manager, Treasurer, Cashier.

**API Surface (Main Endpoints)**
- Loan compute: `POST /api/loans/compute`.
- Cashier loans & payments: `GET /api/cashier/loan-payments/loans`, `POST /api/cashier/loan-payments`.
- Disbursement: `GET /api/cashier/disbursements/ready-loans`, `POST /api/cashier/disbursements/{loan_id}/disburse`.
- Treasurer disbursement audit: `GET /api/treasurer/disbursements/released-loans`.
- CBU: `GET /api/cashier/cbu/members`, `GET /api/cashier/cbu/members/{member_ref}`, `GET /api/cashier/cbu/transactions`, `POST /api/cashier/cbu/deposits`.
- Savings: `POST /api/savings/transactions`, `GET /api/cashier/savings/accounts`, `GET /api/cashier/savings/accounts/{savings_id}`, `POST /api/cashier/savings/accounts/{savings_id}/deposit`, `POST /api/cashier/savings/accounts/{savings_id}/withdraw`.
- Savings verification: `GET /api/bookkeeper/savings-transactions`, `POST /api/bookkeeper/savings-transactions/{transaction_id}/confirm`, `POST /api/bookkeeper/savings-transactions/{transaction_id}/reject`.
- Savings withdrawal audit: `GET /api/cashier/withdrawals/transactions`.
- Loan ledger: `GET /api/bookkeeper/manage-loans`, `GET /api/bookkeeper/loan-ledger/{loan_id}`.
- Membership records: `GET /api/secretary/membership-records`, `GET /api/secretary/membership-records/{member_ref}`, `PUT /api/secretary/membership-records/{member_ref}`.
- Personal data sheet: `GET /api/personal_data_sheet`, `GET /api/personal_data_sheet/{membership_number_id}`.
- Payments review: `GET /api/bookkeeper/payments/pending`, `POST /api/bookkeeper/payments/{payment_id}/approve`, `POST /api/bookkeeper/payments/{payment_id}/reject`.
- Member lifecycle: `GET /api/member/lifecycle/{member_id}`.
- Membership confirmation: `POST /api/confirm-membership`, `POST /api/confirm-membership/batch`, `GET /api/next-membership-id`.
- PDF generation: `POST /api/membership-form/print-pdf`, `POST /api/loans/consolidated/print-pdf`, `POST /api/loans/bonus/print-pdf`, `POST /api/loans/emergency/print-pdf`.
- Email notification: `POST /api/send-status-email`.

**SQL Data Model (Key Tables + Relationships)**
- `member` is the stable identity table; `member.id` (uuid) and `member.membership_id` are unique. See [TTMPC_THESIS/src/server/member_schema_repair.sql](TTMPC_THESIS/src/server/member_schema_repair.sql).
- `member_account` links to `member` via `user_id` (FK to `member.id`) and `membership_id` (FK to `member.membership_id`). See [TTMPC_THESIS/src/server/member_schema_repair.sql](TTMPC_THESIS/src/server/member_schema_repair.sql).
- `personal_data_sheet` keyed by `membership_number_id` (unique), tied to membership IDs. See [TTMPC_THESIS/src/server/personal_data_sheet_schema.sql](TTMPC_THESIS/src/server/personal_data_sheet_schema.sql).
- `loans` uses `control_number` as the primary business key; schedules and payments reference it. See [TTMPC_THESIS/src/server/loan_schedule_payments_schema.sql](TTMPC_THESIS/src/server/loan_schedule_payments_schema.sql).
- `loan_schedules` has FK `loan_id` -> `loans.control_number`; unique per `(loan_id, installment_no)`. See [TTMPC_THESIS/src/server/loan_schedule_payments_schema.sql](TTMPC_THESIS/src/server/loan_schedule_payments_schema.sql).
- `loan_payments` has FK `loan_id` -> `loans.control_number` and `schedule_id` -> `loan_schedules.id`; status workflow normalized with trigger. See [TTMPC_THESIS/src/server/loan_payments_schema.sql](TTMPC_THESIS/src/server/loan_payments_schema.sql).
- `loan_payment_ledger` mirrors validated payments (1:1 with `loan_payments.id`). See [TTMPC_THESIS/src/server/loan_payments_schema.sql](TTMPC_THESIS/src/server/loan_payments_schema.sql).
- `loan_calculator` stores pre-evaluation results; FK to `member.id` and optional `loan_id` to `loans.control_number`. See [TTMPC_THESIS/src/server/loan_calculator_schema.sql](TTMPC_THESIS/src/server/loan_calculator_schema.sql).
- `capital_build_up` stores CBU transactions; optional `cbu_deposit_id` with unique index. See [TTMPC_THESIS/src/server/cbu_cashier_policy_and_trigger.sql](TTMPC_THESIS/src/server/cbu_cashier_policy_and_trigger.sql).
- `savings_transaction_queue` stores cashier-submitted savings transactions; `ledger_transactions` stores posted ledger entries. See [TTMPC_THESIS/src/server/savings_transactions_add_savings_amount.sql](TTMPC_THESIS/src/server/savings_transactions_add_savings_amount.sql).
- `member_profile` and `member_classification_temporal` provide risk/stress and scoring history; FK to `member.id`. See [TTMPC_THESIS/src/server/member_profile_schema.sql](TTMPC_THESIS/src/server/member_profile_schema.sql).

**Operational Rules (Observed in Code)**
- Loan interest rates are resolved from `loan_types.interest_rate` (percent, monthly); missing rates block compute/disburse. See [TTMPC_THESIS/src/server/main.py](TTMPC_THESIS/src/server/main.py).
- Cashier payments are inserted as `pending_bookkeeper` and only affect balances after validation.
- Schedule logic enforces only one active due schedule per loan at a time.
- Savings withdrawals are queued for bookkeeper verification before posting.
- Membership training policy uses a single training stage; legacy values are normalized (see project README below).

### 🔭 Intended / Roadmap (Planned)

- AI-enhanced risk prediction and deeper analytics dashboards.
- Expanded forecasting and KPI visualizations for leadership.
- External financial system integrations and broader data feeds.
- Fully responsive UI coverage across all role portals.

---

## 👥 Users

<p align="center">
  <table>
    <tr>
      <th>User</th>
      <th>Role in the System</th>
    </tr>
    <tr>
      <td>Board of Directors (BOD)</td>
      <td>Approves membership applications and final member confirmation</td>
    </tr>
    <tr>
      <td>Secretary</td>
      <td>Records training attendance and applicant compliance</td>
    </tr>
    <tr>
      <td>Bookkeeper</td>
      <td>Evaluates loan applications and manages financial records</td>
    </tr>
    <tr>
      <td>Manager</td>
      <td>Reviews and approves recommended loan applications</td>
    </tr>
    <tr>
      <td>Treasurer</td>
      <td>Handles disbursement scheduling and financial report generation</td>
    </tr>
    <tr>
      <td>Cashier</td>
      <td>Records loan disbursement, payments, and withdrawal transactions</td>
    </tr>
    <tr>
      <td>Cooperative Members</td>
      <td>Apply for membership, loans, payments, and withdrawals</td>
    </tr>
    <tr>
      <td>Non-Members and KOICA Members</td>
      <td>Access limited loan services based on classification</td>
    </tr>
  </table>
</p>

---

## 📊 Project Status

**Thesis – Currently in Active Development (20% Completion)**

Future Enhancements:

- AI-enhanced risk prediction  
- Advanced analytics dashboards  
- Fully responsive web design compatible across desktop, tablet, and mobile devices
- External financial system integration  

---

## 👨‍💻 Development Team

<table align="center" style="border-collapse: collapse;">
  <tr>
    <td align="center" width="250" style="padding: 20px;">
      <img src="https://github.com/user-attachments/assets/10e96111-0581-45d6-a368-639aa8427138" width="120" style="border-radius: 50%; margin-bottom: 10px;"><br>
      <b>Ashley Nicole Bulotaolo</b><br>
      <span style="color: #555;">UI/UX Designer</span>
    </td>
    <td align="center" width="250" style="padding: 20px;">
      <img src="https://github.com/user-attachments/assets/d700431d-0861-494f-bb09-f174e3e92454" width="120" style="border-radius: 50%; margin-bottom: 10px;"><br>
      <b>Romelyn Delos Reyes</b><br>
      <span style="color: #555;">Analytics & Documentation</span>
    </td>
    <td align="center" width="250" style="padding: 20px;">
      <img src="https://github.com/user-attachments/assets/ee5b31e6-28c0-4805-b672-19817c34edbb" width="120" style="border-radius: 50%; margin-bottom: 10px;"><br>
      <b>Nash Ervine Siaton</b><br>
      <span style="color: #555;">Frontend Developer</span>
    </td>
    <td align="center" width="250" style="padding: 20px;">
      <img src="https://github.com/user-attachments/assets/c8a2ccce-3439-4025-b525-8e555964d467" width="120" style="border-radius: 50%; margin-bottom: 10px;"><br>
      <b>Gero Antoni Tabiolo</b><br>
      <span style="color: #555;">Backend Developer</span>
    </td>
    <td align="center" width="250" style="padding: 20px;">
      <img src="https://github.com/user-attachments/assets/0fb19a81-15ba-41d2-9fb7-9065da058ea9" width="120" style="border-radius: 50%; margin-bottom: 10px;"><br>
      <b>Erden Jhed Teope</b><br> 
      <span style="color: #555;">Analytics & Documentation</span>
    </td>
  </tr>
</table>

---

<p align="center">
  <img src="https://github.com/user-attachments/assets/3d52a506-f948-4cfe-bdd9-cc380f4e42e8" width="130" style="margin: 0 10px;">
  <img src="https://github.com/user-attachments/assets/b41b1b94-04d1-4446-97c5-0e9dc271eeea" width="130" style="margin: 0 10px;">
  <img src="https://github.com/user-attachments/assets/d567d639-f09b-4630-9bc9-1699d3954ad1" width="130" style="margin: 0 10px;">
</p>
