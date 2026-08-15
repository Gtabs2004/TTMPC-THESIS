import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Calculator,
  Activity,
  BarChart3,
  Search,
  Wallet,
  Coins,
  History,
  Briefcase,
  ShieldAlert,
  AlertTriangle,
  Clock,
  CheckCircle2,
  RefreshCw,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from "recharts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const PESO = "₱";
const DAY_MS = 1000 * 60 * 60 * 24;

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

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
    : "—";

// Aging bucket definitions. Aligns with TTMPC's 90-day delinquency rule (memory:
// project_delinquency_rule.md). Bucket boundaries are the standard aging schedule
// used by most cooperatives so panelists reading a Financial Statement will
// recognize the format.
const BUCKETS = [
  { key: "current", label: "Current", subtitle: "0-30 days", min: 0, max: 30, color: "green" },
  { key: "b30", label: "30-60 days", subtitle: "Past due", min: 31, max: 60, color: "amber" },
  { key: "b60", label: "60-90 days", subtitle: "At risk", min: 61, max: 90, color: "orange" },
  { key: "b90", label: "90+ days", subtitle: "Delinquent", min: 91, max: Infinity, color: "red" },
];

const BUCKET_STYLES = {
  green: { bg: "bg-green-50", text: "text-green-600", ring: "border-green-100", chip: "bg-green-100 text-green-700" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "border-amber-100", chip: "bg-amber-100 text-amber-700" },
  orange: { bg: "bg-orange-50", text: "text-orange-600", ring: "border-orange-100", chip: "bg-orange-100 text-orange-700" },
  red: { bg: "bg-red-50", text: "text-red-600", ring: "border-red-200", chip: "bg-red-100 text-red-700" },
};

// Return the timestamp of the most recent payment on the loan, or the
// application_date as a fallback. Used both to age individual loans and to
// derive the dataset-wide reference date.
const lastActivityTs = (loan) => {
  const history = Array.isArray(loan?.payment_history) ? loan.payment_history : [];
  if (history.length) {
    const times = history
      .map((p) => new Date(p.date_paid || 0).getTime())
      .filter((t) => !Number.isNaN(t) && t > 0);
    if (times.length) return Math.max(...times);
  }
  return new Date(loan?.application_date || 0).getTime() || 0;
};

// Days between the loan's last activity and the reference date (dataset-anchored,
// not today — see referenceTs below). Legacy data import ends around Feb 2026,
// so anchoring to "today" makes every legacy loan look 180+ days delinquent
// even if it was current at import.
const daysSinceLastPayment = (loan, referenceTs) => {
  const lastTs = lastActivityTs(loan);
  if (!lastTs) return 0;
  return Math.max(0, Math.floor((referenceTs - lastTs) / DAY_MS));
};

const bucketFor = (days) => BUCKETS.find((b) => days >= b.min && days <= b.max) || BUCKETS[0];

