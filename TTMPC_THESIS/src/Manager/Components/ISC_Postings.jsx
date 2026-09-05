import React, { useState } from "react";
import StaffSidebar from "../../components/StaffSidebar";
import { managerNav } from "../../components/StaffSidebar/configs/manager";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import IscPostingHistory from "../../components/IscPostingHistory";

/**
 * Manager-only view of every Interest on Share Capital posting, with the
 * ability to reverse one. Reversal is deliberately kept off the Bookkeeper's
 * modal — see ISC_DIVIDEND_PLAN.md §5.4/§8.2: the bookkeeper who posts is
 * excluded from reversing, even their own posting, by the database function
 * itself (isc_reverse), not just this page.
 */
const Manager_ISC_Postings = () => {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Manager" items={managerNav} />

      <div className="flex-1 flex flex-col h-screen overflow-y-auto min-w-0">
        <StaffTopbar portal="Manager" notifications={<LoanNotificationBell role="manager" />} />

        <main className="p-8 min-w-0">
          <Breadcrumb portal="Manager" page="ISC Postings" />
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Interest on Share Capital — Postings</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Review every dividend posting and reverse one if it was posted in error.
              </p>
            </div>
          </div>

          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
            >
              View Postings
            </button>
          )}
        </main>
      </div>

      <IscPostingHistory open={open} onClose={() => setOpen(false)} canReverse />
    </div>
  );
};

export default Manager_ISC_Postings;
