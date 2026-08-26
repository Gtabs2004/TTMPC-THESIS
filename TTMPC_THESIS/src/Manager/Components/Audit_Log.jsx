import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { managerNav } from "../../components/StaffSidebar/configs/manager";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import AuditLogViewer from "../../components/AuditLogViewer";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  History,
  ClipboardCheck,
  Brain,
  Briefcase,
} from "lucide-react";

const Manager_Audit_Log = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();




  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Manager" items={managerNav} />

      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <LoanNotificationBell role="manager" />
          <img src="/img/bookkeeper-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Manager" />
        </header>

        <main className="p-8">
          {/* TITLE */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                A record of your recent actions across the system.
              </p>
            </div>
          </div>

          <AuditLogViewer showActorRoleFilter={false} onError={(msg) => addNotification(msg, "error")} />
        </main>
      </div>
    </div>
  );
};

export default Manager_Audit_Log;
