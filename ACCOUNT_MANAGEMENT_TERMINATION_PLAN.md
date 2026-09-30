# Account Management, Termination & CBU Payout — Plan

Status: **Part A built 2026-09-29**, **Part B built 2026-09-30**. Apply `src/server/account_management_part_a.sql` then `account_management_part_b.sql` in Supabase.

Part B as built:
- The CBU offset is a `system` loan payment per loan, validated by calling `approve_bookkeeper_payment` (penalty first, schedule closed, status updated); a fully covered loan is then force-closed because the approval ignores `loan_payments_legacy`. One `capital_build_up` withdrawal line (`TERMINATION_LOAN_OFFSET`) is written after the payments, for exactly what was recorded.
- "Still owed to the member" = their live CBU balance (every offset/payout is a CBU withdrawal line), so late corrections are included automatically.
- Exiting completion is hooked at the end of `approve_bookkeeper_payment` (`_complete_exit_if_settled`).
- New loans are blocked by a DB trigger on `loans` (`block_loans_for_exiting_members`) plus `useLoanEligibility` for the message.
- The Cashier sidebar item has no pending-count badge (the sidebar has no badge support); the count is on the page.

Part A as built — differences from the plan below:
- Terminate is **refused while the member owes any loan** (balance + penalties). The CBU offset / "Exiting" handling (§8) arrives with Part B; the terminate dialog already shows the §8 settlement preview from `compute_cbu_payout`.
- Terminating also sets the login's role back to Member and clears the admin flag (a terminated member keeps no staff access).
- The old termination notices never reached the bell (they wrote a non-existent `payload` column); the new ones use `title`/`message`.
- `member.termination_cbu_total` was added in Part A (plan had it as "saved" without a column).

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

## Part C — Closing a member: remove the login, clear personal data (BUILT 2026-09-30)

Built with these changes from the plan below (apply `src/server/account_management_part_c.sql` after Part B):
- **Date of birth is kept** (credit-risk Age feature + returning-member match); everything else in §13 is cleared.
- **`member_account.auth_user_id` is kept** as a reference after the login is deleted (audit "Performed By" names still resolve); the backfill skips exiting/terminated/closed members, so it can't revive the login.
- **Returning-member note:** BOD's application page shows "Possible returning member" when an applicant matches a `member_closures` row by surname + first name (+ date of birth when both have one). Endpoint `GET /api/bod/membership-approval/{id}/returning-member`.
- Retry: `POST /api/admin/accounts/closures/{membership_id}/retry` (Account Management "Retry" link).

**Goal:** when a member's membership is fully settled, remove their login from Supabase Auth (so the email is free if they ever re-apply) and clear their personal contact details, while **keeping the financial history** (loans, payments, CBU, payouts, audit trail) for coop records and reports.

**Decided (2026-09-30):** don't delete financial records — they're needed for CDA audits / Cooperative Code record-keeping, past reports, and the analytics models. Data-privacy cleanup instead: delete the login, clear contact details, keep name + membership ID + money history.

### 11. When it runs — exactly once, when the member becomes **Closed**

A member becomes Closed in three places (Part B). All three call one shared function, `_close_member()`:

| Path | Trigger |
|---|---|
| Direct termination with nothing to pay out | CBU exactly covered the loans, or CBU was ₱0 |
| Cashier's last CBU payout | remaining CBU reaches ₱0 |
| Exiting member's balance reaches ₱0 | automatic completion, refundable ₱0 |

While a member is only **Terminated** (CBU payout still pending), nothing is cleared: the login is already blocked, and the Cashier still needs their name and contact details to pay them.

### 12. The flow (`_close_member`), in order

