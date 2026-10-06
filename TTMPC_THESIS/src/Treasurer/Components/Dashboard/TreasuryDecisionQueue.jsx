import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Clock, Info, ListOrdered } from "lucide-react";
import { Skeleton } from "../../../components/Skeleton";
import { PHP_FULL } from "./treasuryData";

// Same tone mapping as PriorityQueueCard / the Disbursement page.
const RANK_TONE = {
  1: "bg-red-50 text-red-700 ring-red-200",
  2: "bg-orange-50 text-orange-700 ring-orange-200",
  3: "bg-amber-50 text-amber-700 ring-amber-200",
  4: "bg-yellow-50 text-yellow-800 ring-yellow-200",
  5: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  6: "bg-sky-50 text-sky-700 ring-sky-200",
  7: "bg-violet-50 text-violet-700 ring-violet-200",
};

const FUNDING = {
  fundable:     { label: "Fundable",           cls: "bg-green-50 text-green-700 ring-green-200" },
  review:       { label: "Review",             cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  insufficient: { label: "Insufficient funds", cls: "bg-red-50 text-red-700 ring-red-200" },
};

const RankBadge = ({ rank, title }) => (
  <span
    className={`shrink-0 w-8 h-8 rounded-md ring-1 ${RANK_TONE[rank] || "bg-gray-50 text-gray-700 ring-gray-200"} flex items-center justify-center font-extrabold text-sm`}
    title={title}
  >
    {rank}
  </span>
);

const Waiting = ({ days }) =>
  days == null ? null : (
    <span className={`inline-flex items-center gap-0.5 text-[11px] ${days >= 30 ? "text-red-600 font-semibold" : "text-gray-500"}`}>
      <Clock size={10} /> {days}d waiting
    </span>
  );

const QueueRow = ({ onClick, children }) => (
  <li>
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 rounded-lg border border-gray-100 hover:border-green-200 hover:bg-green-50/30 transition-colors p-3"
    >
      {children}
    </button>
  </li>
);

const StateBox = ({ loading, error, empty, emptyTitle, emptyText }) => {
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
        <AlertCircle size={14} /> {error}
      </div>
    );
  }
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm font-semibold text-gray-700">{emptyTitle}</p>
        <p className="text-xs text-gray-500 mt-1">{emptyText}</p>
      </div>
    );
  }
  return null;
};

/**
 * Summary of the Treasurer's queue — never the decision itself. Approve /
 * Reschedule / Reject stay on Treasurer_ApprovalDetails; every row links there.
 *
 *  - "Awaiting decision": manager-approved loans ('to be disbursed') with the
 *    same funding check the detail page runs (net cash out vs available).
 *  - "Ready for release": loans already approved for disbursement, waiting on
 *    the Cashier (the existing priority queue).
 * Both lists keep the server's order: rank, then longest-waiting first.
 */
