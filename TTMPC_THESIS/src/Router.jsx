import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Bonus_Loan from "./LOANFORMS/Bonus_Loan";
import Consolidated_Loan from "./LOANFORMS/Consolidated_Loan";
import Emergency_Loan from "./LOANFORMS/Emergency_Loan";
import Sign_In from "./Index_Pages/Sign_in";
import Login from "./Index_Pages/login";


export const router = createBrowserRouter([
    {path: "/", element: <App/>},
    {path: "/Bonus_Loan", element: <Bonus_Loan/>},
    {path: "/Consolidated_Loan", element: <Consolidated_Loan/>},
    {path: "/Emergency_Loan", element: <Emergency_Loan/>},
    {path: "/Sign_In", element: <Sign_In/>},
    {path: "/Login", element: <Login/>},

])