import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  CreditCard,
  History,
  FileText,
} from "lucide-react";

// BOD portal navigation. Same list on every standalone BOD page.
export const bodNav = [
  { name: "Dashboard",         icon: LayoutDashboard, path: "/BOD-dashboard" },
  { name: "Member Approvals",  icon: Users,           path: "/member-approvals" },
  { name: "Loan Approvals",    icon: ShieldCheck,     path: "/bod-loan-approvals" },
  { name: "Loan Ledger",       icon: CreditCard,      path: "/bod-manage-loans" },
  { name: "Manage Member",     icon: Users,           path: "/bod-manage-member" },
  { name: "Audit Log",         icon: History,         path: "/bod-audit-log" },
  { name: "Loan Policies",     icon: FileText,        path: "/bod-loan-policies" },
];

// Same list, grouped under a "BOD" section header — for pages that show more
// than one role's menu at once (see secretary.js's secretarySections, and
// BOD/Components/Secretary_Records.jsx which renders both).
export const bodSections = [{ section: "BOD", items: bodNav }];
