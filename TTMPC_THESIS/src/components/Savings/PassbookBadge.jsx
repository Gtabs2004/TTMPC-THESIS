import React from "react";
import { ArrowDownCircle, ArrowUpCircle, Sparkles } from "lucide-react";

const STYLES = {
  CD: {
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    label: "Deposit",
    code: "CD",
    Icon: ArrowDownCircle,
  },
  WD: {
    className: "bg-rose-50 text-rose-700 border border-rose-200",
    label: "Withdrawal",
    code: "WD",
    Icon: ArrowUpCircle,
  },
  "Int.": {
    className: "bg-blue-50 text-blue-700 border border-blue-200",
    label: "Interest",
    code: "Int.",
    Icon: Sparkles,
  },
};

// `code` also accepts "INIT" (opening balance) as a neutral fallback so the
// mock/legacy opening-balance row doesn't render as an unstyled blob.
const PassbookBadge = ({ code }) => {
  const entry = STYLES[code] || {
    className: "bg-gray-100 text-gray-600 border border-gray-200",
    label: code || "—",
    Icon: null,
  };
  const { className, label, Icon } = entry;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${className}`}
    >
      {Icon ? <Icon size={12} /> : null}
      {label}
    </span>
  );
};

export default PassbookBadge;
