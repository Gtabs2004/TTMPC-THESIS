# TTMPC REGANT — Demo Accounts & Scenarios (Complete)

Oct 23, 2026 · @Ponkiatz

Every account, its seeded starting data, and the scenario it demonstrates, ordered so each role logs in **once**: Applicants → Members → Cashier → Bookkeeper → BOD → Secretary → Manager → Treasurer. All figures use the live fee policies in Supabase (Consolidated 0.83% add-on, Emergency 2% diminishing, Bonus 2%, Non-member Bonus 3%) and the formulas in the Loan Computation Walkthrough.

## Conventions and checks before demo day

**Conventions used in this doc**

- Seed dates assume the demo runs on or before **Oct 24, 2026**. Every loan's due date is the **25th** of the month (system rule: first due = 25th of the month after release).
- New sample members take IDs **TTMPC-301 to TTMPC-320** (live database currently ends at TTMPC-296, so no collisions).
- Emails use Gmail plus-addressing, e.g. `ttmpc.demo+m01@gmail.com`. Replace `ttmpc.demo` with one Gmail you own — every loan-status email then lands in one inbox you can show live.
- Membership fee **₱100** and initial paid-up capital (CBU minimum) **₱10,000** match the most common values already in `membership_payments`. Confirm with the coop if the policy amount differs.
- Penalty formula (from `compute_loan_penalty()`): remaining balance × rate × months past grace. Grace = 3 months after the earliest unpaid due date. Rate 2% (1% for Bonus). Partial months count as a full month.

**Verify these before demo day — each can break a scenario**

- [ ] **Bonus loan window.** Bonus and Non-member Bonus applications are blocked by a DB trigger outside **May and November**. If the demo is in October, Member4 and Non-Member1 cannot submit. Hold the demo on/after Nov 1, or pre-seed those two loans as `pending`.
- [ ] **Demo after Oct 25 changes numbers.** After each 25th, Members 17 and 18 gain one more overdue month, and every "next due" shifts. Recompute penalties on the day (formula above).
- [ ] **"Sent for Revision" label for Applicant4.** `member_applications.application_status` has no CHECK list; confirm the exact status text your BOD page writes when returning an application, and seed that value.
- [ ] **Treasurer Rescheduled tab.** RESCHEDULED\_LOANS\_PLAN.md marked it "not yet built" on Sep 23. Confirm it exists in your build before planning Member2's reschedule.
- [ ] **Credit-risk classes.** The risk model decides the final class. Seed the drivers in the Member roster, run `/api/risk/predict` once before the demo, and nudge loan amount or prior-loan history if a member lands in the wrong class.
- [ ] **Vault balance.** Set the vault to **₱400,000** before Member2 reaches the Treasurer so the insufficient-funds reschedule triggers.

## Staff logins

These already exist in the live database. Passwords are not listed here — keep them in your own credentials sheet.

| Role | Login email | Membership ID | Notes |
| --- | --- | --- | --- |
| BOD (account admin) | BOD@gmail.com | TTMPC-004 | `can_manage_accounts = true` — can terminate and assign roles |
| Secretary | secretary@gmail.com | TTMPC-130 | PMES attendance, membership records (view-only) |
| Cashier | cashier@gmail.com | TTMPC-148 | Payments, membership fees, CBU, savings, CBU payout, non-member encoding |
| Bookkeeper | bookkeeper@gmail.com | TTMPC-164 | Evaluation, MIGS, credit risk, payment validation, overrides |
| Treasurer | treasurer@gmail.com | TTMPC-237 | Disbursement approval, vault, reschedule |
| Manager | manager@gmail.com | TTMPC-241 | Loan approval, revision requests |

The same staff email also opens the Member portal (one login per person), so don't use these accounts for member scenarios.

## Applicant accounts

All five are public-school teachers in Tubungan, Iloilo, with a complete Personal Data Sheet (name, birth date, civil status, address, contact, TIN, GSIS no., parents, occupation, employer, salary). Attendance values use the live `attendance_logs` CHECK list.

| Applicant | Name | Email | Occupation / net pay | Seeded state before demo | Ends as |
| --- | --- | --- | --- | --- | --- |
| Applicant1 | Carla M. Bautista | ttmpc.demo+a01@gmail.com | Teacher I, ₱24,500 | Form submitted; `application_status = Pending`; no attendance row | Approved for PMES (BOD, live) |
| Applicant2 | Paolo R. Espinosa | ttmpc.demo+a02@gmail.com | Teacher I, ₱24,500 | Approved for PMES; `attendance_logs`: stage `Training`, meeting type `PMES`, status `Pending`, meeting date Oct 24, 2026 | PMES `Present` (Secretary, live) |
| Applicant3 | Joanna T. Lacson | ttmpc.demo+a03@gmail.com | Teacher II, ₱27,800 | Missed Oct 10 PMES (`Absent`); new row stage `Rescheduled Training`, status `Rescheduled`, new date Nov 7, 2026 | Shows rescheduled PMES on her portal |
| Applicant4 | Miguel A. Sorongon | ttmpc.demo+a04@gmail.com | Teacher I, ₱24,500 | Returned by BOD for revision; remarks: "TIN and GSIS no. missing; re-upload valid government ID" | Shows revision remarks; resubmits corrected form |
| Applicant5 | Hazel P. Gumban | ttmpc.demo+a05@gmail.com | Teacher III, ₱31,200 | PMES `Present` (Oct 10); `membership_payments`: MEMBERSHIP\_FEE ₱100 and INITIAL\_PAID\_UP\_CAPITAL ₱10,000 both `pending` | Paid (Cashier, live) → approved as a member with the next system-generated ID (BOD, live) |

