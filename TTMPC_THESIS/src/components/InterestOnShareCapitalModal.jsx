import React, { useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, Calculator, Banknote } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import { UserAuth } from "../contex/AuthContext";
import { useNotification } from "../contex/NotificationContext";

/**
 * Interest on Share Capital — shared modal used by both the Bookkeeper and
 * Cashier Capital Build-Up pages (never a standalone page/module — see
 * WHAT_IFS_AND_CONSTRAINTS.txt-adjacent product notes on this feature).
 *
 * Visual shell intentionally mirrors ConfirmDialog (same overlay, corner
 * radius, header/close-button treatment, button styling) so it reads as one
 * of the system's existing modals rather than a new design language. Stage 2
 * ("Second Verification") reuses ConfirmDialog directly rather than
 * reinventing a confirm dialog.
 *
 * FRONTEND-ONLY STAGE: this does not write to the database yet. `members`
 * is the real CBU roster already fetched by the host page (no dummy data,
 * no second query), so the preview numbers are real — but Confirm & Post
 * currently only simulates a successful posting so the full workflow can be
 * reviewed before the backend/atomic-posting/duplicate-year work lands.
 * Eligibility rule (balance > 0) and basis (current_balance) are working
 * assumptions, isolated in computeEligibleRows() below, so they're a
 * one-place change once the real business rule is confirmed.
 */

const FEATURE_NAME = "Interest on Share Capital";

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => currentYear - i);

// Working assumption: eligible = a real recorded CBU balance greater than
// zero, basis = current balance. Isolated here so it's a one-place swap
// once the real eligibility rule is confirmed.
function computeEligibleRows(members, ratePercent) {
  const rate = Number(ratePercent || 0) / 100;
  return (members || [])
    .filter((m) => Number(m.current_balance || 0) > 0)
    .map((m) => {
      const basis = Number(m.current_balance || 0);
      return {
        member_uuid: m.member_uuid,
        member_id: m.member_id,
        member_name: m.member_name,
        basis,
        interest: basis * rate,
      };
    })
    .sort((a, b) => b.basis - a.basis);
}

export default function InterestOnShareCapitalModal({ open, onClose, members }) {
  const { session } = UserAuth();
  const { addNotification } = useNotification();

  const [stage, setStage] = useState("input"); // 'input' | 'preview'
  const [year, setYear] = useState(currentYear);
  const [rate, setRate] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!open) {
      setStage("input");
      setYear(currentYear);
      setRate("");
      setShowConfirm(false);
      setPosting(false);
    }
  }, [open]);

  const rateNum = Number(rate);
  const rateValid = rate !== "" && Number.isFinite(rateNum) && rateNum > 0 && rateNum <= 100;
  const yearValid = Number.isInteger(year);

  const rows = useMemo(() => computeEligibleRows(members, rateValid ? rateNum : 0), [members, rateValid, rateNum]);
  const totals = useMemo(
    () => ({
      eligibleCount: rows.length,
      totalBasis: rows.reduce((sum, r) => sum + r.basis, 0),
      totalInterest: rows.reduce((sum, r) => sum + r.interest, 0),
    }),
    [rows]
  );

  if (!open) return null;

  const handleCalculate = () => {
    if (!yearValid || !rateValid) return;
    setStage("preview");
  };

  const handleConfirmPost = () => {
    setPosting(true);
    // Frontend-only for now: no write happens here. This simulates the
    // posting round-trip so the workflow can be reviewed end-to-end; the
    // real implementation will call an atomic backend endpoint instead.
    window.setTimeout(() => {
      setPosting(false);
      setShowConfirm(false);
      onClose?.();
      addNotification(
        `${FEATURE_NAME} for ${year} has been successfully posted for ${totals.eligibleCount} members.`,
        "success"
      );
    }, 600);
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
                    ? "Enter the accounting year and rate to calculate."
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
                      Accounting Year
                    </label>
                    <select
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                      className="w-full h-11 border border-gray-300 rounded-lg px-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-colors"
                    >
                      {YEAR_OPTIONS.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Interest on Share Capital Rate
                    </label>
                    <div
                      className={`flex items-stretch h-11 rounded-lg border bg-gray-50 focus-within:bg-white transition-colors overflow-hidden ${
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
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                  Calculating does not create or modify any financial record. Review the preview
                  before posting.
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-4 pt-4">
                    {FEATURE_NAME} Preview
                  </p>
                  <dl className="grid grid-cols-2 gap-y-2 text-sm px-4 py-3">
                    <dt className="text-gray-500">Year</dt>
                    <dd className="text-right font-semibold text-gray-900">{year}</dd>
                    <dt className="text-gray-500">Rate</dt>
                    <dd className="text-right font-semibold text-gray-900">{rateNum}%</dd>
                    <dt className="text-gray-500">Eligible Members</dt>
                    <dd className="text-right font-semibold text-gray-900">{totals.eligibleCount}</dd>
                    <dt className="text-gray-500">Total CBU/Share Basis</dt>
                    <dd className="text-right font-semibold text-gray-900">{formatCurrency(totals.totalBasis)}</dd>
                  </dl>
                  <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
                    <span className="text-sm font-semibold text-gray-700">Total {FEATURE_NAME}</span>
                    <span className="text-xl font-extrabold text-green-700 tabular-nums">
                      {formatCurrency(totals.totalInterest)}
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
                            <th className="p-3 font-bold text-right">Eligible CBU Balance</th>
                            <th className="p-3 font-bold text-right">{FEATURE_NAME}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="p-4 text-center text-sm text-gray-500">
                                No eligible members found for this calculation.
                              </td>
                            </tr>
                          ) : (
                            rows.map((row) => (
                              <tr key={row.member_uuid || row.member_id} className="border-b border-gray-100">
                                <td className="p-3 text-sm">
                                  <p className="text-gray-900 font-medium">{row.member_name}</p>
                                  <p className="text-[10px] text-gray-500">{row.member_id}</p>
                                </td>
                                <td className="p-3 text-sm text-right text-gray-700 tabular-nums">
                                  {formatCurrency(row.basis)}
                                </td>
                                <td className="p-3 text-sm text-right font-semibold text-gray-900 tabular-nums">
                                  {formatCurrency(row.interest)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
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
                disabled={!yearValid || !rateValid}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Calculator className="w-4 h-4" /> Calculate
              </button>
            ) : (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={rows.length === 0}
                className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm & Post
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title={`Confirm ${FEATURE_NAME}`}
        tone="warning"
        confirmLabel="Confirm & Post"
        loading={posting}
        onConfirm={handleConfirmPost}
        onCancel={() => setShowConfirm(false)}
      >
        <div className="text-sm text-gray-700 space-y-2">
          <p>
            You are about to post the {year} {FEATURE_NAME}.
          </p>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Rate</span><span className="font-semibold">{rateNum}%</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Eligible Members</span><span className="font-semibold">{totals.eligibleCount}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Total {FEATURE_NAME}</span><span className="font-semibold">{formatCurrency(totals.totalInterest)}</span></div>
          </div>
          <p className="text-xs text-gray-500">
            This will create the corresponding financial records and update the affected members' CBU.
          </p>
          {session?.user?.email && (
            <p className="text-[11px] text-gray-400">Posting as {session.user.email}</p>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
}
