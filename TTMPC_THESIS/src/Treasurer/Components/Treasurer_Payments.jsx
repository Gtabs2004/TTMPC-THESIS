import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Calculator, 
  BarChart3, 
  Search,
  Bell,
  Wallet,
  CalendarCheck,
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Plus,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon
} from 'lucide-react';

// Mock data matching your screenshot
const paymentsData = [
  { id: "TTMPCPAY-2026-001", name: "Romelyn Delos Reyes", type: "Bonus", amount: "\u20B12,000", date: "Feb. 10, 2026", status: "On-Time", balance: "\u20B118,000" },
  { id: "TTMPCPAY-2026-002", name: "Erden Jhed Teope", type: "Emergency", amount: "\u20B12,500", date: "Feb. 10, 2026", status: "On-Time", balance: "\u20B122,500" },
  { id: "TTMPCPAY-2026-003", name: "Ashley Nicole Bulataolo", type: "Consolidated", amount: "\u20B110,000", date: "Feb. 10, 2026", status: "On-Time", balance: "\u20B1110,000" },
  { id: "TTMPCPAY-2026-004", name: "Karina Dela Cruz", type: "Bonus", amount: "\u20B12,000", date: "Feb. 11, 2026", status: "On-Time", balance: "\u20B118,000" },
  { id: "TTMPCPAY-2026-005", name: "Gero Antoni Tablolo", type: "Emergency", amount: "\u20B12,500", date: "Feb. 11, 2026", status: "On-Time", balance: "\u20B122,500" },
  { id: "TTMPCPAY-2026-006", name: "Nash Ervine Slaton", type: "Consolidated", amount: "\u20B115,000", date: "Feb. 12, 2026", status: "On-Time", balance: "\u20B1165,000" },
  { id: "TTMPCPAY-2026-007", name: "Paul Soriano", type: "Consolidated", amount: "\u20B15,000", date: "Feb. 12, 2026", status: "On-Time", balance: "\u20B155,000" },
  { id: "TTMPCPAY-2026-008", name: "Joseph Mercado", type: "Consolidated", amount: "\u20B14,500", date: "Feb. 12, 2026", status: "Late", balance: "\u20B145,000" },
  { id: "TTMPCPAY-2026-009", name: "Antonio Ramirez", type: "Emergency", amount: "\u20B13,500", date: "Feb. 13, 2026", status: "On-Time", balance: "\u20B138,500" },
];

