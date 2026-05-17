import React, { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Calculator,
  BarChart3,
  Search,
  Bell,
  Wallet,
  ClipboardList,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Receipt,
  Printer,
  History,
  Eye,
  CalendarDays,
  ChevronRight,
  AlertCircle,
  X,
  Check,
  MoreHorizontal,
  ListOrdered,
  RefreshCw,
  FileCheck2,
  FileX2,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const PRIORITY_RULES = [
  { rank: 1, label: "Emergency", note: "MIGS & Non-MIGS · 20k max", match: (r) => r.type === "Emergency" },
  { rank: 2, label: "Consolidated (MIGS)", note: "MIGS members", match: (r) => r.type === "Consolidated" && r.migs === "MIGS" },
  { rank: 3, label: "Consolidated (Non-MIGS)", note: "Non-MIGS members", match: (r) => r.type === "Consolidated" && r.migs === "Non-MIGS" },
  { rank: 4, label: "Bonus (MIGS)", note: "MIGS members", match: (r) => r.type === "Bonus" && r.migs === "MIGS" },
  { rank: 5, label: "ABFF Loan", note: "KOICA Members", match: (r) => r.type === "ABFF" },
  { rank: 6, label: "Bonus (Non-MIGS)", note: "Non-MIGS members", match: (r) => r.type === "Bonus" && r.migs === "Non-MIGS" },
  { rank: 7, label: "Bonus (Non-Members)", note: "Non-members", match: (r) => r.type === "Bonus" && r.migs === "Non-Member" },
];

const rankTone = {
  1: "bg-red-100 text-red-700 ring-red-200",
  2: "bg-orange-100 text-orange-700 ring-orange-200",
  3: "bg-amber-100 text-amber-700 ring-amber-200",
  4: "bg-yellow-100 text-yellow-800 ring-yellow-200",
  5: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  6: "bg-sky-100 text-sky-700 ring-sky-200",
  7: "bg-violet-100 text-violet-700 ring-violet-200",
};

const computeRank = (row) => {
  const rule = PRIORITY_RULES.find((r) => r.match(row));
  return rule ? rule.rank : 99;
};

const Disbursements = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();  const { addNotification } = useNotification();  const [activeLoan, setActiveLoan] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showPriorityLegend, setShowPriorityLegend] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total_released_count: 0, total_released_amount: 0, released_today_amount: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const menuRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const bannerNotice = "Read-only view. Only loans released by the Cashier are shown here for treasury monitoring and audit.";

  const fetchReleasedLoans = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/treasurer/disbursements/released-loans`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.detail || result?.message || "Failed to fetch released loans.");
      }
      const data = Array.isArray(result?.data) ? result.data : [];
      setRows(
        data.map((r) => ({
          id: r.loan_id,
          name: r.member_name,
          code: r.member_id || "—",
          type: r.loan_type,
          migs: r.migs,
          amount: Number(r.amount || 0),
          method: r.method || "Cash",
          approvedDate: r.approved_date,
          releasedDate: r.released_date,
          releasedBy: r.released_by || "Cashier",
          hasDocuments: Boolean(r.has_documents),
          documentCount: Number(r.document_count || 0),
          status: r.status || "Released",
        }))
      );
      if (result?.summary) setSummary(result.summary);
    } catch (err) {
      setErrorMessage(err.message || "Unable to load released loans.");
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReleasedLoans();
  }, [fetchReleasedLoans]);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Disbursement", icon: CreditCard },
    { name: "Schedule", icon: Calculator },
    { name: "Payments", icon: Users },
    { name: "Loan-Approval", icon: CreditCard },
    { name: "Accounting", icon: BarChart3 },
  ];

  const formatCurrency = (n) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(n || 0);

  const formatDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
  };

  const rankedRows = useMemo(() => {
    const enriched = rows.map((r) => ({ ...r, rank: computeRank(r) }));
    return enriched.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const aTime = a.approvedDate ? new Date(a.approvedDate).getTime() : 0;
      const bTime = b.approvedDate ? new Date(b.approvedDate).getTime() : 0;
      return aTime - bTime;
    });
  }, [rows]);

  const visibleRows = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return rankedRows.filter((r) => {
      const matchesSearch =
        !term ||
        String(r.name || "").toLowerCase().includes(term) ||
        String(r.code || "").toLowerCase().includes(term) ||
        String(r.id || "").toLowerCase().includes(term);
      const matchesType = typeFilter === "All" || r.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [rankedRows, searchTerm, typeFilter]);

  const stats = useMemo(() => {
    return [
      { label: "Total Loans Released", value: String(summary.total_released_count ?? rows.length), icon: ClipboardList, tone: "bg-emerald-50 text-emerald-600" },
      { label: "Total Amount Released", value: formatCurrency(summary.total_released_amount), icon: Wallet, tone: "bg-green-50 text-green-600" },
      { label: "Released Today", value: formatCurrency(summary.released_today_amount), icon: ArrowUpRight, tone: "bg-blue-50 text-blue-600" },
      { label: "Last Updated", value: isLoading ? "Refreshing…" : "Just now", icon: Clock, tone: "bg-gray-50 text-gray-600" },
    ];
  }, [rows.length, summary, isLoading]);

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
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity
              className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold"
              fallbackPortal="Treasurer Portal"
              fallbackRole="Treasurer"
            />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
            const routeMap = {
              Dashboard: "/Treasurer_Dashboard",
              Disbursement: "/disbursement",
              Schedule: "/schedule",
              Payments: "/treasurer-payments",
              "Loan-Approval": "/treasurer-approval",
              Accounting: "/treasurer-accounting",
            };

            return menuItems.map((item) => {
              const Icon = item.icon;
              const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, "-")}`;
              return (
                <NavLink
                  key={item.name}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-2 rounded-md transition-colors ${
                      isActive
                        ? "bg-green-50 text-[#389734] font-semibold"
                        : "text-gray-700 hover:bg-green-50 hover:text-[#389734]"
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
          className="mt-auto w-full rounded p-2 text-xs bg-[#389734] hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-end px-8 shrink-0">
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
            src="/img/treasurer-profile.png"
            alt="Treasurer Profile"
            className="ml-4 w-8 h-8 rounded-full bg-gray-200"
          />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Treasurer" />
        </header>

        <main className="p-8 overflow-auto">
          {/* Page header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Treasurer</span>
                <ChevronRight className="w-4 h-4" />
                <span className="text-gray-400">Disbursement</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">Treasurer Disbursement</h1>
              <p className="text-sm text-gray-500">Audit view of loans already released by the Cashier.</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50">
                <CalendarDays className="w-4 h-4" />
                {new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" })}
              </button>
              <button
                onClick={fetchReleasedLoans}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#389734] text-white text-sm font-semibold hover:bg-green-700 disabled:bg-gray-300"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Banner */}
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {bannerNotice}
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMessage}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
            {stats.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col">
                  <div className={`p-2 rounded-lg w-max mb-3 ${card.tone}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{card.label}</p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                    <span className="text-xs text-gray-400">Updated now</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Priority Queue Legend */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
            <button
              onClick={() => setShowPriorityLegend((v) => !v)}
              className="w-full flex items-center justify-between px-6 py-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <ListOrdered className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-bold text-gray-900">Priority Queue Logic</h3>
                  <p className="text-xs text-gray-500">Sorted by rank, then by application date. Each loan requires 2 Co-Makers.</p>
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${showPriorityLegend ? "rotate-90" : ""}`} />
            </button>
            {showPriorityLegend && (
              <div className="border-t border-gray-100 px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                {PRIORITY_RULES.map((rule) => (
                  <div key={rule.rank} className="rounded-lg border border-gray-100 p-3">
                    <span
                      className={`inline-flex items-center justify-center min-w-7 h-7 rounded-full text-xs font-bold ring-1 ${rankTone[rule.rank]}`}
                    >
                      #{rule.rank}
                    </span>
                    <p className="mt-2 text-sm font-semibold text-gray-900">{rule.label}</p>
                    <p className="text-xs text-gray-500">{rule.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Disbursement Queue */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
            <div className="flex flex-col gap-3 px-6 py-4 border-b border-gray-100 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Released Loans</h2>
                <p className="text-xs text-gray-500">{visibleRows.length} loan{visibleRows.length === 1 ? "" : "s"} matched · auto-sorted by priority</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search member"
                    className="bg-gray-50 w-56 h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="bg-gray-50 h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option>All</option>
                  <option>Emergency</option>
                  <option>Consolidated</option>
                  <option>Bonus</option>
                  <option>ABFF</option>
                </select>
                <button
                  onClick={() => setShowTimeline((v) => !v)}
                  className="h-9 px-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  {showTimeline ? "Hide" : "Show"} Timeline
                </button>
              </div>
            </div>

            {isLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-green-500 rounded-full animate-spin mb-3"></div>
                <p className="text-sm font-medium">Loading disbursement queue...</p>
              </div>
            )}

            {!isLoading && visibleRows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <ClipboardList className="w-10 h-10 text-gray-300 mb-3" />
                <p className="text-sm font-medium">
                  {rows.length === 0 ? "No loans have been released yet." : "No loans match the current filters."}
                </p>
                <p className="text-xs text-gray-400">
                  {rows.length === 0
                    ? "Loans appear here once the Cashier disburses them."
                    : "Try adjusting the search or loan type."}
                </p>
              </div>
            )}

            {!isLoading && visibleRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-[#66B538] text-xs font-semibold text-white uppercase tracking-wide">
                      <th className="px-6 py-3 w-16">Rank</th>
                      <th className="px-6 py-3">Member</th>
                      <th className="px-6 py-3">Loan Type</th>
                      <th className="px-6 py-3 text-right">Released Amount</th>
                      <th className="px-6 py-3">Release Method</th>
                      <th className="px-6 py-3">Released Date</th>
                      <th className="px-6 py-3">Released By</th>
                      <th className="px-6 py-3">Documents</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm text-gray-700 divide-y divide-gray-100">
                    {visibleRows.map((row) => (
                      <tr key={row.id} className="table-row-enter hover:bg-green-50 transition-colors">
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full text-xs font-bold ring-1 ${rankTone[row.rank] || "bg-gray-100 text-gray-700 ring-gray-200"}`}
                          >
                            #{row.rank}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900">{row.name}</div>
                          <div className="text-xs text-gray-400">
                            {row.code} · {row.id}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="badge-animated px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                            {row.type}
                          </span>
                          <span className="ml-1.5 text-xs text-gray-500">{row.migs}</span>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-gray-900 whitespace-nowrap">
                          {formatCurrency(row.amount)}
                        </td>
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{row.method}</td>
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{formatDate(row.releasedDate)}</td>
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{row.releasedBy}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`badge-animated inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                              row.hasDocuments ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                            }`}
                            title={row.hasDocuments ? `${row.documentCount} file(s) uploaded` : "No files uploaded"}
                          >
                            {row.hasDocuments ? <FileCheck2 className="w-3 h-3" /> : <FileX2 className="w-3 h-3" />}
                            {row.hasDocuments ? `Complete (${row.documentCount})` : "Incomplete"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setActiveLoan(row)}
                              className="btn-enhanced px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-green-50 hover:text-green-700 flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </button>
                            <div className="relative" ref={openMenuId === row.id ? menuRef : null}>
                              <button
                                onClick={() => setOpenMenuId(openMenuId === row.id ? null : row.id)}
                                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                              {openMenuId === row.id && (
                                <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 text-sm">
                                  <button className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-green-50">
                                    <Printer className="w-4 h-4" /> Print Voucher
                                  </button>
                                  <button className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-green-50">
                                    <Receipt className="w-4 h-4" /> Generate Receipt
                                  </button>
                                  <button className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-green-50">
                                    <History className="w-4 h-4" /> History
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Timeline (collapsible below the table to keep queue full width) */}
          {showTimeline && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Disbursement Timeline</h3>
                <span className="text-xs text-gray-400">Loan #{activeLoan?.id || "—"}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { label: "Loan Approved", detail: "Manager approval completed", icon: Check, tone: "bg-green-500" },
                  { label: "Verified by Bookkeeper", detail: "Compliance checks complete", icon: Check, tone: "bg-green-500" },
                  { label: "Released by Cashier", detail: "Funds disbursed to member", icon: Wallet, tone: "bg-green-500" },
                  { label: "Posted to Treasury Ledger", detail: "Recorded for audit", icon: CheckCircle2, tone: "bg-green-500" },
                ].map((step) => {
                  const StepIcon = step.icon;
                  return (
                    <div key={step.label} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 ${step.tone}`}>
                        <StepIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{step.label}</p>
                        <p className="text-xs text-gray-500">{step.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-4">
                <p className="text-xs text-gray-500 font-semibold uppercase">System Sync</p>
                <p className="text-sm text-gray-700 mt-1">
                  Released transactions update member records, payment schedules, and the system-wide disbursement ledger.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {activeLoan && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Released Loan Details</h3>
              <button
                onClick={() => setActiveLoan(null)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="rounded-lg border border-gray-200 p-4 mb-4">
                <p className="text-sm font-semibold text-gray-900">{activeLoan.name}</p>
                <p className="text-xs text-gray-500">
                  {activeLoan.id} · {activeLoan.type} ({activeLoan.migs}) · Rank #{activeLoan.rank}
                </p>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Released Amount</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(activeLoan.amount)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Release Method</span>
                  <span className="font-semibold text-gray-900">{activeLoan.method}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Released Date</span>
                  <span className="font-semibold text-gray-900">{formatDate(activeLoan.releasedDate)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Released By</span>
                  <span className="font-semibold text-gray-900">{activeLoan.releasedBy}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Documents</span>
                  <span className={`font-semibold ${activeLoan.hasDocuments ? "text-green-600" : "text-red-600"}`}>
                    {activeLoan.hasDocuments
                      ? `Complete · ${activeLoan.documentCount} file${activeLoan.documentCount === 1 ? "" : "s"} uploaded`
                      : "Incomplete · no files uploaded"}
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <span>This loan has already been released by the Cashier. Treasurer has read-only access for audit.</span>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setActiveLoan(null)}
                className="px-4 py-2 rounded-lg bg-[#389734] text-white text-sm font-semibold hover:bg-green-700"
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

export default Disbursements;
