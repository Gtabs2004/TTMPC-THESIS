# THESIS_SPEC.md

### Integrated Management and Finance System for TTMPC with Parallel Risk Prediction, Debt Capacity Framework, and Loan Demand Forecasting using Time-Series Analysis

---

## 1. System Overview & Core Objectives

### Problem Statement & Scope
The operational landscape of the Tubungan Teachers Multi-Purpose Cooperative (TTMPC) in Tubungan, Iloilo, suffers from severe "analytical blindness" and "information asymmetry". The cooperative historically relies on manual, paper-based records and decentralized, hybrid Excel spreadsheets to manage membership details, loan ledger sheets, and cash transactions. This fragmentation leads to:
1. Significant delays in credit risk assessment and manual verification bottlenecks at the point of application.
2. Inability to monitor aggregate debt exposure across multiple active loan types, leading to a high risk of borrower over-leveraging.
3. Fragility of manual credit rating systems (such as the Member in Good Standing, or MIGS, point scorecard) which are prone to human error, subjective manipulation, and frequent policy changes.
4. Severe organizational cash management challenges, where the Treasurer must manually check bank balances and physical ledgers, resulting in sudden cash stock-outs during peak seasonal loan demands (e.g., school enrollment and bonus periods) or idle, unutilized capital.

The scope of this web-based Decision Support System (DSS) is delimited to the digitizing of end-to-end business operations of the TTMPC, serving teachers and residents of the Tubungan community. The system implements a parallel analytical framework that runs traditional relationship-based criteria alongside predictive machine learning to provide objective, real-time risk classification. It is technically validated against the ISO/IEC 25010 software quality standards, focusing on Functional Suitability, Usability, Performance Efficiency, and Security.

```
=====================================================================================
                                 SYSTEM SCOPE & PILLARS
=====================================================================================
               [ Reconciled Historical Database: 553 Loan Lifecycles ]
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
     [ Local Risk Evaluation ]                       [ Global Liquidity View ]
  Parallel Evaluative Architecture               Time-Series Demand Forecasting
 ┌───────────────────────┴─────────────────────┐                │
 ▼                                             ▼                ▼
Character (Traditional MIGS)     Capacity (ML Risk Engine)   SARIMA / Holt-Winters
Point-Based Rule Engine         Random Forest Classifier     Predicted Monthly Demand
=====================================================================================
```

### Core Functional Modules
The Integrated Loan Management System (ILMS) consists of the following tightly coupled functional modules:

*   **1. Account Security & Role-Based Access Control (RBAC):** Secures the environment through hierarchical verification flows, validating login credentials and issuing role-based tokens to enforce strict separation of concerns among stakeholders (Member, Bookkeeper, Secretary, Treasurer, Cashier, Manager, and Board of Directors).
*   **2. Membership Onboarding Module:** Manages the prospective member lifecycle from initial registration, Pre-Membership Education Seminar (PMES) scheduling and verification, to initial Share Capital deposit tracking, Board of Directors (BOD) approval, and automatic account promotion to "Bona Fide" status.
*   **3. Loan Application & Concurrent Processing Module:** Facilitates the digital intake of the three core loan products (Consolidated, Bonus, and Emergency Loans) and specialized affiliate loans (KOICA Agri-Business Financial Facility - ABFF Loans). Enforces dynamic debt ceilings and calculates net proceeds for refinancing or concurrent concurrent loan accounts.
*   **4. Decision Gates & Eligibility Engine:** Evaluates loan applications in real-time by automatically enforcing strict regulatory boundaries: the 300% Share Capital limit (for Consolidated Loans only) and the universal 40% Net Take-Home Pay policy.
*   **5. Parallel Risk Assessment Model:** Employs a dual-track framework that evaluates member character (Rule-Based MCDA MIGS Scoring) parallel to member repayment capacity (Machine Learning Random Forest Classifier).
*   **6. Seasonal Demand & Liquidity Forecasting Engine:** Utilizes 3 to 15 years of sanitized historical transactional data to forecast upcoming monthly loan volumes. Compares predicted demand against the Treasurer’s Cash on Hand to identify liquidity gaps.
*   **7. Payment & Ledger Management Module:** Processes cash deposits, savings, and time-deposits while executing transaction-level ledger postings. Interfaces with the retail POS system to sync grocery transactions into the member database.
*   **8. Operational Performance Monitoring:** Generates administrative and strategic reports, including cash monitoring reports, member dropouts, at-risk alerts, and audit logs of manual overrides.

---

## 2. End-to-End Data & Process Flow

```
+────────────────────────+       JSON Payload        +─────────────────────────────+
| PRESENTATION LAYER     | ────────────────────────> | APPLICATION LAYER           |
| React.js SPA Frontend  | <──────────────────────── | Python Analytics Engine     |
+────────────────────────+       REST API / RLS      +─────────────────────────────+
                                                                    │
                                                                    ▼
                                                     +─────────────────────────────+
                                                     | DATA LAYER                  |
                                                     | Supabase (PostgreSQL 3NF)   |
                                                     +─────────────────────────────+
```

### User Journey & Data Entry
The system flow maps the transaction lifecycle from user entry points to final strategic outputs:

```
[Stakeholder Entry] ──> [React GUI Dashboard] ──> [Business Logic & Gates] ──> [3NF PostgreSQL Engine]
```

