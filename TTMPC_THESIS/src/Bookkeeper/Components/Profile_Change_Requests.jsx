import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useRealtimeRefetch } from "../../hooks/useRealtimeRefetch";
import { ArrowRight, Eye, FileText, X } from "lucide-react";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import { TableToolbar } from "../../components/TableToolbar";
import TableStateRow from "../../components/TableStateRow";
import TableActionButton from "../../components/TableActionButton";
import Pagination from "../../components/Pagination";
import QuickReasons from "../../components/QuickReasons";
import { QUICK_REASONS } from "../../utils/quickReasons";
import { useNotification } from "../../contex/NotificationContext";
import {
  fetchBookkeeperProfileChanges,
  fetchPayslipUrl,
  reviewProfileChange,
} from "../../utils/profileChangeRequests";

/*
  Profile Change Requests (Bookkeeper)
  ------------------------------------
  Members no longer edit their profile directly: each changed field arrives here.
  The Bookkeeper sees the old and new value side by side (with the payslip for
  net pay), then approves (the value is written to the profile) or rejects with a
  reason. Every decision is stamped with who/when and kept as history; the
  "All history" tab is the audit view.
*/

const ITEMS_PER_PAGE = 10;

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All history" },
];

const formatDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
};

const formatPayPeriod = (value) => {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 7)}-01T00:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-PH", { year: "numeric", month: "long" });
};

const PESO = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

// Net pay is a monetary field; show it as an amount, everything else as stored.
const displayValue = (row, value) => {
  if (value === null || value === undefined || value === "") return "—";
  if (row.requires_proof) {
    const n = Number(value);
    if (Number.isFinite(n)) return PESO.format(n);
  }
  return String(value);
};

// How far a net-pay request moves the figure, so a large jump stands out.
const changeDelta = (row) => {
  if (!row.requires_proof) return null;
  const from = Number(row.old_value);
  const to = Number(row.new_value);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0 || from === to) return null;
  const diff = to - from;
  return { diff, pct: (diff / from) * 100 };
};

const initialsOf = (name) =>
  String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "?";

const STATUS_STYLE = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
};

const StatusChip = ({ status }) => (
  <span className={`status-badge capitalize ${STATUS_STYLE[status] || STATUS_STYLE.cancelled}`}>{status}</span>
);

const Detail = ({ label, children }) => (
  <div>
    <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</dt>
    <dd className="mt-0.5 text-sm text-gray-800">{children}</dd>
  </div>
);

// Fetches a short-lived signed link when opened, so a stale tab never holds a
// usable payslip URL for long.
function PayslipViewer({ requestId }) {
  const [state, setState] = useState({ loading: true, error: "", url: "", contentType: "" });

  useEffect(() => {
    let stale = false;
    fetchPayslipUrl(requestId)
      .then((data) => {
        if (!stale) setState({ loading: false, error: "", url: data.url, contentType: data.content_type || "" });
      })
      .catch((err) => {
        if (!stale) setState({ loading: false, error: err?.message || "Could not open the payslip.", url: "", contentType: "" });
      });
    return () => {
      stale = true;
    };
  }, [requestId]);

  if (state.loading) return <p className="text-sm text-gray-500">Loading payslip…</p>;
  if (state.error) return <p className="text-sm font-medium text-red-600">{state.error}</p>;

  const isPdf = state.contentType === "application/pdf";
  return (
    <div>
      {isPdf ? (
        <iframe title="Payslip" src={state.url} className="h-60 w-full rounded-lg border border-gray-200" />
      ) : (
        <img src={state.url} alt="Payslip" className="max-h-60 w-full rounded-lg border border-gray-200 object-contain bg-gray-50" />
      )}
      <a
        href={state.url}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-block text-xs font-semibold text-green-700 underline underline-offset-2"
      >
        Open in a new tab
      </a>
    </div>
  );
}

