import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import { supabase } from "../../supabaseClient";
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

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const timeAgo = (iso) => {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const Dashboard = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();

  const [loans, setLoans] = useState([]);
  const [shareCapitalTotal, setShareCapitalTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [creditRiskQueue, setCreditRiskQueue] = useState([]);
  const [creditRiskModelVersion, setCreditRiskModelVersion] = useState(null);
  const [isSavingsOpen, setIsSavingsOpen] = useState(false);

   const menuItems = [
       { name: "Dashboard", icon: LayoutDashboard },
       { name: "Manage Member", icon: Users },
       { name: "Loan Approval", icon: FileText },
       { name: "Manage Loans", icon: Briefcase },

      { name: "Credit Risk", icon: Brain },
       { name: "Payments", icon: Wallet },
       {
         name: "Savings Accounts",
         icon: PiggyBank,
         isDropdown: true,
         subItems: [
           { name: "All Accounts", path: "/bookkeeper-savings-accounts" },
           { name: "Savings Withdrawals", path: "/bookkeeper-savings-transactions" },
         ],
       },
       { name: "Accounting", icon: Calculator },
       { name: "MIGS Scoring", icon: Activity },
       { name: "Reports", icon: BarChart3 },
       { name: "Audit Trail", icon: History },
       { name: "Grocery", icon: Coins },
       
     ];

 const routeMap = {
    Dashboard: "/dashboard",
    "Manage Member": "/manage-member",
    "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans": "/manage-loans",
 
    "Credit Risk": "/bookkeeper-credit-risk",
    Payments: "/payments",
    "Savings Withdrawals": "/bookkeeper-savings-transactions",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
    Grocery: "/grocery",
    
  }

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function fetchShareCapital() {
      try {
        const capRes = await fetch(`${API_BASE_URL}/api/secretary/membership-records`);
        const capJson = await capRes.json();
        const records = Array.isArray(capJson)
          ? capJson
          : Array.isArray(capJson?.data)
            ? capJson.data
            : Array.isArray(capJson?.records)
              ? capJson.records
              : [];
        return records.reduce((sum, r) => sum + Number(r?.paid_up_capital || 0), 0);
      } catch {
        console.warn("Share capital API failed, falling back to CBU query");
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
      }
    }

    async function fetchData() {
      try {
        // Fire both requests in parallel — share capital no longer waits for loans
        const [loansRes, totalCapital] = await Promise.all([
          fetch(`${API_BASE_URL}/api/bookkeeper/manage-loans`),
          fetchShareCapital(),
        ]);

        const loansJson = await loansRes.json();
        if (!loansRes.ok || !loansJson?.success) {
          throw new Error(loansJson?.detail || "Failed to load loans data.");
        }
        const rows = Array.isArray(loansJson?.data?.rows) ? loansJson.data.rows : [];

        if (cancelled) return;
        setLoans(rows);
        setShareCapitalTotal(totalCapital);
        setLoadError("");
      } catch (err) {
        if (cancelled) return;
        console.error("Dashboard load failed:", err);
        setLoadError(err?.message || "Unable to load dashboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    // Separate fetch for Credit Risk — cached backend so it's cheap, and
    // decoupled from the main loans fetch so a slow /score-loan doesn't hold
    // up the rest of the dashboard.
    async function fetchCreditRisk() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/credit-risk/queue`);
        const json = await res.json();
        if (!res.ok || !json?.success) return;
        if (cancelled) return;
        const data = json?.data || {};
        setCreditRiskQueue(Array.isArray(data.rows) ? data.rows : []);
        setCreditRiskModelVersion(data.model_version || null);
      } catch (err) {
        // Silent-fail — dashboard still works without the credit risk card.
        console.warn("Credit risk queue fetch failed:", err);
      }
    }

    fetchData();
    fetchCreditRisk();
    // 60s poll (was 15s) — endpoint takes 8-15s cold and the tighter interval
    // caused request pile-up on the Bookkeeper's browser. Backend now caches
    // responses for 30s so the second poll is near-instant.
    const intervalId = window.setInterval(fetchData, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const allPayments = useMemo(
    () => loans.flatMap((loan) => (loan.payment_history || []).map((p) => ({ ...p, loan }))),
    [loans]
  );

  const stats = useMemo(() => {
    // Total loans = every loan the bookkeeper is tracking (approved onward,
    // filtered upstream). Previously we hid delinquent + zero-balance rows.
    const totalLoans = loans.length;

    const currentKey = monthKey(new Date());
    const prevDate = new Date();
    prevDate.setMonth(prevDate.getMonth() - 1);
    const prevKey = monthKey(prevDate);

    const sumForKey = (key) =>
      allPayments
        .filter((p) => String(p.date_paid || "").slice(0, 7) === key)
        .reduce((s, p) => s + Number(p.amount_paid || 0), 0);

    const paymentsThisMonth = sumForKey(currentKey);
    const paymentsLastMonth = sumForKey(prevKey);
    const monthChangePct = paymentsLastMonth > 0
      ? ((paymentsThisMonth - paymentsLastMonth) / paymentsLastMonth) * 100
      : 0;

    return {
      totalLoans,
      paymentsThisMonth,
      paymentsLastMonth,
      monthChangePct,
      shareCapital: shareCapitalTotal,
    };
  }, [loans, allPayments, shareCapitalTotal]);

  // Credit Risk snapshot for the dashboard snippet. Bucketed by
  // probability so the card mirrors the full Credit Risk page classification.
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

  // Yearly Collections — one bar per fiscal year across all migrated + live
  // payments. TTMPC's legacy data spans ~2015-2026, so a static "this year vs
  // last year" is not enough context for the panelists.
  const yearlyBarData = useMemo(() => {
    const byYear = new Map();
    allPayments.forEach((p) => {
      const y = String(p.date_paid || "").slice(0, 4);
      if (!y || y.length !== 4) return;
      byYear.set(y, (byYear.get(y) || 0) + Number(p.amount_paid || 0));
    });
    return Array.from(byYear.entries())
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, total]) => ({ name: year, value: Math.round(total) }));
  }, [allPayments]);

  const collectionsChangePct = useMemo(() => {
    if (yearlyBarData.length < 2) return 0;
    const latest = yearlyBarData[yearlyBarData.length - 1]?.value || 0;
    const prior = yearlyBarData[yearlyBarData.length - 2]?.value || 0;
    if (prior <= 0) return 0;
    return ((latest - prior) / prior) * 100;
  }, [yearlyBarData]);

  // Repayment behavior — monthly buckets for a user-picked year. TTMPC's 3-
  // month rule = delinquent when >90 days past due. Legacy due dates are
  // reconstructed but paired within a 180-day window so real late payments
  // register while renewal-era payments (long after original term) are
  // excluded from the ratio.
  const DELINQUENT_DAY_THRESHOLD = 90;

  const availableYears = useMemo(() => {
    const set = new Set();
    allPayments.forEach((p) => {
      if (p.days_offset === null || p.days_offset === undefined) return;
      const y = String(p.date_paid || "").slice(0, 4);
      if (y.length === 4) set.add(y);
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [allPayments]);

  const [chartYear, setChartYear] = useState("");
  useEffect(() => {
    if (!chartYear && availableYears.length) {
      // Default to the most recent year that has data.
      setChartYear(availableYears[0]);
    }
  }, [availableYears, chartYear]);

  const monthlyBehaviorData = useMemo(() => {
    const monthLabels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const buckets = monthLabels.map((label, idx) => ({
      name: label,
      monthIdx: idx,
      onTime: 0,
      late: 0,
    }));
    if (!chartYear) return [];
    allPayments.forEach((p) => {
      if (p.days_offset === null || p.days_offset === undefined) return;
      const iso = String(p.date_paid || "");
      if (iso.slice(0, 4) !== chartYear) return;
      const monthNum = Number(iso.slice(5, 7));
      if (!monthNum) return;
      const bucket = buckets[monthNum - 1];
      if (Number(p.days_offset) > DELINQUENT_DAY_THRESHOLD) bucket.late += 1;
      else bucket.onTime += 1;
    });
    return buckets.map((b) => {
      const total = b.onTime + b.late;
      return {
        name: b.name,
        onTimePct: total > 0 ? Math.round((b.onTime / total) * 100) : 0,
        latePct: total > 0 ? Math.round((b.late / total) * 100) : 0,
        onTimeCount: b.onTime,
        lateCount: b.late,
        total,
      };
    });
  }, [allPayments, chartYear]);

  const recentActivities = useMemo(() => {
    // Exclude future-dated payments — Recent Activity should reflect payments
    // that actually happened. The dataset carries simulated payments dated
    // 2026-2028; without this filter they all render as "Just now" (timeAgo
    // clamps negative deltas to 0) and drown out real recent activity.
    const now = Date.now();
    const sorted = [...allPayments]
      .filter((p) => {
        const t = new Date(p.date_paid || 0).getTime();
        return Number.isFinite(t) && t > 0 && t <= now;
      })
      .sort((a, b) => {
        const da = new Date(a.date_paid || 0).getTime();
        const db = new Date(b.date_paid || 0).getTime();
        return db - da;
      });
    return sorted.slice(0, 5).map((p, idx) => {
      const isLate = Number(p.penalties || 0) > 0;
      return {
        id: `${p.payment_id || p.loan?.loan_id || "payment"}-${idx}`,
        title: isLate ? "Late payment received" : "Payment received",
        name: p.loan?.member_name || "Member",
        amount: formatPeso(p.amount_paid),
        time: timeAgo(p.date_paid),
        color: isLate ? "bg-red-400" : "bg-green-500",
      };
    });
  }, [allPayments]);

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
      {/* SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row item s-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-primary">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Bookkeeper Portal" fallbackRole="Bookkeeper" />
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
                    onClick={() => setIsSavingsOpen(!isSavingsOpen)}
                    className="flex items-center justify-between p-2 rounded-md text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors w-full"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={20} />
                      <span>{item.name}</span>
                    </div>
                    {isSavingsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {isSavingsOpen && (
                    <div className="flex flex-col mt-1 space-y-1">
                      {item.subItems.map((subItem) => (
                        <NavLink
                          key={subItem.name}
                          to={subItem.path}
                          className={({ isActive }) =>
                            `block pl-11 pr-4 py-2 rounded-md transition-colors text-[13px] ${
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
            const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, "-")}`;

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
          <LoanNotificationBell role="bookkeeper" />
          <img
            src="/img/bookkeeper-profile.png"
            alt="Profile"
            className="ml-4 w-8 h-8 rounded-full bg-gray-200"
          />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
        </header>

        <main className="p-8">
          {loadError ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {loadError}
            </div>
          ) : null}

          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Card 1: Total Loans */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Total Loans</span>
                <div className="p-2 bg-green-50 text-green-500 rounded-lg">
                  <Users size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800">
                  {loading ? "..." : stats.totalLoans}
                </h3>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-gray-400">Legacy + live loans on record</span>
                </div>
              </div>
            </div>

            {/* Card 2: Payment This Month */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Payment This Month</span>
                <div className="p-2 bg-blue-50 text-blue-500 rounded-lg">
                  <Calendar size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800">
                  {loading ? "..." : formatPeso(stats.paymentsThisMonth)}
                </h3>
                {loading ? null : renderTrend(stats.monthChangePct)}
              </div>
            </div>

            {/* Card 3: Total Share Capital */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Total Share Capital</span>
                <div className="p-2 bg-purple-50 text-purple-500 rounded-lg">
                  <PiggyBank size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800">
                  {loading ? "..." : formatPesoCompact(stats.shareCapital)}
                </h3>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-gray-400">Across all members</span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Yearly Collections Bar Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <h3 className="text-gray-800 font-bold text-lg">Yearly Collections</h3>
                  <p className="text-gray-400 text-xs">Fiscal year totals (legacy + live)</p>
                </div>
                <div
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    collectionsChangePct >= 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                  }`}
                >
                  {collectionsChangePct >= 0 ? "+" : ""}
                  {collectionsChangePct.toFixed(1)}%
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <BarChart data={yearlyBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(val) => `${PESO}${Math.round(val / 1000)}k`} />
                    <Tooltip
                      formatter={(v) => [formatPeso(v), "Collected"]}
                      labelFormatter={(l) => `FY ${l}`}
                      cursor={{ fill: "rgba(16,185,129,0.08)" }}
                    />
                    <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
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
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500"></span><span className="text-gray-500">Healthy (&lt;2% late)</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400"></span><span className="text-gray-500">Watch (2-5%)</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400"></span><span className="text-gray-500">Poor (&gt;5%)</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300"></span><span className="text-gray-500">No data</span></div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
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
                    <ReferenceLine y={2} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "2%", fill: "#b45309", fontSize: 10, position: "insideRight" }} />
                    <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "5%", fill: "#b91c1c", fontSize: 10, position: "insideRight" }} />
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
                          entry.total === 0 ? "#d1d5db"
                          : entry.latePct > 5 ? "#f87171"
                          : entry.latePct >= 2 ? "#fbbf24"
                          : "#10b981";
                        return <Cell key={idx} fill={color} fillOpacity={0.8} />;
                      })}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
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
                        <span className="text-xs text-gray-500">{formatPeso(r.loan_amount)}</span>
                        <span className="text-xs font-bold text-red-600">{(r.probability * 100).toFixed(0)}%</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {creditRiskSnapshot.queueTotal === 0 && (
              <p className="mt-4 text-sm text-gray-500 font-medium">
                No applicants currently under review.
              </p>
            )}
            {creditRiskSnapshot.queueTotal > 0 && creditRiskSnapshot.high === 0 && (
              <p className="mt-4 text-sm text-emerald-700 font-medium">
                No high-risk applicants in the queue. {creditRiskSnapshot.queueTotal} to review.
              </p>
            )}
          </button>
          </div>

          {/* Bottom Activity Section */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-gray-800 font-bold text-lg mb-4">Recent Activity</h3>
            <div className="flex flex-col">
              {recentActivities.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">
                  {loading ? "Loading recent activity..." : "No recent payments recorded."}
                </p>
              ) : (
                recentActivities.map((activity) => (
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
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
