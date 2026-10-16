import {
  LayoutDashboard,
  ArrowUpRight,
  Send,
  UserPlus,
  PiggyBank,
  ArrowDownLeft,
  ShoppingCart,
  History,
} from "lucide-react";

// Cashier portal navigation. Same list on every Cashier page.
export const cashierNav = [
  { name: "Dashboard",             icon: LayoutDashboard, path: "/Cashier_Dashboard" },
  { name: "Loan Payments",         icon: ArrowUpRight,    path: "/Cashier_Payments" },
  { name: "Loan Disbursement",     icon: Send,            path: "/Cashier_Disbursement" },
  { name: "Membership Payments",   icon: UserPlus,        path: "/Cashier_MembershipPayments" },
  {
    name: "Account Transactions",
    icon: PiggyBank,
    isDropdown: true,
    subItems: [
      { name: "Savings Accounts",           path: "/Cashier_Savings" },
      { name: "Capital Build-Up",  path: "/Cashier_CBU" },
      { name: "CBU Exit Payout",   path: "/Cashier_CBU_Exit_Payout" },
    ],
  },
  { name: "Savings Withdrawals Ledger", icon: ArrowDownLeft, path: "/Cashier_Withdrawals" },
  { name: "Grocery Transactions",      icon: ShoppingCart,  path: "/Cashier_Grocery" },
  { name: "Audit Log",    icon: History,       path: "/cashier-audit-log" },
];
