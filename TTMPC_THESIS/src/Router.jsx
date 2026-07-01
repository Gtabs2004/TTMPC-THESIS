import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Bonus_Loan from "./LOANFORMS/Bonus_Loan";
import Consolidated_Loan from "./LOANFORMS/Consolidated_Loan";
import Emergency_Loan from "./LOANFORMS/Emergency_Loan";
import Sign_Up from "./Index_Pages/sign_up";
import MemberLogin from "./Index_Pages/memberlogin";
import Login from "./Index_Pages/login";
import Dashboard from "./Bookkeeper/Components/bookkeeperDashboard";
import Records from "./Bookkeeper/Components/Member-Records";
import BookkeeperAccounting from "./Bookkeeper/Components/Accounting";
import AuditTrail from "./Bookkeeper/Components/Audit-Trail";
import LegacyMemberLink from "./Bookkeeper/Components/Legacy-Member-Link";
import LoanApplication from "./Bookkeeper/Components/Loan-Application";
import MIGS from "./Bookkeeper/Components/MIGS";
import BookkeeperPayments from "./Bookkeeper/Components/Payments";
import BookkeeperSavingsTransactions from "./Bookkeeper/Components/Savings-Transactions";
import BookkeeperSavingsAccounts from "./Bookkeeper/Components/Bookkeeper_Savings_Accounts";
import Reports from "./Bookkeeper/Components/Reports";
import BookkeeperLoanApproval from "./Bookkeeper/Components/Loan-Approval";
import LoanLedger from "./Bookkeeper/Components/Loan-Ledger";
import Loan_Kiosk from "./Index_Pages/loan_kiosk";
import Verification from "./Index_Pages/verification";
import Member_Services from "./Index_Pages/member_services";
import Non_Member from "./Index_Pages/non_member";
import Manage_Loans from "./Bookkeeper/Components/Manage-Loans";
import Member_Details from "./Bookkeeper/Components/member_details";
import Membership_Form from "./LOANFORMS/Membership_Form";
import Dashboard_BOD from "./BOD/Components/B-Dashboard";
import Member_Approvals from "./BOD/Components/Member-Approvals";
import MemberApprovalDetails from "./BOD/Components/MemberApprovalDetails";
import Termination_Inbox from "./BOD/Components/Termination_Inbox";
import BOD_Loan_Approval from "./BOD/Components/BOD_Loan_Approval";
import BOD_Audit_Log from "./BOD/Components/Audit_Log";
import Manager_Audit_Log from "./Manager/Components/Audit_Log";
import Treasurer_Audit_Log from "./Treasurer/Components/Audit_Log";
import Cashier_Audit_Log from "./Cashier/Components/Audit_Log";
import M_Dashboard from "./Manager/Components/M-Dashboard";
import Loan_Approval from "./Manager/Components/loan-approval";
import Manager_Reports from "./Manager/Components/Manager_Reports";
import Role_Selection from "./Index_Pages/role_selection";
import LoanApprovalDetails from "./Manager/Components/LoanApprovalDetails";
import Member_Dashboard from "./Member/Components/Member_Dashboard";
import Member_Loans from "./Member/Components/Member_Loans";
import Member_ApplyLoans from "./Member/Components/Member_ApplyLoans";
import Members_Profile from "./Member/Components/Members_Profile";
import ChangeEmail from "./Member/Components/ChangeEmail";
import MemberOnboardingGuard from "./Member/Components/MemberOnboardingGuard";

