import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  CreditCard,
  History,
  FileText,
  UserRoundCheck,
  UserCog,
} from "lucide-react";

// BOD portal navigation. Same list on every standalone BOD page.
// Account Management is listed for every BOD; the page itself (and the
// backend) only lets the BOD holding can_manage_accounts use it.
export const bodNav = [
  { name: "Dashboard",         icon: LayoutDashboard, path: "/BOD-dashboard" },
  { name: "Member Approvals",  icon: UserRoundCheck,           path: "/member-approvals" },
  { name: "Manage Member",     icon: Users,           path: "/bod-manage-member" },
  { name: "Loan Approvals",    icon: ShieldCheck,     path: "/bod-loan-approvals" },
  { name: "Loan Ledger",       icon: CreditCard,      path: "/bod-manage-loans" },
  { name: "Account Management", icon: UserCog,        path: "/bod-account-management" },
  { name: "Loan Policies",     icon: FileText,        path: "/bod-loan-policies" },
  { name: "Audit Log",         icon: History,         path: "/bod-audit-log" },
];
