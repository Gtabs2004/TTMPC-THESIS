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
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import logo from "../../assets/img/ttmpc logo.png";

// --- MOCK DATA ---
const trendData = [
  { name: "8AM", value: 8 },
  { name: "9AM", value: 22 },
  { name: "10AM", value: 45 },
  { name: "11AM", value: 68 },
  { name: "12PM", value: 95 },
  { name: "1PM", value: 72 },
  { name: "2PM", value: 56 },
  { name: "3PM", value: 38 },
];

const distributionData = [
  { name: "Loan Payments", value: 52, color: "#166534" },
  { name: "Savings Deposits", value: 20, color: "#3b82f6" },
  { name: "CBU Contributions", value: 11, color: "#8b5cf6" },
  { name: "Withdrawals", value: 17, color: "#ef4444" },
];

const recentActivity = [
  { id: 1, name: "Maria Santos", desc: "Loan Payment", ref: "#LN-8821", amount: "₱12,500.00", time: "02:14 PM", type: "in" },
  { id: 2, name: "James Wilson", desc: "Savings Withdrawal", ref: "#SW-4412", amount: "₱5,000.00", time: "01:58 PM", type: "out" },
  { id: 3, name: "Robert Dizon", desc: "CBU Contribution", ref: "#CBU-331", amount: "₱2,200.00", time: "01:45 PM", type: "in" },
  { id: 4, name: "Anna L. Garcia", desc: "Share Capital Deposit", ref: "#SC-772", amount: "₱15,000.00", time: "01:12 PM", type: "in" },
  { id: 5, name: "Pedro Cruz", desc: "Loan Disbursement", ref: "#LD-9201", amount: "₱30,000.00", time: "12:35 PM", type: "out" },
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
    { name: "Grocery", icon: Banknote, path: "/Cashier_Grocery" },
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
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity
              className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold"
              fallbackPortal="Cashier Portal"
              fallbackRole="Cashier"
            />
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
                    className="flex items-center justify-between p-2 rounded-md text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors w-full"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={20} />
                      <span>{item.name}</span>
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
                                ? "text-green-700 font-semibold"
                                : "text-gray-500 hover:text-green-700 hover:bg-green-50"
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
                      ? "bg-green-50 text-green-700 font-semibold"
                      : "text-gray-700 hover:bg-green-50 hover:text-green-700"
                  }`
                }
              >
                <Icon size={20} />
                <span>{item.name}</span>
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
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 pl-9 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img
            src="src/assets/img/bookkeeper-profile.png"
            alt="Profile"
            className="ml-4 w-8 h-8 rounded-full bg-gray-200 object-cover"
          />
          <PortalTopbarIdentity className="font-medium text-sm text-gray-700 ml-2" fallbackRole="Cashier" />
        </header>

        {/* DASHBOARD CONTENT */}
        <main className="p-8">

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-blue-50 text-blue-500 rounded-lg"><FileText size={20} /></div>
                <span className="bg-blue-50 text-blue-600 rounded-full px-3 py-1 text-xs font-bold">Today</span>
              </div>
              <div>
                <h3 className="text-gray-500 text-sm font-medium">Total Transactions</h3>
                <p className="font-bold text-3xl text-gray-800 mt-1">142</p>
                <p className="text-xs font-medium text-gray-400 mt-2">
                  <span className="text-green-600">+12%</span> vs yesterday
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-green-50 text-green-600 rounded-lg"><Banknote size={20} /></div>
                <span className="bg-green-50 text-green-700 rounded-full px-3 py-1 text-xs font-bold">Cash In</span>
              </div>
              <div>
                <h3 className="text-gray-500 text-sm font-medium">Cash Received</h3>
                <p className="font-bold text-3xl text-gray-800 mt-1">₱48,000</p>
                <p className="text-xs font-medium text-gray-400 mt-2">
                  <span className="text-green-600">+₱5.2k</span> added today
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-red-50 text-red-500 rounded-lg"><ArrowUpRight size={20} /></div>
                <span className="bg-orange-50 text-orange-600 rounded-full px-3 py-1 text-xs font-bold">2 Pending</span>
              </div>
              <div>
                <h3 className="text-gray-500 text-sm font-medium">Cash Released</h3>
                <p className="font-bold text-3xl text-gray-800 mt-1">₱10,000</p>
                <p className="text-xs font-medium text-gray-400 mt-2">
                  <span className="text-orange-500">2</span> pending payouts
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-purple-50 text-purple-500 rounded-lg"><Users size={20} /></div>
                <span className="bg-teal-50 text-teal-600 rounded-full px-3 py-1 text-xs font-bold">Active</span>
              </div>
              <div>
                <h3 className="text-gray-500 text-sm font-medium">Members Served</h3>
                <p className="font-bold text-3xl text-gray-800 mt-1">86</p>
                <p className="text-xs font-medium text-gray-400 mt-2">Current queue active</p>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Area Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 lg:col-span-2">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-gray-800 font-bold text-lg">Transaction Volume Today</h3>
                <button className="flex items-center gap-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50">
                  Hourly <ChevronDown size={14} />
                </button>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTxn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#9ca3af", fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#9ca3af", fontSize: 12 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#22c55e"
                      strokeWidth={3}
                      fill="url(#colorTxn)"
                      activeDot={{ r: 6, fill: "#fff", stroke: "#22c55e", strokeWidth: 2 }}
                      dot={{ r: 4, fill: "#fff", stroke: "#22c55e", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Donut Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-gray-800 font-bold text-lg mb-4">Transaction Breakdown</h3>
              <div className="relative h-48 flex justify-center items-center">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={0}
                      dataKey="value"
                      stroke="none"
                    >
                      {distributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-800">142</span>
                  <span className="text-[10px] text-gray-400 font-bold tracking-widest">TOTAL</span>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {distributionData.map((item, index) => (
                  <div key={index} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                      <span className="text-gray-600">{item.name}</span>
                    </div>
                    <span className="font-bold text-gray-800">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Activity Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 flex justify-between items-center border-b border-gray-100">
              <div>
                <h3 className="text-gray-800 font-bold text-lg">Recent Activity</h3>
                <p className="text-xs text-gray-400 mt-1">Last updated: 3 mins ago</p>
              </div>
              <button className="text-green-700 text-sm font-bold hover:underline">View All</button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 text-[11px] font-bold tracking-wider uppercase">
                    <th className="p-4 pl-6">Member</th>
                    <th className="p-4">Transaction</th>
                    <th className="p-4">Reference</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Time</th>
                    <th className="p-4 pr-6">Type</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {recentActivity.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="p-4 pl-6 font-bold text-gray-800">{row.name}</td>
                      <td className="p-4 text-gray-500">{row.desc}</td>
                      <td className="p-4 text-gray-400 font-medium">{row.ref}</td>
                      <td className="p-4 font-bold text-gray-800">{row.amount}</td>
                      <td className="p-4 text-gray-500">{row.time}</td>
                      <td className="p-4 pr-6">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase ${
                            row.type === "in"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {row.type === "in" ? "Cash In" : "Cash Out"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 px-6 border-t border-gray-50 flex justify-between items-center text-xs text-gray-400 font-medium">
              <span>Showing 5 of 142 transactions</span>
              <div className="flex gap-2">
                <button className="px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50">Previous</button>
                <button className="px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600">Next</button>
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
};

export default Cashier_Dashboard;
