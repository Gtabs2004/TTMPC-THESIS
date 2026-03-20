import React from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Activity, 
  History,
  Search,
  Bell,
  Menu,
  X,
  Wallet,
  CalendarDays,
  Banknote,
  Download,
  PlusCircle,
  TrendingUp,
  FilePlus,
  BarChart3,
  MinusCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const Member_Savings = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Loans", icon: Activity },
    { name: "Loan Lifecycle", icon: History },
    { name: "Member Profile", icon: Users },
    { name: "Member Savings", icon: CreditCard }
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

  // Mock data for the savings ledger table
  const ledgerData = [
    { id: 1, date: "Nov 15, 2023", type: "Monthly Deposit (Regular)", typeIcon: "plus", amount: "+₱5,000.00", amountColor: "text-green-600", balance: "₱85,420.50" },
    { id: 2, date: "Oct 31, 2023", type: "Interest Credit (Time Deposit)", typeIcon: "trend", amount: "+₱1,250.00", amountColor: "text-green-600", balance: "₱80,420.50" },
    { id: 3, date: "Oct 15, 2023", type: "Monthly Deposit (Regular)", typeIcon: "plus", amount: "+₱5,000.00", amountColor: "text-green-600", balance: "₱79,170.50" },
    { id: 4, date: "Sep 30, 2023", type: "New Time Deposit Placement", typeIcon: "new", amount: "₱0.00", amountColor: "text-gray-900", balance: "₱74,170.50" },
    { id: 5, date: "Sep 15, 2023", type: "Monthly Deposit (Regular)", typeIcon: "plus", amount: "+₱5,000.00", amountColor: "text-green-600", balance: "₱74,170.50" },
    { id: 6, date: "Aug 31, 2023", type: "Dividend Payout Credit", typeIcon: "chart", amount: "+₱2,145.50", amountColor: "text-green-600", balance: "₱69,170.50" },
    { id: 7, date: "Aug 15, 2023", type: "Monthly Deposit (Regular)", typeIcon: "plus", amount: "+₱5,000.00", amountColor: "text-green-600", balance: "₱67,025.00" },
    { id: 8, date: "Jul 15, 2023", type: "Partial Withdrawal", typeIcon: "minus", amount: "-₱10,000.00", amountColor: "text-red-500", balance: "₱62,025.00" },
  ];

  // Helper function to render the correct icon per transaction type
  const renderTransactionIcon = (type) => {
    switch(type) {
      case 'plus': return <PlusCircle className="w-4 h-4 text-green-600" />;
      case 'trend': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'new': return <FilePlus className="w-4 h-4 text-yellow-500" />;
      case 'chart': return <BarChart3 className="w-4 h-4 text-green-600" />;
      case 'minus': return <MinusCircle className="w-4 h-4 text-red-500" />;
      default: return <PlusCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="relative flex min-h-screen bg-[#F8F9FA]">
      {isSidebarOpen ? (
        <button
          aria-label="Close sidebar overlay"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
        />
      ) : null}
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-white p-4 flex flex-col border-r border-gray-200 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          aria-label="Close sidebar"
          onClick={() => setIsSidebarOpen(false)}
          className="absolute right-3 top-3 rounded-md p-1 text-gray-500 hover:bg-gray-100 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              Members Portal
            </p>
          </div>
        </div>
   
        <hr className="w-full border-gray-100 mb-6" />
   
        <nav className="flex grow flex-col gap-2 text-sm">
          {(() => {
            const routeMap = {
              "Dashboard": "/member-dashboard",
              "Member Loans": "/member-loans",
              "Loan Lifecycle": "/member-lifecycle",
              "Member Profile": "/members-profile",
              "Member Savings": "/member-savings"
            };
       
            return menuItems.map((item) => {
              const Icon = item.icon;
              const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;
       
              return (
                <NavLink
                  key={item.name}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-[#EAF1EB] text-[#1D6021] font-bold'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-[#1D6021] font-medium'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                      <span>{item.name}</span>
                    </>
                  )}
                </NavLink>
              );
            });
          })()}
        </nav>
   
        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded-lg p-2.5 text-sm bg-[#1D6021] hover:bg-[#154718] text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>
   
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden lg:pl-0">
        {/* Header */}
        <header className="bg-white h-16 shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 border-b border-gray-100">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              aria-label="Open sidebar"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] lg:hidden">Savings</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              className="bg-gray-50 w-64 h-10 rounded-full border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D6021] focus:bg-white transition-all"
              placeholder="Search..."
            />
          </div>
          <button className="relative p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          
          <div className="flex items-center gap-2 sm:gap-3 border-l border-gray-200 pl-2 sm:pl-4 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
               <img src="src/assets/img/member-profile.png" alt="Profile" className="w-full h-full object-cover" />
            </div>
            <p className="hidden sm:block text-sm font-bold text-gray-700">Member</p>
          </div>
          </div>
        </header>
   
        {/* Scrollable Main */}
        <main className="p-4 sm:p-6 lg:p-8 overflow-y-auto">
          
          {/* Top Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
            {/* Regular Savings Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-[#EAF1EB] flex items-center justify-center mb-6">
                <Wallet className="w-5 h-5 text-[#1D6021]" />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Regular Savings</p>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900">₱85,420.50</h3>
            </div>

            {/* Time Deposit Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-[#EAF1EB] flex items-center justify-center mb-6">
                <CalendarDays className="w-5 h-5 text-[#1D6021]" />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Time Deposit</p>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900">₱150,000.00</h3>
            </div>

            {/* Total Savings Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-[#1D6021] flex items-center justify-center mb-6">
                <Banknote className="w-5 h-5 text-white" />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Total Savings</p>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900">₱235,420.50</h3>
            </div>
          </div>

          {/* Savings Ledger Container */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            
            {/* Ledger Header */}
            <div className="p-6 flex items-center justify-between border-b border-gray-100">
               <div>
                 <h3 className="text-xl font-bold text-gray-900">Savings Ledger</h3>
                 <p className="text-xs text-gray-400 font-medium mt-1">Detailed history of all savings transactions</p>
               </div>
               <button className="flex items-center gap-2 bg-[#EAF1EB] text-[#1D6021] hover:bg-[#d8e6da] transition-colors px-4 py-2 rounded-lg text-xs font-bold">
                 <Download className="w-3.5 h-3.5" /> Export Statement
               </button>
            </div>
            
            {/* Ledger Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-180 text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAF9FB] border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                    <th className="p-5 font-bold">Date</th>
                    <th className="p-5 font-bold">Transaction Type</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold text-right pr-8">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerData.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors last:border-0">
                      <td className="p-5 text-sm text-gray-500 font-medium whitespace-nowrap">{row.date}</td>
                      <td className="p-5 text-sm font-bold text-gray-700 flex items-center gap-3">
                        {renderTransactionIcon(row.typeIcon)}
                        {row.type}
                      </td>
                      <td className={`p-5 text-sm font-bold text-right whitespace-nowrap ${row.amountColor}`}>
                        {row.amount}
                      </td>
                      <td className="p-5 text-sm font-black text-gray-900 text-right pr-8 whitespace-nowrap">
                        {row.balance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination / Footer */}
            <div className="p-5 border-t border-gray-100 flex items-center justify-center gap-2">
              <button
                className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled
              >
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

export default Member_Savings;