const Delinquency = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();

  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [loanTypeFilter, setLoanTypeFilter] = useState("all");
  // Default to Live so panelists see loans created through the running app —
  // not the 700+ imported legacy loans that all age into 90+ buckets and
  // would drown out the demo signal.
  const [sourceFilter, setSourceFilter] = useState("live");
  const [sortKey, setSortKey] = useState("days_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Manage Member", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: Briefcase },
    { name: "Delinquency", icon: ShieldAlert },
    { name: "Payments", icon: Wallet },
    { name: "Savings Withdrawals", icon: CreditCard },
    { name: "Accounting", icon: Calculator },
    { name: "MIGS Scoring", icon: Activity },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Trail", icon: History },
    { name: "Grocery", icon: Coins },
    { name: "Legacy Member Validation", icon: Search },
  ];

  const routeMap = {
    Dashboard: "/dashboard",
    "Manage Member": "/manage-member",
    "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans": "/manage-loans",
    Delinquency: "/delinquency",
    Payments: "/payments",
    "Savings Withdrawals": "/bookkeeper-savings-transactions",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
    Grocery: "/grocery",
    "Legacy Member Validation": "/legacy-member-validation",
  };

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const fetchLoans = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookkeeper/manage-loans`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.detail || "Failed to load loans data.");
      }
      const rows = Array.isArray(json?.data?.rows) ? json.data.rows : [];
      // Only loans with an outstanding balance can be delinquent.
      setLoans(rows.filter((l) => Number(l?.remaining_balance || 0) > 0));
      setLoadError("");
    } catch (err) {
      console.error("Delinquency load failed:", err);
      setLoadError(err?.message || "Unable to load delinquency data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLoans();
  }, []);

  // Collapse renewal / restructure chains so each (member, loan_type) reports
  // ONE row — the live loan (newest by application_date). Legacy CSV rows split
  // renewed loans into multiple snapshots; without this collapse a single
  // renewed member appears 3-5x in the worklist and inflates the delinquency
  // count. Mirrors the grouping logic in Manage-Loans.jsx.
  const liveLoans = useMemo(() => {
    const chains = new Map();
    for (const loan of loans) {
      const key = `${loan.member_name || ""}::${loan.loan_type_code || loan.loan_type || ""}`;
      if (!chains.has(key)) chains.set(key, []);
      chains.get(key).push(loan);
    }
    const parents = [];
    for (const items of chains.values()) {
      const sorted = [...items].sort((a, b) => {
        const da = new Date(a.application_date || 0).getTime();
        const db = new Date(b.application_date || 0).getTime();
        if (db !== da) return db - da;
        return String(b.loan_id || "").localeCompare(String(a.loan_id || ""));
      });
      parents.push(sorted[0]);
    }
    return parents;
  }, [loans]);

  // Reference date for all aging math. Uses the most recent payment in the
  // dataset, but capped at today — never in the future. Simulated/live loans
  // in this dataset carry future-dated payments (2026-2028), which would
  // otherwise anchor the reference date years ahead of "now" and flag every
  // loan as 600+ days delinquent. Capping at today makes future-dated
  // payments read as 0-days-past-due (on time), which is the correct
  // interpretation of a payment scheduled but not yet actually made.
  const referenceTs = useMemo(() => {
    let max = 0;
    for (const loan of loans) {
      const t = lastActivityTs(loan);
      if (t > max) max = t;
    }
    const today = Date.now();
    if (!max) return today;
    return Math.min(max, today);
  }, [loans]);

  const referenceLabel = useMemo(
    () =>
      new Date(referenceTs).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [referenceTs]
  );

  // Attach aging metadata to each live loan once so downstream filters/sorts
  // are cheap.
  const agedLoans = useMemo(
    () =>
      liveLoans.map((loan) => {
        const days = daysSinceLastPayment(loan, referenceTs);
        const b = bucketFor(days);
        const history = Array.isArray(loan.payment_history) ? loan.payment_history : [];
        const lastPayment = history
          .map((p) => p.date_paid)
          .filter(Boolean)
          .sort()
          .slice(-1)[0];
        return {
          ...loan,
          _days: days,
          _bucket: b.key,
          _bucketLabel: b.label,
          _bucketColor: b.color,
          _lastPayment: lastPayment || null,
        };
      }),
    [liveLoans, referenceTs]
  );

  const bucketTotals = useMemo(() => {
    const base = Object.fromEntries(BUCKETS.map((b) => [b.key, { count: 0, outstanding: 0 }]));
    agedLoans.forEach((loan) => {
      const t = base[loan._bucket];
      if (!t) return;
      t.count += 1;
      t.outstanding += Number(loan.remaining_balance || 0);
    });
    return base;
  }, [agedLoans]);

  const totalDelinquent = bucketTotals.b90 || { count: 0, outstanding: 0 };
  const totalPortfolio = agedLoans.length;
  const delinquencyRate = totalPortfolio > 0 ? (totalDelinquent.count / totalPortfolio) * 100 : 0;

  const loanTypes = useMemo(() => {
    const set = new Set();
    agedLoans.forEach((l) => l.loan_type_code && set.add(l.loan_type_code));
    return Array.from(set).sort();
  }, [agedLoans]);

  const filteredLoans = useMemo(() => {
    const text = searchTerm.trim().toLowerCase();
    let list = agedLoans.filter((loan) => {
      if (sourceFilter === "live" && loan.is_legacy) return false;
      if (sourceFilter === "legacy" && !loan.is_legacy) return false;
      if (bucketFilter !== "all" && loan._bucket !== bucketFilter) return false;
      if (loanTypeFilter !== "all" && loan.loan_type_code !== loanTypeFilter) return false;
      if (!text) return true;
      return (
        String(loan.member_name || "").toLowerCase().includes(text) ||
        String(loan.loan_id || "").toLowerCase().includes(text)
      );
    });

    switch (sortKey) {
      case "days_desc":
        list = list.sort((a, b) => b._days - a._days);
        break;
      case "days_asc":
        list = list.sort((a, b) => a._days - b._days);
        break;
      case "balance_desc":
        list = list.sort((a, b) => Number(b.remaining_balance || 0) - Number(a.remaining_balance || 0));
        break;
      case "name_asc":
        list = list.sort((a, b) => String(a.member_name || "").localeCompare(String(b.member_name || "")));
        break;
      default:
        break;
    }
    return list;
  }, [agedLoans, searchTerm, bucketFilter, loanTypeFilter, sortKey, sourceFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, bucketFilter, loanTypeFilter, sortKey, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLoans.length / ITEMS_PER_PAGE));
  const pagedLoans = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLoans.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredLoans, currentPage]);

  const bucketChartData = BUCKETS.map((b) => ({
    name: b.label,
    count: bucketTotals[b.key]?.count || 0,
    outstanding: bucketTotals[b.key]?.outstanding || 0,
    color: b.color,
  }));

  const chartColorFor = (color) => {
    if (color === "green") return "#10b981";
    if (color === "amber") return "#f59e0b";
    if (color === "orange") return "#fb923c";
    return "#ef4444";
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLoans();
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity
              className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold"
              fallbackPortal="Bookkeeper Portal"
              fallbackRole="Bookkeeper"
            />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
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
              placeholder="Search member or loan ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
          {/* Page header */}
          <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <ShieldAlert className="text-red-500" size={26} />
                Delinquency &amp; Aging
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Portfolio aging by days since last payment. TTMPC classifies loans past 90 days as{" "}
                <span className="font-semibold text-red-600">delinquent</span>.
              </p>
              <p className="text-xs text-gray-500 mt-2 inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                <Clock size={12} className="text-amber-600" />
                <span>
                  Aging computed as of <span className="font-semibold text-amber-800">{referenceLabel}</span>{" "}
                  (latest activity in dataset — not today).
                </span>
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {loadError ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {loadError}
            </div>
          ) : null}

          {/* Aging bucket KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {BUCKETS.map((b) => {
              const style = BUCKET_STYLES[b.color];
              const totals = bucketTotals[b.key] || { count: 0, outstanding: 0 };
              const share = totalPortfolio > 0 ? (totals.count / totalPortfolio) * 100 : 0;
              const Icon =
                b.key === "current" ? CheckCircle2 :
                b.key === "b90" ? AlertTriangle :
                Clock;
              return (
                <button
                  key={b.key}
                  onClick={() => setBucketFilter(bucketFilter === b.key ? "all" : b.key)}
                  className={`text-left bg-white rounded-xl p-5 shadow-sm border ${
                    bucketFilter === b.key ? `${style.ring} ring-2 ring-offset-1` : "border-gray-100"
                  } hover:shadow-md transition`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-gray-500 text-sm font-medium">{b.label}</span>
                      <p className={`text-xs mt-0.5 font-semibold ${style.text}`}>{b.subtitle}</p>
                    </div>
                    <div className={`p-2 ${style.bg} ${style.text} rounded-lg`}>
                      <Icon size={18} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-3xl font-bold text-gray-800">
                      {loading ? "..." : totals.count}
                    </h3>
                    <div className="mt-2 text-xs text-gray-500">
                      <span className="font-semibold text-gray-700">{formatPesoCompact(totals.outstanding)}</span>{" "}
                      outstanding Â· {share.toFixed(1)}% of portfolio
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Chart + summary strip */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <h3 className="text-gray-800 font-bold text-lg">Aging Distribution</h3>
                  <p className="text-gray-400 text-xs">Loan count per aging bucket</p>
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bucketChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#6b7280", fontSize: 12 }}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.03)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white rounded-md border border-gray-200 shadow-sm px-3 py-2 text-xs">
                            <div className="font-semibold text-gray-800">{d.name}</div>
                            <div className="text-gray-600">
                              {d.count} loan{d.count === 1 ? "" : "s"}
                            </div>
                            <div className="text-gray-500">{formatPeso(d.outstanding)} outstanding</div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={54}>
                      {bucketChartData.map((entry, idx) => (
                        <Cell key={idx} fill={chartColorFor(entry.color)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex flex-col">
              <h3 className="text-gray-800 font-bold text-lg">Portfolio Health</h3>
              <p className="text-gray-400 text-xs mb-4">Live snapshot</p>
              <div className="space-y-4 flex-1">
                <div>
                  <p className="text-xs text-gray-500 font-medium">Delinquency Rate</p>
                  <p className={`text-3xl font-bold ${delinquencyRate > 5 ? "text-red-600" : delinquencyRate > 2 ? "text-amber-600" : "text-green-600"}`}>
                    {delinquencyRate.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {totalDelinquent.count} of {totalPortfolio} active loans
                  </p>
                </div>
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 font-medium">Delinquent Balance</p>
                  <p className="text-2xl font-bold text-gray-800">{formatPesoCompact(totalDelinquent.outstanding)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Outstanding on 90+ day loans</p>
                </div>
              </div>
            </div>
          </div>

          {/* Collection worklist */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-gray-800 font-bold text-lg">Collection Worklist</h3>
                <p className="text-gray-400 text-xs">
                  {filteredLoans.length} loan{filteredLoans.length === 1 ? "" : "s"}
                  {bucketFilter !== "all" ? ` in ${BUCKETS.find((b) => b.key === bucketFilter)?.label}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Source segmented toggle: Live (default) hides imported
                    legacy loans; useful during demos so the panel sees loans
                    the running system actually produced. */}
                <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5" role="group">
                  {[
                    { key: "live", label: "Live", title: "Loans created through the running system" },
                    { key: "legacy", label: "Legacy", title: "Imported CSV loans (historical portfolio)" },
                    { key: "all", label: "All", title: "Show both live and legacy loans" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSourceFilter(opt.key)}
                      title={opt.title}
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                        sourceFilter === opt.key
                          ? "bg-green-600 text-white"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <select
                  value={loanTypeFilter}
                  onChange={(e) => setLoanTypeFilter(e.target.value)}
                  className="rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                >
                  <option value="all">All loan types</option>
                  {loanTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                  className="rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                >
                  <option value="days_desc">Sort: Days past due (high→low)</option>
                  <option value="days_asc">Sort: Days past due (low→high)</option>
                  <option value="balance_desc">Sort: Balance (high→low)</option>
                  <option value="name_asc">Sort: Member (A→Z)</option>
                </select>
                {bucketFilter !== "all" && (
                  <button
                    onClick={() => setBucketFilter("all")}
                    className="text-xs text-green-700 font-semibold hover:underline"
                  >
                    Clear bucket filter
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-6 py-3 font-semibold">Member</th>
                    <th className="text-left px-6 py-3 font-semibold">Loan Type</th>
                    <th className="text-right px-6 py-3 font-semibold">Outstanding</th>
                    <th className="text-center px-6 py-3 font-semibold">Last Payment</th>
                    <th className="text-center px-6 py-3 font-semibold">
                      <div className="inline-flex items-center gap-1">
                        Days Past <ArrowUpDown size={12} />
                      </div>
                    </th>
                    <th className="text-center px-6 py-3 font-semibold">Bucket</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                        Loading delinquency data...
                      </td>
                    </tr>
                  ) : filteredLoans.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                        No loans match the current filters.
                      </td>
                    </tr>
                  ) : (
                    pagedLoans.map((loan) => {
                      const style = BUCKET_STYLES[loan._bucketColor];
                      return (
                        <tr key={loan.loan_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-800">{loan.member_name || "—"}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-gray-400">{loan.loan_id}</span>
                              {(loan.prior_versions || 0) > 0 ? (
                                <span
                                  title={`Restructured chain: this loan supersedes ${loan.prior_versions} prior version${loan.prior_versions > 1 ? "s" : ""}. Only this successor is delinquent — predecessor balances were rolled in.`}
                                  className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700"
                                >
                                  Restructured
                                </span>
                              ) : (
                                <span
                                  title="First loan of this type for this member."
                                  className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700"
                                >
                                  Original
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-semibold text-gray-700">
                              {loan.loan_type_code || loan.loan_type || "—"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-gray-800">
                            {formatPeso(loan.remaining_balance)}
                          </td>
                          <td className="px-6 py-4 text-center text-xs text-gray-600">
                            {formatDate(loan._lastPayment)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`font-bold ${loan._days > 90 ? "text-red-600" : loan._days > 60 ? "text-orange-600" : loan._days > 30 ? "text-amber-600" : "text-green-600"}`}>
                              {loan._days}
                            </span>
                            <span className="text-xs text-gray-400 ml-1">d</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${style.chip}`}>
                              {loan._bucketLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {filteredLoans.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-center p-6 gap-2 border-t border-gray-100">
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {(() => {
                  const groupStart = Math.floor((currentPage - 1) / 5) * 5 + 1;
                  const groupEnd = Math.min(groupStart + 4, totalPages);
                  return Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 flex items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
                        page === currentPage
                          ? "bg-[#16A34A] text-white border-[#16A34A]"
                          : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {page}
                    </button>
                  ));
                })()}

                <button
                  className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Delinquency;