#### Step 1: Membership Intake (Prospective Members)
*   The applicant accesses the **Membership Module** via a physical kiosk or the web portal.
*   Enters personal details, contact details, dependents, civil status, occupation, and spouse details into the digital registration form.
*   *System Action:* Records the application in `MEMBER_APPLICATION` with a status of `'Pending'`.
*   The system dynamically schedules a PMES on the third Saturday of March or September, dispatching SMS and email invitations.
*   The Secretary logs actual attendance.
*   The Cashier records the ₱200.00 membership fee and the minimum initial Share Capital deposit of 20 shares (₱20,000.00) in the ledger.
*   BOD reviews the digitized folder and approves the membership.
*   *System Action:* Promotes application status to `'Approved'`, inserts a record in `MEMBERS` with `IsBonaFide = TRUE`, generates user login credentials in `MEMBER_ACCOUNT`, and triggers a credentials SMS/email notification.

#### Step 2: Loan Application & Pre-Qualification (Current Members)
*   The member logs in to the **Member Portal** via kiosk or mobile web application using their email and PIN.
*   The portal restricts product options by user classification: regular members see Consolidated, Emergency, and Bonus loans; non-members see Bonus Loans only; KOICA affiliates see ABFF Loans only.
*   The applicant selects a loan type. In the case of a **Concurrent (Renewal) Consolidated Loan**, the system automatically queries the database to retrieve the borrower's outstanding principal balance and unpaid interest from the ledger.
*   The member enters the requested principal amount.
*   *Real-Time Pre-Qualification:* Clicking the form triggers the background **MIGS Scoring** and **MIGS Gatekeeper** checks, calculating the member's capacity parameters:
    *   Fetches the member's current `ShareCapital` and `LatestNetPay`.
    *   Enforces the 300% CBU limit on Consolidated loans.
    *   Executes a simulated amortization calculation using standard loan type rates (0.83% add-on for Consolidated; 2.0% diminishing for Emergency).
    *   Calculates the **Repayment Stress Index (RSI)**.
    *   *Hard Stop Evaluation:* If the simulated amortization violates the 40% Net Take-Home Pay rule (RSI > 40%), the system automatically disables the "Submit" action and prompts the member to recalibrate the principal or terms.
*   If the application passes the regulatory gates (RSI \\(\le\\) 35%), the member submits the form.
*   The Bookkeeper prints the application for physical co-maker and applicant wet signatures.

#### Step 3: Administrative Verification & Approval
*   The Bookkeeper receives the physical signed application, records the co-maker links, uploads verification documents, and hits "Recommend Approval".
*   *Tiered Routing:* The system routes the application based on the principal threshold:
    *   Loans below ₱300,000 are sent to the Manager’s Dashboard.
    *   Loans over ₱300,000 (up to ₱800,000) are escalated to the Board of Directors (BOD) Portal.
*   The authorized official signs off on the approval.
*   *System Action:* Updates `LOAN_APPLICATION` status to `'Approved'`, registers the `ApprovedBy_AccountID` and `ApprovedAt` timestamp, and places the loan in the **Priority Queue**.

#### Step 4: Disbursement & Collection
*   The system triggers the **Priority Queue** (Rank 1 to 7) based on loan type and MIGS level.
*   The Treasurer monitors available cash against predicted monthly demand, and authorizes the disbursement.
*   The member receives the cash from the Cashier.
*   *System Action:* Automatically deducts a mandatory 2% CBU fee from the principal, credits the member's `CAPITAL_BUILD_UP` ledger, records entries for Loan Receivable and Cash Out in `LEDGER_TRANSACTIONS`, and generates 12-month to 60-month payment rows in `LOAN_SCHEDULE` starting at \\(T+30\\) days.
*   On salary release dates (15th and 30th), repayments are collected, dynamically checking the `SALARY_SCHEDULE` for government payroll delays to enforce penalty exemptions.
*   Once payments bring the remaining balance to zero, the system executes an atomic update, marking the loan as `'Fully Paid'`.

---

### Data Transformations
To prepare unstructured legacy cooperative data and real-time inputs for machine learning modeling and relational integrity, the backend applies specific deterministic transformations:

#### 1. Temporal Paradox Resolution
*   *Definition:* Legacies contain anomalies where a transaction's `PaymentDate` precedes its `Loan_ApplicationDate`.
*   *Heuristic Rule:* If \\(-30 \le \Delta t < 0\\) days (where \\(\Delta t = \text{PaymentDate} - \text{ApplicationDate}\\)), the system validates the transaction as a preemptive **Advance Payment**.
*   *Transformation:* The system sets `Effective_Loan_Date` equal to `First_Payment_Date` to prevent negative aging calculation errors in python while generating a boolean `is_advance_payer = True` to act as a character indicator feature. If \\(\Delta t < -30\\) days, the system flags the entry as a critical logic error, quarantines the row, and prompts manual review.

