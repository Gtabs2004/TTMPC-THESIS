import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
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
  ClipboardList,
  Receipt,
  UserPlus,
  FileSpreadsheet,
  ChevronDown,
  FileDown,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Wallet,
  Coins,
  PiggyBank,
  ShieldAlert,
  Brain,
} from "lucide-react";

const AuditTrail = () => {
    const navigate = useNavigate();

  // --- Mock Data ---
  const kpiData = [
    { 
      title: "My Activities Today", 
      value: "48", 
      badge: "+8%", 
      badgeType: "success",
      icon: ClipboardList, 
      iconColor: "text-blue-600", 
      iconBg: "bg-blue-50" 
    },
    { 
      title: "Payments & Deposits", 
      value: "32", 
      badge: "+15%", 
      badgeType: "success",
      icon: Receipt, 
      iconColor: "text-green-600", 
      iconBg: "bg-green-50" 
    },
    { 
      title: "Profiles Created", 
      value: "5", 
      badge: "New", 
      badgeType: "info",
      icon: UserPlus, 
      iconColor: "text-purple-600", 
      iconBg: "bg-purple-50" 
    },
    { 
      title: "Reports Generated", 
      value: "12", 
      badge: "Weekly", 
      badgeType: "info",
      icon: FileSpreadsheet, 
      iconColor: "text-orange-600", 
      iconBg: "bg-orange-50" 
    },
  ];

  const auditLogs = [
    { id: "LOG-501", date: "Mar 14, 2026 09:15", user: "Ana Reyes", role: "Bookkeeper", module: "Savings", moduleColor: "bg-blue-50 text-blue-600", action: "Deposit Recorded", record: "MEM-2024-001", status: "Success", isFlagged: false },
    { id: "LOG-502", date: "Mar 14, 2026 09:40", user: "Ana Reyes", role: "Bookkeeper", module: "Loans", moduleColor: "bg-green-50 text-green-600", action: "Loan Payment Recorded", record: "LN-2026-001", status: "Success", isFlagged: false },
    { id: "LOG-503", date: "Mar 14, 2026 10:10", user: "Ana Reyes", role: "Bookkeeper", module: "Members", moduleColor: "bg-purple-50 text-purple-600", action: "New Member Profile Created", record: "MEM-2024-005", status: "Success", isFlagged: false },
    { id: "LOG-504", date: "Mar 14, 2026 10:45", user: "Ana Reyes", role: "Bookkeeper", module: "Accounting", moduleColor: "bg-orange-50 text-orange-600", action: "Report Generated", record: "REP-2026-Q1", status: "Success", isFlagged: false },
    { id: "LOG-506", date: "Mar 14, 2026 11:20", user: "Ana Reyes", role: "Bookkeeper", module: "Accounting", moduleColor: "bg-purple-50 text-purple-600", action: "Add Expense", record: "ACC-2026-045", status: "Success", isFlagged: false },
    { id: "LOG-507", date: "Mar 14, 2026 12:45", user: "Ana Reyes", role: "Bookkeeper", module: "Savings", moduleColor: "bg-blue-50 text-blue-600", action: "Deposit Recorded", record: "MEM-2024-088", status: "Success", isFlagged: false },
    { id: "LOG-508", date: "Mar 14, 2026 13:30", user: "Ana Reyes", role: "Bookkeeper", module: "Loans", moduleColor: "bg-green-50 text-green-600", action: "Unauthorized Export Attempt", record: "LN-RESTRICTED", status: "Flagged", isFlagged: true },
  ];

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* Sidebar */}
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

      {/* Main Content Area */}
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              placeholder="Search..."
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 pl-9 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" 
            />
          </div>
          <LoanNotificationBell role="bookkeeper" />
          <img src="/img/bookkeeper-profile.png" alt="Bookkeeper Profile" className="ml-4 w-8 h-8 rounded-full" />
          <div className="ml-3">
             <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
          </div>
        </header>

        {/* Scrollable Dashboard Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          
          {/* KPI Cards */}
          <StatCardRow cols={4}>
            {kpiData.map((kpi, idx) => (
              <StatCard key={idx} label={kpi.title} value={kpi.value} icon={kpi.icon} iconColor={kpi.iconColor} />
            ))}
          </StatCardRow>

          {/* Main Table Container */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col">
            
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-100 flex flex-wrap gap-4 justify-between items-center bg-white rounded-t-xl">
              <div className="flex gap-4 items-center flex-1">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/>
                  <input 
                    type="text" 
                    placeholder="Search my logs..."
                    className="bg-gray-50 w-64 h-10 rounded-lg border border-gray-200 px-4 pl-10 py-1 text-sm focus:outline-none focus:border-green-500 transition-colors" 
                  />
                </div>
                
                {/* Filters */}
                <button className="flex items-center gap-2 h-10 px-4 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  All Modules
                  <ChevronDown size={16} className="text-gray-400" />
                </button>
                <button className="flex items-center gap-2 h-10 px-4 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  Date Range
                  <ChevronDown size={16} className="text-gray-400" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 h-10 px-4 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <FileDown size={16} />
                  PDF
                </button>
                <button className="flex items-center gap-2 h-10 px-4 text-sm font-bold text-white bg-[#166534] hover:bg-green-800 rounded-lg transition-colors shadow-sm">
                  <FileSpreadsheet size={16} />
                  Excel
                </button>
                
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Log ID</th>
                    <th className="p-5 font-bold">Date & Time</th>
                    <th className="p-5 font-bold">User</th>
                    <th className="p-5 font-bold">Role</th>
                    <th className="p-5 font-bold">Module</th>
                    <th className="p-5 font-bold">Action Type</th>
                    <th className="p-5 font-bold">Record</th>
                    <th className="p-5 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="p-5 text-sm font-medium text-gray-900">{log.id}</td>
                      <td className="p-5 text-sm text-gray-500">{log.date}</td>
                      <td className="p-5 text-sm font-bold text-gray-900">{log.user}</td>
                      <td className="p-5 text-sm text-gray-500">{log.role}</td>
                      <td className="p-5 text-sm">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide ${log.moduleColor}`}>
                          {log.module}
                        </span>
                      </td>
                      <td className="p-5 text-sm text-gray-600">{log.action}</td>
                      <td className="p-5 text-sm text-gray-500 font-medium tracking-wide">{log.record}</td>
                      <td className="p-5 text-sm">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide ${
                          log.isFlagged ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${log.isFlagged ? 'bg-red-500' : 'bg-green-500'}`}></div>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex justify-center items-center p-6 gap-2 border-t border-gray-100">
              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                <ChevronLeft className="w-4 h-4" />
              </button>

              {[1, 2, 3, 4, 5].map((page) => (
                <button
                  key={page}
                  className={`w-8 h-8 flex items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                    page === 1
                      ? "bg-[#16A34A] text-white border-[#16A34A]"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {page}
                </button>
              ))}

              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>

        </main>
      </div>
    </div>
  );
};

export default AuditTrail;