import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { managerNav } from "../../components/StaffSidebar/configs/manager";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import Breadcrumb from "../../components/Breadcrumb";
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
  BarChart3,
  Brain,
  Briefcase,
  ChevronRight,
} from "lucide-react";
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

const TYPE_COLORS = ['#166534', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4'];
// Emergency loans always render in red, regardless of their rank in the distribution.
// Matched by substring since loan_types.name varies between seeds ("Emergency" vs "Emergency Loan").
const getLoanTypeColor = (name, i) =>
  /emergency/i.test(name) ? '#dc2626' : TYPE_COLORS[i % TYPE_COLORS.length];

const M_Dashboard = () => {
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
  const [creditRiskQueue, setCreditRiskQueue] = useState([]);
  const [creditRiskModelVersion, setCreditRiskModelVersion] = useState(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";


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
            color: getLoanTypeColor(name, i),
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

    // Separate fetch for Credit Risk queue — decoupled so a slow scoring
    // pass doesn't hold up the rest of the dashboard.
    const loadCreditRisk = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/credit-risk/queue`);
        const json = await res.json();
        if (!res.ok || !json?.success || !isMounted) return;
        const data = json?.data || {};
        setCreditRiskQueue(Array.isArray(data.rows) ? data.rows : []);
        setCreditRiskModelVersion(data.model_version || null);
      } catch (err) {
        console.warn("Credit risk queue fetch failed:", err);
      }
    };
    loadCreditRisk();

    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const creditRiskSnapshot = useMemo(() => {
    const scored = creditRiskQueue.filter((r) => r.probability != null);
    const high = scored.filter((r) => r.probability >= 0.6);
    const watch = scored.filter((r) => r.probability >= 0.3 && r.probability < 0.6);
    const low = scored.filter((r) => r.probability < 0.3);
    const topHigh = [...high]
      .sort((a, b) => (b.probability || 0) - (a.probability || 0))
      .slice(0, 3);
    return {
      total: scored.length,
      queueTotal: creditRiskQueue.length,
      high: high.length,
      watch: watch.length,
      low: low.length,
      topHigh,
      modelVersion: creditRiskModelVersion,
    };
  }, [creditRiskQueue, creditRiskModelVersion]);

  const totalActive = stats.totalLoans || 0;


  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR (Kept from your original code) */}
      <StaffSidebar portal="Manager" items={managerNav} />

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        {/* HEADER (Kept mostly identical) */}
        <StaffTopbar portal="Manager" notifications={<LoanNotificationBell role="manager" />} />

        {/* PAGE CONTENT */}
        <main className="p-8">
          <Breadcrumb portal="Manager" page="Dashboard" />
          {/* TITLE */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Overview of loan approvals, portfolio health, and credit risk for your review.
              </p>
            </div>
          </div>

          {/* KPI CARDS */}
          <StatCardRow cols={4}>
            <StatCard
              label="Pending Approvals"
              value={loading ? '—' : stats.pendingApprovals}
              icon={ClipboardCheck}
              iconColor="text-orange-500"
              subtext="Loans recommended for your approval"
            />
            <StatCard
              label="Approved Loans"
              value={loading ? '—' : stats.approvedThisMonth}
              icon={CheckCircle}
              iconColor="text-green-600"
              subtext="Disbursed this month"
            />
            <StatCard
              label="Total Loans on File"
              value={loading ? '—' : stats.totalLoans}
              icon={Wallet}
              iconColor="text-blue-500"
              subtext={loading ? 'Loading…' : `${stats.activeLoans} active (released or partially paid)`}
            />
            <StatCard
              label="Delinquent Rate"
              value={loading ? '—' : `${stats.delinquentRate.toFixed(1)}%`}
              icon={AlertTriangle}
              iconColor="text-red-500"
              subtext="Active loans with overdue schedules"
            />
          </StatCardRow>

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

          {/* Credit Risk Snapshot — clickable, routes to /manager-credit-risk */}
          <button
            type="button"
            onClick={() => navigate("/manager-credit-risk")}
            className="w-full text-left bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-200 transition mb-6 group"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-lg ${creditRiskSnapshot.high > 0 ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600"}`}>
                  <Brain size={20} />
                </div>
                <div>
                  <h3 className="text-gray-800 font-bold text-lg flex items-center gap-2">
                    Credit Risk Snapshot
                    <ChevronRight size={18} className="text-gray-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition" />
                  </h3>
                  <p className="text-gray-500 text-xs mt-0.5">
                    Model-scored loan applicants awaiting your decision · click for queue
                  </p>
                  <p className="text-xs text-indigo-700 mt-0.5">
                    Model: {creditRiskSnapshot.modelVersion || "not identified"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-gray-500 font-medium">High Risk</p>
                  <p className={`text-2xl font-bold ${creditRiskSnapshot.high > 0 ? "text-red-600" : "text-gray-400"}`}>
                    {creditRiskSnapshot.high}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Watch</p>
                  <p className={`text-2xl font-bold ${creditRiskSnapshot.watch > 0 ? "text-amber-600" : "text-gray-400"}`}>
                    {creditRiskSnapshot.watch}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Low</p>
                  <p className={`text-2xl font-bold ${creditRiskSnapshot.low > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                    {creditRiskSnapshot.low}
                  </p>
                </div>
              </div>
            </div>

            {creditRiskSnapshot.topHigh.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                  Top high-risk applicants
                </p>
                <ul className="space-y-2">
                  {creditRiskSnapshot.topHigh.map((r) => (
                    <li key={r.loan_id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        <span className="font-semibold text-gray-800">{r.member_name || "—"}</span>
                        <span className="text-xs text-gray-400">{r.loan_type || ""}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">{formatCurrency(r.loan_amount)}</span>
                        <span className="text-xs font-bold text-red-600">{(r.probability * 100).toFixed(0)}%</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {creditRiskSnapshot.queueTotal === 0 && (
              <p className="mt-4 text-sm text-gray-500 font-medium">
                No applicants currently awaiting your decision.
              </p>
            )}
            {creditRiskSnapshot.queueTotal > 0 && creditRiskSnapshot.high === 0 && (
              <p className="mt-4 text-sm text-emerald-700 font-medium">
                No high-risk applicants in the queue. {creditRiskSnapshot.queueTotal} to review.
              </p>
            )}
          </button>

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
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">MEMBER NAME</th>
                    <th className="p-5 font-bold">LOAN TYPE</th>
                    <th className="p-5 font-bold">AMOUNT</th>
                    <th className="p-5 font-bold">APPLIED</th>
                    <th className="p-5 font-bold">STATUS</th>
                    <th className="p-5 font-bold">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-5 text-sm text-center text-gray-400">Loading approval queue…</td>
                    </tr>
                  ) : recentRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-5 text-sm text-center text-gray-400">
                        No loans waiting for your review. Nice work.
                      </td>
                    </tr>
                  ) : (
                    recentRequests.map((req) => (
                      <tr
                        key={req.id}
                        onClick={() => navigate(`/loan-approval/${encodeURIComponent(req.id)}`)}
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer"
                      >
                        <td className="p-5 font-bold text-gray-800">{req.name}</td>
                        <td className="p-5 text-gray-500">{req.type}</td>
                        <td className="p-5 font-bold text-gray-800">{req.amount}</td>
                        <td className="p-5 text-gray-500">{req.date}</td>
                        <td className="p-5">
                          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider bg-orange-100 text-orange-600">
                            {req.status}
                          </span>
                        </td>
                        <td className="p-5">
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