#### 2. Handling of Missing Demographic Features (MNAR Strategy)
*   *Income/Occupation Gaps:* 48% of profiles lack annual income records, and 17% lack occupations. Listwise deletion would collapse the sample size, while mean/median imputation would deflate true variance.
*   *Transformation:*
    1. Continuous variables used in the `Repayment_Stress_Index` are assigned extreme value imputation of `-999`.
    2. A paired binary column `Income_Is_Missing` is generated (set to `1` if the original value is `NaN`, `0` otherwise).
    3. Missing occupations are mapped to a structured `'Unclassified_High_Risk'` categorical tier and assigned a conservative, penalized `Stability_Score` of `2.0`.
    This forces tree-based modeling algorithms to segregate undocumented profiles into separate logical decision branches.

#### 3. String & Type Normalization
*   *Cleanse Pipelines:*
    1. Clears trailing and leading whitespaces, converting names to standard Title Case:
       $$\text{LastName\_FirstName} = \text{upper(str.strip(LastName))} + \text{"\_"} + \text{upper(str.strip(FirstName))}$$
       This creates a unique relational match key across raw Excel sheets.
    2. Isolates the string `"OVERPAYMENT"` located in numeric payment fields, writing a `true` value to a new column `manual_note_overpayment`, and replacing the original string in the numeric column with the calculated scheduled principal.
    3. Ghost future projections (rows missing an Official Receipt `OR_CDV_No` index but carrying a balance) are dynamically isolated and purged to prevent data leakage.

#### 4. Categorical Encoding & Feature Scaling
*   Categorical demographic indicators (e.g., `CivilStatus`, `occ_tier`) undergo one-hot encoding. Continuous predictors (e.g., `LoanAmount`) are transformed using `StandardScaler` to resolve high scale disparities:
    $$z = \frac{x - \mu}{\sigma}$$

---

### Output Flows
The system outputs insights to different user tiers based on processing results:

```
[Database Engine] ──> [API JSON Serialization] ──> [React State Handlers] ──> [Dynamic UI Render]
```

*   **1. Member Interface Portal:**
    *   Renders active `Membership Status` and individual account balances (CBU, Savings, Time-Deposits).
    *   Displays current active loan details, due dates, outstanding remaining principal, and an interactive **Loan burden & stress calculator**.
*   **2. Bookkeeper & Cashier Interface:**
    *   Outputs system-calculated `MIGS Score Cards`.
    *   Generates system-validated **Digital Folders** for loan requests showing pre-calculated 40% Net Pay and 300% CBU compliance.
    *   Prints standard PDFs with unique reference numbers for wet signatures.
*   **3. Treasurer & Manager Dashboards:**
    *   **Monthly Liquidity Forecast Report:** Compares predicted monthly disbursement demand against the real-time Cash on Hand.
    *   **Priority Queue Display:** Lists approved loans sorted by priority ranks (Ranks 1–7) and submission timestamps.
    *   Provides systemic Grace Period warnings.
*   **4. Board of Directors (BOD) Portal:**
    *   Visualizes high-level portfolio performance: **MIGS Leakage Rate** (percent of active MIGS members who defaulted), **Member Dropout Rate** (members with zero transactions over 180 days), and seasonal cash-drain trends.
    *   Renders the **Parallel Risk Decision Matrix** (MIGS Status vs. AI Risk Flag) highlighting conflict cases (Quadrant 3: Over-Leveraged Loyalists).

---

## 3. Machine Learning & Analytics Specifications

The system utilizes a dual-brain architecture to mitigate risk.

### Model Inventories

| Model Name | Type | Objective | Algorithm | Ground Truth Target (\\(y\\)) |
| :--- | :--- | :--- | :--- | :--- |
| **Credit Risk / At-Risk Model** | Binary Classifier | Predict individual probability of delinquency/default. | Random Forest Classifier | `Target_Risk` (1: High Operational Risk, 0: Performing) |
| **Loan Demand Forecasting** | Univariate Time-Series | Forecast overall cooperative monthly cash requirements. | Seasonal ARIMA (SARIMA) or Holt-Winters | Sum of monthly loan amounts disbursed (historical) |
| **MIGS Scoring Model** | MCDA / Multi-Criteria Scoring | Determine relationship character and membership standing. | Simple Additive Weighting (SAW) | Composite 100-point matrix score [GUIDELINES handbook section] |

---

### Input Features & Data Sources

```
+───────────────────────────────+
|      INPUT FEATURES (X)       |
+───────────────────────────────+
  ├── Capacity Variables (Continuous)
  │    ├── LoanAmount (PHP)
  │    └── Repayment_Stress_Index (%)
  ├── Stability Variables (Ordinal)
  │    └── Stability_Score (1.0 - 4.0)
  ├── Character Variables (Discrete)
  │    └── Advance_Payment_Count (Qty)
  └── Information Variables (Binary)
       └── Income_Is_Missing (0/1)
```

#### 1. Credit Risk Model Features (\\(X\\))
*   `LoanAmount` (Numeric Float): The total principal amount applied for.
*   `Repayment_Stress_Index` (Numeric Float): Calculated as:
    $$\text{RSI} = \left( \frac{\text{Monthly Loan Amortization}}{\frac{\text{Annual Income}}{12}} \right) \times 100$$
    *Note: Uses $\frac{\text{Annual Income}}{12}$ as an acceptable proxy for monthly income when Latest Net Pay is unrecorded.*
