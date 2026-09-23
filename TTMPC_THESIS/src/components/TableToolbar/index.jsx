import React from "react";

/**
 * Single-source-of-truth toolbar for the header row that sits directly above
 * a data table across the staff portals — title + live "Showing X of Y"
 * count on the left, an optional pill-style status filter and any
 * page-specific controls (selects, search, export buttons, ...) on the
 * right. Modeled on BOD/Components/Manage-Loans.jsx's "Loan Records" header,
 * which is the reference design every table is meant to converge on.
 *
 * Every list page in the app used to hand-roll this row itself, which is why
 * pill shapes, title placement, and filter layout had drifted across
 * portals (bg-gray-100 wrapper vs. rounded-full border vs. underline tabs vs.
 * solid green buttons, title sometimes missing, filters sometimes in a
 * second row or behind a toggle). This component exists so every page gets
 * the same title/subtitle position and the same pill styling for free, while
 * still plugging in whatever filter controls that specific page actually
 * needs via `children` — not every page filters by the same dimensions
 * (status vs. loan type vs. date range vs. period grouping), so the pill
 * *style* is standardized, not a fixed set of pill values.
 *
 * <TableToolbar
 *   title="Loan Records"
 *   subtitle={`Showing ${shown} of ${total} loans`}
 *   tabs={[{ value: "All", label: "All" }, { value: "Pending", label: "Pending", count: 4 }]}
 *   activeTab={activeFilter}
 *   onTabChange={setActiveFilter}
 * >
 *   <select ...>...Year...</select>
 *   <select ...>...Month...</select>
 * </TableToolbar>
 */
export function TableToolbar({
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  children,
  className = "",
}) {
  const hasTabs = Array.isArray(tabs) && tabs.length > 0;
  const hasRight = hasTabs || children;

  return (
    <div
      className={`border-b border-gray-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${className}`}
    >
      {(title || subtitle) && (
        <div>
          {title ? <h2 className="text-sm font-bold text-gray-900">{title}</h2> : null}
          {subtitle ? <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p> : null}
        </div>
      )}

      {hasRight && (
        <div className="flex flex-wrap items-center gap-2">
          {hasTabs && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
              {tabs.map((tab) => {
                const active = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    disabled={tab.disabled}
                    title={tab.title}
                    onClick={() => !tab.disabled && onTabChange?.(tab.value)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                      tab.disabled
                        ? "text-gray-300 cursor-not-allowed"
                        : active
                        ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {tab.label}
                    {tab.count !== undefined && tab.count !== null && (
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          active ? "bg-gray-100 text-gray-700" : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

export default TableToolbar;
