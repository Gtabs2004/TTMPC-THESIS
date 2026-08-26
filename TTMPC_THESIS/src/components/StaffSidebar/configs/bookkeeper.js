import {
  LayoutDashboard,
  Users,
  FileText,
  Briefcase,
  Brain,
  Wallet,
  PiggyBank,
  Calculator,
  Activity,
  BarChart3,
  History,
  Coins,
} from "lucide-react";

// Bookkeeper portal navigation. Same list on every Bookkeeper page.
export const bookkeeperNav = [
  { name: "Dashboard",      icon: LayoutDashboard, path: "/dashboard" },
  { name: "Manage Member",  icon: Users,           path: "/manage-member" },
  { name: "Loan Approval",  icon: FileText,        path: "/bookkeeper-loan-approval" },
  { name: "Manage Loans",   icon: Briefcase,       path: "/manage-loans" },
  { name: "Credit Risk",    icon: Brain,           path: "/bookkeeper-credit-risk" },
  { name: "Payments",       icon: Wallet,          path: "/payments" },
  {
    name: "Savings Accounts",
    icon: PiggyBank,
    isDropdown: true,
    subItems: [
      { name: "All Accounts",         path: "/bookkeeper-savings-accounts" },
      { name: "Savings Withdrawals",  path: "/bookkeeper-savings-transactions" },
    ],
  },
  { name: "Accounting",   icon: Calculator, path: "/accounting" },
  { name: "MIGS Scoring", icon: Activity,   path: "/migs" },
  { name: "Reports",      icon: BarChart3,  path: "/reports" },
  { name: "Audit Trail",  icon: History,    path: "/audit-trail" },
  { name: "Grocery",      icon: Coins,      path: "/grocery" },
];