*   `Stability_Score` (Ordinal Integer 1–4): Assigned via the occupation concept hierarchy:
    *   `4` : Public Sector / Institutional (e.g., Teaching, Government/ADAS).
    *   `3` : Private Professional / Skilled (e.g., Seafarer, Technician).
    *   `2` : Service / Support (e.g., Cashier, Security).
    *   `1` : Entrepreneurial / Informal (e.g., Vendor, Small Business).
    *   `2.0` : Unclassified / Unknown (Missing Information Penalty).
*   `Advance_Payment_Count` (Discrete Integer): Quantifies how many payments were made early (\\(\Delta t < 0\\)).
*   `Income_Is_Missing` (Binary 0 or 1): Captures demographic data nondisclosure.

#### 2. Traditional MIGS Criteria Points (SAW Parameters)
*   `CBU_Points` (0–20 pts): CBU for the year:
    *   ₱0.00 = 0 pts; up to 20 pts for > ₱10,000.01.
*   `Loan_Points` (0–20 pts): Amount of loan availed of:
    *   No loan = 0 pts; up to 20 pts for > ₱100,000.01.
*   `Savings_Points` (0–15 pts): Savings/Time Deposits as of Dec 31:
    *   ₱0.00 to ₱1,999.99 = 0 pts; up to 15 pts for > ₱50,000.00 [MIGS Guidelines IV.3].
*   `Payment_Points` (0–20 pts): On-time payment record:
    *   Never late = 20 pts; 1x late = 15 pts; 2x late = 10 pts; 3x late = 5 pts; > 3x late = 0 pts [MIGS Guidelines IV.4].
*   `Grocery_Points` (0–10 pts): Groceries availed of in a year:
    *   Below ₱20,000 = 3 pts; up to 10 pts for > ₱40,001 [MIGS Guidelines IV.5].
*   `PLI_Points` (0 or 10 pts): Loans from other PLIs:
    *   With loan outside = 0 pts; without loan outside = 10 pts [MIGS Guidelines IV.6].
*   `Attendance_Points` (0 or 5 pts): Assembly meetings attendance:
    *   Absent = 0 pts; Present = 5 pts [MIGS Guidelines IV.7].

---

### Model Output & Risk Scoring Logic

#### 1. Delinquency Risk Classification Logic
The target variable `Target_Risk` determines high operational risk:
$$\text{Target\_Risk} = \begin{cases} 1 & \text{if Remaining\_Principal} > (\text{LoanAmount} \times 0.15) \text{ AND } \text{Advance\_Payment\_Count} = 0 \\ 0 & \text{otherwise} \end{cases}$$
This formula flags accounts with more than 15% outstanding principal that have failed to demonstrate early payment behavior.

#### 2. Hyperparameter Selection & Class Balancing (Random Forest)
*   `n_estimators = 150` (Deploys 150 independent decision trees).
*   `max_depth = 5` (Prunes trees to guarantee explainability and prevent overfitting on noise).
*   `class_weight = 'balanced'` (Enforces cost-sensitive weight balancing to penalize missed defaults and break the majority class guessing loophole).

#### 3. Parallel Risk Assessment Matrix (Quadrant Evaluation)

```
                       HIGH LOYALTY (MIGS Status = 1)   LOW LOYALTY (MIGS Status = 0)
                      ┌────────────────────────────────┬───────────────────────────────┐
                      │          QUADRANT 1            │          QUADRANT 2           │
AI SAFE (Risk = 0)    │       [ AUTO-APPROVE ]         │      [ PROBATIONARY GATE ]    │
                      │ 331 Accounts | High Capacity   │ 37 Accounts | Safe Newcomer   │
                      ├────────────────────────────────┼───────────────────────────────┤
                      │          QUADRANT 3            │          QUADRANT 4           │
AI TOXIC (Risk = 1)   │       [ THE VETO LAYER ]       │       [ AUTO-DECLINE ]        │
                      │ 182 Accounts | Debt-Stressed   │ 3 Accounts | High Risk Default│
                      └────────────────────────────────┴───────────────────────────────┘
```

*   **Quadrant 1: The Idyllic Path (Auto-Approve):** High loyalty and low AI risk. Validates high income and savings. The loan is approved for immediate 1-day releasing.
*   **Quadrant 2: The Hidden Signal (Probationary Gate):** Low historical loyalty (typically newly hired teachers with thin files) but high AI stability score (\\(\ge 3.0\\)). Bypasses standard Non-MIGS restrictions to offer capped loans, allowing safe portfolio growth.
*   **Quadrant 3: Over-Leveraged Loyalists (The Veto Layer):** Excellent traditional MIGS standing, but flagged as high default risk because their requested debt pushes their Debt-to-Income stress past 40%. The system executes an **Administrative Veto**, prompting credit restructuring or lower loan limits.
*   **Quadrant 4: Terminal Default (Auto-Decline):** Low traditional standing and high AI default probability. The system automatically declines the request.

*Rigor Metric:* In the validated 553-loan portfolio, the System Agreement Rate settles at **66.55%**. The remaining variance represents the system's ability to intervene in manual blind spots (182 risk accounts hidden in MIGS) and recover restricted opportunities (37 safe new members).

---

## 4. Database Schema & Data Entities

The Database Layer is normalized to Third Normal Form (3NF) to ensure auditability, prevent transitive data anomalies, and preserve transaction-level financial logs.

