import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { treasurerNav } from "../../components/StaffSidebar/configs/treasurer";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowLeft,
  ArrowUpCircle,
  Banknote,
  Clock,
  RefreshCw,
  Wallet,
} from "lucide-react";

import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import { TableToolbar } from "../../components/TableToolbar";
import Pagination from "../../components/Pagination";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 10;

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `₱${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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

const useSavingsAccount = (accountParam) => {
  const [data, setData] = useState({ account: null, member: null, recent_ledger: [] });
  const [ledger, setLedger] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const fetchAccount = useCallback(async () => {
    if (!accountParam) return;
    setStatus("loading");
    setError(null);
    try {
      const [accountRes, ledgerRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/savings/accounts/${encodeURIComponent(accountParam)}`),
        fetch(
          `${API_BASE_URL}/api/savings/accounts/${encodeURIComponent(accountParam)}/ledger?limit=100`
        ),
      ]);
      const accountJson = await accountRes.json().catch(() => ({}));
      const ledgerJson = await ledgerRes.json().catch(() => ({}));

      if (!accountRes.ok || !accountJson?.success) {
        throw new Error(accountJson?.detail || "Failed to load savings account.");
      }
      setData(accountJson.data || { account: null, member: null, recent_ledger: [] });
      setLedger(Array.isArray(ledgerJson?.data) ? ledgerJson.data : []);
      setStatus("ready");
    } catch (err) {
      setError(err?.message || "Unable to fetch savings account.");
      setStatus("error");
    }
  }, [accountParam]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  return { data, ledger, status, error, refresh: fetchAccount };
};

