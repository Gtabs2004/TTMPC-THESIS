import React from "react";
import { ChevronRight } from "lucide-react";

/**
 * Single-source-of-truth page breadcrumb for staff portals — "Portal >
 * Page Name", sitting just above a page's <h1>. Found scattered across ~9
 * pages before this (Vault, Treasurer_Payments, Schedule, Disbursement,
 * Loan-Approval, Manage-Member, Manage-Loans, Payments, Manager_Manage_
 * Loans) with real drift: one hardcoded `text-[#389734]` instead of the
 * shared `text-primary` token, one imported ChevronRight under a local
 * `ChevronRightIcon` alias. This component is the reusable version of
 * that same pattern, extracted the way StaffSidebar/StaffTopbar were.
 *
 * Props:
 *   portal — display label ("Bookkeeper" / "Cashier" / etc.), gray, inactive.
 *   page   — the current page's name, green (text-primary), active.
 */
export default function Breadcrumb({ portal, page }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
      <span>{portal}</span>
      <ChevronRight className="w-4 h-4 text-gray-300" />
      <span className="text-primary">{page}</span>
    </div>
  );
}
