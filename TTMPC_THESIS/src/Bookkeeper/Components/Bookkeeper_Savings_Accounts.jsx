import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Bell,
  Briefcase,
  Calculator,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  CreditCard,
  FileText,
  Filter,
  History,
  LayoutDashboard,
  PiggyBank,
  RefreshCw,
  Search,
  Users,
  Wallet,
} from "lucide-react";

import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import {
  PortalSidebarIdentity,
  PortalTopbarIdentity,
} from "../../components/PortalIdentity";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 10;

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `₱${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const getKindStyle = (kind) => {
  if (kind === "standalone") return "bg-amber-50 text-amber-700 border border-amber-200";
  return "bg-emerald-50 text-emerald-700 border border-emerald-200";
};

const getStatusStyle = (status) => {
  const key = String(status || "").toLowerCase();
  if (key === "active") return "bg-green-100 text-green-800 border border-green-300";
  if (key === "frozen") return "bg-sky-100 text-sky-800 border border-sky-300";
  if (key === "closed") return "bg-gray-100 text-gray-700 border border-gray-300";
  return "bg-gray-50 text-gray-600";
};

const useSavingsAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const fetchAccounts = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/savings/accounts`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || "Failed to load savings accounts.");
      }
      setAccounts(Array.isArray(result.data) ? result.data : []);
      setStatus("ready");
    } catch (err) {
      setError(err?.message || "Unable to fetch savings accounts.");
      setAccounts([]);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return { accounts, status, error, refresh: fetchAccounts };
};

