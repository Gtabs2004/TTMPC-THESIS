import React from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
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
  ChevronRight
} from 'lucide-react';

const AuditTrail = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  
  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Manage Member", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: CreditCard },
    { name: "Payments", icon: CreditCard },
    { name: "Accounting", icon: Calculator },
    { name: "MIGS Scoring", icon: Activity },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Trail", icon: History },
  ];

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

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
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Bookkeeper Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
            const routeMap = {
              Dashboard: "/dashboard",
              "Manage Member": "/manage-member",
              "Loan Approval": "/bookkeeper-loan-approval",
              "Manage Loans":"/manage-loans",
              Payments: "/payments",
              Accounting: "/accounting",
              MIGS: "/migs",
              Reports: "/reports",
              "Audit Trail": "/audit-trail",
            };

            return menuItems.map((item) => {
              const Icon = item.icon;
              const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;

              return (
                <NavLink
                  key={item.name}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-2 rounded-md transition-colors ${
                      isActive
                        ? 'bg-green-50 text-green-700 font-semibold'
                        : 'text-gray-700 hover:bg-green-50 hover:text-green-700'
                    }`
                  }
                >
                  <Icon size={20} />
                  <span>{item.name}</span>
                </NavLink>
              );
            });
          })()}
        </nav>
        
        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

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
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="src/assets/img/bookkeeper-profile.png" alt="Bookkeeper Profile" className="ml-4 w-8 h-8 rounded-full" />
          <div className="ml-3">
             <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
          </div>
        </header>

        {/* Scrollable Dashboard Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {kpiData.map((kpi, idx) => {
              const Icon = kpi.icon;
              return (
                <div key={idx} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col relative overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.iconBg} ${kpi.iconColor}`}>
                      <Icon size={20} />
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                      kpi.badgeType === 'success' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {kpi.badge}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-gray-500 mb-1">{kpi.title}</p>
                  <h3 className="text-2xl font-black text-gray-900">{kpi.value}</h3>
                </div>
              );
            })}
          </div>

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
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50/50 text-[10px] uppercase text-gray-500 font-bold tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Log ID</th>
                    <th className="px-6 py-4">Date & Time</th>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Module</th>
                    <th className="px-6 py-4">Action Type</th>
                    <th className="px-6 py-4">Record</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {auditLogs.map((log, index) => (
                    <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{log.id}</td>
                      <td className="px-6 py-4 text-gray-500">{log.date}</td>
                      <td className="px-6 py-4 font-bold text-gray-900">{log.user}</td>
                      <td className="px-6 py-4 text-gray-500">{log.role}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide ${log.moduleColor}`}>
                          {log.module}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{log.action}</td>
                      <td className="px-6 py-4 text-gray-500 font-medium tracking-wide">{log.record}</td>
                      <td className="px-6 py-4">
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