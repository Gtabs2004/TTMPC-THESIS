import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpCircle,
  ArrowUpRight,
  Banknote,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutDashboard,
  PiggyBank,
  Printer,
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

  const submitTransaction = useCallback(
    async (kind, amount) => {
      const accountNumber = data?.account?.account_number;
      if (!accountNumber) throw new Error("Account not loaded.");
      const url = `${API_BASE_URL}/api/savings/accounts/${encodeURIComponent(
        accountNumber
      )}/${kind}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || `Failed to post ${kind}.`);
      }
      return result;
    },
    [data]
  );

  return { data, ledger, status, error, refresh: fetchAccount, submitTransaction };
};

const Savings_Details = () => {
  const { id: accountParam } = useParams();
  const navigate = useNavigate();
  const { signOut } = UserAuth();
  const { addNotification } = useNotification();

  const { data, ledger, status, error, refresh, submitTransaction } =
    useSavingsAccount(accountParam);

  const [isDepositsOpen, setIsDepositsOpen] = useState(true);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [depositBusy, setDepositBusy] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [depositError, setDepositError] = useState(null);
  const [withdrawError, setWithdrawError] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
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

  useEffect(() => setLedgerPage(1), [ledger.length]);

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
    addNotification("Account refreshed.", "success");
  };

  // TODO: PRINT-RECEIPT-OVERLAY
  // Placeholder for overlay printing onto the cooperative's pre-printed bond-paper
  // receipts. Plan: backend endpoint generates a PDF with ONLY the variable fields
  // (member name, amount, date, signatures) positioned at exact mm coordinates that
  // match the empty fields on the printed form. See: receipt template handoff.
  const handlePrintReceipt = (entry) => {
    addNotification(
      entry
        ? `Print receipt for ${entry.reference || entry.id} — coming soon.`
        : "Print receipt — coming soon. Awaiting bond-paper template from cooperative.",
      "info"
    );
  };

  const openDepositModal = () => {
    setDepositAmount("");
    setDepositError(null);
    setShowDepositModal(true);
  };

  const openWithdrawModal = () => {
    setWithdrawAmount("");
    setWithdrawError(null);
    setShowWithdrawModal(true);
  };

  const handleDeposit = async () => {
    const numeric = Number(depositAmount);
    setDepositError(null);
    if (!numeric || numeric <= 0) {
      setDepositError("Enter a deposit amount greater than zero.");
      return;
    }
    setDepositBusy(true);
    try {
      await submitTransaction("deposit", numeric);
      setFeedbackMessage(`Deposit of ${formatCurrency(numeric)} posted successfully.`);
      addNotification(`Deposit of ${formatCurrency(numeric)} posted.`, "success");
      setShowDepositModal(false);
      setDepositAmount("");
      await refresh();
    } catch (err) {
      setDepositError(err?.message || "Failed to post deposit.");
    } finally {
      setDepositBusy(false);
    }
  };

  const handleWithdraw = async () => {
    const numeric = Number(withdrawAmount);
    setWithdrawError(null);
    if (!numeric || numeric <= 0) {
      setWithdrawError("Enter a withdrawal amount greater than zero.");
      return;
    }
    if (numeric > balance) {
      setWithdrawError("Withdrawal exceeds the available balance.");
      return;
    }
    setWithdrawBusy(true);
    try {
      await submitTransaction("withdraw", numeric);
      setFeedbackMessage(
        `Withdrawal of ${formatCurrency(numeric)} submitted for Bookkeeper verification.`
      );
      addNotification(
        `Withdrawal of ${formatCurrency(numeric)} submitted for verification.`,
        "info"
      );
      setShowWithdrawModal(false);
      setWithdrawAmount("");
      await refresh();
    } catch (err) {
      setWithdrawError(err?.message || "Failed to submit withdrawal.");
    } finally {
      setWithdrawBusy(false);
    }
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
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 pl-9 py-1 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
          </button>
          <PortalTopbarIdentity className="ml-4 font-medium text-gray-700" fallbackRole="Cashier" />
        </header>

        <main className="p-8 overflow-auto">
          {/* BACK + TITLE */}
          <button
            onClick={() => navigate("/Cashier_Savings")}
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
              {/* TITLE BLOCK */}
              <div className="mb-8">
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

                {feedbackMessage && (
                  <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    {feedbackMessage}
                  </div>
                )}

                {/* SUMMARY CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-500">Available Balance</p>
                      <Wallet className="w-5 h-5 text-green-600" />
                    </div>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {formatCurrency(balance)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Last updated {formatDateTime(account.updated_at)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-500">Total Credits</p>
                      <ArrowDownCircle className="w-5 h-5 text-emerald-600" />
                    </div>
                    <p className="text-2xl font-bold text-emerald-700 mt-2">
                      {formatCurrency(ledgerTotals.credits)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Across all deposits</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-500">Total Debits</p>
                      <ArrowUpCircle className="w-5 h-5 text-rose-600" />
                    </div>
                    <p className="text-2xl font-bold text-rose-700 mt-2">
                      {formatCurrency(ledgerTotals.debits)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Across all withdrawals</p>
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={openDepositModal}
                    disabled={account.status !== "active"}
                    className="flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowDownCircle size={16} />
                    Record Deposit
                  </button>
                  <button
                    onClick={openWithdrawModal}
                    disabled={account.status !== "active" || balance <= 0}
                    className="flex items-center gap-2 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-semibold px-5 py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowUpCircle size={16} />
                    Request Withdrawal
                  </button>

                  {/* TODO: PRINT-RECEIPT-OVERLAY — labeled stub, find via grep "PRINT-RECEIPT" */}
                  <button
                    onClick={() => handlePrintReceipt(null)}
                    className="flex items-center gap-2 rounded-lg border-2 border-dashed border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-5 py-2.5 text-sm transition-colors"
                    title="PRINT-RECEIPT-OVERLAY · Coming soon"
                  >
                    <Printer size={16} />
                    Print Receipt
                    <span className="ml-1 text-[10px] uppercase tracking-wider bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded-full">
                      Soon
                    </span>
                  </button>
                </div>
              </div>

              {/* LEDGER TABLE */}
              <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Transaction Ledger</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {ledger.length} entr{ledger.length === 1 ? "y" : "ies"} · newest first
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#66B538] text-white uppercase text-[13px] tracking-wider">
                      <tr>
                        <th className="px-6 py-4 text-left font-semibold">Posted</th>
                        <th className="px-6 py-4 text-left font-semibold">Type</th>
                        <th className="px-6 py-4 text-right font-semibold">Amount</th>
                        <th className="px-6 py-4 text-right font-semibold">Running Balance</th>
                        <th className="px-6 py-4 text-left font-semibold">Reference</th>
                        <th className="px-6 py-4 text-left font-semibold">Remarks</th>
                        <th className="px-6 py-4 text-center font-semibold">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ledger.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <Banknote size={32} className="text-gray-300" />
                              <p className="text-sm text-gray-500">
                                No transactions yet on this account
                              </p>
                              <p className="text-xs text-gray-400">
                                The first deposit or withdrawal will appear here.
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedLedger.map((entry) => {
                          const isCredit = entry.entry_type === "credit";
                          return (
                            <tr key={entry.id} className="hover:bg-gray-50 transition">
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {formatDateTime(entry.posted_at)}
                              </td>
                              <td className="px-6 py-4">
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
                                className={`px-6 py-4 text-right text-sm font-semibold ${
                                  isCredit ? "text-emerald-700" : "text-rose-700"
                                }`}
                              >
                                {isCredit ? "+" : "−"}
                                {formatCurrency(entry.amount)}
                              </td>
                              <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                                {formatCurrency(entry.running_balance)}
                              </td>
                              <td className="px-6 py-4 text-xs text-gray-500 font-mono">
                                {entry.reference || "—"}
                              </td>
                              <td className="px-6 py-4 text-xs text-gray-600">
                                {entry.remarks || entry.source || "—"}
                              </td>
                              {/* TODO: PRINT-RECEIPT-OVERLAY · per-entry reprint */}
                              <td className="px-6 py-4 text-center">
                                <button
                                  onClick={() => handlePrintReceipt(entry)}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors"
                                  title="PRINT-RECEIPT-OVERLAY · Coming soon"
                                >
                                  <Printer size={14} />
                                </button>
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

      {/* DEPOSIT MODAL */}
      {showDepositModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Record Deposit</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Posts immediately to {account?.account_number}
                </p>
              </div>
              <button
                onClick={() => setShowDepositModal(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700">Amount (₱)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={depositAmount}
                onChange={(event) => setDepositAmount(event.target.value)}
                placeholder="0.00"
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-lg font-semibold focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200 transition"
              />
            </label>
            {depositError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle size={14} />
                {depositError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDepositModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeposit}
                disabled={depositBusy}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {depositBusy ? "Posting..." : "Post Deposit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAW MODAL */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Request Withdrawal</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Sent to Bookkeeper for verification before posting
                </p>
              </div>
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700">Amount (₱)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                placeholder="0.00"
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-lg font-semibold focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200 transition"
              />
              <p className="text-xs text-gray-500 mt-1">
                Available balance: {formatCurrency(balance)}
              </p>
            </label>
            {withdrawError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle size={14} />
                {withdrawError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={withdrawBusy}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {withdrawBusy ? "Submitting..." : "Submit Withdrawal"}
              </button>
            </div>
          </div>
        </div>
      )}
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

export default Savings_Details;