```
====================================================================================
                             3NF RELATIONAL DATABASE TREE
====================================================================================
Level 0: Lookups
  ├── MEMBER_TYPE ────┐
  ├── CLASSIFICATION_NAME ─┐
  └── SALARY_SCHEDULE ────┼── Level 1: Core Identities
                          ▼
                       MEMBERS ──> Level 2: Profiles & Accounts
                          │         ├── MEMBER_ACCOUNT
                          │         ├── ATTENDANCE_LOGS
                          │         └── DEPENDENTS
                          ▼
                       LOAN_APPLICATION (Level 3/4: Lifecycle)
                          ├── LOAN_SCHEDULE
                          └── CO_MAKER_LINKS
                                  ▼
                               LOAN_PAYMENTS ──> LEDGER_TRANSACTIONS (Level 5)
====================================================================================
```

### Table 1: MEMBER_APPLICATION (Level 0)
Stores initial data captured from applicants prior to formal approval and promotion.
*   `ApplicationID` (UUID, PK): Unique identifier.
*   `FirstName` (VARCHAR): Cleaned, uppercase.
*   `LastName` (VARCHAR): Cleaned, uppercase.
*   `MiddleName` (VARCHAR, Nullable).
*   `Gender` (VARCHAR): `'Male'`, `'Female'`.
*   `email` (VARCHAR, Unique).
*   `DateOfBirth` (DATE).
*   `CivilStatus` (VARCHAR): `'Single'`, `'Married'`, `'Separated'`, `'Widowed'`.
*   `Occupation` (VARCHAR): Standardized title.
*   `Position` (VARCHAR): DepEd rank, e.g., `'Teacher I'`.
*   `AnnualIncome` (DECIMAL(15,2)): Estimated or self-reported.
*   `NumberofDependents` (INT).
*   `RecommendedBy` (VARCHAR).
*   `ApplicationDate` (DATE).
*   `Attendance_status` (VARCHAR, FK): References `ATTENDANCE_LOGS`.
*   `ApplicationStatus` (VARCHAR): `'Pending'`, `'Approved'`, `'Declined'`.
*   `ApprovedAt` (TIMESTAMP).

### Table 2: MEMBERS (Level 1)
Identifies formal cooperative members.
*   `MemberID` (UUID, PK): Unique identifier.
*   `ApplicationID` (UUID, FK): References `MEMBER_APPLICATION.ApplicationID`.
*   `Membership_Number_ID` (VARCHAR, Unique): E.g., `'TTMPCM-001'`.
*   `DateOfMembership` (DATE).
*   `BOD_Resolution_Number` (VARCHAR): Enforces formal board approval record.
*   `IsBonaFide` (BOOLEAN): Defaults to `FALSE`. Toggled to `TRUE` upon initial capital and fee validation.

### Table 3: MEMBER_ACCOUNT (Level 2)
Houses credentials and role mappings.
*   `AccountID` (UUID, PK).
*   `MemberID` (UUID, FK, Unique): References `MEMBERS.MemberID`.
*   `Email` (VARCHAR, Unique).
*   `encrypted_password` (VARCHAR): BCrypt or Argon2 hash.
*   `Role` (VARCHAR): `'Member'`, `'Bookkeeper'`, `'Cashier'`, `'Secretary'`, `'Treasurer'`, `'Manager'`, `'BOD'`.
*   `account_status` (VARCHAR): `'ACTIVE'`, `'LOCKED'`, `'DEACTIVATED'`.
*   `last_sign_in_at` (TIMESTAMP).

### Table 4: MEMBER_PROFILE (Level 3)
Stores continuous demographic variables segregated from identity schemas to prevent transitive dependency anomalies.
*   `ProfileID` (UUID, PK).
*   `MemberID` (UUID, FK, Unique): References `MEMBERS.MemberID`.
*   `HousingStatus` (VARCHAR): `'Owned'`, `'Rented'`, `'Mortgaged'`.
*   `NetIncome` (DECIMAL(15,2)): Latest verified net monthly take-home pay from payslip.
*   `YearsInService` (INT).
*   `SpouseEmployment` (VARCHAR).

### Table 5: LOAN_APPLICATION (Level 4)
Tracks loan lifecycles, and risk profiles.
*   `LoanID` (UUID, PK).
*   `MemberID` (UUID, FK): References `MEMBERS.MemberID`.
*   `LoanTypeID` (UUID, FK): References `LOAN_TYPES.LoanType_ID`.
*   `PrincipalAmount` (DECIMAL(15,2)): Gross principal borrowed.
*   `LoanAmount` (DECIMAL(15,2)): Cumulative scheduled amortization liability (Principal + Interest).
*   `Remaining_Principal` (DECIMAL(15,2)): Dynamic outstanding principal balance.
*   `NetProceeds` (DECIMAL(15,2)): Calculated actual cash released.
*   `RiskLevelAtApproval` (VARCHAR): `'Safe'`, `'Low'`, `'Moderate'`, `'High'`, `'Extreme'`.
*   `Target_Risk` (INT, Binary): Machine learning classification outcome (1: Delinquent, 0: Performing).
*   `PriorityRank` (VARCHAR): Scheduled releasing priority (e.g., `'Rank 1'`).
*   `LoanStatus` (VARCHAR): `'Pending'`, `'Approved'`, `'Active'`, `'Completed'`.
*   `ApprovedBy_AccountID` (UUID, FK, Nullable): References `MEMBER_ACCOUNT.AccountID`.
*   `ApprovedAt` (TIMESTAMP, Nullable).
*   `DisbursalDate` (TIMESTAMP, Nullable).