const Payments = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  
  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Disbursement", icon: CreditCard },
    { name: "Schedule", icon: Calculator },
    { name: "Payments", icon: Users },
    { name: "Loan-Approval", icon: CreditCard },
    { name: "Accounting", icon: BarChart3 },
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

  // Helper function for loan type badge colors - REVERTED TO ORIGINAL
  const getLoanBadgeClass = (type) => {
    switch(type) {
      case 'Bonus': return 'bg-blue-100 text-blue-700';
      case 'Emergency': return 'bg-red-100 text-red-700';
      case 'Consolidated': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] font-['Poppins']">
      
      {/* --- ORIGINAL USER SIDEBAR --- */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Treasurer Portal" fallbackRole="Treasurer" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
             const routeMap = {
              "Dashboard": "/Treasurer_Dashboard",
              "Disbursement": "/disbursement",
              "Schedule": "/schedule",
              "Payments": "/treasurer-payments",
              "Loan-Approval": "/treasurer-approval",
              "Accounting": "/treasurer-accounting",
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
      <div className="flex-1 flex flex-col h-screen overflow-y-auto w-full">
        
        {/* --- ORIGINAL USER TOPBAR --- */}
        <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 pl-9 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Search..."
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="/img/treasurer-profile.png" alt="Treasurer Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Treasurer" />
        </header>

        {/* FULL WIDTH DASHBOARD AREA */}
        <main className="p-8 w-full">
          
          {/* Breadcrumb & Page Header */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
                <span>Treasurer</span>
                <ChevronRightIcon className="w-4 h-4 text-gray-300" />
                <span className="text-[#389734]">Payments Ledger</span>
              </div>
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Payment Records</h1>
              <p className="text-sm text-gray-500 mt-1 font-medium">Track, manage, and record member loan repayments.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold shadow-sm">
                <CalendarCheck className="w-4 h-4 text-gray-400" />
                {new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" })}
              </div>
            </div>
          </div>

          {/* Top Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Card 1 */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex flex-col relative hover:-translate-y-1 hover:shadow-md transition-all duration-300">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2.5 bg-green-50 rounded-xl">
                  <Wallet className="w-5 h-5 text-[#389734]" />
                </div>
                <TrendingUp className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-2">Total Collected</p>
              <div className="flex items-end gap-3 mt-1">
                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">{"\u20B1"}125,500.00</h2>
                <span className="text-xs text-[#389734] font-bold mb-1 bg-green-50 px-2 py-0.5 rounded-md">
                  +12% vs last month
                </span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex flex-col relative hover:-translate-y-1 hover:shadow-md transition-all duration-300">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2.5 bg-blue-50 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                </div>
                <div className="bg-gray-100 text-gray-400 text-[10px] font-bold px-2 py-1 rounded-md">THIS CYCLE</div>
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-2">On-Time Payments</p>
              <div className="flex items-end gap-2 mt-1">
                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">15</h2>
                <span className="text-sm text-gray-500 font-medium mb-0.5">members</span>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex flex-col relative hover:-translate-y-1 hover:shadow-md transition-all duration-300">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2.5 bg-red-50 rounded-xl relative">
                  <Clock className="w-5 h-5 text-red-600" />
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-white"></span>
                  </span>
                </div>
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-2">Late Payments</p>
              <div className="flex items-end gap-3 mt-1">
                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">3</h2>
                <span className="text-xs text-red-600 font-bold mb-1 bg-red-50 px-2 py-0.5 rounded-md border border-red-100 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3"/> Action Required
                </span>
              </div>
            </div>
          </div>

          {/* Table Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            
            {/* Table Toolbar */}
            <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white">
              <h3 className="text-lg font-bold text-gray-900">Payment Records</h3>
              
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button className="bg-[#5CBA47] hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                  <Plus className="w-4 h-4" />
                  Record Payment
                </button>
                
                <button className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                  <Download className="w-4 h-4" />
                  Export
                </button>
              </div>
            </div>

            {/* Actual Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-[#66B538] text-xs font-semibold text-white uppercase tracking-wide">
                    <th className="px-6 py-4">Payment ID</th>
                    <th className="px-6 py-4">Member Name</th>
                    <th className="px-6 py-4">Loan Type</th>
                    <th className="px-6 py-4">Amount Paid</th>
                    <th className="px-6 py-4">Payment Date</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Remaining Balance</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-gray-700 divide-y divide-gray-100">
                  {paymentsData.map((row, index) => (
                    <tr key={index} className="table-row-enter hover:bg-green-50 transition-colors">
                      <td className="px-6 py-4 text-gray-500 font-medium">{row.id}</td>
                      <td className="px-6 py-4 font-semibold text-gray-900">{row.name}</td>
                      <td className="px-6 py-4">
                        {/* REVERTED TO ORIGINAL */}
                        <span className={`badge-animated px-3 py-1 rounded-full text-xs font-semibold ${getLoanBadgeClass(row.type)}`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-900">{row.amount}</td>
                      <td className="px-6 py-4 text-gray-500">{row.date}</td>
                      <td className="px-6 py-4">
                        {/* REVERTED TO ORIGINAL */}
                        <span className={`badge-animated px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 w-max ${
                          row.status === 'On-Time' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${row.status === 'On-Time' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-600">{row.balance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination - REVERTED TO ORIGINAL */}
            <div className="p-4 border-t border-gray-200 flex justify-center items-center gap-2">
              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#389734] text-white font-medium text-sm">
                1
              </button>
              {[2, 3, 4, 5].map((num) => (
                <button key={num} className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium text-sm">
                  {num}
                </button>
              ))}
              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-50">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default Payments;