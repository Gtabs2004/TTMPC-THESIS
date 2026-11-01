import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useRealtimeRefetch } from "../../hooks/useRealtimeRefetch";
import { RT } from "../../lib/realtimeSync";
import { cachedFetch, getCached } from "../../utils/pageCache";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Bell,
  ChevronDown,
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
  History,
} from "lucide-react";

import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import StaffTopbar from "../../components/StaffTopbar";
import { TableToolbar } from "../../components/TableToolbar";
import TableActionButton from "../../components/TableActionButton";
import Pagination from "../../components/Pagination";
import TableStateRow from "../../components/TableStateRow";
import { authHeaders } from "../../utils/authHeaders";

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
  const [accounts, setAccounts] = useState(() => getCached("savings_accounts_master_list") || []);
  const [status, setStatus] = useState(() => (getCached("savings_accounts_master_list") ? "ready" : "loading"));
  const [error, setError] = useState(null);

  const fetchAccounts = useCallback(async ({ silent = false, force = false } = {}) => {
    try {
      const data = await cachedFetch(
        "savings_accounts_master_list",
        async () => {
          const response = await fetch(`${API_BASE_URL}/api/savings/accounts`);
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result?.success) {
            throw new Error(result?.detail || "Failed to load savings accounts.");
          }
          return Array.isArray(result.data) ? result.data : [];
        },
        { ttlMs: 120_000, force }
      );
      setAccounts(data);
      setStatus("ready");
      setError(null);
    } catch (err) {
      if (silent) return;
      setError(err?.message || "Unable to fetch savings accounts.");
      if (!getCached("savings_accounts_master_list")) setAccounts([]);
      setStatus("error");
    }
  }, []);
  useRealtimeRefetch([...RT.SAVINGS, "member"], () => fetchAccounts({ silent: true, force: true }));

  useEffect(() => {
    let ignore = false;
    (async () => {
      await Promise.resolve();
      if (!ignore) {
        fetchAccounts();
      }
    })();
    return () => {
      ignore = true;
    };
  }, [fetchAccounts]);

  return { accounts, status, error, refresh: (opts) => fetchAccounts({ force: true, ...opts }) };
};

