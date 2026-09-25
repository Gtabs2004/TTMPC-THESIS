import {
  LayoutDashboard,
  CreditCard,
  Wallet,
  Users,
  PiggyBank,
  History,
  FileText
} from "lucide-react";

// Treasurer portal navigation. Each item carries its own explicit path — no
// separate routeMap lookup, no string-mangled fallback. Adding a new page is
// a single-line edit here and a single-line edit in Router.jsx.
export const treasurerNav = [
  { name: "Dashboard",     icon: LayoutDashboard, path: "/Treasurer_Dashboard" },
  { name: "Disbursement",  icon: CreditCard,      path: "/disbursement" },
  { name: "Vault",         icon: Wallet,          path: "/treasurer-vault" },
  { name: "Savings ", icon: PiggyBank,    path: "/treasurer-savings-accounts" },
  { name: "Payments",      icon: Users,           path: "/treasurer-payments" },
  { name: "Loan Approval", icon: FileText,      path: "/treasurer-approval" },
  { name: "Audit Log",     icon: History,         path: "/treasurer-audit-log" },
];


