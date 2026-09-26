import React from "react";

const VARIANT_CLASSES = {
  primary: "bg-green-600 hover:bg-green-700 text-white",
  danger: "bg-red-600 hover:bg-red-700 text-white",
  neutral: "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900",
};

/**
 * Uniform in-table row action button (View/Edit/Approve/Reject/Confirm/...).
 * One recipe for every table's Action column instead of each page inventing
 * its own pill/outline/plain-text style.
 *
 * variant: "primary" (green, default) — the main positive action: View/
 * Confirm/Approve/Evaluate when it's the only action in the row.
 * "danger" (red) — Reject/Terminate/Cancel.
 * "neutral" (gray outline) — a de-emphasized action sharing a row with a
 * primary/danger pair (e.g. View next to Approve/Reject), so the pair still
 * reads as the row's main choice.
 *
 * iconOnly: renders just the icon (children is used as the accessible
 * name via title/aria-label unless explicitly overridden) instead of
 * icon+text — for dense columns where a text label won't fit.
 */
export default function TableActionButton({
  children,
  icon: Icon,
  variant = "primary",
  disabled = false,
  className = "",
  iconOnly = false,
  title,
  "aria-label": ariaLabel,
  ...props
}) {
  const label = typeof children === "string" ? children : undefined;
  return (
    <button
      type="button"
      disabled={disabled}
      title={title || (iconOnly ? label : undefined)}
      aria-label={ariaLabel || (iconOnly ? label : undefined)}
      className={`inline-flex items-center justify-center gap-1 ${
        iconOnly ? "p-1.5" : "px-2.5 py-1"
      } rounded text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {Icon ? <Icon size={12} /> : null}
      {!iconOnly && children}
    </button>
  );
}
