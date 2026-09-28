# Account Management, Termination & CBU Payout — Plan

Status: **planned, not started** (agreed 2026-09-28). Build in two parts: **Part A** first, then **Part B**.

---

## Principles

- **One login per person.** The `role` decides which staff portal they get; being a member gives the member portal. Staff are members too, so the same email + password works on both login pages.
  - Verified in code: `Index_Pages/memberlogin.jsx` sends any account to `/member-dashboard`, and the member portal never checks for `role = 'member'` — it finds the member's data through `member_account.user_id`. Only staff portals are role-gated (`RequireRole` in `Router.jsx`).
- **Roles can be shared.** Any number of people can hold the same role (e.g. 2 Cashiers, 5 BOD). Nothing in the code looks up "the" holder of a role; notifications go to a role (`recipient_role`), and the audit log's **Performed By** column tells people apart.
- **One BOD manages accounts** through a permission flag (`can_manage_accounts`). All BOD keep their normal BOD powers. (A new role like "BOD Admin" would break ~19 SQL security functions and every `role = 'bod'` check.)
- **Termination is BOD-only**, done in Account Management. The Secretary only views the result.
- **Nothing is deleted.** A fully paid-out member becomes **Closed**; history is kept (Cooperative Code RA 9520 / CDA audits; loans, payments, CBU, ISC and audit rows all reference the member).
- **CBU does not touch the cash vault.** The Treasurer adjusts the vault manually, as today.
- **On termination, CBU pays the remaining loans first; the member gets what's left** (confirmed 2026-09-28 — see Part B §8).

---

## Part A — Account Management & termination

### 1. Account Management page (new BOD sidebar item; account-admin BOD only)

- **Staff list, grouped by role:** name, membership ID, email, role, status.
- **Assign Staff Role:** search a member → pick a role (Cashier, Bookkeeper, Manager, Treasurer, Secretary, BOD). Their same login gains that portal and keeps the member portal. A role already held by others can be given to more people.
  - Member with **no login at all** (`auth_user_id` NULL): show "This member has no login yet" — no role assigned.
  - Member with a **placeholder email** (`@ttmpc.local` / temporary password): assign normally; the staff-portal setup step (item 4) forces them to change email + password.
- **Change / remove a role:** removing sets them back to Member (they keep the member portal).
- **Can Manage Accounts toggle** — BOD members only.
- **Terminate Member:** reason, effective date, notes; resolution number auto-generated (existing `_generate_termination_resolution_no`).
  - locks all access immediately (member + staff portal);
  - saves the member's **total CBU at termination** (for Part B);
  - notifies the **Cashier** and the **Secretary** (`loan_notifications`);
  - the confirm dialog shows the settlement preview from `compute_cbu_payout` (Part B §8): total CBU → remaining loans paid from CBU → amount the member will receive.
- **Terminated members list:** resolution no., date, total CBU, paid so far, remaining, status (Awaiting payout / Partially paid / Closed).
- **Safety rules (enforced in the backend, not just hidden in the UI):**
  - can't remove your own BOD role or your own account-admin flag;
  - the last account admin can't be removed;
  - the flag is cleared automatically if that person stops being BOD;
  - every change is audited with the actor's name;
  - endpoints require a signed-in account-admin BOD (JWT via `_get_current_user`).
- **No reactivation.** A returning ex-member re-applies from scratch.

### 2. BOD member details page (`src/Bookkeeper/Components/member_details.jsx`)

- Remove the role dropdown and the Terminate button (`StaffAccountPanel`). Keep profile and active loans.

### 3. Secretary Membership Records

- **List** (`src/secretary/Secretary_Records.jsx`): remove Terminate and its modal; icon-only eye → text **View** button (uniform with other tables); add a **Status** column: Active / Terminated / Closed.
- **Record details** (`src/BOD/Components/Record_Details.jsx`, route `/secretary-record-details/:id`): **fully view-only** — every field locked, Save removed; the backend `PUT /api/secretary/membership-records/{id}` refuses Secretary edits. Shows termination info and CBU payout status.

### 4. Staff-portal setup step

- Staff with `is_email_dummy` or `is_temporary` must change email and password before using the staff portal (the member portal already does this via `MemberOnboardingGuard` / `AccountSetupGate`).

### 5. Cleanup

- Delete leftover BOD routes (not in the BOD sidebar): `/membership-records`, `/secretary-records`, `/record-details/:id`, and the unused `src/BOD/Components/Secretary_Records.jsx`.
- Remove the old Secretary termination-request flow: `/api/admin/staff/termination/request`, `/decision`, `/requests` (no BOD screen ever called decision/requests).
- One-time check: members locked by an old Secretary request that was never confirmed (`staff_termination_requests.status = 'awaiting_bod_confirmation'`) — decide per member: terminate properly or unlock.

### 6. SQL

- `ALTER TABLE member_account ADD COLUMN can_manage_accounts boolean NOT NULL DEFAULT false;`
- Turn it on for `BOD@gmail.com` (TTMPC-004).

---

## Part B — CBU payout

### 7. Cashier: CBU Payout page

Sidebar: under **Savings Account**, below Capital Build-Up (`src/components/StaffSidebar/configs/cashier.js`), with a pending count, e.g. **CBU Payout (2)**.

| Field | Meaning |
|---|---|
| Total CBU at termination | CBU running balance on the termination day (deposits, loan CBU retentions, capitalised ISC) |
| Applied to loans | Remaining loan balances paid off from the CBU (§8) |
| Refundable | Total CBU − applied to loans (never below ₱0) |
| Paid so far | Sum of cash payouts to the member |
| Remaining | Refundable − paid so far; the maximum for the next payout |

