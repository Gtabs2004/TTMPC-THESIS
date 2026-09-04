import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Single-source-of-truth pagination control for staff/table pages — the
 * footer-side counterpart to StaffTopbar/Breadcrumb. Before this, the same
 * ~25-line block was copy-pasted into 8 local `const Pagination = ...`
 * components and 19 more inline call sites, which had already drifted:
 * three different button sizes, and one page (Secretary_Records) whose
 * page-number row was a static `Math.min(5, totalPages)` range instead of
 * a sliding window, making page 6+ unreachable via number buttons on any
 * list longer than 5 pages.
 *
 * Standardizes on the majority look (23 of 27 prior call sites): circular
 * w-8 h-8 buttons, a 5-page sliding window centered on the current group,
 * and the #16A34A active state.
 *
 * Props:
 *   page       — current 1-indexed page.
 *   totalPages — total page count.
 *   onChange   — (nextPage: number) => void.
 */
export default function Pagination({ page, totalPages, onChange }) {
  return (
    <div className="flex items-center justify-center p-6 gap-2 border-t border-gray-100">
      <button
        className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={page <= 1}
        onClick={() => onChange(Math.max(page - 1, 1))}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {(() => {
        const groupStart = Math.floor((page - 1) / 5) * 5 + 1;
        const groupEnd = Math.min(groupStart + 4, totalPages);
        return Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`w-8 h-8 flex items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
              p === page
                ? "bg-[#16A34A] text-white border-[#16A34A]"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {p}
          </button>
        ));
      })()}

      <button
        className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={page >= totalPages}
        onClick={() => onChange(Math.min(page + 1, totalPages))}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
