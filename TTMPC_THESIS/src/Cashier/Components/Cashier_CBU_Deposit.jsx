import React, { useEffect, useState } from "react";
import { useNavigate, NavLink, useParams } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import { UserAuth } from "../../contex/AuthContext";
import { useConfirm } from "../../contex/ConfirmContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import {
  LayoutDashboard,
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Wallet,
  Calculator,
  ReceiptText,
  CheckCircle2,
  UserPlus,
  ArrowUpRight,
  Send,
  PiggyBank,
  ArrowDownLeft,
  ShoppingCart,
  History,
} from "lucide-react";


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const SHARE_VALUE = 1000;
const STARTING_CAPITAL = 0;

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const Cashier_CBU_Deposit = () => {
    const confirm = useConfirm();
  const navigate = useNavigate();
  const { memberId } = useParams();
  const [selectedMember, setSelectedMember] = useState(null);
  const [loadingMember, setLoadingMember] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [depositAmount, setDepositAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [statusMessage, setStatusMessage] = useState("");



  const currentBalance = selectedMember
    ? selectedMember.is_new_member
      ? 0
      : Number(selectedMember.current_balance || 0)
    : 0;
  const amount = Number(depositAmount || 0);
  const totalBalance = currentBalance + (Number.isFinite(amount) ? Math.max(amount, 0) : 0);
  const totalShares = totalBalance / SHARE_VALUE;

  const loadMember = async () => {
    if (!memberId) return;
    setLoadingMember(true);
    setLoadError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/cashier/cbu/members/${encodeURIComponent(memberId)}`,
        { method: "GET", headers: { Accept: "application/json" } }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.message || "Failed to load selected member.");
      }
      setSelectedMember(payload.data || null);
    } catch (err) {
      setLoadError(err?.message || "Unable to load selected member.");
      setSelectedMember(null);
    } finally {
      setLoadingMember(false);
    }
  };

  useEffect(() => {
    loadMember();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  // Live preview of the resulting balance. Non-numeric or negative input
  // reads as 0 so the panel shows a dash rather than NaN.
  const parsedAmount = Math.max(0, Number(depositAmount) || 0);

  const handleSubmit = async () => {
    if (!selectedMember) {
      setStatusMessage("Selected member not found. Go back and pick a member from the list.");
      return;
    }
    if (!(amount > 0) || !paymentMode.trim() || !transactionDate) {
      setStatusMessage("Please complete required fields: Deposit Amount, Payment Mode, and Transaction Date.");
      return;
    }

    const memberLabel = selectedMember.full_name || selectedMember.member_name || selectedMember.membership_id || "this member";
    const ok = await confirm({
      title: "Record CBU Deposit",
      message: `Record a CBU deposit of ${formatCurrency(amount)} to ${memberLabel}? This will credit the member's Capital Build-Up ledger immediately and cannot be undone without a reversing entry.`,
      confirmLabel: "Record Deposit",
      tone: "default",
    });
    if (!ok) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/cashier/cbu/deposits`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          member_id: selectedMember.member_uuid || selectedMember.member_id,
          deposit_amount: amount,
          deposit_account: paymentMode,
          // Use a millisecond-precise timestamp anchored to the chosen calendar
          // date so two deposits on the same day still order correctly. The
          // date picker controls the accounting day; the time component keeps
          // each row uniquely sortable.
          transaction_date: (() => {
            const now = new Date();
            const [yyyy, mm, dd] = transactionDate.split('-').map(Number);
            const stamped = new Date(now);
            if (yyyy && mm && dd) {
              stamped.setFullYear(yyyy, mm - 1, dd);
            }
            return stamped.toISOString();
          })(),
          // Let the backend assign the deposit_id (server uses build_cbu_deposit_id + the
          // BEFORE-INSERT trigger). Passing a fixed value here causes the second deposit
          // to collide with the first.
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.message || "Failed to submit CBU deposit.");
      }

      const returnedId = payload?.data?.cbu_deposit_id || "—";
      setStatusMessage(`CBU deposit recorded successfully. Deposit ID: ${returnedId}.`);
      setDepositAmount("");
      // Refetch member so current_balance reflects the new ending_share_capital.
      await loadMember();
    } catch (err) {
      setStatusMessage(err?.message || "Failed to submit CBU deposit.");
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <StaffSidebar portal="Cashier" items={cashierNav} />

      <div className="flex-1 flex flex-col min-w-0">
        <StaffTopbar portal="Cashier" notifications={<LoanNotificationBell role="cashier" />} />

        <main className="p-8 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <Breadcrumb portal="Cashier" page="CBU Deposit Entry" />
            <h1 className="text-2xl font-bold text-[#1F3E35]">CBU Deposit Entry</h1>
            <button
              type="button"
              onClick={() => navigate("/Cashier_CBU")}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Members
            </button>
          </div>

          {loadingMember && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Loading selected member details...
            </div>
          )}

          {!!loadError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">
                  Depositing for
                </p>
                <p className="text-xl font-extrabold text-[#1F3E35] leading-tight">
                  {selectedMember?.member_name || "—"}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {selectedMember?.member_id || "—"}
                  {/* "Starting Point: Existing Capital" said nothing a cashier
                      could act on. Whether this is the member's first deposit
                      is the part that actually matters. */}
                  {selectedMember?.is_new_member && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                      First deposit
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">
                  Share capital today
                </p>
                <p className="text-2xl font-extrabold text-[#1F3E35] tabular-nums">
                  {formatCurrency(currentBalance)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-[#1F3E35] mb-1">Record a deposit</h3>
            <p className="text-sm text-gray-500 mb-5">
              This adds to {selectedMember?.member_name || "the member"}&apos;s share capital.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-2 block">
                  Amount received
                </label>
                <div className="flex items-stretch h-11 rounded-lg border border-gray-300 bg-gray-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary overflow-hidden">
                  <span className="flex items-center px-3 text-sm font-semibold text-gray-500 bg-gray-100 border-r border-gray-200">
                    &#8369;
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={depositAmount}
                    onChange={(event) => setDepositAmount(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent px-3 text-sm focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-2 block">
                  Paid by
                </label>
                <select
                  value={paymentMode}
                  onChange={(event) => setPaymentMode(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 h-11 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="Cash">Cash</option>
                  <option value="GCash">GCash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-2 block">
                  Date received
                </label>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(event) => setTransactionDate(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 h-11 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* The resulting balance was previously invisible until AFTER
                submitting — the one number the cashier most needs to sanity-check
                against the member's passbook. Shown live, before committing. */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden mb-5">
              <div className="grid grid-cols-3 divide-x divide-gray-200">
                <div className="px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-1">
                    Current
                  </p>
                  <p className="text-sm font-semibold text-gray-700 tabular-nums">
                    {formatCurrency(currentBalance)}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-1">
                    Deposit
                  </p>
                  <p className="text-sm font-semibold text-gray-700 tabular-nums">
                    {parsedAmount > 0 ? `+ ${formatCurrency(parsedAmount)}` : "—"}
                  </p>
                </div>
                <div className="px-4 py-3 bg-white">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-1">
                    New balance
                  </p>
                  <p className={`text-base font-extrabold tabular-nums ${parsedAmount > 0 ? "text-primary-deep" : "text-gray-400"}`}>
                    {parsedAmount > 0 ? formatCurrency(currentBalance + parsedAmount) : "—"}
                  </p>
                </div>
              </div>
            </div>

            {statusMessage && parsedAmount > 0 && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 mb-5 text-sm text-gray-700 flex items-start gap-2">
                <Calculator className="w-4 h-4 mt-0.5 text-primary" />
                <span>{statusMessage}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                className="bg-primary-deep hover:bg-member-green text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
              >
                <ReceiptText className="w-4 h-4" /> Submit CBU Deposit
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Cashier_CBU_Deposit;




