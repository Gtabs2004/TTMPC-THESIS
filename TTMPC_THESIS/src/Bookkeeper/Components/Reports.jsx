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
  Download,
  ArrowUpRight,
  Landmark,
  Wallet,
  BookOpen,
  CircleDollarSign,
  FileDown
} from 'lucide-react';
import { 
  BarChart, Bar, 
  LineChart, Line, 
  PieChart, Pie, Cell, 
  XAxis, Tooltip, ResponsiveContainer 
} from 'recharts';

const Reports = () => {
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

  // KPI Data
  const kpiData = [
    { title: "TOTAL ASSET VALUE", amount: "₱12,450,000", trend: "+4.2%", icon: Landmark },
    { title: "TOTAL EQUITY (SHARE CAPITAL)", amount: "₱5,820,000", trend: "+2.8%", icon: Wallet },
    { title: "TOTAL LOAN PORTFOLIO", amount: "₱8,140,000", trend: "+6.5%", icon: BookOpen },
    { title: "NET SURPLUS", amount: "₱1,245,000", trend: "+11.2%", icon: CircleDollarSign },
  ];

  // Table Data
  const reportList = [
    { name: "2024_Q2_Financial_Audit.pdf", category: "FINANCIAL", date: "July 15, 2024", catColor: "bg-blue-50 text-blue-600" },
    { name: "Annual_Compliance_Review.pdf", category: "GOVERNANCE", date: "July 10, 2024", catColor: "bg-purple-50 text-purple-600" },
    { name: "Operational_Efficiency_Metrics.pdf", category: "OPERATIONS", date: "July 05, 2024", catColor: "bg-orange-50 text-orange-600" },
    { name: "Board_Directors_Monthly_Summary.pdf", category: "GOVERNANCE", date: "June 30, 2024", catColor: "bg-purple-50 text-purple-600" },
  ];

  // Recharts Data
  const barChartData = [
    { month: "Jan", income: 50, expense: 40 },
    { month: "Feb", income: 65, expense: 45 },
    { month: "Mar", income: 60, expense: 40 },
    { month: "Apr", income: 75, expense: 50 },
    { month: "May", income: 80, expense: 55 },
    { month: "Jun", income: 90, expense: 60 },
  ];

  const pieChartData = [
    { name: 'Bonus', value: 50, color: '#166534' },
    { name: 'Emergency', value: 30, color: '#22c55e' },
    { name: 'Consolidated', value: 20, color: '#bbf7d0' },
  ];

  const lineChartData = [
    { month: "Jan", active: 100, new: 20 },
    { month: "Feb", active: 110, new: 25 },
    { month: "Mar", active: 130, new: 15 },
    { month: "Apr", active: 145, new: 30 },
    { month: "May", active: 160, new: 22 },
    { month: "Jun", active: 185, new: 35 },
  ];

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* Sidebar */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              placeholder="Search..."
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 pl-9 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" 
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="src/assets/img/bookkeeper-profile.png" alt="Bookkeeper Profile" className="ml-4 w-8 h-8 rounded-full" />
          <div className="ml-3">
             <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
          </div>
        </header>

        {/* Scrollable Dashboard Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          {/* Page Header */}
          <div className="flex justify-between items-end mb-6">
            <h1 className="font-bold text-2xl text-[#1E293B]">Reports</h1>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-gray-400 font-medium">Report Period</p>
                <p className="text-sm font-bold text-gray-800">Jan - Jun 2024</p>
              </div>
              <button className="flex items-center gap-2 bg-[#166534] hover:bg-green-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <Download size={16} />
                Download Executive PDF
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            {kpiData.map((kpi, idx) => {
              const Icon = kpi.icon;
              return (
                <div key={idx} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col">
                  <div className="w-8 h-8 bg-green-50 rounded-md flex items-center justify-center mb-4 text-[#166534]">
                    <Icon size={18} />
                  </div>
                  <h3 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">{kpi.title}</h3>
                  <p className="text-2xl font-black text-gray-900 mb-2">{kpi.amount}</p>
                  <div className="flex items-center text-xs font-bold text-[#166534]">
                    <ArrowUpRight size={14} className="mr-1" />
                    {kpi.trend} <span className="text-gray-400 font-medium ml-1">vs Last Quarter</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Middle Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            
            {/* Financial Health Bar Chart */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Financial Health</h2>
                  <p className="text-xs text-gray-400">Income vs. Expenses (Last 6 Months)</p>
                </div>
                <div className="flex gap-4 text-xs font-medium text-gray-600">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#166534]"></div>Income</div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-200"></div>Expenses</div>
                </div>
              </div>
              
              <div className="flex-1 w-full h-48 border-b border-gray-50 pb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }} barGap={6}>
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} dy={10} />
                    <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="income" fill="#166534" radius={[4, 4, 0, 0]} barSize={16} />
                    <Bar dataKey="expense" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Loan Performance Donut */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col">
              <h2 className="text-base font-bold text-gray-900 mb-1">Loan Performance</h2>
              <p className="text-xs text-gray-400 mb-6">Distribution & Risk Assessment</p>
              
              <div className="h-32 w-full relative flex items-center justify-center mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      innerRadius={45}
                      outerRadius={60}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}/>
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Text inside Donut */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-bold text-gray-900">Total</span>
                  <span className="text-[10px] text-gray-400">Loans</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-6">
                {pieChartData.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                      <span className="text-gray-600 font-medium">{item.name}</span>
                    </div>
                    <span className="font-bold text-gray-900">{item.value}%</span>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-4 border-t border-gray-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Delinquency Rate</span>
                  <span className="text-sm font-bold text-red-600">3.2%</span>
                </div>
                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-red-500 w-[3.2%] h-full rounded-full"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Membership Growth Line Chart */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-6 flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-base font-bold text-gray-900">Membership Growth</h2>
                <p className="text-xs text-gray-400">New Registrations vs. Active Members</p>
              </div>
              <div className="flex gap-4 text-xs font-medium text-gray-600">
                <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-[#166534]"></div>Active Members</div>
                <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 border-t border-dashed border-[#94a3b8]"></div>New Reg</div>
              </div>
            </div>
            
            <div className="w-full h-40 border-b border-gray-50 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} dy={10} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="active" stroke="#166534" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="new" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Executive Reports Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Recent Executive Reports</h2>
              <button className="text-xs font-bold text-[#166534] hover:underline">Full Archive</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-[10px] uppercase text-gray-400 font-bold tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Report Name</th>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3">Generation Date</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reportList.map((report, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 flex items-center gap-3">
                        <FileText className="text-red-500" size={16} />
                        <span className="font-medium text-gray-800">{report.name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wide ${report.catColor}`}>
                          {report.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 font-medium text-xs">{report.date}</td>
                      <td className="px-6 py-4 text-right">
                        <button className="inline-flex items-center gap-1.5 text-xs font-bold text-[#166534] hover:text-green-800 transition-colors">
                          <FileDown size={14} />
                          Export PDF
                        </button>
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

export default Reports;