import React, { useEffect, useState } from "react";
import { X, ChevronDown, ChevronUp, History, Undo2 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import { supabase } from "../supabaseClient";
import { useNotification } from "../contex/NotificationContext";

/**
 * Read-only history of every Interest on Share Capital posting, shared by
 * the Bookkeeper/Cashier "View Postings" button (canReverse=false) and the
 * Manager ISC Postings page (canReverse=true). See ISC_DIVIDEND_PLAN.md §8.2
 * — a posting is never edited or deleted, only reversed (post the opposite),
 * and only a manager may do that, even for a posting the bookkeeper made.
 */

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value, opts) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit", ...opts });
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function IscPostingHistory({ open, onClose, canReverse = false }) {
  const { addNotification } = useNotification();

  const [postings, setPostings] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [transactionsByPosting, setTransactionsByPosting] = useState({});

  const [reversing, setReversing] = useState(null); // the posting being reversed
  const [reason, setReason] = useState("");
  const [reversalError, setReversalError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadPostings = async () => {
    setStatus("loading");
    setError("");
    try {
      const { data, error: fetchError } = await supabase
        .from("isc_postings")
        .select("*")
        .order("posted_at", { ascending: false });
      if (fetchError) throw new Error(fetchError.message || "Failed to load ISC postings.");
      setPostings(Array.isArray(data) ? data : []);
      setStatus("ready");
    } catch (err) {
      setError(err?.message || "Unable to load ISC postings.");
      setPostings([]);
      setStatus("error");
    }
  };

  useEffect(() => {
    if (open) {
      loadPostings();
      setExpandedId(null);
      setTransactionsByPosting({});
    }
  }, [open]);

  if (!open) return null;

  const toggleExpand = async (posting) => {
    const nextId = expandedId === posting.id ? null : posting.id;
    setExpandedId(nextId);
    if (nextId && !transactionsByPosting[nextId]) {
      const { data, error: txError } = await supabase
        .from("isc_transactions")
        .select("member_id, average_share_capital, total_share_capital, interest_amount")
        .eq("isc_posting_id", nextId)
        .order("interest_amount", { ascending: false });
      if (!txError) {
        setTransactionsByPosting((prev) => ({ ...prev, [nextId]: data || [] }));
      }
    }
  };

  const openReverse = (posting) => {
    setReversing(posting);
    setReason("");
    setReversalError("");
  };

  const handleReverse = async () => {
    if (!reversing || !reason.trim()) return;
    setSubmitting(true);
    setReversalError("");
    try {
      const { error: rpcError } = await supabase.rpc("isc_reverse", {
        p_posting_id: reversing.id,
        p_reason: reason.trim(),
      });
      if (rpcError) throw new Error(rpcError.message || "Failed to reverse this posting.");

      addNotification("Interest on Share Capital posting reversed.", "success");
      setReversing(null);
      setReason("");
      await loadPostings();
    } catch (err) {
      setReversalError(err?.message || "Unable to reverse this posting.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 dialog-enter"
        onClick={() => !reversing && onClose?.()}
      >
        <div
          className="dialog-card bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-transparent"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 px-6 py-5 bg-gray-50 border-b border-gray-100 rounded-t-xl shrink-0">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-700 flex items-center justify-center shrink-0">
                <History className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Interest on Share Capital — Postings</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {canReverse
                    ? "Every posting ever made. Reversing creates an offsetting entry — nothing is deleted."
                    : "Every posting ever made. Only a manager can reverse one."}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors shrink-0" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-6 py-5">
            {status === "loading" && (
              <p className="text-sm text-gray-500 text-center py-8">Loading postings...</p>
            )}
            {status === "error" && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            {status === "ready" && postings.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">No Interest on Share Capital has been posted yet.</p>
            )}

            {status === "ready" && postings.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                      <th className="p-3 font-bold">Period</th>
                      <th className="p-3 font-bold text-right">Rate</th>
                      <th className="p-3 font-bold text-right">Members</th>
                      <th className="p-3 font-bold text-right">Total</th>
                      <th className="p-3 font-bold">Status</th>
                      <th className="p-3 font-bold">Posted By</th>
                      <th className="p-3 font-bold" />
                    </tr>
                  </thead>
                  <tbody>
                    {postings.map((posting) => (
                      <React.Fragment key={posting.id}>
                        <tr className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                          <td className="p-3 text-sm text-gray-900">
                            {formatDate(posting.period_start, { day: undefined })} – {formatDate(posting.period_end, { day: undefined })}
                          </td>
                          <td className="p-3 text-sm text-right text-gray-700 tabular-nums">{Number(posting.rate).toString()}%</td>
                          <td className="p-3 text-sm text-right text-gray-700 tabular-nums">{posting.total_members}</td>
                          <td
                            className={`p-3 text-sm text-right font-semibold tabular-nums ${
                              Number(posting.total_interest) < 0 ? "text-red-600" : "text-gray-900"
                            }`}
                          >
                            {formatCurrency(posting.total_interest)}
                          </td>
                          <td className="p-3 text-sm">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                posting.status === "reversed"
                                  ? "bg-red-50 text-red-600"
                                  : "bg-green-50 text-green-700"
                              }`}
                            >
                              {posting.status}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-gray-600">
                            {posting.posted_by_email || "—"}
                            <p className="text-[10px] text-gray-400">{formatDateTime(posting.posted_at)}</p>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {canReverse && posting.status === "posted" && (
                                <button
                                  onClick={() => openReverse(posting)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 text-[11px] font-semibold transition-colors"
                                >
                                  <Undo2 className="w-3 h-3" /> Reverse
                                </button>
                              )}
                              <button
                                onClick={() => toggleExpand(posting)}
                                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
                                aria-label="Toggle member breakdown"
                              >
                                {expandedId === posting.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedId === posting.id && (
                          <tr>
                            <td colSpan={7} className="p-0 bg-gray-50 border-b border-gray-100">
                              <div className="px-4 py-3 space-y-2">
                                {posting.status === "reversed" && (
                                  <p className="text-xs text-red-600">
                                    Reversed {formatDateTime(posting.reversed_at)} by {posting.reversed_by_email || "—"}
                                    {posting.reversal_reason ? ` — "${posting.reversal_reason}"` : ""}
                                  </p>
                                )}
                                {!transactionsByPosting[posting.id] ? (
                                  <p className="text-xs text-gray-500">Loading member breakdown...</p>
                                ) : transactionsByPosting[posting.id].length === 0 ? (
                                  <p className="text-xs text-gray-500">No member rows recorded.</p>
                                ) : (
                                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md bg-white">
                                    <table className="w-full text-left border-collapse">
                                      <thead>
                                        <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                                          <th className="p-2 font-bold">Member</th>
                                          <th className="p-2 font-bold text-right">Average Share Capital</th>
                                          <th className="p-2 font-bold text-right">Interest</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {transactionsByPosting[posting.id].map((tx, idx) => (
                                          <tr key={`${tx.member_id}-${idx}`} className="border-b border-gray-50 last:border-0">
                                            <td className="p-2 text-xs font-mono text-gray-600">{tx.member_id}</td>
                                            <td className="p-2 text-xs text-right text-gray-700 tabular-nums">{formatCurrency(tx.average_share_capital)}</td>
                                            <td className="p-2 text-xs text-right font-semibold text-gray-900 tabular-nums">{formatCurrency(tx.interest_amount)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 rounded-b-xl flex items-center justify-end shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!reversing}
        title="Reverse Interest on Share Capital"
        tone="destructive"
        confirmLabel="Reverse Posting"
        loading={submitting}
        disableConfirm={!reason.trim()}
        errorMessage={reversalError}
        onConfirm={handleReverse}
        onCancel={() => setReversing(null)}
      >
        {reversing && (
          <div className="text-sm text-gray-700 space-y-3">
            <p>
              This creates an offsetting posting for {formatDate(reversing.period_start)} – {formatDate(reversing.period_end)}
              {" "}at {Number(reversing.rate).toString()}%, and every affected member's share capital balance will go{" "}
              <strong>down</strong> by the amount they originally received. The original posting stays visible, marked
              reversed — nothing is deleted.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Reason for reversal <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Explain why this posting is being reversed..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400 transition-colors resize-none"
              />
            </div>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
