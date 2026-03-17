import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Bonus_Loan from "./LOANFORMS/Bonus_Loan";
import Consolidated_Loan from "./LOANFORMS/Consolidated_Loan";
import Emergency_Loan from "./LOANFORMS/Emergency_Loan";
import Sign_Up from "./Index_Pages/Sign_Up";
import MemberLogin from "./Index_Pages/memberlogin";
import Login from "./Index_Pages/login";
import Dashboard from "./Bookkeeper/Components/bookkeeperDashboard";
import Records from "./Bookkeeper/Components/Member-Records";
import Accounting from "./Bookkeeper/Components/Accounting";
import AuditTrail from "./Bookkeeper/Components/Audit-Trail";
import LoanApplication from "./Bookkeeper/Components/Loan-Application";
import MIGS from "./Bookkeeper/Components/MIGS";
import Payments from "./Bookkeeper/Components/Payments";
import Reports from "./Bookkeeper/Components/Reports";
import BookkeeperLoanApproval from "./Bookkeeper/Components/Loan-Approval";
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
import M_Dashboard from "./Manager/Components/M-Dashboard";
import Loan_Approval from "./Manager/Components/loan-approval";
import Role_Selection from "./Index_Pages/role_selection";
import LoanApprovalDetails from "./Manager/Components/LoanApprovalDetails";
import Member_Dashboard from "./Member/Components/Member_Dashboard";
import Member_Loans from "./Member/Components/Member_Loans";
import Members_Profile from "./Member/Components/Members_Profile";
import Member_Savings from "./Member/Components/Member_Savings";
import Koica_Forms from "./LOANFORMS/Koica_Forms";
import Loan_Services from "./Index_Pages/loan_services";
import Savings_Services from "./Index_Pages/savings_services";
import RegularSavings_Services from "./Index_Pages/regularsavings_services";
import Withdrawal from "./Index_Pages/withdrawal";
import Withdrawal_Success from "./Index_Pages/withdrawal_success";
import Deposit from "./Index_Pages/deposit";
import Deposit_Success from "./Index_Pages/deposit_success";
import Treasurer_Dashboard from "./Treasurer/Components/Treasurer_Dashboard";
import Loans from "./Treasurer/Components/Loans";
import Savings from "./Treasurer/Components/Savings";
import Members from "./Treasurer/Components/Members";
import Treasurer_Reports from "./Treasurer/Components/Treasurer_Reports";
import Cashier_Dashboard from "./Cashier/Components/Cashier_Dashboard";
import Cashier_Savings from "./Cashier/Components/Cashier_Savings";
import Savings_Details from "./Cashier/Components/Savings_Details";





export const router = createBrowserRouter([
    {path: "/", element: <App/>},
    {path: "/Bonus_Loan", element: <Bonus_Loan/>},
    {path: "/Consolidated_Loan", element: <Consolidated_Loan/>},
    {path: "/Emergency_Loan", element: <Emergency_Loan/>},
    {path: "/Sign_Up", element: <Sign_Up/>},
    {path: "/Login", element: <Login/>},
    {path: "/dashboard", element: <Dashboard/>},
    {path: "/records", element: <Records/>},
    {path: "/accounting", element: <Accounting/>},
    {path: "/audit-trail", element: <AuditTrail/>},
    {path: "/loan-application", element: <LoanApplication/>},
    {path: "/bookkeeper-loan-approval", element: <BookkeeperLoanApproval/>},
    {path: "/migs-scoring", element: <MIGS/>},
    {path: "/payments", element: <Payments/>},
    {path: "/reports", element: <Reports/>},
    {path: "/loan_kiosk", element: <Loan_Kiosk/>},
    {path: "/verification", element: <Verification/>},
    {path: "/Member_Services", element: <Member_Services/>},
    {path: "/Non_Member", element: <Non_Member/>},
    {path: "/manage-loans", element:<Manage_Loans/>},
    {path: "/member_details", element:<Member_Details/>},
    {path: "/membership_form", element:<Membership_Form/>},
    {path: "/BOD-dashboard", element:<Dashboard_BOD/>},
    {path: "/member-approvals", element:<Member_Approvals/>},
    {path: "/member-approvals/:id", element:<MemberApprovalDetails/>},
    {path: "/manager-dashboard", element:<M_Dashboard/>},
    {path: "/loan-approval", element:<Loan_Approval/>},
    {path: "/role_selection", element:<Role_Selection/>},
    {path: "/memberlogin", element:<MemberLogin/>},
    {path: "/loan-approval/:id", element:<LoanApprovalDetails/>},
    {path: "/bookkeeper-loan-approval/:id", element:<LoanApprovalDetails/>},
    {path: "/member-dashboard", element:<Member_Dashboard/>},
    {path: "/member-loans", element:<Member_Loans/>},
    {path: "/members-profile", element:<Members_Profile/>},
    {path: "/member-savings", element:<Member_Savings/>},
    {path: "/koica-forms", element:<Koica_Forms/>},
    {path: "/loan_services", element:<Loan_Services/>},
    {path: "/savings_services", element:<Savings_Services/>},
    {path: "/regularsavings_services", element:<RegularSavings_Services/>},
    {path: "/withdrawal", element:<Withdrawal/>},
    {path: "/withdrawal_success", element:<Withdrawal_Success/>},
    {path: "/deposit", element:<Deposit/>},
    {path: "/deposit_success", element:<Deposit_Success/>},
    {path: "/Treasurer_Dashboard", element:<Treasurer_Dashboard/>},
    {path: "/Loans", element:<Loans/>},
    {path: "/Savings", element:<Savings/>},
    {path: "/Members", element:<Members/>},
    {path: "/Treasurer_Reports", element:<Treasurer_Reports/>},
    {path: "/Cashier_Dashboard", element:<Cashier_Dashboard/>},
    {path: "/Cashier_Savings", element:<Cashier_Savings/>},
    {path: "/Savings_Details/:id", element:<Savings_Details/>},
]);