// Helper to wrap a member-portal element with the onboarding guard so that
// members with is_email_dummy or is_temporary are forced through setup
// before they can use the rest of the app.
const memberGuarded = (el) => <MemberOnboardingGuard>{el}</MemberOnboardingGuard>;
import Member_Savings from "./Member/Components/Member_Savings";
import Member_Lifecycle from "./Member/Components/Member_Lifecycle";
import Member_StatementOfAccount from "./Member/Components/Member_StatementOfAccount";
import Koica_Forms from "./LOANFORMS/Koica_Forms";
import Loan_Services from "./Index_Pages/loan_services";
import Savings_Services from "./Index_Pages/savings_services";
import RegularSavings_Services from "./Index_Pages/regularsavings_services";
import Withdrawal from "./Index_Pages/withdrawal";
import Withdrawal_Success from "./Index_Pages/withdrawal_success";
import Deposit from "./Index_Pages/deposit";
import Deposit_Success from "./Index_Pages/deposit_success";
import Treasurer_Dashboard from "./Treasurer/Components/Treasurer_Dashboard";
import TreasurerAccounting from "./Treasurer/Components/Accounting";
import Disbursement from "./Treasurer/Components/Disbursement";
import TreasurerPayments from "./Treasurer/Components/Treasurer_Payments";
import Schedule from "./Treasurer/Components/Schedule";
import Cashier_Dashboard from "./Cashier/Components/Cashier_Dashboard";
import Cashier_Savings from "./Cashier/Components/Cashier_Savings";
import Savings_Details from "./Cashier/Components/Savings_Details";
import Add_Savings from "./Cashier/Components/Add_Savings";
import Secretary_Attendance from "./BOD/Components/Secretary_Attendance";
import Secretary_General_Assembly from "./BOD/Components/Secretary_General_Assembly";
import Secretary_Records from "./BOD/Components/Secretary_Records";
import Record_Details from "./BOD/Components/Record_Details";
import BOD_Manage_Member from "./BOD/Components/Manage-Member";
import Treasurer_Approval from "./Treasurer/Components/Treasurer_Approval";
import Treasurer_ApprovalDetails from "./Treasurer/Components/Treasurer_ApprovalDetails";
import Cashier_CBU from "./Cashier/Components/Cashier_CBU";
import Cashier_CBU_Deposit from "./Cashier/Components/Cashier_CBU_Deposit";
import Cashier_Withdrawals from "./Cashier/Components/Cashier_Withdrawals";
import Cashier_Payments from "./Cashier/Components/Cashier_Payments";
import Cashier_Disbursement from "./Cashier/Components/Cashier_Disbursement";
import Cashier_MembershipPayments from "./Cashier/Components/Cashier_MembershipPayments";
import Manage_Member from "./Bookkeeper/Components/Manage-Member";
import Manager_Manage_Member from "./Manager/Components/Manage-Member";
import Savings_Forms from "./LOANFORMS/Savings_Forms";
import Grocery from "./Bookkeeper/Components/Grocery";
import PosSimulator from "./Bookkeeper/Components/PosSimulator";
import Grocery_Ledger from "./Bookkeeper/Components/Grocery-Ledger";
import Cashier_Grocery from "./Cashier/Components/Cashier_Grocery";
import BOD_Manage_Loans from "./BOD/Components/Manage-Loans";
import BOD_Loan_Policies from "./BOD/Components/Loan-Policies";
import MIGSDetails from "./Bookkeeper/Components/MIGS-Details";
import Conso_Choice from "./Index_Pages/conso_choice";
import Consolidated_Up from"./LOANFORMS/Consolidated_Up";





