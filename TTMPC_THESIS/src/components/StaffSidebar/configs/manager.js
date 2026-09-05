import {
  LayoutDashboard,
  ClipboardCheck,
  Brain,
  Briefcase,
  Users,
  BarChart3,
  History,
  Banknote,
} from "lucide-react";

// Manager portal navigation. Same list on every Manager page.
export const managerNav = [
  { name: "Dashboard",      icon: LayoutDashboard, path: "/manager-dashboard" },
  { name: "Loan Approval",  icon: ClipboardCheck,  path: "/loan-approval" },
  { name: "Credit Risk",    icon: Brain,           path: "/manager-credit-risk" },
  { name: "Manage Loans",   icon: Briefcase,       path: "/manager-manage-loans" },
  { name: "Manage Member",  icon: Users,           path: "/manager-manage-member" },
  { name: "ISC Postings",   icon: Banknote,        path: "/manager-isc" },
  { name: "Reports",        icon: BarChart3,       path: "/manager-reports" },
  { name: "Audit Log",      icon: History,         path: "/manager-audit-log" },
];
