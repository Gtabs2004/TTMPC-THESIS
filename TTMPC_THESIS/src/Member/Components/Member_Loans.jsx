import React from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Activity, 
  Search,
  Bell,
  Banknote,
  CalendarClock,
  FileText,
  Calculator,
  ArrowRight,
  Info
} from 'lucide-react';

const Member_Loans = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Loans", icon: Activity },
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

  const activeLoans = [
    { id: "BON-2023-0422", type: "Emergency Loan", originalAmount: "₱100,000.00", balance: "₱82,500.00", payment: "₱2,500.00", nextDue: "11/15/2023", status: "Active" },
    { id: "BON-2022-1102", type: "Bonus Loan", originalAmount: "₱120,000.00", balance: "₱20,000.00", payment: "₱1000.00", nextDue: "11/15/2023", status: "Delinquent" }
  ];

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]">
      {/* Sidebar */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
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
   
        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
            const routeMap = {
              "Dashboard": "/member-dashboard",
              "Member Loans": "/member-loans",
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
   
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 z-10 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              className="bg-gray-50 w-64 h-10 rounded-full border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D6021] focus:bg-white transition-all"
              placeholder="Search..."
            />
          </div>
          <button className="ml-6 relative p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          
          <div className="flex items-center ml-4 gap-3 border-l border-gray-200 pl-4 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
               <img src="src/assets/img/member-profile.png" alt="Member Profile" className="w-full h-full object-cover" />
            </div>
            <p className="text-sm font-bold text-gray-700">Member</p>
          </div>
        </header>
   
        {/* Scrollable Page Content */}
        <main className="p-8 overflow-y-auto">
          <h1 className="font-extrabold text-[#1a4a2f] text-2xl mb-8">Loans</h1>
          
          {/* Top Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            
            {/* Balance Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center mb-4 border border-gray-200">
                <Banknote className="w-4 h-4 text-gray-600" />
              </div>
              <p className="text-xs font-bold text-gray-500 mb-1">Total Outstanding Balance</p>
              <h3 className="text-3xl font-black text-gray-900 mb-2">₱512,500.00</h3>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-auto flex items-center">
                <CalendarClock className="w-3 h-3 mr-1" /> Last Updated: 11/01/2023
              </p>
            </div>

            {/* Commitment Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden">
               <div className="absolute top-6 right-6 bg-[#EAF1EB] text-[#1D6021] px-2 py-1 rounded text-[9px] font-extrabold tracking-wider uppercase">
                Auto-Debit Active
              </div>
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center mb-4 border border-gray-200">
                <CalendarClock className="w-4 h-4 text-[#1D6021]" />
              </div>
              <p className="text-xs font-bold text-gray-500 mb-1">Monthly Commitment</p>
              <h3 className="text-3xl font-black text-gray-900 mb-2">₱14,200.00</h3>
              <p className="text-[10px] font-bold text-gray-600 mt-auto">
                Next Deduction: 11/15/2023
              </p>
            </div>

            {/* Active Loans Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center mb-4 border border-gray-200">
                <FileText className="w-4 h-4 text-gray-600" />
              </div>
              <p className="text-xs font-bold text-gray-500 mb-1">Active Loans</p>
              <h3 className="text-3xl font-black text-gray-900 mb-2">2</h3>
              
              <div className="flex items-center gap-2 mt-auto">
                <div className="flex -space-x-1.5">
                  <div className="w-5 h-5 rounded-full bg-blue-500 border border-white flex items-center justify-center text-[8px] text-white font-bold">EM</div>
                  <div className="w-5 h-5 rounded-full bg-orange-500 border border-white flex items-center justify-center text-[8px] text-white font-bold">BN</div>
                </div>
                <p className="text-[10px] font-medium text-gray-400">Emergency, Bonus</p>
              </div>
            </div>

          </div>

          {/* Active Loans Summary Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8 flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-gray-100">
               <h3 className="text-lg font-bold text-gray-900">Active Loans Summary</h3>
               <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded text-[9px] font-extrabold tracking-widest uppercase">
                 Read-Only View
               </span>
            </div>
            
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF9FB] border-b border-gray-100 text-[9px] uppercase tracking-wider text-gray-400 font-bold">
                  <th className="p-5 font-bold">Loan Type</th>
                  <th className="p-5 font-bold">Original Amount</th>
                  <th className="p-5 font-bold">Remaining Balance</th>
                  <th className="p-5 font-bold">Monthly Payment</th>
                  <th className="p-5 font-bold">Next Due</th>
                  <th className="p-5 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeLoans.map((loan, idx) => (
                  <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors last:border-0">
                    <td className="p-5">
                      <p className="text-sm font-bold text-gray-900">{loan.type}</p>
                      <p className="text-[10px] text-gray-400 font-medium">ID: {loan.id}</p>
                    </td>
                    <td className="p-5 text-sm font-bold text-gray-600">{loan.originalAmount}</td>
                    <td className="p-5 text-sm font-black text-gray-900">{loan.balance}</td>
                    <td className="p-5 text-sm font-bold text-[#1D6021]">{loan.payment}</td>
                    <td className="p-5 text-sm font-medium text-gray-500">{loan.nextDue}</td>
                    <td className="p-5">
                      <span className={`px-2.5 py-1 rounded text-[10px] font-extrabold tracking-wider ${
                        loan.status === 'Active' ? 'bg-[#EAF1EB] text-[#1D6021]' : 'bg-[#FEF08A] text-[#854D0E]'
                      }`}>
                        {loan.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Grid: Breakdown & Eligibility */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Recent Payment Breakdown */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col">
              <div className="mb-6 pb-6 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">Recent Payment Breakdown</h3>
                <p className="text-xs text-gray-400 font-medium mt-1">CON-2023-0812 (Amortization Period #6 of 48)</p>
              </div>

              <div className="space-y-6 flex-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 font-medium">Principal Amount</span>
                  <span className="font-bold text-gray-900">₱7,200.00</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 font-medium">Interest (3%)</span>
                  <span className="font-bold text-gray-900">₱2,100.00</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 font-medium">Service Fee / Insurance</span>
                  <span className="font-bold text-gray-900">₱200.00</span>
                </div>
              </div>

              <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-100">
                <span className="font-bold text-gray-900">Total Monthly Payment</span>
                <span className="text-xl font-black text-[#1D6021]">₱9,500.00</span>
              </div>

              <div className="mt-8 bg-[#F8F9FA] p-4 rounded-xl flex items-start gap-3 border border-gray-100">
                <Info className="w-4 h-4 text-[#1D6021] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
                  Repayments are automatically deducted from your DepEd payroll on the 15th of every month. For discrepancies, please visit the nearest TTMPC branch.
                </p>
              </div>
            </div>

            {/* Loan Eligibility Tool */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#EAF1EB] flex items-center justify-center border border-green-100">
                  <Calculator className="w-4 h-4 text-[#1D6021]" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Loan Eligibility</h3>
              </div>
              
              <p className="text-sm text-gray-500 font-medium mb-8 leading-relaxed">
                Wondering if you qualify for a new loan? Use our calculator to check your borrowing capacity based on your current net take-home pay.
              </p>

              <div className="bg-[#FAF9FB] rounded-xl p-5 mb-8 border border-gray-100">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quick<br/>Status</p>
                  <p className="text-[10px] font-extrabold text-[#1D6021] uppercase tracking-wider text-right">Ready To<br/>Calculate</p>
                </div>
                <p className="text-[10px] text-gray-400 font-medium italic">
                  Last payroll data synced:<br/>10/28/2023
                </p>
              </div>

              <button className="w-full bg-[#1D6021] hover:bg-[#154718] text-white font-bold text-sm py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 mb-4">
                <ArrowRight className="w-4 h-4" /> Open Loan Calculator
              </button>
              
              <p className="text-center text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-auto">
                Institutional Planning Tool
              </p>
            </div>

          </div>
          
        </main>
      </div>
    </div>
  );
};

export default Member_Loans;