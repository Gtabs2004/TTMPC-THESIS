import React, { useState } from "react";
import { useNavigate, NavLink, Link } from "react-router-dom";
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
  ShoppingCart,
  CheckCircle2,
  AlertCircle,
  Wifi,
  RefreshCw,
  BookOpen,
  Calendar,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown
} from 'lucide-react';

// --- MOCK DATA FOR THE TABLE ---
const MOCK_TRANSACTIONS = [
  { id: 'GR-TTMPC-00001', memberId: 'TTMPCM-001', posId: 'POS - 001', date: 'Feb. 10, 2026 - 10:30 AM', amount: 'P1,100.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00002', memberId: 'TTMPCM-002', posId: 'POS - 001', date: 'Feb. 10, 2026 - 10:45 AM', amount: 'P3,500.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00003', memberId: 'TTMPCM-014', posId: 'POS - 001', date: 'Feb. 10, 2026 - 10:50 AM', amount: 'P1,350.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00004', memberId: 'TTMPCM-124', posId: 'POS - 001', date: 'Feb. 10, 2026 - 10:55 AM', amount: 'P400.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00005', memberId: 'TTMPCM-128', posId: 'POS - 001', date: 'Feb. 10, 2026 - 12:50 PM', amount: 'P2,500.00', txStatus: 'Pending', payment: 'On Credit', balance: 'P2,500.00' },
  { id: 'GR-TTMPC-00006', memberId: 'TTMPCM-063', posId: 'POS - 001', date: 'Feb. 10, 2026 - 1:15 PM', amount: 'P1,100.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00007', memberId: 'TTMPCM-046', posId: 'POS - 001', date: 'Feb. 10, 2026 - 1:40 PM', amount: 'P750.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00008', memberId: 'TTMPCM-202', posId: 'POS - 001', date: 'Feb. 10, 2026 - 2:25 PM', amount: 'P650.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00009', memberId: 'TTMPCM-182', posId: 'POS - 001', date: 'Feb. 10, 2026 - 2:38 PM', amount: 'P800.00', txStatus: 'Pending', payment: 'On Credit', balance: 'P800.00' },
];

const Grocery = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('All');
  
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
    { name: "Grocery", icon: CreditCard },
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

  // Helper component for the status badges
  const StatusBadge = ({ type, text }) => {
    const isSuccess = text === 'Completed' || text === 'Paid';
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
        isSuccess 
          ? 'bg-green-50 text-green-700 border-green-200' 
          : 'bg-orange-50 text-orange-700 border-orange-200'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${isSuccess ? 'bg-green-500' : 'bg-orange-500'}`}></span>
        {text}
      </span>
    );
  };

  return (
    <div className="flex min-h-screen bg-gray-50/50 text-gray-800 font-sans">
      
      {/* --- SIDEBAR --- */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200 sticky top-0 h-screen overflow-y-auto">
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
              "Manage Loans": "/manage-loans",
              Payments: "/payments",
              Accounting: "/accounting",
              "MIGS Scoring": "/migs",
              Reports: "/reports",
              "Audit Trail": "/audit-trail",
              Grocery: "/grocery"
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
                        : 'text-gray-600 hover:bg-green-50 hover:text-green-700'
                    }`
                  }
                >
                  <Icon size={18} />
                  <span>{item.name}</span>
                </NavLink>
              );
            });
          })()}
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-6 w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Header */}
        <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-end px-8 sticky top-0 z-10">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              placeholder="Search..."
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-200 px-10 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="src/assets/img/bookkeeper-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full object-cover bg-gray-200" />
          <div className="ml-3 hidden md:block">
             <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
          </div>
        </header>

        {/* Page Content */}
        <main className="p-8 max-w-7xl mx-auto w-full">
          
          {/* Page Title & Actions */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <h1 className="font-bold text-3xl text-[#1a3b47]">Grocery Transactions</h1>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm font-medium">
                <Wifi className="w-4 h-4" />
                POS Connected - 1:27 PM
              </span>
              <button className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
                <RefreshCw className="w-4 h-4" />
                Sync POS
              </button>
              <Link to="/grocery-ledger" className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
                <BookOpen className="w-4 h-4" />
                View Ledger
              </Link>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Total Transactions Card */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="bg-green-50 p-3 rounded-lg text-green-600">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-1">Total Transactions</p>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-2xl font-bold text-gray-900">8</h2>
                  <span className="text-sm text-gray-500">P18,000</span>
                </div>
              </div>
            </div>

            {/* Paid Card */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="bg-green-50 p-3 rounded-lg text-green-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-1">Paid</p>
                <h2 className="text-2xl font-bold text-gray-900">6</h2>
              </div>
            </div>

            {/* On Credit Card */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="bg-orange-50 p-3 rounded-lg text-orange-500">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-1">On Credit</p>
                <h2 className="text-2xl font-bold text-gray-900">2</h2>
              </div>
            </div>
          </div>

          {/* Main Data Table Area */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-6">
              {[
                { label: 'All', count: 12, color: 'green' },
                { label: 'Paid', count: 8, color: 'blue' },
                { label: 'On Credit', count: 5, color: 'orange' }
              ].map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => setActiveTab(tab.label)}
                  className={`flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.label 
                      ? 'border-green-500 text-green-700' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    tab.color === 'green' ? 'bg-green-100 text-green-700' :
                    tab.color === 'blue' ? 'bg-blue-100 text-blue-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Table Toolbar */}
            <div className="p-6 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-100">
              <h2 className="text-xl font-bold text-[#1a3b47]">Grocery Transactions</h2>
              
              <div className="flex flex-1 justify-end items-center gap-3 w-full md:w-auto">
                <div className="relative max-w-sm w-full">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/>
                  <input 
                    type="text" 
                    placeholder="Search by Grocery ID, Member ID, or POS ID..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  April 2026
                  <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
                </button>
                
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  <Download className="w-4 h-4 text-gray-400" />
                  Export List
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-4">Grocery ID</th>
                    <th className="px-6 py-4">Member ID</th>
                    <th className="px-6 py-4">POS ID</th>
                    <th className="px-6 py-4">Transaction Date</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">TX Status</th>
                    <th className="px-6 py-4">Payment</th>
                    <th className="px-6 py-4">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {MOCK_TRANSACTIONS.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-700">{tx.id}</td>
                      <td className="px-6 py-4 font-medium text-gray-700">{tx.memberId}</td>
                      <td className="px-6 py-4 text-gray-500">{tx.posId}</td>
                      <td className="px-6 py-4 text-gray-500">{tx.date}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">{tx.amount}</td>
                      <td className="px-6 py-4">
                        <StatusBadge type="status" text={tx.txStatus} />
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge type="payment" text={tx.payment} />
                      </td>
                      <td className={`px-6 py-4 font-semibold ${tx.balance !== 'P0.00' ? 'text-red-500' : 'text-gray-900'}`}>
                        {tx.balance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-center items-center gap-2">
              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {[1, 2, 3, 4, 5].map((page) => (
                <button 
                  key={page} 
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium ${
                    page === 1 
                      ? 'bg-green-600 text-white' 
                      : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {page}
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

export default Grocery;