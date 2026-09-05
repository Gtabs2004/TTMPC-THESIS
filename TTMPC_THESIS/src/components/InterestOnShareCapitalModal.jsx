import React, { useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, Calculator, Banknote } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import { supabase } from "../supabaseClient";
import { UserAuth } from "../contex/AuthContext";
import { useNotification } from "../contex/NotificationContext";

/**
 * Interest on Share Capital — shared modal used by both the Bookkeeper and
 * Cashier Capital Build-Up pages (never a standalone page/module). See
 * ISC_DIVIDEND_PLAN.md at the repo root for the full design rationale;
 * this component implements it directly rather than restating it.
 *
 * The basis is the member's AVERAGE share capital across every month in the
 * chosen range, which only the database can compute (it needs the whole
 * capital_build_up history, not just the current balance the host page
 * already has). So both "Calculate" and "Confirm & Post" call Postgres RPCs
 * (`isc_calculate_preview`, `isc_post`) directly via supabase.rpc() rather
 * than doing anything locally — this also means auth.uid() on the server is
 * the real signed-in bookkeeper, not a backend service account (§5.1).
 *
 * `canPost` controls whether the Post button renders at all (not just
 * disabled) — see §5.4. The real guard is server-side regardless: isc_post()
 * and isc_reverse() each check the caller's role themselves.
 */

const FEATURE_NAME = "Interest on Share Capital";
const EARLIEST_MONTH = "2025-12";

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatMonth = (monthStr) => {
  if (!monthStr) return "—";
  const [year, month] = monthStr.split("-").map(Number);
  if (!year || !month) return monthStr;
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
};

const currentMonthStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export default function InterestOnShareCapitalModal({ open, onClose, canPost = false, onPosted }) {
  const { session } = UserAuth();
  const { addNotification } = useNotification();

  const [stage, setStage] = useState("input"); // 'input' | 'preview'
  const [fromMonth, setFromMonth] = useState(EARLIEST_MONTH);
  const [toMonth, setToMonth] = useState(currentMonthStr());
  const [rate, setRate] = useState("");

  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState("");
  const [rows, setRows] = useState([]);
  const [monthCount, setMonthCount] = useState(0);

  const [showConfirm, setShowConfirm] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  useEffect(() => {
    if (!open) {
      setStage("input");
      setFromMonth(EARLIEST_MONTH);
      setToMonth(currentMonthStr());
      setRate("");
      setCalculating(false);
      setCalcError("");
      setRows([]);
      setMonthCount(0);
      setShowConfirm(false);
      setPosting(false);
      setPostError("");
    }
  }, [open]);

  const rateNum = Number(rate);
  const rateValid = rate !== "" && Number.isFinite(rateNum) && rateNum > 0 && rateNum <= 100;
  const rangeValid =
    !!fromMonth && !!toMonth && fromMonth >= EARLIEST_MONTH && toMonth >= fromMonth;

  const totals = useMemo(
    () => ({
      eligibleCount: rows.length,
      totalBasis: rows.reduce((sum, r) => sum + Number(r.average_share_capital || 0), 0),
      totalInterest: rows.reduce((sum, r) => sum + Number(r.interest_amount || 0), 0),
    }),
    [rows]
  );

  if (!open) return null;

  const handleCalculate = async () => {
    if (!rangeValid) return;
    setCalculating(true);
    setCalcError("");
    try {
      const { data, error } = await supabase.rpc("isc_calculate_preview", {
        p_period_start: `${fromMonth}-01`,
        p_period_end: `${toMonth}-01`,
        p_rate: rateValid ? rateNum : null,
      });
      if (error) throw new Error(error.message || "Failed to calculate Interest on Share Capital.");

      const result = Array.isArray(data) ? data : [];
      setRows(result);
      setMonthCount(result[0]?.month_count || 0);
      setStage("preview");
    } catch (err) {
      setCalcError(err?.message || "Unable to calculate Interest on Share Capital.");
    } finally {
      setCalculating(false);
    }
  };

  const handleConfirmPost = async () => {
    if (!rateValid) return;
    setPosting(true);
    setPostError("");
    try {
      const { error } = await supabase.rpc("isc_post", {
        p_period_start: `${fromMonth}-01`,
        p_period_end: `${toMonth}-01`,
        p_rate: rateNum,
      });
      if (error) throw new Error(error.message || "Failed to post Interest on Share Capital.");

      setShowConfirm(false);
      onClose?.();
      onPosted?.();
      addNotification(
        `${FEATURE_NAME} for ${formatMonth(fromMonth)} – ${formatMonth(toMonth)} has been successfully posted for ${totals.eligibleCount} members.`,
        "success"
      );
    } catch (err) {
      setPostError(err?.message || "Unable to post Interest on Share Capital.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 dialog-enter"
        onClick={() => !showConfirm && onClose?.()}
      >
        <div
          className="dialog-card bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-transparent"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-6 py-5 bg-gray-50 border-b border-gray-100 rounded-t-xl shrink-0">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-600 flex items-center justify-center shrink-0">
                <Banknote className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{FEATURE_NAME}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {stage === "input"
                    ? "Choose a month range and, optionally, a rate to calculate."
                    : "Review the calculation before posting."}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            {stage === "input" ? (
              <>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      From Month
                    </label>
                    <input
                      type="month"
                      min={EARLIEST_MONTH}
                      value={fromMonth}
                      onChange={(e) => setFromMonth(e.target.value)}
                      className="w-full h-11 border border-gray-300 rounded-lg px-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      To Month
                    </label>
                    <input
                      type="month"
                      min={fromMonth || EARLIEST_MONTH}
                      value={toMonth}
                      onChange={(e) => setToMonth(e.target.value)}
                      className="w-full h-11 border border-gray-300 rounded-lg px-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-colors"
                    />
                  </div>
                </div>

                {!rangeValid && (fromMonth || toMonth) && (
                  <p className="text-[11px] text-red-600 -mt-3">
                    The range cannot start before December 2025, and the end month must not come
                    before the start month.
                  </p>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Interest on Share Capital Rate <span className="text-gray-400 font-normal">(optional to calculate)</span>
                  </label>
                  <div
                    className={`flex items-stretch h-11 rounded-lg border bg-gray-50 focus-within:bg-white transition-colors overflow-hidden max-w-[200px] ${
                      rate !== "" && !rateValid
                        ? "border-red-300 focus-within:ring-2 focus-within:ring-red-400/50"
                        : "border-gray-300 focus-within:ring-2 focus-within:ring-green-500/50 focus-within:border-green-500"
                    }`}
                  >
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      placeholder="5.00"
                      className="min-w-0 flex-1 bg-transparent px-3 text-sm focus:outline-none"
                    />
                    <span className="flex items-center px-3 text-sm font-semibold text-gray-500 bg-gray-100 border-l border-gray-200 shrink-0">
                      %
                    </span>
                  </div>
                  {rate !== "" && !rateValid && (
                    <p className="text-[11px] text-red-600 mt-1">Enter a rate between 0 and 100%.</p>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 space-y-1">
                  <p>
                    Calculating does not create or modify any financial record. You can leave the
                    rate blank to see eligible members and the total share capital basis first.
                  </p>
                  <p>
                    The basis is each member's <strong>average share capital</strong> across every
                    month in the range you choose, not just today's balance.
                  </p>
                </div>

                {calcError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                    {calcError}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-4 pt-4">
                    {FEATURE_NAME} Preview
                  </p>
                  <dl className="grid grid-cols-2 gap-y-2 text-sm px-4 py-3">
                    <dt className="text-gray-500">Period</dt>
                    <dd className="text-right font-semibold text-gray-900">
                      {formatMonth(fromMonth)} – {formatMonth(toMonth)}
                    </dd>
                    <dt className="text-gray-500">Months</dt>
                    <dd className="text-right font-semibold text-gray-900">{monthCount}</dd>
                    <dt className="text-gray-500">Rate</dt>
                    <dd className="text-right font-semibold text-gray-900">
                      {rateValid ? `${rateNum}%` : "— (not set)"}
                    </dd>
                    <dt className="text-gray-500">Eligible Members</dt>
                    <dd className="text-right font-semibold text-gray-900">{totals.eligibleCount}</dd>
                    <dt className="text-gray-500">Total Share Capital Basis</dt>
                    <dd className="text-right font-semibold text-gray-900">{formatCurrency(totals.totalBasis)}</dd>
                  </dl>
                  <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
                    <span className="text-sm font-semibold text-gray-700">Total {FEATURE_NAME}</span>
                    <span className="text-xl font-extrabold text-green-700 tabular-nums">
                      {rateValid ? formatCurrency(totals.totalInterest) : "—"}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Member Breakdown
                  </p>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0">
                          <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                            <th className="p-3 font-bold">Member</th>
                            <th className="p-3 font-bold text-right">Total Share Capital</th>
                            <th className="p-3 font-bold text-right">Average Share Capital</th>
                            <th className="p-3 font-bold text-right">{FEATURE_NAME}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="p-4 text-center text-sm text-gray-500">
                                No eligible members found for this calculation.
                              </td>
                            </tr>
                          ) : (
                            rows.map((row) => (
                              <tr key={row.member_id} className="border-b border-gray-100">
                                <td className="p-3 text-sm">
                                  <p className="text-gray-900 font-medium">{row.member_name}</p>
                                  <p className="text-[10px] text-gray-500">{row.membership_id}</p>
                                </td>
                                <td className="p-3 text-sm text-right text-gray-700 tabular-nums">
                                  {formatCurrency(row.total_share_capital)}
                                </td>
                                <td className="p-3 text-sm text-right text-gray-700 tabular-nums">
                                  {formatCurrency(row.average_share_capital)}
                                </td>
                                <td className="p-3 text-sm text-right font-semibold text-gray-900 tabular-nums">
                                  {row.interest_amount === null || row.interest_amount === undefined
                                    ? "—"
                                    : formatCurrency(row.interest_amount)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {!canPost && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                    Posting is performed by the Bookkeeper.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer — actions cluster to the right, per the modal footer convention */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 rounded-b-xl flex items-center justify-end gap-3 shrink-0">
            {stage === "preview" ? (
              <button
                onClick={() => setStage("input")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            )}

            {stage === "input" ? (
              <button
                onClick={handleCalculate}
                disabled={!rangeValid || calculating}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Calculator className="w-4 h-4" /> {calculating ? "Calculating..." : "Calculate"}
              </button>
            ) : canPost ? (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={rows.length === 0 || !rateValid}
                title={!rateValid ? "Enter a rate before posting." : undefined}
                className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm & Post
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {canPost && (
        <ConfirmDialog
          open={showConfirm}
          title={`Confirm ${FEATURE_NAME}`}
          tone="warning"
          confirmLabel="Confirm & Post"
          loading={posting}
          errorMessage={postError}
          onConfirm={handleConfirmPost}
          onCancel={() => setShowConfirm(false)}
        >
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              You are about to post {FEATURE_NAME} for {formatMonth(fromMonth)} – {formatMonth(toMonth)}.
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Rate</span><span className="font-semibold">{rateNum}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Eligible Members</span><span className="font-semibold">{totals.eligibleCount}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total {FEATURE_NAME}</span><span className="font-semibold">{formatCurrency(totals.totalInterest)}</span></div>
            </div>
            <p className="text-xs text-gray-500">
              This will create permanent financial records and update the affected members' CBU
              balances. This cannot be undone directly — only a manager can reverse it afterward.
            </p>
            {session?.user?.email && (
              <p className="text-[11px] text-gray-400">Posting as {session.user.email}</p>
            )}
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
