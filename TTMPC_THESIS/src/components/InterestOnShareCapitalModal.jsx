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

// Months in an inclusive "YYYY-MM".."YYYY-MM" range. Shown live under the
// pickers so the divisor is visible before calculating, not a surprise after.
const monthsBetween = (from, to) => {
  if (!from || !to) return 0;
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return 0;
  return (ty - fy) * 12 + (tm - fm) + 1;
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
  const [coopCbuTotal, setCoopCbuTotal] = useState(null);

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
      setCoopCbuTotal(null);
      setShowConfirm(false);
      setPosting(false);
      setPostError("");
    }
  }, [open]);

  const rateNum = Number(rate);
  const rateValid = rate !== "" && Number.isFinite(rateNum) && rateNum > 0 && rateNum <= 100;
  const rangeValid =
    !!fromMonth && !!toMonth && fromMonth >= EARLIEST_MONTH && toMonth >= fromMonth;
  const liveMonthCount = rangeValid ? monthsBetween(fromMonth, toMonth) : 0;

  // What this posting does to the cooperative's books. Null until Calculate
  // has run, and null if the total could not be read — callers must handle it.
  const impact = useMemo(() => {
    if (coopCbuTotal === null || !Number.isFinite(coopCbuTotal) || coopCbuTotal <= 0) return null;
    const interest = rows.reduce((sum, r) => sum + Number(r.interest_amount || 0), 0);
    if (interest <= 0) return null;
    return {
      before: coopCbuTotal,
      after: coopCbuTotal + interest,
      growthPct: (interest / coopCbuTotal) * 100,
    };
  }, [coopCbuTotal, rows]);

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

      // The cooperative's CURRENT total share capital, so the preview and the
      // confirmation can show what this posting does to the books rather than
      // only what it pays out.
      //
      // DERIVED FROM THE PREVIEW ROWS, never from a direct capital_build_up
      // read. capital_build_up carries BOTH a staff policy (is_cbu_staff) and a
      // member policy (cbu_member_select_own); a signed-in bookkeeper who is
      // also a member matched the member policy and got back only their OWN
      // rows, so the total read PHP 185,543.13 instead of PHP 30.2M and the
      // growth line claimed +806%. isc_calculate_preview() is SECURITY DEFINER
      // and already returns every eligible member, so summing its closing
      // balances is both correct and free of another round trip.
      //
      // Note this is the total across ELIGIBLE members (active, positive
      // balance) rather than every row in the ledger — which is the right
      // denominator here, since those are exactly the members being paid.
      setCoopCbuTotal(
        result.reduce((sum, r) => sum + Number(r.total_share_capital || 0), 0)
      );

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
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <Banknote className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{FEATURE_NAME}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {stage === "input"
                    ? "Pay interest to members based on their share capital."
                    : "Check these figures before anything is saved."}
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

          {/* Where am I? The workflow has three stages and stage 1 gave no hint
              that stages 2 and 3 existed, so the shape of the task was invisible
              until you were already inside it. */}
          <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-white shrink-0">
            {[
              { n: 1, label: "Choose period" },
              { n: 2, label: "Review" },
              { n: 3, label: "Confirm" },
            ].map((s, i) => {
              const current = stage === "input" ? 1 : showConfirm ? 3 : 2;
              const done = s.n < current;
              const active = s.n === current;
              return (
                <React.Fragment key={s.n}>
                  {i > 0 && (
                    <div
                      className={`h-px flex-1 ${done || active ? "bg-primary/40" : "bg-gray-200"}`}
                    />
                  )}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        active
                          ? "bg-primary text-white"
                          : done
                          ? "bg-green-50 text-primary-deep"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {done ? "✓" : s.n}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        active ? "text-gray-900" : done ? "text-primary-deep" : "text-gray-400"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            {stage === "input" ? (
              <>
                {/* ONE question, not two disconnected fields. The old "From
                    Month / To Month" pair named the inputs but never said what
                    the months were FOR, and gave no feedback until Calculate. */}
                <div>
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <label className="block text-sm font-bold text-gray-900">
                      Which period are you paying interest for?
                    </label>
                    {rangeValid && (
                      <span className="text-xs font-semibold text-primary-deep shrink-0">
                        {liveMonthCount} {liveMonthCount === 1 ? "month" : "months"}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <input
                      type="month"
                      min={EARLIEST_MONTH}
                      value={fromMonth}
                      onChange={(e) => setFromMonth(e.target.value)}
                      aria-label="Period start month"
                      className="w-full h-11 border border-gray-300 rounded-lg px-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                    <span className="text-xs font-semibold text-gray-400 px-1">to</span>
                    <input
                      type="month"
                      min={fromMonth || EARLIEST_MONTH}
                      value={toMonth}
                      onChange={(e) => setToMonth(e.target.value)}
                      aria-label="Period end month"
                      className="w-full h-11 border border-gray-300 rounded-lg px-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>

                  {rangeValid ? (
                    <p className="text-xs text-gray-600 mt-2">
                      Each member's share capital will be averaged over these{" "}
                      <strong>{liveMonthCount} months</strong> — their total across the
                      period divided by {liveMonthCount}.
                    </p>
                  ) : (
                    (fromMonth || toMonth) && (
                      <p className="text-[11px] text-red-600 mt-2">
                        The period cannot start before December 2025, and the end month must not
                        come before the start month.
                      </p>
                    )
                  )}
                </div>

                <div className="border-t border-gray-100" />

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-1">
                    Interest rate
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Leave blank to preview the members and total basis first — you can add the
                    rate before posting.
                  </p>
                  <div
                    className={`flex items-stretch h-11 rounded-lg border bg-gray-50 focus-within:bg-white transition-colors overflow-hidden max-w-[200px] ${
                      rate !== "" && !rateValid
                        ? "border-red-300 focus-within:ring-2 focus-within:ring-red-400/50"
                        : "border-gray-300 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary"
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

                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 flex items-start gap-2">
                  <span className="text-primary-deep text-sm leading-none mt-0.5">&#10003;</span>
                  <p className="text-xs text-gray-600">
                    Nothing is saved yet. You'll see the full breakdown before anything is posted.
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
                    <span className="text-xl font-extrabold text-primary-deep tabular-nums">
                      {rateValid ? formatCurrency(totals.totalInterest) : "—"}
                    </span>
                  </div>
                  {impact && (
                    <div className="flex items-center justify-between px-4 py-2 bg-white border-t border-gray-100">
                      <span className="text-xs text-gray-500">
                        Cooperative share capital after posting
                      </span>
                      <span className="text-xs text-gray-700 tabular-nums">
                        {formatCurrency(impact.after)}{" "}
                        <span className="font-semibold text-primary-deep">
                          (+{impact.growthPct.toFixed(2)}%)
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Member Breakdown
                  </p>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0">
                          <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
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
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary hover:bg-primary-deep text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Calculator className="w-4 h-4" /> {calculating ? "Calculating..." : "Calculate"}
              </button>
            ) : canPost ? (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={rows.length === 0 || !rateValid}
                title={!rateValid ? "Enter a rate before posting." : undefined}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-deep text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

            {/* What this does to the BOOKS, not just what it pays out. This is
                the last screen before money moves, so it is where the scale of
                the decision has to be legible. The growth percentage is also a
                typo guard: 5% shows ~5%, a mistyped 50% shows ~50%. */}
            {impact && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
                <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wide">
                  Effect on cooperative share capital
                </p>
                <div className="flex justify-between text-xs">
                  <span className="text-amber-800">Before</span>
                  <span className="font-semibold text-amber-900 tabular-nums">
                    {formatCurrency(impact.before)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-amber-800">After</span>
                  <span className="font-semibold text-amber-900 tabular-nums">
                    {formatCurrency(impact.after)}
                  </span>
                </div>
                <div className="flex justify-between text-xs border-t border-amber-200 pt-1">
                  <span className="text-amber-800">Growth</span>
                  <span className="font-extrabold text-amber-900 tabular-nums">
                    +{impact.growthPct.toFixed(2)}%
                  </span>
                </div>
              </div>
            )}
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
