import React from "react";
import { Loader2 } from "lucide-react";

// Two-tone ring spinner (light track + green arc, rounded ends) — replaces
// lucide's dashed-line Loader2 as the loading indicator everywhere. Track
// uses currentColor so the caller's text-color className still tints it;
// the arc is a fixed brand green. `pathLength="100"` normalizes the circle
// to 100 units so the dasharray split is a plain percentage regardless of
// radius.
const RingSpinner = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" />
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke="#22C55E"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
      pathLength="100"
      strokeDasharray="26 74"
    />
  </svg>
);

const Content = ({ variant, icon: Icon, label, sublabel }) => {
  const isLoading = variant === "loading";
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      {Icon ? (
        <Icon
          size={isLoading ? 30 : 32}
          className={`text-gray-300 dark:text-gray-600 ${isLoading ? "animate-spin" : ""}`}
        />
      ) : null}
      <p
        className={
          isLoading
            ? "text-sm text-gray-400 dark:text-gray-500"
            : "text-sm font-medium text-gray-500 dark:text-gray-400"
        }
      >
        {label}
      </p>
      {!isLoading && sublabel ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">{sublabel}</p>
      ) : null}
    </div>
  );
};

/**
 * Uniform <tbody> placeholder row for a table's loading and empty states —
 * one recipe instead of every table inlining its own spinner/empty-icon row.
 *
 * variant: "loading" (default) — spinning ring (or a custom `icon`), size
 * 24, muted gray, lighter-weight text. "empty" — a static semantic icon
 * (pass via `icon`, e.g. Users/Inbox/Banknote; falls back to Loader2 shown
 * motionless if omitted), size 32, bolder/darker text, optional `sublabel`
 * second line for a hint like "Try again once data is available."
 *
 * `bare`: renders just the inner content block without the
 * <tr><td colSpan> wrapper, for mobile card-list layouts that duplicate a
 * desktop table's loading/empty row outside an actual <table>.
 */
export default function TableStateRow({
  colSpan,
  variant = "loading",
  icon,
  label,
  sublabel,
  bare = false,
}) {
  const isLoading = variant === "loading";
  const Icon = icon || (isLoading ? RingSpinner : Loader2);
  if (bare) {
    return <Content variant={variant} icon={Icon} label={label} sublabel={sublabel} />;
  }
  return (
    <tr>
      <td colSpan={colSpan} className="p-10 text-center">
        <Content variant={variant} icon={Icon} label={label} sublabel={sublabel} />
      </td>
    </tr>
  );
}
