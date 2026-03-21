import React from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Calculator, 
  BarChart3, 
  Search,
  Bell,
  ClipboardList,
  ArrowUpRight,
  Wallet,
  CalendarDays,
  ChevronDown,
  MoreVertical
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

// --- MOCK DATA ---
const trendData = [
  { name: 'Jan', value: 650000 },
  { name: 'Feb', value: 720000 },
  { name: 'Mar', value: 580000 },
  { name: 'Apr', value: 890000 },
  { name: 'May', value: 750000 },
  { name: 'Jun', value: 850000 },
];

const distributionData = [
  { name: 'Bonus', value: 20, color: '#22c55e' },         // Green 500
  { name: 'Consolidation', value: 55, color: '#166534' }, // Green 800
  { name: 'Emergency', value: 25, color: '#4ade80' },     // Green 400
];

const recentActivity = [
  { id: 1, name: "Robert C. Santos", loanId: "#LN-8921", type: "Consolidated", amount: "₱50,000.00", date: "Oct 22, 2023", status: "PENDING DISBURSEMENT", statusColor: "bg-yellow-100 text-yellow-700" },
  { id: 2, name: "Maria Elena Cruz", loanId: "#LN-8918", type: "Emergency", amount: "₱15,000.00", date: "Oct 21, 2023", status: "DISBURSED", statusColor: "bg-green-100 text-green-700" },
  { id: 3, name: "Juan Dela Cruz", loanId: "#LN-8915", type: "Consolidated", amount: "₱100,000.00", date: "Oct 20, 2023", status: "APPROVED", statusColor: "bg-blue-100 text-blue-700" },
  { id: 4, name: "Liza Soberano", loanId: "#LN-8912", type: "Bonus", amount: "₱20,000.00", date: "Oct 19, 2023", status: "SCHEDULED", statusColor: "bg-gray-100 text-gray-600" },
];

const Treasurer_Dashboard = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  
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

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
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

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
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
          <img src="src/assets/img/bookkeeper-profile.png" alt="Treasurer Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200"></img>
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Treasurer" />
        </header>

        {/* DASHBOARD CONTENT */}
        <main className="p-8">
          
          {/* Top KPI Cards (5 Columns) */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            
            {/* Card 1 */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col">
              <div className="p-2 bg-blue-50 text-blue-500 rounded-lg w-max mb-3"><Users size={20} /></div>
              <h3 className="text-gray-400 text-xs font-semibold mb-1">Total Members</h3>
              <div className="flex items-baseline gap-2">
                <p className="font-bold text-2xl text-gray-800">256</p>
                <span className="text-xs font-bold text-green-500">+4</span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col">
              <div className="p-2 bg-orange-50 text-orange-500 rounded-lg w-max mb-3"><ClipboardList size={20} /></div>
              <h3 className="text-gray-400 text-xs font-semibold mb-1">Pending Disbursements</h3>
              <div className="flex items-baseline gap-2">
                <p className="font-bold text-2xl text-gray-800">14</p>
                <span className="text-xs font-semibold text-gray-400">Queue</span>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col">
              <div className="p-2 bg-green-50 text-green-500 rounded-lg w-max mb-3"><ArrowUpRight size={20} /></div>
              <h3 className="text-gray-400 text-xs font-semibold mb-1">Loans Released Today</h3>
              <div className="flex items-baseline gap-2">
                <p className="font-bold text-2xl text-gray-800">₱85k</p>
                <span className="text-xs font-bold text-green-500">Active</span>
              </div>
            </div>

            {/* Card 4 */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col">
              <div className="p-2 bg-teal-50 text-teal-500 rounded-lg w-max mb-3"><Wallet size={20} /></div>
              <h3 className="text-gray-400 text-xs font-semibold mb-1">Total Cash Disbursed</h3>
              <div className="flex items-baseline gap-2">
                <p className="font-bold text-2xl text-gray-800">₱1.24M</p>
                <span className="text-xs font-bold text-gray-400 uppercase">Feb</span>
              </div>
            </div>

            {/* Card 5 */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col">
              <div className="p-2 bg-purple-50 text-purple-500 rounded-lg w-max mb-3"><CalendarDays size={20} /></div>
              <h3 className="text-gray-400 text-xs font-semibold mb-1">Scheduled Disbursements</h3>
              <div className="flex items-baseline gap-2">
                <p className="font-bold text-2xl text-gray-800">8</p>
                <span className="text-xs font-semibold text-gray-400">This Week</span>
              </div>
            </div>

          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
            
            {/* Area Chart (Takes up 3 columns) */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 lg:col-span-3">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-gray-800 font-bold text-lg">Monthly Disbursement Trend</h3>
                <button className="flex items-center gap-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50">
                  Last 6 Months <ChevronDown size={14} />
                </button>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(val) => `₱${val / 1000}k`} />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#22c55e" 
                      strokeWidth={3} 
                      fill="url(#colorTrend)" 
                      activeDot={{ r: 6, fill: "#fff", stroke: "#22c55e", strokeWidth: 2 }}
                      dot={{ r: 4, fill: "#fff", stroke: "#22c55e", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Donut Chart (Takes up 2 columns) */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 lg:col-span-2">
              <h3 className="text-gray-800 font-bold text-lg mb-4">Loan Type Distribution</h3>
              <div className="relative h-48 flex justify-center items-center mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={85}
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
              </div>

              {/* Legend placed inline horizontally at the bottom */}
              <div className="mt-6 flex justify-center gap-6 text-xs font-medium text-gray-500">
                {distributionData.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></span>
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Table Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 flex justify-between items-center border-b border-gray-100">
              <h3 className="text-gray-800 font-bold text-lg">Recent Loan Activity</h3>
              <div className="flex gap-4 text-sm font-semibold text-gray-500">
                <button className="text-gray-800 bg-gray-50 px-3 py-1 rounded-md">All</button>
                <button className="hover:text-gray-800 px-3 py-1">Pending</button>
                <button className="hover:text-gray-800 px-3 py-1">Disbursed</button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 text-[11px] font-bold tracking-wider uppercase">
                    <th className="p-4 pl-6">Member Name</th>
                    <th className="p-4">Loan ID</th>
                    <th className="p-4">Loan Type</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Applied Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 pr-6"></th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {recentActivity.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="p-4 pl-6 font-bold text-gray-800">{row.name}</td>
                      <td className="p-4 text-gray-400 font-medium">{row.loanId}</td>
                      <td className="p-4 text-gray-600">{row.type}</td>
                      <td className="p-4 font-bold text-gray-800">{row.amount}</td>
                      <td className="p-4 text-gray-500">{row.date}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase ${row.statusColor}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="p-4 pr-6 text-gray-400 hover:text-gray-600 cursor-pointer text-right">
                        <MoreVertical size={16} className="inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Footer */}
            <div className="p-4 px-6 border-t border-gray-50 flex justify-between items-center text-xs text-gray-400 font-medium">
              <span>Showing 4 of 28 transactions</span>
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

export default Treasurer_Dashboard;