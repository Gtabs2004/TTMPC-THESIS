import React from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import { 
  LayoutDashboard, 
  Users, 
  Search,
  Bell,
  ClipboardCheck,
  CheckCircle,
  Wallet,
  AlertTriangle,
  ChevronDown
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

// --- MOCK DATA FOR CHARTS & TABLE ---
const trendData = [
  { name: 'JAN', value: 20 },
  { name: 'FEB', value: 35 },
  { name: 'MAR', value: 85 },
  { name: 'APR', value: 95 },
  { name: 'MAY', value: 125 },
  { name: 'JUN', value: 150 },
];

const distributionData = [
  { name: 'Salary Loans', value: 45, color: '#166534' }, // Dark Green
  { name: 'Emergency', value: 25, color: '#3b82f6' },    // Blue
  { name: 'Personal', value: 20, color: '#f59e0b' },     // Orange
  { name: 'Business', value: 10, color: '#ef4444' },     // Red
];

const recentRequests = [
  { id: 1, name: "Dr. Elena Rodriguez", type: "Consolidated", amount: "₱60,000", status: "REVIEWING" },
  { id: 2, name: "Prof. Marcus Chen", type: "Consolidated", amount: "₱100,000", status: "REVIEWING" },
  { id: 3, name: "Sarah Jenkins", type: "Emergency", amount: "₱25,000", status: "IN PROCESS" },
];

const M_Dashboard = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  
  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Loan Approval", icon: Users },
    { name: "Manage Member", icon: Users },
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
      {/* SIDEBAR (Kept from your original code) */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Manager Portal" fallbackRole="Manager" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
            const routeMap = {
              "Dashboard": "/manager-dashboard",
              "Loan Approval": "/loan-approval",
              "Manage Member": "/manager-manage-member",
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

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        {/* HEADER (Kept mostly identical) */}
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
          <img src="src/assets/img/bookkeeper-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Manager" />
        </header>

        {/* PAGE CONTENT */}
        <main className="p-8">
          
          {/* KPI CARDS (CSS Grid is much better here than fixed widths) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            
            {/* Card 1 */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-orange-50 text-orange-500 rounded-lg"><ClipboardCheck size={20} /></div>
                <span className="bg-orange-50 text-orange-600 rounded-full px-3 py-1 text-xs font-bold">Action Required</span>
              </div>
              <div>
                <h3 className="text-gray-500 text-sm font-medium">Pending Approvals</h3>
                <p className="font-bold text-3xl text-gray-800 mt-1">12</p>
                <p className="text-xs font-medium text-gray-400 mt-2"><span className="text-green-600">+5%</span> from last week</p>
              </div>  
            </div>

            {/* Card 2 */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-green-50 text-green-600 rounded-lg"><CheckCircle size={20} /></div>
                <span className="bg-green-50 text-green-700 rounded-full px-3 py-1 text-xs font-bold">This Month</span>
              </div>
              <div>
                <h3 className="text-gray-500 text-sm font-medium">Approved Loans</h3>
                <p className="font-bold text-3xl text-gray-800 mt-1">30</p>
                <p className="text-xs font-medium text-gray-400 mt-2"><span className="text-red-500">-2%</span> from last month</p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-blue-50 text-blue-500 rounded-lg"><Wallet size={20} /></div>
                <span className="bg-blue-50 text-blue-600 rounded-full px-3 py-1 text-xs font-bold">Total Portfolio</span>
              </div>
              <div>
                <h3 className="text-gray-500 text-sm font-medium">Total Active Loans</h3>
                <p className="font-bold text-3xl text-gray-800 mt-1">150</p>
                <p className="text-xs font-medium text-gray-400 mt-2"><span className="text-green-600">+12%</span> year to date</p>
              </div>
            </div>

            {/* Card 4 */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-red-50 text-red-500 rounded-lg"><AlertTriangle size={20} /></div>
                <span className="bg-red-50 text-red-600 rounded-full px-3 py-1 text-xs font-bold">Risk Factor</span>
              </div>
              <div>
                <h3 className="text-gray-500 text-sm font-medium">Delinquent Rate</h3>
                <p className="font-bold text-3xl text-gray-800 mt-1">2.4%</p>
                <p className="text-xs font-medium text-gray-400 mt-2"><span className="text-green-600">-0.5%</span> improvement</p>
              </div>
            </div>

          </div>

          {/* CHARTS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            
            {/* Area Chart (Takes up 2/3 width) */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 lg:col-span-2">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-gray-800 font-bold text-lg">Loan Approval Trends</h3>
                <button className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50">
                  Last 6 Months <ChevronDown size={16} />
                </button>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#166534" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#166534" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12, fontWeight: 600 }} dy={10} />
                    {/* Hiding Y axis as per design, but keeping the grid lines */}
                    <Area type="monotone" dataKey="value" stroke="#166534" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Donut Chart (Takes up 1/3 width) */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-gray-800 font-bold text-lg mb-4">Loan Distribution</h3>
              <div className="relative h-48 flex justify-center items-center">
                <ResponsiveContainer width="100%" height="100%">
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
                {/* Center Text inside Donut */}
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-800">150</span>
                  <span className="text-[10px] text-gray-400 font-bold tracking-widest">TOTAL</span>
                </div>
              </div>

              {/* Custom Legend */}
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

          {/* RECENT REQUESTS TABLE */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 flex justify-between items-center border-b border-gray-100">
              <h3 className="text-gray-800 font-bold text-lg">Recent Approval Requests</h3>
              <button className="text-green-700 text-sm font-bold hover:underline">View All</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 text-xs font-bold tracking-wider">
                    <th className="p-4 pl-6">MEMBER NAME</th>
                    <th className="p-4">LOAN TYPE</th>
                    <th className="p-4">AMOUNT</th>
                    <th className="p-4">STATUS</th>
                    <th className="p-4 pr-6">ACTION</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {recentRequests.map((req) => (
                    <tr key={req.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="p-4 pl-6 font-bold text-gray-800">{req.name}</td>
                      <td className="p-4 text-gray-500">{req.type}</td>
                      <td className="p-4 font-bold text-gray-800">{req.amount}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider ${
                          req.status === 'REVIEWING' 
                            ? 'bg-orange-100 text-orange-600' 
                            : 'bg-blue-100 text-blue-600'
                        }`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="p-4 pr-6">
                        <button className="text-green-700 font-bold hover:underline">Approve</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
};

export default M_Dashboard;