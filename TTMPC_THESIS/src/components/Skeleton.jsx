import React from "react";

/**
 * Loading placeholders shaped like the content they stand in for, so a page's
 * layout appears immediately and just "fills in" when data lands instead of
 * showing '—' or blank boxes. Same gray pulse treatment as
 * Member/Components/MemberDashboardLoading.jsx.
 */
export function Skeleton({ className = "" }) {
  return <div aria-hidden="true" className={`bg-gray-200 rounded animate-pulse ${className}`} />;
}

/**
 * Stand-in for a Recharts chart: bars of varying height along a baseline.
 * Fills its parent, so drop it inside the same fixed-height wrapper the
 * chart's ResponsiveContainer uses.
 */
const BAR_HEIGHTS = ["45%", "70%", "55%", "85%", "60%", "75%"];
export function SkeletonChart({ className = "" }) {
  return (
    <div aria-hidden="true" className={`h-full w-full flex items-end gap-3 px-6 pb-6 pt-4 ${className}`}>
      {BAR_HEIGHTS.map((h, i) => (
        <div key={i} className="flex-1 bg-gray-200 rounded-t animate-pulse" style={{ height: h }} />
      ))}
    </div>
  );
}

/** Stand-in for a donut/pie chart. */
export function SkeletonDonut({ className = "" }) {
  return (
    <div aria-hidden="true" className={`h-full w-full flex items-center justify-center ${className}`}>
      <div className="w-36 h-36 rounded-full border-[18px] border-gray-200 animate-pulse" />
    </div>
  );
}

/** Table body placeholder rows: `rows` x `cols` gray bars. */
export function SkeletonTableRows({ rows = 5, cols = 6, cellClassName = "p-5" }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} aria-hidden="true" className="border-b border-gray-100">
      {Array.from({ length: cols }, (_, c) => (
        <td key={c} className={cellClassName}>
          <Skeleton className={`h-4 ${c === 0 ? "w-24" : c === cols - 1 ? "w-16 mx-auto" : "w-full max-w-[140px]"}`} />
        </td>
      ))}
    </tr>
  ));
}

/** Stacked list-item placeholders (for card lists rather than tables). */
export function SkeletonList({ rows = 4, className = "" }) {
  return (
    <div aria-hidden="true" className={`space-y-4 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
