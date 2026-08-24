import React from "react";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import AuditLogViewer from "../../components/AuditLogViewer";
import StaffSidebar from "../../components/StaffSidebar";
import { treasurerNav } from "../../components/StaffSidebar/configs/treasurer";
import { User } from "lucide-react";

const Treasurer_Audit_Log = () => {
  const { addNotification } = useNotification();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Treasurer" items={treasurerNav} />

      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shrink-0 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <div className="ml-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
            <User className="w-4.5 h-4.5" />
          </div>
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Treasurer" />
        </header>

        <main className="p-8">
          <AuditLogViewer showActorRoleFilter={false} onError={(msg) => addNotification(msg, "error")} />
        </main>
      </div>
    </div>
  );
};

export default Treasurer_Audit_Log;
