  import React, { useEffect, useMemo, useState } from "react";
import { authHeaders } from "../../utils/authHeaders";
import { useNavigate, NavLink } from "react-router-dom";
import { useRealtimeRefetch } from "../../hooks/useRealtimeRefetch";
import { RT } from "../../lib/realtimeSync";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { useConfirm } from "../../contex/ConfirmContext";
import ConfirmDialog from "../../components/ConfirmDialog";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import { TableToolbar } from "../../components/TableToolbar";
import TableActionButton from "../../components/TableActionButton";
import TableStateRow from "../../components/TableStateRow";
import {
  LayoutDashboard,
  Users,
  FileText,
  Calculator,
  Activity,
  BarChart3,
  History,
  Wallet,
  Search,
  Bell,
  CheckCircle,
  XCircle,
  RefreshCw,
  Briefcase,
  Coins,
  Printer,
  PiggyBank,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Brain,
} from "lucide-react";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `\u20B1${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-US");
};

const getStatusStyle = (status) => {
  const key = String(status || "").toLowerCase();
  if (key === "pending_verification") return "bg-amber-100 text-amber-800";
  if (key === "validated" || key === "approved" || key === "executed") return "bg-green-100 text-green-800";
  if (key === "rejected") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
};

// Normalizes both row shapes (savings withdrawal queue rows and TD
// pre-termination requests) into one display shape so a single table and
// tab set can show either kind side by side, per the Bookkeeper's request
// to handle both approval queues in one place.
const normalizeSavingsRow = (row) => ({
  kind: "savings",
  key: `savings-${row.transaction_id}`,
  id: row.transaction_id,
  memberLabel: row.member_name || "Unknown Member",
  refLabel: row.savings_id,
  typeLabel: row.account_type || row.transaction_type,
  amount: row.amount,
  requestedAt: row.requested_at,
  status: String(row.transaction_status || "").toLowerCase(),
  raw: row,
});

const normalizePretermRow = (row) => ({
  kind: "preterm",
  key: `preterm-${row.id}`,
  id: row.id,
  memberLabel: row.time_deposit?.account_name || "Unknown Member",
  refLabel: row.time_deposit?.certificate_number || row.time_deposit_id,
  typeLabel: "TD Pre-termination",
  amount: row.total_payout ?? null,
  requestedAt: row.requested_at,
  status: row.status === "pending" ? "pending_verification" : row.status,
  raw: row,
});

const BookkeeperSavingsTransactions = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [pretermDecisionTarget, setPretermDecisionTarget] = useState(null);
  const [pretermAdminFee, setPretermAdminFee] = useState("0");
  const [pretermDecisionReason, setPretermDecisionReason] = useState("");

  const [rows, setRows] = useState([]);
  const [pretermRows, setPretermRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("pending_verification");
  const [workingId, setWorkingId] = useState("");
  const withdrawalRows = useMemo(
    () => rows.filter((row) => String(row.transaction_type || "").toLowerCase() === "withdraw"),
    [rows]
  );

  const allRows = useMemo(
    () => [
      ...withdrawalRows.map(normalizeSavingsRow),
      ...pretermRows.map(normalizePretermRow),
    ],
    [withdrawalRows, pretermRows]
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return allRows
      .filter((row) => row.status === activeTab)
      .filter((row) => {
        if (!normalizedSearch) return true;
        return (
          String(row.id || "").toLowerCase().includes(normalizedSearch)
          || String(row.refLabel || "").toLowerCase().includes(normalizedSearch)
          || String(row.memberLabel || "").toLowerCase().includes(normalizedSearch)
        );
      })
      .sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));
  }, [allRows, activeTab, searchTerm]);

  const tabCounts = useMemo(() => {
    const pending = allRows.filter((row) => row.status === "pending_verification").length;
    const validated = allRows.filter((row) => row.status === "validated" || row.status === "approved" || row.status === "executed").length;
    const rejected = allRows.filter((row) => row.status === "rejected").length;

    return { pending, validated, rejected };
  }, [allRows]);

  async function fetchRows({ silent = false } = {}) {
    if (!silent) setLoading(true);
    try {
      const headers = await authHeaders();
      const [savingsResponse, pretermResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/bookkeeper/savings-transactions`),
        fetch(`${API_BASE_URL}/api/time-deposits/pre-termination-requests`, { headers }),
      ]);
      const savingsPayload = await savingsResponse.json().catch(() => ({}));
      const pretermPayload = await pretermResponse.json().catch(() => ({}));
      if (!savingsResponse.ok || !savingsPayload?.success) {
        throw new Error(savingsPayload?.detail || "Failed to load savings transaction queue.");
      }
      setRows(Array.isArray(savingsPayload.data) ? savingsPayload.data : []);
      setPretermRows(pretermResponse.ok && pretermPayload?.success ? (pretermPayload.data || []) : []);
      if (!silent) addNotification("Transactions loaded successfully", "success");
    } catch (error) {
      if (silent) return;
      setRows([]);
      addNotification(error?.message || "Unable to load the transaction queue.", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }
  useRealtimeRefetch(RT.SAVINGS, () => fetchRows({ silent: true }));

  useEffect(() => {
    fetchRows();
  }, []);

  const decidePreterm = async (requestId, approve, { adminFee = 0, reason = "" } = {}) => {
    setWorkingId(requestId);
    try {
      const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
      const response = await fetch(`${API_BASE_URL}/api/time-deposits/pre-termination-requests/${requestId}/decide`, {
        method: "POST",
        headers,
        body: JSON.stringify({ approve, admin_fee: Number(adminFee) || 0, decision_reason: reason || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || "Failed to record the decision.");
      }
      addNotification(approve ? "Pre-termination approved." : "Pre-termination rejected.", approve ? "success" : "warning");
      await fetchRows();
    } catch (error) {
      addNotification(error?.message || "Unable to record the decision.", "error");
    } finally {
      setWorkingId("");
    }
  };

  const openPretermApproveDialog = (row) => {
    setPretermDecisionTarget(row);
    setPretermAdminFee("0");
    setPretermDecisionReason("");
  };

  const handlePretermReject = async (row) => {
    const ok = await confirm({
      title: "Reject Pre-termination Request",
      message: `Reject the pre-termination request for certificate ${row.refLabel}?`,
      confirmLabel: "Reject",
      tone: "destructive",
    });
    if (ok) await decidePreterm(row.id, false);
  };


  const confirmPost = async (transactionId) => {
    setWorkingId(transactionId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/savings-transactions/${encodeURIComponent(transactionId)}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({ notes: "Confirmed by Bookkeeper" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || "Failed to confirm transaction.");
      }
      addNotification(payload?.message || "Transaction confirmed and posted.", "success");
      await fetchRows();
    } catch (error) {
      addNotification(error?.message || "Unable to confirm transaction.", "error");
    } finally {
      setWorkingId("");
    }
  };

  const rejectTransaction = async (transactionId, reason) => {
    setWorkingId(transactionId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/savings-transactions/${encodeURIComponent(transactionId)}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes: reason || "Rejected by Bookkeeper" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || "Failed to reject transaction.");
      }
      addNotification(payload?.message || "Transaction rejected.", "warning");
      await fetchRows();
    } catch (error) {
      addNotification(error?.message || "Unable to reject transaction.", "error");
    } finally {
      setWorkingId("");
    }
  };

  const handleConfirmPostClick = async (row) => {
    const ok = await confirm({
      title: "Confirm Savings Transaction",
      message: `Confirm and post this ${row.account_type || row.transaction_type} transaction of ${formatCurrency(row.amount)} for ${row.member_name || "this member"}? This will update the member's savings ledger.`,
      confirmLabel: "Confirm & Post",
      tone: "default",
    });
    if (ok) {
      await confirmPost(row.transaction_id);
    }
  };

  const openRejectDialog = (row) => {
    setRejectTarget(row);
    setRejectReason("");
  };

  const closeRejectDialog = () => {
    if (workingId === rejectTarget?.transaction_id) return;
    setRejectTarget(null);
    setRejectReason("");
  };

  const confirmRejectDialog = async () => {
    if (!rejectTarget) return;
    await rejectTransaction(rejectTarget.transaction_id, rejectReason.trim() || "Rejected by Bookkeeper");
    setRejectTarget(null);
    setRejectReason("");
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

      <div className="flex-1 min-w-0 flex flex-col">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        <main className="animate-page-in p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Savings Withdrawal Verification</h1>
              <p className="text-xs text-gray-500 mt-0.5">Review and confirm cashier-submitted withdrawals</p>
            </div>
            <button
              onClick={fetchRows}
              disabled={loading}
              className="px-3 py-1.5 rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white">
            <TableToolbar
              subtitle={`Showing ${filteredRows.length} of ${rows.length} transactions`}
              tabs={[
                { value: "pending_verification", label: "Pending", count: tabCounts.pending },
                { value: "validated", label: "Validated", count: tabCounts.validated },
                { value: "rejected", label: "Rejected", count: tabCounts.rejected },
              ]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            >
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by transaction ID, savings ID, or member name"
                className="w-full sm:w-64 h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
              />
            </TableToolbar>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Reference</th>
                    <th className="p-5 font-bold">Member</th>
                    <th className="p-5 font-bold">Account / Certificate</th>
                    <th className="p-5 font-bold">Type</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold">Requested</th>
                    <th className="p-5 font-bold">Status</th>
                    <th className="p-5 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={8} variant="loading" label="Loading..." />
                  ) : filteredRows.length === 0 ? (
                    <TableStateRow
                      colSpan={8}
                      variant="empty"
                      icon={Wallet}
                      label="No transactions found for this tab."
                    />
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.key} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-sm font-mono text-gray-900">
                          {row.kind === "preterm" ? String(row.id).slice(0, 8) : row.id}
                        </td>
                        <td className="p-5 text-sm text-gray-800">{row.memberLabel}</td>
                        <td className="p-5 text-sm font-mono text-gray-700">{row.refLabel}</td>
                        <td className="p-5 text-sm">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${row.kind === "preterm" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                            {row.typeLabel}
                          </span>
                        </td>
                        <td className="p-5 text-sm text-right font-semibold text-gray-900 tabular-nums">
                          {row.amount != null ? formatCurrency(row.amount) : "—"}
                        </td>
                        <td className="p-5 text-sm text-gray-600">{formatDate(row.requestedAt)}</td>
                        <td className="p-5 text-sm">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusStyle(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="p-5 text-sm text-right">
                          {row.kind === "savings" && row.status === "pending_verification" ? (
                            <div className="inline-flex items-center gap-1.5">
                              <TableActionButton
                                icon={CheckCircle}
                                onClick={() => handleConfirmPostClick(row.raw)}
                                disabled={workingId === row.id}
                              >
                                Confirm
                              </TableActionButton>
                              <TableActionButton
                                icon={XCircle}
                                variant="danger"
                                onClick={() => openRejectDialog(row.raw)}
                                disabled={workingId === row.id}
                              >
                                Reject
                              </TableActionButton>
                            </div>
                          ) : row.kind === "preterm" && row.status === "pending_verification" ? (
                            <div className="inline-flex items-center gap-1.5">
                              <TableActionButton
                                icon={CheckCircle}
                                onClick={() => openPretermApproveDialog(row)}
                                disabled={workingId === row.id}
                              >
                                Approve
                              </TableActionButton>
                              <TableActionButton
                                icon={XCircle}
                                variant="danger"
                                onClick={() => handlePretermReject(row)}
                                disabled={workingId === row.id}
                              >
                                Reject
                              </TableActionButton>
                            </div>
                          ) : (
                            // The receipt is issued on confirm; find it under Receipts.
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
        </main>
      </div>

      <ConfirmDialog
        open={!!rejectTarget}
        title="Reject Savings Transaction"
        message={rejectTarget ? `Provide a reason for rejecting this ${rejectTarget.account_type || rejectTarget.transaction_type} transaction of ${formatCurrency(rejectTarget.amount)} for ${rejectTarget.member_name || "this member"}.` : ""}
        confirmLabel="Confirm Rejection"
        tone="destructive"
        loading={!!rejectTarget && workingId === rejectTarget.transaction_id}
        onCancel={closeRejectDialog}
        onConfirm={confirmRejectDialog}
      >
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          placeholder="Enter rejection reason"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!pretermDecisionTarget}
        title="Approve Pre-termination"
        message={
          pretermDecisionTarget
            ? `Approve closing certificate ${pretermDecisionTarget.refLabel} before maturity? Reason given: "${pretermDecisionTarget.raw.reason}". Interest adjusted to ${formatCurrency(pretermDecisionTarget.raw.adjusted_interest)} for ${pretermDecisionTarget.raw.elapsed_days} days elapsed.`
            : ""
        }
        confirmLabel="Approve"
        tone="default"
        loading={!!pretermDecisionTarget && workingId === pretermDecisionTarget.id}
        onCancel={() => setPretermDecisionTarget(null)}
        onConfirm={async () => {
          await decidePreterm(pretermDecisionTarget.id, true, {
            adminFee: pretermAdminFee,
            reason: pretermDecisionReason,
          });
          setPretermDecisionTarget(null);
        }}
      >
        <label className="block text-xs font-semibold text-gray-700 mb-1">Admin fee (deducted from principal)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={pretermAdminFee}
          onChange={(e) => setPretermAdminFee(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <label className="block text-xs font-semibold text-gray-700 mb-1">Approval note (optional)</label>
        <textarea
          value={pretermDecisionReason}
          onChange={(e) => setPretermDecisionReason(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="Optional note"
        />
      </ConfirmDialog>
    </div>
  );
};

export default BookkeeperSavingsTransactions;
