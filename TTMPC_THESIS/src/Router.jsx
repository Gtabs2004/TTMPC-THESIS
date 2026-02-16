import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Bonus_Loan from "./LOANFORMS/Bonus_Loan";
import Consolidated_Loan from "./LOANFORMS/Consolidated_Loan";
import Emergency_Loan from "./LOANFORMS/Emergency_Loan";
import Sign_Up from "./Index_Pages/Sign_Up";
import Login from "./Index_Pages/login";
import Dashboard from "./Bookkeeper/Components/bookkeeperDashboard";
import Records from "./Bookkeeper/Components/Member-Records";
import Accounting from "./Bookkeeper/Components/Accounting";
import AuditTrail from "./Bookkeeper/Components/Audit-Trail";
import LoanApplication from "./Bookkeeper/Components/Loan-Application";
import MIGS from "./Bookkeeper/Components/MIGS";
import Payments from "./Bookkeeper/Components/Payments";
import Reports from "./Bookkeeper/Components/Reports";
import Loan_Kiosk from "./Index_Pages/loan_kiosk";
import Verification from "./Index_Pages/verification";
import Member_Services from "./Index_Pages/member_services";
import Non_Member from "./Index_Pages/non_member";




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
    {path: "/migs", element: <MIGS/>},
    {path: "/payments", element: <Payments/>},
    {path: "/reports", element: <Reports/>},
    {path: "/loan-kiosk", element: <Loan_Kiosk/>},
    {path: "/verification", element: <Verification/>},
    {path: "/Member_Services", element: <Member_Services/>},
    {path: "/Non_Member", element: <Non_Member/>},
])