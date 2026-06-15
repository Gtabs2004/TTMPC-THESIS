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
  1: "bg-red-50 text-red-700 ring-red-200",
  2: "bg-orange-50 text-orange-700 ring-orange-200",
  3: "bg-amber-50 text-amber-700 ring-amber-200",
  4: "bg-yellow-50 text-yellow-800 ring-yellow-200",
  5: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  6: "bg-sky-50 text-sky-700 ring-sky-200",
  7: "bg-violet-50 text-violet-700 ring-violet-200",
};

const computeRank = (row) => {
  const rule = PRIORITY_RULES.find((r) => r.match(row));
  return rule ? rule.rank : 99;
};

const Disbursements = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [activeLoan, setActiveLoan] = useState(null);
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
      { label: "Total Loans Released", value: String(summary.total_released_count ?? rows.length), icon: ClipboardList, tone: "text-emerald-600", bg: "bg-emerald-50" },
      { label: "Total Amount Released", value: formatCurrency(summary.total_released_amount), icon: Wallet, tone: "text-green-600", bg: "bg-green-50" },
      { label: "Released Today", value: formatCurrency(summary.released_today_amount), icon: ArrowUpRight, tone: "text-blue-600", bg: "bg-blue-50" },
      { label: "Last Updated", value: isLoading ? "Refreshing…" : "Just now", icon: Clock, tone: "text-gray-600", bg: "bg-gray-50" },
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
      
      {/* --- ORIGINAL USER SIDEBAR --- */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Treasurer Portal" fallbackRole="Treasurer" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
             const routeMap = {
              "Dashboard": "/Treasurer_Dashboard",
              "Disbursement": "/disbursement",
              "Schedule": "/schedule",
              "Payments": "/treasurer-payments",
              "Loan-Approval": "/treasurer-approval",
              "Accounting": "/treasurer-accounting",
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

      {/* --- MAIN CONTENT --- */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto font-['Poppins']">
        
        {/* --- ORIGINAL USER TOPBAR --- */}
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

        {/* FULL WIDTH MAIN DASHBOARD WRAPPER */}
        <main className="p-8 overflow-auto w-full">
          
          {/* Page Header */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
                <span>Treasurer</span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
                <span className="text-[#389734]">Disbursement Audit</span>
              </div>
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Released Loans</h1>
              <p className="text-sm text-gray-500 mt-1 font-medium">Audit view of loans successfully disbursed by the Cashier.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold shadow-sm">
                <CalendarDays className="w-4 h-4 text-gray-400" />
                {new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" })}
              </div>
              <button
                onClick={fetchReleasedLoans}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#389734] text-white text-sm font-semibold hover:bg-[#2e7a2a] disabled:bg-gray-300 transition-colors shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh Data
              </button>
            </div>
          </div>

          {/* Banner Notices */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-800 flex items-start gap-3 mb-6 shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-blue-600 mt-0.5" />
            <p className="font-medium">{bannerNotice}</p>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm text-red-800 flex items-start gap-3 mb-6 shadow-sm">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
              <p className="font-medium">{errorMessage}</p>
            </div>
          )}

          {/* High-Level Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
            {stats.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col hover:-translate-y-1 hover:shadow-md transition-all duration-300`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className={`p-2.5 rounded-xl ${card.bg} ${card.tone}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-2">{card.label}</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <p className="text-2xl font-extrabold text-gray-900 tracking-tight">{card.value}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Priority Queue Legend */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-8 overflow-hidden transition-all duration-300">
            <button
              onClick={() => setShowPriorityLegend((v) => !v)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                  <ListOrdered className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-bold text-gray-900">Priority Logic Reference</h3>
                  <p className="text-xs text-gray-500 font-medium">Sorted by rank, then by date. Review queue hierarchy below.</p>
                </div>
              </div>
              <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${showPriorityLegend ? "rotate-90" : ""}`} />
            </button>
            {showPriorityLegend && (
              <div className="border-t border-gray-100 px-6 py-5 bg-gray-50/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                  {PRIORITY_RULES.map((rule) => (
                    <div key={rule.rank} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm flex flex-col justify-between">
                      <div>
                        <span className={`inline-flex items-center justify-center min-w-7 h-7 rounded-full text-xs font-bold ring-1 mb-2 ${rankTone[rule.rank]}`}>
                          #{rule.rank}
                        </span>
                        <p className="text-sm font-bold text-gray-900 leading-tight">{rule.label}</p>
                      </div>
                      <p className="text-xs text-gray-500 font-medium mt-2 pt-2 border-t border-gray-100">{rule.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Data Table Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-col overflow-hidden">
            {/* Table Toolbar */}
            <div className="flex flex-col gap-4 px-6 py-5 border-b border-gray-200 lg:flex-row lg:items-center lg:justify-between bg-white">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Disbursement Ledger</h2>
                <p className="text-sm text-gray-500 font-medium">{visibleRows.length} record{visibleRows.length === 1 ? "" : "s"} matched</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search member or ID"
                    className="bg-white w-64 h-9 rounded-lg border border-gray-300 pl-9 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#389734]/50 focus:border-[#389734] transition-all shadow-sm"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="bg-white h-9 rounded-lg border border-gray-300 px-3 py-0 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#389734]/50 focus:border-[#389734] transition-all shadow-sm cursor-pointer"
                >
                  <option>All Types</option>
                  <option>Emergency</option>
                  <option>Consolidated</option>
                  <option>Bonus</option>
                  <option>ABFF</option>
                </select>
                <button
                  onClick={() => setShowTimeline((v) => !v)}
                  className={`h-9 px-4 rounded-lg border text-sm font-semibold transition-colors shadow-sm ${
                    showTimeline 
                    ? "bg-gray-100 border-gray-300 text-gray-800" 
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {showTimeline ? "Hide" : "Show"} Audit Trail
                </button>
              </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500 bg-gray-50/30">
                  <div className="w-8 h-8 border-2 border-gray-200 border-t-[#389734] rounded-full animate-spin mb-4"></div>
                  <p className="text-sm font-semibold text-gray-600">Syncing ledger records...</p>
                </div>
              ) : visibleRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500 bg-gray-50/30">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4 border border-gray-200">
                    <ClipboardList className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-base font-bold text-gray-900 mb-1">
                    {rows.length === 0 ? "No Disbursed Loans" : "No Matches Found"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {rows.length === 0
                      ? "Records will appear here once the Cashier processes a release."
                      : "Try adjusting your search criteria or loan type filter."}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="px-6 py-4 font-bold w-20">Rank</th>
                      <th className="px-6 py-4 font-bold">Member Information</th>
                      <th className="px-6 py-4 font-bold">Loan Details</th>
                      <th className="px-6 py-4 font-bold text-right">Released Amount</th>
                      <th className="px-6 py-4 font-bold">Status</th>
                      <th className="px-6 py-4 font-bold">Audit Info</th>
                      <th className="px-6 py-4 font-bold text-right w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm text-gray-700 divide-y divide-gray-100">
                    {visibleRows.map((row) => (
                      <tr key={row.id} className="hover:bg-green-50/30 transition-colors group">
                        <td className="px-6 py-4 align-top pt-5">
                          <span className={`inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full text-xs font-bold ring-1 ${rankTone[row.rank] || "bg-gray-100 text-gray-700 ring-gray-200"}`}>
                            #{row.rank}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900 mb-0.5">{row.name}</div>
                          <div className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                            <Users className="w-3 h-3" /> {row.code}
                            <span className="text-gray-300">•</span>
                            <span className="font-mono text-gray-400">ID: {row.id}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200">
                            {row.type}
                          </span>
                          <div className="text-xs font-medium text-gray-500 mt-1.5 ml-1">{row.migs}</div>
                        </td>
                        <td className="px-6 py-4 text-right align-top pt-5">
                          <span className="font-extrabold text-gray-900 tabular-nums">
                            {formatCurrency(row.amount)}
                          </span>
                          <div className="text-xs font-medium text-gray-500 mt-1">{row.method}</div>
                        </td>
                        <td className="px-6 py-4 align-top pt-5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${
                            row.hasDocuments ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                          }`}>
                            {row.hasDocuments ? <FileCheck2 className="w-3.5 h-3.5" /> : <FileX2 className="w-3.5 h-3.5" />}
                            {row.hasDocuments ? `Docs (${row.documentCount})` : "No Docs"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-gray-500">
                          <div className="mb-1 text-gray-900">{formatDate(row.releasedDate)}</div>
                          <div>By: {row.releasedBy}</div>
                        </td>
                        <td className="px-6 py-4 align-top pt-4">
                          <div className="flex items-center justify-end gap-2 relative" ref={openMenuId === row.id ? menuRef : null}>
                            <button
                              onClick={() => setActiveLoan(row)}
                              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-sm"
                            >
                              View
                            </button>
                            <button
                              onClick={() => setOpenMenuId(openMenuId === row.id ? null : row.id)}
                              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 transition-colors shadow-sm"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                            
                            {/* Action Menu Dropdown */}
                            {openMenuId === row.id && (
                              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-20 py-1.5 text-sm overflow-hidden">
                                <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 mb-1">
                                  Actions
                                </div>
                                <button className="w-full flex items-center gap-2.5 px-4 py-2 text-gray-700 font-medium hover:bg-green-50 hover:text-green-700 transition-colors">
                                  <Printer className="w-4 h-4" /> Print Voucher
                                </button>
                                <button className="w-full flex items-center gap-2.5 px-4 py-2 text-gray-700 font-medium hover:bg-green-50 hover:text-green-700 transition-colors">
                                  <Receipt className="w-4 h-4" /> Issue Receipt
                                </button>
                                <button className="w-full flex items-center gap-2.5 px-4 py-2 text-gray-700 font-medium hover:bg-green-50 hover:text-green-700 transition-colors">
                                  <History className="w-4 h-4" /> Full Audit Trail
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Timeline Section */}
          {showTimeline && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8 mt-2 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-gray-400" /> System Audit Trail
                </h3>
                {activeLoan ? (
                  <span className="text-xs font-bold bg-gray-100 text-gray-700 px-3 py-1 rounded-full border border-gray-200">Target: Loan #{activeLoan.id}</span>
                ) : (
                  <span className="text-xs font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200">Standard Flow Reference</span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
                {/* Visual connection line for desktop */}
                <div className="hidden md:block absolute top-4 left-4 right-4 h-0.5 bg-gray-100 z-0"></div>
                
                {[
                  { label: "Loan Approved", detail: "Manager authorization", icon: Check, tone: "bg-gray-800 text-white" },
                  { label: "Bookkeeper Verifies", detail: "Compliance check", icon: Check, tone: "bg-gray-800 text-white" },
                  { label: "Cashier Releases", detail: "Funds disbursed", icon: Wallet, tone: "bg-gray-800 text-white" },
                  { label: "Treasury Logs", detail: "Ledger updated", icon: CheckCircle2, tone: "bg-[#389734] text-white ring-4 ring-green-50" },
                ].map((step, idx) => {
                  const StepIcon = step.icon;
                  return (
                    <div key={step.label} className="relative z-10 flex flex-col items-center text-center">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 shadow-sm ${step.tone}`}>
                        <StepIcon className="w-4 h-4" />
                      </div>
                      <p className="text-sm font-bold text-gray-900">{step.label}</p>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">{step.detail}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* --- INVOICE-STYLE MODAL --- */}
      {activeLoan && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 leading-tight">Disbursement Record</h3>
                  <p className="text-xs text-gray-500 font-medium font-mono">REF: #{activeLoan.id}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveLoan(null)}
                className="p-1.5 rounded-full hover:bg-gray-200 text-gray-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto">
              {/* Member Summary */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Payee / Member</p>
                  <p className="text-lg font-bold text-gray-900">{activeLoan.name}</p>
                  <p className="text-sm text-gray-500 font-medium">{activeLoan.code}</p>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ring-1 ${rankTone[activeLoan.rank] || "bg-gray-100 text-gray-700 ring-gray-200"}`}>
                    Priority #{activeLoan.rank}
                  </span>
                </div>
              </div>

              {/* Data Grid */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden mb-6">
                <dl className="divide-y divide-gray-200 text-sm">
                  <div className="grid grid-cols-3 gap-4 px-4 py-3">
                    <dt className="text-gray-500 font-medium">Loan Type</dt>
                    <dd className="col-span-2 font-bold text-gray-900">{activeLoan.type} <span className="text-gray-400 font-normal ml-1">({activeLoan.migs})</span></dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4 px-4 py-3">
                    <dt className="text-gray-500 font-medium">Method</dt>
                    <dd className="col-span-2 font-bold text-gray-900">{activeLoan.method}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4 px-4 py-3">
                    <dt className="text-gray-500 font-medium">Released Date</dt>
                    <dd className="col-span-2 font-bold text-gray-900">{formatDate(activeLoan.releasedDate)}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4 px-4 py-3">
                    <dt className="text-gray-500 font-medium">Cashier</dt>
                    <dd className="col-span-2 font-bold text-gray-900">{activeLoan.releasedBy}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4 px-4 py-3">
                    <dt className="text-gray-500 font-medium mt-0.5">Documents</dt>
                    <dd className="col-span-2">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold border ${activeLoan.hasDocuments ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                        {activeLoan.hasDocuments ? <FileCheck2 className="w-3 h-3" /> : <FileX2 className="w-3 h-3" />}
                        {activeLoan.hasDocuments ? `${activeLoan.documentCount} Files Uploaded` : "Missing Documentation"}
                      </span>
                    </dd>
                  </div>
                </dl>
                
                {/* Total Row */}
                <div className="bg-gray-100/80 border-t border-gray-200 px-4 py-4 flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-600 uppercase tracking-wider">Total Disbursed</span>
                  <span className="text-xl font-extrabold text-gray-900">{formatCurrency(activeLoan.amount)}</span>
                </div>
              </div>

              {/* Notice */}
              <div className="flex items-start gap-3 text-sm text-gray-600 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <span className="font-medium text-blue-800 text-xs leading-relaxed">This record is read-only. Modifications must be handled by the original issuer or a system administrator.</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setActiveLoan(null)}
                className="px-5 py-2.5 rounded-lg bg-white border border-gray-300 text-gray-700 text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Disbursements;