import React, { useState } from "react";
import StaffSidebar from "../../components/StaffSidebar";
import { treasurerNav } from "../../components/StaffSidebar/configs/treasurer";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import IscPostingHistory from "../../components/IscPostingHistory";

/**
 * Treasurer view of every Interest on Share Capital posting — read-only.
 *
 * The treasurer is the bookkeeper's counterpart: the bookkeeper calculates and
 * posts, the treasurer checks. So this page deliberately passes canReverse
 * false (only a manager may reverse — ISC_DIVIDEND_PLAN.md §5.4/§8.2) and
 * offers no way to run a new calculation.
 *
 * "View" here means the postings that were actually made, not a live
 * calculator: see §5.4 on why viewing and calculating are separate permissions.
 * The database enforces both regardless of what this page renders — isc_post()
 * and isc_reverse() check the caller's role themselves.
 */
const Treasurer_ISC_Postings = () => {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Treasurer" items={treasurerNav} />

      <div className="flex-1 flex flex-col h-screen overflow-y-auto min-w-0">
        <StaffTopbar portal="Treasurer" notifications={<LoanNotificationBell role="treasurer" />} />

        <main className="p-8 min-w-0">
          <Breadcrumb portal="Treasurer" page="ISC Postings" />
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Interest on Share Capital — Postings</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Every dividend posting the bookkeeper has made, and what each member received.
              </p>
            </div>
          </div>

          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-deep text-white text-sm font-semibold transition-colors"
            >
              View Postings
            </button>
          )}
        </main>
      </div>

      <IscPostingHistory open={open} onClose={() => setOpen(false)} />
    </div>
  );
};

export default Treasurer_ISC_Postings;