### Table 6: LOAN_SCHEDULE (Level 4)
Maintains amortization installment milestones.
*   `ScheduleID` (UUID, PK).
*   `LoanID` (UUID, FK): References `LOAN_APPLICATION.LoanID`.
*   `DueDate` (DATE).
*   `ExpectedPrincipal` (DECIMAL(15,2)).
*   `ExpectedInterest` (DECIMAL(15,2)).
*   `RemainingPrincipalBalance` (DECIMAL(15,2)): Period outstanding principal balance for diminishing interest checks.
*   `IsLateExempt` (BOOLEAN): Defaults to `FALSE`. Set to `TRUE` if payment is late due to a delayed salary schedule.
*   `SalaryScheduleID` (UUID, FK): References `SALARY_SCHEDULE.ScheduleID`.

### Table 7: LOAN_PAYMENTS (Level 5)
Logs physical cash installment repayments.
*   `PaymentID` (UUID, PK).
*   `LoanID` (UUID, FK): References `LOAN_APPLICATION.LoanID`.
*   `ScheduleID` (UUID, FK): References `LOAN_SCHEDULE.ScheduleID`.
*   `TransactionID` (UUID, FK): References `LEDGER_TRANSACTIONS.TransactionID`.
*   `AmountPaid` (DECIMAL(15,2)).
*   `PaymentDate` (TIMESTAMP).
*   `Calculated_DPD` (INT): Calculated days past due against schedule.

### Table 8: LEDGER_TRANSACTIONS (Level 5)
The central immutable double-entry ledger acting as the system's "Book of Truth".
*   `LedgerID` (UUID, PK).
*   `TransactionID` (UUID): Non-unique key linking multiple entries to a single Cash Receipt number (OR No.).
*   `MemberID` (UUID, FK): References `MEMBERS.MemberID`.
*   `AccountType` (VARCHAR): `'Loan Receivable'`, `'CBU Deposit'`, `'Savings Deposit'`, `'Time-Deposit'`, `'Cash'`.
*   `Debit` (DECIMAL(15,2)).
*   `Credit` (DECIMAL(15,2)).
*   `RunningBalance` (DECIMAL(15,2)).
*   `EntryDate` (TIMESTAMP).

### Table 9: CO_MAKER_LINKS (Level 4)
A polymorphic relational mapping connecting loan agreements to exactly two guarantors from the active member registry.
*   `LinkID` (UUID, PK).
*   `LoanID` (UUID, FK): References `LOAN_APPLICATION.LoanID`.
*   `MemberID` (UUID, FK): References `MEMBERS.MemberID`.
*   `LiabilityStatus` (VARCHAR): `'Active'`, `'Defaulted'`, `'Released'`.
*   `DateSigned` (TIMESTAMP).

---

## 5. Business Rules & Operational Logic

### Validation & Verification Rules

#### 1. The 40% Net Take-Home Pay Floor
This rule is a universal safeguard applying to all three main loan types (Consolidated, Emergency, and Bonus) and ABFF Loans. The Loan Portal validates this capacity constraint at the point of application entry:
$$\text{Monthly Amortization} \le \text{Verified Net Income} \times 0.40$$
If a requested loan amount violates this constraint, the frontend disabled the "Submit Application" button and triggers risk negotiation.

```
===================================================================================
                             40% PAYROLL FLOOR COMPLIANCE
===================================================================================
 Verified Monthly Net Income (Payslip)  ──>  [ 40% Net Capacity Threshold ]
                                                      │
                                                      ├──> Amortization <= 40%:
                                                      │    Allow Submission [Pass]
                                                      │
                                                      └──> Amortization > 40%:
                                                           Block Submission [Fail]
===================================================================================
```

#### 2. Consolidated Loan Ceilings & CBU Multipliers
To prevent over-indebtedness, a member’s Consolidated Loan principal cannot exceed a maximum capacity tied directly to their built equity:
$$\text{Maximum Allowed Principal} = (\text{Accumulated Share Capital} \times \text{Multiplier}) - \text{Active Loan Balance}$$
The multiplier thresholds are set based on classification status:
*   MIGS Members: **500% (5x) of CBU**.
*   Non-MIGS Members: **300% (3x) of CBU**.

#### 3. Emergency Loan Limits
*   Maximum borrowable principal is strictly capped at **₱20,000.00**.
*   Term is restricted to exactly **6 months** or **12 months**.
*   Interest is computed monthly using a **2% diminishing rate**.

#### 4. Bonus Loan Restrictions
*   Open exclusively to active DepEd employees.
*   Principal must equal the borrower's verified anticipated seasonal bonus (Mid-Year in May or Year-End in November).
*   Interest rates: **2% monthly** for regular cooperative members; **3% monthly** for non-members.
*   Repayment must align with the month of bonus release (May or November).
*   *Rolling Renewal:* Bonus loans can be renewed monthly until the bonus arrives. If the borrower fails to manually renew for the following month, a penalty of **1% per month** of the remaining balance is added to the interest.

