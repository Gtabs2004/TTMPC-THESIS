<p align="center">
  <img width="1400" height="400" alt="TTMPC Banner" src="https://github.com/user-attachments/assets/7d74705f-52e3-46f8-9b62-64295635a376" />
</p>

<h3 align="center">
REGANT: Integrated Management and Finance System for TTMPC <br>
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

This project is a **web-based Integrated Management and Finance System** developed for the **Tubungan Teachers' Multi-Purpose Cooperative (TTMPC)**.

It is designed as a **Decision Support System (DSS)** that transforms fragmented and manual cooperative operations into a **centralized, intelligent, and predictive platform**.

Unlike traditional systems, this solution integrates:

- Member Profiling & Classification
- Loan, Savings & Capital Build-Up Management
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
      <td>Gradient Boosting model (HistGradientBoostingClassifier) trained on loan terms, demographics, prior loan behavior, and account signals to estimate probability of default — run both on-demand during loan review and automatically across the active loan portfolio</td>
    </tr>
    <tr>
      <td>Payment Capability Assessment</td>
      <td>Evaluates a member's ability to repay a loan based on net take-home pay, monthly obligations, and overall financial capacity</td>
    </tr>
    <tr>
      <td>Member Classification Engine (MIGS)</td>
      <td>Automated multi-criteria evaluation under the Member In Good Standing (MIGS) framework — a 0–100 point scoring matrix that sets each member's loan multiplier and voting eligibility</td>
    </tr>
    <tr>
      <td>Loan Demand Forecasting</td>
      <td>Seasonal ARIMA (SARIMAX) time-series models per loan type, producing 12-month forecasts with confidence intervals for liquidity planning</td>
    </tr>
    <tr>
      <td>Debt Capacity Framework</td>
      <td>Rule-based engine evaluating a member's safe borrowing ceiling against their share capital and repayment history</td>
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
      <td>Member Profiling & Classification</td>
      <td>Centralized database of member records with MIGS-based classification</td>
    </tr>
    <tr>
      <td>Membership Lifecycle Management</td>
      <td>Application intake, PMES training attendance, General Assembly attendance, and Board approval workflow</td>
    </tr>
    <tr>
      <td>Loan Management Module</td>
      <td>Handles Consolidated, Bonus, Emergency, and KOICA (ABFF) Loans, from application through disbursement</td>
    </tr>
    <tr>
      <td>Multi-Tier Loan Approval</td>
      <td>Routes loans through Bookkeeper recommendation, Manager approval, and Board of Directors review for high-value loans</td>
    </tr>
    <tr>
      <td>Multi-Loan Tracking</td>
      <td>Supports concurrent loans with aggregate debt monitoring</td>
    </tr>
    <tr>
      <td>Savings & Capital Build-Up (CBU)</td>
      <td>Deposit, withdrawal, and share capital tracking, with automatic CBU synchronization from loan disbursements and membership payments</td>
    </tr>
    <tr>
      <td>Interest on Share Capital (ISC) Distribution</td>
      <td>Annual dividend computation and posting, with capitalization or cash payout per member</td>
    </tr>
    <tr>
      <td>Automated Member Classification (MIGS)</td>
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

- 📊 **Gradient Boosting (HistGradientBoostingClassifier)** → Default & delinquency prediction
- 📈 **Seasonal ARIMA (SARIMAX)** → Loan demand forecasting
- ⚖️ **Multi-Criteria Decision Analysis (MCDA)** → Member Classification (MIGS)
- 📉 **Rule-Based Engine** → Debt capacity enforcement

---

## 🛠 Tech Stack

<p align="center">
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/react/react-original-wordmark.svg" width="48" alt="React" title="React"/>
  <img src="https://www.vectorlogo.zone/logos/tailwindcss/tailwindcss-icon.svg" width="48" alt="Tailwind CSS" title="Tailwind CSS"/>
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/javascript/javascript-original.svg" width="48" alt="JavaScript" title="JavaScript"/>
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/html5/html5-original.svg" width="48" alt="HTML5" title="HTML5"/>
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg" width="48" alt="Python" title="Python"/>
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/postgresql/postgresql-original-wordmark.svg" width="48" alt="PostgreSQL" title="PostgreSQL"/>
  <img src="https://www.vectorlogo.zone/logos/supabase/supabase-icon.svg" width="48" alt="Supabase" title="Supabase"/>
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/figma/figma-original.svg" width="48" alt="Figma" title="Figma"/>
</p>

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
      <td>Approves membership applications, decides high-value loans, sets loan fee policy, and reviews portfolio and risk analytics</td>
    </tr>
    <tr>
      <td>Secretary</td>
      <td>Records PMES training attendance, General Assembly attendance, and maintains membership records</td>
    </tr>
    <tr>
      <td>Bookkeeper</td>
      <td>Evaluates and recommends loan applications, performs Member Classification (MIGS), validates loan payments, and posts ISC distributions</td>
    </tr>
    <tr>
      <td>Manager</td>
      <td>Reviews and approves recommended loan applications and loan restructure requests</td>
    </tr>
    <tr>
      <td>Treasurer</td>
      <td>Approves loan disbursement, manages the vault/cash ledger, and tracks payroll release schedules</td>
    </tr>
    <tr>
      <td>Cashier</td>
      <td>Records membership payments, savings and CBU deposits, loan disbursement, loan payments, and withdrawal transactions</td>
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

## 🚧 Development Status

**Academic thesis project currently under active development.**

REGANT is being developed and refined as part of the team's undergraduate thesis. Features, workflows, analytical outputs, and interface behavior are subject to implementation testing and validation.

### Potential Future Enhancements

- Further refinement and validation of analytical models.
- Expanded dashboard visualizations and decision-support reports.
- Additional integrations based on the cooperative's operational requirements.
- Continued improvement of responsive layouts and usability across supported devices.

*Future enhancements are distinct from features already implemented in the system.*

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