## Member roster

Every member is `active`, bona fide, has a complete PDS, a MIGS snapshot, a CBU ledger and a savings account (next section). Employer for all: DepEd — Tubungan District, Iloilo. Email pattern: `ttmpc.demo+mNN@gmail.com`.

| # | ID | Name | Position · net pay · dependents | Member since | MIGS score | Demonstrates |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | TTMPC-301 | Ana L. Dela Cruz | Teacher III · ₱34,000 · 2 | 2019-06-10 | 68 (MIGS, 5×) | New Consolidated <₱500k (medium risk); savings history |
| 2 | TTMPC-302 | Ramon S. Villanueva | Master Teacher I · ₱45,000 · 4 | 2015-03-02 | 55 (MIGS, 5×) | Consolidated >₱500k (high risk), BOD approval, reschedule |
| 3 | TTMPC-303 | Liza M. Gonzaga | Teacher II · ₱28,000 · 1 | 2012-07-16 | 82 (MIGS) | Emergency loan (low risk) |
| 4 | TTMPC-304 | Joel B. Castillo | Teacher III · ₱31,000 · 2 | 2016-08-01 | 78 (MIGS) | Bonus loan (low risk) |
| 5 | TTMPC-305 | Grace D. Tolentino | Teacher III · ₱36,000 · 3 | 2014-01-20 | 70 (MIGS) | Consolidated renewal (8 payments made) |
| 6 | TTMPC-306 | Mark J. Salazar | Teacher II · ₱30,000 · 2 | 2018-05-14 | 60 (MIGS) | Renewal override request (3 payments) |
| 7 | TTMPC-307 | Rose C. Abellar | Teacher I · ₱24,500 · 1 | 2021-09-06 | 52 (MIGS) | Profile change approval |
| 8 | TTMPC-308 | Dennis F. Paredes | Teacher II · ₱29,000 · 3 | 2017-02-13 | 58 (MIGS) | Loan returned for revision by Manager |
| 9 | TTMPC-309 | Maricel O. Tupas | Teacher II · ₱28,500 · 2 | 2018-10-08 | 57 (MIGS) | Override request — pending |
| 10 | TTMPC-310 | Arnel G. Jaen | Teacher III · ₱32,000 · 2 | 2016-06-27 | 63 (MIGS) | Override request — approved |
| 11 | TTMPC-311 | Jocelyn B. Palmares | Teacher I · ₱25,000 · 3 | 2020-11-16 | 51 (MIGS) | Override request — rejected |
| 12 | TTMPC-312 | Noel V. Catalan | Teacher II · ₱28,000 · 2 | 2017-04-03 | 61 (MIGS) | Payment = amortization |
| 13 | TTMPC-313 | Shiela A. Lopez | Teacher II · ₱28,000 · 2 | 2017-04-03 | 56 (MIGS) | Payment < amortization (deficiency) |
| 14 | TTMPC-314 | Ricky D. Gallo | Teacher II · ₱28,000 · 1 | 2017-04-03 | 64 (MIGS) | Payment > amortization (credit) |
| 15 | TTMPC-315 | Teresa N. Alonsagay | Teacher III · ₱33,000 · 2 | 2013-08-19 | 74 (MIGS) | Emergency loan, 7th payment |
| 16 | TTMPC-316 | Victor P. Sumagaysay | Teacher I · ₱25,500 · 1 | 2019-01-21 | 66 (MIGS) | Bonus loan paid on time (final payment) |
| 17 | TTMPC-317 | Lorna E. Tingson | Teacher I · ₱25,000 · 3 | 2019-01-21 | 47 (Non-MIGS, 3×) | Bonus loan paid late (1% penalty) |
| 18 | TTMPC-318 | Edwin R. Bermejo | Teacher II · ₱27,000 · 4 | 2015-09-07 | 38 (Non-MIGS) | Consolidated, 5 months unpaid (2% penalty) |
| 19 | TTMPC-319 | Nenita S. Gaitan | Teacher III · ₱33,500 · 0 | 2010-06-14 | 72 (MIGS) | Terminated — CBU payout (Cashier) |
| 20 | TTMPC-320 | Rodel M. Villareal | Teacher III · ₱32,500 · 1 | 2011-02-07 | 70 (MIGS) | Spare: live termination by BOD (see Run order) |
| NM1 | — (non-member) | Kristine A. Sales | Teacher I, DepEd (non-member) · ₱25,000 | — | — | Non-member Bonus loan |

