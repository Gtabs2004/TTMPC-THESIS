import React from "react";
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
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertTriangle,
  PiggyBank
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

// mock data for now
const barChartData = [
  { name: "Jul", value: 120000 },
  { name: "Aug", value: 135000 },
  { name: "Sep", value: 110000 },
  { name: "Oct", value: 140000 },
  { name: "Nov", value: 155000 },
  { name: "Dec", value: 130000 },
  { name: "Jan", value: 170000 },
  { name: "Feb", value: 150000 },
];

const lineChartData = [
  { name: "Jul", onTime: 82, late: 18 },
  { name: "Aug", onTime: 85, late: 15 },
  { name: "Sep", onTime: 79, late: 21 },
  { name: "Oct", onTime: 89, late: 11 },
  { name: "Nov", onTime: 92, late: 8 },
  { name: "Dec", onTime: 87, late: 13 },
  { name: "Jan", onTime: 95, late: 5 },
  { name: "Feb", onTime: 91, late: 9 },
];

const recentActivities = [
  { id: 1, title: "Payment received", name: "Maria Santos", amount: "₱4,500", time: "10 Mins ago", color: "bg-green-500" },
  { id: 2, title: "Bonus loan disbursed", name: "Juan Dela Cruz", amount: "₱50,000", time: "32 Mins ago", color: "bg-blue-400" },
  { id: 3, title: "Share capital updated", name: "Rosa Reyes", amount: "₱2,000", time: "1 hour ago", color: "bg-purple-400" },
  { id: 4, title: "Late payment flagged", name: "Pedro Garcia", amount: "₱3,200", time: "2 hours ago", color: "bg-red-400" },
  { id: 5, title: "Kiosk application received", name: "Carlos Rivera", amount: "₱20,000", time: "3 hours ago", color: "bg-blue-400" },
];

const Dashboard = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

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

  // KPI Card Component
  const KPICard = ({ icon: Icon, label, value, trend, trendValue, trendComparison }) => (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
      <div className="flex justify-between items-start">
        <span className="text-gray-500 text-sm font-medium">{label}</span>
        <div className="p-2 bg-green-50 text-green-500 rounded-lg">
          <Icon size={18} />
        </div>
      </div>
      <div className="mt-4">
        <h3 className="text-3xl font-bold text-gray-800">{value}</h3>
        <div className="flex items-center mt-2 text-xs">
          {trend === "up" ? (
            <TrendingUp size={14} className="text-green-500 mr-1" />
          ) : (
            <TrendingDown size={14} className="text-red-500 mr-1" />
          )}
          <span className={`${trend === "up" ? "text-green-500" : "text-red-500"} font-medium`}>
            {trendValue}
          </span>
          <span className="text-gray-400 ml-1">{trendComparison}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Bookkeeper Portal" fallbackRole="Bookkeeper" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const to = `/${item.name.toLowerCase().replace(/\s+/g, "-")}`;
            return (
              <NavLink
                key={item.name}
                to={to}
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
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 pl-9 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Search..."
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img
            src="src/assets/img/bookkeeper-profile.png"
            alt="Profile"
            className="ml-4 w-8 h-8 rounded-full bg-gray-200"
          />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
        </header>

        <main className="p-8">
          
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {/* Card 1 - Active Loans */}
            <KPICard icon={Users} label="Active Loans" value="142" trend="up" trendValue="+12" trendComparison="vs last month" />

            {/* Card 2 - Collections Today */}
            <KPICard icon={Calendar} label="Collections Today" value="₱48,750" trend="up" trendValue="+8.2%" trendComparison="vs last month" />

            {/* Card 3 - Delinquent Accounts */}
            <KPICard icon={AlertTriangle} label="Delinquent Accounts" value="18" trend="down" trendValue="-3" trendComparison="vs last month" />

            {/* Card 4 - Total Share Capital */}
            <KPICard icon={PiggyBank} label="Total Share Capital" value="₱2.5M" trend="up" trendValue="+₱150k" trendComparison="vs last month" />
          </div>

          {/* Middle Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Bar Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <h3 className="text-gray-800 font-bold text-lg">Monthly Collections</h3>
                  <p className="text-gray-400 text-xs">Last 8 months overview</p>
                </div>
                <div className="bg-green-50 text-green-600 px-2 py-1 rounded text-xs font-semibold">
                  +12.3%
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(val) => `₱${val / 1000}k`} />
                    <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Line Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <h3 className="text-gray-800 font-bold text-lg">Repayment Trends</h3>
                  <p className="text-gray-400 text-xs">On-time vs late payments</p>
                </div>
                <div className="flex gap-4 text-xs font-medium">
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500"></span><span className="text-gray-500">On-time</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400"></span><span className="text-gray-500">Late</span></div>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <LineChart data={lineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(val) => `${val}%`} />
                    <Line type="monotone" dataKey="onTime" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }} />
                    <Line type="monotone" dataKey="late" stroke="#f87171" strokeWidth={3} dot={{ r: 4, fill: "#f87171", strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Bottom Activity Section */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-gray-800 font-bold text-lg mb-4">Recent Activity</h3>
            <div className="flex flex-col">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between py-4 border-b border-gray-50 last:border-0 last:pb-0">
                  <div className="flex items-start gap-4">
                    <div className={`mt-1.5 w-2 h-2 rounded-full ${activity.color} shrink-0`} />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{activity.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{activity.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-800">{activity.amount}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
};

export default Dashboard;