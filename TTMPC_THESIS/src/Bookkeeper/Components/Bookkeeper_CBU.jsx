import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtimeRefetch } from "../../hooks/useRealtimeRefetch";
import { RT } from "../../lib/realtimeSync";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Clock,
  RefreshCw,
  Search,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import { TableToolbar } from "../../components/TableToolbar";
import TableStateRow from "../../components/TableStateRow";
import Pagination from "../../components/Pagination";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 10;

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
};

const isSameMonth = (value, ref) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === ref.getFullYear() && date.getMonth() === ref.getMonth();
};

// Same two endpoints the Cashier CBU page uses. The backend talks to
// Supabase with the service-role key, so this read-only bookkeeper view does
// not depend on the `is_cbu_staff()` RLS policy (that only gates direct
// browser-side Supabase calls, which this page never makes).
const useCbuLedger = () => {
  const [members, setMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const fetchCbu = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus("loading");
    if (!silent) setError(null);
    try {
      const [membersRes, txRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/cashier/cbu/members`, { headers: { Accept: "application/json" } }),
        fetch(`${API_BASE_URL}/api/cashier/cbu/transactions`, { headers: { Accept: "application/json" } }),
      ]);

      const membersPayload = await membersRes.json().catch(() => ({}));
      const txPayload = await txRes.json().catch(() => ({}));

      if (!membersRes.ok || !membersPayload?.success) {
        throw new Error(membersPayload?.detail || "Failed to load CBU members.");
      }
      if (!txRes.ok || !txPayload?.success) {
        throw new Error(txPayload?.detail || "Failed to load CBU transactions.");
      }

      setMembers(Array.isArray(membersPayload.data) ? membersPayload.data : []);
      setTransactions(Array.isArray(txPayload.data) ? txPayload.data : []);
      setStatus("ready");
    } catch (err) {
      if (silent) return;
      setError(err?.message || "Unable to load CBU data.");
      setMembers([]);
      setTransactions([]);
      setStatus("error");
    }
  }, []);
  useRealtimeRefetch([...RT.CBU, ...RT.MEMBERS], () => fetchCbu({ silent: true }));

  useEffect(() => {
    fetchCbu();
  }, [fetchCbu]);

  return { members, transactions, status, error, refresh: fetchCbu };
};

// Modal that "explodes" one transaction from the Recent CBU Transactions table.
// The row itself only carries reference / member / type / amount / date, so the
// member's own ledger is fetched for the balance before and after this entry
// and for the entries around it. (The all-members list is capped by the
// server, so the history comes from its own per-member endpoint.)
const CbuTransactionModal = ({ tx, onClose }) => {
  const [history, setHistory] = useState([]);
  const [loadState, setLoadState] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/cashier/cbu/members/${encodeURIComponent(tx.member_id)}/history`,
          { headers: { Accept: "application/json" } }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.success) throw new Error(body?.detail || "Failed to load history.");
        if (!cancelled) {
          setHistory(Array.isArray(body.data?.transactions) ? body.data.transactions : []);
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [tx.member_id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const entry = history.find((h) => h.cbu_deposit_id && h.cbu_deposit_id === tx.cbu_deposit_id);
  const others = history.filter((h) => h !== entry).slice(0, 5);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="CBU transaction details"
        className="w-full max-w-lg max-h-[88vh] overflow-hidden flex flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-primary-deep px-6 pb-6 pt-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold">{tx.member_name}</h3>
              <p className="mt-0.5 text-sm text-white/75">
                <span className="font-mono">{tx.member_id}</span>
                <span className="mx-2 text-white/40">·</span>
                <span className="font-mono">{tx.cbu_deposit_id}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1.5 rounded-md p-1.5 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-5 text-sm text-white/75">Amount added</p>
          <p className="mt-0.5 text-4xl font-bold tabular-nums">{formatCurrency(tx.capital_added)}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 py-5">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500">Balance before</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-gray-700">
                {entry ? formatCurrency(entry.starting_balance) : "—"}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-300" aria-hidden="true" />
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-xs text-green-700/80">Balance after</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-green-800">
                {entry ? formatCurrency(entry.ending_balance) : "—"}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-gray-100 px-6 py-5">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Type</dt>
              <dd className="mt-1">
                <span className="inline-flex rounded-md bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                  {tx.deposit_account}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Date</dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900">{formatDate(tx.transaction_date)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</dt>
              <dd className="mt-1 text-sm font-semibold capitalize text-gray-900">{String(tx.status || "verified").toLowerCase()}</dd>
            </div>
          </dl>

          <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-5">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Other recent entries for this member
            </p>
            {loadState === "loading" ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-200/70" />
                ))}
              </div>
            ) : loadState === "error" ? (
              <p className="text-xs text-red-600">Could not load this member's other entries.</p>
            ) : others.length === 0 ? (
              <p className="text-xs text-gray-500">No other CBU entries for this member.</p>
            ) : (
              <ul className="space-y-2">
                {others.map((h, i) => (
                  <li
                    key={h.cbu_deposit_id || i}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{formatDate(h.transaction_date)}</p>
                      <p className="truncate text-[11px] text-gray-400">{h.deposit_account}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-800">
                      +{formatCurrency(h.capital_added)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Bookkeeper_CBU = () => {
  const { addNotification } = useNotification();
  const { members, transactions, status, error, refresh } = useCbuLedger();

  const [memberSearch, setMemberSearch] = useState("");
  const [memberPage, setMemberPage] = useState(1);
  const [txPage, setTxPage] = useState(1);
  const [selectedTx, setSelectedTx] = useState(null);

  const totals = useMemo(() => {
    const now = new Date();
    const totalBalance = members.reduce((sum, m) => sum + Number(m.current_balance || 0), 0);
    const monthContributions = transactions
      .filter((t) => isSameMonth(t.transaction_date, now))
      .reduce((sum, t) => sum + Number(t.capital_added || 0), 0);
    return { totalBalance, monthContributions };
  }, [members, transactions]);

  const filteredMembers = useMemo(() => {
    const key = memberSearch.trim().toLowerCase();
    if (!key) return members;
    return members.filter(
      (row) =>
        String(row.member_id || "").toLowerCase().includes(key) ||
        String(row.member_name || "").toLowerCase().includes(key)
    );
  }, [memberSearch, members]);

  const totalMemberPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const paginatedMembers = useMemo(() => {
    const start = (memberPage - 1) * PAGE_SIZE;
    return filteredMembers.slice(start, start + PAGE_SIZE);
  }, [filteredMembers, memberPage]);

  const totalTxPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const paginatedTx = useMemo(() => {
    const start = (txPage - 1) * PAGE_SIZE;
    return transactions.slice(start, start + PAGE_SIZE);
  }, [transactions, txPage]);

  useEffect(() => setMemberPage(1), [memberSearch, members]);
  useEffect(() => setTxPage(1), [transactions]);

  const handleRefresh = async () => {
    await refresh();
    addNotification("CBU ledger refreshed.", "success");
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        <main className="animate-page-in p-6">
          <div className="mb-6 ">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Capital Build-Up</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Read-only ledger of member CBU/share balances and contributions
                </p>
              </div>
              <button
                onClick={handleRefresh}
                className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
              >
                <RefreshCw size={13} />
                Refresh
              </button>
            </div>

            <StatCardRow cols={3}>
              <StatCard
                label="Total CBU Balance"
                value={formatCurrency(totals.totalBalance)}
                icon={Wallet}
                iconColor="text-green-600"
                subtext={`Across ${members.length} member accounts`}
              />
              <StatCard
                label="Member Accounts"
                value={members.length}
                icon={Users}
                iconColor="text-emerald-600"
                subtext="With a recorded CBU balance"
              />
              <StatCard
                label="This Month's Contributions"
                value={formatCurrency(totals.monthContributions)}
                icon={Banknote}
                iconColor="text-amber-600"
                subtext="Capital added in the current month"
              />
            </StatCardRow>

            {status === "loading" && (
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
                <Clock size={13} />
                Loading CBU ledger...
              </div>
            )}

            {status === "error" && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle size={13} />
                {error}
              </div>
            )}

          </div>

          {/* MEMBER BALANCES */}
          <div className="border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white mb-8">
            <TableToolbar
              title="Member Accounts"
              subtitle={`Showing ${paginatedMembers.length} of ${filteredMembers.length} accounts`}
            >
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="Search by Member ID or Name"
                  className="w-full bg-white h-8 rounded-lg border border-gray-200 pl-8 pr-3 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
                />
              </div>
            </TableToolbar>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Member ID</th>
                    <th className="p-5 font-bold">Member Name</th>
                    <th className="p-5 font-bold text-right">Current Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {status === "loading" ? (
                    <TableStateRow colSpan={3} variant="loading" label="Loading..." />
                  ) : paginatedMembers.length === 0 ? (
                    <TableStateRow
                      colSpan={3}
                      variant="empty"
                      icon={AlertCircle}
                      label="No member accounts matched your search."
                    />
                  ) : (
                    paginatedMembers.map((member) => (
                      <tr
                        key={member.member_uuid || member.member_id}
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="p-5 text-sm font-mono text-gray-600">{member.member_id}</td>
                        <td className="p-5 text-sm font-semibold text-gray-900">{member.member_name}</td>
                        <td className="p-5 text-sm font-semibold text-gray-700 text-right tabular-nums">
                          {formatCurrency(member.current_balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filteredMembers.length > 0 && (
              <Pagination page={memberPage} totalPages={totalMemberPages} onChange={setMemberPage} />
            )}
          </div>

          {/* TRANSACTION LEDGER */}
          <div className="border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white">
            <TableToolbar
              title="Recent CBU Transactions"
              subtitle={`Showing ${paginatedTx.length} of ${transactions.length} transactions`}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Reference</th>
                    <th className="p-5 font-bold">Member</th>
                    <th className="p-5 font-bold">Type</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {status === "loading" ? (
                    <TableStateRow colSpan={5} variant="loading" label="Loading..." />
                  ) : paginatedTx.length === 0 ? (
                    <TableStateRow
                      colSpan={5}
                      variant="empty"
                      icon={AlertCircle}
                      label="No CBU transactions recorded yet."
                    />
                  ) : (
                    paginatedTx.map((tx, idx) => (
                      <tr
                        key={tx.cbu_deposit_id || idx}
                        role="button"
                        tabIndex={0}
                        aria-label={`View details for ${tx.cbu_deposit_id}`}
                        onClick={() => setSelectedTx(tx)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedTx(tx);
                          }
                        }}
                        className="cursor-pointer border-b border-gray-100 hover:bg-gray-50/50 focus:outline-none focus-visible:bg-green-50 transition-colors"
                      >
                        <td className="p-5 text-sm font-mono text-gray-600">{tx.cbu_deposit_id}</td>
                        <td className="p-5 text-sm">
                          <p className="text-gray-900 font-medium">{tx.member_name}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{tx.member_id}</p>
                        </td>
                        <td className="p-5 text-sm text-gray-600">{tx.deposit_account}</td>
                        <td className="p-5 text-sm font-semibold text-gray-700 text-right tabular-nums">
                          {formatCurrency(tx.capital_added)}
                        </td>
                        <td className="p-5 text-sm text-gray-600">{formatDate(tx.transaction_date)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {transactions.length > 0 && (
              <Pagination page={txPage} totalPages={totalTxPages} onChange={setTxPage} />
            )}
          </div>
        </main>
      </div>
      {selectedTx && <CbuTransactionModal tx={selectedTx} onClose={() => setSelectedTx(null)} />}
    </div>
  );
};


export default Bookkeeper_CBU;
