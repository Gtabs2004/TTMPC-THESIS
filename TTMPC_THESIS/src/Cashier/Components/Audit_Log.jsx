import React, { useState } from "react";
import StaffSidebar from "../../components/StaffSidebar";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import AuditLogViewer from "../../components/AuditLogViewer";
import {
  LayoutDashboard,
  ArrowUpRight,
  Send,
  UserPlus,
  PiggyBank,
  ArrowDownLeft,
  ShoppingCart,
  History,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const Cashier_Audit_Log = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Cashier" items={cashierNav} />

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <LoanNotificationBell role="cashier" />
          <img src="/img/bookkeeper-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Cashier" />
        </header>

        <main className="p-8">
          <AuditLogViewer showActorRoleFilter={false} onError={(msg) => addNotification(msg, "error")} />
        </main>
      </div>
    </div>
  );
};

export default Cashier_Audit_Log;
