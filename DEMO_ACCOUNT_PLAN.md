# TTMPC REGANT — Demo Account Plan (26-login version)

Resolves the account count for the "Complete" demo doc (`TTMPC REGANT — Demo Accounts & Scenarios (Complete).md`)
against the real email inboxes the group actually has. Supersedes the placeholder
`ttmpc.demo+mNN@gmail.com` emails in that doc for the 11 accounts listed below.

## The gap

The Complete doc needs **26 logins**: 6 staff (exist already) + 5 applicants + 20 members.

The group supplied 16 real email addresses. Checked against the live Supabase Auth
users list (2026-10-24): none of the 16 match an existing account. (The two
pre-existing accounts found — `nashervinesiaton@gmail.com` and
`nashervine.siaton@wvsu.edu.ph` — are **not** part of the 16-email batch and are
excluded from this plan entirely.) All 16 are genuinely new signups.
That leaves **16 new usable emails** against a need for **25 logins**
(5 applicants + 20 members) → short by **9**.

## Decision: emails are required wherever the UI needs to show a received email

The group confirmed several scenarios depend on a real inbox (status emails, PMES
notices, approval confirmations) — so the shortfall cannot be closed with no-login
SQL rows. Every one of the 25 non-staff logins must be a real `auth.users` signup with
a real inbox behind it.

**Resolution:** split the 20 member slots into two tiers by whether the scenario's
email actually needs to be *shown arriving* on stage:

- **Tier 1 — 11 real-login members (Member 1–11).** Built via the live signup →
  PMES → payment → BOD-approval flow, using 11 of the 16 real emails supplied
  (none pre-exist in Supabase Auth — all run the full flow). Emails fire
  normally (`send_email=True`).
  These carry the scenarios the panel will watch happen live, **prioritizing
  Consolidated-loan scenarios** since Consolidated is the flagship product.
- **Tier 2 — 9 real-login members (Member 12–20).** Still real `auth.users` signups
  with real inboxes (plus-addressed off one owned Gmail — see "Sourcing the last 9
  emails" below) — so any email that *does* fire for them is still delivered and
  can be shown if asked. But they are **seeded directly via SQL** into their final
  state (loan, CBU, override, payment history) rather than walked through the
  live apply→approve pipeline, and the demo script does **not** dispatch
  `/api/send-status-email` / `/api/loans/notifications/*` for their seeded
  transitions — only Tier 1's live actions trigger visible emails during the run.

This keeps every account technically capable of receiving mail (so nobody can ask
"does this account even have a real email?" and get a "no"), while keeping the
actual seeding work for 9 of the 20 members to a single SQL script instead of
9 manual signup-and-approval walkthroughs.

## Status: Tier 2 (9 accounts) deferred

**Decision (2026-10-24): proceed now with the 16 emails in hand** — they fully
cover Applicants 1–5 and Tier 1 Members 1–11. Tier 2 (Member 12–20, 9 accounts)
is **flagged and set aside** to source/build later; it does not block starting
Tier 1 signups or the Applicant flow.

### Sourcing the last 9 emails (when picked back up)

Use Gmail plus-addressing off one inbox a group member already owns and controls
(e.g. `yourname+m12@gmail.com` … `yourname+m20@gmail.com`). Each is a distinct,
valid address Supabase Auth will accept for signup, all mail lands in one inbox
you can show live if the panel asks to see a Tier 2 email, and no one has to beg
for 9 more personal addresses.

## Tier 1 — Member 1–11 assignment (Consolidated-priority)

Names carried over from the Complete doc's Member roster (so BOD resolutions,
PDS data, and the figures already worked out in that doc's "Loans and computed
figures" table stay valid — only the login email changes from the
`ttmpc.demo+mNN@gmail.com` placeholder to a real inbox).

**Approved 2026-10-24 — all 11 are now real members.** Table below updated
with actual `membership_id` values from TEST (replaces the M1–M11 placeholder
labels used while they were still applications).

