# TTMPC – Database Schema Documentation
## Management Information System

*Generated from live Supabase schema on 2026-08-02. 49 tables.*

---

## Table of Contents
- [Membership & Auth](#membership--auth)
  - [member](#member)
  - [member_account](#member_account)
  - [member_applications](#member_applications)
  - [member_profile](#member_profile)
  - [member_import_stage](#member_import_stage)
  - [personal_data_sheet](#personal_data_sheet)
  - [profiles](#profiles)
  - [kiosk_auth](#kiosk_auth)
  - [account_change_otp](#account_change_otp)
  - [legacy_member_link](#legacy_member_link)
  - [secretary_membership_records](#secretary_membership_records)
  - [staff_termination_requests](#staff_termination_requests)
  - [member_classification](#member_classification)
  - [member_classification_temporal](#member_classification_temporal)
  - [classification_level](#classification_level)
  - [stress_index_category](#stress_index_category)
- [Loans](#loans)
  - [loans](#loans)
  - [loan_types](#loan_types)
  - [loan_schedules](#loan_schedules)
  - [loan_payments](#loan_payments)
  - [loan_payments_legacy](#loan_payments_legacy)
  - [loan_payment_ledger](#loan_payment_ledger)
  - [loan_calculator](#loan_calculator)
  - [loan_collateral](#loan_collateral)
  - [loan_fee_policies](#loan_fee_policies)
  - [loan_email_log](#loan_email_log)
  - [loan_notifications](#loan_notifications)
  - [co_makers](#co_makers)
  - [disbursement_confirmations](#disbursement_confirmations)
  - [koica_loans](#koica_loans)
  - [risk_assessments](#risk_assessments)
  - [loans_member_id_backup_20260730](#loans_member_id_backup_20260730)
- [Savings & Share Capital](#savings--share-capital)
  - [Savings_Transactions](#savings_transactions)
  - [savings_accounts](#savings_accounts)
  - [savings_ledger](#savings_ledger)
  - [savings_transaction_queue](#savings_transaction_queue)
  - [capital_build_up](#capital_build_up)
  - [membership_payments](#membership_payments)
  - [member_statement_of_account](#member_statement_of_account)
  - [v_savings_balance_reconciliation](#v_savings_balance_reconciliation)
- [Vault & Cash](#vault--cash)
  - [vault_entries](#vault_entries)
  - [vault_balance_v](#vault_balance_v)
  - [ledger_transactions](#ledger_transactions)
- [POS / Grocery](#pos--grocery)
  - [GROCERY_TRANSACTIONS](#grocery_transactions)
  - [grocery_events](#grocery_events)
  - [member_grocery_totals](#member_grocery_totals)
- [Attendance & Governance](#attendance--governance)
  - [attendance_logs](#attendance_logs)
  - [general_assembly_attendance](#general_assembly_attendance)
- [Audit](#audit)
  - [audit_log](#audit_log)

---

## Membership & Auth

### member
Master member record — one row per cooperative member.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| membership_id | varchar | UNIQUE | required; human-readable member number |
| first_name | text |  |  |
| last_name | text |  |  |
| created_at | timestamptz |  |  |
| membership_type_id | text |  |  |
| co_maker | varchar |  |  |
| middle_initial | varchar |  |  |
| membership_date | date |  |  |
| is_bona_fide | bool |  | default: true |
| bod_resolution_number | text |  |  |
| number_of_shares | numeric |  |  |
| share_capital_amount | numeric |  |  |
| initial_paid_up_capital | numeric |  |  |
| termination_resolution_number | text |  |  |
| termination_date | timestamptz |  |  |
| auth_user_id | uuid | FK |  |
| member_status | text |  | default: active |

### member_account
Links members to Supabase auth users; auth_user_id may be NULL for imported legacy members.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| user_id | uuid | FK, UNIQUE | → member.id |
| email | text |  | contact email |
| role | text |  | required; user role (member/cashier/bookkeeper/manager/treasurer/bod) |
| created_at | timestamptz |  |  |
| is_temporary | bool |  |  |
| membership_id | text | PK, FK | → member.membership_id; human-readable member number |
| auth_user_id | uuid |  |  |
| password | text |  |  |
| password_hash | text |  |  |
| is_active | bool |  | default: true |
| is_email_dummy | bool |  | default: false |
| pending_email | text |  |  |

### member_applications
Pending applications from prospective members awaiting BOD approval.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| application_id | text | PK |  |
| surname | varchar |  | required |
| first_name | varchar |  | required |
| middle_name | varchar |  |  |
| gender | varchar |  | required |
| civil_status | varchar |  | required |
| date_of_birth | date |  | required |
| age | int |  | required |
| place_of_birth | varchar |  | required |
| citizenship | varchar |  | required |
| religion | varchar |  | required |
| height | varchar |  |  |
| weight | varchar |  |  |
| blood_type | varchar |  |  |
| tin_number | varchar |  | required |
| maiden_name | varchar |  |  |
| spouse_name | varchar |  |  |
| spouse_occupation | varchar |  |  |
| number_of_dependents | int |  |  |
| permanent_address | text |  | required |
| contact_number | varchar |  | required; phone number |
| email | varchar |  | contact email |
| educational_attainment | varchar |  | required |
| occupation | varchar |  | required |
| position | varchar |  |  |
| annual_income | numeric |  | required |
| other_income | varchar |  |  |
| declaration_confirmed | bool |  | default: false |
| application_status | varchar |  | default: pending |
| created_at | timestamp |  |  |
| membership_id | text |  | human-readable member number |
| approved_at | timestamptz |  | approval timestamp |
| spouse_date_of_birth | date |  |  |
| approved_by | uuid |  | approving user |
| approved_by_role | text |  |  |
| attendance_status | text |  |  |
| remarks | text |  |  |
| evaluation_result | text |  |  |
| gsis_number | text |  |  |
| father_name | text |  |  |
| mother_name | text |  |  |
| income_source | text |  |  |
| employer_name | text |  |  |
| salary | text |  |  |

### member_profile
Extended profile data (demographics, employment) for members.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| profile_id | uuid | PK |  |
| membership_number_id | uuid | FK, UNIQUE | → member.id; required; member reference |
| member_account | uuid | FK | → member_account.user_id |
| housing_status | text |  | required |
| net_income | numeric |  | required |
| years_in_service | int |  | default: 0 |
| civil_status | text |  | required |
| employment_status | text |  | required |
| spouse_employment_status | text |  |  |
| member_classification_id | uuid | FK | → member_classification.classification_id; required |
| current_loan_debt | numeric |  | default: 0 |
| latest_net_pay | numeric |  | required |
| stress_index | numeric |  |  |
| stress_index_category_id | uuid | FK | → stress_index_category.stress_index_category_id |
| created_at | timestamptz |  |  |
| updated_at | timestamptz |  |  |

### member_import_stage
Staging table for bulk-imported member records prior to promotion into member.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| membership_id | text |  | human-readable member number |
| LastName | text |  |  |
| FirstName | text |  |  |
| MiddleName | text |  |  |
| Gender | text |  |  |
| CivilStatus | text |  |  |
| DateOfBirth | text |  |  |
| TIN | text |  |  |
| Address | text |  |  |
| Occupation | text |  |  |
| DateJoined | text |  |  |
| Status | text |  | active / pending / terminated |
| DependentCount | text |  |  |
| Role | text |  | user role (member/cashier/bookkeeper/manager/treasurer/bod) |
| Email | text |  | contact email |

### personal_data_sheet
PDS form data collected during membership onboarding.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| personal_data_sheet_id | text | PK |  |
| membership_number_id | varchar | UNIQUE | required; member reference |
| surname | text |  |  |
| first_name | text |  |  |
| middle_name | text |  |  |
| date_of_birth | text |  |  |
| gender | text |  |  |
| civil_status | text |  |  |
| maiden_name | text |  |  |
| tin_number | text |  |  |
| citizenship | text |  |  |
| religion | text |  |  |
| height | bigint |  |  |
| blood_type | text |  |  |
| place_of_birth | text |  |  |
| contact_number | bigint |  | phone number |
| occupation | text |  |  |
| educational_attainment | text |  |  |
| position | text |  |  |
| number_of_dependents | bigint |  |  |
| spouse_name | text |  |  |
| spouse_occupation | text |  |  |
| spouse_date_of_birth | text |  |  |
| date_of_membership | text |  |  |
| BOD_resolution_number | text |  |  |
| number_of_shares | bigint |  |  |
| amount | bigint |  |  |
| initial_paid_up_capital | bigint |  |  |
| email | text |  | contact email |
| created_at | timestamptz |  |  |
| permanent_address | text |  |  |
| gsis_number | text |  |  |
| father_name | text |  |  |
| mother_name | text |  |  |
| income_source | text |  |  |
| employer_name | text |  |  |
| salary | text |  |  |
| annual_income | text |  |  |
| other_income | text |  |  |
| DependentCount | int |  |  |
| auth_user_id | uuid | FK |  |

### profiles
Generic user profile table (staff and members).

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK, FK |  |
| avatar_url | text |  |  |
| created_at | timestamptz |  |  |
| updated_at | timestamptz |  |  |

### kiosk_auth
PIN/credential store for kiosk-based member login.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK, FK |  |
| email | text | UNIQUE | required; contact email |
| pin | text |  | default: 0000 |
| created_at | timestamptz |  |  |
| is_temporary | bool |  | default: true |

### account_change_otp
One-time passwords for account change verification.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| auth_user_id | uuid |  | required |
| purpose | text |  | required |
| code_hash | text |  | required |
| payload | jsonb |  |  |
| expires_at | timestamptz |  | required |
| attempts | int |  | default: 0 |
| consumed | bool |  | default: false |
| created_at | timestamptz |  |  |

### legacy_member_link
Mapping of legacy member records to current member IDs.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| legacy_master_uuid | uuid | PK |  |
| member_id | uuid | FK | → member.id |
| marked_no_history | bool |  | default: false |
| confirmed_by | uuid |  |  |
| confirmed_at | timestamptz |  |  |
| notes | text |  |  |

### secretary_membership_records
Secretary-maintained membership registry entries.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| member_id | uuid | FK, UNIQUE | → member.id; required |
| membership_number | text |  |  |
| date_of_membership | text |  |  |
| bod_resolution_number | text |  |  |
| number_of_shares | numeric |  | default: 0 |
| amount | numeric |  | default: 0 |
| initial_paid_up_capital | numeric |  | default: 0 |
| termination_resolution_number | text |  |  |
| termination_date | text |  |  |
| created_at | timestamptz |  |  |
| updated_at | timestamptz |  |  |

### staff_termination_requests
Requests to terminate staff/member accounts.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | bigint | PK |  |
| member_id | text |  | required |
| member_account_id | uuid |  |  |
| previous_role | text |  |  |
| resolution_no | text |  |  |
| resolution_date | date |  |  |
| effective_date | date |  |  |
| reason | text |  |  |
| notes | text |  |  |
| status | text |  | default: awaiting_bod_confirmation; active / pending / terminated |
| requested_by | uuid |  |  |
| requested_by_role | text |  |  |
| requested_at | timestamptz |  |  |
| decided_by | uuid |  |  |
| decided_at | timestamptz |  |  |
| decision_notes | text |  |  |

### member_classification
Current MIGS/Non-MIGS classification per member.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| classification_id | uuid | PK |  |
| code | text | UNIQUE | required |
| description | text |  |  |
| created_at | timestamptz |  |  |

### member_classification_temporal
Historical classification changes over time.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| classification_id | uuid | PK |  |
| membership_number_id | uuid | FK, UNIQUE | → member.id; required; member reference |
| classification_level_id | uuid | FK | → classification_level.classification_level_id; required |
| accrual_date | date | UNIQUE | required |
| cbu_points | int |  | default: 0 |
| loan_points | int |  | default: 0 |
| savings_points | int |  | default: 0 |
| payment_points | int |  | default: 0 |
| grocery_points | int |  | default: 0 |
| pli_points | int |  | default: 0 |
| attendance_points | int |  | default: 0 |
| total_score | int |  |  |
| final_status | text |  |  |
| created_at | timestamptz |  |  |
| updated_at | timestamptz |  |  |

### classification_level
Lookup of classification tiers/levels.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| classification_level_id | uuid | PK |  |
| code | text | UNIQUE | required |
| label | text |  | required |
| min_score | int |  | required |
| max_score | int |  | required |
| created_at | timestamptz |  |  |

### stress_index_category
Lookup of repayment stress index categories.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| stress_index_category_id | uuid | PK |  |
| code | text | UNIQUE | required |
| label | text |  | required |
| created_at | timestamptz |  |  |

## Loans

### loans
Central loan record — one row per loan application, tracks lifecycle from application to repayment.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| control_number | varchar | PK | loan reference number |
| member_id | uuid | FK | → member.id |
| loan_type_id | bigint | FK | → loan_types.id; required |
| loan_amount | numeric |  | required |
| principal_amount | numeric |  | loan principal |
| interest_rate | numeric |  | annual interest rate |
| term | int |  |  |
| loan_status | text |  | default: pending; pending / approved / disbursed / paid / defaulted |
| application_date | timestamptz |  | date application submitted |
| disbursal_date | timestamptz |  |  |
| application_status | text |  |  |
| user_email | text |  |  |
| loan_amount_words | text |  |  |
| loan_purpose | text |  |  |
| monthly_amortization | numeric |  |  |
| source_of_income | text |  |  |
| payment_start_date | date |  |  |
| bonus_amount_numeric | numeric |  |  |
| bonus_amount_words | text |  |  |
| emergency_reason | text |  |  |
| emergency_notes | text |  |  |
| consolidated_notes | text |  |  |
| created_at | timestamptz |  |  |
| updated_at | timestamptz |  |  |
| application_type | text |  |  |
| net_proceeds | numeric |  |  |
| total_interest | numeric |  |  |
| service_fee | numeric |  |  |
| cbu_deduction | numeric |  |  |
| insurance_fee | numeric |  |  |
| notarial_fee | numeric |  |  |
| bookkeeper_internal_remarks | text |  |  |
| bookkeeper_reviewed_at | timestamptz |  |  |
| manager_review_requested_at | timestamptz |  |  |
| disbursement_confirmation | date |  |  |
| bookkeeper_reviewer_id | text |  |  |
| raw_payload | jsonb |  |  |
| latest_net_pay | bigint |  |  |
| last_emailed_status | text |  |  |
| share_capital | bigint |  |  |
| bod_approval_payload | jsonb |  |  |

### loan_types
Lookup of loan products (Consolidated, Bonus, Emergency, KOICA).

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | bigint | PK |  |
| code | text | UNIQUE | required |
| name | text | UNIQUE | required |
| InterestRate | numeric |  |  |
| interest_rate | numeric |  | annual interest rate |
| CLIMBS _Insurance | numeric |  |  |
| Service_Fee | numeric |  |  |
| Notarial_Fee | numeric |  |  |
| Unpaid_Interest | numeric |  |  |

### loan_schedules
Amortization schedule rows — one per installment per loan.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| loan_id | varchar | FK, UNIQUE | → loans.control_number; required |
| installment_no | int | UNIQUE | required |
| due_date | date |  | required; payment due date |
| expected_amount | numeric |  | required |
| principal_component | numeric |  | required |
| interest_component | numeric |  | required |
| schedule_status | text |  | default: Pending |
| created_at | timestamptz |  |  |
| schedule_id | text |  |  |
| expected_principal | numeric |  | default: 0 |
| expected_interest | numeric |  | default: 0 |
| penalty | numeric |  | default: 0 |
| salary_schedule_id | uuid |  |  |
| remaining_principal | numeric |  | default: 0 |

### loan_payments
Actual payments applied against loans.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| loan_id | varchar | FK | → loan_schedules.loan_id; required |
| schedule_id | uuid | FK | → loan_schedules.loan_id; required |
| transaction_id | uuid |  |  |
| amount_paid | numeric |  | required; payment amount |
| payment_date | timestamptz |  | date of payment |
| penalties | numeric |  | default: 0 |
| deficiency | numeric |  | default: 0 |
| created_at | timestamptz |  |  |
| payment_reference | text |  |  |
| transaction_reference | text |  |  |
| confirmation_status | text |  | default: pending_bookkeeper |
| confirmed_at | timestamptz |  |  |
| confirmed_by | uuid |  |  |
| validated_by | uuid |  |  |
| validation_notes | text |  |  |
| reviewed_at | timestamptz |  |  |
| reviewed_by | uuid |  |  |
| rejection_reason | text |  |  |
| entered_by_role | text |  | default: cashier |
| entered_by | uuid |  |  |

### loan_payments_legacy
Legacy — pre-migration data.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| payment_code | text |  |  |
| loan_id | varchar | FK | → loans.control_number; required |
| member_id | uuid | FK | → member.id; required |
| legacy_loan_uuid | uuid |  | required |
| legacy_member_uuid | uuid |  | required |
| amount_paid | numeric |  | required; payment amount |
| payment_date | date |  | required; date of payment |
| or_cdv_no | text |  |  |
| is_overpayment | bool |  | default: false |
| application_date | date |  | date application submitted |
| delta_days | int |  |  |
| is_advance_payer | bool |  | default: false |
| manual_note_overpayment | bool |  | default: false |
| raw_payload | jsonb |  |  |
| created_at | timestamptz |  |  |

### loan_payment_ledger
Detailed ledger breakdown (principal/interest/fees) per payment.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| payment_id | uuid | FK, UNIQUE | → loan_payments.id; required |
| loan_id | varchar | FK | → loans.control_number; required |
| schedule_id | uuid | FK | → loan_schedules.id; required |
| payment_reference | text |  |  |
| transaction_reference | text |  |  |
| amount_paid | numeric |  | required; payment amount |
| penalties | numeric |  | default: 0 |
| total_collected | numeric |  | required |
| posted_at | timestamptz |  |  |
| posted_by | uuid |  |  |
| notes | text |  |  |
| created_at | timestamptz |  |  |

### loan_calculator
Saved loan simulations produced by the loan calculator.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| calculator_id | uuid | PK |  |
| member_id | uuid | FK | → member.id; required |
| loan_id | varchar | FK | → loans.control_number |
| principal_amount | numeric |  | required; loan principal |
| net_proceeds | numeric |  | required |
| latest_net_pay | numeric |  | required |
| multiplier | numeric |  | required |
| monthly_amortization | numeric |  | required |
| stress_index | numeric |  |  |
| risk_category | text |  |  |
| is_eligible | bool |  |  |
| computed_at | timestamptz |  |  |
| created_at | timestamptz |  |  |

### loan_collateral
Collateral items pledged against loans.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| collateral_id | text | PK |  |
| loan_control_number | text | FK | → loans.control_number; required |
| collateral_type | text |  | required |
| description | text |  | required |
| declared_value | numeric |  | required |
| appraised_value | numeric |  |  |
| document_url | text |  |  |
| created_at | timestamptz |  |  |
| updated_at | timestamptz |  |  |

### loan_fee_policies
Configurable fee/insurance/interest policies per loan type.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| loan_type_code | text | UNIQUE | required |
| service_fee_mode | text |  | default: bracket |
| service_fee_per_bracket | numeric |  | default: 0 |
| service_fee_bracket_size | numeric |  | default: 50000 |
| cbu_rate | numeric |  | default: 0 |
| insurance_per_thousand | numeric |  | default: 0 |
| notarial_fee | numeric |  | default: 0 |
| effective_at | timestamptz |  |  |
| updated_at | timestamptz |  |  |
| updated_by | uuid |  |  |

### loan_email_log
Log of loan-related emails sent via Resend.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | bigint | PK |  |
| loan_id | text |  | required |
| stage | text |  | required |
| action | text |  | required |
| status_label | text |  |  |
| recipient_email | text |  |  |
| recipient_role | text |  |  |
| dedup_key | text |  | required |
| success | bool |  | default: false |
| provider_message_id | text |  |  |
| error_message | text |  |  |
| attempt_count | int |  | default: 1 |
| sent_at | timestamptz |  |  |
| created_by | uuid |  |  |

### loan_notifications
In-app notifications tied to loan lifecycle events.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | bigint | PK |  |
| recipient_role | text |  | required |
| recipient_user_id | uuid |  |  |
| title | text |  | required |
| message | text |  | required |
| notification_type | text |  | required |
| severity | text |  | default: info |
| loan_id | text |  |  |
| redirect_url | text |  |  |
| dedup_key | text |  |  |
| is_read | bool |  | default: false |
| read_at | timestamptz |  |  |
| read_by | uuid |  |  |
| created_at | timestamptz |  |  |
| created_by | uuid |  |  |
| recipient_member_id | text |  |  |

### co_makers
Co-makers / guarantors attached to loan applications.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| loan_id | varchar | FK | → loans.control_number; required |
| member_id | uuid | FK | → member.id |
| liability_status | text |  | default: active |
| date_signed | timestamptz |  |  |
| created_at | timestamptz |  |  |
| id | bigint | PK |  |
| co_maker_name | text |  |  |
| co_maker_email | text |  |  |
| co_maker_mobile | text |  |  |
| co_maker_address | text |  |  |
| co_maker_id_no | text |  |  |
| is_member | bool |  | default: false |

### disbursement_confirmations
Treasurer disbursement confirmation records.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| reference_number | text | UNIQUE | required |
| loan_id | text |  | required |
| member_id | text |  |  |
| member_name | text |  | required |
| loan_type | text |  |  |
| loan_amount | numeric |  | required |
| disbursed_at | timestamptz |  | required |
| first_due_date | date |  |  |
| cashier_id | text |  |  |
| cashier_name | text |  |  |
| loan_status | text |  | pending / approved / disbursed / paid / defaulted |
| created_at | timestamptz |  |  |

### koica_loans
KOICA loan product records for non-members.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | bigint | PK |  |
| control_number | text | UNIQUE | required; loan reference number |
| full_name | text |  |  |
| credentials | jsonb |  |  |
| user_email | text |  |  |
| loan_type_code | text |  |  |
| loan_amount | numeric |  |  |
| principal_amount | numeric |  | loan principal |
| interest_rate | numeric |  | annual interest rate |
| term | int |  |  |
| loan_status | text |  | default: pending; pending / approved / disbursed / paid / defaulted |
| application_status | text |  | default: pending |
| application_type | text |  | default: new |
| application_date | timestamptz |  | date application submitted |
| disbursal_date | timestamptz |  |  |
| raw_payload | jsonb |  |  |
| created_at | timestamptz |  |  |
| bookkeeper_internal_remarks | text |  |  |
| preliminary_risk_assessment | text |  |  |
| bookkeeper_reviewer_id | uuid |  |  |
| bookkeeper_reviewed_at | timestamptz |  |  |
| manager_review_requested_at | timestamptz |  |  |
| last_emailed_status | text |  |  |

### risk_assessments
Credit risk model outputs per loan application.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| loan_control_number | text | UNIQUE | required |
| member_id | uuid | FK | → member.id |
| risk_class | int |  | required |
| risk_probability | numeric |  | required |
| features_used | jsonb |  | required |
| model_version | text |  |  |
| scored_at | timestamptz |  |  |
| scored_by | uuid |  |  |
| notes | text |  |  |

### loans_member_id_backup_20260730
Backup snapshot from 2026-07-30.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| control_number | varchar |  | loan reference number |
| member_id | uuid |  |  |

## Savings & Share Capital

### Savings_Transactions
Member savings deposits and withdrawals.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| Savings_ID | varchar | PK |  |
| membership_number_id | varchar | FK | → personal_data_sheet.membership_number_id; member reference |
| created_at | timestamptz |  |  |
| Account_Number | text |  |  |
| Amount | bigint |  |  |
| Balance | bigint |  | remaining balance |
| Account_Name | text |  |  |
| Adult dependents | int |  |  |
| Child dependents | int |  |  |
| Nominee_Full_Name | text |  |  |
| Nominee_Relationship | text |  |  |
| Nominee Date of Birth | text |  |  |
| Nominee_Age | int |  |  |
| Nominee_Address | text |  |  |
| Savings_Amount | bigint |  |  |
| withdrawal_amount | bigint |  |  |

### savings_accounts
Savings account master per member.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| account_number | text | PK |  |
| account_name | text |  | required |
| member_id | uuid | FK | → member.id |
| account_kind | text |  | default: member |
| balance | numeric |  | default: 0; remaining balance |
| status | text |  | default: active; active / pending / terminated |
| notes | text |  |  |
| created_at | timestamptz |  |  |
| updated_at | timestamptz |  |  |
| legacy_savings_id | text |  |  |

### savings_ledger
Running ledger of savings account movements.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| account_number | text | FK | → savings_accounts.account_number; required |
| entry_type | text |  | required |
| amount | numeric |  | required |
| running_balance | numeric |  | required |
| reference | text |  |  |
| source | text |  | default: manual |
| remarks | text |  |  |
| posted_by | text |  |  |
| posted_at | timestamptz |  |  |

### savings_transaction_queue
Queue of pending savings transactions awaiting processing.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| transaction_id | text | UNIQUE | required |
| savings_id | text |  | required |
| membership_number_id | text |  | member reference |
| member_name | text |  |  |
| account_type | text |  | required |
| transaction_type | text |  | required |
| amount | numeric |  | required |
| transaction_status | text |  | default: pending_verification |
| entered_by_role | text |  | default: cashier |
| requested_at | timestamptz |  |  |
| verified_at | timestamptz |  |  |
| verified_by | text |  |  |
| posted_at | timestamptz |  |  |
| notes | text |  |  |
| account_number | text |  |  |

### capital_build_up
CBU contributions tracked per member.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| member_id | uuid | FK | → member.id |
| transaction_date | timestamptz |  |  |
| starting_share_capital | numeric |  | default: 0 |
| capital_added | numeric |  | default: 0 |
| deposit_account | text |  |  |
| ending_share_capital | numeric |  | default: 0 |
| cbu_deposit_id | text |  |  |
| source_payment_id | text | UNIQUE |  |
| source_loan_id | varchar | UNIQUE |  |

### membership_payments
Membership fee payments (initial and renewal).

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| payment_id | text | UNIQUE | required |
| application_id | text |  |  |
| member_id | uuid |  |  |
| membership_number_id | text |  | member reference |
| payment_type | text |  | required |
| amount | numeric |  | required |
| payment_status | text |  | default: paid |
| payment_method | text |  | default: cash |
| reference_number | text |  |  |
| processed_by | uuid |  |  |
| processed_by_name | text |  |  |
| payment_date | timestamptz |  | date of payment |
| notes | text |  |  |
| created_at | timestamptz |  |  |

### member_statement_of_account
Consolidated SOA snapshots per member.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| member_id | uuid |  |  |
| control_number | varchar |  | loan reference number |
| payment_id | uuid |  |  |
| payment_date | timestamptz |  | date of payment |
| reference_id | text |  |  |
| principal_paid | numeric |  |  |
| interest_paid | numeric |  |  |
| deficiency | numeric |  |  |
| penalty | numeric |  |  |
| total_amount_paid | numeric |  |  |
| outstanding_balance | numeric |  |  |
| confirmation_status | text |  |  |

### v_savings_balance_reconciliation
**View** (read-only) — savings balance reconciliation.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| account_number | text |  |  |
| account_name | text |  |  |
| legacy_savings_id | text |  |  |
| new_balance | numeric |  |  |
| legacy_balance | bigint |  |  |
| delta | numeric |  |  |

## Vault & Cash

### vault_entries
Vault cash movement entries (in/out).

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | bigint | PK |  |
| amount | numeric |  | required |
| change_type | text |  | required |
| note | text |  |  |
| reference_id | bigint |  |  |
| entered_by | uuid | FK |  |
| entered_at | timestamptz |  |  |

### vault_balance_v
**View** (read-only) — current vault balance.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| current_balance | numeric |  |  |
| last_updated_at | timestamptz |  |  |
| entry_count | bigint |  |  |

### ledger_transactions
General ledger transaction records.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | uuid | PK |  |
| transaction_id | text |  | required |
| ledger_source | text |  | required |
| source_id | text |  | required |
| membership_number_id | text |  | member reference |
| account_type | text |  |  |
| entry_type | text |  | required |
| amount | numeric |  | required |
| running_balance | numeric |  |  |
| posted_at | timestamptz |  |  |
| posted_by | text |  |  |
| remarks | text |  |  |

## POS / Grocery

### GROCERY_TRANSACTIONS
POS grocery purchase records charged to member accounts.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| GroceryID | text | PK |  |
| event_id | text | UNIQUE |  |
| membership_number_id | uuid | FK | → member.id; member reference |
| pos_member_ref | text |  |  |
| TransactionDate | timestamptz |  | required |
| GroceryAmount | numeric |  | required |
| Status | text |  | required; active / pending / terminated |
| balance_due | numeric |  | default: 0 |
| created_at | timestamptz |  |  |

### grocery_events
Raw POS webhook events from the grocery system.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | bigint | PK |  |
| event_id | text | UNIQUE | required |
| event_type | text |  | required |
| event_time | timestamptz |  | required |
| payload | jsonb |  | required |
| received_at | timestamptz |  |  |

### member_grocery_totals
Aggregated grocery balances per member.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| membership_number_id | uuid |  | member reference |
| total_grocery_amount | numeric |  |  |
| transaction_count | bigint |  |  |
| last_transaction_at | timestamptz |  |  |

## Attendance & Governance

### attendance_logs
Staff/member attendance records.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | bigint | PK |  |
| application_id | text | FK | → member_applications.application_id; required |
| training_stage | text |  | required |
| attendance_status | text |  | default: Pending |
| remarks | text |  |  |
| member_name | text |  |  |
| member_email | text |  |  |
| recorded_at | timestamptz |  |  |
| recorded_by | uuid |  |  |
| created_at | timestamptz |  |  |
| updated_at | timestamptz |  |  |
| attendance_id | uuid |  |  |
| membership_number_id | uuid | FK | → member.id; member reference |
| meeting_date | date |  |  |
| meeting_type | text |  |  |
| status | text |  | active / pending / terminated |
| is_locked | bool |  | default: false |

### general_assembly_attendance
Attendance records for general assembly meetings.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | bigint | PK |  |
| member_id | uuid | FK, UNIQUE | → member.id; required |
| meeting_date | date | UNIQUE | required |
| status | text |  | required; active / pending / terminated |
| remarks | text |  |  |
| recorded_by | uuid |  |  |
| recorded_at | timestamptz |  |  |
| updated_at | timestamptz |  |  |

## Audit

### audit_log
System-wide audit trail of member/loan modifications.

| Attribute | Data Type | Key | Notes |
|-----------|-----------|-----|-------|
| id | bigint | PK |  |
| occurred_at | timestamptz |  |  |
| actor_user_id | uuid |  |  |
| actor_role | text |  |  |
| actor_email | text |  |  |
| entity_type | text |  | required |
| entity_id | text |  | required |
| action | text |  | required |
| before | jsonb |  |  |
| after | jsonb |  |  |
| context | jsonb |  |  |
