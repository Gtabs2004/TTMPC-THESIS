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
  ChevronLeft,
  Wallet,
  Target,
  TrendingUp,
  Filter,
  Download,
  ArrowUpRight
} from 'lucide-react';
import logo from "../../assets/img/ttmpc logo.png";

// Mock Data for CBU Table (with changed names)
const cbuData = [
  { id: "CBU-2024-001", name: "Romelyn Delos Reyes", amount: "₱500.00", date: "Oct 24, 2023", status: "VERIFIED" },
  { id: "CBU-2024-045", name: "Erden Jhed Teope", amount: "₱1,200.00", date: "Oct 24, 2023", status: "PENDING" },
  { id: "CBU-2023-892", name: "Ashley Nicole Bulataolo", amount: "₱250.00", date: "Oct 23, 2023", status: "VERIFIED" },
  { id: "CBU-2024-112", name: "Karina Dela Cruz", amount: "₱1,000.00", date: "Oct 23, 2023", status: "VERIFIED" },
  { id: "CBU-2024-009", name: "Gero Antoni Tablolo", amount: "₱750.00", date: "Oct 23, 2023", status: "FLAGGED" },
];

const Cashier_CBU = () => {
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

  const getStatusStyle = (status) => {
    switch(status) {
      case 'VERIFIED': return 'bg-green-50 text-green-600';
      case 'PENDING': return 'bg-orange-50 text-orange-500';
      case 'FLAGGED': return 'bg-red-50 text-red-500';
      default: return 'bg-gray-100 text-gray-600';
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
          <h1 className="text-2xl font-bold text-[#1F3E35] mb-6">Capital Build-Up</h1>

          {/* Top Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Card 1 */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex flex-col relative">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-green-50 rounded-lg">
                  <Wallet className="w-5 h-5 text-green-600" />
                </div>
                <span className="flex items-center text-xs font-bold text-green-500 gap-1">
                  <ArrowUpRight className="w-3 h-3" />
                  +8.2%
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Total CBU Fund</p>
              <h2 className="text-2xl font-black text-gray-900">₱1,240,500.00</h2>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex flex-col relative">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-orange-50 rounded-lg">
                  <Target className="w-5 h-5 text-orange-500" />
                </div>
                <span className="text-[10px] uppercase font-bold text-gray-400">
                  85% OF GOAL
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Monthly Target</p>
              <h2 className="text-2xl font-black text-gray-900">₱50,000.00</h2>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex flex-col relative">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                </div>
                <span className="text-xs font-bold text-blue-500">
                  +2.1%
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Growth Rate</p>
              <h2 className="text-2xl font-black text-gray-900">+12.5%</h2>
            </div>
          </div>

          {/* Table Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            {/* Table Header Controls */}
            <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
              <h3 className="text-lg font-bold text-[#1F3E35]">Recent CBU Contributions</h3>
              
              <div className="flex items-center gap-3">
                <button className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                  <Filter className="w-4 h-4" />
                  Filter
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
                  <tr className="border-b border-gray-100 bg-white text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    <th className="px-6 py-4">Member Name</th>
                    <th className="px-6 py-4">CBU ID</th>
                    <th className="px-6 py-4">Contribution</th>
                    <th className="px-6 py-4">Transaction Date</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-gray-700 divide-y divide-gray-50">
                  {cbuData.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors bg-white">
                      <td className="px-6 py-4 font-bold text-gray-900">{row.name}</td>
                      <td className="px-6 py-4">
                        <span className="bg-gray-100 text-gray-500 font-mono text-xs px-2 py-1 rounded">
                          {row.id}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-black text-gray-900">{row.amount}</td>
                      <td className="px-6 py-4 text-gray-500 font-medium">{row.date}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded text-[10px] uppercase font-bold ${getStatusStyle(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="p-4 border-t border-gray-200 flex justify-center items-center gap-2 bg-white">
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

export default Cashier_CBU;