| Step | What happens | Why this order |
|---|---|---|
| 1. Record the closure | Insert a row in the new `member_closures` table: membership ID, name, resolution no., termination/closure dates, CBU total, applied to loans, paid out, who closed it, and **which fields were cleared** (field names only, never the values). `auth_deleted_at` starts empty. | The permanent history the coop keeps. Written first so a later failure still leaves a record. |
| 2. Clear personal data in the coop's tables | See §13. | Done before the login delete so nothing personal is left if step 3 fails. |
| 3. Free the email on the account row | `member_account.email` → `closed-<membership_id>@ttmpc.local`, `pending_email` → NULL, `is_active` false, role Member, admin flag false. Keep the row (audit names and history still point to it). | Removes the real email from the coop's records; the placeholder domain is already recognised as "not a real email". |
| 4. Delete the login | `supabase.auth.admin.delete_user(auth_user_id)` (the login's own id, captured in step 1). On success: `member_account.auth_user_id` → NULL and `member_closures.auth_deleted_at` = now. | Frees the email in Supabase Auth — they can re-apply with it. |
| 5. If step 4 fails | The member stays Closed; `auth_deleted_at` stays empty; the login is still banned (can't sign in). Account Management shows **"Login removal pending — Retry"**. | Safe to retry: every step checks whether it's already done. |

### 13. What is cleared vs kept

| Table | Cleared | Kept |
|---|---|---|
| `personal_data_sheet` | email, contact number, permanent address, date/place of birth, TIN, GSIS no., spouse name/occupation/birth date, father's/mother's name | first/middle/surname, membership ID, date of membership, shares/capital figures |
| `member_applications` (their own application) | the same personal fields | name, membership ID, dates, status |
| `member_account` | real email → placeholder (§12 step 3); `auth_user_id` → NULL after the login is deleted | the row itself |
| `loans.user_email` | cleared | the loans |
| `loan_email_log.recipient_email`, `attendance_logs.member_email` | cleared | the log rows |
| Profile photo (`profiles.avatar_url` + the file in storage) | deleted | — |
| **Not touched** | — | loans, loan payments (incl. legacy), schedules, penalties, CBU, `cbu_payouts`, savings history, ISC postings, MIGS/risk history, audit log, disbursement confirmations |

Open decisions (defaults in bold):
- **Co-maker details** (`co_makers` name/mobile/address/email) belong to *another member's* loan application — **keep** (it's that borrower's record).
- **Loan supporting documents** (payslips, IDs in the `Supporting_Documents` storage bucket) are part of the loan record — **keep**.
- **Savings nominee details** (`Savings_Transactions` nominee birth date/address) — **clear**.

### 14. Safety fixes that must ship with Part C

1. **Fix the Supabase delete cleanup trigger** (`cleanup_membership_related_data_on_auth_delete`, on `auth.users`). Today it deletes `member_account`, the member's applications, their **PDS** (by email or membership ID) and the `member` row whenever an auth user is deleted. For a member with loans/CBU the `member` delete hits foreign keys and the whole auth delete fails; for members whose `member.id` isn't their login id it can **silently delete their PDS**. New rule: the trigger only cleans up **applicants who never became members** (no `member` row linked to that login); for anyone who is or was a member it does nothing — `_close_member` handles them. Until this ships, **nobody should delete auth users by hand in the Supabase dashboard.**
2. **Stop the login backfill from reviving closed members.** `/api/admin/backfill-member-auth` recreates a login for every `member_account` row without one; it must skip members whose status is terminated, exiting or closed.
3. **Re-application with the freed email** must be accepted: the new-applicant checks (`Membership_Form.jsx`, confirmation) look up `member_account` / applications by email — the closed member's placeholder email no longer matches, so the old record doesn't block them. A returning member gets a **new** membership ID (starts from scratch, per Part A).

### 15. Screens

- **Account Management** — closed members show "Login removed" or "Login removal pending — Retry"; the member's name and money columns stay.
- **Secretary record details** — a closed member's personal fields show "Cleared (member closed)"; termination and CBU sections unchanged.
- **Cashier / reports / ledgers** — unchanged; they already show names and membership IDs, which are kept.

### 16. SQL (Part C)

- New `member_closures` table (history of closures; RLS on, service-role access only).
- Replace `cleanup_membership_related_data_on_auth_delete()` with the applicant-only version (§14.1).

### 17. Not included in Part C

- **Deleting financial records** — kept by decision (see Goal).
- **A member who never collects their CBU** — they stay Terminated (not Closed), so their data isn't cleared. A time limit / unclaimed-CBU rule would need a coop decision.

---

## Not included

- **Admins who aren't coop members** — every login needs a `membership_id`.
- **Loan release vault link** — loan release still auto-debits the vault (`vault_debit_for_disbursement`, `main.py` ~4506) and blocks when funds are short. Unchanged unless decided otherwise.

## Background

- A "separate staff logins" design (member_account one row per login) was built and **rolled back** on 2026-09-28 — unnecessary, because one login already serves both portals. The patch and forward/rollback SQL are kept in `src/server/` (`member_account_staff_logins*.sql`, `member_account_staff_logins_code.patch`) for reference only; don't reapply.
- Existing termination today: BOD `POST /api/admin/member/terminate` stamps `member.member_status = 'terminated'` + resolution no., sets `member_account.is_active = false`, notifies the Secretary. Note: `is_active` is **not checked at login**, so a "deactivated" account can still sign in — Part A's lock must actually block sign-in (e.g. Supabase Auth ban).
