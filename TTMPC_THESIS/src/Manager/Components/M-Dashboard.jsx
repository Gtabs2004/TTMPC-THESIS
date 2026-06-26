import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import LoanDemandForecastCard from "../../components/LoanDemandForecastCard";
import { supabase } from "../../supabaseClient";
import RecentActivityCard from "../../components/RecentActivityCard";
import {
  LayoutDashboard,
  Users,
  Search,
  Bell,
  ClipboardCheck,
  CheckCircle,
  Wallet,
  AlertTriangle,
  ChevronDown,
  History,
  BarChart3 ,
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

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

const TYPE_COLORS = ['#166534', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const M_Dashboard = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const [stats, setStats] = useState({
    pendingApprovals: 0,
    approvedThisMonth: 0,
    activeLoans: 0,
    totalLoans: 0,
    delinquentRate: 0,
  });
  const [trendData, setTrendData] = useState([]);
  const [distributionData, setDistributionData] = useState([]);
  const [recentRequests, setRecentRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Loan Approval", icon: ClipboardCheck },
    { name: "Manage Member", icon: Users },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Log", icon: History },
  ];

  useEffect(() => {
    let isMounted = true;
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        // 6-month trailing window for the trend chart.
        const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10);

        // Parallel fetch — five small queries.
        const [
          pendingResult,
          approvedMonthResult,
          activeLoansResult,
          totalLoansResult,
          loanTypesResult,
          recentSixMonthsResult,
          delinquencyResult,
        ] = await Promise.all([
          supabase
            .from('loans')
            .select('control_number, loan_amount, application_date, loan_type_id, member:member_id(first_name, last_name), loan_types:loan_type_id(name)', { count: 'exact' })
            .eq('loan_status', 'recommended for approval')
            .order('application_date', { ascending: false })
            .limit(5),
          supabase
            .from('loans')
            .select('control_number', { count: 'exact', head: true })
            .gte('disbursal_date', monthStart)
            .in('loan_status', ['released', 'partially paid', 'fully paid']),
          supabase
            .from('loans')
            .select('control_number, loan_type_id, loan_types:loan_type_id(name)', { count: 'exact' })
            .in('loan_status', ['released', 'partially paid'])
            .limit(10000),
          supabase
            .from('loans')
            .select('control_number, loan_type_id', { count: 'exact' })
            .limit(10000),
          supabase
            .from('loan_types')
            .select('id, name'),
          supabase
            .from('loans')
            .select('application_date, loan_status')
            .gte('application_date', trendStart)
            .in('loan_status', ['released', 'partially paid', 'fully paid', 'recommended for approval']),
          // Delinquency proxy: count active loans where any schedule is overdue.
          supabase
            .from('loan_schedules')
            .select('loan_id, schedule_status')
            .eq('schedule_status', 'overdue'),
        ]);

        if (!isMounted) return;

        // KPI 1: pending approvals
        const pendingCount = pendingResult?.count || (pendingResult?.data || []).length || 0;

        // KPI 2: approved this month
        const approvedMonth = approvedMonthResult?.count || 0;

        // KPI 3: total active loans + KPI 4 source
        const activeLoans = activeLoansResult?.data || [];
        const activeLoansCount = activeLoansResult?.count ?? activeLoans.length;
        const activeLoanIds = new Set(activeLoans.map((l) => l.control_number));
        const allLoans = totalLoansResult?.data || [];
        const totalLoansCount = totalLoansResult?.count ?? allLoans.length;

        // KPI 4: delinquency rate = unique active loans with overdue schedule / total active loans
        const overdueLoanIds = new Set(
          (delinquencyResult?.data || [])
            .map((s) => s.loan_id)
            .filter((id) => activeLoanIds.has(id))
        );
        const delinquentRate = activeLoansCount
          ? (overdueLoanIds.size / activeLoansCount) * 100
          : 0;

        setStats({
          pendingApprovals: pendingCount,
          approvedThisMonth: approvedMonth,
          activeLoans: activeLoansCount,
          totalLoans: totalLoansCount,
          delinquentRate,
        });

        // Distribution chart — group all loans on file by loan type name
        const typeNameById = new Map(
          (loanTypesResult?.data || []).map((t) => [t.id, t.name])
        );
        const typeCounts = new Map();
        allLoans.forEach((l) => {
          const name = typeNameById.get(l.loan_type_id) || 'Other';
          typeCounts.set(name, (typeCounts.get(name) || 0) + 1);
        });
        const total = allLoans.length || 1;
        const distRows = [...typeCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, count], i) => ({
            name,
            value: Math.round((count / total) * 100),
            count,
            color: TYPE_COLORS[i % TYPE_COLORS.length],
          }));
        setDistributionData(distRows);

        // Trend chart — bucket the last 6 months by application_date
        const buckets = new Map();
        for (let i = 5; i >= 0; i -= 1) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
          buckets.set(key, 0);
        }
        (recentSixMonthsResult?.data || []).forEach((row) => {
          if (!row.application_date) return;
          const d = new Date(row.application_date);
          const key = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
          if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
        });
        setTrendData([...buckets.entries()].map(([name, value]) => ({ name, value })));

        // Recent requests — top 5 pending Manager review
        const recentRows = (pendingResult?.data || []).map((l) => {
          const firstName = String(l.member?.first_name || '').trim();
          const lastName = String(l.member?.last_name || '').trim();
          const name = `${firstName} ${lastName}`.trim() || 'Unknown Member';
          return {
            id: l.control_number,
            name,
            type: l.loan_types?.name || '—',
            amount: formatCurrency(l.loan_amount),
            date: formatDate(l.application_date),
            status: 'RECOMMENDED',
          };
        });
        setRecentRequests(recentRows);
      } catch (err) {
        if (isMounted) {
          addNotification(err?.message || 'Unable to load dashboard metrics.', 'error');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadDashboard();
    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalActive = stats.totalLoans || 0;

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
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
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
              "Reports": "/manager-reports",
              "Audit Log": "/manager-audit-log",
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
          <LoanNotificationBell role="manager" />
          <img src="/img/bookkeeper-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
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
                <p className="font-bold text-3xl text-gray-800 mt-1">{loading ? '—' : stats.pendingApprovals}</p>
                <p className="text-xs font-medium text-gray-400 mt-2">Loans recommended for your approval</p>
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
                <p className="font-bold text-3xl text-gray-800 mt-1">{loading ? '—' : stats.approvedThisMonth}</p>
                <p className="text-xs font-medium text-gray-400 mt-2">Disbursed this month</p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-blue-50 text-blue-500 rounded-lg"><Wallet size={20} /></div>
                <span className="bg-blue-50 text-blue-600 rounded-full px-3 py-1 text-xs font-bold">Total Portfolio</span>
              </div>
              <div>
                <h3 className="text-gray-500 text-sm font-medium">Total Loans on File</h3>
                <p className="font-bold text-3xl text-gray-800 mt-1">{loading ? '—' : stats.totalLoans}</p>
                <p className="text-xs font-medium text-gray-400 mt-2">
                  {loading ? 'Loading…' : `${stats.activeLoans} active (released or partially paid)`}
                </p>
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
                <p className="font-bold text-3xl text-gray-800 mt-1">{loading ? '—' : `${stats.delinquentRate.toFixed(1)}%`}</p>
                <p className="text-xs font-medium text-gray-400 mt-2">Active loans with overdue schedules</p>
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
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
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
                {/* Center Text inside Donut */}
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-800">{totalActive}</span>
                  <span className="text-[10px] text-gray-400 font-bold tracking-widest">TOTAL</span>
                </div>
              </div>

              {/* Custom Legend */}
              <div className="mt-4 flex flex-col gap-2">
                {distributionData.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-2">No active loans yet</p>
                ) : (
                  distributionData.map((item, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                        <span className="text-gray-600">{item.name}</span>
                      </div>
                      <span className="font-bold text-gray-800">{item.value}%</span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* My Audit Activity */}
          <div className="mb-6">
            <RecentActivityCard to="/manager-audit-log" title="My Audit Activity" />
          </div>

          {/* RECENT REQUESTS TABLE */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 flex justify-between items-center border-b border-gray-100">
              <h3 className="text-gray-800 font-bold text-lg">Pending Approval Requests</h3>
              <button
                onClick={() => navigate('/loan-approval')}
                className="text-green-700 text-sm font-bold hover:underline"
              >
                View All
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#66B538] text-white text-xs font-bold tracking-wider">
                    <th className="p-4 pl-6">MEMBER NAME</th>
                    <th className="p-4">LOAN TYPE</th>
                    <th className="p-4">AMOUNT</th>
                    <th className="p-4">APPLIED</th>
                    <th className="p-4">STATUS</th>
                    <th className="p-4 pr-6">ACTION</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-gray-400 text-sm">Loading approval queue…</td>
                    </tr>
                  ) : recentRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-gray-400 text-sm">
                        No loans waiting for your review. Nice work.
                      </td>
                    </tr>
                  ) : (
                    recentRequests.map((req) => (
                      <tr
                        key={req.id}
                        onClick={() => navigate(`/loan-approval/${encodeURIComponent(req.id)}`)}
                        className="border-b border-gray-50 hover:bg-green-50 transition-colors cursor-pointer"
                      >
                        <td className="p-4 pl-6 font-bold text-gray-800">{req.name}</td>
                        <td className="p-4 text-gray-500">{req.type}</td>
                        <td className="p-4 font-bold text-gray-800">{req.amount}</td>
                        <td className="p-4 text-gray-500 text-xs">{req.date}</td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider bg-orange-100 text-orange-600">
                            {req.status}
                          </span>
                        </td>
                        <td className="p-4 pr-6">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/loan-approval/${encodeURIComponent(req.id)}`); }}
                            className="text-green-700 font-bold hover:text-green-800 transition-colors"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
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