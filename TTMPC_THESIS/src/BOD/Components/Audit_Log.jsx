import React from "react";
import StaffSidebar from "../../components/StaffSidebar";
import { bodNav } from "../../components/StaffSidebar/configs/bod";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import AuditLogViewer from "../../components/AuditLogViewer";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarCheck,
  CalendarDays,
  Archive,
  FileText,
  AlertTriangle,
  History,
  ShieldCheck
} from "lucide-react";
import NotificationBell from "./NotificationBell";

const Audit_Log = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* SIDEBAR */}
      <StaffSidebar portal="BOD" items={bodNav} />

      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <NotificationBell />
          <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
            <img src="/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200" />
            <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="BOD" />
          </div>
        </header>

        <main className="p-8">
          <AuditLogViewer
            showActorRoleFilter
            onError={(msg) => addNotification(msg, "error")}
          />
        </main>
      </div>
    </div>
  );
};

export default Audit_Log;
