import React from "react";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import StaffSidebar from "../../components/StaffSidebar";
import { treasurerNav } from "../../components/StaffSidebar/configs/treasurer";
import { Search, Bell, User } from 'lucide-react';


const Accounting = () => {

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Treasurer" items={treasurerNav} />


      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Treasurer" notifications={<LoanNotificationBell role="treasurer" />} />

        {/* Page Content */}
        <main className="p-8">
          <Breadcrumb portal="Treasurer" page="Accounting" />
          <h1 className="font-bold text-2xl">Dashboard</h1>
        </main>
      </div>
    </div>
  );
};

export default Accounting;