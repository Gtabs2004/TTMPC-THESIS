  import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { useConfirm } from "../../contex/ConfirmContext";
import ConfirmDialog from "../../components/ConfirmDialog";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
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
  if (key === "validated") return "bg-green-100 text-green-800";
  if (key === "rejected") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
};

const BookkeeperSavingsTransactions = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("pending_verification");
  const [workingId, setWorkingId] = useState("");
  const withdrawalRows = useMemo(
    () => rows.filter((row) => String(row.transaction_type || "").toLowerCase() === "withdraw"),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return withdrawalRows
      .filter((row) => String(row.transaction_status || "").toLowerCase() === activeTab)
      .filter((row) => {
        if (!normalizedSearch) return true;
        return (
          String(row.transaction_id || "").toLowerCase().includes(normalizedSearch)
          || String(row.savings_id || "").toLowerCase().includes(normalizedSearch)
          || String(row.member_name || "").toLowerCase().includes(normalizedSearch)
        );
      });
  }, [withdrawalRows, activeTab, searchTerm]);

  const tabCounts = useMemo(() => {
    const pending = withdrawalRows.filter((row) => String(row.transaction_status || "").toLowerCase() === "pending_verification").length;
    const validated = withdrawalRows.filter((row) => String(row.transaction_status || "").toLowerCase() === "validated").length;
    const rejected = withdrawalRows.filter((row) => String(row.transaction_status || "").toLowerCase() === "rejected").length;

    return { pending, validated, rejected };
  }, [withdrawalRows]);

  async function fetchRows() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/savings-transactions`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || "Failed to load savings transaction queue.");
      }
      setRows(Array.isArray(payload.data) ? payload.data : []);
      addNotification("Savings transactions loaded successfully", "success");
    } catch (error) {
      setRows([]);
      addNotification(error?.message || "Unable to load savings transaction queue.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows();
  }, []);


  const confirmPost = async (transactionId) => {
    setWorkingId(transactionId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/savings-transactions/${encodeURIComponent(transactionId)}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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

      <div className="flex-1 flex flex-col">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        <main className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <Breadcrumb portal="Bookkeeper" page="Savings Withdrawal Verification" />
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

          <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4 flex flex-wrap gap-2 items-center">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by transaction ID, savings ID, or member name"
              className="flex-1 min-w-[200px] md:max-w-md bg-gray-50 border border-gray-300 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
            />

            <button
              onClick={() => setActiveTab("pending_verification")}
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold ${activeTab === "pending_verification" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              Pending ({tabCounts.pending})
            </button>
            <button
              onClick={() => setActiveTab("validated")}
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold ${activeTab === "validated" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              Validated ({tabCounts.validated})
            </button>
            <button
              onClick={() => setActiveTab("rejected")}
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold ${activeTab === "rejected" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              Rejected ({tabCounts.rejected})
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Transaction ID</th>
                    <th className="p-5 font-bold">Member</th>
                    <th className="p-5 font-bold">Savings ID</th>
                    <th className="p-5 font-bold">Type</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold">Requested</th>
                    <th className="p-5 font-bold">Status</th>
                    <th className="p-5 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="8" className="p-5 text-sm text-center text-gray-500">Loading savings transactions...</td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="p-5 text-sm text-center text-gray-500">No transactions found for this tab.</td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.transaction_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-sm font-mono text-gray-900">{row.transaction_id}</td>
                        <td className="p-5 text-sm text-gray-800">{row.member_name || "Unknown Member"}</td>
                        <td className="p-5 text-sm font-mono text-gray-700">{row.savings_id}</td>
                        <td className="p-5 text-sm">
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-medium">
                            {row.account_type || row.transaction_type}
                          </span>
                        </td>
                        <td className="p-5 text-sm text-right font-semibold text-gray-900 tabular-nums">{formatCurrency(row.amount)}</td>
                        <td className="p-5 text-sm text-gray-600">{formatDate(row.requested_at)}</td>
                        <td className="p-5 text-sm">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusStyle(row.transaction_status)}`}>
                            {row.transaction_status}
                          </span>
                        </td>
                        <td className="p-5 text-sm text-right">
                          {row.transaction_status === "pending_verification" ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => handleConfirmPostClick(row)}
                                disabled={workingId === row.transaction_id}
                                className="px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                <CheckCircle size={12} />
                                Confirm
                              </button>
                              <button
                                onClick={() => openRejectDialog(row)}
                                disabled={workingId === row.transaction_id}
                                className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                <XCircle size={12} />
                                Reject
                              </button>
                            </div>
                          ) : (
                            // TODO: PRINT-RECEIPT-OVERLAY Â· withdrawal slip after bookkeeper validates
                            <button
                              onClick={() =>
                                addNotification(
                                  `Print withdrawal slip for ${row.transaction_id} — coming soon.`,
                                  "info"
                                )
                              }
                              className="px-2 py-1 rounded border border-dashed border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold inline-flex items-center gap-1"
                              title="PRINT-RECEIPT-OVERLAY Â· Coming soon"
                            >
                              <Printer size={12} />
                              Print
                              <span className="ml-0.5 text-[8px] uppercase tracking-wider bg-blue-200 text-blue-800 px-1 rounded-full">
                                Soon
                              </span>
                            </button>
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
    </div>
  );
};

export default BookkeeperSavingsTransactions;
