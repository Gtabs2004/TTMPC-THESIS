import React, { useState, useEffect } from "react";
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
  ArrowLeft,
  BookOpen,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronUp
} from 'lucide-react';

// --- MOCK DATA ORGANIZED BY TAB ---
const MOCK_LEDGER_DATA = {
  Daily: [
    {
      date: "Thursday, April 30, 2026",
      memberCount: 6,
      totalCash: "P3,145.00",
      totalCredit: "P1,234.00",
      totalAmount: "P4,379.00",
      members: [
        { id: 'd1', name: "Miguel Torres", memberId: "MEM-008", initial: "M", initialColor: "text-teal-600 bg-teal-50", txnText: "1 txn", cashAmount: "P560.00", creditAmount: "P0.00", totalAmount: "P560.00", transactions: [{ posId: "POS-ZJ66PD45", date: "Apr 30, 2026", type: "Cash", status: "Paid", amount: "P560.00" }] },
        { id: 'd2', name: "Rosa Garcia", memberId: "MEM-003", initial: "R", initialColor: "text-green-600 bg-green-50", txnText: "2 txns", cashAmount: "P1,733.00", creditAmount: "P0.00", totalAmount: "P1,733.00" },
        { id: 'd3', name: "Elena Cruz", memberId: "MEM-009", initial: "E", initialColor: "text-blue-600 bg-blue-50", txnText: "1 txn", cashAmount: "P712.00", creditAmount: "P0.00", totalAmount: "P712.00" },
        { id: 'd4', name: "Pedro Reyes", memberId: "MEM-004", initial: "P", initialColor: "text-gray-600 bg-gray-100", txnText: "1 txn", cashAmount: "P0.00", creditAmount: "P565.00", totalAmount: "P565.00" },
      ]
    }
  ],
  Weekly: [
    {
      date: "Week 18, 2026",
      memberCount: 10,
      totalCash: "P9,182.00",
      totalCredit: "P4,113.00",
      totalAmount: "P13,295.00",
      members: [
        { id: 'w1', name: "Miguel Torres", memberId: "MEM-008", initial: "M", initialColor: "text-teal-600 bg-teal-50", txnText: "5 txns", cashAmount: "P1,592.00", creditAmount: "P1,150.00", totalAmount: "P2,742.00", transactions: [{ posId: "POS-WEEKLY", date: "Apr 28, 2026", type: "Cash", status: "Paid", amount: "P1,592.00" }] },
        { id: 'w2', name: "Rosa Garcia", memberId: "MEM-003", initial: "R", initialColor: "text-green-600 bg-green-50", txnText: "6 txns", cashAmount: "P3,434.00", creditAmount: "P598.00", totalAmount: "P4,032.00" },
        { id: 'w3', name: "Elena Cruz", memberId: "MEM-009", initial: "E", initialColor: "text-blue-600 bg-blue-50", txnText: "1 txn", cashAmount: "P712.00", creditAmount: "P0.00", totalAmount: "P712.00" },
        { id: 'w4', name: "Pedro Reyes", memberId: "MEM-004", initial: "P", initialColor: "text-gray-600 bg-gray-100", txnText: "1 txn", cashAmount: "P0.00", creditAmount: "P565.00", totalAmount: "P565.00" },
      ]
    }
  ],
  Monthly: [
    {
      date: "April 2026",
      memberCount: 10,
      totalCash: "P50,343.00",
      totalCredit: "P28,283.00",
      totalAmount: "P78,626.00",
      members: [
        { id: 'm1', name: "Miguel Torres", memberId: "MEM-008", initial: "M", initialColor: "text-teal-600 bg-teal-50", txnText: "14 txns", cashAmount: "P5,029.00", creditAmount: "P2,965.00", totalAmount: "P7,994.00", transactions: [{ posId: "POS-MONTHLY", date: "Apr 15, 2026", type: "Mixed", status: "Paid", amount: "P7,994.00" }] },
        { id: 'm2', name: "Rosa Garcia", memberId: "MEM-003", initial: "R", initialColor: "text-green-600 bg-green-50", txnText: "24 txns", cashAmount: "P10,950.00", creditAmount: "P3,983.00", totalAmount: "P14,933.00" },
        { id: 'm3', name: "Elena Cruz", memberId: "MEM-009", initial: "E", initialColor: "text-blue-600 bg-blue-50", txnText: "11 txns", cashAmount: "P1,981.00", creditAmount: "P1,812.00", totalAmount: "P3,793.00" },
        { id: 'm4', name: "Pedro Reyes", memberId: "MEM-004", initial: "P", initialColor: "text-gray-600 bg-gray-100", txnText: "17 txns", cashAmount: "P5,357.00", creditAmount: "P3,197.00", totalAmount: "P8,554.00" },
      ]
    }
  ],
  Yearly: [
    {
      date: "2026",
      memberCount: 10,
      totalCash: "P50,983.00",
      totalCredit: "P28,473.00",
      totalAmount: "P79,456.00",
      members: [
        { id: 'y1', name: "Miguel Torres", memberId: "MEM-008", initial: "M", initialColor: "text-teal-600 bg-teal-50", txnText: "14 txns", cashAmount: "P5,029.00", creditAmount: "P2,965.00", totalAmount: "P7,994.00", transactions: [{ posId: "POS-YEARLY", date: "Jan-Apr 2026", type: "Mixed", status: "Paid", amount: "P7,994.00" }] },
        { id: 'y2', name: "Rosa Garcia", memberId: "MEM-003", initial: "R", initialColor: "text-green-600 bg-green-50", txnText: "25 txns", cashAmount: "P10,950.00", creditAmount: "P4,173.00", totalAmount: "P15,123.00" },
        { id: 'y3', name: "Elena Cruz", memberId: "MEM-009", initial: "E", initialColor: "text-blue-600 bg-blue-50", txnText: "11 txns", cashAmount: "P1,981.00", creditAmount: "P1,812.00", totalAmount: "P3,793.00" },
        { id: 'y4', name: "Pedro Reyes", memberId: "MEM-004", initial: "P", initialColor: "text-gray-600 bg-gray-100", txnText: "17 txns", cashAmount: "P5,357.00", creditAmount: "P3,197.00", totalAmount: "P8,554.00" },
      ]
    }
  ]
};