const useTimeDeposits = (enabled) => {
  const [placements, setPlacements] = useState([]);
  const [kpis, setKpis] = useState({});
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const fetchTimeDeposits = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus("loading");
    if (!silent) setError(null);
    try {
      const headers = await authHeaders();
      const [placementsResponse, kpisResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/time-deposits`, { headers }),
        fetch(`${API_BASE_URL}/api/time-deposits/kpis`, { headers }),
      ]);
      const placementsResult = await placementsResponse.json().catch(() => ({}));
      const kpisResult = await kpisResponse.json().catch(() => ({}));
      if (!placementsResponse.ok || !placementsResult?.success) {
        throw new Error(placementsResult?.detail || "Failed to load Time Deposits.");
      }
      if (!kpisResponse.ok || !kpisResult?.success) {
        throw new Error(kpisResult?.detail || "Failed to load Time Deposit KPIs.");
      }
      setPlacements(Array.isArray(placementsResult.data) ? placementsResult.data : []);
      setKpis(kpisResult.data || {});
      setStatus("ready");
    } catch (err) {
      if (silent) return;
      setError(err?.message || "Unable to fetch Time Deposits.");
      setPlacements([]);
      setKpis({});
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (enabled) fetchTimeDeposits();
  }, [enabled, fetchTimeDeposits]);

  return { placements, kpis, status, error, refresh: fetchTimeDeposits };
};

const Cashier_Savings = () => {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [activeView, setActiveView] = useState("savings");

  const { accounts, status, error, refresh } = useSavingsAccounts();
  const {
    placements,
    kpis: tdKpis,
    status: tdStatus,
    error: tdError,
    refresh: refreshTimeDeposits,
  } = useTimeDeposits(activeView === "time-deposits");
  const [searchTerm, setSearchTerm] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [sortBy, setSortBy] = useState("balance");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const [settleTarget, setSettleTarget] = useState(null);
  const [settleMode, setSettleMode] = useState("FULL_PAYOUT");
  const [settleTermDays, setSettleTermDays] = useState(180);
  const [settleStatus, setSettleStatus] = useState("idle");
  const [settleError, setSettleError] = useState("");

  const [pretermTarget, setPretermTarget] = useState(null);
  const [pretermReason, setPretermReason] = useState("");
  const [pretermStatus, setPretermStatus] = useState("idle");
  const [pretermError, setPretermError] = useState("");
  const [pretermRequests, setPretermRequests] = useState([]);


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

  const fetchPretermRequests = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const response = await fetch(`${API_BASE_URL}/api/time-deposits/pre-termination-requests`, { headers });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.success) {
        setPretermRequests(Array.isArray(payload.data) ? payload.data : []);
      }
    } catch {
      // Best-effort; the Action column just won't show request status.
    }
  }, []);

  useEffect(() => {
    if (activeView === "time-deposits") fetchPretermRequests();
  }, [activeView, fetchPretermRequests]);

  const pretermByTdId = useMemo(() => {
    const map = {};
    pretermRequests.forEach((r) => {
      if (r.status === "pending" || r.status === "approved") map[r.time_deposit_id] = r;
    });
    return map;
  }, [pretermRequests]);

  const handleRefresh = async () => {
    if (activeView === "time-deposits") {
      await Promise.all([refreshTimeDeposits(), fetchPretermRequests()]);
      addNotification("Time Deposits refreshed.", "success");
      return;
    }
    await refresh();
    addNotification("Savings accounts refreshed.", "success");
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <StaffSidebar portal="Cashier" items={cashierNav} />

      {/* MAIN */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Cashier" notifications={<LoanNotificationBell role="cashier" />} />

        <main className="animate-page-in p-8 overflow-auto">
          {/* TITLE BLOCK */}
          <div className="mb-8">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  {activeView === "savings" ? "Savings Accounts" : "Time Deposits"}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  {activeView === "savings"
                    ? "Manage member passbooks and standalone cooperative funds"
                    : "Monitor certificate placements and maturity status"}
                </p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-600 font-medium">
                {activeView === "savings"
                  ? `${accounts.length} accounts • ${formatCurrency(totals.total)} total`
                  : `${placements.length} placements • ${formatCurrency(tdKpis.locked_td_principal)} principal`}
              </div>
            </div>

            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 mb-6" role="tablist" aria-label="Deposit type">
              {[
                { value: "savings", label: "Regular Savings" },
                { value: "time-deposits", label: "Time Deposits" },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={activeView === tab.value}
                  onClick={() => setActiveView(tab.value)}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition ${activeView === tab.value
                    ? "bg-green-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* SUMMARY CARDS */}
            {activeView === "savings" && <StatCardRow cols={3}>
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
                icon={UserPlus}
                iconColor="text-emerald-600"
                subtext="Linked to cooperative members"
              />
              <StatCard
                label="Special Accounts"
                value={totals.standaloneCount}
                icon={Banknote}
                iconColor="text-amber-600"
                subtext={`${formatCurrency(totals.standaloneTotal)} held`}
              />
            </StatCardRow>}
            {activeView === "time-deposits" && <StatCardRow cols={3}>
              <StatCard label="Total Time Deposit Principal" value={formatCurrency(tdKpis.locked_td_principal)} icon={Wallet} iconColor="text-green-600" subtext="Locked and matured principal" />
              <StatCard label="Total Time Deposit Accounts" value={tdKpis.total_time_deposit_accounts || 0} icon={Clock} iconColor="text-emerald-600" subtext={`${formatCurrency(tdKpis.locked_td_principal)} locked principal`} />
              <StatCard label="Awaiting Settlement" value={tdKpis.matured_awaiting_settlement_count || 0} icon={AlertCircle} iconColor="text-amber-600" subtext="Matured certificates" />
            </StatCardRow>}

            {/* ALERTS */}
            {(activeView === "savings" ? status : tdStatus) === "loading" && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
                <Clock size={16} />
                {activeView === "savings" ? "Loading savings accounts..." : "Loading Time Deposits..."}
              </div>
            )}

            {(activeView === "savings" ? status : tdStatus) === "error" && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle size={16} />
                {activeView === "savings" ? error : tdError}
              </div>
            )}

          </div>

          {/* MAIN TABLE (search & filter toolbar shares this card) */}
          {activeView === "savings" && (
          <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <TableToolbar subtitle={`Showing ${paginated.length} of ${filtered.length} accounts`}>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by account number, name, or member ID..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full h-8 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                <Filter size={13} />
                Filters
              </button>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                <RefreshCw size={13} />
                Refresh
              </button>
              <button
                onClick={() => navigate("/add_savings")}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold text-[11px] transition-colors"
              >
                <UserPlus size={13} />
                Add Savings
              </button>
            </TableToolbar>

            {/* FILTERS DROPDOWN */}
            {showFilters && (
              <div className="border-b border-gray-100 bg-gray-50 p-4">
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

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Account No.</th>
                    <th className="p-5 font-bold">Account Name</th>
                    <th className="p-5 font-bold">Kind</th>
                    <th className="p-5 font-bold text-right">Balance</th>
                    <th className="p-5 font-bold">Last Activity</th>
                    <th className="p-5 font-bold text-center">Status</th>
                    <th className="p-5 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {status === "loading" ? (
                    <TableStateRow colSpan={7} variant="loading" label="Loading..." />
                  ) : filtered.length === 0 ? (
                    <TableStateRow
                      colSpan={7}
                      variant="empty"
                      icon={AlertCircle}
                      label={
                        searchTerm || kindFilter !== "all"
                          ? "No accounts match your filters"
                          : "No savings accounts found"
                      }
                    />
                  ) : (
                    paginated.map((row) => (
                      <tr
                        key={row.account_number}
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() =>
                          navigate(`/Savings_Details/${encodeURIComponent(row.account_number)}`)
                        }
                      >
                        <td className="p-5">
                          <span className="font-mono text-sm text-gray-800">
                            {row.account_number}
                          </span>
                        </td>
                        <td className="p-5">
                          <p className="text-sm font-medium text-gray-900">{row.account_name}</p>
                          {row.membership_id ? (
                            <p className="text-xs text-gray-500 mt-0.5">{row.membership_id}</p>
                          ) : null}
                        </td>
                        <td className="p-5">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${getKindStyle(row.account_kind)}`}
                          >
                            {row.account_kind === "standalone" ? "Standalone" : "Member"}
                          </span>
                        </td>
                        <td className="p-5 text-right">
                          <span className="text-sm font-semibold text-gray-900">
                            {formatCurrency(row.balance)}
                          </span>
                        </td>
                        <td className="p-5 text-sm text-gray-600">
                          {formatDate(row.updated_at || row.created_at)}
                        </td>
                        <td className="p-5 text-center">
                          <span
                            className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold ${getStatusStyle(row.status)}`}
                          >
                            {String(row.status || "active").toUpperCase()}
                          </span>
                        </td>
                        <td className="p-5 text-center" onClick={(e) => e.stopPropagation()}>
                          <TableActionButton
                            onClick={() =>
                              navigate(`/Savings_Details/${encodeURIComponent(row.account_number)}`)
                            }
                          >
                            Review
                          </TableActionButton>
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
          )}

          {activeView === "time-deposits" && (
            <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <TableToolbar subtitle={`Showing ${placements.length} placements`}>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search certificate or member ID..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full h-8 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  <RefreshCw size={13} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/open_time_deposit")}
                  className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold text-[11px] transition-colors"
                >
                  <UserPlus size={13} />
                  Open Time Deposit
                </button>
              </TableToolbar>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                      <th className="p-5 font-bold">TD No.</th>
                      <th className="p-5 font-bold">Account Name</th>
                      <th className="p-5 font-bold">Term &amp; Rate</th>
                      <th className="p-5 font-bold text-right">Principal</th>
                      <th className="p-5 font-bold text-right">Interest Earned</th>
                      <th className="p-5 font-bold">Maturity Date</th>
                      <th className="p-5 font-bold">Status</th>
                      <th className="p-5 font-bold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tdStatus === "loading" ? (
                      <TableStateRow colSpan={8} variant="loading" label="Loading Time Deposits..." />
                    ) : tdStatus === "error" ? (
                      <TableStateRow colSpan={8} variant="empty" icon={AlertCircle} label={tdError || "Unable to load Time Deposits."} />
                    ) : placements.length === 0 ? (
                      <TableStateRow colSpan={8} variant="empty" icon={AlertCircle} label="No Time Deposit placements found" />
                    ) : (
                      placements
                        .filter((row) => {
                          const term = searchTerm.trim().toLowerCase();
                          return !term
                            || String(row.certificate_number || "").toLowerCase().includes(term)
                            || String(row.membership_id || "").toLowerCase().includes(term)
                            || String(row.account_name || "").toLowerCase().includes(term);
                        })
                        .map((row) => (
                          <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                            <td className="p-5 font-mono text-sm text-gray-800">{row.certificate_number}</td>
                            <td className="p-5">
                              <p className="text-sm font-medium text-gray-900">{row.account_name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{row.membership_id || "Member ID unavailable"}</p>
                            </td>
                            <td className="p-5 text-sm text-gray-700">
                              <div>{row.term_days} days</div>
                              <div className="text-xs text-gray-500">{(Number(row.annual_rate || 0) * 100).toFixed(2)}%</div>
                            </td>
                            <td className="p-5 text-right text-sm font-semibold text-gray-900">{formatCurrency(row.principal)}</td>
                            <td className="p-5 text-right text-sm font-semibold text-emerald-700">{formatCurrency(row.expected_interest)}</td>
                            <td className="p-5 text-sm text-gray-600">{formatDate(row.maturity_date)}</td>
                            <td className="p-5">
                              <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold ${row.status === "matured" ? "bg-amber-100 text-amber-800" : row.status === "closed" ? "bg-gray-100 text-gray-700" : "bg-blue-100 text-blue-800"}`}>
                                {String(row.status || "unknown").toUpperCase()}
                              </span>
                            </td>
                            <td className="p-5 text-center">
                              {row.status === "matured" ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSettleTarget(row);
                                    setSettleMode("FULL_PAYOUT");
                                    setSettleTermDays(180);
                                    setSettleError("");
                                    setSettleStatus("idle");
                                  }}
                                  className="inline-flex items-center gap-1 h-7 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold transition-colors"
                                >
                                  Settle
                                </button>
                              ) : row.status === "locked" && pretermByTdId[row.id]?.status === "pending" ? (
                                <span className="inline-flex px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold">
                                  Pre-term pending
                                </span>
                              ) : row.status === "locked" && pretermByTdId[row.id]?.status === "approved" ? (
                                <button
                                  type="button"
                                  disabled={pretermStatus === "submitting"}
                                  onClick={async () => {
                                    setPretermStatus("submitting");
                                    try {
                                      const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
                                      const response = await fetch(
                                        `${API_BASE_URL}/api/time-deposits/pre-termination-requests/${pretermByTdId[row.id].id}/execute`,
                                        { method: "POST", headers }
                                      );
                                      const payload = await response.json().catch(() => ({}));
                                      if (!response.ok || !payload.success) {
                                        throw new Error(payload.detail || "Unable to process the payout.");
                                      }
                                      addNotification("Pre-termination payout processed. Certificate closed.", "success");
                                      await Promise.all([refreshTimeDeposits(), fetchPretermRequests()]);
                                    } catch (err) {
                                      addNotification(err.message || "Unable to process the payout.", "error");
                                    } finally {
                                      setPretermStatus("idle");
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 h-7 px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-gray-300"
                                >
                                  Pay Out
                                </button>
                              ) : row.status === "locked" ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPretermTarget(row);
                                    setPretermReason("");
                                    setPretermError("");
                                    setPretermStatus("idle");
                                  }}
                                  className="inline-flex items-center gap-1 h-7 px-3 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-600 text-[11px] font-semibold transition-colors"
                                >
                                  Request Pre-termination
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {settleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">Settle Time Deposit</h3>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">{settleTarget.certificate_number}</p>
              </div>
              <button
                type="button"
                onClick={() => setSettleTarget(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm">
                <div className="flex justify-between py-0.5">
                  <span className="text-gray-500">Member</span>
                  <span className="font-semibold text-gray-900">{settleTarget.account_name}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-gray-500">Principal</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(settleTarget.principal)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-gray-500">Interest earned</span>
                  <span className="font-semibold text-emerald-700">{formatCurrency(settleTarget.expected_interest)}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">What does the member want to do?</p>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${settleMode === "FULL_PAYOUT" ? "border-green-600 bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}>
                    <input
                      type="radio"
                      name="settle-mode"
                      checked={settleMode === "FULL_PAYOUT"}
                      onChange={() => setSettleMode("FULL_PAYOUT")}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">Withdraw all</span>
                      <span className="block text-xs text-gray-500">
                        Pay out principal + interest earned ({formatCurrency(Number(settleTarget.principal || 0) + Number(settleTarget.expected_interest || 0))} total). Certificate closes.
                      </span>
                    </span>
                  </label>
                  <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${settleMode === "ROLL_PRINCIPAL_ONLY" ? "border-green-600 bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}>
                    <input
                      type="radio"
                      name="settle-mode"
                      checked={settleMode === "ROLL_PRINCIPAL_ONLY"}
                      onChange={() => setSettleMode("ROLL_PRINCIPAL_ONLY")}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">Withdraw interest, renew principal</span>
                      <span className="block text-xs text-gray-500">
                        Pay out {formatCurrency(settleTarget.expected_interest)} interest earned now; the original principal opens a new certificate.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              {settleMode === "ROLL_PRINCIPAL_ONLY" && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">New certificate term</p>
                  <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
                    {[180, 365].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setSettleTermDays(days)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${settleTermDays === days ? "bg-green-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                      >
                        {days === 180 ? "6 months" : "1 year"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {settleError && (
                <p className="text-xs font-medium text-red-600">{settleError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setSettleTarget(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={settleStatus === "submitting"}
                onClick={async () => {
                  setSettleStatus("submitting");
                  setSettleError("");
                  try {
                    const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
                    const response = await fetch(`${API_BASE_URL}/api/time-deposits/${settleTarget.id}/settle`, {
                      method: "POST",
                      headers,
                      body: JSON.stringify({
                        mode: settleMode,
                        new_term_days: settleMode === "ROLL_PRINCIPAL_ONLY" ? settleTermDays : null,
                      }),
                    });
                    const payload = await response.json().catch(() => ({}));
                    if (!response.ok || !payload.success) {
                      throw new Error(payload.detail || "Unable to settle the Time Deposit.");
                    }
                    addNotification(
                      settleMode === "FULL_PAYOUT"
                        ? "Time Deposit settled and closed."
                        : `Interest paid out; principal renewed into ${payload.data.new_certificate_number}.`,
                      "success"
                    );
                    setSettleTarget(null);
                    setSettleStatus("idle");
                    await refreshTimeDeposits();
                  } catch (err) {
                    setSettleError(err.message || "Unable to settle the Time Deposit.");
                    setSettleStatus("error");
                  }
                }}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {settleStatus === "submitting" ? "Processing..." : "Confirm Settlement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pretermTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">Request Pre-termination</h3>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">{pretermTarget.certificate_number}</p>
              </div>
              <button
                type="button"
                onClick={() => setPretermTarget(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                Closing this certificate before its maturity date reduces the interest paid and may include an admin fee set by the Bookkeeper. This request goes to the Bookkeeper for approval before any payout.
              </div>

              <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm">
                <div className="flex justify-between py-0.5">
                  <span className="text-gray-500">Member</span>
                  <span className="font-semibold text-gray-900">{pretermTarget.account_name}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-gray-500">Principal</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(pretermTarget.principal)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-gray-500">Maturity Date</span>
                  <span className="font-semibold text-gray-900">{formatDate(pretermTarget.maturity_date)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Reason for early closure</label>
                <textarea
                  value={pretermReason}
                  onChange={(event) => setPretermReason(event.target.value)}
                  rows={3}
                  placeholder="e.g. medical emergency, urgent family need..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {pretermError && (
                <p className="text-xs font-medium text-red-600">{pretermError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setPretermTarget(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pretermStatus === "submitting" || !pretermReason.trim()}
                onClick={async () => {
                  setPretermStatus("submitting");
                  setPretermError("");
                  try {
                    const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
                    const response = await fetch(
                      `${API_BASE_URL}/api/time-deposits/${pretermTarget.id}/pre-termination/request`,
                      {
                        method: "POST",
                        headers,
                        body: JSON.stringify({ reason: pretermReason.trim() }),
                      }
                    );
                    const payload = await response.json().catch(() => ({}));
                    if (!response.ok || !payload.success) {
                      throw new Error(payload.detail || "Unable to submit the request.");
                    }
                    addNotification("Pre-termination request sent to the Bookkeeper.", "success");
                    setPretermTarget(null);
                    setPretermStatus("idle");
                    await fetchPretermRequests();
                  } catch (err) {
                    setPretermError(err.message || "Unable to submit the request.");
                    setPretermStatus("error");
                  }
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {pretermStatus === "submitting" ? "Sending..." : "Send Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default Cashier_Savings;
