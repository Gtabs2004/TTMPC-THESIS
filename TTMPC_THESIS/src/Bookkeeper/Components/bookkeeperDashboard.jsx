import React, { useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import { UserAuth } from "../../contex/AuthContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import { supabase } from "../../supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../../lib/queryClient";
import { Skeleton, SkeletonChart, SkeletonList } from "../../components/Skeleton";
import RecentActivityCard from "../../components/RecentActivityCard";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Calculator,
  Activity,
  BarChart3,
  Search,
  TrendingUp,
  TrendingDown,
  Calendar,
  PiggyBank,
  Briefcase,
  Wallet,
  Coins,
  History,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  Brain,
  ArrowDownCircle,
  ArrowUpCircle,
  ShoppingCart,
  Receipt,
  X,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  Cell,
} from "recharts";
import { SERIES_PRIMARY, SEMANTIC_COLORS, REPAYMENT_HEALTH_COLORS } from "../../lib/chartColors";
import { formatRelativeTime } from "../../utils/relativeTime";
import { TableToolbar } from "../../components/TableToolbar";
import { loanStatusBadge, paymentStatusBadge, STATUS_BADGE_CLASSES } from "../../utils/transactionStatus";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const PESO = "₱";

const formatPeso = (value) => {
  const n = Number(value || 0);
  return `${PESO}${n.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
};

const formatPesoCompact = (value) => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return `${PESO}${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${PESO}${(n / 1_000).toFixed(1)}K`;
  return `${PESO}${n.toFixed(0)}`;
};

const timeAgo = formatRelativeTime;

// Slim, last-resort fallback for Total Share Capital only — mirrors the
// single aggregate dashboard-summary computes server-side (latest
// capital_build_up row per member), not the old 2000-row membership-records
// scan. Used only if the summary endpoint itself is unreachable.
async function fetchShareCapitalFallback() {
  try {
    const { data: cbuRows } = await supabase
      .from("capital_build_up")
      .select("member_id, ending_share_capital, transaction_date")
      .order("transaction_date", { ascending: false })
      .limit(2000);
    const latestByMember = new Map();
    (cbuRows || []).forEach((row) => {
      if (!row?.member_id) return;
      if (!latestByMember.has(row.member_id)) {
        latestByMember.set(row.member_id, Number(row.ending_share_capital || 0));
      }
    });
    return Array.from(latestByMember.values()).reduce((s, v) => s + v, 0);
  } catch {
    return 0;
  }
}

// Single dashboard-summary call replaces the old 3-endpoint fan-out
// (manage-loans + membership-records + credit-risk/queue), each of which
// pulled thousands of rows just to compute the handful of numbers and
// two chart aggregates this page shows. See /api/bookkeeper/dashboard-summary.
const BOOKKEEPER_DASHBOARD_QUERY_KEY = ["dashboard", "bookkeeper"];
async function fetchBookkeeperDashboard() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/bookkeeper/dashboard-summary`);
    const json = await res.json();
    if (!res.ok || !json?.success) {
      throw new Error(json?.detail || "Failed to load dashboard summary.");
    }
    return { summary: json.data, loadError: "" };
  } catch (err) {
    console.error("Dashboard summary load failed:", err);
    // Emergency fallback — only for the one figure with a legitimate
    // direct-Supabase path today. Everything else stays blank/last-known
    // rather than re-fetching the full heavy payloads client-side.
    const prev = queryClient.getQueryData(BOOKKEEPER_DASHBOARD_QUERY_KEY)?.summary;
    const fallbackCapital = await fetchShareCapitalFallback();
    return {
      summary: {
        ...(prev || { stats: {}, recent_activities: [], credit_risk: {}, yearly_collections: [], repayment_behavior_by_year: {} }),
        stats: { ...(prev?.stats || {}), share_capital: fallbackCapital },
      },
      loadError: err?.message || "Unable to load dashboard data.",
    };
  }
}

// Icon + label per Recent Activity transaction type (item 4). Deliberately
// excludes loan disbursement — that's a Treasurer action, not one a
// Bookkeeper records, so it doesn't belong in this list the way it does in
// BOD's own Recent Transactions.
const ACTIVITY_TYPE_META = {
  loan_payment: { label: "Loan Payment", icon: CreditCard, iconColor: "text-teal-600" },
  loan_application: { label: "Loan Application", icon: FileText, iconColor: "text-blue-600" },
  deposit: { label: "Deposit", icon: ArrowDownCircle, iconColor: "text-emerald-600" },
  withdrawal: { label: "Withdrawal", icon: ArrowUpCircle, iconColor: "text-rose-600" },
  fee: { label: "Fee Payment", icon: Receipt, iconColor: "text-amber-600" },
  grocery: { label: "Grocery", icon: ShoppingCart, iconColor: "text-lime-600" },
};

