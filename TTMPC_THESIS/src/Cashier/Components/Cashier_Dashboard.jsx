import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import {
  LayoutDashboard,
  Search,
  Bell,
  Banknote,
  ChevronDown,
  ChevronRight,
  FileText,
  ArrowUpRight,
  Users,
  Wallet,
  PiggyBank,
  Landmark,
  PlusCircle,
  MinusCircle,
  AlertCircle
} from "lucide-react";
import {
  BarChart,
  Bar,
  Cell,
  ResponsiveContainer,
  YAxis
} from "recharts";
import logo from "../../assets/img/ttmpc logo.png";

// --- MOCK DATA ---
const liquidityData = [
  { name: '10AM', value: 40 },
  { name: '11AM', value: 60 },
  { name: '12PM', value: 100 }, // Peak
  { name: '1PM', value: 75 },
  { name: '2PM', value: 45 },
];

const recentActivity = [
  { id: 1, name: "Maria Santos", desc: "Loan Payment #8821", amount: "₱ 12,500", time: "02:14 PM", type: "in" },
  { id: 2, name: "James Wilson", desc: "Savings Withdrawal", amount: "₱ 5,000", time: "01:58 PM", type: "out" },
  { id: 3, name: "Robert Dizon", desc: "CBU Contribution", amount: "₱ 2,200", time: "01:45 PM", type: "in" },
  { id: 4, name: "Anna L. Garcia", desc: "Share Capital Deposit", amount: "₱ 15,000", time: "01:12 PM", type: "in" },
  { id: 5, name: "System Alert", desc: "End of Shift Reconciliation", amount: "REQUIRED", time: "01:00 PM", type: "alert" },
];

