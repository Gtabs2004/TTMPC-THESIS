import React, { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import {
  createOverrideRequest,
  OVERRIDE_REASON_MAX,
  OVERRIDE_REASON_MIN,
} from "../../utils/renewalOverrides";

/*
  RenewalOverrideModal
  --------------------
  Member-side request to waive the 6-month renewal rule for ONE active loan.
  The request goes to the Bookkeeper, who approves or rejects it; an approved
  request unlocks Renewal for that loan for a limited time.

  The form is a separate component mounted only while the modal is open, so it
  starts empty every time without any reset logic.
*/

function OverrideForm({ onClose, loanType, bucket, onSubmitted }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onClose]);

  const trimmedLength = reason.trim().length;
  const tooShort = trimmedLength < OVERRIDE_REASON_MIN;
  const paymentsMade = Number(bucket?.payments_made ?? 0);
  const typeLabel = loanType.charAt(0).toUpperCase() + loanType.slice(1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (tooShort || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const created = await createOverrideRequest(loanType, reason.trim());
      onSubmitted?.(created);
      onClose();
    } catch (err) {
      setError(err?.message || "Could not send your request. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:px-4 sm:py-6 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="renewal-override-title"
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-5 sm:p-6 shadow-xl dark:bg-gray-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="renewal-override-title" className="text-lg font-bold text-gray-900 dark:text-white">
              Request early {typeLabel} renewal
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {typeLabel} Loan {bucket?.active_loan_id || ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          Renewal normally opens after 6 monthly payments. You have made{" "}
          <span className="font-bold">{paymentsMade} of 6</span>. If you have an urgent need, tell the Bookkeeper why.
          They will review your request and may unlock Renewal for this loan.
        </p>

        <label htmlFor="renewal-override-reason" className="mt-4 block text-sm font-semibold text-gray-800 dark:text-gray-200">
          Why do you need this loan now?
        </label>
        <textarea
          id="renewal-override-reason"
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, OVERRIDE_REASON_MAX))}
          rows={5}
          disabled={submitting}
          placeholder="e.g. Hospital admission for a family member; the bill is due next week."
          className="mt-1.5 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-member-green focus:outline-none focus:ring-2 focus:ring-member-green/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
          <span className={tooShort && trimmedLength > 0 ? "text-red-600 dark:text-red-400" : ""}>
            At least {OVERRIDE_REASON_MIN} characters
          </span>
          <span>{trimmedLength}/{OVERRIDE_REASON_MAX}</span>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={tooShort || submitting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-member-green px-4 py-2 text-sm font-bold text-white hover:bg-[#154718] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Sending..." : "Send to Bookkeeper"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function RenewalOverrideModal({ open, loanType, ...rest }) {
  if (!open || !loanType) return null;
  return <OverrideForm loanType={loanType} {...rest} />;
}
