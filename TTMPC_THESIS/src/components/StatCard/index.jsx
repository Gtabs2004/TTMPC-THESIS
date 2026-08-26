import React from "react";

/**
 * Single-source-of-truth KPI stat card for all staff portals. Every "summary
 * cards" / "KPI row" block at the top of a list or dashboard page should
 * render <StatCardRow> of <StatCard>s instead of hand-rolling its own grid —
 * the same problem the sidebar and header had (every page invented its own
 * padding, icon treatment, and font sizes).
 *
 * Canonical shape, taken from Manager_Reports.jsx (the reference the system
 * converged on): white card, label + bare colored icon on one row, big bold
 * number below, optional small gray subtext at the bottom. No icon badge/
 * circle — the icon is just colored text, no wrapper div.
 */
export function StatCard({ label, value, icon: Icon, iconColor = "text-blue-600", subtext, className = "", onClick }) {
  // Interactive variant (e.g. "Pending Release" cards that jump to the
  // relevant queue) renders as a real <button> instead of a <div> — same
  // visual shape, but focusable/keyboard-operable and with a hover cue.
  const Tag = onClick ? "button" : "div";
  const cardClass = `bg-white p-5 rounded-xl shadow-sm border border-gray-100 ${
    onClick ? "text-left hover:border-green-300 hover:shadow-md transition" : ""
  } ${className}`;

  return (
    <Tag className={cardClass} {...(onClick ? { type: "button", onClick } : {})}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        {Icon ? <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} /> : null}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subtext ? <p className="text-[11px] text-gray-500 mt-1">{subtext}</p> : null}
    </Tag>
  );
}

const COLS_CLASS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-5",
};

/**
 * Grid wrapper for a row of <StatCard>s. `cols` is the target column count
 * at the lg breakpoint (2/3/4/5) — always 1 column on the smallest phones,
 * 2 from sm, the requested count from lg. Gap and bottom margin are fixed so
 * every stat row in the system has the same rhythm.
 */
export function StatCardRow({ children, cols = 4, className = "" }) {
  return (
    <div className={`grid grid-cols-1 ${COLS_CLASS[cols] || COLS_CLASS[4]} gap-4 mb-6 ${className}`}>
      {children}
    </div>
  );
}

export default StatCard;