const Cashier_Dashboard = () => {
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
        { name: "Capital Build-Up", path: "/Cashier_CBU" },
      ],
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

  return (
    <div className="flex min-h-screen bg-[#FAFAFA]">
      {/* SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Cashier Portal" fallbackRole="Cashier" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm grow">
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
                                ? "text-[#5CBA47] font-semibold"
                                : "text-gray-500 hover:text-[#5CBA47] hover:bg-green-50"
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
                      ? "bg-green-50 text-[#5CBA47] font-semibold"
                      : "text-gray-700 hover:bg-green-50 hover:text-[#5CBA47]"
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
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-200 px-4 pl-9 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="src/assets/img/bookkeeper-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <PortalTopbarIdentity className="font-medium text-sm text-gray-700" fallbackRole="Cashier" />
        </header>

        {/* DASHBOARD CONTENT */}
        <main className="p-8 max-w-7xl mx-auto w-full">
          
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Card 1 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total<br/>Transactions</h3>
                <div className="p-2 bg-blue-50 text-blue-500 rounded-lg"><FileText size={18} /></div>
              </div>
              <div>
                <p className="font-black text-4xl text-gray-800 mb-2">142</p>
                <div className="flex items-center text-[10px] font-bold">
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center gap-1 mr-2">↗ 12%</span>
                  <span className="text-gray-400">vs yesterday</span>
                </div>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Cash Received</h3>
                <div className="p-2 bg-green-50 text-green-500 rounded-lg"><Banknote size={18} /></div>
              </div>
              <div>
                <p className="font-black text-4xl text-gray-800 mb-2">₱48,000</p>
                <div className="flex items-center text-[10px] font-bold">
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded mr-2">+ 5.2k</span>
                  <span className="text-gray-400">added today</span>
                </div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Cash Released</h3>
                <div className="p-2 bg-red-50 text-red-500 rounded-lg"><ArrowUpRight size={18} /></div>
              </div>
              <div>
                <p className="font-black text-4xl text-gray-800 mb-2">₱10,000</p>
                <div className="flex items-center text-[10px] font-bold">
                  <span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded flex items-center gap-1 mr-2">🕒 2</span>
                  <span className="text-gray-400">pending payouts</span>
                </div>
              </div>
            </div>

            {/* Card 4 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Members Served</h3>
                <div className="p-2 bg-purple-50 text-purple-500 rounded-lg"><Users size={18} /></div>
              </div>
              <div>
                <p className="font-black text-4xl text-gray-800 mb-2">86</p>
                <div className="flex items-center text-[10px] font-bold">
                  <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded flex items-center gap-1 mr-2">⚡ Active</span>
                  <span className="text-gray-400">current queue</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Grid: Left Side (2/3) + Right Side (1/3) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT COLUMN: Summary & Chart */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              
              {/* Header for Summary */}
              <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-green-100 text-green-700 rounded-md"><FileText size={16} /></div>
                  <h2 className="text-lg font-bold text-gray-800">Daily Financial Summary</h2>
                </div>
                <button className="text-sm font-bold text-green-700 hover:text-green-800">Download Report</button>
              </div>

              {/* 2x2 Grid for Financial Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-green-50 text-green-500 rounded-xl"><Wallet size={24} /></div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Payments</p>
                      <p className="text-sm font-semibold text-green-600">Collection</p>
                    </div>
                  </div>
                  <h3 className="text-3xl font-black text-gray-900 mt-6">₱25,000</h3>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-blue-50 text-blue-500 rounded-xl"><PiggyBank size={24} /></div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Savings Deposits</p>
                      <p className="text-sm font-semibold text-blue-600">Member Savings</p>
                    </div>
                  </div>
                  <h3 className="text-3xl font-black text-gray-900 mt-6">₱15,000</h3>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-purple-50 text-purple-500 rounded-xl"><Landmark size={24} /></div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">CBU Contributions</p>
                      <p className="text-sm font-semibold text-purple-600">Share Capital</p>
                    </div>
                  </div>
                  <h3 className="text-3xl font-black text-gray-900 mt-6">₱8,000</h3>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-red-50 text-red-500 rounded-xl"><ArrowUpRight size={24} /></div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Withdrawals</p>
                      <p className="text-sm font-semibold text-red-500">Disbursements</p>
                    </div>
                  </div>
                  <h3 className="text-3xl font-black text-gray-900 mt-6">₱10,000</h3>
                </div>

              </div>

              {/* Liquidity Map Chart */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mt-2">
                <h3 className="text-xs font-bold text-gray-600 tracking-widest uppercase mb-6">Cashier Liquidity Map</h3>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={liquidityData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <YAxis hide domain={[0, 'dataMax']} />
                      {/* Using Cell to color the highest bar differently based on the mockup */}
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={80}>
                        {liquidityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.value === 100 ? '#064e3b' : '#a7c0a9'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-between items-center mt-4 text-[9px] font-bold text-gray-500 uppercase">
                  <span>Peak Service: 11:30 AM - 12:45 PM</span>
                  <span>Average T/O: 4.2 MIN</span>
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: Recent Activity */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full">
              <div className="p-6 border-b border-gray-50">
                <h3 className="text-lg font-bold text-gray-800">Recent Activity</h3>
                <p className="text-xs text-gray-400 mt-1">Last updated: 3 mins ago</p>
              </div>
              
              <div className="flex-1 p-6 flex flex-col gap-6">
                {recentActivity.map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {item.type === 'in' && <div className="p-2 bg-green-50 text-green-600 rounded-full"><PlusCircle size={18} /></div>}
                      {item.type === 'out' && <div className="p-2 bg-red-50 text-red-500 rounded-full"><MinusCircle size={18} /></div>}
                      {item.type === 'alert' && <div className="p-2 bg-orange-50 text-orange-500 rounded-full"><AlertCircle size={18} /></div>}
                      
                      <div>
                        <p className="text-sm font-bold text-gray-800">{item.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${item.type === 'alert' ? 'text-orange-600 text-xs' : 'text-gray-800'}`}>
                        {item.amount}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t border-gray-50 mt-auto">
                <button className="w-full py-3 text-sm font-bold text-green-800 hover:bg-green-50 rounded-xl transition-colors">
                  View Complete Ledger
                </button>
              </div>
            </div>

          </div>

        </main>
      </div>
    </div>
  );
};

export default Cashier_Dashboard;