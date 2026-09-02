import React, { useEffect, useMemo, useState } from "react";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { bodNav } from "../../components/StaffSidebar/configs/bod";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import StaffTopbar from "../../components/StaffTopbar";
import NotificationBell from "../../components/NotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
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
  ChevronRight,
  ChevronLeft,
  FileText,
  ShieldCheck,
  AlertTriangle,
  History,
  CheckCircle2,
  Clock
} from "lucide-react";
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
  if (sourceStatus.includes("released") || sourceStatus.includes("disbursed")) return "Disbursed";
  if (sourceStatus.includes("partially paid")) return "Disbursed";
  if (sourceStatus.includes("approved")) return "Approved";
  if (sourceStatus.includes("ready for disbursement") || sourceStatus.includes("to be disbursed")) return "Pending";

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

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

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

      <div className="flex-1 min-w-0 flex flex-col">
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
              {/* Header + Filter Pills */}
              <div className="border-b border-gray-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Loan Records</h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Showing {paginatedLoans.length} of {sortedLoans.length} loans
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                    {["All", "Pending", "Approved", "Disbursed", "Paid"].map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                          activeFilter === filter
                            ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
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
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                      <th className="p-3 font-bold">Loan ID</th>
                      <th className="p-3 font-bold">Member</th>
                      <th className="p-3 font-bold">Loan Type</th>
                      <th className="p-3 font-bold text-right">Amount</th>
                      <th className="p-3 font-bold text-right">Balance</th>
                      <th className="p-3 font-bold text-right">Paid</th>
                      <th className="p-3 font-bold">Status</th>
                      <th className="p-3 font-bold">Application Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && !loadError ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-xs text-gray-500">
                          <RefreshCw className="inline w-4 h-4 mr-1 animate-spin" />
                          Loading loan ledger...
                        </td>
                      </tr>
                    ) : paginatedLoans.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center">
                          <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                          <p className="text-xs text-gray-500">No loans match your filters.</p>
                        </td>
                      </tr>
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
                              className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors"
                            >
                              <td className="p-3 text-xs font-mono text-gray-600 max-w-[10rem]">
                                <p className="truncate" title={loan.loan_id}>{loan.loan_id}</p>
                              </td>
                              <td className="p-3 text-xs">
                                <p className="font-semibold text-gray-900 truncate max-w-[12rem]" title={loan.member_name}>
                                  {loan.member_name || "Unknown Member"}
                                </p>
                                <p className="text-[10px] text-gray-500">{loan.membership_id || "—"}</p>
                              </td>
                              <td className="p-3 text-xs text-gray-700">{loan.loan_type || "Loan"}</td>
                              <td className="p-3 text-xs font-semibold text-gray-900 text-right">
                                {formatCurrency(amount)}
                              </td>
                              <td className="p-3 text-xs text-gray-700 text-right">
                                {formatCurrency(balance)}
                              </td>
                              <td className="p-3 text-xs text-emerald-700 font-semibold text-right">
                                {formatCurrency(paid)}
                              </td>
                              <td className="p-3 text-xs">
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${formatStatusTone(stage)}`}
                                >
                                  {stage}
                                </span>
                              </td>
                              <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                                {formatDisplayDate(loan.application_date)}
                              </td>
                            </tr>
                          );
                        })}
                        {Array.from({ length: PAGE_SIZE - paginatedLoans.length }).map((_, i) => (
                          <tr key={`filler-${i}`} className="border-b border-gray-100" aria-hidden="true">
                            <td className="p-3 text-xs">&nbsp;</td>
                            <td className="p-3 text-xs"></td>
                            <td className="p-3 text-xs"></td>
                            <td className="p-3 text-xs"></td>
                            <td className="p-3 text-xs"></td>
                            <td className="p-3 text-xs"></td>
                            <td className="p-3 text-xs"></td>
                            <td className="p-3 text-xs"></td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-center p-3 gap-2 border-t border-gray-100">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {(() => {
                  const windowSize = 5;
                  const groupStart = Math.floor((currentPage - 1) / windowSize) * windowSize + 1;
                  const groupEnd = Math.min(groupStart + windowSize - 1, totalPages);
                  return Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map((n) => (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`w-8 h-8 flex items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                        n === currentPage
                          ? "bg-[#16A34A] text-white border-[#16A34A]"
                          : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {n}
                    </button>
                  ));
                })()}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default BOD_Manage_Loans;