#### 5. Scheduled Status Calculations & MIGS Accruals
The classification status updates dynamically based on the cooperative's operational calendar:
*   *Weekly Compilations (Every Saturday):* The scoring engine automatically aggregates all transaction logs, updating progress metrics (CBU contributions, deposits, groceries, loan repayments).
*   *Monthly Point Freeze (Last Saturday of Month):* The system executes the final 100-point matrix scoring, freezing the points for that cycle.
*   *The Payment Veto:* If a member has been late on payments more than three times within a rolling 12-month period (earning \\(< 10\\) points on the Payment Record category), they are automatically demoted to **Non-MIGS** status, regardless of their points in other categories.
*   *Monthly Promotions (First Week of Month):* The calculated classification status is updated in the database (`Member_Status` table), granting Level 1 MIGS privileges (1-day processing for loans < ₱300,000) or enforcing Non-MIGS queue restrictions for the next 30 days.

```
===================================================================================
                             MIGS ACCRUAL PIPELINE
===================================================================================
  [ Weekly Accrual ]     ──>   [ Monthly Score Freeze ] ──>   [ Payment Veto? ]
  Every Saturday               Last Saturday of Month         If Late > 3x:
  Aggregate Transactions       Execute SAW Calculations       Demote to Non-MIGS
                                                                     │
                                                                     └──> Passed:
                                                                          Promote
===================================================================================
```

#### 6. DepEd Salary Delay & Delinquency Exception Logic
To prevent members from being unfairly penalized for external government payroll delays, the system integrates delinquency exception logic:
*   When a regional DepEd salary delay occurs, the system administrator updates `SALARY_SCHEDULE.IsDelayed = TRUE` or inputs an `Admin_Grace_Extension` (in days) via the system settings dashboard.
*   The database engine adjusts the active due dates for that month:
    $$\text{Adjusted Days Past Due} = \text{Raw Days Past Due} - \text{Admin\_Grace\_Extension}$$
*   The system automatically toggles `LOAN_SCHEDULE.IsLateExempt = TRUE` for the affected installment rows.
*   All late penalties (the 2% monthly fine) are waived for that period, and the member’s `Payment_Points` are preserved, ensuring the delay does not count toward the 3-month delinquency status.

---

### Role-Based Access Control (RBAC) Permissions

| Role Name | Table Context | Allowed Actions | Enforcement Mechanisms / Rules |
| :--- | :--- | :--- | :--- |
| **Member** | `MEMBER_APPLICATION`, `LOAN_APPLICATION`, `MEMBER_PROFILE` | Create, Read | Access limited strictly to own records via row-level security (RLS). Can simulate loans on the calculator, but cannot approve applications. |
| **Bookkeeper** | `MEMBERS`, `LOAN_APPLICATION`, `CO_MAKER_LINKS` | Read, Update | Authorized to receive applications, register transaction deposits, print forms, link co-makers, and execute MIGS calculations. Holds **no bypass or override authority** on system-generated risk vetoes. |
| **Secretary** | `MEMBER_APPLICATION`, `ATTENDANCE_LOGS` | Create, Read, Update | Restrained to managing member profiles, PMES, and General Assembly attendance logs. Enforces PMES gates. |
| **Cashier** | `LEDGER_TRANSACTIONS`, `LOAN_PAYMENTS` | Create, Read | Records physical payment amounts, savings deposits, and CBU contributions. Cannot modify loan settings or override risk flags. |
| **Treasurer** | `LEDGER_TRANSACTIONS`, `SYSTEM_SETTINGS` | Read, Update | Monitors bank balances and cash-flow reports. Authorizes final fund releases based on priority ranks and predicted liquidity demands. |
| **Manager** | `LOAN_APPLICATION`, `SYSTEM_SETTINGS` | Read, Update | Authorized to review MIGS scores and approve or reject loan applications below the ₱300,000 threshold. |
| **BOD** | `LOAN_APPLICATION`, `SYSTEM_SETTINGS`, `SYSTEM_AUDIT_LOGS` | Read, Update | Highest administrative authority. Approves loans above ₱300,000 up to ₱800,000. Only role authorized to **Force Override** system-generated status blocks, which are recorded in the audit trail. |

---

## 6. Source Contradictions & Unresolved Gaps

During the structural alignment audit of the cooperative’s operational guidelines, database schemas, and process flows, several critical contradictions and gaps were identified that require technical resolution in the codebase:

### 1. Loan Approval Threshold Contradictions
*   *Discrepancy:*
    *   The Business Process Model (BPM) states: The Bookkeeper routes loan applications below **₱400,000.00** to the Manager for approval, and applications below **₱800,000.00** are sent to the Board of Directors (BOD) for approval.
    *   Strategic and Role documents contradict this, stating: The Manager approves loans up to **₱300,000.00**, while the BOD approves loans above **₱300,000.00** (up to ₱800,000.00).
*   *Codebase Audit Status:* Developers must implement a centralized policy table where the threshold is defined as a parameter. By default, the more conservative ₱300,000.00 threshold should be hard-coded to protect liquidity.

### 2. PMES Attendance Gatekeeper Requirements
*   *Discrepancy:*
    *   The BPM workflow specifies that prospective members "must attend PMES (Pre-Membership Education Seminar) **twice**" prior to onboarding.
    *   The System Process document and the Database Schema documentation state: "Verify PMES: Secretary records attendance of the applicants... Attendance_status categorical FK: Present or Absent. Flag if an applicant attended PMES." This implies a single, binary attendance check is sufficient to unlock approval.