const Dashboard = () => {
    const navigate = useNavigate();

  const [pickedYear, setChartYear] = useState("");

  // Cached across navigation and re-polled every 60s (matches the endpoint's
  // own 90s server-side cache, so most polls are served from cache rather
  // than re-querying Supabase). `loading` is only true on the very first
  // load, when there's nothing cached to show yet.
  const { data, isPending: loading } = useQuery({
    queryKey: BOOKKEEPER_DASHBOARD_QUERY_KEY,
    queryFn: fetchBookkeeperDashboard,
    refetchInterval: 60000,
  });
  const summary = data?.summary ?? null;
  const loadError = data?.loadError ?? "";
  // Non-loan activity types (deposits, withdrawals, fees, grocery) have no
  // dedicated Bookkeeper detail page, so a row click opens this instead —
  // same pattern as BOD's Recent Transactions modal.
  const [activityModal, setActivityModal] = useState(null);

  const stats = useMemo(() => {
    const s = summary?.stats || {};
    const paymentsThisMonth = Number(s.payments_this_month || 0);
    const paymentsLastMonth = Number(s.payments_last_month || 0);
    const monthChangePct = paymentsLastMonth > 0
      ? ((paymentsThisMonth - paymentsLastMonth) / paymentsLastMonth) * 100
      : 0;
    return {
      totalLoans: s.total_loans || 0,
      paymentsThisMonth,
      paymentsLastMonth,
      monthChangePct,
      shareCapital: Number(s.share_capital || 0),
    };
  }, [summary]);

  // Credit Risk snapshot for the dashboard snippet — counts/top-3 now come
  // straight from the backend (dashboard-summary reads risk_assessments
  // directly), so there's no client-side band bucketing left to do here.
  const creditRiskSnapshot = useMemo(() => {
    const cr = summary?.credit_risk || {};
    return {
      total: cr.total || 0,
      queueTotal: cr.queue_total || 0,
      high: cr.high || 0,
      watch: cr.watch || 0,
      low: cr.low || 0,
      topHigh: (cr.top_high || []).map((r) => ({
        loan_id: r.loan_id,
        member_name: r.member_name,
        loan_type: r.loan_type,
        loan_amount: r.loan_amount,
        probability: r.probability,
      })),
      modelVersion: cr.model_version || null,
    };
  }, [summary]);

  // Yearly Collections — one bar per fiscal year across all migrated + live
  // payments. TTMPC's legacy data spans ~2015-2026, so a static "this year vs
  // last year" is not enough context for the panelists.
  const yearlyBarData = useMemo(() => {
    return (summary?.yearly_collections || []).map((row) => ({
      name: row.year,
      value: Math.round(Number(row.total || 0)),
    }));
  }, [summary]);

  const collectionsChangePct = useMemo(() => {
    if (yearlyBarData.length < 2) return 0;
    const latest = yearlyBarData[yearlyBarData.length - 1]?.value || 0;
    const prior = yearlyBarData[yearlyBarData.length - 2]?.value || 0;
    if (prior <= 0) return 0;
    return ((latest - prior) / prior) * 100;
  }, [yearlyBarData]);

  // Repayment behavior — monthly buckets for a user-picked year. TTMPC's 3-
  // month rule = delinquent when >90 days past due. Bucketing itself now
  // happens server-side (_compute_payment_charts); this just picks the
  // selected year's 12 months out of repayment_behavior_by_year.
  const behaviorByYear = useMemo(() => summary?.repayment_behavior_by_year || {}, [summary]);

  const availableYears = useMemo(() => {
    return Object.keys(behaviorByYear).sort((a, b) => Number(b) - Number(a));
  }, [behaviorByYear]);

  // Default to the most recent year that has data until the user picks one.
  const chartYear = pickedYear || availableYears[0] || "";

  const monthlyBehaviorData = useMemo(() => {
    const monthLabels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const buckets = behaviorByYear[chartYear] || [];
    return monthLabels.map((label, idx) => {
      const b = buckets[idx] || { on_time: 0, late: 0 };
      const total = (b.on_time || 0) + (b.late || 0);
      return {
        name: label,
        onTimePct: total > 0 ? Math.round((b.on_time / total) * 100) : 0,
        latePct: total > 0 ? Math.round((b.late / total) * 100) : 0,
        onTimeCount: b.on_time || 0,
        lateCount: b.late || 0,
        total,
      };
    });
  }, [behaviorByYear, chartYear]);

  // Recent Activity (item 4) — every transaction type the Bookkeeper deals
  // with, not just loan payments. Deliberately its own compact list design
  // (not BOD's Recent Transactions table): one line per item, status pill
  // instead of a plain colored dot, and the same Approved/Completed/Pending/
  // Rejected vocabulary BOD's dashboard uses (item 1's terminology
  // consistency) rather than ad hoc "Payment received" text.
  const recentActivities = useMemo(() => {
    return (summary?.recent_activities || []).map((a, idx) => {
      const meta = ACTIVITY_TYPE_META[a.type] || ACTIVITY_TYPE_META.loan_payment;
      const status = a.type === "loan_application"
        ? loanStatusBadge(a.status)
        : a.type === "loan_payment"
          ? (a.status === "Late" ? "Late" : a.status === "Pending" ? "Pending" : "Approved")
          : paymentStatusBadge(a.status);
      const clickable = a.type === "loan_payment" || a.type === "loan_application";
      return {
        key: `${a.type || "activity"}-${a.id || idx}`,
        type: meta.label,
        icon: meta.icon,
        iconColor: meta.iconColor,
        memberName: a.member_name || "Member",
        membershipId: a.membership_id || "",
        amountValue: Number(a.amount || 0),
        date: a.date,
        status,
        clickType: clickable ? "loan" : "modal",
        loanId: a.loan_id,
        rawType: a.type,
        id: a.id,
      };
    });
  }, [summary]);

  // Loan-related activity rows go straight to the loan's own ledger page —
  // same per-loan destination the notification bells and BOD's Recent
  // Transactions already use. Everything else (deposit/withdrawal/fee/
  // grocery) opens the details modal since there's no dedicated Bookkeeper
  // page for a single ledger/fee/grocery entry.
  const handleActivityClick = (activity) => {
    if (activity.clickType === "loan" && activity.loanId) {
      navigate(`/bookkeeper-loan-ledger/${encodeURIComponent(activity.loanId)}`);
    } else {
      setActivityModal(activity);
    }
  };

  const renderTrend = (pct) => {
    const positive = pct >= 0;
    const Icon = positive ? TrendingUp : TrendingDown;
    const color = positive ? "text-green-500" : "text-red-500";
    return (
      <div className="flex items-center mt-2 text-xs">
        <Icon size={14} className={`${color} mr-1`} />
        <span className={`${color} font-medium`}>
          {positive ? "+" : ""}
          {pct.toFixed(1)}%
        </span>
        <span className="text-gray-400 ml-1">vs last month</span>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-gray-50">

      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

      
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        <main className="p-8">
          <Breadcrumb portal="Bookkeeper" page="Dashboard" />
          {loadError ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {loadError}
            </div>
          ) : null}

       
          <StatCardRow cols={3}>
            <StatCard
              label="Total Loans"
              value={stats.totalLoans}
              loading={loading}
              icon={Users}
              iconColor="text-green-500"
              subtext="Legacy + live loans on record"
            />
            <StatCard
              label="Payment This Month"
              value={formatPeso(stats.paymentsThisMonth)}
              loading={loading}
              icon={Calendar}
              iconColor="text-blue-500"
              subtext={loading ? null : renderTrend(stats.monthChangePct)}
            />
            <StatCard
              label="Total Share Capital"
              value={formatPesoCompact(stats.shareCapital)}
              loading={loading}
              icon={PiggyBank}
              iconColor="text-purple-500"
              subtext="Across all members"
            />
          </StatCardRow>

          {/* Middle Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Yearly Collections Bar Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <h3 className="text-gray-800 font-bold text-lg">Yearly Collections</h3>
                  <p className="text-gray-400 text-xs">Fiscal year totals (legacy + live)</p>
                </div>
                {loading ? <Skeleton className="h-6 w-14" /> : <div
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    collectionsChangePct >= 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                  }`}
                >
                  {collectionsChangePct >= 0 ? "+" : ""}
                  {collectionsChangePct.toFixed(1)}%
                </div>}
              </div>
              <div className="h-64">
                {loading ? <SkeletonChart /> : <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <BarChart data={yearlyBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(val) => `${PESO}${Math.round(val / 1000)}k`} />
                    <Tooltip
                      formatter={(v) => [formatPeso(v), "Collected"]}
                      labelFormatter={(l) => `FY ${l}`}
                      cursor={{ fill: "rgba(22,101,52,0.08)" }}
                    />
                    <Bar dataKey="value" fill={SERIES_PRIMARY} radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>}
              </div>
            </div>

            {/* Repayment Behavior — monthly scatter for a selected year */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-4 gap-3 flex-wrap">
                <div>
                  <h3 className="text-gray-800 font-bold text-lg">Repayment Behavior</h3>
                  <p className="text-gray-400 text-xs">
                    Each dot = 1 month · dot size = payment volume · higher = more delinquent
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="chart-year" className="text-xs text-gray-500">Year</label>
                  <select
                    id="chart-year"
                    value={chartYear}
                    onChange={(e) => setChartYear(e.target.value)}
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                  >
                    {availableYears.length === 0 && <option value="">—</option>}
                    {availableYears.map((y) => (
                      <option key={y} value={y}>FY {y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-xs font-medium mb-3">
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: REPAYMENT_HEALTH_COLORS.healthy }}></span><span className="text-gray-500">Healthy (&lt;2% late)</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: REPAYMENT_HEALTH_COLORS.watch }}></span><span className="text-gray-500">Watch (2-5%)</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: REPAYMENT_HEALTH_COLORS.poor }}></span><span className="text-gray-500">Poor (&gt;5%)</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: REPAYMENT_HEALTH_COLORS.noData }}></span><span className="text-gray-500">No data</span></div>
              </div>
              <div className="h-56">
                {loading ? <SkeletonChart /> : <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <ScatterChart margin={{ top: 10, right: 20, left: -5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      type="category"
                      dataKey="name"
                      name="Month"
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      padding={{ left: 20, right: 20 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="latePct"
                      name="% Delinquent"
                      domain={[0, (dataMax) => Math.max(15, Math.ceil((dataMax + 2) / 5) * 5)]}
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ZAxis type="number" dataKey="total" range={[60, 500]} name="Payments" />
                    <ReferenceLine y={2} stroke={SEMANTIC_COLORS.warning} strokeDasharray="4 4" label={{ value: "2%", fill: "#b45309", fontSize: 10, position: "insideRight" }} />
                    <ReferenceLine y={5} stroke={SEMANTIC_COLORS.danger} strokeDasharray="4 4" label={{ value: "5%", fill: "#b91c1c", fontSize: 10, position: "insideRight" }} />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const r = payload[0].payload;
                        if (r.total === 0) {
                          return (
                            <div className="bg-white rounded-md border border-gray-200 shadow-sm px-3 py-2 text-xs">
                              <div className="font-semibold text-gray-800">{r.name} {chartYear}</div>
                              <div className="text-gray-500">No paired payments this month</div>
                            </div>
                          );
                        }
                        return (
                          <div className="bg-white rounded-md border border-gray-200 shadow-sm px-3 py-2 text-xs">
                            <div className="font-semibold text-gray-800 mb-1">{r.name} {chartYear}</div>
                            <div className="text-red-600">Delinquent: {r.latePct}% ({r.lateCount.toLocaleString()})</div>
                            <div className="text-green-600">On-time: {r.onTimePct}% ({r.onTimeCount.toLocaleString()})</div>
                            <div className="text-gray-500 mt-1 pt-1 border-t border-gray-100">
                              {r.total.toLocaleString()} paired payments
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={monthlyBehaviorData}>
                      {monthlyBehaviorData.map((entry, idx) => {
                        const color =
                          entry.total === 0 ? REPAYMENT_HEALTH_COLORS.noData
                          : entry.latePct > 5 ? REPAYMENT_HEALTH_COLORS.poor
                          : entry.latePct >= 2 ? REPAYMENT_HEALTH_COLORS.watch
                          : REPAYMENT_HEALTH_COLORS.healthy;
                        return <Cell key={idx} fill={color} fillOpacity={0.8} />;
                      })}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>}
              </div>
            </div>
          </div>

          {/* Credit Risk snapshot */}
          <div className="grid grid-cols-1 gap-6 mb-6">
          {/* Credit Risk Snapshot — clickable, routes to /bookkeeper-credit-risk */}
          <button
            type="button"
            onClick={() => navigate("/bookkeeper-credit-risk")}
            className="w-full text-left bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-200 transition group"
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
                    Model-scored loan applicants in review · click for queue
                  </p>
                  <p className="text-xs text-indigo-700 mt-0.5">
                    Model: {creditRiskSnapshot.modelVersion || "not identified"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-gray-500 font-medium">High Risk</p>
                  {loading ? <Skeleton className="h-8 w-10 mt-0.5" /> : <p className={`text-2xl font-bold ${creditRiskSnapshot.high > 0 ? "text-red-600" : "text-gray-400"}`}>
                    {creditRiskSnapshot.high}
                  </p>}
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Medium Risk</p>
                  {loading ? <Skeleton className="h-8 w-10 mt-0.5" /> : <p className={`text-2xl font-bold ${creditRiskSnapshot.watch > 0 ? "text-amber-600" : "text-gray-400"}`}>
                    {creditRiskSnapshot.watch}
                  </p>}
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Low Risk</p>
                  {loading ? <Skeleton className="h-8 w-10 mt-0.5" /> : <p className={`text-2xl font-bold ${creditRiskSnapshot.low > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                    {creditRiskSnapshot.low}
                  </p>}
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
                        <span className="text-xs text-gray-500">{formatPeso(r.loan_amount)}</span>
                        <span className="text-xs font-bold text-red-600">{(r.probability * 100).toFixed(0)}%</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!loading && creditRiskSnapshot.queueTotal === 0 && (
              <p className="mt-4 text-sm text-gray-500 font-medium">
                No applicants currently under review.
              </p>
            )}
            {!loading && creditRiskSnapshot.queueTotal > 0 && creditRiskSnapshot.high === 0 && (
              <p className="mt-4 text-sm text-emerald-700 font-medium">
                No high-risk applicants in the queue. {creditRiskSnapshot.queueTotal} to review.
              </p>
            )}
          </button>
          </div>

          {/* Recent Activity (item 4) — its own compact, clickable list
              design (not a copy of BOD's Recent Transactions table): one
              line per item, icon badge for the type, status pill, and a
              click straight through to the record. */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <TableToolbar
              title="Recent Activity"
              subtitle={loading ? "Loading…" : `${recentActivities.length} recent transaction${recentActivities.length === 1 ? "" : "s"}`}
            />
            <div className="divide-y divide-gray-50">
              {loading ? (
                <SkeletonList rows={5} className="px-6 py-4" />
              ) : recentActivities.length === 0 ? (
                <p className="text-sm text-gray-400 px-6 py-6">No recent activity recorded.</p>
              ) : (
                recentActivities.map((activity) => {
                  const Icon = activity.icon;
                  const badgeClass = STATUS_BADGE_CLASSES[activity.status] || STATUS_BADGE_CLASSES.Approved;
                  return (
                    <button
                      key={activity.key}
                      type="button"
                      onClick={() => handleActivityClick(activity)}
                      className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-gray-50/60 transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center shrink-0 ${activity.iconColor}`}>
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">{activity.memberName}</p>
                        <p className="text-xs text-gray-400">{activity.type}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-gray-800">{formatPeso(activity.amountValue)}</p>
                        <p className="text-xs text-gray-400">{timeAgo(activity.date)}</p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${badgeClass}`}>
                        {activity.status}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Activity details modal — deposit/withdrawal/fee/grocery rows have
          no dedicated Bookkeeper detail page, so a click surfaces everything
          about that transaction here instead of leaving the user to go
          search for it (item 4's "no manual searching" requirement). */}
      {activityModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setActivityModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-gray-100 w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-800">{activityModal.type}</h3>
              <button
                onClick={() => setActivityModal(null)}
                aria-label="Close"
                className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {[
                ["Member", activityModal.memberName],
                ["Amount", formatPeso(activityModal.amountValue)],
                ["Date", timeAgo(activityModal.date)],
                ["Status", activityModal.status],
                ["Reference", activityModal.id || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium text-gray-800 text-right">{value || "—"}</span>
                </div>
              ))}
            </div>
            <div className="p-5 pt-0 flex justify-end gap-2">
              {activityModal.membershipId && (
                <button
                  onClick={() => {
                    setActivityModal(null);
                    navigate(`/member_details?member_id=${encodeURIComponent(activityModal.membershipId)}&portal=bookkeeper`, {
                      state: { member: { member_id: activityModal.membershipId }, portal: "bookkeeper" },
                    });
                  }}
                  className="text-sm font-semibold text-green-700 hover:underline px-3 py-2"
                >
                  View Member Profile
                </button>
              )}
              <button
                onClick={() => setActivityModal(null)}
                className="text-sm font-medium text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg border border-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