const Grocery_Ledger = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  
  // State for toggles
  const [activeFilter, setActiveFilter] = useState("Daily");
  const [expandedDates, setExpandedDates] = useState([]);
  const [expandedMembers, setExpandedMembers] = useState([]);

  // Auto-expand the first date group when the filter changes
  useEffect(() => {
    const currentData = MOCK_LEDGER_DATA[activeFilter];
    if (currentData && currentData.length > 0) {
      setExpandedDates([currentData[0].date]);
      // Optional: Auto-expand the first member too
      if (currentData[0].members.length > 0) {
         setExpandedMembers([currentData[0].members[0].id]);
      }
    }
  }, [activeFilter]);

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

  const toggleDate = (dateString) => {
    setExpandedDates(prev => 
      prev.includes(dateString) ? prev.filter(d => d !== dateString) : [...prev, dateString]
    );
  };

  const toggleMember = (memberId) => {
    setExpandedMembers(prev => 
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
    );
  };

  const currentLedgerData = MOCK_LEDGER_DATA[activeFilter] || [];

  return (
    <div className="flex min-h-screen bg-[#fafafa]">
      
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
              Grocery: "/grocery",
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

      {/* --- MAIN AREA --- */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 sticky top-0 z-10">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              placeholder="Search..."
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 pl-9 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="src/assets/img/bookkeeper-profile.png" alt="Bookkeeper Profile" className="ml-4 w-8 h-8 rounded-full object-cover bg-gray-200" />
          <div className="ml-3 hidden md:block">
            <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
          </div>
        </header>

        {/* Page Content */}
        <main className="p-8 max-w-[1200px] w-full mx-auto">
          
          {/* Top Navigation & Title */}
          <div className="flex justify-between items-start mb-8">
            <div className="flex items-start gap-6">
              <button 
                onClick={() => navigate('/grocery')} 
                className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors mt-1"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </button>
              
              <div>
                <div className="flex items-center gap-3">
                  <BookOpen className="w-6 h-6 text-green-700" />
                  <h1 className="font-bold text-2xl text-[#1a3b47]">Ledger</h1>
                </div>
                <p className="text-sm text-gray-500 mt-1 ml-9">157 total records - All periods</p>
              </div>
            </div>
            
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-5 gap-4 mb-8">
            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-2">Total Gross</p>
              <h2 className="text-2xl font-bold text-gray-900">P79,456.00</h2>
            </div>
            
            <div className="bg-[#eef8f3] rounded-xl p-5 border border-green-100 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-green-700 tracking-wider uppercase mb-2">Cash Sales</p>
              <h2 className="text-2xl font-bold text-green-800">P50,983.00</h2>
            </div>
            
            <div className="bg-[#fff7f0] rounded-xl p-5 border border-orange-100 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-orange-700 tracking-wider uppercase mb-2">On Credit Sales</p>
              <h2 className="text-2xl font-bold text-orange-800">P28,473.00</h2>
            </div>

            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-2">Paid Transactions</p>
              <h2 className="text-2xl font-bold text-teal-600">97</h2>
            </div>

            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-2">On Credit Transactions</p>
              <h2 className="text-2xl font-bold text-orange-500">60</h2>
            </div>
          </div>

          {/* Transaction Ledger List */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            
            {/* Header & Filters */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-[#1a3b47]">Transaction Ledger</h2>
                <p className="text-sm text-gray-500">Grouped by {activeFilter.toLowerCase()} — click a member to expand transactions</p>
              </div>
              
              <div className="flex bg-gray-50 border border-gray-200 rounded-full p-1">
                {['Daily', 'Weekly', 'Monthly', 'Yearly'].map(filter => (
                  <button 
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      activeFilter === filter 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {/* Render Groups based on Active Filter */}
            <div className="space-y-6">
              {currentLedgerData.map((group, gIdx) => {
                const isGroupExpanded = expandedDates.includes(group.date);

                return (
                  <div key={gIdx} className="flex flex-col">
                    {/* Date Header Row */}
                    <div 
                      className="flex justify-between items-center py-2 cursor-pointer group"
                      onClick={() => toggleDate(group.date)}
                    >
                      <div className="flex items-center gap-2">
                        {isGroupExpanded ? (
                          <ChevronDown className="w-5 h-5 text-green-600" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                        )}
                        <h3 className="font-bold text-gray-900">{group.date}</h3>
                        <span className="text-sm text-gray-400">({group.memberCount} members)</span>
                      </div>
                      
                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Cash</span>
                          <span className="font-semibold text-green-700">{group.totalCash}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">On Credit</span>
                          <span className="font-semibold text-orange-600">{group.totalCredit}</span>
                        </div>
                        <div className="flex items-center gap-1 ml-4">
                          <span className="text-gray-500">Total</span>
                          <span className="font-bold text-gray-900">{group.totalAmount}</span>
                        </div>
                      </div>
                    </div>

                    {/* Group Items */}
                    {isGroupExpanded && (
                      <div className="mt-4 space-y-3">
                        {group.members.map((member) => {
                          const isMemberExpanded = expandedMembers.includes(member.id);

                          return (
                            <div 
                              key={member.id} 
                              className={`border rounded-xl transition-all ${
                                isMemberExpanded ? 'border-gray-200 shadow-sm' : 'border-gray-100 hover:border-gray-200'
                              }`}
                            >
                              {/* Member Row */}
                              <div 
                                className="flex items-center justify-between p-4 cursor-pointer"
                                onClick={() => toggleMember(member.id)}
                              >
                                <div className="flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${member.initialColor}`}>
                                    {member.initial}
                                  </div>
                                  <div>
                                    <p className="font-bold text-sm text-gray-900">{member.name}</p>
                                    <p className="text-xs text-gray-400">{member.memberId} - {member.txnText}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-8">
                                  {/* Cash / Credit Breakdown */}
                                  <div className="text-right hidden sm:block">
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Cash / On Credit</p>
                                    <div className="flex items-center gap-1 text-sm font-semibold">
                                      <span className="text-green-600">{member.cashAmount}</span>
                                      <span className="text-gray-300">/</span>
                                      <span className="text-orange-500">{member.creditAmount}</span>
                                    </div>
                                  </div>
                                  
                                  {/* Total Amount */}
                                  <div className="flex items-center gap-4">
                                    <span className="font-bold text-gray-900">{member.totalAmount}</span>
                                    {isMemberExpanded ? (
                                      <ChevronUp className="w-5 h-5 text-gray-400" />
                                    ) : (
                                      <ChevronRight className="w-5 h-5 text-gray-400" />
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Expanded Transaction Details */}
                              {isMemberExpanded && member.transactions && (
                                <div className="border-t border-gray-100 bg-gray-50/50 p-4 rounded-b-xl flex justify-between items-center">
                                  <div className="flex items-center gap-4 text-xs">
                                    <span className="text-gray-400 font-mono">{member.transactions[0].posId}</span>
                                    <span className="text-gray-500">{member.transactions[0].date}</span>
                                    <span className="px-2 py-1 bg-white border border-gray-200 rounded text-gray-600 font-medium">
                                      {member.transactions[0].type}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center gap-4">
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                      Paid
                                    </span>
                                    <span className="text-sm font-bold text-gray-900">{member.transactions[0].amount}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default Grocery_Ledger;