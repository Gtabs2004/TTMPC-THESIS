import {
  LayoutDashboard,
  Users,
  Briefcase,
  PiggyBank,
  BarChart3,
  History,
  Coins,
  ReceiptText,
} from "lucide-react";

// Bookkeeper portal navigation. Same list on every Bookkeeper page.
// `badgeKey` marks entries that show a pending-work count (see StaffSidebar).
// Grouped by the Bookkeeper's work so the whole menu fits without scrolling:
// 8 top-level entries instead of 14. The group containing the current page
// opens by itself (see StaffSidebar), and "Savings & Capital" uses the same
// wording as the Cashier's savings group.
export const bookkeeperNav = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  {
    name: "Members",
    icon: Users,
    isDropdown: true,
    subItems: [
      { name: "Manage Member",         path: "/manage-member" },
      { name: "Member Classification", path: "/migs" },
    ],
  },
  {
    name: "Loans",
    icon: Briefcase,
    isDropdown: true,
    subItems: [
      { name: "Loan Approval",               path: "/bookkeeper-loan-approval", badgeKey: "loan_approval" },
      { name: "Member Loans",                path: "/manage-loans" },
      { name: "Loan Override Requests",      path: "/bookkeeper-renewal-overrides", badgeKey: "override_requests" },
      { name: "Credit Risk",                 path: "/bookkeeper-credit-risk" },
      { name: "Loan Payments Confirmation",  path: "/payments", badgeKey: "loan_payments" },
    ],
  },
  {
    name: "Savings & Capital",
    icon: PiggyBank,
    isDropdown: true,
    subItems: [
      { name: "All Accounts",                path: "/bookkeeper-savings-accounts" },
      { name: "Savings Withdrawals",         path: "/bookkeeper-savings-transactions", badgeKey: "savings_withdrawals" },
      { name: "Capital Build-Up",            path: "/bookkeeper-cbu" },
      { name: "Interest on Share Capital",   path: "/bookkeeper-isc" },
    ],
  },
  { name: "Grocery",   icon: Coins,       path: "/grocery" },
  { name: "Reports",   icon: BarChart3,   path: "/reports" },
  { name: "Audit Log", icon: History,     path: "/audit-trail" },
  { name: "Receipts",  icon: ReceiptText, path: "/bookkeeper-receipts" },
];
