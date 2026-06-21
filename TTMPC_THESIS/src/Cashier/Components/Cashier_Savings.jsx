import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  LayoutDashboard,
  PiggyBank,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  UserPlus,
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

const Cashier_Savings = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const { accounts, status, error, refresh } = useSavingsAccounts();
  const [searchTerm, setSearchTerm] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [sortBy, setSortBy] = useState("balance");
  const [showFilters, setShowFilters] = useState(false);
  const [isDepositsOpen, setIsDepositsOpen] = useState(true);
  const [page, setPage] = useState(1);

  const menuItems = useMemo(
    () => [
      { name: "Dashboard", icon: LayoutDashboard, path: "/Cashier_Dashboard" },
      { name: "Payments", icon: ArrowUpRight, path: "/Cashier_Payments" },
      { name: "Disbursement", icon: Send, path: "/Cashier_Disbursement" },
      { name: "Membership Payments", icon: UserPlus, path: "/Cashier_MembershipPayments" },
      {
        name: "Deposits",
        icon: PiggyBank,
        isDropdown: true,
        subItems: [
          { name: "Savings", path: "/Cashier_Savings" },
          { name: "Capital Build-Up", path: "/Cashier_CBU" },
        ],
      },
      { name: "Withdrawals", icon: ArrowDownLeft, path: "/Cashier_Withdrawals" },
      { name: "Grocery", icon: ShoppingCart, path: "/Cashier_Grocery" },
    ],
    []
  );

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
    if (kindFilter !== "all") {
      rows = rows.filter((r) => r.account_kind === kindFilter);
    }
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
      <aside className="fixed left-0 top-0 h-screen bg-white w-64 p-4 flex flex-col border-r border-gray-200 overflow-y-auto z-50">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity
              className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold"
              fallbackPortal="Cashier Portal"
              fallbackRole="Cashier"
            />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
            if (item.isDropdown) {
              return (
                <div key={item.name} className="flex flex-col">
                  <button
                    onClick={() => setIsDepositsOpen(!isDepositsOpen)}
                    className="flex items-center justify-between p-2 rounded-md text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors w-full"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={20} />
                      <span>{item.name}</span>
                    </div>
                    {isDepositsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {isDepositsOpen && (
                    <div className="flex flex-col mt-1 space-y-1">
                      {item.subItems.map((subItem) => (
                        <NavLink
                          key={subItem.name}
                          to={subItem.path}
                          className={({ isActive }) =>
                            `block pl-11 pr-4 py-2 rounded-md transition-colors ${
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
                to={item.path}
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

      {/* MAIN */}
    <div className="flex-1 flex flex-col h-screen overflow-y-auto ml-64">
            <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-white h-16 border-b border-gray-100 flex items-center justify-between px-8 shrink-0 ">
        
        
        
    
        {/* Right Side: Grouped Utilities */}
        <div className="flex items-center space-x-4 ml-auto">
          
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="bg-gray-50 w-60 h-10 rounded-lg border border-gray-200 px-4 pl-9 py-1 focus:outline-none focus:ring-2 focus:ring-[#00A859] focus:border-transparent transition-all placeholder-gray-400 text-sm"
            />
          </div>
    
          {/* Notifications */}
          <button className="relative p-2 rounded-full text-gray-500 hover:bg-gray-50 transition-colors">
            <Bell className="w-5 h-5" />
            {/* Adjusted badge alignment so it sits perfectly on the shoulder of the bell */}
            <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
    
          {/* Profile Divider (Optional but adds a premium touch) */}
          <span className="h-6 w-px bg-gray-200"></span>
    
          {/* User Identity Group */}
          <div className="flex items-center space-x-3">
            <img
              src="/img/bookkeeper-profile.png"
              alt="Profile"
              className="w-9 h-9 rounded-full object-cover border border-gray-100 bg-gray-50"
            />
            <PortalTopbarIdentity className="text-sm font-semibold text-green-600" fallbackRole="Cashier" />
          </div>
    
        </div>
      </header>
    </div>
    
        <main className="p-8 overflow-auto">
          {/* TITLE BLOCK */}
          <div className="mb-8">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Savings Accounts</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Manage member passbooks and standalone cooperative funds
                </p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-600 font-medium">
                {accounts.length} accounts • {formatCurrency(totals.total)} total
              </div>
            </div>

            {/* SUMMARY CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-500">Total Balance</p>
                  <Wallet className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {formatCurrency(totals.total)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Across {accounts.length} active passbooks
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-500">Member Accounts</p>
                  <UserPlus className="w-5 h-5 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-2">{totals.memberCount}</p>
                <p className="text-xs text-gray-500 mt-1">Linked to cooperative members</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-500">Standalone Funds</p>
                  <Banknote className="w-5 h-5 text-amber-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-2">{totals.standaloneCount}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatCurrency(totals.standaloneTotal)} held
                </p>
              </div>
            </div>

            {/* ALERTS */}
            {status === "loading" && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
                <Clock size={16} />
                Loading savings accounts...
              </div>
            )}

            {status === "error" && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {/* SEARCH + FILTER BAR */}
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by account number, name, or member ID..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 pl-10 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200 transition"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  <Filter size={16} />
                  Filters
                </button>
                <button
                  onClick={handleRefresh}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>
                <button
                  onClick={() => navigate("/add_savings")}
                  className="flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2.5 text-sm transition-colors"
                >
                  <UserPlus size={16} />
                  Add Savings
                </button>
              </div>
            </div>

            {/* FILTERS DROPDOWN */}
            {showFilters && (
              <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account Kind
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "all", label: "All Accounts" },
                        { value: "member", label: "Member" },
                        { value: "standalone", label: "Standalone" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setKindFilter(opt.value)}
                          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sort By
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "balance", label: "Balance" },
                        { value: "name", label: "Name" },
                        { value: "recent", label: "Recently Updated" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setSortBy(opt.value)}
                          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
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
              </div>
            )}
          </div>

          {/* MAIN TABLE */}
          <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#66B538] text-white uppercase text-[13px] tracking-wider">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Account No.</th>
                    <th className="px-6 py-4 text-left font-semibold">Account Name</th>
                    <th className="px-6 py-4 text-left font-semibold">Kind</th>
                    <th className="px-6 py-4 text-right font-semibold">Balance</th>
                    <th className="px-6 py-4 text-left font-semibold">Last Activity</th>
                    <th className="px-6 py-4 text-center font-semibold">Status</th>
                    <th className="px-6 py-4 text-center font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {status === "loading" ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        Loading savings accounts...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <AlertCircle size={32} className="text-gray-300" />
                          <p className="text-sm text-gray-500">
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
                        className="hover:bg-green-50 transition cursor-pointer"
                        onClick={() =>
                          navigate(`/Savings_Details/${encodeURIComponent(row.account_number)}`)
                        }
                      >
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm text-gray-800">
                            {row.account_number}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900">{row.account_name}</p>
                          {row.membership_id ? (
                            <p className="text-xs text-gray-500 mt-0.5">{row.membership_id}</p>
                          ) : null}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${getKindStyle(row.account_kind)}`}
                          >
                            {row.account_kind === "standalone" ? "Standalone" : "Member"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-semibold text-gray-900">
                            {formatCurrency(row.balance)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {formatDate(row.updated_at || row.created_at)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold ${getStatusStyle(row.status)}`}
                          >
                            {String(row.status || "active").toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() =>
                              navigate(`/Savings_Details/${encodeURIComponent(row.account_number)}`)
                            }
                            className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors text-sm"
                          >
                            Review
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
  <div className="flex items-center justify-center p-6 gap-2 border-t border-gray-100">
    <button
      className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={page <= 1}
      onClick={() => onChange(Math.max(page - 1, 1))}
    >
      <ChevronLeft className="w-4 h-4" />
    </button>

    {(() => {
      const groupStart = Math.floor((page - 1) / 5) * 5 + 1;
      const groupEnd = Math.min(groupStart + 4, totalPages);
      return Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`w-8 h-8 flex items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
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
      className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={page >= totalPages}
      onClick={() => onChange(Math.min(page + 1, totalPages))}
    >
      <ChevronRight className="w-4 h-4" />
    </button>
  </div>
);

export default Cashier_Savings;