const TreasuryDecisionQueue = ({ decision, ready }) => {
  const navigate = useNavigate();
  const [tab, setTab] = useState("decision");

  const dSummary = decision.data?.summary;
  const dRows = decision.data?.rows || [];
  const rSummary = ready.data?.summary;
  const rRows = ready.data?.rows || [];

  const tabs = [
    { key: "decision", label: "Awaiting your decision", count: dSummary?.total_count },
    { key: "ready", label: "Ready for release", count: rSummary?.total_count },
  ];

  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="flex items-center text-gray-800 font-bold text-lg">
            <ListOrdered size={18} className="mr-2 text-green-700" />
            Treasury Decision Queue
          </h3>
          <p className="text-xs text-gray-500 mt-1">Sorted by rank (per TTMPC policy), then longest-waiting first.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/treasurer-approval")}
          className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:text-green-800"
        >
          View all in Loan Approval <ArrowRight size={14} />
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-100 mb-4 overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 -mb-px text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
              tab === t.key ? "border-green-700 text-green-800" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[11px] tabular-nums">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "decision" && (
        <>
          {dSummary && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Needs a funding decision</p>
                <p className="text-lg font-bold text-gray-900 tabular-nums">
                  {dSummary.total_count} loan{dSummary.total_count === 1 ? "" : "s"} · {PHP_FULL(dSummary.total_net_cash_out)}{" "}
                  <span className="text-xs font-medium text-gray-500">net cash out</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                {dSummary.fundable_count > 0 && <span className={`px-2 py-1 rounded-full ring-1 ${FUNDING.fundable.cls}`}>{dSummary.fundable_count} fundable</span>}
                {dSummary.review_count > 0 && <span className={`px-2 py-1 rounded-full ring-1 ${FUNDING.review.cls}`}>{dSummary.review_count} to review</span>}
                {dSummary.insufficient_count > 0 && <span className={`px-2 py-1 rounded-full ring-1 ${FUNDING.insufficient.cls}`}>{dSummary.insufficient_count} short of funds</span>}
              </div>
            </div>
          )}

          {dSummary?.rescheduled_now_fundable > 0 && (
            <button
              type="button"
              onClick={() => navigate("/treasurer-approval")}
              className="w-full text-left rounded-lg border border-green-200 bg-green-50 px-3 py-2 mb-4 text-sm text-green-800 flex items-center gap-2"
            >
              <Info size={14} className="shrink-0" />
              {dSummary.rescheduled_now_fundable} of {dSummary.rescheduled_count} rescheduled loan{dSummary.rescheduled_count === 1 ? "" : "s"} now fit available cash. Check the Rescheduled tab.
            </button>
          )}

          <StateBox
            loading={decision.isPending}
            error={decision.error?.message}
            empty={dRows.length === 0}
            emptyTitle="Nothing awaiting your decision"
            emptyText="Manager-approved loans will appear here for a funding check."
          />

          {!decision.isPending && !decision.error && dRows.length > 0 && (
            <ul className="space-y-2">
              {dRows.map((row) => {
                const funding = FUNDING[row.funding_status] || FUNDING.review;
                return (
                  <QueueRow
                    key={`${row.source}-${row.loan_id}`}
                    onClick={() => navigate(`/treasurer-approval/${row.loan_id}?source=${row.source}`)}
                  >
                    <RankBadge rank={row.rank} title={row.rank_label} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{row.member_name}</p>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                          {row.migs}
                        </span>
                        {row.is_renewal && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 shrink-0">
                            Renewal
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        <span className="font-mono">{row.loan_id}</span> · {row.rank_label}
                      </p>
                    </div>
                    <div className="hidden sm:block shrink-0 text-right">
                      <p className="text-sm font-bold text-gray-900 tabular-nums" title={row.is_estimated ? "Gross amount — no fee computation for non-member loans" : `Principal ${PHP_FULL(row.loan_amount)}`}>
                        {PHP_FULL(row.net_cash_out)}
                      </p>
                      <p className="text-[11px] text-gray-500">{row.is_estimated ? "gross (estimate)" : "net release"}</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1 w-[7.5rem]">
                      <span
                        className={`px-2 py-0.5 rounded-full ring-1 text-[11px] font-bold ${funding.cls}`}
                        title={row.shortfall > 0 ? `Short by ${PHP_FULL(row.shortfall)}` : undefined}
                      >
                        {funding.label}
                      </span>
                      <span className="sm:hidden text-xs font-bold text-gray-900 tabular-nums">{PHP_FULL(row.net_cash_out)}</span>
                      <Waiting days={row.days_waiting} />
                    </div>
                  </QueueRow>
                );
              })}
            </ul>
          )}
          {dSummary && dSummary.total_count > dRows.length && (
            <p className="text-xs text-gray-500 mt-3">
              Showing the top {dRows.length} of {dSummary.total_count}. Open Loan Approval for the full queue.
            </p>
          )}
        </>
      )}

      {tab === "ready" && (
        <>
          {rSummary && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Approved, awaiting Cashier release</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums">
                {rSummary.total_count} loan{rSummary.total_count === 1 ? "" : "s"} · {PHP_FULL(rSummary.total_amount)}{" "}
                <span className="text-xs font-medium text-gray-500">principal</span>
              </p>
            </div>
          )}

          <StateBox
            loading={ready.isPending}
            error={ready.error?.message}
            empty={rRows.length === 0}
            emptyTitle="Queue is empty"
            emptyText="No loans are currently awaiting release."
          />

          {!ready.isPending && !ready.error && rRows.length > 0 && (
            <ul className="space-y-2">
              {rRows.map((row) => (
                <QueueRow key={row.loan_id} onClick={() => navigate(`/treasurer-approval/${row.loan_id}?source=loans`)}>
                  <RankBadge rank={row.rank} title={row.rank_label} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{row.member_name}</p>
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                        {row.migs}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      <span className="font-mono">{row.loan_id}</span> · {row.rank_label}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-gray-900 tabular-nums">{PHP_FULL(row.amount)}</p>
                    <Waiting days={row.days_waiting} />
                  </div>
                </QueueRow>
              ))}
            </ul>
          )}
          {rSummary && rSummary.total_count > rRows.length && (
            <p className="text-xs text-gray-500 mt-3">
              Showing the top {rRows.length} of {rSummary.total_count}.
            </p>
          )}
        </>
      )}
    </section>
  );
};

export default TreasuryDecisionQueue;