export const router = createBrowserRouter([
    {path: "/", element: <App/>},
    {path: "/Bonus_Loan", element: <Bonus_Loan/>},
    {path: "/Consolidated_Loan", element: <Consolidated_Loan/>},
    {path: "/Emergency_Loan", element: <Emergency_Loan/>},
    {path: "/Sign_Up", element: <Sign_Up/>},
    {path: "/Login", element: <Login/>},
    {path: "/dashboard", element: <Dashboard/>},
    {path: "/records", element: <Records/>},
    {path: "/accounting", element: <BookkeeperAccounting/>},
    {path: "/audit-trail", element: <AuditTrail/>},
    {path: "/legacy-member-validation", element: <LegacyMemberLink/>},
    {path: "/loan-application", element: <LoanApplication/>},
    {path: "/bookkeeper-loan-approval", element: <BookkeeperLoanApproval/>},
    {path: "/bookkeeper-loan-ledger/:loanId", element: <LoanLedger/>},
    {path: "/migs", element: <MIGS/>},
    {path: "/migs-evaluate", element: <MIGSDetails/>},
    {path: "/payments", element: <BookkeeperPayments/>},
    {path: "/bookkeeper-savings-transactions", element: <BookkeeperSavingsTransactions/>},
    {path: "/bookkeeper-savings-accounts", element: <BookkeeperSavingsAccounts/>},
    {path: "/reports", element: <Reports/>},
    {path: "/loan_kiosk", element: <Loan_Kiosk/>},
    {path: "/verification", element: <Verification/>},
    {path: "/Member_Services", element: <Member_Services/>},
    {path: "/Non_Member", element: <Non_Member/>},
    {path: "/manage-loans", element:<Manage_Loans/>},
    {path: "/manage-member", element:<Manage_Member/>},
    {path: "/member_details", element:<Member_Details/>},
    {path: "/membership_form", element:<Membership_Form/>},
    {path: "/BOD-dashboard", element:<Dashboard_BOD/>},
    {path: "/member-approvals", element:<Member_Approvals/>},
    {path: "/member-approvals/:id", element:<MemberApprovalDetails/>},
    {path: "/manager-dashboard", element:<M_Dashboard/>},
    {path: "/manager-manage-member", element:<Manager_Manage_Member/>},
    {path: "/loan-approval", element:<Loan_Approval/>},
    {path: "/manager-reports", element:<Manager_Reports/>},
    {path: "/role_selection", element:<Role_Selection/>},
    {path: "/memberlogin", element:<MemberLogin/>},
    {path: "/loan-approval/:id", element:<LoanApprovalDetails/>},
    {path: "/bookkeeper-loan-approval/:id", element:<LoanApprovalDetails/>},
    {path: "/member-dashboard", element: memberGuarded(<Member_Dashboard/>)},
    {path: "/member-loans", element: memberGuarded(<Member_Loans/>)},
    {path: "/member-apply-loans", element: memberGuarded(<Member_ApplyLoans/>)},
    {path: "/member-lifecycle", element: memberGuarded(<Member_Lifecycle/>)},
    {path: "/members-profile", element: memberGuarded(<Members_Profile/>)},
    {path: "/members-profile/change-email", element: memberGuarded(<ChangeEmail/>)},
    {path: "/member-savings", element: memberGuarded(<Member_Savings/>)},
    {path: "/member-statement-of-account", element: memberGuarded(<Member_StatementOfAccount/>)},
    {path: "/Koica_Forms", element:<Koica_Forms/>},
    {path: "/loan_services", element:<Loan_Services/>},
    {path: "/savings_services", element:<Savings_Services/>},
    {path: "/regularsavings_services", element:<RegularSavings_Services/>},
    {path: "/withdrawal", element:<Withdrawal/>},
    {path: "/withdrawal_success", element:<Withdrawal_Success/>},
    {path: "/deposit", element:<Deposit/>},
    {path: "/deposit_success", element:<Deposit_Success/>},
    {path: "/Treasurer_Dashboard", element:<Treasurer_Dashboard/>},
    {path: "/treasurer-accounting", element: <TreasurerAccounting/>},
    {path: "/disbursement", element: <Disbursement/>},
    {path: "/treasurer-payments", element: <TreasurerPayments/>},
    {path: "/schedule", element:<Schedule/>},
    {path: "/Cashier_Dashboard", element:<Cashier_Dashboard/>},
    {path: "/Cashier_Savings", element:<Cashier_Savings/>},
    {path: "/add_savings", element:<Add_Savings/>},
    {path: "/Savings_Details/:id", element:<Savings_Details/>},
    {path: "/Secretary_Attendance", element:<Secretary_Attendance/>},
    {path: "/Secretary_General_Assembly", element:<Secretary_General_Assembly/>},
    {path: "/Secretary_Records", element:<Secretary_Records/>},
    {path: "/bod-manage-member", element:<BOD_Manage_Member/>},
    {path: "/bod-termination-inbox", element:<Termination_Inbox/>},
    {path: "/bod-loan-approvals", element:<BOD_Loan_Approval/>},
    {path: "/bod-loan-approval/:id", element:<LoanApprovalDetails/>},
    {path: "/bod-audit-log", element:<BOD_Audit_Log/>},
    {path: "/manager-audit-log", element:<Manager_Audit_Log/>},
    {path: "/treasurer-audit-log", element:<Treasurer_Audit_Log/>},
    {path: "/cashier-audit-log", element:<Cashier_Audit_Log/>},
    {path: "/bod-manage-loans", element:<BOD_Manage_Loans/>},
    {path: "/bod-loan-policies", element:<BOD_Loan_Policies/>},
    {path: "/secretary-records", element:<Secretary_Records/>},
    {path: "/membership-records", element:<Secretary_Records/>},
    {path: "/record-details/:id", element:<Record_Details/>},
    {path: "/treasurer-approval", element:<Treasurer_Approval/>},
    {path:"/treasurer-approval/:id", element:<Treasurer_ApprovalDetails/>},
    {path: "/Cashier_CBU", element:<Cashier_CBU/>},
    {path: "/Cashier_CBU_Deposit/:memberId", element:<Cashier_CBU_Deposit/>},
    {path: "/Cashier_Withdrawals", element:<Cashier_Withdrawals/>},
    {path: "/Cashier_Payments", element:<Cashier_Payments/>},
    {path: "/Cashier_Disbursement", element:<Cashier_Disbursement/>},
    {path: "/Cashier_MembershipPayments", element:<Cashier_MembershipPayments/>},
    {path: "/cashier-membership-payments", element:<Cashier_MembershipPayments/>},
    {path: "/capital-build-up", element:<Cashier_CBU/>},
    {path: "/withdrawals", element:<Cashier_Withdrawals/>},
    {path: "/cashier-withdrawals", element:<Cashier_Withdrawals/>},
    {path: "/payments-cashier", element:<Cashier_Payments/>},
    {path: "/cashier-payments", element:<Cashier_Payments/>},
    {path: "/cashier-disbursement", element:<Cashier_Disbursement/>},
    {path: "/savings_forms", element:<Savings_Forms/>},
    {path: "/grocery", element:<Grocery/>},
    {path: "/grocery-ledger", element:<Grocery_Ledger/>},
    {path: "/dev/pos-simulator", element:<PosSimulator/>},
    {path: "/Cashier_Grocery", element:<Cashier_Grocery/>},
    {path:"/conso_choice", element:<Conso_Choice/>},
    {path:"/Consolidated_Up", element:<Consolidated_Up/>},
    
]);