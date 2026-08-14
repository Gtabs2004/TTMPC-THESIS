import {
  LayoutDashboard,
  CreditCard,
  Wallet,
  Calculator,
  Users,
  BarChart3,
  History,
} from "lucide-react";

// Treasurer portal navigation. Each item carries its own explicit path — no
// separate routeMap lookup, no string-mangled fallback. Adding a new page is
// a single-line edit here and a single-line edit in Router.jsx.
export const treasurerNav = [
  { name: "Dashboard",     icon: LayoutDashboard, path: "/Treasurer_Dashboard" },
  { name: "Disbursement",  icon: CreditCard,      path: "/disbursement" },
  { name: "Vault",         icon: Wallet,          path: "/treasurer-vault" },
  { name: "Schedule",      icon: Calculator,      path: "/schedule" },
  { name: "Payments",      icon: Users,           path: "/treasurer-payments" },
  { name: "Loan Approval", icon: CreditCard,      path: "/treasurer-approval" },
  { name: "Accounting",    icon: BarChart3,       path: "/treasurer-accounting" },
  { name: "Audit Log",     icon: History,         path: "/treasurer-audit-log" },
];
