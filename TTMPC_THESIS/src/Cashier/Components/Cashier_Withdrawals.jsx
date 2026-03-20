import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext"; 
import { 
  LayoutDashboard, 
  Search,
  Bell,
  Banknote,
  ChevronDown,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import logo from "../../assets/img/ttmpc logo.png"; 

// Mock Data for Withdrawals
const withdrawalData = [
  { id: "MBR-2021-00892", name: "Romelyn Delos Reyes", avatar: "src/assets/img/avatar1.png", balance: "85,420.00", date: "Oct 24, 2023", status: "VERIFIED" },
  { id: "MBR-2022-01452", name: "Erden Jhed Teope", avatar: "src/assets/img/avatar2.png", balance: "142,800.50", date: "Nov 02, 2023", status: "ACTIVE" },
  { id: "MBR-2020-00342", name: "Ashley Nicole Bulataolo", avatar: "src/assets/img/avatar3.png", balance: "12,500.00", date: "Oct 15, 2023", status: "WARNING" },
  { id: "MBR-2021-00221", name: "Karina Dela Cruz", avatar: "src/assets/img/avatar4.png", balance: "450,225.10", date: "Sep 28, 2023", status: "VERIFIED" },
  { id: "MBR-2019-00567", name: "Gero Antoni Tablolo", avatar: "src/assets/img/avatar5.png", balance: "62,940.00", date: "Nov 04, 2023", status: "VERIFIED", hasDot: true },
];

const Cashier_Withdrawals = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const [isDepositsOpen, setIsDepositsOpen] = useState(true);
   
  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/Cashier_Dashboard" },
    { name: "Payments", icon: Banknote, path: "/Cashier_Payments" },
    { name: "Disbursement", icon: Banknote, path: "/Cashier_Disbursement" },
    { 
      name: "Deposits", 
      icon: Banknote, 
      isDropdown: true,
      subItems: [
        { name: "Savings", path: "/Cashier_Savings" },
        { name: "Capital Build-Up", path: "/Cashier_CBU" }
      ]
    },
    { name: "Withdrawals", icon: Banknote, path: "/Cashier_Withdrawals" },
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

  // Status Badge Logic
  const getStatusStyle = (status) => {
    switch(status) {
      case 'VERIFIED': return 'bg-green-100 text-green-700 font-bold';
      case 'ACTIVE': return 'bg-emerald-100 text-emerald-700 font-bold';
      case 'WARNING': return 'bg-amber-100 text-amber-700 font-bold';
      default: return 'bg-gray-100 text-gray-700 font-bold';
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* 1. THE SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Cashier Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((item) => {
            const Icon = item.icon;

            if (item.isDropdown) {
              return (
                <div key={item.name} className="flex flex-col">
                  <button 
                    onClick={() => setIsDepositsOpen(!isDepositsOpen)}
                    className="flex items-center justify-between p-2 rounded-md text-gray-700 hover:bg-green-50 hover:text-[#5CBA47] transition-colors w-full"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={20} />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    {isDepositsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {isDepositsOpen && (
                    <div className="flex flex-col mt-1 space-y-1">
                      {item.subItems.map((subItem) => (
                        <NavLink
                          key={subItem.name}
                          to={subItem.path}
                          className={({ isActive }) =>
                            `block pl-11 pr-4 py-2 rounded-md transition-colors ${
                              isActive
                                ? 'text-[#5CBA47] font-semibold'
                                : 'text-gray-500 hover:text-[#5CBA47] hover:bg-green-50'
                            }`
                          }
                        >
                          {subItem.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2 rounded-md transition-colors ${
                    isActive
                      ? 'bg-green-50 text-[#5CBA47] font-semibold'
                      : 'text-gray-700 hover:bg-green-50 hover:text-[#5CBA47]'
                  }`
                }
              >
                <Icon size={20} />
                <span className="font-medium">{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded p-2 text-xs bg-[#389734] hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      {/* 2. THE MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              placeholder="Search..."
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 pl-9 py-1 focus:outline-none focus:ring-2 focus:ring-[#389734]"
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="src/assets/img/bookkeeper-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <p className="ml-2 font-medium text-sm text-gray-700">Cashier</p>
        </header>

        {/* 3. PAGE CONTENT */}
        <main className="p-8 overflow-auto">
          <h1 className="text-2xl font-bold text-[#1F3E35] mb-6">Withdrawals</h1>

          {/* Main Card Container */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden p-6">
            
            {/* Header Section */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-[#1F3E35]">Members Eligible for Withdrawal</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Auto-refresh in 30s</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                    <th className="px-4 py-4 w-64">Member Name</th>
                    <th className="px-4 py-4">Available Balance <span className="font-normal">(₱)</span></th>
                    <th className="px-4 py-4">Last Withdrawal Date</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-4 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {withdrawalData.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      
                      
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-gray-200 shrink-0 overflow-hidden relative">
                             <div className="w-full h-full bg-slate-300 flex items-center justify-center text-slate-500 font-bold text-sm">
                               {row.name.charAt(0)}
                             </div>
                             <img src={row.avatar} alt={row.name} className="absolute inset-0 w-full h-full object-cover" onError={(e) => e.target.style.display='none'} />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{row.name}</p>
                            <p className="text-[10px] text-gray-400 font-medium">{row.id}</p>
                          </div>
                        </div>
                      </td>

                      
                      <td className="px-4 py-4">
                        <span className="font-bold text-gray-900">{row.balance}</span>
                      </td>

                     
                      <td className="px-4 py-4 relative">
                        {row.hasDot && (
                          <span className="absolute left-1 top-5 w-1.5 h-1.5 rounded-full bg-red-500"></span>
                        )}
                        <span className="text-sm text-gray-500 font-medium ml-2">{row.date}</span>
                      </td>

                     
                      <td className="px-4 py-4">
                        <span className={`px-3 py-1 rounded text-[10px] uppercase tracking-wide ${getStatusStyle(row.status)}`}>
                          {row.status}
                        </span>
                      </td>

                     
                      <td className="px-4 py-4 text-center">
                        <button className="bg-green-50 hover:bg-green-100 text-[#389734] font-bold text-xs px-4 py-2 rounded-md transition-colors">
                          Withdraw
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="mt-6 pt-4 border-t border-gray-200 flex justify-center items-center gap-2">
              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#389734] text-white font-medium text-sm">
                1
              </button>
              {[2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium text-sm"
                >
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

export default Cashier_Withdrawals;