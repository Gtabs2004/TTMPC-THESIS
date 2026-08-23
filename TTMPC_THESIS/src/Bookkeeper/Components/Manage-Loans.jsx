import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Calculator,
  Activity,
  BarChart3,
  History,
  Search,
  Bell,
  Wallet,
  Coins,
  Eye,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PiggyBank,
  RefreshCw,
  ShieldAlert,
  Brain,
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
    ? new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
    : "—";

const getLoanTypeStyle = (code) => {
  const key = String(code || "").toUpperCase();
  if (key === "CONSOLIDATED") return "bg-blue-100 text-blue-700";
  if (key === "EMERGENCY") return "bg-red-100 text-red-700";
  if (key === "BONUS") return "bg-amber-100 text-amber-700";
  if (key === "KOICA" || key === "ABF") return "bg-emerald-100 text-emerald-700";
  return "bg-gray-100 text-gray-700";
};

const ManageLoans = () => {
  const { signOut } = UserAuth();
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
    Delinquency: "/delinquency",
    "Credit Risk": "/bookkeeper-credit-risk",
    Payments: "/payments",
    "Savings Withdrawals": "/bookkeeper-savings-transactions",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
    Grocery: "/grocery",
    "Legacy Member Validation": "/legacy-member-validation",
  };

  const dashboardStats = useMemo(() => {
    const totalActiveLoans = loans.filter((loan) => loan.remaining_balance > 0).length;
    const totalOutstanding = loans.reduce((sum, loan) => sum + Number(loan.remaining_balance || 0), 0);
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const collectedThisMonth = loans
      .flatMap((loan) => loan.payment_history || [])
      .filter((payment) => String(payment.date_paid || "").slice(0, 7) === currentMonthKey)
      .reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0);

    return {
      totalActiveLoans,
      totalOutstanding,
      collectedThisMonth,
    };
  }, [loans]);

  const tabs = useMemo(() => {
    const active = loans.filter((loan) => loan.remaining_balance > 0).length;
    const fullyPaid = loans.filter((loan) => loan.remaining_balance <= 0).length;
    return [
      { key: "active", label: "Active Loans", count: active },
      { key: "fully_paid", label: "Fully Paid", count: fullyPaid },
    ];
  }, [loans]);

  const filteredLoans = useMemo(() => {
    const text = searchTerm.trim().toLowerCase();

    return loans.filter((item) => {
      const tabMatch = activeTab === "active" ? item.remaining_balance > 0 : item.remaining_balance <= 0;
      if (!tabMatch) return false;

      if (loanTypeFilter !== "all" && item.loan_type_code !== loanTypeFilter) return false;
      if (memberTypeFilter !== "all" && item.member_type !== memberTypeFilter) return false;

      if (!text) return true;
      return (
        item.member_name.toLowerCase().includes(text) ||
        item.loan_id.toLowerCase().includes(text) ||
        item.status.toLowerCase().includes(text)
      );
    });
  }, [loans, searchTerm, activeTab, loanTypeFilter, memberTypeFilter]);

  async function fetchApprovedLoans() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/manage-loans`);
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || "Failed to fetch Manage Loans data.");
      }

      const rows = Array.isArray(result?.data?.rows) ? result.data.rows : [];
      setLoans(rows);
      addNotification("Loans data synced successfully", "success");
    } catch (error) {
      addNotification(error?.message || "Unable to sync approved loans from backend.", "error");
      setLoadError(error?.message || "Unable to sync approved loans from backend.");
      setLoans([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // One-shot fetch on mount. The 10s polling interval was removed because it
    // re-parsed the full 500+ loan payload (with each loan's payment_history)
    // and caused the page to crash on dataset sizes around 587 rows. The
    // Refresh button in the header is the manual reload path.
    fetchApprovedLoans();
  }, []);

  // Reset to page 1 whenever the result set the user is paging through changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, loanTypeFilter, memberTypeFilter, loans.length]);

  // Collapse renewal chains: same member + same loan_type = one visible
  // parent (the most recent loan by application_date), with older
  // renewals folded underneath as a "Previous renewals (N)" toggle.
  // Purely a UI grouping — the underlying rows aren't merged.
  const groupedLoans = useMemo(() => {
    const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

    // For a legacy loan, get its last payment date from payment_history.
    const lastPaymentDate = (loan) => {
      const history = loan.payment_history || [];
      if (!history.length) return null;
      const dates = history.map((p) => new Date(p.date_paid || 0).getTime()).filter(Boolean);
      return dates.length ? Math.max(...dates) : null;
    };

    // Group all loans by member + loan type, sorted oldest → newest.
    const buckets = new Map();
    for (const loan of filteredLoans) {
      const key = `${loan.member_name || ""}::${loan.loan_type_code || loan.loan_type || ""}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(loan);
    }

    // Extract trailing numeric suffix from a loan ID for ordering legacy loans
    // that lack application_date (e.g. "TTMPCL-419" → 419).
    const loanSeq = (id) => {
      const m = String(id || "").match(/(\d+)\s*$/);
      return m ? parseInt(m[1], 10) : 0;
    };

    const results = [];

    for (const items of buckets.values()) {
      const sorted = [...items].sort((a, b) => {
        const da = new Date(a.application_date || 0).getTime();
        const db = new Date(b.application_date || 0).getTime();
        if (da !== db) return da - db; // oldest first for chain building
        // Fallback: use loan ID numeric suffix (works for legacy loans without dates)
        return loanSeq(a.loan_id) - loanSeq(b.loan_id);
      });

      // Build chains: walk oldest→newest, decide if each loan is a renewal
      // of the previous one or a standalone new loan.
      // Rules:
      //   System loans: use application_type field ("renewal" = chains onto prev).
      //   Legacy loans (is_legacy=true, application_type null/new): treat as
      //   renewal if the loan's application_date is within 6 months after the
      //   predecessor's last payment date.
      const chains = []; // each chain = [root, ...renewals] oldest→newest

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
            // System loan explicitly marked renewal.
            prevChain.push(loan);
            attachedToChain = true;
          } else if (isLegacy) {
            // Legacy loan: TTMPC policy forbids two simultaneous consolidated
            // loans, so any subsequent loan of the same type for the same
            // member in the CSV must be a renewal of the prior one.
            //
            // Ordering is already oldest→newest (by date then loan ID suffix),
            // so "coming after in sorted order" == is a renewal.
            // If payment history exists on the predecessor, also verify the
            // new application came within 6 months of the last payment.
            const prevLastPay = lastPaymentDate(prevLoan);
            // "Is this loan sequentially after the previous one?"
            // Use date first; fall back to loan ID numeric order.
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

      // Each chain: newest = parent (shown in table), rest = renewals (shown in ledger).
      for (const chain of chains) {
        const reversed = [...chain].reverse(); // newest first
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

  const handleSignOut = async (event) => {
    event.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
          <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
            <div className="flex flex-row items-start gap-2 mb-6">
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
                return (
                  <NavLink
                    key={item.name}
                    to={routeMap[item.name]}
                    className={({ isActive }) =>
                      `flex items-center gap-3 p-2 rounded-md transition-all duration-150 ease-in-out ${
                        isActive ? "bg-green-50 text-green-700 font-semibold" : "text-gray-700 hover:bg-green-50 hover:text-green-700"
                      }`
                    }
                  >
                    <Icon size={20} />
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}
            </nav>
            <button onClick={handleSignOut} className="mt-auto w-full rounded-md p-2 text-xs bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white font-bold transition-all duration-150 ease-in-out shadow-sm hover:shadow">Sign out</button>
          </aside>
          <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shadow-sm flex items-center justify-between px-8 border-b border-gray-100">
          <div className="flex-1 max-w-2xl">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                className="bg-gray-50 w-full h-10 rounded-lg border border-gray-300 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent shadow-sm hover:border-gray-400 transition-all"
                placeholder="Search member, loan ID, status..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-4 ml-6">
            <button className="relative p-1.5 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
            </button>
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <img
                src="/img/bookkeeper-profile.png"
                alt="Bookkeeper Profile"
                className="w-8 h-8 rounded-full shadow-sm"
              />
              <PortalTopbarIdentity className="text-sm font-semibold text-gray-700 hidden sm:block" fallbackRole="Bookkeeper" />
            </div>
          </div>
        </header>

        <main className="p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
            <div>
              
            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
                              <span>Bookkeeper</span>
                              <ChevronRight className="w-4 h-4 text-gray-300" />
                              <span className="text-primary">Manage loans</span>
                            </div>

              <p className="text-base text-gray-600 mt-2">Track loan status, monitor balances, and manage member ledger records in real-time.</p>
            </div>
            <button
              type="button"
              onClick={fetchApprovedLoans}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 active:bg-green-800 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm uppercase tracking-wider text-gray-600 font-semibold">Total Active Loans</p>
                  <h2 className="mt-3 text-3xl font-bold text-gray-900">{dashboardStats.totalActiveLoans}</h2>
                </div>
                <div className="bg-blue-100 rounded-lg p-3">
                  <CreditCard size={20} className="text-blue-600" />
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm uppercase tracking-wider text-gray-600 font-semibold">Outstanding Balance</p>
                  <h2 className="mt-3 text-3xl font-bold text-gray-900">{formatCurrency(dashboardStats.totalOutstanding)}</h2>
                </div>
                <div className="bg-amber-100 rounded-lg p-3">
                  <Wallet size={20} className="text-amber-600" />
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm uppercase tracking-wider text-gray-600 font-semibold">Collected This Month</p>
                  <h2 className="mt-3 text-3xl font-bold text-gray-900">{formatCurrency(dashboardStats.collectedThisMonth)}</h2>
                </div>
                <div className="bg-green-100 rounded-lg p-3">
                  <Coins size={20} className="text-green-600" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-gray-200 shadow-sm mb-6 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === tab.key
                        ? "bg-green-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`inline-flex items-center justify-center min-w-6 h-6 rounded-full text-xs font-semibold ${
                      activeTab === tab.key
                        ? "bg-white/30"
                        : "bg-gray-300 text-gray-700"
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end xl:ml-auto">
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={loanTypeFilter}
                    onChange={(event) => setLoanTypeFilter(event.target.value)}
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
                    onChange={(event) => setMemberTypeFilter(event.target.value)}
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
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="bg-white w-full h-10 rounded-lg border border-gray-300 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Search by loan ID, member name..."
                  />
                </div>
              </div>
            </div>

            {loading && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                Syncing approved loans from server...
              </div>
            )}

            {!loading && loadError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start justify-between gap-3">
                <span>{loadError}</span>
                <button
                  type="button"
                  onClick={fetchApprovedLoans}
                  className="shrink-0 font-semibold underline decoration-red-400 underline-offset-2 hover:text-red-900"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-lg enhanced-table">
            <table className="w-full text-left border-collapse table-fixed">
              <colgroup>
                <col style={{ width: "16%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
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
                  <th className="px-3 py-4 font-bold text-center">Action</th>
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
                        <td className="px-3 py-4 text-sm text-gray-800 font-semibold align-top">{parent.member_name}</td>
                        <td className="px-3 py-4 align-top">
                          <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold ${getLoanTypeStyle(parent.loan_type_code)}`}>
                            {parent.loan_type}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-800 font-semibold text-right whitespace-nowrap align-top">{formatCurrency(parent.loan_amount)}</td>
                        <td className="px-3 py-4 text-sm text-gray-700 text-left font-medium whitespace-nowrap align-top">{formatCurrency(parent.amortization)}</td>
                        <td className="px-3 py-4 text-sm text-left font-bold whitespace-nowrap align-top">
                          <span className={parent.remaining_balance > 0 ? 'text-amber-600' : 'text-green-600'}>
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
                            onClick={() => navigate(`/bookkeeper-loan-ledger/${parent.loan_id}`, { state: { loan: parent, renewals } })}
                            className="btn-enhanced inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
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
        </main>
      </div>
    </div>
  );
};

export default ManageLoans;