**Credit-risk drivers to seed** (feature names from `risk_model.py`):

- **Member1 → Medium:** 1 prior Consolidated (₱200,000, fully paid) with `PriorBehind = 2`, `PriorRefinances = 1`, `ConcurrentLoans = 0`, savings ₱6,500, `MonthsSinceLastLoan = 7`.
- **Member2 → High:** large `LoanAmount` (₱600,000, 60 months), `ConcurrentLoans = 1` (active Emergency), `PriorBehind = 3`, `PriorPenalties = 2`, `PriorRestructured = 1`, rising `DebtGrowth`, 4 dependents, ₱4,800 grocery on credit.
- **Member3 → Low:** small `LoanAmount` (₱20,000), 4 prior loans all on time, `PriorPenalties = 0`, savings ₱25,000, `HasTimeDeposit = true`.
- **Member4 → Low:** small Bonus loan, 3 prior Bonus loans paid on time, savings ₱18,000, no concurrent loans.

## CBU ledger and savings seed

Each member's CBU is built from three kinds of `capital_build_up` lines: the initial paid-up capital on the membership date, cash deposits, and the 2% CBU retained from each Consolidated/Emergency loan release. Balances are sized so every requested loan fits the multiplier (MIGS 5× CBU, Non-MIGS 3×). Insert lines with date-only `transaction_date` and let `set_cbu_deposit_id()` assign IDs.

| # | Initial paid-up | Cash deposits | Loan CBU retention | CBU balance | Max loan (multiplier) | Savings balance |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ₱10,000 (2019-06-10) | ₱15,000 (2021-01-15); ₱36,000 (2026-01-20) | ₱4,000 (2024-03-25, ₱200k loan) | ₱65,000 | ₱325,000 | ₱6,500 (opened Jun 2026, see below) |
| 2 | ₱10,000 (2015-03-02) | ₱40,000 (2018-06-15); ₱69,600 (2023-02-10) | ₱5,000 (2021-07-25, ₱250k); ₱400 (2026-06-05, ₱20k Emergency) | ₱125,000 | ₱625,000 | ₱15,000 |
| 3 | ₱10,000 (2012-07-16) | ₱33,000 (2019-05-20) | ₱5,000 (prior loans, 2014–2023) | ₱48,000 | ₱240,000 | ₱25,000 + time deposit |
| 4 | ₱10,000 (2016-08-01) | ₱45,000 (2022-03-14) | — (Bonus has no CBU) | ₱55,000 | ₱275,000 | ₱18,000 |
| 5 | ₱10,000 (2014-01-20) | ₱49,000 (2020-09-10) | ₱3,000 (2026-01-15, ₱150k) | ₱62,000 | ₱310,000 | ₱12,000 |
| 6 | ₱10,000 (2018-05-14) | ₱33,000 (2022-11-07) | ₱2,000 (2026-06-10, ₱100k) | ₱45,000 | ₱225,000 | ₱9,000 |
| 7 | ₱10,000 (2021-09-06) | ₱20,000 (2024-06-17) | — | ₱30,000 | ₱150,000 | ₱8,000 |
| 8 | ₱10,000 (2017-02-13) | ₱25,000 (2023-08-21) | — | ₱35,000 | ₱175,000 | ₱7,500 |
| 9 | ₱10,000 (2018-10-08) | ₱13,000 (2024-02-12) | ₱2,000 (2026-07-10, ₱100k) | ₱25,000 | ₱125,000 | ₱6,000 |
| 10 | ₱10,000 (2016-06-27) | ₱13,000 (2024-02-12) | ₱2,000 (2026-05-08, ₱100k) | ₱25,000 | ₱125,000 | ₱10,000 |
| 11 | ₱10,000 (2020-11-16) | ₱13,000 (2024-02-12) | ₱2,000 (2026-08-07, ₱100k) | ₱25,000 | ₱125,000 | ₱5,000 |
| 12 | ₱10,000 (2017-04-03) | ₱17,600 (2023-05-15) | ₱2,400 (2026-06-10, ₱120k) | ₱30,000 | ₱150,000 | ₱8,000 |
| 13 | ₱10,000 (2017-04-03) | ₱17,600 (2023-05-15) | ₱2,400 (2026-06-10, ₱120k) | ₱30,000 | ₱150,000 | ₱6,500 |
| 14 | ₱10,000 (2017-04-03) | ₱17,600 (2023-05-15) | ₱2,400 (2026-06-10, ₱120k) | ₱30,000 | ₱150,000 | ₱9,500 |
| 15 | ₱10,000 (2013-08-19) | ₱9,600 (2021-10-04) | ₱400 (2026-03-10, ₱20k Emergency) | ₱20,000 | ₱100,000 | ₱11,000 |
| 16 | ₱10,000 (2019-01-21) | ₱12,000 (2024-09-09) | — | ₱22,000 | ₱110,000 | ₱7,000 |
| 17 | ₱10,000 (2019-01-21) | ₱8,000 (2023-10-16) | — | ₱18,000 | ₱54,000 (3×) | ₱2,500 |
| 18 | ₱10,000 (2015-09-07) | ₱12,000 (2020-02-24) | ₱2,000 (2026-04-10, ₱100k) | ₱24,000 | ₱72,000 (3×) | ₱1,200 |
| 19 | ₱10,000 (2010-06-14) | ₱29,800 (2018-12-03) | ₱200 (2026-06-10, ₱10k Emergency) | ₱40,000 | — (terminated) | ₱14,000 |
| 20 | ₱10,000 (2011-02-07) | ₱25,000 (2019-07-22) | — | ₱35,000 | — (to be terminated) | ₱10,000 |

