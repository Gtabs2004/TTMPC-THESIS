# Transfer of the simulated data from TEST into MAIN

Written for: the developers and the team working on the simulation. Date: 2026-10-24. Everything below was checked read-only against both databases on 2026-10-24. Nothing has been run yet.

## 1. In short

- **The simulation already exists in TEST.** It holds about 90 simulated members, about 200 loans with schedules, and thousands of payments, all following the system's own rules. Nobody has to enter history by hand. In the demo, the team only does actions on the admin side.
- **The table names are the same.** All 66 shared tables match in MAIN and TEST by column name and type. The only exception is one column type (`personal_data_sheet.contact_number`: text in MAIN, bigint in TEST). The roughly 40 tables that start with `_sim` are backups from the simulation scripts. They stay in TEST and are never copied.
- **The copy only adds rows.** It never deletes or overwrites anything in MAIN. It starts with a backup and a dry run that rolls back, and it can be undone.
- **If any check fails, nothing is committed.** The defense then runs on TEST, which already holds the data.

## 2. Why the data is not entered by hand

1. **The app cannot back-date.** Anything entered by hand gets the date of the day it is entered. Releases, payments, receipts, audit rows and vault entries would all carry 24 October. The forecast, MIGS, penalties, Reports and the risk model depend on months of history, so hand entry would give empty or wrong screens.
2. **It is too much work for the time left.** About 200 loans each pass five roles, and thousands of payments each pass two. That is days of typing, and every typo becomes a wrong number on screen.
3. **Hand entry triggers the app's side effects** (receipts, capital, vault, audit) at the wrong date.

Only the live demo actions are done by hand: approving a loan, recording a payment, approving a member. Those happen on the admin side during the defense.

## 3. Why the data sits in many member accounts

- The system's own rules depend on each member's history: the borrowing limit (3 or 5 times capital), one pending loan per member, six monthly payments before a renewal, penalties, MIGS points and the risk band. One account cannot be in all those states at once. Each situation a panelist may ask about therefore has its own member already in that state.
- The cooperative works the same way: staff record the transactions and most members never log in. The demo runs from the staff screens (Bookkeeper, Manager, Treasurer, Cashier, BOD, Secretary).
- The member side is shown only if the panel asks. Five prepared member logins exist for that: TTMPC-270, 301, 302, 303 and 405. Their password is the surname in capitals plus 1234 (for example TEOPE1234). The other members have no login on purpose, so nobody logs in as a member to submit anything.

## 4. Why it is safe for the developers' version

- No schema change and no code change travel with the data.
- The rows already passed the database's own checks and triggers in TEST. The consistency checks are clean: capital equals the ledger, savings equals the ledger, the vault is never negative, and no record is dated in the future.
- The copy never touches a row that only MAIN has.
- What is not proven yet is the dry run on MAIN. It decides everything.

## 5. What the copy must respect

- TEST is not MAIN plus new rows.
  - TEST has rows MAIN lacks: members 383 vs 292, loans 1,641 vs 1,444, schedules 10,479 vs 8,942, payments 3,051 vs 1,664, receipts 1,786 vs 103.
  - MAIN has rows TEST lacks: `kiosk_auth` 306 vs 0, `loan_email_log` 17 vs 0, `profiles` 2 vs 0, `loan_collateral` 1 vs 0, `member_profile_change_requests` 3. Rows that only MAIN has are never deleted or overwritten.
- Most tables use random uuid keys, so rows cannot collide. Tables keyed by text are `loans` (control number), `member_account` (membership id), `personal_data_sheet`, `savings_accounts` (account number), `member_applications` and `GROCERY_TRANSACTIONS`. These are copied by key, and only keys MAIN does not have are inserted.
- These tables have a counter id, and the ids of the two projects overlap: `audit_log`, `attendance_logs`, `co_makers`, `general_assembly_attendance`, `grocery_events`, `loan_notifications`, `loan_email_log`, `cbu_payouts`, `loan_renewal_override_requests`, `loan_restructure_requests`, `member_closures`, `staff_termination_requests`, `vault_entries`. They are copied without the id, and MAIN numbers the rows.
- Some rows already in MAIN were changed in TEST by the simulation scripts (for example 3 future-dated payments, loans of the demo members, savings account opening dates). Each `_sim..._backup` table in TEST holds the original of every row a script changed. Those keys form the update list. A MAIN row is updated only if it still equals the backup; otherwise it is reported.

## 6. Steps

Everything in MAIN runs in one transaction with a dry-run switch (true: run all checks, then roll back; false: commit), as the scripts in `docs/sim` do.

1. **Before anything:** MAIN is frozen (nobody works in it), a full backup is taken (dashboard backup or `pg_dump` of schema `public`), and the name check below is run in both projects and compared:
   `select count(*), md5(string_agg(table_name||'.'||column_name||':'||data_type, ',' order by table_name, column_name)) from information_schema.columns where table_schema='public' and table_name not like '\_sim%' and table_name <> 'member_profile_change_requests';`
