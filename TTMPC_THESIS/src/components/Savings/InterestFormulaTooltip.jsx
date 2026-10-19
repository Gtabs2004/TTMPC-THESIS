import React, { useState } from "react";
import { Info } from "lucide-react";

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
};

// Floating breakdown for one passbook line's accrued interest: elapsed days
// since the previous ledger line × the resulting balance × (1% / 365),
// matching the confirmed v2 savings-interest rule (see SAVINGS_INTEREST_V2_PLAN.md).
const InterestFormulaTooltip = ({ days, balance, rate = 0.01, amount, fromDate, toDate, children }) => {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-gray-700 hover:text-emerald-700 focus:outline-none"
        aria-label="Show interest calculation"
      >
        {children}
        <Info size={13} className="text-gray-400" />
      </button>

      {open && (
        <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-700 shadow-lg">
          <p className="font-semibold text-gray-900 mb-1.5">Accrued Interest Breakdown</p>
          <p className="mb-1">
            Holding Period: <span className="font-medium">{days} day{days === 1 ? "" : "s"}</span>
            {fromDate && toDate ? (
              <span className="text-gray-500"> ({formatDate(fromDate)} → {formatDate(toDate)})</span>
            ) : null}
          </p>
          <p className="mb-1">
            Applicable Total Balance: <span className="font-medium">{formatCurrency(balance)}</span>
          </p>
          <p className="text-gray-600">
            Calculation: {days} days × {formatCurrency(balance)} × ({(rate * 100).toFixed(2)}% / 365) ={" "}
            <span className="font-semibold text-emerald-700">{formatCurrency(amount)}</span>
          </p>
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white" />
        </div>
      )}
    </span>
  );
};

export default InterestFormulaTooltip;
