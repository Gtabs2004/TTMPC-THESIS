import React from "react";
import StaffSidebar from "../../components/StaffSidebar";
import { bodNav } from "../../components/StaffSidebar/configs/bod";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
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
import NotificationBell from "../../components/NotificationBell";

const Audit_Log = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* SIDEBAR */}
      <StaffSidebar portal="BOD" items={bodNav} />

      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <StaffTopbar portal="BOD" notifications={<NotificationBell />} />

        <main className="animate-page-in flex-1 overflow-y-auto p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Audit Log</h1>
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
