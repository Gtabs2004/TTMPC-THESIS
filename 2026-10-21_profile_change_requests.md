# Two requests: (A) profile change requests with payslip, (B) month-by-month cash sufficiency on the Vault page

To: developers. From: Erden (BOD / Secretary), for the group.
We ask that you build both in MAIN, where you work. When you are done, tell us and we will pull and clone the result into our copy (we will not build a parallel version).

# A. Member profile change requests (Bookkeeper approval)

## What we want
A member should not edit profile details directly. Every profile field goes through a change request to the Bookkeeper, who approves or rejects it; approval applies the change. Only net take-home pay needs proof: the member attaches a photo of the payslip. Other fields need approval but no attachment. Net pay matters most because the 40% debt-capacity rule and the loan limit read it.

## What the system does today (checked 2026-10-21)
- `Members_Profile.jsx` saves edits straight to the Personal Data Sheet (`handleConfirmSave` builds an `updatePayload`). No Bookkeeper step, no proof.
- No table for change requests exists (TEST has none among its tables).
- `SupportingDocumentsUpload.jsx` already uploads documents for loans, so an upload pattern exists to reuse.

## Proposed flow
1. Member opens Profile, edits net take-home pay (or another controlled field), and is asked to attach a payslip. Two ways to attach: choose a file, or take a photo with the phone camera (a file input with `accept="image/*"` and `capture="environment"` opens the camera on phones). PDF and PNG/JPG accepted.
2. The request is saved as pending. The member sees "Waiting for Bookkeeper approval". The profile value does not change yet.
3. Bookkeeper sees the request in the Manage Members page, opens the payslip, compares the figure, and approves or rejects (rejection needs a reason).
4. Approve = the new value is written to the profile, the old value is kept in the request row, an audit_log entry is written, and the member gets a notification (bell and, if you agree, email).

## Suggested design (follow the existing renewal-override pattern)
- New table, for example `member_profile_change_requests`: member, field name, old value, new value, payslip file path, status (pending / approved / rejected), requested_at, reviewed_by, reviewed_at, reject reason. Rows are never deleted (history ledger).
- RLS on, no client policies; all access through FastAPI on the service-role key, identity from the verified JWT (never from the body), and a Bookkeeper cannot review their own request. Same as `loan_renewal_override_requests`.
- Private storage bucket for payslips (not public). Only the member and Bookkeeper staff can read a file, through a short-lived signed link.
- Backend endpoints under `/api/member/profile-change-requests*` and `/api/bookkeeper/profile-change-requests*`.

## Bookkeeper screen: alert and pending count
- Manage Members (`Manage-Member.jsx`): show a "Pending changes" badge and a filter for members with a pending request.
- Sidebar badge: add a `badgeKey` entry in `StaffSidebar/configs/bookkeeper.js` and a count in `useBookkeeperPendingCounts.js` (the same way `override_requests` works), and add the new table to the realtime list in `lib/realtimeSync.js`.
- Bell: a `loan_notifications`-style row for the Bookkeeper when a request arrives, and for the member when it is decided.

## Extra points we suggest
- One open request per member (or per field) at a time; the member can cancel while it is pending.
- The Bookkeeper sees old value and new value side by side, with the payslip next to them.
- Payslip rules: image or PDF only, a size limit, and it should be recent (for example the latest pay period). Store it in the existing private `Supporting_Documents` bucket under its own folder.
- Privacy: payslips are sensitive. Keep them readable only by the member and the Bookkeeper, and decide how long they are kept after a decision.
- After an approved net-pay change, anything that reads net pay (debt capacity, loan limit, the MIGS and credit-risk inputs) should use the new value; a pending request must not change any of them.
- An approved or rejected request notifies the member (bell, and email if you agree). Every decision goes into `audit_log`.

## Questions for you
1. Which field is the one the system reads as net take-home pay: `member_profile.latest_net_pay`, `member_profile.net_income`, or `loans.latest_net_pay`? Approval should update the right one, and the loan form should read the same one.
2. Should an approved change be allowed while the member has a pending loan application?

## Not changing
Role checks and RLS elsewhere. This is a new, separate flow.

# B. Month-by-month cash sufficiency (Treasurer, Vault page)

## What we want
`Vault.jsx` now compares the vault only with next month's forecast. We want a table for each forecast month (the forecast already returns 12 months): the month, the forecast need, the cash already reserved, the cash available, the status, and how much to prepare.

## Proposed logic
- need = forecast upper 80% band for that month, consolidated plus emergency (the page already uses this as the planning number). Also show the upper 95% band as a "stress case" column (the forecast endpoint already returns `upper95`); status is decided on the 80% number only.
- reserved = cash already spoken for: net cash of loans approved for disbursement, i.e. status "ready for disbursement" (decided by us: only these are reserved), using the same `_compute_vault_available()` and `_net_cash_out_for_rows()` figures. Released loans are already out of the vault, and loans still "to be disbursed" are not reserved yet.
- available = vault balance minus reserved.
- coverage = available / need, always shown as a percentage on every row.
- If coverage is 1.2 or more (120%+): Sufficient, prepare nothing.
- Else if coverage is 1.0 to below 1.2: Tight, prepare need x 1.2 minus available (to restore the 20% buffer).
- Else (below 1.0): Shortfall, minimum to prepare is need minus available; recommended is need x 1.2 minus available. Inside Shortfall, label the severity so a near-miss reads differently from a large gap: 80% to below 100% = "Near target" (small top-up), below 80% = "Critical".
Please confirm the 1.2 buffer and the 80% cut-off; the 1.2 is what the page uses today.

Why the status uses the upper 80% band and not the point estimate or the 95% band:
- It is what the page and the model already use (`alpha` defaults to 0.20), so the new table agrees with the existing card and the Treasurer sees one rule, not two.
- The point estimate is the middle of the forecast: demand is above it about half the time, so a status built on it would say "sufficient" too often.
- The upper 95% band is the safest but ties up the most idle cash and would show "shortfall" in most months; as a status it would stop meaning anything. We show it only as a "worst case" column.
- Because the band sets the need, the status can change when the band changes. Keeping one fixed band for the status avoids that. The point estimate and the 95% number are shown beside it for context only.
- The band is a single setting in the code, so the cooperative can move to 95% later without redesign.

## Questions for you
1. Should expected collections for the month be shown as an optional line (not netted)?
2. For months far ahead, is it correct to compare each month with today's available cash (not a running balance)? We suggest yes, since collections are not predicted.

# C. Payroll delay clean-up
We decided to remove the payroll delay feature. In origin/main (commit 6944a42, checked 2026-10-21) the screens are already gone (no payroll component in the frontend), but these remain:
- main.py: the "payroll release logbook" section, with `/api/treasurer/payroll/schedule`, `/payroll/stats`, `/payroll/log` and `/payroll/late-payments` (and `PAYROLL_GRACE_BUFFER_DAYS`).
- Database: the `salary_schedule` table (180 rows) and the views `salary_schedule_logged_v` and `salary_schedule_delay_stats_v`; `payroll_release_schedule_schema.sql`.
Please remove them, or tell us if anything else still reads them (for example the grace-period logic in the late-payments endpoint, or past-due follow-up). Do not drop the table until you have confirmed that.
