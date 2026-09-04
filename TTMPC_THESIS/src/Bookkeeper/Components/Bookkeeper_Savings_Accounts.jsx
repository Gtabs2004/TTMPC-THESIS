import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Bell,
  Briefcase,
  Calculator,
  ChevronDown,
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
  ShieldAlert,
  Brain,
} from "lucide-react";

import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import Pagination from "../../components/Pagination";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 5;

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
    const navigate = useNavigate();
  const { addNotification } = useNotification();

  const { accounts, status, error, refresh } = useSavingsAccounts();
  const [searchTerm, setSearchTerm] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [sortBy, setSortBy] = useState("balance");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);



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


  const handleRefresh = async () => {
    await refresh();
    addNotification("Savings accounts refreshed.", "success");
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

      <div className="flex-1 flex flex-col">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        <main className="p-6">
          <div className="mb-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <Breadcrumb portal="Bookkeeper" page="Savings Accounts" />
                <h1 className="text-xl font-bold text-gray-900">Savings Accounts</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Master ledger of member passbooks and standalone cooperative funds
                </p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-600 font-medium">
                {accounts.length} accounts â€¢ {formatCurrency(totals.total)} total
              </div>
            </div>

            {/* SUMMARY CARDS */}
            <StatCardRow cols={3}>
              <StatCard
                label="Total Balance"
                value={formatCurrency(totals.total)}
                icon={Wallet}
                iconColor="text-green-600"
                subtext={`Across ${accounts.length} active passbooks`}
              />
              <StatCard
                label="Member Accounts"
                value={totals.memberCount}
                icon={Users}
                iconColor="text-emerald-600"
                subtext="Linked to cooperative members"
              />
              <StatCard
                label="Standalone Funds"
                value={totals.standaloneCount}
                icon={CreditCard}
                iconColor="text-amber-600"
                subtext={`${formatCurrency(totals.standaloneTotal)} held`}
              />
            </StatCardRow>

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

          </div>

          {/* TABLE (search & filter toolbar shares this card) */}
          <div className="border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white">
            <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
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
              <div className="border-b border-gray-100 bg-gray-50 p-3 space-y-3">
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

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Account No.</th>
                    <th className="p-5 font-bold">Account Name</th>
                    <th className="p-5 font-bold">Kind</th>
                    <th className="p-5 font-bold text-right">Balance</th>
                    <th className="p-5 font-bold">Last Activity</th>
                    <th className="p-5 font-bold">Status</th>
                    <th className="p-5 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {status === "loading" ? (
                    <tr>
                      <td colSpan="7" className="p-5 text-center text-gray-500">
                        Loading savings accounts...
                      </td>
                    </tr>
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-5 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <AlertCircle size={24} className="text-gray-300" />
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
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() =>
                          navigate(`/Savings_Details/${encodeURIComponent(row.account_number)}`)
                        }
                      >
                        <td className="p-5 text-sm font-mono text-gray-800">{row.account_number}</td>
                        <td className="p-5 text-sm">
                          <p className="text-gray-900 font-medium">{row.account_name}</p>
                          {row.membership_id ? (
                            <p className="text-[10px] text-gray-500 mt-0.5">{row.membership_id}</p>
                          ) : null}
                        </td>
                        <td className="p-5 text-sm">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${getKindStyle(row.account_kind)}`}
                          >
                            {row.account_kind === "standalone" ? "Standalone" : "Member"}
                          </span>
                        </td>
                        <td className="p-5 text-sm text-right font-semibold text-gray-900 tabular-nums">
                          {formatCurrency(row.balance)}
                        </td>
                        <td className="p-5 text-sm text-gray-600">
                          {formatDate(row.updated_at || row.created_at)}
                        </td>
                        <td className="p-5 text-sm">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusStyle(row.status)}`}
                          >
                            {String(row.status || "active").toUpperCase()}
                          </span>
                        </td>
                        <td
                          className="p-5 text-sm text-right"
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


export default Bookkeeper_Savings_Accounts;