*   *Codebase Audit Status:* The database schema lacks the attributes to count multiple seminar attendances. For development, a binary `'Present'` indicator in `MEMBER_APPLICATION` must be enforced, treating a single successful PMES record as sufficient.

### 3. Co-Maker Eligibility Boundaries
*   *Discrepancy:*
    *   The initial Co-Maker database rules and logic state: Co-makers must authorize salary deductions "and not necessarily a member of the coop." To accommodate this, early schemas included an `EXTERNAL_PARTIES` table to register non-member co-maker demographics.
    *   The final Member Data Sheet guidelines state: "Clarification: **Only the members of the cooperative can be co-maker for a loan.** Only 2 co-makers per application." This removes the need for non-member co-makers.
*   *Codebase Audit Status:* The `EXTERNAL_PARTIES` table represents redundant schema design. To prevent logical errors, developers must disable external co-maker profiles and enforce database-level foreign key constraints linking co-makers strictly to active entries in the `MEMBERS` table.

### 4. Typographical Error in Amended Bylaws (Bona Fide Shares)
*   *Discrepancy:*
    *   The official Amended 2024 Guidelines handbook [GUIDELINES handbook section] contains a logical contradiction: "A member has paid a required membership fee of Php 200.00 and the value of at least **Ten ( 20 ) shares** as provided for in the Coop by-laws."
    *   *System Implementation:* The number "Ten" is contradicts the numeric "20". The system resolves this contradiction by enforcing a minimum initial paid-up capital of **20 shares** (valued at ₱1,000.00 per share, totaling ₱20,000.00) in the `CAPITAL_BUILD_UP` module.

### 5. Account Verification Audit Leak (Mislabeled Database Table)
*   *Discrepancy:*
    *   In the database schema V4 documentation, the table containing fields for `AuditID`, `ActionType` (`APPROVE`, `DECLINE`), and `OldValue`/`NewValue` is mislabeled under the header **`TIMEDEPOSIT_TRANSACTION`**.
*   *Codebase Audit Status:* This is a documentation error. In Supabase, the table must be split: create a normalized `TIMEDEPOSIT_TRANSACTION` table for member time-deposits and a separate, independent `SYSTEM_AUDIT_LOGS` table to handle security audit trails.

### 6. Missing Placeholders for Machine Learning Risk Scores
*   *Discrepancy:*
    *   While the system logic implements parallel predictive tracks (Logistic Regression/Random Forest) to generate a default probability score, the current `LOAN_APPLICATION` table does not feature a field to store this system-generated score.
*   *Codebase Audit Status:* This gap creates database fragmentation. To ensure the model results can be visualized on dashboards and audited over time, developers must insert a `Risk_Probability_Score` (Decimal) field directly into the `LOAN_APPLICATION` schema during the current database construction phase.

---

## 7. Operational Analytics & Dashboard KPIs

For your thesis defense, you should explain how the operational dashboards turn this relational database into decision-support intelligence for cooperative management:

### 1. Executive Board of Directors Dashboard
*   **MIGS Leakage Rate:** Measures policy failure by calculating the percentage of members classified as MIGS who subsequently entered delinquency:
    $$\text{MIGS Leakage Rate} = \left( \frac{\text{Delinquent Loans with MIGS Status = 1}}{\text{Total Active Loans with MIGS Status = 1}} \right) \times 100$$
    A high leakage rate indicates that the traditional scorecard criteria are failing to predict actual financial capacity, justifying the need for the ML model.
*   **Member Dropout Rate:** Scans the ledger to alert the board of disengaged members:
    $$\text{Dropout Alert} = \text{Members with } 0 \text{ transactions (Ledger or POS) over } 180 \text{ days}$$
    This provides immediate business intelligence on member churn.
*   **Gender-Based Portfolio Distribution:** Aggregates loan volumes, savings ratios, and delinquency frequencies by gender to support diversity reporting.

### 2. Treasurer’s Cash Flow & Forecast Dashboard
*   **Liquidity Coverage Ratio (LCR):** Displays cash position safety:
    $$\text{LCR} = \frac{\text{Actual Cash on Hand}}{\text{Forecasted Loan Demand (Upcoming 30 Days)}}$$
    An LCR $< 1.0$ triggers an automatic warning alert, signaling the Treasurer to initiate bank transfers or activate the Priority Queue.
*   **Portfolio at Risk (PAR 30):** Represents the percentage of the total loan portfolio outstanding that is late by more than 30 days:
    $$\text{PAR 30} = \frac{\text{Outstanding Balance on Loans with DPD} > 30}{\text{Total Outstanding Loan Portfolio Balance}} \times 100$$
    This is the standard financial health metric used by credit unions.

### 3. Manager’s Loan Priority Queue View
*   **Parallel Decision Conflict Cases:** Highlights Quadrant 3 members—loyal "MIGS Level 1" applicants flagged as High Risk by the Random Forest model due to debt service stress. This serves as the primary risk guard for loan approvals.

***

👍 I can draft a detailed SQL implementation script for your Supabase database that establishes these 3NF table schemas, creates the polymorphic co-maker triggers, and defines the views to calculate the MIGS points automatically.