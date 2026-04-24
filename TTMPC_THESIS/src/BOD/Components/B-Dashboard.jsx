import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
// Assuming AuthContext and PortalIdentity are standard imports in your project
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import { 
  LayoutDashboard, Users, Archive, CalendarCheck, Search, Bell,
  Download, Calendar, TrendingUp, AlertCircle, CreditCard, HeartHandshake,
  Clock, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { 
  ComposedChart, Line, Area, BarChart, Bar, ScatterChart, Scatter, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart // LineChart moved here to fix the import conflict
} from 'recharts';

// --- MOCK DATA FOR CHARTS ---
const seasonalData = [
  { month: 'Jan', demand: 4000, forecast: 4200, riskZone: 0 },
  { month: 'Feb', demand: 3000, forecast: 3100, riskZone: 0 },
  { month: 'Mar', demand: 5000, forecast: 5500, riskZone: 1000 },
  { month: 'Apr', demand: 8000, forecast: 8500, riskZone: 3000 },
  { month: 'May', demand: 4500, forecast: 4800, riskZone: 0 },
];

const delinquencyData = [
  { month: 'Jan', '30-Day': 400, '60-Day': 200, '90-Day': 100 },
  { month: 'Feb', '30-Day': 300, '60-Day': 250, '90-Day': 120 },
  { month: 'Mar', '30-Day': 450, '60-Day': 200, '90-Day': 150 },
  { month: 'Apr', '30-Day': 600, '60-Day': 300, '90-Day': 200 },
];

const genderData = [
  { name: 'Female', value: 65 },
  { name: 'Male', value: 35 }
  
];

const scatterData = [
  { debt: 10000, repaymentSpeed: 95 },
  { debt: 25000, repaymentSpeed: 80 },
  { debt: 50000, repaymentSpeed: 60 },
  { debt: 75000, repaymentSpeed: 45 },
  { debt: 100000, repaymentSpeed: 20 }, 
];

// --- NEW MOCK DATA: TRANSACTION HISTORY ---
const transactionHistory = [
  { id: 'TXN-0921', member: 'Maria Santos', type: 'Loan Disbursement', amount: '₱50,000', date: 'Mar 22, 2026', status: 'Completed', isCredit: false },
  { id: 'TXN-0920', member: 'Juan Dela Cruz', type: 'Share Capital Dep.', amount: '₱5,000', date: 'Mar 21, 2026', status: 'Completed', isCredit: true },
  { id: 'TXN-0919', member: 'Elena Gomez', type: 'Loan Repayment', amount: '₱12,500', date: 'Mar 21, 2026', status: 'Pending', isCredit: true },
  { id: 'TXN-0918', member: 'AgriCoop Ventures', type: 'Corporate Dividend', amount: '₱150,000', date: 'Mar 20, 2026', status: 'Completed', isCredit: false },
  { id: 'TXN-0917', member: 'Mark Reyes', type: 'Emergency Loan', amount: '₱10,000', date: 'Mar 19, 2026', status: 'Completed', isCredit: false },
];

const COLORS = ['#2C7A3F', '#4ADE80', '#9CA3AF'];

const Dashboard_BOD = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setChartsReady(true));
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const menuItems = [
    { section: "BOD", items: [{ name: "Dashboard", icon: LayoutDashboard }, { name: "Member Approvals", icon: Users }, { name: "Manage Member", icon: Users }] },
    { section: "SECRETARY", items: [{ name: "Training Attendance", icon: CalendarCheck }, { name: "Membership Records", icon: Archive }] }
  ];

  const routeMap = {
    "Dashboard": "/BOD-dashboard",
    "Member Approvals": "/member-approvals",
    "Manage Member": "/bod-manage-member",
    "Training Attendance": "/Secretary_Attendance",
    "Membership Records": "/Secretary_Records",
  };

  const handleSignOut = async (e) => {
    e.preventDefault();
    try { await signOut(); navigate("/"); } catch (err) { console.error("Failed to sign out:", err); }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="BOD Portal" fallbackRole="BOD" />
          </div>
        </div>
        <hr className="w-full border-gray-200 mb-6" />
        
        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((sectionGroup) => (
            <div key={sectionGroup.section} className="mb-4 flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">{sectionGroup.section}</p>
              {sectionGroup.items.map((item) => {
                const Icon = item.icon;
                const to = routeMap[item.name];
                return (
                  <NavLink key={item.name} to={to} className={({ isActive }) => `flex items-center gap-3 p-2 rounded-md transition-colors ${isActive ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-700 hover:bg-green-50 hover:text-green-700'}`}>
                    <Icon size={20} /><span>{item.name}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <button onClick={handleSignOut} className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors">Sign out</button>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        {/* TOPBAR */}
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input type="text" className="bg-gray-50 w-72 h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]" placeholder="Search..." />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="src/assets/img/bookkeeper-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="BOD" />
        </header>
        
        {/* SCROLLABLE DASHBOARD CONTENT */}
        <main className="flex-1 overflow-y-auto p-8">
          
          {/* Action Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="font-bold text-2xl text-gray-800">Analytical Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">Real-time cooperative performance metrics</p>
            </div>
            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
                <Calendar className="w-4 h-4" /> YTD 2026
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-[#2C7A3F] hover:bg-[#236332] text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
                <Download className="w-4 h-4" /> Export PDF
              </button>
            </div>
          </div>

          {/* ROW 1: QUICK INSIGHTS (KPIs) */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">Total Transaction Vol.</p>
                  <h3 className="text-2xl font-bold text-gray-800">₱42.5M</h3>
                </div>
                <div className="p-2 bg-green-50 rounded-lg text-[#2C7A3F]"><TrendingUp className="w-5 h-5" /></div>
              </div>
              <p className="text-sm text-green-600 font-medium mt-4">+12.5% <span className="text-gray-400 font-normal">vs last month</span></p>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">Delinquency Rate</p>
                  <h3 className="text-2xl font-bold text-gray-800">4.2%</h3>
                </div>
                <div className="p-2 bg-red-50 rounded-lg text-red-500"><AlertCircle className="w-5 h-5" /></div>
              </div>
              <p className="text-sm text-red-500 font-medium mt-4">+0.8% <span className="text-gray-400 font-normal">vs last month</span></p>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">Avg Debt Capacity</p>
                  <h3 className="text-2xl font-bold text-gray-800">₱150K</h3>
                </div>
                <div className="p-2 bg-blue-50 rounded-lg text-blue-500"><CreditCard className="w-5 h-5" /></div>
              </div>
              <p className="text-sm text-gray-500 font-medium mt-4">Healthy leverage threshold</p>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">Loyalty Score</p>
                  <h3 className="text-2xl font-bold text-gray-800">92/100</h3>
                </div>
                <div className="p-2 bg-purple-50 rounded-lg text-purple-500"><HeartHandshake className="w-5 h-5" /></div>
              </div>
              <p className="text-sm text-green-600 font-medium mt-4">+2 pts <span className="text-gray-400 font-normal">YTD</span></p>
            </div>
          </div>

          {/* ROW 2: STRATEGIC TRENDS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 min-w-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-w-0">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Seasonal Loan Demand & Risk Forecast</h3>
              <p className="text-sm text-gray-500 mb-4">Monthly demand trends with seasonal risk indicators</p>
              <div className="h-72">
                {chartsReady ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                  <ComposedChart data={seasonalData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                    <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#FFFFFF', padding: '12px' }}/>
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Area type="monotone" dataKey="demand" name="Actual Demand" fill="#D1FAE5" stroke="#10B981" strokeWidth={2} />
                    <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#059669" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    <Area type="monotone" dataKey="riskZone" name="Risk Zone" fill="#FECACA" stroke="#DC2626" strokeWidth={1} />
                  </ComposedChart>
                </ResponsiveContainer> : <div className="h-full w-full rounded-lg bg-gray-50" />}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-w-0">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Delinquency Trajectory (30/60/90 Days)</h3>
              <p className="text-sm text-gray-500 mb-4">Stacked delinquency aging by month</p>
              <div className="h-72">
                {chartsReady ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                  <BarChart data={delinquencyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                    <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#FFFFFF', padding: '12px' }}/>
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar dataKey="30-Day" stackId="a" fill="#FCD34D" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="60-Day" stackId="a" fill="#F97316" />
                    <Bar dataKey="90-Day" stackId="a" fill="#EF4444" radius={[0, 0, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer> : <div className="h-full w-full rounded-lg bg-gray-50" />}
              </div>
            </div>
          </div>

          {/* ROW 3: DEMOGRAPHICS & DIAGNOSTICS */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8 min-w-0">
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-w-0">
              <h3 className="text-sm font-bold text-gray-800 mb-1">Member Churn / Dropout</h3>
              <p className="text-xs text-gray-500 mb-4">Monthly attrition trend</p>
              <div className="h-48">
                {chartsReady ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
                  <LineChart data={seasonalData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#FFFFFF', padding: '12px' }} />
                    <Line type="monotone" dataKey="riskZone" name="Dropout Vol." stroke="#DC2626" strokeWidth={3} dot={{ fill: '#DC2626', r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer> : <div className="h-full w-full rounded-lg bg-gray-50" />}
              </div>
            </div>

            {/* UPDATED GENDER CHART */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center min-w-0">
              <div className="w-full flex justify-between items-center mb-4">
                 <div>
                   <h3 className="text-sm font-bold text-gray-800">Gender Distribution</h3>
                   <p className="text-xs text-gray-500 mt-0.5">Active member composition</p>
                 </div>
                 <span className="text-xs font-medium bg-green-50 text-green-700 px-3 py-1 rounded-lg">100 Members</span>
              </div>
              <div className="h-48 w-full">
                {chartsReady ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
                  <PieChart>
                    <Pie 
                      data={genderData} 
                      innerRadius={50} 
                      outerRadius={70} 
                      paddingAngle={3} 
                      dataKey="value"
                      stroke="white"
                      strokeWidth={2}
                    >
                      {genderData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#FFFFFF', padding: '12px' }} formatter={(value) => `${value} members`} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ paddingTop: '16px' }} />
                  </PieChart>
                </ResponsiveContainer> : <div className="h-full w-full rounded-lg bg-gray-50" />}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-w-0">
              <h3 className="text-sm font-bold text-gray-800 mb-1">Debt Capacity vs Repayment Health</h3>
              <p className="text-xs text-gray-500 mb-4">Member clusters by debt and repayment speed</p>
              <div className="h-48">
                {chartsReady ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
                  <ScatterChart margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f0f0f0" />
                    <XAxis type="number" dataKey="debt" name="Debt (₱)" tickFormatter={(val) => `${val/1000}k`} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <YAxis type="number" dataKey="repaymentSpeed" name="Speed %" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <Tooltip cursor={{ strokeDasharray: '0' }} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#FFFFFF', padding: '12px' }} />
                    <Scatter name="Members" data={scatterData} fill="#10B981" />
                  </ScatterChart>
                </ResponsiveContainer> : <div className="h-full w-full rounded-lg bg-gray-50" />}
              </div>
            </div>

          </div>

          {/* ROW 4: TRANSACTION HISTORY */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Recent Transactions</h3>
              <button className="text-sm text-[#2C7A3F] font-medium hover:underline">View All</button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                    <th className="p-4 font-semibold">Transaction ID</th>
                    <th className="p-4 font-semibold">Member / Entity</th>
                    <th className="p-4 font-semibold">Type</th>
                    <th className="p-4 font-semibold">Date</th>
                    <th className="p-4 font-semibold text-right">Amount</th>
                    <th className="p-4 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-gray-700 divide-y divide-gray-50">
                  {transactionHistory.map((txn) => (
                    <tr key={txn.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 font-medium text-gray-900">{txn.id}</td>
                      <td className="p-4">{txn.member}</td>
                      <td className="p-4 text-gray-500">{txn.type}</td>
                      <td className="p-4 text-gray-500">{txn.date}</td>
                      <td className="p-4 text-right font-medium">
                        <div className="flex items-center justify-end gap-1">
                          {txn.isCredit ? <ArrowDownRight className="w-4 h-4 text-green-500" /> : <ArrowUpRight className="w-4 h-4 text-red-500" />}
                          <span className={txn.isCredit ? "text-green-600" : "text-gray-800"}>{txn.amount}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {txn.status === 'Completed' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
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

export default Dashboard_BOD;