import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Calculator,
  Activity,
  BarChart3,
  History,
  Search,
  Bell,
  Briefcase,
  Wallet,
  Coins,
  PiggyBank,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Brain,
} from "lucide-react";


const Accounting = () => {
    const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-gray-100">
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

     
      <div className="flex-1 flex flex-col">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        {/* Page Content */}
        <main className="p-8">
          <h1 className="font-bold text-2xl">Accounting</h1>
        </main>
      </div>
    </div>
  );
};

export default Accounting;




