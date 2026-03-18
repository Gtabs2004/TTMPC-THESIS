import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
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
  ChevronRight
} from 'lucide-react';

// Mock data matching your screenshot
const paymentsData = [
  { id: "TTMPCPAY-2026-001", name: "Romelyn Delos Reyes", type: "Bonus", amount: "₱2,000", date: "Feb. 10, 2026", status: "On-Time", balance: "₱18,000" },
  { id: "TTMPCPAY-2026-002", name: "Erden Jhed Teope", type: "Emergency", amount: "₱2,500", date: "Feb. 10, 2026", status: "On-Time", balance: "₱22,500" },
  { id: "TTMPCPAY-2026-003", name: "Ashley Nicole Bulataolo", type: "Consolidated", amount: "₱10,000", date: "Feb. 10, 2026", status: "On-Time", balance: "₱110,000" },
  { id: "TTMPCPAY-2026-004", name: "Karina Dela Cruz", type: "Bonus", amount: "₱2,000", date: "Feb. 11, 2026", status: "On-Time", balance: "₱18,000" },
  { id: "TTMPCPAY-2026-005", name: "Gero Antoni Tablolo", type: "Emergency", amount: "₱2,500", date: "Feb. 11, 2026", status: "On-Time", balance: "₱22,500" },
  { id: "TTMPCPAY-2026-006", name: "Nash Ervine Slaton", type: "Consolidated", amount: "₱15,000", date: "Feb. 12, 2026", status: "On-Time", balance: "₱165,000" },
  { id: "TTMPCPAY-2026-007", name: "Paul Soriano", type: "Consolidated", amount: "₱5,000", date: "Feb. 12, 2026", status: "On-Time", balance: "₱55,000" },
  { id: "TTMPCPAY-2026-008", name: "Joseph Mercado", type: "Consolidated", amount: "₱4,500", date: "Feb. 12, 2026", status: "Late", balance: "₱45,000" },
  { id: "TTMPCPAY-2026-009", name: "Antonio Ramirez", type: "Emergency", amount: "₱3,500", date: "Feb. 13, 2026", status: "On-Time", balance: "₱38,500" },
];

const Payments = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  
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

  // Helper function for loan type badge colors
  const getLoanBadgeClass = (type) => {
    switch(type) {
      case 'Bonus': return 'bg-blue-100 text-blue-700';
      case 'Emergency': return 'bg-red-100 text-red-700';
      case 'Consolidated': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* Sidebar */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Treasurer Portal
            </p>
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
                        ? 'bg-green-50 text-[#389734] font-semibold'
                        : 'text-gray-700 hover:bg-green-50 hover:text-[#389734]'
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
          className="mt-auto w-full rounded p-2 text-xs bg-[#389734] hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-end px-8">
          
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="src/assets/img/treasurer-profile.png" alt="Treasurer Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <p className="ml-2 font-medium text-sm text-gray-700">Treasurer</p>
        </header>

        {/* Page Content */}
        <main className="p-8">
          
          {/* Top Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Card 1 */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex flex-col relative">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-green-50 rounded-lg">
                  <Wallet className="w-6 h-6 text-green-600" />
                </div>
                <TrendingUp className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-sm text-gray-500 font-medium">Total Collected</p>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">₱125,500.00</h2>
              <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                 ↻ Recent payments tracked
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex flex-col relative">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-green-50 rounded-lg">
                  <CalendarCheck className="w-6 h-6 text-green-600" />
                </div>
                <CheckCircle2 className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-sm text-gray-500 font-medium">On-Time Payments</p>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">15</h2>
              <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                 ↻ Active collection cycle
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex flex-col relative">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-red-50 rounded-lg">
                  <Clock className="w-6 h-6 text-red-500" />
                </div>
                <div className="w-2 h-2 bg-red-500 rounded-full mt-1"></div>
              </div>
              <p className="text-sm text-gray-500 font-medium">Late Payments</p>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">3</h2>
              <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                ! Requires follow-up
              </p>
            </div>
          </div>

          {/* Table Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            {/* Table Header Controls */}
            <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
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
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600 tracking-wide">
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
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-gray-500 font-medium">{row.id}</td>
                      <td className="px-6 py-4 font-semibold text-gray-900">{row.name}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getLoanBadgeClass(row.type)}`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-900">{row.amount}</td>
                      <td className="px-6 py-4 text-gray-500">{row.date}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 w-max ${
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

            {/* Pagination */}
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