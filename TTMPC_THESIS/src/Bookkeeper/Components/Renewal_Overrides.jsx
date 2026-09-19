import React, { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import Pagination from "../../components/Pagination";
import { useNotification } from "../../contex/NotificationContext";
import { getLoanTypeChipClass } from "../../utils/loanTypeColors";
import {
  fetchBookkeeperOverrideRequests,
  reviewOverrideRequest,
} from "../../utils/renewalOverrides";

/*
  Renewal Override Requests (Bookkeeper)
  --------------------------------------
  Members with an active loan can ask to renew before the 6-month rule is met.
  The Bookkeeper approves (unlocks Renewal for that loan for a limited time) or
  rejects with a note. Every decision is stamped with who/when and kept as
  history; the "All history" tab is the audit view.
*/

const ITEMS_PER_PAGE = 10;

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All history" },
];

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

// An approved request whose window has lapsed reads as "Expired", not "Approved".
const effectiveStatus = (row) => {
  if (row.status === "approved" && row.expires_at && new Date(row.expires_at) <= new Date()) return "expired";
  return row.status;
};

const STATUS_STYLE = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  used: "bg-blue-100 text-blue-700",
  expired: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-600",
};

const StatusChip = ({ row }) => {
  const status = effectiveStatus(row);
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[status] || STATUS_STYLE.cancelled}`}>
      {status}
    </span>
  );
};

const Detail = ({ label, children }) => (
  <div>
    <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</dt>
    <dd className="mt-0.5 text-sm text-gray-800">{children}</dd>
  </div>
);

const RenewalOverrides = () => {
  const { addNotification } = useNotification();
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(null); // 'approved' | 'rejected' | null
  const [formError, setFormError] = useState("");

  const load = useCallback(async (status, isStale = () => false) => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await fetchBookkeeperOverrideRequests(status);
      if (isStale()) return;
      setRows(result.data || []);
      setPendingCount(result.pending_count || 0);
    } catch (err) {
      if (isStale()) return;
      setRows([]);
      setLoadError(err?.message || "Unable to load override requests.");
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let stale = false;
    setPage(1);
    load(tab, () => stale);
    return () => {
      stale = true;
    };
  }, [tab, load]);

  const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  const pageRows = rows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const openRow = (row) => {
    setSelected(row);
    setNote("");
    setFormError("");
  };

  const closeModal = () => {
    if (saving) return;
    setSelected(null);
  };

  const decide = async (action) => {
    if (!selected || saving) return;
    if (action === "rejected" && !note.trim()) {
      setFormError("Please add a note so the member knows why the request was declined.");
      return;
    }
    setSaving(action);
    setFormError("");
    try {
      await reviewOverrideRequest(selected.id, action, note.trim());
      addNotification(
        action === "approved"
          ? `Early renewal approved for ${selected.member_name || "the member"}.`
          : `Request from ${selected.member_name || "the member"} declined.`,
        "success",
      );
      setSelected(null);
      await load(tab);
    } catch (err) {
      setFormError(err?.message || "Could not save your decision.");
    } finally {
      setSaving(null);
    }
  };

  const isPending = selected?.status === "pending";

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        <main className="p-8">
          <div className="mb-6">
            <Breadcrumb portal="Bookkeeper" page="Renewal Overrides" />
            <h1 className="font-bold text-2xl text-gray-800">6-Month Rule Override Requests</h1>
            <p className="text-sm text-gray-500 mt-1">
              Members asking to renew a loan before completing 6 monthly payments. Approving unlocks Renewal for that loan for a limited time.
            </p>
          </div>

          <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Request status">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? "border-primary-deep bg-primary-deep text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {t.label}
                  {t.key === "pending" && pendingCount > 0 && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? "bg-white text-primary-deep" : "bg-yellow-100 text-yellow-800"}`}>
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {loadError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold text-left">
                  <th className="p-5 font-bold">Member</th>
                  <th className="p-5 font-bold">Loan</th>
                  <th className="p-5 font-bold text-right">Payments</th>
                  <th className="p-5 font-bold">Reason</th>
                  <th className="p-5 font-bold">Requested</th>
                  <th className="p-5 font-bold">Status</th>
                  <th className="p-5 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-sm text-gray-500">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-gray-400" />
                      Loading requests...
                    </td>
                  </tr>
                )}

                {!loading && rows.length === 0 && !loadError && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileText size={32} className="text-gray-300" />
                        <p className="text-sm font-medium text-gray-500">
                          {tab === "pending" ? "No pending override requests." : "No requests in this view."}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

                {!loading && pageRows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors align-top">
                    <td className="p-5">
                      <p className="font-semibold text-gray-800">{row.member_name || "—"}</p>
                      <p className="text-xs text-gray-500">{row.membership_id || "—"}</p>
                    </td>
                    <td className="p-5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${getLoanTypeChipClass(row.loan_type)}`}>
                        {row.loan_type}
                      </span>
                      <p className="mt-1 font-mono text-xs text-gray-500">{row.loan_id}</p>
                    </td>
                    <td className="p-5 text-right tabular-nums text-gray-700 whitespace-nowrap">
                      {row.payments_made} / {row.required_payments}
                    </td>
                    <td className="p-5 max-w-xs">
                      <p className="line-clamp-2 text-gray-700">{row.reason}</p>
                    </td>
                    <td className="p-5 whitespace-nowrap text-gray-700">{formatDate(row.created_at)}</td>
                    <td className="p-5"><StatusChip row={row} /></td>
                    <td className="p-5 text-right">
                      <button
                        type="button"
                        onClick={() => openRow(row)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                          row.status === "pending"
                            ? "bg-green-600 text-white hover:bg-green-700"
                            : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {row.status === "pending" ? "Review" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && rows.length > ITEMS_PER_PAGE && (
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            )}
          </div>
        </main>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="override-review-title" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="override-review-title" className="text-base font-bold text-gray-800">
                  {isPending ? "Review override request" : "Override request"}
                </h2>
                <div className="mt-1"><StatusChip row={selected} /></div>
              </div>
              <button type="button" onClick={closeModal} disabled={!!saving} aria-label="Close" className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
                <X size={18} />
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <Detail label="Member">{selected.member_name || "—"}</Detail>
              <Detail label="Membership ID">{selected.membership_id || "—"}</Detail>
              <Detail label="Loan">
                <span className="capitalize">{selected.loan_type}</span> · <span className="font-mono text-xs">{selected.loan_id}</span>
              </Detail>
              <Detail label="Payments made">{selected.payments_made} of {selected.required_payments}</Detail>
              <Detail label="Requested">{formatDateTime(selected.created_at)}</Detail>
            </dl>

            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Reason given by the member</p>
              <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800">
                {selected.reason}
              </p>
            </div>

            {!isPending && (
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-gray-100 pt-4">
                <Detail label="Decided by">{selected.reviewed_by_email || "—"}</Detail>
                <Detail label="Decided on">{formatDateTime(selected.reviewed_at)}</Detail>
                {selected.expires_at && <Detail label="Valid until">{formatDateTime(selected.expires_at)}</Detail>}
                {selected.used_at && (
                  <Detail label="Used on">
                    {formatDateTime(selected.used_at)}
                    {selected.used_application_id ? ` · ${selected.used_application_id}` : ""}
                  </Detail>
                )}
                {selected.review_note && (
                  <div className="col-span-2">
                    <Detail label="Note">
                      <span className="whitespace-pre-wrap">{selected.review_note}</span>
                    </Detail>
                  </div>
                )}
              </dl>
            )}

            {isPending && (
              <div className="mt-4">
                <label htmlFor="override-note" className="block text-sm font-semibold text-gray-800">
                  Note to the member <span className="font-normal text-gray-500">(required to decline)</span>
                </label>
                <textarea
                  id="override-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                  rows={3}
                  disabled={!!saving}
                  className="mt-1.5 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Approving unlocks Renewal for this loan for 30 days, or until it is used.
                </p>
              </div>
            )}

            {formError && (
              <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{formError}</p>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={!!saving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isPending ? "Cancel" : "Close"}
              </button>
              {isPending && (
                <>
                  <button
                    type="button"
                    onClick={() => decide("rejected")}
                    disabled={!!saving}
                    className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {saving === "rejected" ? "Declining..." : "Decline"}
                  </button>
                  <button
                    type="button"
                    onClick={() => decide("approved")}
                    disabled={!!saving}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {saving === "approved" ? "Approving..." : "Approve & unlock"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RenewalOverrides;
