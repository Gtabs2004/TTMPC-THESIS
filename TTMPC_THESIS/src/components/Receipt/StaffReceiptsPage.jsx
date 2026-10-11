import StaffSidebar from "../StaffSidebar";
import StaffTopbar from "../StaffTopbar";
import LoanNotificationBell from "../LoanNotificationBell";
import NotificationBell from "../NotificationBell";
import { bodNav } from "../StaffSidebar/configs/bod";
import { bookkeeperNav } from "../StaffSidebar/configs/bookkeeper";
import { managerNav } from "../StaffSidebar/configs/manager";
import { treasurerNav } from "../StaffSidebar/configs/treasurer";
import ReceiptLookup from "./ReceiptLookup";

// One Receipts page for the four portals that may look up every receipt
// (RECEIPT_SYSTEM_PLAN.md §2, §4). The backend enforces the same list.
const PORTALS = {
  bod: { portal: "BOD", nav: bodNav, bell: <NotificationBell /> },
  bookkeeper: { portal: "Bookkeeper", nav: bookkeeperNav, bell: <LoanNotificationBell role="bookkeeper" /> },
  manager: { portal: "Manager", nav: managerNav, bell: <LoanNotificationBell role="manager" /> },
  treasurer: { portal: "Treasurer", nav: treasurerNav, bell: <LoanNotificationBell role="treasurer" /> },
};

export default function StaffReceiptsPage({ role }) {
  const config = PORTALS[role] || PORTALS.bookkeeper;
  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal={config.portal} items={config.nav} />
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
        <StaffTopbar portal={config.portal} notifications={config.bell} />
        <main className="animate-page-in min-w-0 p-4 sm:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Receipts</h1>
            <p className="mt-0.5 text-sm text-gray-600">
              Every receipt issued by the system. Select one to view, download or print it.
            </p>
          </div>
          <ReceiptLookup />
        </main>
      </div>
    </div>
  );
}
