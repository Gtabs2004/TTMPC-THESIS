import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
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
import { usePortalRole } from "../../utils/usePortalRole";
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
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const portalRole = usePortalRole();
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

  const menuItems = [
      {
        section: "BOD",
        items: [
          { name: "Dashboard", icon: LayoutDashboard },
          { name: "Member Approvals", icon: Users },
          { name: "Loan Approvals", icon: ShieldCheck },
          { name: "Loan Ledger", icon: CreditCard },
          { name: "Manage Member", icon: Users },
          { name: "Audit Log", icon: History },
          { name: "Loan Policies", icon: FileText },
        ],
      },
      {
        section: "SECRETARY",
        items: [
          { name: "Training Attendance", icon: CalendarCheck },
          { name: "General Assembly", icon: CalendarDays },
          { name: "Membership Records", icon: Archive },
        ],
      },
    ];

  const routeMap = {
    "Dashboard": "/BOD-dashboard",
    "Member Approvals": "/member-approvals",
    "Loan Approvals": "/bod-loan-approvals",
    "Loan Ledger": "/bod-manage-loans",
    "Manage Member": "/bod-manage-member",
    "Audit Log": "/bod-audit-log",
    "Loan Policies": "/bod-loan-policies",
    
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

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="fixed inset-y-0 left-0 bg-white w-64 p-4 flex flex-col border-r border-gray-200 z-30">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-primary">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="BOD Portal" fallbackRole="BOD" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((section) => {
            const sectionRole = section.section.toLowerCase();
            const isAccessible = !portalRole || sectionRole === portalRole;
            return (
            <div key={section.section} className="mb-4 flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">{section.section}</p>
              {section.items.map((item) => {
                const Icon = item.icon;
                if (!isAccessible) {
                  return (
                    <div
                      key={item.name}
                      title={`Only ${section.section} accounts can access this`}
                      className="flex items-center gap-3 p-2 rounded-md text-gray-400 cursor-not-allowed select-none opacity-60"
                    >
                      <Icon size={20} /><span>{item.name}</span>
                    </div>
                  );
                }
                return (
                  <NavLink
                    key={item.name}
                    to={routeMap[item.name]}
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
            </div>
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

      <div className="flex-1 min-w-0 flex flex-col ml-64">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="bg-gray-50 w-60 h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
              placeholder="Search loans..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
            <img src="src/assets/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200" />
            <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="BOD" />
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="p-6 sm:p-8">
            {/* Page Header */}
            <div className="mb-8">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Loans</p>
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-gray-700" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">{formatCurrency(summaryTotals.total)}</h2>
                <p className="text-xs text-gray-500 mt-2">All recorded loans</p>
              </div>

              <div className="bg-blue-50 rounded-lg border border-blue-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Disbursed</p>
                  <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-blue-700" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-blue-900">{formatCurrency(summaryTotals.disbursed + summaryTotals.paid)}</h2>
                <p className="text-xs text-blue-600 mt-2">Released to members</p>
              </div>

              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Fully Paid</p>
                  <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-emerald-900">{formatCurrency(summaryTotals.paid)}</h2>
                <p className="text-xs text-emerald-600 mt-2">Loans settled</p>
              </div>

              <div className="bg-amber-50 rounded-lg border border-amber-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Pending</p>
                  <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-amber-700" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-amber-900">{formatCurrency(summaryTotals.pending)}</h2>
                <p className="text-xs text-amber-600 mt-2">Awaiting release</p>
              </div>
            </div>

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