| Slot (was) | Official ID | Name | Email (assigned) | Consolidated scenario | Stacked loan (if any) |
|---|---|---|---|---|---|
| M1 | **TTMPC-301** | Ana L. Dela Cruz | `romelyn.delosreyes@wvsu.edu.ph` | New, <₱500k, medium risk | — |
| M2 | **TTMPC-302** | Ramon S. Villanueva | `dksxlynx112@gmail.com` | New, >₱500k, high risk, BOD route | + active Emergency (concurrent, for `ConcurrentLoans` risk feature) |
| M5 | **TTMPC-300** | Grace D. Tolentino | `kirigayalynx@gmail.com` | Renewal, 8/6 payments met | — |
| M6 | **TTMPC-303** | Mark J. Salazar | `lynxridao@gmail.com` | Renewal blocked (3/6 payments) + override request pending | — |
| M8 | **TTMPC-304** | Dennis F. Paredes | `gardecelso@gmail.com` | Revision requested by Manager | — |
| M12 | **TTMPC-305** | Noel V. Catalan | `mae.tabiolo@deped.gov.ph` | Payment = amortization (no deficiency, no credit) | — |
| M13 | **TTMPC-298** | Shiela A. Lopez | `dondonquixote7@gmail.com` | Payment < amortization (deficiency carried) | — |
| M14 | **TTMPC-306** | Ricky D. Gallo | `gtabs2004@gmail.com` | Payment > amortization (credit applied) | — |
| M18 | **TTMPC-307** | Edwin R. Bermejo | `serevee7@gmail.com` | 5 months unpaid, 2% penalty | — |
| M3 | **TTMPC-297** | Liza M. Gonzaga | `geroantoni.tabiolo@wvsu.edu.ph` | — (no Consolidated) | Emergency new, low risk |
| M4 | **TTMPC-299** | Joel B. Castillo | `jibozai2004@gmail.com` | — (no Consolidated) | Bonus new |

Note: membership IDs were assigned in approval order, not application order
— TTMPC-297/298/299 fell between the others (likely another applicant or
historical member was approved between ours). **Use the Official ID column,
not the old M-slot number, for every loan/CBU seed script from here on** —
loan control numbers, CBU deposit references, and any BOD resolution text
should key off `TTMPC-301` etc., never `M1`.

This fills all 9 Consolidated-loan scenarios from the Complete doc onto 9 accounts,
one each, since a member can hold only one active loan per *type* (not one loan
total — `ACTIVE_LOAN_STATUSES` / renewal-eligibility logic in `main.py` gates per
loan type, confirmed against the "6-Month Renewal Rule" section). The remaining
2 real accounts absorb the Emergency- and Bonus-only scenarios that don't need a
Consolidated loan at all.

**Not yet decided:** which 2 of {M15 (Emergency 7th payment), M16 (Bonus paid on
time, final installment), M17 (Bonus paid late, penalty)} get dropped or merged
into M3/M4 above, since only 2 free slots remain for 3 candidate scenarios. Pick
before writing the seed script — recommend keeping M17 (penalty demo) and M16
(fully-paid demo) since M15 is a close duplicate of M3's Emergency flow.

## Tier 2 — Member 12–20 assignment (SQL-seeded, real plus-addressed inboxes)