const ProfileChangeRequests = () => {
  const { addNotification } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const memberFilter = (searchParams.get("member") || "").trim();

  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [acknowledgeLoan, setAcknowledgeLoan] = useState(false);
  const [saving, setSaving] = useState(null); // 'approved' | 'rejected' | null
  const [formError, setFormError] = useState("");

  const load = useCallback(async (status, isStale = () => false, silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadError("");
    }
    try {
      const result = await fetchBookkeeperProfileChanges(status);
      if (isStale()) return;
      setRows(result.data || []);
      setPendingCount(result.pending_count || 0);
    } catch (err) {
      if (isStale() || silent) return;
      setRows([]);
      setLoadError(err?.message || "Unable to load profile change requests.");
    } finally {
      if (!isStale() && !silent) setLoading(false);
    }
  }, []);

  // Realtime: new member requests and other Bookkeepers' decisions.
  useRealtimeRefetch(["member_profile_change_requests"], () => load(tab, undefined, true));

  useEffect(() => {
    let stale = false;
    setPage(1);
    load(tab, () => stale);
    return () => {
      stale = true;
    };
  }, [tab, load]);

  const visibleRows = memberFilter ? rows.filter((r) => r.membership_id === memberFilter) : rows;
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / ITEMS_PER_PAGE));
  const pageRows = visibleRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const openRow = (row) => {
    setSelected(row);
    setNote("");
    setAcknowledgeLoan(false);
    setFormError("");
  };

  const closeModal = () => {
    if (saving) return;
    setSelected(null);
  };

  const decide = async (action) => {
    if (!selected || saving) return;
    if (action === "rejected" && !note.trim()) {
      setFormError("Please give a reason so the member knows why the change was declined.");
      return;
    }
    if (action === "approved" && selected.open_loan_applications > 0 && !acknowledgeLoan) {
      setFormError("Please confirm you have considered the loan application this member has in review.");
      return;
    }
    setSaving(action);
    setFormError("");
    try {
      await reviewProfileChange(selected.id, action, note.trim(), acknowledgeLoan);
      const who = selected.member_name || "the member";
      addNotification(
        action === "approved"
          ? `${selected.field_label} updated for ${who}.`
          : `Change to ${selected.field_label} for ${who} declined.`,
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
  const hasOpenLoan = isPending && selected?.open_loan_applications > 0;
  const delta = selected ? changeDelta(selected) : null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        <main className="animate-page-in p-8">
          <div className="mb-6">
            <h1 className="font-bold text-2xl text-gray-800">Profile Change Requests</h1>
            <p className="text-sm text-gray-500 mt-1">
              Members can't edit their profile directly. Review each change here; approving writes the new value to their profile. Net take-home pay comes with a payslip to compare against.
            </p>
          </div>

          {memberFilter && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-800">
              Showing member {memberFilter}
              <button
                type="button"
                aria-label="Show all members"
                onClick={() => setSearchParams({}, { replace: true })}
                className="text-green-700 hover:text-green-900"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {loadError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <TableToolbar
              subtitle={`Showing ${visibleRows.length} request${visibleRows.length === 1 ? "" : "s"}`}
              tabs={TABS.map((t) => ({
                value: t.key,
                label: t.label,
                count: t.key === "pending" && pendingCount > 0 ? pendingCount : undefined,
              }))}
              activeTab={tab}
              onTabChange={setTab}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Member</th>
                    <th className="p-5 font-bold">Field</th>
                    <th className="p-5 font-bold">Current</th>
                    <th className="p-5 font-bold">Requested</th>
                    <th className="p-5 font-bold">Payslip</th>
                    <th className="p-5 font-bold">Requested on</th>
                    <th className="p-5 font-bold">Status</th>
                    <th className="p-5 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <TableStateRow colSpan={8} variant="loading" label="Loading requests..." />}

                  {!loading && visibleRows.length === 0 && !loadError && (
                    <TableStateRow
                      colSpan={8}
                      variant="empty"
                      icon={FileText}
                      label={tab === "pending" ? "No pending profile changes." : "No requests in this view."}
                    />
                  )}

                  {!loading && pageRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="p-5">
                        <p className="text-xs font-semibold text-gray-800">{row.member_name || "—"}</p>
                        <p className="text-[11px] font-mono font-bold text-green-700">{row.membership_id || "—"}</p>
                      </td>
                      <td className="p-5 text-xs font-semibold text-gray-800">{row.field_label}</td>
                      <td className="p-5 max-w-[12rem] break-words text-xs font-medium text-gray-500">{displayValue(row, row.old_value)}</td>
                      <td className="p-5 max-w-[12rem] break-words text-xs font-semibold text-gray-800">{displayValue(row, row.new_value)}</td>
                      <td className="p-5 whitespace-nowrap text-xs font-medium text-gray-700">
                        {row.requires_proof ? (row.has_payslip ? "Attached" : "Removed") : "—"}
                      </td>
                      <td className="p-5 whitespace-nowrap text-xs font-medium text-gray-700">{formatDate(row.created_at)}</td>
                      <td className="p-5"><StatusChip status={row.status} /></td>
                      <td className="p-5 text-center">
                        <TableActionButton onClick={() => openRow(row)} icon={Eye}>
                          {row.status === "pending" ? "Review" : "View"}
                        </TableActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!loading && visibleRows.length > ITEMS_PER_PAGE && (
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          )}
        </main>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="profile-change-review-title" className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
            {/* Header and actions stay pinned; only the middle scrolls, so a tall
                payslip never pushes the title or the buttons off-screen. */}
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-800">
                  {initialsOf(selected.member_name)}
                </div>
                <div className="min-w-0">
                  <h2 id="profile-change-review-title" className="truncate text-base font-bold text-gray-900">
                    {selected.member_name || "Member"}
                  </h2>
                  <p className="truncate text-xs text-gray-500">
                    {selected.membership_id || "—"} · requested {formatDateTime(selected.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusChip status={selected.status} />
                <button type="button" onClick={closeModal} disabled={!!saving} aria-label="Close" className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {/* What is changing */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{selected.field_label}</p>
                <div className="mt-2 grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Current</p>
                    <p className="mt-1 break-words text-base text-gray-700">{displayValue(selected, selected.old_value)}</p>
                  </div>
                  <div className="flex items-center justify-center text-gray-300">
                    <ArrowRight size={20} className="rotate-90 sm:rotate-0" />
                  </div>
                  <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-green-700">Requested</p>
                    <p className="mt-1 break-words text-base font-bold text-gray-900">{displayValue(selected, selected.new_value)}</p>
                  </div>
                </div>
                {delta && (
                  <p
                    className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      delta.diff < 0 ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {delta.diff < 0 ? "Decrease" : "Increase"} of {PESO.format(Math.abs(delta.diff))} ({Math.abs(delta.pct).toFixed(1)}%)
                  </p>
                )}
              </section>

              {/* Proof */}
              {selected.requires_proof && (
                <section className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Payslip</p>
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                      Covers {formatPayPeriod(selected.pay_period)}
                    </span>
                  </div>
                  <div className="mt-3">
                    {selected.has_payslip ? (
                      <PayslipViewer requestId={selected.id} />
                    ) : (
                      <p className="text-sm text-gray-500">No payslip on file for this request.</p>
                    )}
                  </div>
                </section>
              )}

              {/* Decision (history) */}
              {!isPending && (
                <section className="rounded-xl bg-gray-50 p-4">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Detail label="Decided by">{selected.reviewed_by_email || "—"}</Detail>
                    <Detail label="Decided on">{formatDateTime(selected.reviewed_at)}</Detail>
                    {selected.review_note && (
                      <div className="col-span-2">
                        <Detail label="Reason">
                          <span className="whitespace-pre-wrap">{selected.review_note}</span>
                        </Detail>
                      </div>
                    )}
                  </dl>
                </section>
              )}

              {/* Decision (to make) */}
              {isPending && (
                <section className="space-y-3">
                  {hasOpenLoan && (
                    <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                      <input
                        type="checkbox"
                        checked={acknowledgeLoan}
                        onChange={(e) => setAcknowledgeLoan(e.target.checked)}
                        disabled={!!saving}
                        className="mt-0.5"
                      />
                      <span>
                        This member has {selected.open_loan_applications} loan application{selected.open_loan_applications === 1 ? "" : "s"} still in review.
                        Approving changes the net pay they are judged on. I have considered this.
                      </span>
                    </label>
                  )}
                  <div>
                    <label htmlFor="profile-change-note" className="block text-sm font-semibold text-gray-800">
                      Note to the member <span className="font-normal text-gray-500">(required to decline)</span>
                    </label>
                    <QuickReasons
                      reasons={QUICK_REASONS.profileChangeDecline}
                      value={note}
                      onChange={setNote}
                      disabled={!!saving}
                      className="mt-1.5"
                    />
                    <textarea
                      id="profile-change-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                      rows={2}
                      disabled={!!saving}
                      className="mt-2 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Approving writes the requested value to the member's profile right away.
                    </p>
                  </div>
                </section>
              )}

              {formError && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{formError}</p>
              )}
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 px-6 py-4 sm:flex-row sm:justify-end">
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
                    {saving === "approved" ? "Approving..." : "Approve & apply"}
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

export default ProfileChangeRequests;
