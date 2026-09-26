import React, { useEffect, useMemo, useState } from "react";
import { StatCard, StatCardRow } from "../../components/StatCard";
import { TableToolbar } from "../../components/TableToolbar";
import StaffSidebar from "../../components/StaffSidebar";
import { bodNav } from "../../components/StaffSidebar/configs/bod";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import StaffTopbar from "../../components/StaffTopbar";
import NotificationBell from "../../components/NotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import Pagination from "../../components/Pagination";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarCheck,
  CalendarDays,
  Archive,
  Search,
  Bell,
  BookOpen,
  RefreshCw,
  FileText,
  ShieldCheck,
  AlertTriangle,
  History,
  CheckCircle2,
  Clock,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import TableStateRow from "../../components/TableStateRow";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `P${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDisplayDate = (value) => {
  if (!value) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Pending";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const resolveLoanStage = (loan) => {
  const repaymentStatus = String(loan.status || "").toLowerCase();
  if (repaymentStatus.includes("fully")) return "Paid";

  const sourceStatus = String(loan.source_loan_status || "").toLowerCase();
  // Checked before the generic "disbursed" match below: "to be disbursed" is
  // still awaiting release (no money has moved yet), but it contains the
  // substring "disbursed" and would otherwise be misread as already
  // Disbursed — this order is what makes this branch reachable at all.
  if (sourceStatus.includes("ready for disbursement") || sourceStatus.includes("to be disbursed")) return "Pending";
  if (sourceStatus.includes("released") || sourceStatus.includes("disbursed")) return "Disbursed";
  if (sourceStatus.includes("partially paid")) return "Disbursed";
  if (sourceStatus.includes("approved")) return "Approved";

  return "Pending";
};

const formatStatusTone = (status) => {
  const value = String(status || "").toLowerCase();
  if (value.includes("paid")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (value.includes("disbursed")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (value.includes("approved")) return "bg-green-50 text-green-700 border-green-200";
  if (value.includes("pending")) return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
};

// "View All" modal's status categories. Maps onto the same resolveLoanStage()
// used by the main table's pills, just relabeled per the requested taxonomy
// (Disbursed -> Active, Paid -> Completed). Rejected loans never appear here
// because /api/bookkeeper/manage-loans only returns loans past the "rejected"
// stage (approved/disbursed/paid) — the category still shows, with an
// accurate empty state, rather than being silently dropped.
const VIEW_ALL_STATUS_CATEGORIES = ["Pending", "Approved", "Active", "Completed", "Rejected"];
const resolveViewAllCategory = (loan) => {
  const stage = resolveLoanStage(loan);
  if (stage === "Disbursed") return "Active";
  if (stage === "Paid") return "Completed";
  return stage;
};

// Compact loan table reused inside the "View All" modal — same columns/
// classes as the main Loan Ledger table (minus pagination), so a grouped
// section still looks like the rest of the page rather than a new UI.
const ViewAllLoanTable = ({ loans, emptyText }) => {
  if (!loans.length) {
    return <p className="text-xs text-gray-400 py-3">{emptyText || "No loans in this category."}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
            <th className="p-3 font-bold">Loan ID</th>
            <th className="p-3 font-bold">Member</th>
            <th className="p-3 font-bold">Loan Type</th>
            <th className="p-3 font-bold text-right">Amount</th>
            <th className="p-3 font-bold text-right">Balance</th>
            <th className="p-3 font-bold">Status</th>
            <th className="p-3 font-bold">Application Date</th>
          </tr>
        </thead>
        <tbody>
          {loans.map((loan) => {
            const stage = resolveLoanStage(loan);
            const amount = Number(loan.loan_amount || 0);
            const balance = Number(loan.remaining_balance || 0);
            return (
              <tr key={loan.loan_id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 transition-colors">
                <td className="p-3 text-xs font-mono text-gray-600 max-w-[9rem]">
                  <p className="truncate" title={loan.loan_id}>{loan.loan_id}</p>
                </td>
                <td className="p-3 text-xs">
                  <p className="font-semibold text-gray-900 truncate max-w-[10rem]" title={loan.member_name}>
                    {loan.member_name || "Unknown Member"}
                  </p>
                  <p className="text-[10px] text-gray-500">{loan.membership_id || "—"}</p>
                </td>
                <td className="p-3 text-xs text-gray-700">{loan.loan_type || "Loan"}</td>
                <td className="p-3 text-xs font-semibold text-gray-900 text-right whitespace-nowrap">
                  {formatCurrency(amount)}
                </td>
                <td className="p-3 text-xs text-gray-700 text-right whitespace-nowrap">
                  {formatCurrency(balance)}
                </td>
                <td className="p-3 text-xs">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${formatStatusTone(stage)}`}>
                    {stage}
                  </span>
                </td>
                <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                  {formatDisplayDate(loan.application_date)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const BOD_Manage_Loans = () => {
    const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("All");
  const [yearFilter, setYearFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  // "View All" modal — a complete, un-paginated, categorized view of every
  // loan matching the current member search (or everything, if the search
  // box is empty). Independent of the outer status pill / Year / Month
  // filters, which stay scoped to the paginated table above.
  const [showViewAll, setShowViewAll] = useState(false);
  const [viewAllMode, setViewAllMode] = useState("status"); // "status" | "year"
  const [viewAllStatusTab, setViewAllStatusTab] = useState("Pending");
  const [expandedYears, setExpandedYears] = useState(() => new Set());

  const availableYears = useMemo(() => {
    const set = new Set();
    loans.forEach((l) => {
      const d = new Date(l.application_date);
      if (!Number.isNaN(d.getTime())) set.add(d.getFullYear());
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [loans]);

  const filteredLoans = useMemo(() => {
    const key = String(searchTerm || "").trim().toLowerCase();
    return loans.filter((loan) => {
      if (activeFilter !== "All" && resolveLoanStage(loan) !== activeFilter) return false;

      if (yearFilter !== "All" || monthFilter !== "All") {
        const d = new Date(loan.application_date);
        if (Number.isNaN(d.getTime())) return false;
        if (yearFilter !== "All" && d.getFullYear() !== Number(yearFilter)) return false;
        if (monthFilter !== "All" && d.getMonth() !== Number(monthFilter)) return false;
      }

      if (!key) return true;
      return (
        String(loan.member_name || "").toLowerCase().includes(key) ||
        String(loan.membership_id || "").toLowerCase().includes(key) ||
        String(loan.loan_id || "").toLowerCase().includes(key) ||
        String(loan.loan_type || "").toLowerCase().includes(key) ||
        String(loan.source_loan_status || "").toLowerCase().includes(key)
      );
    });
  }, [loans, searchTerm, activeFilter, yearFilter, monthFilter]);

  const sortedLoans = useMemo(() => {
    return [...filteredLoans].sort((a, b) => {
      const ta = new Date(a.application_date || 0).getTime();
      const tb = new Date(b.application_date || 0).getTime();
      return tb - ta;
    });
  }, [filteredLoans]);

  // "View All" data source — every loan matching the member search (name,
  // member ID, or loan ID), or everything if the search box is empty. Kept
  // independent of the status-pill/Year/Month filters above the paginated
  // table, since the modal has its own Status/Year categorization.
  const viewAllLoans = useMemo(() => {
    const key = String(searchTerm || "").trim().toLowerCase();
    if (!key) return sortedLoans.length ? sortedLoans : loans;
    return loans
      .filter((loan) =>
        String(loan.member_name || "").toLowerCase().includes(key) ||
        String(loan.membership_id || "").toLowerCase().includes(key) ||
        String(loan.loan_id || "").toLowerCase().includes(key)
      )
      .sort((a, b) => new Date(b.application_date || 0) - new Date(a.application_date || 0));
  }, [loans, sortedLoans, searchTerm]);

  const viewAllStatusGroups = useMemo(() => {
    const groups = Object.fromEntries(VIEW_ALL_STATUS_CATEGORIES.map((c) => [c, []]));
    viewAllLoans.forEach((loan) => {
      const category = resolveViewAllCategory(loan);
      if (groups[category]) groups[category].push(loan);
    });
    return groups;
  }, [viewAllLoans]);

  const viewAllYearGroups = useMemo(() => {
    const years = new Map(); // year -> Map(monthIndex -> loans[])
    viewAllLoans.forEach((loan) => {
      const d = new Date(loan.application_date);
      if (Number.isNaN(d.getTime())) return;
      const year = d.getFullYear();
      const month = d.getMonth();
      if (!years.has(year)) years.set(year, new Map());
      const monthMap = years.get(year);
      if (!monthMap.has(month)) monthMap.set(month, []);
      monthMap.get(month).push(loan);
    });
    return [...years.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, monthMap]) => ({
        year,
        total: [...monthMap.values()].reduce((sum, arr) => sum + arr.length, 0),
        months: [...monthMap.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([monthIndex, monthLoans]) => ({ label: MONTH_NAMES[monthIndex], loans: monthLoans })),
      }));
  }, [viewAllLoans]);

  // Newest year starts expanded; the rest stay collapsed until clicked, so a
  // member with years of history doesn't dump everything at once.
  useEffect(() => {
    if (viewAllYearGroups.length) {
      setExpandedYears(new Set([viewAllYearGroups[0].year]));
    }
  }, [showViewAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleYearExpanded = (year) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(sortedLoans.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedLoans = sortedLoans.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [activeFilter, searchTerm, yearFilter, monthFilter, loans.length]);

  const summaryTotals = useMemo(() => {
    const totals = { approved: 0, disbursed: 0, paid: 0, pending: 0, total: 0 };
    filteredLoans.forEach((loan) => {
      const stage = resolveLoanStage(loan);
      const amount = Number(loan.loan_amount || 0);
      const remainingBalance = Number(loan.remaining_balance || 0);
      const paidAmount = Math.max(amount - remainingBalance, 0);
      totals.total += amount;
      if (paidAmount > 0) totals.paid += paidAmount;
      if (stage === "Disbursed" || stage === "Paid") totals.disbursed += amount;
      else if (stage === "Approved") totals.approved += amount;
      else totals.pending += amount;
    });
    return totals;
  }, [filteredLoans]);

  const fetchManageLoans = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/manage-loans`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.message || "Failed to load loan ledger data.");
      }
      const rows = Array.isArray(payload?.data?.rows) ? payload.data.rows : [];
      setLoans(rows);
    } catch (err) {
      setLoadError(err?.message || "Unable to load loan ledger data.");
      setLoans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManageLoans();
  }, []);



  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="BOD" items={bodNav} />

      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <StaffTopbar
          portal="BOD"
          notifications={<NotificationBell />}
          search={{ value: searchTerm, onChange: (event) => setSearchTerm(event.target.value), placeholder: "Search loans..." }}
        />

        <main className="flex-1 overflow-auto">
          <div className="p-6 sm:p-8">
            {/* Page Header */}
            <div className="mb-8">
              <Breadcrumb portal="BOD" page="Loan Ledger" />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">Loan Ledger</h1>
               
              </div>
              <p className="text-sm text-gray-600">Overview of approved, disbursed, paid, and pending loans</p>
            </div>

            {/* Alert Messages */}
            {loadError ? (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>{loadError}</div>
              </div>
            ) : null}

            {loading && !loadError ? (
              <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-start gap-3">
                <RefreshCw className="w-5 h-5 flex-shrink-0 mt-0.5 animate-spin" />
                <div>Syncing loan ledger data...</div>
              </div>
            ) : null}

            {/* Summary Cards */}
            <StatCardRow cols={4}>
              <StatCard
                label="Total Loans"
                value={formatCurrency(summaryTotals.total)}
                icon={CreditCard}
                iconColor="text-gray-700"
                subtext="All recorded loans"
              />
              <StatCard
                label="Disbursed"
                value={formatCurrency(summaryTotals.disbursed + summaryTotals.paid)}
                icon={BookOpen}
                iconColor="text-blue-600"
                subtext="Released to members"
              />
              <StatCard
                label="Fully Paid"
                value={formatCurrency(summaryTotals.paid)}
                icon={CheckCircle2}
                iconColor="text-emerald-600"
                subtext="Loans settled"
              />
              <StatCard
                label="Pending"
                value={formatCurrency(summaryTotals.pending)}
                icon={Clock}
                iconColor="text-amber-600"
                subtext="Awaiting release"
              />
            </StatCardRow>

            {/* Loan Ledger Table */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              {/* Header + Filter Pills — TableToolbar is the shared reference
                  design every list page is being migrated onto. */}
              <TableToolbar
                title="Loan Records"
                subtitle={`Showing ${paginatedLoans.length} of ${sortedLoans.length} loans`}
                tabs={["All", "Pending", "Approved", "Disbursed", "Paid"].map((filter) => ({ value: filter, label: filter }))}
                activeTab={activeFilter}
                onTabChange={setActiveFilter}
              >
                {/* Member Transaction Search — searches member name, member
                    ID, loan ID, loan type and status across the whole loan
                    list, not just the current page. */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by member name or member ID..."
                    className="w-full h-8 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
                  />
                </div>

                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="h-8 rounded-lg border border-gray-200 bg-white px-2 pr-6 text-[11px] font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
                >
                  <option value="All">All Years</option>
                  {availableYears.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>

                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="h-8 rounded-lg border border-gray-200 bg-white px-2 pr-6 text-[11px] font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
                >
                  <option value="All">All Months</option>
                  {MONTH_NAMES.map((name, i) => (
                    <option key={name} value={i}>{name}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setShowViewAll(true)}
                  className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  View All
                </button>
              </TableToolbar>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                      <th className="p-5 font-bold">Loan ID</th>
                      <th className="p-5 font-bold">Member</th>
                      <th className="p-5 font-bold">Loan Type</th>
                      <th className="p-5 font-bold text-right">Amount</th>
                      <th className="p-5 font-bold text-right">Balance</th>
                      <th className="p-5 font-bold text-right">Paid</th>
                      <th className="p-5 font-bold">Status</th>
                      <th className="p-5 font-bold">Application Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && !loadError ? (
                      <TableStateRow colSpan={8} variant="loading" label="Loading..." />
                    ) : paginatedLoans.length === 0 ? (
                      <TableStateRow colSpan={8} variant="empty" icon={BookOpen} label="No loans match your filters." />
                    ) : (
                      <>
                        {paginatedLoans.map((loan) => {
                          const stage = resolveLoanStage(loan);
                          const amount = Number(loan.loan_amount || 0);
                          const balance = Number(loan.remaining_balance || 0);
                          const paid = Math.max(amount - balance, 0);
                          return (
                            <tr
                              key={loan.loan_id}
                              className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                            >
                              <td className="p-5 text-xs font-mono text-gray-600 max-w-[10rem]">
                                <p className="truncate" title={loan.loan_id}>{loan.loan_id}</p>
                              </td>
                              <td className="p-5 text-xs">
                                <p className="font-semibold text-gray-900 truncate max-w-[12rem]" title={loan.member_name}>
                                  {loan.member_name || "Unknown Member"}
                                </p>
                                <p className="text-[10px] text-gray-500">{loan.membership_id || "—"}</p>
                              </td>
                              <td className="p-5 text-xs text-gray-700">{loan.loan_type || "Loan"}</td>
                              <td className="p-5 text-xs font-semibold text-gray-900 text-right">
                                {formatCurrency(amount)}
                              </td>
                              <td className="p-5 text-xs text-gray-700 text-right">
                                {formatCurrency(balance)}
                              </td>
                              <td className="p-5 text-xs text-emerald-700 font-semibold text-right">
                                {formatCurrency(paid)}
                              </td>
                              <td className="p-5 text-xs">
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${formatStatusTone(stage)}`}
                                >
                                  {stage}
                                </span>
                              </td>
                              <td className="p-5 text-xs text-gray-500 whitespace-nowrap">
                                {formatDisplayDate(loan.application_date)}
                              </td>
                            </tr>
                          );
                        })}
                        {Array.from({ length: PAGE_SIZE - paginatedLoans.length }).map((_, i) => (
                          <tr key={`filler-${i}`} className="border-b border-gray-100" aria-hidden="true">
                            <td className="p-5 text-xs">&nbsp;</td>
                            <td className="p-5 text-xs"></td>
                            <td className="p-5 text-xs"></td>
                            <td className="p-5 text-xs"></td>
                            <td className="p-5 text-xs"></td>
                            <td className="p-5 text-xs"></td>
                            <td className="p-5 text-xs"></td>
                            <td className="p-5 text-xs"></td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
            </div>
          </div>
        </main>
      </div>

      {/* "View All" — complete, un-paginated loan history for the current
          member search (or everything, if no search is active), organized
          either by status (Member Approvals' underline-tab design) or by
          Year -> Month, all inside one continuously scrollable panel. */}
      {showViewAll && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowViewAll(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-gray-100 w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Complete Loan Transaction History</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {viewAllLoans.length} loan{viewAllLoans.length === 1 ? "" : "s"}
                  {searchTerm.trim() ? ` matching "${searchTerm.trim()}"` : ""}
                </p>
              </div>
              <button
                onClick={() => setShowViewAll(false)}
                aria-label="Close"
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pt-3 flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mr-1">Group by</span>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                {[{ value: "status", label: "Status" }, { value: "year", label: "Year" }].map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setViewAllMode(mode.value)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                      viewAllMode === mode.value
                        ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status categories use the Member Approvals underline-tab design */}
            {viewAllMode === "status" && (
              <div className="flex items-center gap-6 px-6 pt-4 border-b border-gray-100 overflow-x-auto shrink-0">
                {VIEW_ALL_STATUS_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    onClick={() => setViewAllStatusTab(category)}
                    className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-semibold text-sm whitespace-nowrap transition-colors ${
                      viewAllStatusTab === category
                        ? "border-[#2C7A3F] text-[#2C7A3F]"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {category}
                    <span
                      className={`badge-animated text-[10px] px-2 py-0.5 rounded-full text-white ${
                        viewAllStatusTab === category ? "bg-[#2C7A3F]" : "bg-gray-400"
                      }`}
                    >
                      {viewAllStatusGroups[category]?.length || 0}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Single continuous scroll — both modes render inside this one
                scroll container, never a nested/paged view. */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {viewAllMode === "status" ? (
                <ViewAllLoanTable
                  loans={viewAllStatusGroups[viewAllStatusTab] || []}
                  emptyText={
                    viewAllStatusTab === "Rejected"
                      ? "No rejected loans on file — this ledger only tracks loans that reached approval."
                      : "No loans in this category."
                  }
                />
              ) : viewAllYearGroups.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">No loan history to show.</p>
              ) : (
                viewAllYearGroups.map(({ year, total, months }) => {
                  const isExpanded = expandedYears.has(year);
                  return (
                    <div key={year} className="mb-4 last:mb-0">
                      <button
                        type="button"
                        onClick={() => toggleYearExpanded(year)}
                        className="w-full flex items-center gap-2 py-2 text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                        )}
                        <h4 className="text-sm font-bold text-gray-800">{year}</h4>
                        <span className="text-xs text-gray-400">({total} loan{total === 1 ? "" : "s"})</span>
                      </button>
                      {isExpanded && (
                        <div className="pl-6 space-y-4">
                          {months.map((month) => (
                            <div key={month.label}>
                              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                {month.label} ({month.loans.length})
                              </p>
                              <ViewAllLoanTable loans={month.loans} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BOD_Manage_Loans;
