import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
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
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8">
          <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
          <input type="text" className=" bg-gray-50  w-52 h-10 rounded-lg border border-gray-300 px-4 
          py-1 focus:outline-none focus:ring-2 focus:ring-green-500"></input>
          </div>
          <LoanNotificationBell role="bookkeeper" />
          <img src="/img/bookkeeper-profile.png" alt="Bookkeeper Profile" className="ml-4 w-8 h-8 rounded-full"></img>
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
        </header>

        {/* Page Content */}
        <main className="p-8">
          <h1 className="font-bold text-2xl">Accounting</h1>
        </main>
      </div>
    </div>
  );
};

export default Accounting;




