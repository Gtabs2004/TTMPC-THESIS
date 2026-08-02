import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, ChevronLeft, ChevronRight, Clock, ListOrdered, Loader2, RefreshCw } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Same tone mapping used on the Disbursement page — keep visually consistent.
const RANK_TONE = {
  1: "bg-red-50 text-red-700 ring-red-200",
  2: "bg-orange-50 text-orange-700 ring-orange-200",
  3: "bg-amber-50 text-amber-700 ring-amber-200",
  4: "bg-yellow-50 text-yellow-800 ring-yellow-200",
  5: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  6: "bg-sky-50 text-sky-700 ring-sky-200",
  7: "bg-violet-50 text-violet-700 ring-violet-200",
};

const PHP = (v) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0 }).format(Number(v || 0));

/**
 * Compact disbursement priority-queue view for the Treasurer dashboard.
 * Pulls from /api/treasurer/disbursements/priority-queue — server does the
 * ranking so the dashboard stays in sync with the Disbursement page.
 */
const PriorityQueueCard = ({ className = "", limit = 10, seeAllHref = "/treasurer-approval" }) => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total_count: 0, total_amount: 0 });
  const [pagination, setPagination] = useState({ offset: 0, total: 0, has_more: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchQueue = useCallback(async (offset = 0) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/treasurer/disbursements/priority-queue?limit=${limit}&offset=${offset}`,
        { headers: { Accept: "application/json" } },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.detail || "Failed to load priority queue.");
      }
      setRows(payload.data || []);
      setSummary(payload.summary || { total_count: 0, total_amount: 0 });
      setPagination(payload.pagination || { offset: 0, total: 0, has_more: false });
    } catch (err) {
      setError(err?.message || "Failed to load priority queue.");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { fetchQueue(0); }, [fetchQueue]);

  const currentPage = Math.floor((pagination.offset || 0) / limit) + 1;
  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / limit));
  const goPrev = () => pagination.offset > 0 && fetchQueue(Math.max(0, pagination.offset - limit));
  const goNext = () => pagination.has_more && fetchQueue(pagination.offset + limit);

  return (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="flex items-center text-gray-800 font-bold text-lg">
            <ListOrdered size={18} className="mr-2 text-green-700" />
            Disbursement Priority Queue
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Sorted by rank (per TTMPC policy), then longest-waiting first.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchQueue(pagination.offset)}
          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Summary bar */}
      <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Pending Release</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">
            {summary.total_count} loan{summary.total_count === 1 ? "" : "s"} · {PHP(summary.total_amount)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(seeAllHref)}
          className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:text-green-800"
          title="Open Loan Approval page"
        >
          Loan Approval <ArrowRight size={14} />
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2 mb-3">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading && rows.length === 0 && (
        <div className="flex items-center justify-center py-8 text-sm text-gray-500">
          <Loader2 size={14} className="animate-spin mr-2" /> Loading queue…
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-sm font-semibold text-gray-700">Queue is empty</p>
          <p className="text-xs text-gray-500 mt-1">No loans are currently awaiting disbursement.</p>
        </div>
      )}

      <ul className="space-y-2 flex-1 min-h-[80px]">
        {rows.map((row) => {
          const tone = RANK_TONE[row.rank] || "bg-gray-50 text-gray-700 ring-gray-200";
          const waiting = row.days_waiting != null ? row.days_waiting : null;
          const isOld = waiting != null && waiting >= 30;
          return (
            <li
              key={row.loan_id}
              className="flex items-center gap-3 rounded-lg border border-gray-100 hover:border-green-200 hover:bg-green-50/30 transition-colors p-3"
            >
              <span
                className={`shrink-0 w-8 h-8 rounded-md ring-1 ${tone} flex items-center justify-center font-extrabold text-sm`}
                title={row.rank_label}
              >
                {row.rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{row.member_name}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                    {row.migs}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">
                  <span className="font-mono">{row.loan_id}</span> · {row.loan_type} · {row.rank_label}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-gray-900 tabular-nums">{PHP(row.amount)}</p>
                {waiting != null && (
                  <p className={`text-[11px] flex items-center justify-end gap-0.5 ${isOld ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                    <Clock size={10} /> {waiting}d waiting
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {pagination.total > limit && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Page <span className="font-semibold text-gray-700">{currentPage}</span> of{" "}
            <span className="font-semibold text-gray-700">{totalPages}</span> ·{" "}
            <span className="tabular-nums">{pagination.total}</span> total
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              disabled={loading || pagination.offset === 0}
              className="p-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={loading || !pagination.has_more}
              className="p-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriorityQueueCard;