- **Record payout:** amount (partial allowed, ≤ remaining), date, reference. Recorded as a withdrawal line in `capital_build_up` so the balance drops; receipt printed; audited.
- **No vault deduction** — the Treasurer enters vault amounts manually.
- **Notification:** Cashier bell — "Member X terminated — CBU payout pending", links to the page.
- **Late CBU entry after termination** (e.g. a Bookkeeper correction): use the higher of the saved total and the live balance.
- **Pending ISC** still awaiting the March General Assembly is not CBU yet — it follows normal ISC settlement.
- `capital_build_up` inserts must follow the existing running-balance rules (date-only `transaction_date`, tie-break on `cbu_deposit_id` numeric suffix, let `set_cbu_deposit_id()` assign the id).

### 8. Payout rule: CBU pays remaining loans first (confirmed 2026-09-28)

**Rule:** when a member is terminated with unpaid loans, their CBU pays off the remaining loan balances first; **what's left is what the member can get.**

Example: CBU ₱30,000, remaining loans ₱12,340 → ₱12,340 applied to the loans, ₱17,660 refundable to the member.

- One backend function `compute_cbu_payout(member)` → `{ total_cbu, deductions[], refundable }`. Each deduction = one active loan (control number, type, amount applied). It is the single place the rule lives; the switch `CBU_PAYOUT_OFFSETS_LOANS = True` stays next to it so the offset can be turned off if the coop's rule changes.
- **What "remaining loan" means (confirmed):** each active loan's outstanding balance **plus its accrued unpaid penalties** (`loan_penalties`, per the penalty accrual rule — legacy loans have none), using the same source of truth as the rest of the system (`loan_schedules`, renewals de-duplicated to the latest loan per type). The CBU offset pays penalties first, then the balance, matching `allocate_payment`'s existing order (penalty → arrears → current).
- **When the offset is recorded — at termination (recommended):** when BOD confirms the termination, the system records the offset as a loan payment on each loan (payment method **"CBU offset"**, no cash involved) and a matching CBU withdrawal line. The loans close right away, so penalties stop accruing, and the Cashier's page only shows the cash still owed to the member.
- Loans are paid oldest first, until the CBU runs out.
- Payout records store the deductions, and the payout screen and receipt show the breakdown "Total CBU → applied to loans → amount to give."

**Leftover debt — coop rule (confirmed 2026-09-28):**

> If a member's CBU is not enough to pay off their remaining loan balance, the member **cannot leave the cooperative** until that balance is fully settled. The member chooses one of two options:
> 1. **Stay as a member.** The termination does not go through, and they keep paying their loan normally.
> 2. **Use their CBU to pay part of the loan now.** Their CBU is applied to the remaining balance, they continue paying what is left, and they leave the cooperative once the remaining balance reaches ₱0.

How Terminate Member applies it:

| Situation | What happens |
|---|---|
| **CBU ≥ remaining loans** (incl. penalties) | Terminated immediately: CBU pays the loans (CBU offset), the member gets the rest via the Cashier's CBU Payout. |
| **CBU < remaining loans** | Termination is **not completed**; BOD records the member's choice (Option 1 or 2). |

- **Option 1 — Stay:** nothing changes; the member stays **Active** with their login and keeps paying normally. The request is kept in the history as "Withdrawn — member chose to stay."
- **Option 2 — Use CBU now, leave when paid:**
  - CBU is applied to the loans immediately as a "CBU offset" payment (penalties first, then balance); CBU becomes ₱0.
  - New member status **`exiting`** ("Exiting — balance due"): keeps member-portal access (to see the balance); **blocked from new loans and renewals** (loan eligibility check); the Cashier records loan payments as usual; Account Management shows an **Exiting members** list with the remaining amount.
  - **When the remaining balance reaches ₱0, termination completes automatically** (hooked on loan payment recording): resolution number generated, login locked, Secretary notified. Refundable CBU is ₱0 → straight to **Closed**, no Cashier payout.
- No one is ever "terminated with a balance." Collecting the remaining balance follows each loan's signed agreement (Emergency → Deed of Assignment; Bonus → from the bonus; Consolidated → co-makers / acceleration). No automatic salary deduction (no payroll integration).

### 9. Closed status

- When remaining reaches ₱0 **and no loan balance is left** → member status **Closed**: hidden from active lists; excluded from loans, ISC and dashboards; history kept.
- A member whose loans exceeded their CBU is never terminated with a balance — they stay Active (Option 1) or are **Exiting** until the balance is ₱0 (Option 2, §8).

### 10. SQL

- Allow `member.member_status = 'exiting'` and `'closed'`.
- New CBU payout table (member, amount, deductions, date, reference, recorded by, created_at) with the deductions field.

---

## Not included

- **Admins who aren't coop members** — every login needs a `membership_id`.
- **Loan release vault link** — loan release still auto-debits the vault (`vault_debit_for_disbursement`, `main.py` ~4506) and blocks when funds are short. Unchanged unless decided otherwise.

## Background

- A "separate staff logins" design (member_account one row per login) was built and **rolled back** on 2026-09-28 — unnecessary, because one login already serves both portals. The patch and forward/rollback SQL are kept in `src/server/` (`member_account_staff_logins*.sql`, `member_account_staff_logins_code.patch`) for reference only; don't reapply.
- Existing termination today: BOD `POST /api/admin/member/terminate` stamps `member.member_status = 'terminated'` + resolution no., sets `member_account.is_active = false`, notifies the Secretary. Note: `is_active` is **not checked at login**, so a "deactivated" account can still sign in — Part A's lock must actually block sign-in (e.g. Supabase Auth ban).