// Read-only account detail + ledger — no Deposit/Withdraw actions. Treasurer
// oversight only; those writes stay Cashier's (initiate) and Bookkeeper's
// (verify) responsibility.
const Treasurer_Savings_Details = () => {
  const { id: accountParam } = useParams();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const { data, ledger, status, error, refresh } = useSavingsAccount(accountParam);
  const [ledgerPage, setLedgerPage] = useState(1);

  const account = data?.account;
  const member = data?.member;
  const balance = Number(account?.balance || 0);

  const memberName = member
    ? [member.first_name, member.middle_name, member.last_name]
        .map((p) => String(p || "").trim())
        .filter(Boolean)
        .join(" ")
    : null;

  const ledgerTotalPages = Math.max(1, Math.ceil(ledger.length / PAGE_SIZE));
  const paginatedLedger = useMemo(() => {
    const start = (ledgerPage - 1) * PAGE_SIZE;
    return ledger.slice(start, start + PAGE_SIZE);
  }, [ledger, ledgerPage]);

  // Reset to page 1 whenever a fresh ledger loads, adjusted during render
  // rather than in an effect (avoids the extra render-then-reset cascade).
  const [prevLedgerLength, setPrevLedgerLength] = useState(ledger.length);
  if (ledger.length !== prevLedgerLength) {
    setPrevLedgerLength(ledger.length);
    setLedgerPage(1);
  }

  const ledgerTotals = useMemo(() => {
    let credits = 0;
    let debits = 0;
    ledger.forEach((entry) => {
      const amt = Number(entry.amount || 0);
      if (entry.entry_type === "credit") credits += amt;
      else debits += amt;
    });
    return { credits, debits, count: ledger.length };
  }, [ledger]);

  const handleRefresh = async () => {
    await refresh();
    addNotification("Account refreshed.", "success");
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Treasurer" items={treasurerNav} />

      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Treasurer" notifications={<LoanNotificationBell role="treasurer" />} />

        <main className="p-8 overflow-auto">
          <button
            onClick={() => navigate("/treasurer-savings-accounts")}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-green-700 mb-4 transition"
          >
            <ArrowLeft size={16} />
            Back to Savings Accounts
          </button>

          {status === "loading" ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
              <Clock size={16} />
              Loading account details...
            </div>
          ) : status === "error" ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 flex flex-col items-center gap-3">
              <AlertCircle className="text-red-500" size={32} />
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={refresh}
                className="flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 transition"
              >
                <RefreshCw size={16} /> Try again
              </button>
            </div>
          ) : !account ? null : (
            <>
              <div className="mb-8">
                <Breadcrumb portal="Treasurer" page="Account Details" />
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h1 className="text-3xl font-bold text-gray-900">{account.account_name}</h1>
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${getKindStyle(account.account_kind)}`}
                      >
                        {account.account_kind === "standalone" ? "Standalone" : "Member"}
                      </span>
                      <span
                        className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold ${getStatusStyle(account.status)}`}
                      >
                        {String(account.status || "active").toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      <span className="font-mono">{account.account_number}</span>
                      {memberName ? (
                        <>
                          {" · "}
                          <span className="text-gray-700">{memberName}</span>
                          {member?.membership_id ? (
                            <span className="text-gray-400"> ({member.membership_id})</span>
                          ) : null}
                        </>
                      ) : null}
                      {account.legacy_savings_id ? (
                        <>
                          {" · "}
                          <span className="text-gray-400">
                            Legacy ref: <span className="font-mono">{account.legacy_savings_id}</span>
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                  >
                    <RefreshCw size={16} />
                    Refresh
                  </button>
                </div>

                <StatCardRow cols={4}>
                  <StatCard
                    className="md:col-span-2"
                    label="Available Balance"
                    value={formatCurrency(balance)}
                    icon={Wallet}
                    iconColor="text-green-600"
                    subtext={`Last updated ${formatDateTime(account.updated_at)}`}
                  />
                  <StatCard
                    label="Total Credits"
                    value={formatCurrency(ledgerTotals.credits)}
                    icon={ArrowDownCircle}
                    iconColor="text-emerald-600"
                    subtext="Across all deposits"
                  />
                  <StatCard
                    label="Total Debits"
                    value={formatCurrency(ledgerTotals.debits)}
                    icon={ArrowUpCircle}
                    iconColor="text-rose-600"
                    subtext="Across all withdrawals"
                  />
                </StatCardRow>
              </div>

              <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <TableToolbar
                  title="Transaction Ledger"
                  subtitle={`${ledger.length} entr${ledger.length === 1 ? "y" : "ies"} · newest first`}
                />

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                        <th className="p-5 font-bold">Posted</th>
                        <th className="p-5 font-bold">Type</th>
                        <th className="p-5 font-bold text-right">Amount</th>
                        <th className="p-5 font-bold text-right">Running Balance</th>
                        <th className="p-5 font-bold">Reference</th>
                        <th className="p-5 font-bold">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-10 text-center">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Banknote size={32} className="text-gray-300" />
                              <p className="text-sm font-medium text-gray-500">
                                No transactions yet on this account
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedLedger.map((entry) => {
                          const isCredit = entry.entry_type === "credit";
                          return (
                            <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                              <td className="p-5 text-sm text-gray-600">
                                {formatDateTime(entry.posted_at)}
                              </td>
                              <td className="p-5">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                    isCredit
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-rose-50 text-rose-700 border border-rose-200"
                                  }`}
                                >
                                  {isCredit ? (
                                    <ArrowDownCircle size={12} />
                                  ) : (
                                    <ArrowUpCircle size={12} />
                                  )}
                                  {isCredit ? "Credit" : "Debit"}
                                </span>
                              </td>
                              <td
                                className={`p-5 text-right text-sm font-semibold ${
                                  isCredit ? "text-emerald-700" : "text-rose-700"
                                }`}
                              >
                                {isCredit ? "+" : "−"}
                                {formatCurrency(entry.amount)}
                              </td>
                              <td className="p-5 text-right text-sm font-medium text-gray-900">
                                {formatCurrency(entry.running_balance)}
                              </td>
                              <td className="p-5 text-xs text-gray-500 font-mono">
                                {entry.reference || "—"}
                              </td>
                              <td className="p-5 text-xs text-gray-600">
                                {entry.remarks || entry.source || "—"}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {ledger.length > 0 && (
                  <Pagination
                    page={ledgerPage}
                    totalPages={ledgerTotalPages}
                    onChange={setLedgerPage}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default Treasurer_Savings_Details;