After the live releases, the disbursement trigger adds new retention lines automatically: Member1 +₱6,000, Member2 +₱12,000, Member3 +₱400, Member5 +₱6,000.

**Member1 savings account — seeded history** (`savings_accounts` + `savings_ledger`, account kind `member`):

| Date | Transaction | Amount | Balance | Entered by |
| --- | --- | --- | --- | --- |
| 2026-06-25 | Opening deposit (`OPEN-` reference) | ₱2,000 | ₱2,000 | Cashier |
| 2026-07-25 | Deposit | ₱1,500 | ₱3,500 | Cashier |
| 2026-08-25 | Deposit | ₱1,500 | ₱5,000 | Cashier |
| 2026-09-25 | Deposit | ₱1,500 | ₱6,500 | Cashier |
| 2026-10-25 | Deposit — **recorded live** (Cashier #10) | ₱1,500 | ₱8,000 | Cashier |
| demo day | Withdrawal — **recorded live** (Cashier #11), validated by Bookkeeper | ₱3,000 | ₱5,000 | Cashier → Bookkeeper |

## Loans and computed figures

**A. Loans applied during the demo** — what the screen should show. Consolidated deductions = service fee (₱100 per ₱50,000 bracket) + CBU 2% + CLIMBS ₱1.35 per ₱1,000 + notarial ₱100.

| Member | Loan | Amount · term | Monthly amortization | Total payable | Deductions | Net proceeds | Cash released |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Consolidated (new) | ₱300,000 · 36 mo | ₱10,823.33 (8,333.33 + 2,490.00) | ₱389,640.00 | ₱7,105.00 (600 + 6,000 + 405 + 100) | ₱292,895.00 | ₱292,895.00 |
| 2 | Consolidated (new, >₱500k) | ₱600,000 · 60 mo | ₱14,980.00 (10,000 + 4,980) | ₱898,800.00 | ₱14,110.00 (1,200 + 12,000 + 810 + 100) | ₱585,890.00 | ₱585,890.00 |
| 3 | Emergency | ₱20,000 · 12 mo | ₱2,033.33 (month 1, then declining) | ₱22,200.00 | ₱500.00 (100 + 400 CBU) | ₱19,500.00 | ₱19,500.00 |
| 4 | Bonus (Nov window) | ₱30,000 · 5 mo, first due Jan 25, 2027 | ₱6,600.00 (6,000 + 600) | ₱33,000.00 | ₱100.00 | ₱29,900.00 | ₱29,900.00 |
| 5 | Consolidated renewal | ₱300,000 · 48 mo | ₱8,740.00 (6,250 + 2,490) | ₱419,520.00 | ₱7,105.00 | ₱292,895.00 | ₱172,975.00 (less old balance ₱119,920.00) |
| 6 | Consolidated renewal (only if override approved) | ₱200,000 · 36 mo | ₱7,215.56 (5,555.56 + 1,660) | ₱259,760.00 | ₱4,770.00 (400 + 4,000 + 270 + 100) | ₱195,230.00 | ₱90,300.01 (less old balance ₱104,929.99) |
| 8 | Consolidated (revision requested) | ₱150,000 · 24 mo | ₱7,495.00 (6,250 + 1,245) | ₱179,880.00 | ₱3,602.50 (300 + 3,000 + 202.50 + 100) | ₱146,397.50 | ₱146,397.50 |
| NM1 | Non-member Bonus (3%) | ₱20,000 · 5 mo | ₱4,600.00 (4,000 + 600) | ₱23,000.00 | ₱100.00 | ₱19,900.00 | ₱19,900.00 |

**B. Loans seeded before the demo** (`loans` + `loan_schedules` + validated `loan_payments`):

| Member | Loan | Released · first due | Amortization | Payments already validated | State on demo day |
| --- | --- | --- | --- | --- | --- |
| 2 | Emergency ₱20,000 · 12 mo | 2026-06-05 · Jul 25 | ₱2,033.33 declining | 3 (Jul paid late on Aug 10, Aug, Sep) = ₱6,000.00 | `partially paid`; makes Member2 a concurrent borrower |
| 5 | Consolidated ₱150,000 · 24 mo | 2026-01-15 · Feb 25 | ₱7,495.00 | 8 (Feb–Sep) = ₱59,960.00 | Outstanding ₱119,920.00 → renewal allowed |
| 6 | Consolidated ₱100,000 · 24 mo | 2026-06-10 · Jul 25 | ₱4,996.67 | 3 (Jul–Sep) = ₱14,990.01 | Outstanding ₱104,929.99 → renewal blocked (needs 6) |
| 9 | Consolidated ₱100,000 · 24 mo | 2026-07-10 · Aug 25 | ₱4,996.67 | 2 | Override request `pending` (reason: "Hospitalization of mother, need funds for surgery") |
| 10 | Consolidated ₱100,000 · 24 mo | 2026-05-08 · Jun 25 | ₱4,996.67 | 4 | Override `approved` Oct 15, 2026 (valid 30 days, until Nov 14) |
| 11 | Consolidated ₱100,000 · 24 mo | 2026-08-07 · Sep 25 | ₱4,996.67 | 1 | Override `rejected` (note: "Only 1 payment made; reapply after 3 more") |
| 12, 13, 14 | Consolidated ₱120,000 · 24 mo (each) | 2026-06-10 · Jul 25 | ₱5,996.00 (5,000 + 996) | 3 (Jul–Sep) = ₱17,988.00 | Outstanding ₱125,916.00; Oct 25 installment due |
| 15 | Emergency ₱20,000 · 12 mo | 2026-03-10 · Apr 25 | Month 7 = ₱1,833.33 | 6 (Apr–Sep) = ₱11,699.96 | 7th payment due Oct 25 |
| 16 | Bonus ₱30,000 · 5 mo | 2026-05-12 · Jun 25 | ₱6,600.00 | 4 on time (Jun–Sep) = ₱26,400.00 | Last installment ₱6,600 due Oct 25 |
| 17 | Bonus ₱30,000 · 5 mo | 2026-05-12 · Jun 25 | ₱6,600.00 | 0 | Penalty ₱330.00 (33,000 × 1% × 1 month; grace ended Sep 25) |
| 18 | Consolidated ₱100,000 · 24 mo | 2026-04-10 · May 25 | ₱4,996.67 | 0 (May–Sep missed = 5) | Penalty ₱4,796.80 (119,920 × 2% × 2 months; grace ended Aug 25) |
| 19 | Emergency ₱10,000 · 6 mo | 2026-06-10 · Jul 25 | ₱1,833.33 declining | 3 = ₱5,399.98 | Closed by CBU offset at termination (₱5,100.02) |

**Member19 termination seed:** terminated 2026-10-15 by BOD, CBU at termination ₱40,000.00 → applied to Emergency loan ₱5,100.02 → **refundable ₱34,899.98**, paid so far ₱0, status `terminated`.

## Scenarios — Applicant portal

| # | Account | Do this | Expected result |
| --- | --- | --- | --- |
| A-1 | Applicant1 | Log in; open the submitted Membership Application Form | Status **Pending**; full PDS visible; no PMES schedule yet |
| A-2 | Applicant2 | Log in; open application status | Approved for PMES; PMES schedule Oct 24, 2026 shown |
| A-3 | Applicant3 | Log in; open application status | First PMES marked Absent; **Rescheduled Training** on Nov 7, 2026 shown |
| A-4 | Applicant4 | Log in; read BOD remarks; fill TIN and GSIS no.; re-upload government ID; resubmit | Status returns to Pending; remarks history kept |
| A-5 | Applicant5 | Log in; open application status | PMES Present; membership fee ₱100 and paid-up capital ₱10,000 shown as **pending payment** (Cashier records them later) |
| A-6 | Applicant5 (optional, before logging in) | From the landing page, pick Non-Member and open Loan Services / Savings Services | Public info pages for Consolidated, Bonus, Emergency, KOICA and savings |

## Scenarios — Member portal

Each member first shows the dashboard (CBU, savings, active loans, recent transactions), then submits one application. Every submission lands as `pending` in the Bookkeeper queue.

| # | Account | Do this | Expected result |
| --- | --- | --- | --- |
| M-1 | Member1 | Dashboard (CBU ₱65,000, savings ₱6,500 with Jun–Sep deposits); Apply → Consolidated → ₱300,000, 36 months; review computation; sign; submit; download PDF | Amortization ₱10,823.33, net ₱292,895.00; status `pending` |
| M-2 | Member2 | Apply → Consolidated → ₱600,000, 60 months (terms up to 72 allowed at ≥₱500k); submit | Amortization ₱14,980.00, net ₱585,890.00; dashboard still shows the active Emergency loan |
| M-3 | Member3 | Apply → Emergency → ₱20,000, 12 months, reason "Medical expenses"; submit | Month-1 payment ₱2,033.33, net ₱19,500.00. Optional: type ₱25,000 first to show the ₱20,000 cap error |
| M-4 | Member4 | Apply → Bonus → ₱30,000, 5 months; submit | Amortization ₱6,600.00, net ₱29,900.00. Works only in May/November — in October the window error appears (also worth showing) |
| M-5 | Member5 | Apply → Consolidated → Renewal (8 of 6 payments met) → ₱300,000, 48 months; submit | Old balance ₱119,920.00 deducted; cash released ₱172,975.00 |
| M-6 | Member6 | Apply → Consolidated → Renewal | Blocked: 3 of 6 payments. Click **Request override**, enter reason (≥20 characters, e.g. "Typhoon damage to house roof, urgent repair needed"); request shows `pending` |

## Scenarios — Cashier

Loan payments are allocated **penalty → arrears → current → credit** and wait as `pending_bookkeeper` until the Bookkeeper validates them. Every transaction pops up a receipt.

| # | Account | Do this | Expected result |
| --- | --- | --- | --- |
| C-1 | Member12 | Payments → Consolidated → record ₱5,996.00 for the Oct 25 installment | Applied to current ₱5,996.00; no deficiency; outstanding becomes ₱119,920.00 after validation |
| C-2 | Member13 | Record ₱4,000.00 | Applied to current ₱4,000.00; deficiency ₱1,996.00 carried as arrears |
| C-3 | Member14 | Record ₱8,000.00 | Applied to current ₱5,996.00; credit ₱2,004.00 toward the next installment |
| C-4 | Member15 | Payments → Emergency → record ₱1,833.33 (7th installment) | 7 of 12 paid; principal balance ₱8,333.38; remaining payable ₱8,666.71 |
| C-5 | Member16 | Payments → Bonus → record ₱6,600.00 (5th installment) | Loan reaches ₱33,000.00 paid; becomes `fully paid` after Bookkeeper validation |
| C-6 | Member17 | Payments → Bonus → record ₱6,930.00 | Penalty ₱330.00 shown and paid first; ₱6,600.00 to June arrears |
| C-7 | Member18 | Payments → Consolidated → record ₱10,000.00 | Penalty ₱4,796.80 first; ₱5,203.20 to arrears (May ₱4,996.67 + ₱206.53 toward June) |
| C-8 | Applicant5 | Membership Payments → MEMBERSHIP\_FEE ₱100 (cash); then INITIAL\_PAID\_UP\_CAPITAL ₱10,000 (cash) | Both `paid`; receipts with `TTMPCMF-` and `TTMPCPC-` IDs; applicant now ready for BOD approval |
| C-9 | Non-Member1 | Non-member loan → Bonus → encode Kristine A. Sales: DepEd ID, latest payslip, ₱20,000, 5 months | Interest 3%; amortization ₱4,600.00; net ₱19,900.00; status `pending` (submitted by Cashier). November window only |
| C-10 | Member1 | Savings → Deposit ₱1,500.00 | Balance ₱8,000.00; receipt issued |
| C-11 | Member1 | Savings → Withdraw ₱3,000.00 | Queued as `pending_verification`; balance drops to ₱5,000.00 only after Bookkeeper validates. Optional: try ₱9,000 first to show insufficient funds |
| C-12 | Member19 | CBU Payout → shows Total CBU ₱40,000.00 → applied to loans ₱5,100.02 → refundable ₱34,899.98; record **partial** payout ₱20,000.00 | Remaining ₱14,899.98; member stays `terminated`; receipt issued |

For C-12, pay a partial amount so the scenario can be repeated. A full payout of ₱34,899.98 moves Member19 to `closed`, which deletes the login and clears contact details — that cannot be undone.

## Scenarios — Bookkeeper

Debt capacity = total monthly amortizations ÷ net pay, against the 40% limit.

**Loan evaluation (B-1 to B-6)**

| # | Account | Do this | Expected result |
| --- | --- | --- | --- |
| B-1 | Member1 | Open application; run MIGS; run credit risk; check debt capacity; recommend | MIGS 68 → 5×, max ₱325,000; risk **Medium**; capacity 31.8% (₱10,823.33 ÷ ₱34,000); → `recommended for approval` |
| B-2 | Member2 | Same steps; open the Loan Demand Forecast card here | MIGS 55 → 5×, max ₱625,000; risk **High**; capacity 37.6% (₱14,980 + ₱1,933.33 Emergency ÷ ₱45,000); amount >₱500,000 → `recommended for bod approval` (skips Manager) |
| B-3 | Member3 | Same steps | Risk **Low**; capacity 7.3%; → `recommended for approval` |
| B-4 | Member4 | Same steps | Risk **Low**; capacity 21.3%; → `recommended for approval` |
| B-5 | Member5 | Open renewal; confirm 8 payments and old balance | Old balance ₱119,920.00 deducted; cash released ₱172,975.00; → `recommended for approval` |
| B-6 | Member6 | Renewal Overrides → open Member6's pending request → **Approve** | Status `approved`; renewal unlocked for 30 days or one renewal; bell notification to member; audit entry |

**Profile, revision and override history (B-7 to B-11)**

| # | Account | Seeded state | Do this | Expected result |
| --- | --- | --- | --- | --- |
| B-7 | Member7 | `member_profile_change_requests` pending: net pay ₱24,500 → ₱26,800 (payslip for Oct 1–15, 2026 attached); contact number change | Open request; view payslip; approve | Status `approved`; new net pay applied to profile (feeds debt capacity and risk) |
| B-8 | Member8 | Consolidated ₱150,000 · 24 mo in `revision_requested`; Manager note: "Payslip unreadable — attach latest Sep–Oct payslip" | Open loan; read Manager note; attach corrected payslip; re-forward | Note visible; loan returns to `recommended for approval` |
| B-9 | Member9 | Override `pending`, 2 of 6 payments | Open Renewal Overrides queue | Shows in pending queue with reason and payments made (leave pending) |
| B-10 | Member10 | Override `approved` Oct 15 | Open history tab | Approved, valid until Nov 14, 2026, not yet used |
| B-11 | Member11 | Override `rejected` | Open history tab | Rejected with note "Only 1 payment made; reapply after 3 more" |

**Payment validation (B-12 to B-18)** — validates what the Cashier recorded in C-1 to C-7.

| # | Account | Expected result after **Validate** |
| --- | --- | --- |
| B-12 | Member12 | ₱5,996.00 validated; Oct installment paid; outstanding ₱119,920.00 |
| B-13 | Member13 | ₱4,000.00 validated; deficiency ₱1,996.00 stays as arrears for November |
| B-14 | Member14 | ₱8,000.00 validated; ₱2,004.00 credit applied to the Nov 25 installment |
| B-15 | Member15 | 7 of 12 installments paid; remaining payable ₱8,666.71 |
| B-16 | Member16 | Loan status → `fully paid` (₱33,000.00) |
| B-17 | Member17 | Penalty row ₱330.00 marked paid; June installment cleared; Jul–Oct still unpaid |
| B-18 | Member18 | Penalty ₱4,796.80 cleared; May installment cleared; June partly paid (₱206.53) |

**Savings and non-member (B-19, B-20)**

| # | Account | Do this | Expected result |
| --- | --- | --- | --- |
| B-19 | Member1 | Savings Transactions → open account; validate the ₱3,000 withdrawal from C-11 | History shows Jun 25 opening ₱2,000, Jul/Aug/Sep/Oct deposits ₱1,500 each, withdrawal ₱3,000; balance ₱5,000.00 |
| B-20 | Non-Member1 | Non-member loans → open Bonus application from C-9; set preliminary risk `low`; recommend | 3% rate confirmed; → `recommended for approval` |

Optional extras while logged in: MIGS recompute-all, Audit Trail (shows every action above with actor name).

## Scenarios — BOD

Log in as BOD@gmail.com (account admin).

| # | Account | Do this | Expected result |
| --- | --- | --- | --- |
| D-1 | Applicant1 | Member Approvals → open Applicant1 → **Approve for PMES**, schedule Nov 7, 2026 | Attendance row created (stage `Training`, `Pending`); Applicant1 now in Secretary's PMES list |
| D-2 | Applicant4 | Open Applicant4 (resubmitted in A-4) | Corrected TIN, GSIS no. and ID visible; can approve for PMES |
| D-3 | Applicant5 | Open Applicant5 → PMES Present + both payments paid → **Approve membership**, BOD resolution no. 2026-046 | Membership ID generated; CBU opens at ₱10,000; PDS and member account created; login now opens the Member portal |
| D-4 | Member2 | High-value queue → open ₱600,000 loan → review MIGS, risk (High), capacity → **Approve** with resolution no. 2026-045 and date | → `recommended for approval`; loan enters Manager queue. (Rejecting requires remarks and is final: `bod rejected`) |
| D-5 | Member20 | Account Management → Terminate → reason "Voluntary withdrawal — retirement", effective today | Settlement preview: CBU ₱35,000.00 → loans ₱0 → refundable ₱35,000.00; resolution no. auto-generated; login locked; Cashier and Secretary notified |
| D-6 | Member19 | Account Management → Terminated members list | Resolution no., CBU ₱40,000.00, applied to loans ₱5,100.02, paid ₱20,000.00 (from C-12), remaining ₱14,899.98 |
| D-7 | — | Loan Policies (optional) | Fee policies match the figures in this doc (₱100/₱50k bracket, 2% CBU, ₱1.35/₱1,000, ₱100 notarial) |

**About Member19 vs Member20.** Your list has BOD terminating Member19 and the Cashier paying out Member19. Since the Cashier logs in before BOD (needed for Applicant5's payment), Member19 is seeded as already terminated and Member20 is terminated live. If you'd rather terminate Member19 live, run BOD before Cashier and pre-seed Applicant5's payments as `paid` instead.

## Scenarios — Secretary, Manager, Treasurer

**Secretary** (secretary@gmail.com)

| # | Account | Do this | Expected result |
| --- | --- | --- | --- |
| S-1 | Applicant2 | PMES Attendance → Oct 24 session → mark **Present** | Attendance `Present`; Applicant2 moves to payment step |
| S-2 | Applicant3 | PMES Attendance → open Nov 7 rescheduled session | Listed under Rescheduled Training |
| S-3 | Members 19, 20 | Membership Records → open each | Status `Terminated`; record is view-only; CBU payout status shown |

**Manager** (manager@gmail.com) — not in your list, but each loan must pass here before the Treasurer.

| # | Account | Do this | Expected result |
| --- | --- | --- | --- |
| G-1 | Members 1, 3, 4, 5, 8 | Loan Approval queue → review Bookkeeper evaluation, MIGS, risk → Approve | → `to be disbursed`; approval email sent |
| G-2 | Member2 | Open the BOD-approved ₱600,000 loan → Approve | BOD resolution visible; → `to be disbursed` |
| G-3 | Non-Member1 | Approve non-member Bonus loan | → `to be disbursed` |

**Treasurer** (treasurer@gmail.com) — vault seeded at ₱400,000. Handle Member2 **first**, before approving any other loan, so the available balance is still the full ₱400,000.

| # | Account | Do this | Expected result |
| --- | --- | --- | --- |
| T-1 | Member2 | Open loan → vault check: available ₱400,000.00 vs net cash out ₱585,890.00 → **Reschedule** with note "Insufficient vault funds" | Shortfall ₱185,890.00; → `pending rescheduling`; appears in the Rescheduled tab with shortfall and date; no email to member |
| T-2 | Members 3, 4, NM1 | Approve for disbursement | → `ready for disbursement`; committed rises to ₱69,300.00 (19,500 + 29,900 + 19,900) |
| T-3 | Member2 (optional) | Vault → post a ₱300,000 deposit → reopen Rescheduled tab | Shortfall recomputes live; Member2 can now be approved for disbursement |

Releasing cash is a Cashier action, so the released loans and the automatic CBU retention lines are not shown in this run. To show one release, use the live loan already sitting in `ready for disbursement` during the Cashier session.

## Run order

Each role logs in once. The order follows the hand-offs, so no role waits on a step that hasn't happened yet.

1. **Applicants 1–5** — show each application state (A-1 to A-6). Applicant4 resubmits.
2. **Members 1–6** — submit the six applications and the override request (M-1 to M-6).
3. **Cashier** — payments for Members 12–18, Applicant5's fees, Non-Member1's application, Member1 deposit/withdrawal, Member19 payout (C-1 to C-12). Must come before Bookkeeper (validation) and BOD (Applicant5 approval).
4. **Bookkeeper** — evaluate Members 1–6, profile change, revision, overrides, validate all Cashier entries, savings, Non-Member1 (B-1 to B-20). Must come before BOD (Member2 routing).
5. **BOD** — PMES approval, Applicant5 membership, Member2 >₱500k approval, Member20 termination (D-1 to D-7).
6. **Secretary** — Applicant2 PMES attendance, terminated records (S-1 to S-3). Comes after BOD so the new terminations show.
7. **Manager** — approve Members 1, 2, 3, 4, 5, 8 and Non-Member1 (G-1 to G-3). Comes after BOD so Member2 is in the queue.
8. **Treasurer** — reschedule Member2 first, then approve the small loans (T-1 to T-3). Members 1 and 5 (₱292,895 and ₱172,975 net) would exceed the remaining vault; leave them in the queue or reschedule them too.

**Seed checklist before demo day**

- [ ] 5 applicant logins with the states in the Applicant table
- [ ] 20 member logins + PDS + MIGS snapshots + CBU lines + savings accounts
- [ ] Seeded loans, schedules and validated payments from table B
- [ ] Override requests for Members 9, 10, 11; profile change request for Member7; Member8 loan in `revision_requested`
- [ ] Member19 terminated with CBU offset recorded
- [ ] Vault at ₱400,000
- [ ] Credit-risk check run once for Members 1–4
- [ ] Re-check penalties if the demo falls after Oct 25