const Bookkeeper_Savings_Accounts = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const { accounts, status, error, refresh } = useSavingsAccounts();
  const [searchTerm, setSearchTerm] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [sortBy, setSortBy] = useState("balance");
  const [showFilters, setShowFilters] = useState(false);
  const [isSavingsOpen, setIsSavingsOpen] = useState(true);
  const [page, setPage] = useState(1);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Manage Member", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: Briefcase },
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
    { name: "Legacy Member Validation", icon: Search },
  ];

  const routeMap = {
    Dashboard: "/dashboard",
    "Manage Member": "/manage-member",
    "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans": "/manage-loans",
    Payments: "/payments",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
    Grocery: "/grocery",
    "Legacy Member Validation": "/legacy-member-validation",
  };

  const totals = useMemo(() => {
    let total = 0;
    let memberCount = 0;
    let standaloneCount = 0;
    let standaloneTotal = 0;
    accounts.forEach((row) => {
      const bal = Number(row.balance || 0);
      total += bal;
      if (row.account_kind === "standalone") {
        standaloneCount += 1;
        standaloneTotal += bal;
      } else {
        memberCount += 1;
      }
    });
    return { total, memberCount, standaloneCount, standaloneTotal };
  }, [accounts]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    let rows = accounts;
    if (kindFilter !== "all") rows = rows.filter((r) => r.account_kind === kindFilter);
    if (term) {
      rows = rows.filter(
        (r) =>
          String(r.account_number || "").toLowerCase().includes(term) ||
          String(r.account_name || "").toLowerCase().includes(term) ||
          String(r.membership_id || "").toLowerCase().includes(term)
      );
    }
    const sorted = [...rows];
    if (sortBy === "balance") {
      sorted.sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
    } else if (sortBy === "name") {
      sorted.sort((a, b) =>
        String(a.account_name || "").localeCompare(String(b.account_name || ""))
      );
    } else if (sortBy === "recent") {
      sorted.sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0).getTime() -
          new Date(a.updated_at || a.created_at || 0).getTime()
      );
    }
    return sorted;
  }, [accounts, kindFilter, searchTerm, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => setPage(1), [searchTerm, kindFilter, sortBy]);

  const handleSignOut = async (event) => {
    event.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const handleRefresh = async () => {
    await refresh();
    addNotification("Savings accounts refreshed.", "success");
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
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
                    {isSavingsOpen ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
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

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8">
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
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
          </button>
          <PortalTopbarIdentity className="ml-4 text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
        </header>

        <main className="p-6">
          <div className="mb-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Savings Accounts</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Master ledger of member passbooks and standalone cooperative funds
                </p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-600 font-medium">
                {accounts.length} accounts • {formatCurrency(totals.total)} total
              </div>
            </div>

            {/* SUMMARY CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500">Total Balance</p>
                  <Wallet className="w-4 h-4 text-green-600" />
                </div>
                <p className="text-xl font-bold text-gray-900 mt-1.5">
                  {formatCurrency(totals.total)}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Across {accounts.length} active passbooks
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500">Member Accounts</p>
                  <Users className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-xl font-bold text-gray-900 mt-1.5">{totals.memberCount}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Linked to cooperative members</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500">Standalone Funds</p>
                  <CreditCard className="w-4 h-4 text-amber-600" />
                </div>
                <p className="text-xl font-bold text-gray-900 mt-1.5">
                  {totals.standaloneCount}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {formatCurrency(totals.standaloneTotal)} held
                </p>
              </div>
            </div>

            {status === "loading" && (
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
                <Clock size={13} />
                Loading savings accounts...
              </div>
            )}

            {status === "error" && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle size={13} />
                {error}
              </div>
            )}

            {/* SEARCH + FILTER BAR */}
            <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px] md:max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by account number, name, or member ID"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
              >
                <Filter size={13} />
                Filters
              </button>
              <button
                onClick={handleRefresh}
                className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
              >
                <RefreshCw size={13} />
                Refresh
              </button>
            </div>

            {showFilters && (
              <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Account Kind
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { value: "all", label: "All" },
                      { value: "member", label: "Member" },
                      { value: "standalone", label: "Standalone" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setKindFilter(opt.value)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                          kindFilter === opt.value
                            ? "bg-green-600 text-white"
                            : "bg-white border border-gray-300 text-gray-700 hover:border-green-500"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Sort By
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { value: "balance", label: "Balance" },
                      { value: "name", label: "Name" },
                      { value: "recent", label: "Recently Updated" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSortBy(opt.value)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                          sortBy === opt.value
                            ? "bg-green-600 text-white"
                            : "bg-white border border-gray-300 text-gray-700 hover:border-green-500"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* TABLE */}
          <div className="border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#66B538] text-white uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Account No.</th>
                    <th className="px-3 py-2.5 font-semibold">Account Name</th>
                    <th className="px-3 py-2.5 font-semibold">Kind</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Balance</th>
                    <th className="px-3 py-2.5 font-semibold">Last Activity</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {status === "loading" ? (
                    <tr>
                      <td colSpan="7" className="px-3 py-6 text-center text-gray-500">
                        Loading savings accounts...
                      </td>
                    </tr>
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-3 py-8 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <AlertCircle size={24} className="text-gray-300" />
                          <p className="text-xs text-gray-500">
                            {searchTerm || kindFilter !== "all"
                              ? "No accounts match your filters"
                              : "No savings accounts found"}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginated.map((row) => (
                      <tr
                        key={row.account_number}
                        className="hover:bg-green-50 transition-colors cursor-pointer"
                        onClick={() =>
                          navigate(`/Savings_Details/${encodeURIComponent(row.account_number)}`)
                        }
                      >
                        <td className="px-3 py-2 font-mono text-gray-800">{row.account_number}</td>
                        <td className="px-3 py-2">
                          <p className="text-gray-900 font-medium">{row.account_name}</p>
                          {row.membership_id ? (
                            <p className="text-[10px] text-gray-500 mt-0.5">{row.membership_id}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${getKindStyle(row.account_kind)}`}
                          >
                            {row.account_kind === "standalone" ? "Standalone" : "Member"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900 tabular-nums">
                          {formatCurrency(row.balance)}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {formatDate(row.updated_at || row.created_at)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusStyle(row.status)}`}
                          >
                            {String(row.status || "active").toUpperCase()}
                          </span>
                        </td>
                        <td
                          className="px-3 py-2 text-right"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            onClick={() =>
                              navigate(
                                `/Savings_Details/${encodeURIComponent(row.account_number)}`
                              )
                            }
                            className="px-2.5 py-1 rounded bg-green-600 hover:bg-green-700 text-white text-[11px] font-semibold"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > 0 && (
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const Pagination = ({ page, totalPages, onChange }) => (
  <div className="flex items-center justify-center p-4 gap-1.5 border-t border-gray-100">
    <button
      className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={page <= 1}
      onClick={() => onChange(Math.max(page - 1, 1))}
    >
      <ChevronLeft className="w-3.5 h-3.5" />
    </button>

    {(() => {
      const groupStart = Math.floor((page - 1) / 5) * 5 + 1;
      const groupEnd = Math.min(groupStart + 4, totalPages);
      return Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`w-7 h-7 flex items-center justify-center rounded-full border text-[11px] font-semibold transition-colors ${
            p === page
              ? "bg-[#16A34A] text-white border-[#16A34A]"
              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          }`}
        >
          {p}
        </button>
      ));
    })()}

    <button
      className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={page >= totalPages}
      onClick={() => onChange(Math.min(page + 1, totalPages))}
    >
      <ChevronRight className="w-3.5 h-3.5" />
    </button>
  </div>
);

export default Bookkeeper_Savings_Accounts;
