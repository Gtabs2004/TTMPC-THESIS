import React, { useState } from "react";
import StaffSidebar from "../../components/StaffSidebar";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
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

      <div className="flex-1 flex flex-col min-w-0">
        <StaffTopbar portal="Cashier" notifications={<LoanNotificationBell role="cashier" />} />

        <main className="p-8 min-w-0">
          <Breadcrumb portal="Cashier" page="Audit Log" />
          <AuditLogViewer showActorRoleFilter={false} onError={(msg) => addNotification(msg, "error")} />
        </main>
      </div>
    </div>
  );
};

export default Cashier_Audit_Log;
