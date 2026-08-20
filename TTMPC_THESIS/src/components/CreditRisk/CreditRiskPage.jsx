import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../PortalIdentity";
import LoanNotificationBell from "../LoanNotificationBell";
import {
  LayoutDashboard,
  Users,
  FileText,
  ClipboardCheck,
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
  Brain,
  RefreshCw,
  ArrowUpDown,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const ITEMS_PER_PAGE = 8;

const PESO = "₱";

const formatPeso = (value) =>
  `${PESO}${Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
    : "—";

const formatPct = (p) => (p == null ? "—" : `${(Number(p) * 100).toFixed(1)}%`);

// Bucket a probability into a risk band. Threshold points are conservative
// and match how the panel would reason: <30 healthy, 30-60 review, 60+ deny.
const riskBand = (p) => {
  if (p == null) return { key: "unknown", label: "Unavailable", chip: "bg-gray-100 text-gray-700", bar: "bg-gray-300" };
  if (p >= 0.6) return { key: "high", label: "High Risk", chip: "bg-red-100 text-red-700", bar: "bg-red-500" };
  if (p >= 0.3) return { key: "watch", label: "Watch", chip: "bg-amber-100 text-amber-700", bar: "bg-amber-500" };
  return { key: "low", label: "Low Risk", chip: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" };
};

// Human-readable labels for the model's feature names. Keeps the UI clean
// without hardcoding the feature list — new features just show their raw
// name if we forget to add a label.
const FEATURE_LABELS = {
  LoanAmount: "Loan Amount",
  Stability_Score: "Occupation Stability",
  Advance_Payment_Count: "Advance Payments",
  Income_Is_Missing: "Income Missing",
  Repayment_Stress_Index: "Repayment Stress",
};

const featureLabel = (feat) => FEATURE_LABELS[feat] || feat;

const BOOKKEEPER_MENU = [
  { name: "Dashboard", icon: LayoutDashboard, route: "/dashboard" },
  { name: "Manage Member", icon: Users, route: "/manage-member" },
  { name: "Loan Approval", icon: FileText, route: "/bookkeeper-loan-approval" },
  { name: "Manage Loans", icon: Briefcase, route: "/manage-loans" },
 
  { name: "Credit Risk", icon: Brain, route: "/bookkeeper-credit-risk" },
  { name: "Payments", icon: Wallet, route: "/payments" },
  { name: "Savings Withdrawals", icon: CreditCard, route: "/bookkeeper-savings-transactions" },
  { name: "Accounting", icon: Calculator, route: "/accounting" },
  { name: "MIGS Scoring", icon: Activity, route: "/migs" },
  { name: "Reports", icon: BarChart3, route: "/reports" },
  { name: "Audit Trail", icon: History, route: "/audit-trail" },
  { name: "Grocery", icon: Coins, route: "/grocery" },
  
];

const MANAGER_MENU = [
  { name: "Dashboard", icon: LayoutDashboard, route: "/manager-dashboard" },
  { name: "Loan Approval", icon: ClipboardCheck, route: "/loan-approval" },
  { name: "Credit Risk", icon: Brain, route: "/manager-credit-risk" },
  { name: "Manage Member", icon: Users, route: "/manager-manage-member" },
  { name: "Reports", icon: BarChart3, route: "/manager-reports" },
  { name: "Audit Log", icon: History, route: "/manager-audit-log" },
];

const CreditRiskPage = ({ portal = "bookkeeper" }) => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();

  const menuItems = portal === "manager" ? MANAGER_MENU : BOOKKEEPER_MENU;
  const fallbackPortal = portal === "manager" ? "Manager Portal" : "Bookkeeper Portal";
  const fallbackRole = portal === "manager" ? "Manager" : "Bookkeeper";
  const profileImg =
    portal === "manager" ? "/img/manager-profile.png" : "/img/bookkeeper-profile.png";

  const [rows, setRows] = useState([]);
  const [modelVersion, setModelVersion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [bandFilter, setBandFilter] = useState("all");
  const [loanTypeFilter, setLoanTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState("risk_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLoan, setSelectedLoan] = useState(null);

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("sign out failed", err);
    }
  };

  const fetchQueue = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/credit-risk/queue`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.detail || "Failed to load credit risk queue.");
      }
      const data = json?.data || {};
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setModelVersion(data.model_version || null);
      setLoadError("");
    } catch (err) {
      console.error("credit risk load failed", err);
      setLoadError(err?.message || "Unable to load credit risk data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, bandFilter, loanTypeFilter, sortKey]);

  const loanTypes = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => r.loan_type && set.add(r.loan_type));
    return Array.from(set).sort();
  }, [rows]);

  const summary = useMemo(() => {
    const base = { high: 0, watch: 0, low: 0, unknown: 0 };
    rows.forEach((r) => {
      const band = riskBand(r.probability);
      base[band.key] = (base[band.key] || 0) + 1;
    });
    return { ...base, total: rows.length };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      const band = riskBand(r.probability);
      if (bandFilter !== "all" && band.key !== bandFilter) return false;
      if (loanTypeFilter !== "all" && r.loan_type !== loanTypeFilter) return false;
      if (!q) return true;
      return (
        String(r.member_name || "").toLowerCase().includes(q) ||
        String(r.loan_id || "").toLowerCase().includes(q)
      );
    });

    switch (sortKey) {
      case "risk_desc":
        list = list.sort((a, b) => (b.probability ?? -1) - (a.probability ?? -1));
        break;
      case "risk_asc":
        list = list.sort((a, b) => (a.probability ?? 2) - (b.probability ?? 2));
        break;
      case "amount_desc":
        list = list.sort((a, b) => Number(b.loan_amount || 0) - Number(a.loan_amount || 0));
        break;
      case "name_asc":
        list = list.sort((a, b) => String(a.member_name || "").localeCompare(String(b.member_name || "")));
        break;
      default:
        break;
    }
    return list;
  }, [rows, search, bandFilter, loanTypeFilter, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRows.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRows, currentPage]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchQueue();
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-primary">TTMPC</h1>
            <PortalSidebarIdentity
              className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold"
              fallbackPortal={fallbackPortal}
              fallbackRole={fallbackRole}
            />
          </div>
        </div>
        <hr className="w-full border-gray-200 mb-6" />
        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.route}
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <LoanNotificationBell role={portal} />
          <img src={profileImg} alt="Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole={fallbackRole} />
        </header>

        <main className="p-8">
          <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Brain className="text-indigo-500" size={26} />
                Credit Risk Assessment
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Model-scored loan applications currently under review. Higher probability = higher predicted default risk.
              </p>
              <p className="text-xs text-gray-500 mt-2 inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-md px-2 py-1">
                <Brain size={12} className="text-indigo-600" />
                <span>
                  Model version:{" "}
                  <span className="font-semibold text-indigo-800">{modelVersion || "not identified"}</span>
                  {" — swap the PKL in "}
                  <code className="text-[11px] bg-white px-1 rounded">risk_model.py</code>
                  {" to upgrade."}
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

          {/* Summary bands */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { key: "high", label: "High Risk", subtitle: "≥ 60%", accent: "text-red-600", bg: "bg-red-50", ring: "border-red-200" },
              { key: "watch", label: "Watch", subtitle: "30% - 60%", accent: "text-amber-600", bg: "bg-amber-50", ring: "border-amber-200" },
              { key: "low", label: "Low Risk", subtitle: "< 30%", accent: "text-emerald-600", bg: "bg-emerald-50", ring: "border-emerald-200" },
              { key: "unknown", label: "Unscored", subtitle: "Model unavailable", accent: "text-gray-600", bg: "bg-gray-50", ring: "border-gray-200" },
            ].map((b) => (
              <button
                key={b.key}
                onClick={() => setBandFilter(bandFilter === b.key ? "all" : b.key)}
                className={`text-left bg-white rounded-xl p-5 shadow-sm border ${
                  bandFilter === b.key ? `${b.ring} ring-2 ring-offset-1` : "border-gray-100"
                } hover:shadow-md transition`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-gray-500 text-sm font-medium">{b.label}</span>
                    <p className={`text-xs mt-0.5 font-semibold ${b.accent}`}>{b.subtitle}</p>
                  </div>
                  <div className={`p-2 ${b.bg} ${b.accent} rounded-lg`}>
                    <AlertCircle size={18} />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-bold text-gray-800">{loading ? "..." : summary[b.key] || 0}</h3>
                  <div className="mt-2 text-xs text-gray-500">
                    {summary.total > 0
                      ? `${((100 * (summary[b.key] || 0)) / summary.total).toFixed(1)}% of queue`
                      : "no queue"}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-gray-800 font-bold text-lg">Applicant Queue</h3>
                <p className="text-gray-400 text-xs">
                  {filteredRows.length} applicant{filteredRows.length === 1 ? "" : "s"}
                  {bandFilter !== "all" ? ` · filtered by ${bandFilter}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
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
                  <option value="risk_desc">Sort: Risk (high→low)</option>
                  <option value="risk_asc">Sort: Risk (low→high)</option>
                  <option value="amount_desc">Sort: Loan amount (high→low)</option>
                  <option value="name_asc">Sort: Member (A→Z)</option>
                </select>
                {bandFilter !== "all" && (
                  <button
                    onClick={() => setBandFilter("all")}
                    className="text-xs text-green-700 font-semibold hover:underline"
                  >
                    Clear band filter
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-6 py-3 font-semibold">Applicant</th>
                    <th className="text-left px-6 py-3 font-semibold">Loan Type</th>
                    <th className="text-right px-6 py-3 font-semibold">Amount</th>
                    <th className="text-center px-6 py-3 font-semibold">Applied</th>
                    <th className="text-left px-6 py-3 font-semibold">
                      <div className="inline-flex items-center gap-1">
                        Risk Score <ArrowUpDown size={12} />
                      </div>
                    </th>
                    <th className="text-left px-6 py-3 font-semibold">Top Drivers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                        Loading model scores...
                      </td>
                    </tr>
                  ) : pagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                        No applicants match the current filters.
                      </td>
                    </tr>
                  ) : (
                    pagedRows.map((row) => {
                      const band = riskBand(row.probability);
                      const topDrivers = (row.drivers || []).slice(0, 3);
                      return (
                        <tr
                          key={row.loan_id}
                          onClick={() => setSelectedLoan(row)}
                          className="hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-800">{row.member_name || "—"}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{row.loan_id}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-semibold text-gray-700">{row.loan_type || "—"}</span>
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-gray-800">
                            {formatPeso(row.loan_amount)}
                          </td>
                          <td className="px-6 py-4 text-center text-xs text-gray-600">
                            {formatDate(row.application_date)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-[80px] h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${band.bar}`}
                                  style={{ width: `${row.probability != null ? Math.min(100, row.probability * 100) : 0}%` }}
                                />
                              </div>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${band.chip}`}>
                                {formatPct(row.probability)}
                              </span>
                            </div>
                            <p className={`text-[11px] font-semibold mt-1 ${band.chip.includes("red") ? "text-red-600" : band.chip.includes("amber") ? "text-amber-600" : band.chip.includes("emerald") ? "text-emerald-600" : "text-gray-500"}`}>
                              {band.label}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            {topDrivers.length === 0 ? (
                              <span className="text-xs text-gray-400 italic">no attribution</span>
                            ) : (
                              <ul className="flex flex-col gap-1">
                                {topDrivers.map((d) => {
                                  const arrow = d.direction === "up" ? TrendingUp : d.direction === "down" ? TrendingDown : null;
                                  const color = d.direction === "up" ? "text-red-600" : d.direction === "down" ? "text-emerald-600" : "text-gray-500";
                                  return (
                                    <li key={d.feature} className="flex items-center gap-1.5 text-xs">
                                      {arrow ? React.createElement(arrow, { size: 12, className: color }) : <span className="w-3" />}
                                      <span className="font-medium text-gray-700">{featureLabel(d.feature)}</span>
                                      <span className="text-gray-400">·</span>
                                      <span className="text-gray-500">{Number(d.value).toLocaleString("en-PH", { maximumFractionDigits: 1 })}</span>
                                      <span className="text-gray-300">(median {Number(d.cohort_median).toLocaleString("en-PH", { maximumFractionDigits: 1 })})</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {filteredRows.length > ITEMS_PER_PAGE && (
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

      {/* Drawer: full driver breakdown */}
      {selectedLoan && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedLoan(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white w-full max-w-md h-full shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Credit Risk Detail</p>
                <h3 className="text-xl font-bold text-gray-800 mt-1">{selectedLoan.member_name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedLoan.loan_id} · {selectedLoan.loan_type} · {formatPeso(selectedLoan.loan_amount)}
                </p>
              </div>
              <button
                onClick={() => setSelectedLoan(null)}
                className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 border-b border-gray-100">
              {(() => {
                const band = riskBand(selectedLoan.probability);
                return (
                  <>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Predicted Default Probability</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-4xl font-bold text-gray-800">{formatPct(selectedLoan.probability)}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${band.chip}`}>
                        {band.label}
                      </span>
                    </div>
                    <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${band.bar}`}
                        style={{ width: `${selectedLoan.probability != null ? Math.min(100, selectedLoan.probability * 100) : 0}%` }}
                      />
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="p-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Feature Contributions</p>
              {(selectedLoan.drivers || []).length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  {selectedLoan.error || "No attribution available for this applicant."}
                </p>
              ) : (
                <ul className="space-y-4">
                  {(selectedLoan.drivers || []).map((d) => {
                    const bump = d.value - d.cohort_median;
                    const bumpPct = d.cohort_median !== 0 ? (bump / Math.abs(d.cohort_median)) * 100 : 0;
                    const arrow = d.direction === "up" ? TrendingUp : d.direction === "down" ? TrendingDown : null;
                    const color = d.direction === "up" ? "text-red-600" : d.direction === "down" ? "text-emerald-600" : "text-gray-500";
                    return (
                      <li key={d.feature} className="flex flex-col gap-1">
                        <div className="flex justify-between items-baseline">
                          <div className="flex items-center gap-1.5">
                            {arrow ? React.createElement(arrow, { size: 14, className: color }) : null}
                            <span className="font-semibold text-gray-800 text-sm">{featureLabel(d.feature)}</span>
                          </div>
                          <span className={`text-xs font-bold ${color}`}>
                            {d.contribution > 0 ? "+" : ""}
                            {d.contribution.toFixed(3)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>Applicant: <span className="font-semibold text-gray-700">{Number(d.value).toLocaleString("en-PH", { maximumFractionDigits: 2 })}</span></span>
                          <span>·</span>
                          <span>Cohort median: <span className="font-semibold text-gray-700">{Number(d.cohort_median).toLocaleString("en-PH", { maximumFractionDigits: 2 })}</span></span>
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {bump === 0
                            ? "matches cohort"
                            : `${bump > 0 ? "above" : "below"} cohort by ${Math.abs(bumpPct).toFixed(0)}%`}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50">
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Signed contributions show each feature's push on the model's log-odds output.{" "}
                <span className="text-red-600 font-semibold">Positive</span> = pushes score UP (higher risk).{" "}
                <span className="text-emerald-700 font-semibold">Negative</span> = pushes score DOWN (lower risk). Attribution
                method depends on the underlying model — the UI stays constant even when the PKL is swapped.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditRiskPage;
