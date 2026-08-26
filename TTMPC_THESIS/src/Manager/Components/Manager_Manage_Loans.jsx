import React, { useEffect, useMemo, useState } from "react";
import { getLoanTypeChipClass as getLoanTypeStyle } from "../../utils/loanTypeColors";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { managerNav } from "../../components/StaffSidebar/configs/manager";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import {
  LayoutDashboard,
  Users,
  FileText,
  Briefcase,
  Search,
  Bell,
  Wallet,
  Coins,
  Eye,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldAlert,
  Brain,
  BarChart3,
  History,
} from "lucide-react";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const ITEMS_PER_PAGE = 5;

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";



const Manager_Manage_Loans = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();

  const [loans, setLoans] = useState([]);
  const [activeTab, setActiveTab] = useState("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [loanTypeFilter, setLoanTypeFilter] = useState("all");
  const [memberTypeFilter, setMemberTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingRequestIds, setPendingRequestIds] = useState(new Set());

  const dashboardStats = useMemo(() => {
    const totalActiveLoans = loans.filter((l) => l.remaining_balance > 0).length;
    const totalOutstanding = loans.reduce(
      (sum, l) => sum + Number(l.remaining_balance || 0),
      0
    );
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const collectedThisMonth = loans
      .flatMap((l) => l.payment_history || [])
      .filter((p) => String(p.date_paid || "").slice(0, 7) === currentMonthKey)
      .reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
    return { totalActiveLoans, totalOutstanding, collectedThisMonth };
  }, [loans]);

  const tabs = useMemo(() => {
    const active = loans.filter((l) => l.remaining_balance > 0).length;
    const fullyPaid = loans.filter((l) => l.remaining_balance <= 0).length;
    const restructured = loans.filter((l) => pendingRequestIds.has(l.loan_id)).length;
    return [
      { key: "active", label: "Active Loans", count: active },
      { key: "fully_paid", label: "Fully Paid", count: fullyPaid },
      { key: "restructured", label: "Restructure Request", count: restructured },
    ];
  }, [loans, pendingRequestIds]);

  const filteredLoans = useMemo(() => {
    const text = searchTerm.trim().toLowerCase();
    return loans.filter((item) => {
      let tabMatch;
      if (activeTab === "active") tabMatch = item.remaining_balance > 0;
      else if (activeTab === "fully_paid") tabMatch = item.remaining_balance <= 0;
      else if (activeTab === "restructured") tabMatch = pendingRequestIds.has(item.loan_id);
      else tabMatch = true;
      if (!tabMatch) return false;
      if (loanTypeFilter !== "all" && item.loan_type_code !== loanTypeFilter)
        return false;
      if (memberTypeFilter !== "all" && item.member_type !== memberTypeFilter)
        return false;
      if (!text) return true;
      return (
        item.member_name.toLowerCase().includes(text) ||
        item.loan_id.toLowerCase().includes(text) ||
        item.status.toLowerCase().includes(text)
      );
    });
  }, [loans, searchTerm, activeTab, loanTypeFilter, memberTypeFilter]);

  const groupedLoans = useMemo(() => {
    const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

    const lastPaymentDate = (loan) => {
      const history = loan.payment_history || [];
      if (!history.length) return null;
      const dates = history.map((p) => new Date(p.date_paid || 0).getTime()).filter(Boolean);
      return dates.length ? Math.max(...dates) : null;
    };

    const buckets = new Map();
    for (const loan of filteredLoans) {
      const key = `${loan.member_name || ""}::${loan.loan_type_code || loan.loan_type || ""}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(loan);
    }

    const loanSeq = (id) => {
      const m = String(id || "").match(/(\d+)\s*$/);
      return m ? parseInt(m[1], 10) : 0;
    };

    const results = [];

    for (const items of buckets.values()) {
      const sorted = [...items].sort((a, b) => {
        const da = new Date(a.application_date || 0).getTime();
        const db = new Date(b.application_date || 0).getTime();
        if (da !== db) return da - db;
        return loanSeq(a.loan_id) - loanSeq(b.loan_id);
      });

      const chains = [];

      for (const loan of sorted) {
        const appType = String(loan.application_type || "").toLowerCase();
        const isLegacy = !!loan.is_legacy;
        const appDate = new Date(loan.application_date || 0).getTime();

        let attachedToChain = false;

        if (chains.length > 0) {
          const prevChain = chains[chains.length - 1];
          const prevLoan = prevChain[prevChain.length - 1];
          const prevAppDate = new Date(prevLoan.application_date || 0).getTime();

          if (!isLegacy && appType === "renewal") {
            prevChain.push(loan);
            attachedToChain = true;
          } else if (isLegacy) {
            const prevLastPay = lastPaymentDate(prevLoan);
            const isAfterPrev = appDate !== prevAppDate
              ? appDate > prevAppDate
              : loanSeq(loan.loan_id) > loanSeq(prevLoan.loan_id);
            const withinSixMonths = prevLastPay
              ? appDate - prevLastPay <= SIX_MONTHS_MS && appDate >= prevLastPay
              : isAfterPrev;
            if (withinSixMonths) {
              prevChain.push(loan);
              attachedToChain = true;
            }
          }
        }

        if (!attachedToChain) {
          chains.push([loan]);
        }
      }

      for (const chain of chains) {
        const reversed = [...chain].reverse();
        const [parent, ...renewals] = reversed;
        results.push({ parent, renewals });
      }
    }

    results.sort((a, b) => {
      const da = new Date(a.parent.application_date || 0).getTime();
      const db = new Date(b.parent.application_date || 0).getTime();
      return db - da;
    });
    return results;
  }, [filteredLoans]);

  const totalPages = Math.max(1, Math.ceil(groupedLoans.length / ITEMS_PER_PAGE));
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return groupedLoans.slice(start, start + ITEMS_PER_PAGE);
  }, [groupedLoans, currentPage]);

  async function fetchLoans() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/manage-loans`);
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || "Failed to fetch loan data.");
      }
      const rows = Array.isArray(result?.data?.rows) ? result.data.rows : [];
      setLoans(rows);
    } catch (error) {
      addNotification(error?.message || "Unable to load loans.", "error");
      setLoadError(error?.message || "Unable to load loans.");
      setLoans([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLoans();
    // Fetch all pending restructure requests so we can badge affected loans
    fetch(`${API_BASE_URL}/api/manager/restructure-requests?status=pending`)
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          setPendingRequestIds(new Set(res.data.map((r) => r.loan_id)));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, loanTypeFilter, memberTypeFilter, loans.length]);


  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <StaffSidebar portal="Manager" items={managerNav} />

      {/* Main */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shadow-sm flex items-center justify-between px-8 border-b border-gray-100 shrink-0">
          <div className="flex-1 max-w-2xl">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                className="bg-gray-50 w-full h-10 rounded-lg border border-gray-300 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent shadow-sm hover:border-gray-400 transition-all"
                placeholder="Search member, loan ID, status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-4 ml-6">
            <LoanNotificationBell />
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <PortalTopbarIdentity
                className="text-sm font-semibold text-gray-700 hidden sm:block"
                fallbackRole="Manager"
              />
            </div>
          </div>
        </header>

        <main className="p-8">
          {/* Breadcrumb + title */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
                <span>Manager</span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
                <span className="text-[#389734]">Manage Loans</span>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchLoans}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 active:bg-green-800 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {/* KPI cards */}
          <StatCardRow cols={3}>
            <StatCard label="Total Active Loans" value={dashboardStats.totalActiveLoans} icon={CreditCard} iconColor="text-blue-600" />
            <StatCard label="Outstanding Balance" value={formatCurrency(dashboardStats.totalOutstanding)} icon={Wallet} iconColor="text-amber-600" />
            <StatCard label="Collected This Month" value={formatCurrency(dashboardStats.collectedThisMonth)} icon={Coins} iconColor="text-green-600" />
          </StatCardRow>

          {/* Filters + tabs */}
          <div className="rounded-xl bg-white border border-gray-200 shadow-sm mb-6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Tabs */}
              <div className="flex items-center gap-2">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.key;
                  const isRestructured = tab.key === "restructured";
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        isActive
                          ? isRestructured
                            ? "bg-amber-500 text-white"
                            : "bg-green-600 text-white"
                          : isRestructured && tab.count > 0
                          ? "bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {isRestructured && <RefreshCw size={11} />}
                      <span>{tab.label}</span>
                      <span
                        className={`inline-flex items-center justify-center min-w-5 h-5 rounded-full text-xs font-bold ${
                          isActive
                            ? "bg-white/30 text-white"
                            : isRestructured && tab.count > 0
                            ? "bg-amber-200 text-amber-800"
                            : "bg-gray-300 text-gray-700"
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={loanTypeFilter}
                    onChange={(e) => setLoanTypeFilter(e.target.value)}
                    className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="all">All Loan Types</option>
                    <option value="CONSOLIDATED">Consolidated</option>
                    <option value="EMERGENCY">Emergency</option>
                    <option value="BONUS">Bonus</option>
                    <option value="KOICA">KOICA</option>
                    <option value="ABF">ABF</option>
                  </select>

                  <select
                    value={memberTypeFilter}
                    onChange={(e) => setMemberTypeFilter(e.target.value)}
                    className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="all">All Member Types</option>
                    <option value="Member">Member</option>
                    <option value="Non-Member">Non-Member</option>
                    <option value="KOICA">KOICA</option>
                  </select>
                </div>

                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-white w-full h-10 rounded-lg border border-gray-300 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Search by loan ID, member name..."
                  />
                </div>
              </div>
            </div>

            {loading && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                Loading loan data...
              </div>
            )}

            {!loading && loadError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start justify-between gap-3">
                <span>{loadError}</span>
                <button
                  type="button"
                  onClick={fetchLoans}
                  className="shrink-0 font-semibold underline decoration-red-400 underline-offset-2 hover:text-red-900"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-lg">
            <table className="w-full text-left border-collapse table-fixed">
              <colgroup>
                <col style={{ width: "16%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "8%" }} />
              </colgroup>
              <thead>
                <tr className="bg-green-700 text-xs uppercase tracking-wider text-white font-extrabold">
                  <th className="px-3 py-4 font-bold">Loan ID</th>
                  <th className="px-3 py-4 font-bold">Member Name</th>
                  <th className="px-3 py-4 font-bold">Loan Type</th>
                  <th className="px-3 py-4 font-bold text-right">Loan Amt</th>
                  <th className="px-3 py-4 font-bold text-right">Amortization</th>
                  <th className="px-3 py-4 font-bold text-right">Remaining</th>
                  <th className="px-3 py-4 font-bold">Due Date</th>
                  <th className="px-3 py-4 font-bold text-center">Details</th>
                </tr>
              </thead>
              <tbody>
                {groupedLoans.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-5 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                          <Eye size={24} className="text-gray-300" />
                        </div>
                        <p className="text-gray-500 font-medium">No loans found</p>
                        <p className="text-gray-400 text-sm">Try adjusting your filters</p>
                      </div>
                    </td>
                  </tr>
                )}

                {paginatedGroups.map(({ parent, renewals }) => {
                  return (
                    <React.Fragment key={parent.loan_id}>
                      <tr className="border-b border-gray-100 transition-colors hover:bg-green-50/40">
                        <td className="px-3 py-4 text-sm font-mono font-bold text-green-700 align-middle">
                          <div className="flex flex-col items-start gap-1">
                            <span className="truncate">{parent.loan_id}</span>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-800 font-semibold align-top">
                          {parent.member_name}
                        </td>
                        <td className="px-3 py-4 align-top">
                          <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold ${getLoanTypeStyle(parent.loan_type_code)}`}>
                            {parent.loan_type}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-800 font-semibold text-right whitespace-nowrap align-top">
                          {formatCurrency(parent.loan_amount)}
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-700 text-left font-medium whitespace-nowrap align-top">
                          {formatCurrency(parent.amortization)}
                        </td>
                        <td className="px-3 py-4 text-sm text-left font-bold whitespace-nowrap align-top">
                          <span className={parent.remaining_balance > 0 ? "text-amber-600" : "text-green-600"}>
                            {formatCurrency(parent.remaining_balance)}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-sm font-medium whitespace-nowrap align-top">
                          {parent.due_date
                            ? <span className="text-gray-700">{formatDate(parent.due_date)}</span>
                            : <span className="text-xs text-gray-400 italic capitalize">{parent.source_loan_status || "No schedule"}</span>
                          }
                        </td>
                        <td className="px-3 py-4 text-center align-top">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/manager-loan-ledger/${parent.loan_id}`, {
                                state: { loan: parent, readOnly: true, renewals },
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 border border-gray-200 transition-colors"
                          >
                            <Eye size={12} /> View
                          </button>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {groupedLoans.length > ITEMS_PER_PAGE && (
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
                return Array.from(
                  { length: groupEnd - groupStart + 1 },
                  (_, i) => groupStart + i
                ).map((page) => (
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
        </main>
      </div>
    </div>
  );
};

export default Manager_Manage_Loans;