2. **TEST is read from MAIN.** In MAIN, a schema `stg` is created, then `create extension postgres_fdw`, `create server` (host, port and database of TEST), `create user mapping` (the TEST login the developers already have) and `import foreign schema public from server ... into stg`. This copies nothing yet.
3. **A diff report per table:** keys only in TEST (will be inserted), keys in both with different content (shown; updated only if on the update list), keys only in MAIN (untouched). Pattern: `select count(*) from stg.loans t where not exists (select 1 from public.loans m where m.control_number = t.control_number);`. The counts are compared with section 5. Any surprise stops the plan.
4. **The copy, parents first.** Each table is loaded with `alter table ... disable trigger user`, and the triggers are enabled again afterwards, so no receipt, audit, capital or vault side effect fires.
   1. Members: `member`, `member_account` (`auth_user_id` stays empty for members without a login), `personal_data_sheet` (`contact_number` cast to text, with the leading 0 put back), `member_profile`, `member_applications` (the prepared applicants).
   2. Capital and savings: `capital_build_up`, `savings_accounts`, `savings_ledger`, `savings_transaction_queue`, `time_deposits`, `time_deposit_ledger`, `time_deposit_status_history`, `membership_payments`.
   3. Governance and MIGS inputs: `general_assembly_attendance`, `attendance_logs`, `migs_outside_loan_declaration`, `member_classification_temporal`, `grocery_events`, `GROCERY_TRANSACTIONS`.
   4. Loans: `loans`, `co_makers`, `loan_collateral`, `loan_schedules`, `loan_payments`, `loan_payments_legacy` (only the extra rows), `loan_payment_ledger`, `loan_penalties`, `disbursement_confirmations`, `loan_notifications`, `loan_renewal_override_requests`, `loan_restructure_requests`, `risk_assessments`, `cbu_payouts`, `member_closures`, `staff_termination_requests`.
5. **Not copied, on purpose:**
   - `audit_log`: the simulation scripts switched the audit trigger off, so simulated data has no audit rows. MAIN writes its own as people use it.
   - `receipts`: MAIN already has 103 receipts (counter 2026 = 103), so TEST numbers from 000102 up would collide. After the copy, `docs/sim/transfer_02_receipts_on_main.sql` is run in MAIN. It issues the receipts with the app's own functions, numbers them after MAIN's highest number (104 or higher), starts as a dry run that rolls back, and keeps its working tables in a schema `transfer_tmp` that is dropped afterwards. It covers loan payments, savings, capital, membership payments, grocery, time deposits, loan releases and CBU payouts.
   - `kiosk_auth`, staff and real members' accounts, everything in `_sim` tables, and the two `bonus_window` override rows.
6. **The vault needs a decision (Gero with Ervine).** TEST's vault history (137 entries, balance 1,100,000, opening 2,500,000) is a different story from MAIN's (15 entries, balance 585,346.75). TEST's whole history is not added on top of MAIN's, because the guard trigger also refuses any step that makes the balance negative. Recommended: copy only the entries of the simulated period and add one adjusting deposit so the final balance equals the number the group chooses (1,100,000 gives the planned message "prepare about 1.7 million"). MAIN's 15 real entries stay.
7. **Logins.** The personas (301, 302, 303, 405) and Ashley have no login in MAIN. They are created in the MAIN dashboard (Authentication, Add user, auto confirm), and `member_account.auth_user_id` is linked. Staff logins already exist.
8. **No Recompute on the MIGS page in MAIN until the late-payment lookup is fixed** (item 1 of the findings). The MIGS snapshots are copied instead. Recompute with the bug gives every member full late-payment points.
9. **Verification** uses section A of `docs/POST_SIMULATION_CHECKLIST.md`. On MAIN the totals are MAIN's rows before plus the diff counts of step 3, not TEST's totals (for example members = 292 + keys only in TEST). The vault balance, the receipt counter and the sum of share capital are compared as well.
10. **Undo.** The dry run comes first. After a real run, every inserted key is written to a `copy_log` table in the same transaction, so the copy can be removed by key. The backup of step 1 is the last resort.

## 7. When

- The mock defense runs on TEST (the `.env` points to TEST). The profile change is shown on MAIN, the only place its table and storage bucket exist.
- Steps 1 to 4 are rehearsed as dry runs on 25 October, and the plan is corrected with what they show.
- The real copy runs on 26 October only if every check passes. If not, the defense on the 27th also runs on TEST.
- The rehearsal takes two to three hours.

## 8. Security

- After the copy, the foreign server and the user mapping are removed from MAIN (`drop server ... cascade`, `drop schema stg cascade`), and the TEST login used for the copy is changed.
- TEST's query statistics hold an earlier statement that opens a connection to MAIN (it starts with `DO $mirror$`; only its start was visible). If it contained the MAIN database password, that password is changed after the copy and the `.env` is updated.
- In MAIN, `member_account.password` is filled for 276 of 292 members. If it holds the temporary password in readable form, it should be cleared once members have set their own password.
- In TEST, 291 account rows point to login users that do not exist there (only 11 logins exist). That is why only the prepared logins can sign in.
