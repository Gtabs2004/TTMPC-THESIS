# Business Rules Specification: Savings Deposits & Time Deposit Pre-Termination

---

## Executive Summary
This document defines the formal business rules, mathematical accrual formulas, ledger recording standards, and pre-termination penalty schedules for the cooperative's core deposit engine.

---

## 1. Regular Savings Deposit Rules

### 1.1 Account Parameters & Conventions
* **Nominal Annual Interest Rate:** Fixed at **1.00% p.a.** ($0.01$).
* **Day-Count Convention:** **Actual/365** (exact elapsed calendar days divided by 365).
* **Principal Basis:** Accrued interest on every ledger row is computed strictly using the **total running balance** of the account, never on isolated transaction deltas (deposits or withdrawals).

### 1.2 Line-by-Line Accrual Formula (Passbook / Statement View)
When members view their passbook or ledger transaction breakdown, the interest earned for the interval is calculated using:

$$\text{Line Interest} = \text{Elapsed Days} \times \text{Total Balance} \times \frac{0.01}{365}$$

Where:
* **$\text{Elapsed Days}$:** Calendar days elapsed from the preceding transaction date ($\text{Date}_{t-1}$) to the current transaction date ($\text{Date}_t$).
* **$\text{Total Balance}$:** Resulting accumulated account balance in the current ledger row.
* **$\text{Daily Rate}$:** $0.01 / 365 \approx 0.000027397$

### 1.3 Quarterly Posting & Capitalization Schedule
Accrued interest is posted, credited to principal, and capitalized into the account balance at the close of every calendar quarter:
* **Q1 Close:** March 31
* **Q2 Close:** June 30
* **Q3 Close:** September 30
* **Q4 Close:** December 31

On these quarter-end dates:
1. A transaction entry with code **`Int.`** is recorded.
2. The credited interest increases the member's total balance.
3. The interim quarterly accrued interest counter resets to zero.

---

## 2. Reference Ledger & Transaction Breakdown

The table below reflects the official sample ledger statement showing transaction codes, balance progression, and line-by-line interest calculations:

| Date | Code | Withdrawals | Interest (Posted) | Deposits | Total Balance | Accrued Line Interest | Calculation Breakdown |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **31-Dec-2025** | — | — | — | — | 5,000.00 | — | *Opening Balance* |
| **25-Jan-2026** | `CD` | — | — | 5,000.00 | 10,000.00 | **6.85** | $25 \text{ days} \times 10,000.00 \times \frac{0.01}{365}$ |
| **31-Mar-2026** | `Int.` | — | **24.66** | — | 10,024.66 | **17.85** | $65 \text{ days} \times 10,024.66 \times \frac{0.01}{365}$ |
| **30-Apr-2026** | `CD` | — | — | 10,000.00 | 20,024.66 | **16.46** | $30 \text{ days} \times 20,024.66 \times \frac{0.01}{365}$ |
| **15-May-2026** | `WD` | 6,000.00 | — | — | 14,024.66 | **5.76** | $15 \text{ days} \times 14,024.66 \times \frac{0.01}{365}$ |
| **20-May-2026** | `WD` | 5,000.00 | — | — | 9,024.66 | **1.24** | $5 \text{ days} \times 9,024.66 \times \frac{0.01}{365}$ |
| **30-Jun-2026** | `Int.` | — | **33.60** | — | 9,058.26 | **10.18** | $41 \text{ days} \times 9,058.26 \times \frac{0.01}{365}$ |
| **30-Sep-2026** | `Int.` | — | **22.83** | — | 9,081.09 | **22.89** | $92 \text{ days} \times 9,081.09 \times \frac{0.01}{365}$ |
| **16-Oct-2026** | `CD` | — | — | 2,000.00 | 11,081.09 | **4.86** | $16 \text{ days} \times 11,081.09 \times \frac{0.01}{365}$ |

> **Transaction Codes:**
> * `CD` = Cash Deposit
> * `WD` = Cash Withdrawal
> * `Int.` = Quarterly Interest Posting / Capitalization

---

## 3. Time Deposit (TD) Pre-Termination Policy

When a member terminates or liquidates a Time Deposit certificate prior to its contracted maturity date, a step-down penalty applies based on the elapsed percentage of the agreed duration.

### 3.1 Elapsed Term Formula
$$\text{Elapsed \%} = \frac{\text{Actual Days Elapsed from Placement to Pre-Termination}}{\text{Total Days of Contracted Term}} \times 100\%$$

### 3.2 Step-Down Penalty Matrix

| Elapsed Term Tier | Applied Interest Rate Policy | Rule Description |
| :--- | :--- | :--- |
| **0% to < 25%** | **0.00%** (Full Forfeiture) | No interest is earned. Only principal is returned. |
| **25% to < 50%** | **Regular Savings Rate (1.00% p.a.)** | Earns the prevailing Regular Savings Rate for the elapsed holding period instead of the contracted TD rate. *(Replaces the temporary 0% fallback floor).* |
| **50% to < 75%** | **50% of Contracted TD Rate** | Member earns 50% of the certificate's agreed interest rate for the elapsed period. |
| **75% to < 100%** | **75% of Contracted TD Rate** | Member earns 75% of the certificate's agreed interest rate for the elapsed period. |
| **100% (Maturity)** | **100% of Contracted TD Rate** | Full agreed certificate interest rate is paid upon maturity. |

---

## 4. Technical Implementation & Guardrails

1. **Fallback Resolution:**
   * Replace any temporary `0%` floor placeholder in the Time Deposit module for the **25% to <50%** tier with the active **1.00% Regular Savings Interest Rate**.
2. **Empty / Trailing Row Guard (Preventing `#NUM!`):**
   * Guard all date-difference logic against empty, blank, or null timestamps. In spreadsheets or backend loops, if $\text{Date}_t$ is empty, return an empty string or `null` instead of attempting date subtraction.
3. **Precision & Rounding:**
   * All intermediate currency math must use fixed-point decimal arithmetic (e.g., Python `Decimal`) to prevent floating-point drift.
   * Round final ledger values to **2 decimal places** using standard financial rounding rules (`ROUND_HALF_UP` or Banker's Rounding).