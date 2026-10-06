# Graph Report - src  (2026-10-06)

## Corpus Check
- Large corpus: 402 files · ~605,652 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 2621 nodes · 7787 edges · 275 communities (115 shown, 160 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- FastAPI Core Imports
- Loan Computation & Penalties
- Audit & Approval Pages
- Bookkeeper Ledger & CBU UI
- BOD Approval & Accounts UI
- Cashier CBU Deposits
- Loan Eligibility Buckets
- Payment Processing
- Login & Password UI
- Risk Model Feature Contract
- Risk Feature Assembly
- Account Management API
- Membership Confirmation
- Loan Display Helpers
- BOD Dashboard & Reports
- Analytics Charts API
- Hardcoded Audit Findings
- ISC Distribution UI
- Session & Notifications
- SQL Policies & Indexes
- Treasurer & Cashier Payout API
- Smart Date Input
- Member Settings & Apply Loans
- JWT Auth Dependencies
- MIGS Engine
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 151
- Community 152
- Community 153
- Community 154
- Community 157
- Community 161
- Community 164

## God Nodes (most connected - your core abstractions)
1. `StaffSidebar()` - 132 edges
2. `useNotification()` - 130 edges
3. `StaffTopbar()` - 127 edges
4. `LoanNotificationBell()` - 118 edges
5. `UserAuth()` - 116 edges
6. `TableStateRow()` - 110 edges
7. `TableToolbar()` - 79 edges
8. `useRealtimeRefetch()` - 75 edges
9. `StatCard()` - 73 edges
10. `StatCardRow()` - 73 edges

## Surprising Connections (you probably didn't know these)
- `RoleModal()` --calls--> `useNotification()`  [EXTRACTED]
  BOD/Components/Account_Management.jsx → contex/NotificationContext.jsx
- `TerminateModal()` --calls--> `useConfirm()`  [EXTRACTED]
  BOD/Components/Account_Management.jsx → contex/ConfirmContext.jsx
- `TerminateModal()` --calls--> `useNotification()`  [EXTRACTED]
  BOD/Components/Account_Management.jsx → contex/NotificationContext.jsx
- `Account_Management()` --calls--> `NotificationBell()`  [EXTRACTED]
  BOD/Components/Account_Management.jsx → components/NotificationBell.jsx
- `Account_Management()` --calls--> `StaffSidebar()`  [EXTRACTED]
  BOD/Components/Account_Management.jsx → components/StaffSidebar/index.jsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Credit risk model documentation set** — analytics_risk_assesment_new_model_developer_handoff_doc, analytics_risk_assesment_feature_contract_doc, server_credit_risk_model_upgrade_todo_doc, analytics_risk_assesment_readme_doc [INFERRED 0.85]
- **ISC notes set** — isc_notes_frontend_brief_doc, isc_notes_isc_distribution_module_doc, isc_notes_readme_doc [EXTRACTED 1.00]
- **Thesis audit reports** — system_summary_files_hardcoded_audit_doc, system_summary_files_navigation_and_actions_audit_doc, system_summary_files_ui_consistency_audit_doc, system_summary_files_thesis_system_evaluation_doc [INFERRED 0.85]

## Communities (275 total, 160 thin omitted)

### Community 0 - "FastAPI Core Imports"
Cohesion: 0.03
Nodes (86): account_email_confirm(), account_email_request_otp(), account_onboarding_profile(), account_password_change_direct(), account_password_confirm(), account_password_request_otp(), account_password_send_code(), account_password_verify_and_set() (+78 more)

### Community 1 - "Loan Computation & Penalties"
Cohesion: 0.04
Nodes (69): accounts_terminate_member(), accrue_loan_penalties(), add_months(), allocate_payment(), _apply_cbu_loan_offset(), approve_bookkeeper_payment(), build_sequence_id(), build_single_schedule_row() (+61 more)

### Community 2 - "Audit & Approval Pages"
Cohesion: 0.10
Nodes (42): MemberApprovalDetails(), MOCK_TRANSACTIONS, CURRENCY_FORMAT, DATE_FORMAT, NO_RENEWALS, PAYMENT_COLUMNS, RENEWAL_COLUMNS, CLUSTER_ORDER (+34 more)

### Community 3 - "Bookkeeper Ledger & CBU UI"
Cohesion: 0.07
Nodes (83): Audit_Log(), Accounting(), Bookkeeper_Audit_Log(), AuditTrail(), Bookkeeper_CBU(), formatCurrency(), formatDate(), isSameMonth() (+75 more)

### Community 4 - "BOD Approval & Accounts UI"
Cohesion: 0.09
Nodes (51): STAFF_ROLES, STATUS_BADGE, BOD_Loan_Approval(), formatCurrency(), formatDate(), BOD_Manage_Member(), formatDisplayDate(), Member_Approvals() (+43 more)

### Community 5 - "Cashier CBU Deposits"
Cohesion: 0.03
Nodes (35): build_cbu_deposit_id(), CashierCBUDepositRequest, create_cashier_cbu_deposit(), dev_pos_simulator_members(), _favicon_noop(), get_bod_member_loan_summary(), get_bod_terminated_members(), get_bookkeeper_reports() (+27 more)

### Community 6 - "Loan Eligibility Buckets"
Cohesion: 0.05
Nodes (37): _blocked_bucket(), _bonus_open_for(), _bonus_window_open(), _bucket_from_loans(), build_bod_resolution_number(), cancel_renewal_override_request(), _clean_bucket(), _compute_all_buckets() (+29 more)

### Community 7 - "Payment Processing"
Cohesion: 0.08
Nodes (44): approvePayment(), fetchPendingPayments(), rejectPayment(), calculateAmortization(), calculatePenalty(), Cashier_Payments(), fetchLoans(), processPayment() (+36 more)

### Community 8 - "Login & Password UI"
Cohesion: 0.10
Nodes (35): LoginLoadingOverlay(), PasswordInput(), PasswordRequirements(), useTheme(), Login(), MemberLogin(), ResetPassword(), Sign_Up() (+27 more)

### Community 9 - "Risk Model Feature Contract"
Cohesion: 0.08
Nodes (39): Advance_Payment_Count, Income_Is_Missing / -999 sentinel, Random Forest 5-feature model, Stability_Score tiers, Repayment_Stress_Index, 21-feature contract, HasTimeDeposit replaces TotalDeposits, Risk Model v3.3 (HistGradientBoosting) (+31 more)

### Community 10 - "Risk Feature Assembly"
Cohesion: 0.09
Nodes (22): _as_date(), assemble_many(), assemble_one(), _chunked(), _closed_date(), _count_renewals(), fetch_member_context(), _interest_rate_for() (+14 more)

### Community 11 - "Account Management API"
Cohesion: 0.07
Nodes (25): _account_admin_count(), _account_by_auth_user(), _account_for_member(), AccountAdminFlagRequest, AccountRoleRequest, accounts_list_staff(), accounts_list_terminated(), accounts_me() (+17 more)

### Community 12 - "Membership Confirmation"
Cohesion: 0.17
Nodes (29): _application_is_eligible(), _build_default_password(), confirm_membership(), confirm_membership_batch(), create_member(), ensure_confirmer_is_bod(), _extract_user_id(), _generate_bod_resolution_number() (+21 more)

### Community 13 - "Loan Display Helpers"
Cohesion: 0.13
Nodes (35): formatCurrency(), formatShortDate(), isFullyPaidLoan(), isReleasedLoan(), memberStatusLabel(), RELEASED_STATUSES, statusKey(), toneStyles (+27 more)

### Community 14 - "BOD Dashboard & Reports"
Cohesion: 0.13
Nodes (26): Dashboard_BOD(), BRAND, CountTooltip(), CustomTooltip(), fmt(), fmtPdf(), generateExecutivePDF(), pct() (+18 more)

### Community 15 - "Analytics Charts API"
Cohesion: 0.06
Nodes (16): _compute_payment_charts(), _demand_live_loans(), _fetch_all_paginated(), _fetch_recent_activity(), _sort_key(), get_bookkeeper_dashboard_summary(), _sum_amount_paid_in_range(), get_loan_demand_actuals() (+8 more)

### Community 16 - "Hardcoded Audit Findings"
Cohesion: 0.13
Nodes (25): API_BASE_URL repeated in 45+ files, Hardcoded values audit, No ML bypasses, mocked endpoints, or secrets, Hardcoded localhost:5173 email links, Cashier_Payments MOCK_LOANS fallback (critical), PRINT-RECEIPT-OVERLAY TODOs, loanComputeApi sticky local fallback, LoanApprovalDetails shared approve/reject flow (+17 more)

### Community 17 - "ISC Distribution UI"
Cohesion: 0.15
Nodes (21): Bookkeeper_ISC(), CURRENT_YEAR, formatCurrency(), MONTH_NAMES, clampMonth(), clampYear(), CURRENT_YEAR, formatCurrency() (+13 more)

### Community 18 - "Session & Notifications"
Cohesion: 0.10
Nodes (17): ACTIVITY_EVENTS, IdleSessionWarning(), NotificationContainer(), Toast(), AuthContextProvider(), preloadMemberData(), ConfirmProvider(), MemberSettingsProvider() (+9 more)

### Community 19 - "SQL Policies & Indexes"
Cohesion: 0.13
Nodes (18): idx_member_classification_temporal_final_status, idx_member_classification_temporal_level, idx_member_classification_temporal_member_week, idx_member_profile_member_account, idx_member_profile_member_classification, idx_member_profile_member_id, idx_member_profile_stress_category, idx_member_profile_stress_index (+10 more)

### Community 20 - "Treasurer & Cashier Payout API"
Cohesion: 0.09
Nodes (15): _attach_audit_actor_names(), _audit_scope_to_role(), bod_returning_member_check(), cashier_list_cbu_payouts(), create_treasurer_vault_entry(), get_treasurer_vault_entries(), list_renewal_override_requests(), read_audit_log() (+7 more)

### Community 21 - "Smart Date Input"
Cohesion: 0.14
Nodes (21): clampDayToMonth(), computeMaxSelectableDate(), MONTH_LABELS, parseIsoToDate(), SmartDateInput(), toIsoFromMaskedDob(), toMaskedDob(), toMaskedFromIso() (+13 more)

### Community 22 - "Member Settings & Apply Loans"
Cohesion: 0.16
Nodes (20): MemberSettingsContext, useMemberSettings(), BONUS_APPLICATION_MONTHS, Member_ApplyLoans(), menuItems, selectorOptions, ALLOWED_TYPES, classifyType() (+12 more)

### Community 23 - "JWT Auth Dependencies"
Cohesion: 0.15
Nodes (11): _decode_asymmetric(), _decode_hs256(), _fetch_jwks(), get_current_user(), get_current_user_optional(), _get_jwt_secret(), _get_key_for_kid(), _get_url() (+3 more)

### Community 24 - "MIGS Engine"
Cohesion: 0.12
Nodes (13): get_migs_member_detail(), compute_migs_score(), CriterionResult, MigsResult, _progress(), result_to_dict(), score_attendance(), score_cbu_added() (+5 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (11): _compute_credit_risk_snapshot(), get_credit_risk_queue(), get_risk_model_info(), _persist_risk_scores(), band(), _load_model(), model_info(), model_version() (+3 more)

### Community 26 - "Community 26"
Cohesion: 0.28
Nodes (24): build_loan_pdf_response(), build_text_commands(), add_checkbox(), add_text(), add_wrapped_text(), co_maker(), render_bonus_fields(), render_co_maker_additional_info() (+16 more)

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (21): APPROVED_CHART_TABS, APPROVED_LOAN_TYPE_COLORS, APPROVED_LOAN_TYPE_LABELS, BOD_DASHBOARD_QUERY_KEY, CONSOL_BAND_COLORS, CONSOL_FILTERS, fetchBodDashboard(), formatCurrency() (+13 more)

### Community 28 - "Community 28"
Cohesion: 0.16
Nodes (19): formatCurrency(), formatDate(), formatLoanStatus(), ManageLoans(), Detail(), effectiveStatus(), formatDate(), formatDateTime() (+11 more)

### Community 29 - "Community 29"
Cohesion: 0.13
Nodes (7): lookup_stability_score(), main(), normalize_occupation(), prepare_features(), score_application(), summarize(), order()

### Community 30 - "Community 30"
Cohesion: 0.16
Nodes (20): ACTION_STYLES, ACTIVITY_NOUN, ACTIVITY_VERB, ActorCell(), auditAmount(), auditAuthHeaders(), AuditLogViewer(), buildAuditQuery() (+12 more)

### Community 31 - "Community 31"
Cohesion: 0.18
Nodes (16): LoanDeductionsCard(), peso(), ROWS, getMigsBadgeClasses(), useMigsLabel(), CustomCheckbox(), EMPTY_CO_MAKERS, LoanApprovalDetails() (+8 more)

### Community 32 - "Community 32"
Cohesion: 0.16
Nodes (10): _bands(), DemandModelNotAvailableError, fitted(), forecast(), get_forecast_payload(), historical(), _isofmt(), _load_model() (+2 more)

### Community 33 - "Community 33"
Cohesion: 0.19
Nodes (16): ACTIVITY_TYPE_META, BOOKKEEPER_DASHBOARD_QUERY_KEY, Dashboard(), fetchBookkeeperDashboard(), fetchShareCapitalFallback(), formatPeso(), formatPesoCompact(), BAR_HEIGHTS (+8 more)

### Community 34 - "Community 34"
Cohesion: 0.23
Nodes (16): MobileFormStepper(), Bonus_Loan(), numberToWords(), Consolidated_Loan(), CONSOLIDATED_LOAN_AMOUNT_OPTIONS, formatLoanAmountOption(), generateControlNumber(), numberToWords() (+8 more)

### Community 35 - "Community 35"
Cohesion: 0.19
Nodes (12): cohort_medians(), _occlusion_contributions(), score(), score_many(), approx(), check(), main(), validate_against_csv() (+4 more)

### Community 36 - "Community 36"
Cohesion: 0.21
Nodes (13): DOCUMENTS, initialStatus, sanitizeFilename(), SupportingDocumentsUpload(), supabase, resolveRole(), ACCOUNT_TABLES, normalizeEmail() (+5 more)

### Community 37 - "Community 37"
Cohesion: 0.17
Nodes (18): AmountCell(), AmountCellProps, at(), ComputedMemberRow, cx(), ISCDistributionModule(), ISCDistributionModuleProps, MemberLedgerRow (+10 more)

### Community 38 - "Community 38"
Cohesion: 0.20
Nodes (15): Payout is cash unless elected at GA, Fixed Jan-Dec period (no picker), Interest on Share Capital (ISC), Posting deferred, isc_calculate_preview RPC, Read-only ledger grid, Average share capital (AMSC), CRJ and CDJ books (+7 more)

### Community 39 - "Community 39"
Cohesion: 0.21
Nodes (15): addMonths(), buildMonthlyBreakdown(), computeLoan(), computeLoanLocally(), computeServiceFee(), DEFAULT_INTEREST_RATES, extractInterestRate(), FEE_POLICY_FALLBACKS (+7 more)

### Community 40 - "Community 40"
Cohesion: 0.22
Nodes (17): dispatchBookkeeperNewLoanNotification(), dispatchMemberSubmittedNotification(), getCurrentUser(), getCurrentUserIfAny(), getLoanTypeId(), getMemberIdForUser(), getOptionalMemberIdForUser(), LOAN_TYPE_NAME_VARIANTS (+9 more)

### Community 41 - "Community 41"
Cohesion: 0.27
Nodes (13): MemberDashboard(), formatCurrency(), formatDate(), Member_Savings(), MemberDashboardLoading(), getOrFetch(), invalidate(), peek() (+5 more)

### Community 42 - "Community 42"
Cohesion: 0.17
Nodes (11): attendance_logs_app_stage_uidx, attendance_logs_attendance_uidx, attendance_logs_meeting_date_idx, attendance_logs_meeting_type_idx, attendance_logs_membership_number_idx, attendance_logs_recorded_at_idx, attendance_logs_status_v2_idx, attendance_logs_training_stage_idx (+3 more)

### Community 43 - "Community 43"
Cohesion: 0.15
Nodes (9): dispatch_loan_email(), dispatch_loan_in_app_notification(), dispatch_member_notification(), _fan_out_member_notification(), LoanInAppNotificationRequest, LoanMemberNotificationRequest, LoanStatusEmailRequest, _resolve_loan_member_meta() (+1 more)

### Community 44 - "Community 44"
Cohesion: 0.21
Nodes (7): _hash_code(), issue_otp(), _now(), OtpIssueResult, OtpVerifyResult, _parse_ts(), verify_otp()

### Community 45 - "Community 45"
Cohesion: 0.21
Nodes (12): idx_loan_payment_ledger_loan_id, idx_loan_payment_ledger_posted_at, idx_loan_payment_ledger_schedule_id, idx_loan_payments_confirmation_status, idx_loan_payments_loan_id, idx_loan_payments_payment_date, idx_loan_payments_schedule_id, idx_loan_payments_transaction_id (+4 more)

### Community 46 - "Community 46"
Cohesion: 0.21
Nodes (10): _dedup_already_succeeded(), _dedup_key(), dispatch_loan_status_email(), DispatchResult, _fetch_loan_with_member(), _member_opted_out(), _normalize_loan_row(), _safe() (+2 more)

### Community 47 - "Community 47"
Cohesion: 0.28
Nodes (8): _color_for(), _format_amount(), LoanEmailContext, member_email_subject(), render_member_email(), render_next_approver_email(), _resolve_status_label(), status_label_for()

### Community 48 - "Community 48"
Cohesion: 0.24
Nodes (13): FIELD_VISIBILITY, formatNumber(), Loan_Policies(), LOAN_TYPE_TABS, BOD_Manage_Loans(), formatCurrency(), formatDisplayDate(), formatStatusTone() (+5 more)

### Community 49 - "Community 49"
Cohesion: 0.22
Nodes (12): formatCurrency(), formatDateTime(), getKindStyle(), getStatusStyle(), Savings_Details(), useSavingsAccount(), formatCurrency(), formatDate() (+4 more)

### Community 50 - "Community 50"
Cohesion: 0.14
Nodes (5): public.stamp_loan_fee_policy_actor(), trg_audit_loans, trg_audit_member_account, trg_audit_staff_termination, trg_stamp_loan_fee_policies_actor

### Community 51 - "Community 51"
Cohesion: 0.20
Nodes (7): is_valid_email(), normalize_recipients(), _resend_api_key(), _resend_from_email(), sanitize_text(), send_email(), SendResult

### Community 52 - "Community 52"
Cohesion: 0.25
Nodes (4): build_monthly_series(), fit_and_save(), load_bonus_rows(), main()

### Community 53 - "Community 53"
Cohesion: 0.24
Nodes (11): BookkeeperCreditRisk(), BAND_STYLES, CreditRiskPage(), FEATURE_LABELS, featureLabel(), formatDate(), formatPct(), formatPeso() (+3 more)

### Community 54 - "Community 54"
Cohesion: 0.22
Nodes (12): formatCurrency(), formatDate(), getStatusStyle(), LoanLedger(), PaymentRow, toPaymentRow(), Cashier_Savings(), formatCurrency() (+4 more)

### Community 55 - "Community 55"
Cohesion: 0.35
Nodes (9): PosSimulator(), Add_Savings(), formatCurrency(), Koica_Forms(), Savings_Forms(), PHP(), UpdateBalanceModal(), formatWithCommas() (+1 more)

### Community 56 - "Community 56"
Cohesion: 0.26
Nodes (11): idx_loan_payments_confirmation_status, idx_loan_payments_loan_id, idx_loan_payments_payment_date, idx_loan_payments_schedule_id, idx_loan_schedules_due_date, idx_loan_schedules_loan_id, idx_loan_schedules_one_active_due_per_loan, idx_loan_schedules_status (+3 more)

### Community 58 - "Community 58"
Cohesion: 0.29
Nodes (12): Account_Management(), api(), formatDate(), MemberPicker(), Modal(), peso(), roleLabel(), RoleModal() (+4 more)

### Community 59 - "Community 59"
Cohesion: 0.15
Nodes (6): _classify_agency(), _ensure_salary_cycles_seeded(), _expected_payroll_date(), get_late_payments_for_cycle(), get_salary_schedule(), _last_working_day_on_or_before()

### Community 60 - "Community 60"
Cohesion: 0.24
Nodes (12): applyMemberStatus(), applyRenewalOverrides(), BONUS_APPLICATION_MONTHS, buildBlockedBucket(), buildCleanBucket(), fabricateEligibility(), formatOverrideDate(), LEAVING_REASON (+4 more)

### Community 61 - "Community 61"
Cohesion: 0.19
Nodes (6): capital_build_up_source_isc_id_uk, idx_capital_build_up_member_txndate, idx_isc_postings_status, idx_isc_transactions_member, public.isc_calculate_preview(), public.isc_postings

### Community 62 - "Community 62"
Cohesion: 0.29
Nodes (11): buildSeries(), DiamondDot(), LOAN_TYPES, LoanDemandForecastCard(), MONTH_LABELS, monthKey(), monthsFromTodayNeeded(), periodsForView() (+3 more)

### Community 63 - "Community 63"
Cohesion: 0.23
Nodes (5): public.capital_build_up, public.cleanup_membership_related_data_on_auth_delete(), public.is_cbu_staff(), public.is_membership_staff(), trg_cleanup_membership_data_on_auth_delete

### Community 64 - "Community 64"
Cohesion: 0.26
Nodes (11): BONUS_AMOUNT_QUICK_PICKS, computeBonusSchedule(), computeEmergencySchedule(), CONFIRMED_PAYMENT_STATUSES, CONSOLIDATED_AMOUNT_QUICK_PICKS, EMERGENCY_AMOUNT_QUICK_PICKS, formatPHP(), formatPHPCompact() (+3 more)

### Community 65 - "Community 65"
Cohesion: 0.18
Nodes (6): bod_loan_decision(), BodLoanDecisionRequest, BonusLoanComputeRequest, ConsolidatedLoanComputeRequest, EmergencyLoanComputeRequest, LoanComputeBaseRequest

### Community 66 - "Community 66"
Cohesion: 0.29
Nodes (6): _build_message(), create_loan_notification(), _dedup_key(), NotificationResult, _redirect_url(), _safe()

### Community 67 - "Community 67"
Cohesion: 0.35
Nodes (10): buildStaffPrintPayload(), fetchBorrowerProfile(), firstValue(), normalizeCoMakersForPrint(), numberToWords(), PDF_PAYLOAD_FIELDS, printLoanApplicationForm(), resolvePrintKind() (+2 more)

### Community 68 - "Community 68"
Cohesion: 0.35
Nodes (10): dateInputValue(), displayDate(), fieldKeysFromSections(), getVisibleSections(), isFieldFilled(), isSingleCivilStatus(), Members_Profile(), normalizeFormValue() (+2 more)

### Community 69 - "Community 69"
Cohesion: 0.29
Nodes (7): public.is_vault_reader(), public.is_vault_writer(), public.vault_balance_v, public.vault_entries, vault_entries_change_type_idx, vault_entries_entered_at_idx, vault_entries_reference_idx

### Community 70 - "Community 70"
Cohesion: 0.22
Nodes (3): _json_decode_handler(), _MaxBodySizeMiddleware, _validation_exception_handler()

### Community 71 - "Community 71"
Cohesion: 0.36
Nodes (8): DocumentTitleSync(), ROLE_TITLES, formatRole(), normalizeRole(), PortalSidebarIdentity(), PortalTopbarIdentity(), ROLE_LABELS, usePortalIdentity()

### Community 72 - "Community 72"
Cohesion: 0.33
Nodes (4): _action_label(), _render_html(), send_otp_email(), _subject()

### Community 73 - "Community 73"
Cohesion: 0.38
Nodes (8): idx_savings_accounts_kind, idx_savings_accounts_member_id, idx_savings_ledger_account_number, idx_savings_ledger_posted_at, public.fn_savings_ledger_apply(), public.savings_accounts, public.savings_ledger, trg_savings_ledger_apply

### Community 74 - "Community 74"
Cohesion: 0.25
Nodes (5): backfill_cbu_initial_capital(), backfill_member_auth(), _require_service_role(), _resolve_member_email(), _resolve_member_last_name()

### Community 75 - "Community 75"
Cohesion: 0.42
Nodes (8): audit_log table, loans table, member table, POS / Grocery tables, risk_assessments table, Savings & Share Capital tables, Supabase schema (49 tables), Vault & Cash tables

### Community 76 - "Community 76"
Cohesion: 0.50
Nodes (7): AboutImageCarousel(), App(), Button(), IconListItem(), Reveal(), StatCard(), StatsMarquee()

### Community 77 - "Community 77"
Cohesion: 0.61
Nodes (7): api(), Cashier_CBU_Exit_Payout(), esc(), formatDate(), PayoutModal(), peso(), printReceipt()

### Community 78 - "Community 78"
Cohesion: 0.46
Nodes (6): currentPath(), isMemberRoute(), PwaInstallGate(), isIos(), isStandalone(), PwaInstallPrompt()

### Community 79 - "Community 79"
Cohesion: 0.29
Nodes (3): public.resolve_member_id_for_application(), public.sync_cbu_from_membership_payment(), trg_sync_cbu_from_membership_payment

### Community 80 - "Community 80"
Cohesion: 0.32
Nodes (4): member_closures_name_dob_idx, public.cleanup_membership_related_data_on_auth_delete(), public.member_closures, trg_cleanup_membership_data_on_auth_delete

### Community 82 - "Community 82"
Cohesion: 0.39
Nodes (5): idx_audit_log_action, idx_audit_log_actor, idx_audit_log_entity, idx_audit_log_occurred_at, public.audit_log

### Community 83 - "Community 83"
Cohesion: 0.36
Nodes (4): capital_build_up_cbu_deposit_id_uk, public.is_cbu_staff(), public.set_cbu_deposit_id(), trg_set_cbu_deposit_id

### Community 84 - "Community 84"
Cohesion: 0.39
Nodes (5): idx_loan_calculator_computed_at, idx_loan_calculator_is_eligible, idx_loan_calculator_loan_id, idx_loan_calculator_member_id, public.loan_calculator

### Community 85 - "Community 85"
Cohesion: 0.32
Nodes (3): idx_loan_penalties_loan_id, idx_loan_penalties_unpaid, public.loan_penalties

### Community 86 - "Community 86"
Cohesion: 0.29
Nodes (5): _classify_migs(), _compute_disbursement_rank(), get_treasurer_priority_queue(), get_treasurer_released_loans(), _normalize_disbursement_loan_type()

### Community 87 - "Community 87"
Cohesion: 0.43
Nodes (7): idx_ledger_transactions_posted_at, idx_ledger_transactions_transaction_id, idx_savings_transaction_queue_requested_at, idx_savings_transaction_queue_savings_id, idx_savings_transaction_queue_status, public.ledger_transactions, public.savings_transaction_queue

### Community 88 - "Community 88"
Cohesion: 0.38
Nodes (6): RealtimeSync(), ALL_ENTITIES, emitEntitiesChanged(), queryMatchesEntities(), REALTIME_EVENT, REALTIME_TOPIC

### Community 89 - "Community 89"
Cohesion: 0.48
Nodes (6): ALLOWED_PREFIXES, currentPath(), isAllowed(), isStandalone(), redirectToLogin(), StandaloneMemberOnlyGuard()

### Community 90 - "Community 90"
Cohesion: 0.48
Nodes (6): CONSOLIDATED_LOAN_AMOUNT_OPTIONS, Consolidated_Up(), formatLoanAmountOption(), generateControlNumber(), numberToWords(), buildConsolidatedPayload()

### Community 91 - "Community 91"
Cohesion: 0.52
Nodes (6): formatCurrency(), formatDateTime(), getKindStyle(), getStatusStyle(), Manager_Savings_Details(), useSavingsAccount()

### Community 92 - "Community 92"
Cohesion: 0.29
Nodes (4): LoanRestructureRequest, restructure_loan_term(), RestructureRequestAction, review_restructure_request()

### Community 95 - "Community 95"
Cohesion: 0.33
Nodes (3): idx_savings_transaction_queue_account_number, public.v_savings_balance_reconciliation, uq_savings_accounts_legacy_savings_id

### Community 96 - "Community 96"
Cohesion: 0.29
Nodes (7): bodGuarded(), bookkeeperGuarded(), cashierGuarded(), managerGuarded(), secretaryGuarded(), treasurerGuarded(), RequireRole()

### Community 97 - "Community 97"
Cohesion: 0.38
Nodes (4): cbu_payouts_membership_idx, cbu_payouts_reference_uk, public.cbu_payouts, trg_block_loans_for_exiting_members

### Community 98 - "Community 98"
Cohesion: 0.43
Nodes (4): general_assembly_attendance_date_idx, general_assembly_attendance_member_idx, general_assembly_attendance_status_idx, public.general_assembly_attendance

### Community 99 - "Community 99"
Cohesion: 0.52
Nodes (6): idx_renewal_override_member, idx_renewal_override_status_created, public.loan_renewal_override_requests, public._set_renewal_override_updated_at(), trg_renewal_override_updated_at, uq_renewal_override_one_pending

### Community 100 - "Community 100"
Cohesion: 0.52
Nodes (6): idx_salary_schedule_agency, idx_salary_schedule_expected, idx_salary_schedule_release, salary_schedule, salary_schedule_delay_stats_v, salary_schedule_logged_v

### Community 101 - "Community 101"
Cohesion: 0.53
Nodes (4): formatDate(), peso(), ReadOnlyField(), Record_Details()

### Community 103 - "Community 103"
Cohesion: 0.40
Nodes (3): idx_co_makers_loan_member_idx, idx_koica_loans_user_email, public.koica_loans

### Community 106 - "Community 106"
Cohesion: 0.53
Nodes (4): grocery_tx_date_idx, grocery_tx_member_idx, public."GROCERY_TRANSACTIONS", public.member_grocery_totals

### Community 107 - "Community 107"
Cohesion: 0.40
Nodes (3): capital_build_up_member_date_idx, capital_build_up_source_backfill_id_key, isc_transactions_settlement_idx

### Community 108 - "Community 108"
Cohesion: 0.47
Nodes (4): idx_loan_fee_policies_loan_type_code, public.get_cbu_rate_for_loan_type(), public.is_bod_account(), public.loan_fee_policies

### Community 109 - "Community 109"
Cohesion: 0.60
Nodes (5): loan_notifications_dedup_unread_uniq, loan_notifications_loan_idx, loan_notifications_member_unread_idx, loan_notifications_role_unread_idx, public.loan_notifications

### Community 110 - "Community 110"
Cohesion: 0.33
Nodes (3): list_migs_members(), _load_outside_loan_declarations(), recompute_all_migs()

### Community 111 - "Community 111"
Cohesion: 0.40
Nodes (3): member_account_auth_user_id_uk, member_account_one_member_login, _staff_links

### Community 113 - "Community 113"
Cohesion: 0.40
Nodes (3): public.recompute_member_shares(), public.trg_sync_member_shares_from_cbu(), trg_capital_build_up_sync_member_shares

### Community 114 - "Community 114"
Cohesion: 0.40
Nodes (4): CBU_INITIAL_TRANSACTIONS, CBU_MEMBERS, SHARE_VALUE, STARTING_CAPITAL

### Community 123 - "Community 123"
Cohesion: 0.70
Nodes (4): loan_email_log_dedup_idx, loan_email_log_dedup_success_uniq, loan_email_log_loan_id_idx, public.loan_email_log

### Community 125 - "Community 125"
Cohesion: 0.70
Nodes (4): idx_restructure_requests_loan_status, loan_restructure_requests, _set_restructure_updated_at(), trg_restructure_updated_at

### Community 127 - "Community 127"
Cohesion: 0.60
Nodes (3): public.profiles, public.touch_profiles_updated_at(), trg_touch_profiles_updated_at

### Community 128 - "Community 128"
Cohesion: 0.70
Nodes (4): Auditability and retention, Transition to recommended for approval, Bookkeeper internal remarks, Bookkeeper / Manager / Compliance roles

### Community 129 - "Community 129"
Cohesion: 0.50
Nodes (3): _lifespan(), _warm_jwks(), _warm_manage_loans_sync()

### Community 131 - "Community 131"
Cohesion: 0.83
Nodes (3): idx_account_change_otp_expires_at, idx_account_change_otp_lookup, public.account_change_otp

### Community 134 - "Community 134"
Cohesion: 0.83
Nodes (3): idx_disbursement_confirmations_disbursed_at, idx_disbursement_confirmations_loan_id, public.disbursement_confirmations

### Community 145 - "Community 145"
Cohesion: 0.83
Nodes (3): idx_staff_termination_requests_member, idx_staff_termination_requests_status, public.staff_termination_requests

## Knowledge Gaps
- **140 isolated node(s):** `STAFF_ROLES`, `STATUS_BADGE`, `APPROVED_LOAN_TYPE_LABELS`, `APPROVED_LOAN_TYPE_COLORS`, `CONSOL_BAND_COLORS` (+135 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 772 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **160 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `Community 36` to `Audit & Approval Pages`, `Bookkeeper Ledger & CBU UI`, `BOD Approval & Accounts UI`, `Payment Processing`, `Login & Password UI`, `Loan Display Helpers`, `BOD Dashboard & Reports`, `ISC Distribution UI`, `Session & Notifications`, `Smart Date Input`, `Member Settings & Apply Loans`, `Community 27`, `Community 30`, `Community 31`, `Community 33`, `Community 34`, `Community 39`, `Community 40`, `Community 41`, `Community 48`, `Community 55`, `Community 58`, `Community 60`, `Community 64`, `Community 67`, `Community 68`, `Community 77`, `Community 88`, `Community 90`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `STAFF_ROLES`, `STATUS_BADGE`, `APPROVED_LOAN_TYPE_LABELS` to the rest of the system?**
  _140 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `FastAPI Core Imports` be split into smaller, more focused modules?**
  _Cohesion score 0.02863460475400774 - nodes in this community are weakly interconnected._
- **Why does `useNotification()` connect `Bookkeeper Ledger & CBU UI` to `Audit & Approval Pages`, `BOD Approval & Accounts UI`, `Payment Processing`, `Login & Password UI`, `BOD Dashboard & Reports`, `ISC Distribution UI`, `Session & Notifications`, `Smart Date Input`, `Member Settings & Apply Loans`, `Community 27`, `Community 28`, `Community 31`, `Community 34`, `Community 41`, `Community 49`, `Community 54`, `Community 55`, `Community 58`, `Community 68`, `Community 77`, `Community 90`, `Community 91`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Should `Loan Computation & Penalties` be split into smaller, more focused modules?**
  _Cohesion score 0.04222914503288335 - nodes in this community are weakly interconnected._
- **Why does `TableStateRow()` connect `BOD Approval & Accounts UI` to `Audit & Approval Pages`, `Bookkeeper Ledger & CBU UI`, `Payment Processing`, `Loan Display Helpers`, `BOD Dashboard & Reports`, `ISC Distribution UI`, `Member Settings & Apply Loans`, `Community 27`, `Community 28`, `Community 30`, `Community 41`, `Community 48`, `Community 49`, `Community 53`, `Community 54`, `Community 55`, `Community 58`, `Community 77`, `Community 91`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Should `Audit & Approval Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.10347505338769171 - nodes in this community are weakly interconnected._