| Member | Scenario | Notes |
|---|---|---|
| M7 | Profile change request pending (net pay + payslip) | |
| M9 | Renewal override — pending | |
| M10 | Renewal override — approved | |
| M11 | Renewal override — rejected | |
| M15 or M16/M17 (whichever didn't fit Tier 1) | Emergency/Bonus payment-state scenario | depends on Tier 1 decision above |
| M19 | Terminated, CBU offset against loan, partial payout | |
| M20 | Active, terminated **live** during the BOD walkthrough | |
| (2 more slots) | Fill from remaining Complete-doc scenarios not yet assigned | finalize once Tier 1's 2 free slots are locked |

## Applicants 1–5

Names carried over from the Complete doc. Use the remaining 5 of the 16 real
emails (distinct from the 11 used for Tier 1 — do not reuse the same inbox for
both an applicant and a Tier 1 member slot, since each is a separate
`auth.users` signup and the applicant stage must stay independently showable).

| Applicant | Name (per Complete doc) | Email (assigned) | Seeded state before demo | Ends as |
|---|---|---|---|---|
| Applicant1 | Carla M. Bautista | `hithott2@gmail.com` | Form submitted; `Pending`; no attendance row | Approved for PMES (BOD, live) |
| Applicant2 | Paolo R. Espinosa | `kraksip@gmail.com` | Approved for PMES; attendance `Pending`, PMES, meeting date Oct 24 2026 | PMES `Present` (Secretary, live) |
| Applicant3 | Joanna T. Lacson | `diwondo1@gmail.com` | Missed PMES (`Absent`); rescheduled to Nov 7 2026 | Shows rescheduled PMES on her portal |
| Applicant4 | Miguel A. Sorongon | `byarou030@gmail.com` | Returned by BOD for revision (TIN/GSIS missing) | Resubmits corrected form |
| Applicant5 | Hazel P. Gumban | `dpurposes17@gmail.com` | PMES Present; both membership payments `pending` | Paid (Cashier, live) → approved as a member (BOD, live) |

*(Assigned from the 3rd group of emails you supplied. Swap any of these freely —
they're interchangeable as long as each is used once.)*

### Complete membership applications (fill `/membership_form` with these)

All five are public-school teachers in Tubungan, Iloilo (per the Complete doc's
Applicant table), with a full Personal Data Sheet. Civil Status Single for all
(skips spouse fields). Contact numbers are placeholders — replace with each
real person's number before submitting; a working number is required to
receive SMS if the form checks it, and is shown in Manage Members either way.

| Field | Applicant1 — Carla M. Bautista | Applicant2 — Paolo R. Espinosa | Applicant3 — Joanna T. Lacson | Applicant4 — Miguel A. Sorongon | Applicant5 — Hazel P. Gumban |
|---|---|---|---|---|---|
| Email | hithott2@gmail.com | kraksip@gmail.com | diwondo1@gmail.com | byarou030@gmail.com | dpurposes17@gmail.com |
| Gender | Female | Male | Female | Male | Female |
| Civil Status | Single | Single | Single | Single | Single |
| Date of Birth | 1997-03-11 | 1995-08-22 | 1998-11-02 | 1996-05-17 | 1993-09-29 |
| Place of Birth | Tubungan, Iloilo | Iloilo City | Tubungan, Iloilo | Guimbal, Iloilo | Tubungan, Iloilo |
| Religion | Roman Catholic | Roman Catholic | Roman Catholic | Roman Catholic | Roman Catholic |
| Blood Type | O+ | A+ | B+ | O+ | A+ |
| Height / Weight | 158 / 54 | 170 / 68 | 160 / 55 | 172 / 70 | 155 / 50 |
| TIN | 111-222-333 | 222-333-444 | 333-444-555 | 444-555-666 | 555-666-777 |
| GSIS Number | 1111222233 | 2222333344 | 3333444455 | 4444555566 | 5555666677 |
| Father's / Mother's Name | Roberto Bautista / Elena Bautista | Ramon Espinosa / Luz Espinosa | Teodoro Lacson / Rosario Lacson | Ariston Sorongon / Fe Sorongon | Pablo Gumban / Corazon Gumban |
| Permanent Address | Brgy. Poblacion, Tubungan, Iloilo | Brgy. Tabucan, Tubungan, Iloilo | Brgy. Igbon, Tubungan, Iloilo | Brgy. Cubay, Tubungan, Iloilo | Brgy. Buyo, Tubungan, Iloilo |
| Contact Number | 09171000001 | 09171000002 | 09171000003 | 09171000004 | 09171000005 |
| Educational Attainment | Bachelor's degree | Bachelor's degree | Bachelor's degree | Bachelor's degree | Bachelor's degree |
| Occupation / Position | Teacher I | Teacher I | Teacher II | Teacher I | Teacher III |
| Income Source / Employer | Salary, DepEd Tubungan | Salary, DepEd Tubungan | Salary, DepEd Tubungan | Salary, DepEd Tubungan | Salary, DepEd Tubungan |
| Monthly Salary | ₱24,500.00 | ₱24,500.00 | ₱27,800.00 | ₱24,500.00 | ₱31,200.00 |
| Other Source of Income | N/A | N/A | N/A | N/A | N/A |

**TIN/GSIS note:** Applicant4's seeded defect (Complete doc: "TIN and GSIS no.
missing") means his *first* submission should leave those two fields blank, not
filled as shown above — the table values above are what he re-enters on
resubmission (A-4 / D-2) after BOD returns the application for revision.

After submitting all 5, drive each to its documented seeded state per the
table above (PMES scheduling, attendance marking, payment recording) exactly
as described in the Complete doc's Scenarios — Applicant portal / BOD / Cashier
/ Secretary sections (A-1…A-6, C-8, D-1…D-3, S-1…S-2) — those steps are
unchanged by this email swap.

### SQL alternative to the live form submission

Confirmed safe to bypass `/membership_form` and insert these 5 rows directly:
the Applicant stage creates **no Supabase Auth user** — `member_applications`
is a plain table insert with no password/login tied to it (login only gets
created at BOD approval, when the row becomes a real `member` + `member_account`
row). The form itself does nothing SQL can't replicate: no trigger, no PDF, no
email fires on insert.

**Cashier payments (Applicant5) and BOD approval (all 5) stay live, as planned**
— not seeded. These two steps are the ones the panel should watch happen in
the real UI.

Seed SQL: `DEMO_ACCOUNT_SEED_APPLICANTS.sql` (repo root). Key caveats from
that file, worth keeping in mind:
- `tin_number` is `NOT NULL`; Applicant4's row uses `''` to seed the
  "TIN/GSIS missing" BOD-revision scenario — confirm the BOD page treats an
  empty string the same as "missing" before relying on it.
- `attendance_logs` is a separate table, not covered by that insert — seed
  separately or do the Secretary/BOD PMES-marking steps live (recommended
  for Applicant2 and Applicant5 anyway, per the Complete doc's D-1/S-1).
- Run once; re-running hits the partial unique index on `email`.

## Open items before seeding

**Active now (Tier 1 + Applicants, using the 16 emails in hand):**
1. Lock the Tier 1 "2 free slots vs 3 candidates" decision (M15/M16/M17).

**Deferred (Tier 2, pick up later — does not block Tier 1):**
2. Confirm which 2 Complete-doc scenarios fill Tier 2's last 2 open rows.
3. Write the Tier 2 SQL seed script: `auth.users` signup (plus-addressed email,
   same password convention as the rest) → `member` + `member_profile` row →
   CBU lines → loan + `loan_schedules` + validated `loan_payments` rows per the
   figures already in the Complete doc's "CBU ledger and savings seed" and
   "Loans and computed figures" tables — no `/api/send-status-email` or
   `/api/loans/notifications/*` calls during seeding.
4. **Bonus-window rule changed 2026-10-23** (`bonus_loan_window_trigger.sql`,
   decision 3.3-1) — the Complete doc's "works only in May/November" framing
   for M4 and NM1 is now backwards and the override path no longer exists:
   - Applications can be **submitted any month**, including May/November.
     There is no more submission-time block.
   - The block now fires at the **Bookkeeper's recommend-for-approval step**,
     and blocks *during* May/November (not outside it) — because those are
     Bonus's own repayment months.
   - The old override mechanism (`bonus_window_override.sql`,
     `loan_renewal_override_requests`-based bypass) was **removed** by this
     same migration. Any demo scenario built around "approved override lets
     a Bonus loan through outside the window" (e.g. Romelyn's override in
     `DEFENSE_DEMO_WALKTHROUGHS.md` W8) no longer applies and must be cut or
     rewritten.
   - For an Oct 24 demo date: M4 and NM1's Bonus applications submit and
     reach "recommended for approval" with **no trigger error at all**
     (October is neither May nor November). To still show the block live,
     the Bookkeeper step must be demoed in May or November, or the row's
     `loan_status` transition attempt should be shown failing only if the
     demo is actually run in one of those two months.
