// Single source of truth for "which color means which loan type" across the
// whole system. Before this file existed, at least 9 components each
// hand-rolled their own switch/if-chain mapping loan type -> Tailwind
// classes, and they'd drifted into two conflicting palettes (blue meant
// "Consolidated" on some pages and "Bonus" on others). Canonical scheme:
//   Consolidated -> green, Bonus -> blue, Emergency -> red, KOICA/ABF -> indigo.
// Every renderer below is keyed off this one object — change a color here
// and every table/badge/card in the system updates together.
//
// Tailwind can't see dynamically-built class names (`bg-${hue}-100`), so
// each entry spells its classes out literally. dark: variants are included
// unconditionally — they're inert on portals that never toggle dark mode.

const LOAN_TYPE_COLORS = {
  CONSOLIDATED: {
    chip: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    ring: "border-green-200 dark:border-green-800",
    softBg: "bg-green-50 dark:bg-green-900/20",
    text: "text-green-700 dark:text-green-400",
    dot: "bg-green-500",
  },
  BONUS: {
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    ring: "border-blue-200 dark:border-blue-800",
    softBg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  EMERGENCY: {
    chip: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    ring: "border-red-200 dark:border-red-800",
    softBg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
  KOICA: {
    chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    ring: "border-indigo-200 dark:border-indigo-800",
    softBg: "bg-indigo-50 dark:bg-indigo-900/20",
    text: "text-indigo-700 dark:text-indigo-400",
    dot: "bg-indigo-500",
  },
  DEFAULT: {
    chip: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    ring: "border-gray-200 dark:border-gray-800",
    softBg: "bg-gray-50 dark:bg-gray-900/20",
    text: "text-gray-700 dark:text-gray-400",
    dot: "bg-gray-400",
  },
};

/**
 * Resolves any spelling of a loan type — a bare code ("BONUS"), a short
 * display word ("Bonus"), or the full product name from loan_types.name
 * ("Bonus Loan") — to one canonical key. Keyword-matched (not exact-equals)
 * on purpose: an earlier exact-match version silently fell through to gray
 * for every row once loan_types.name started storing the full "X Loan"
 * name instead of the bare word (see Treasurer_Approval.jsx history).
 */
function resolveLoanTypeKey(rawType) {
  const t = String(rawType || "").toLowerCase();
  if (t.includes("consolidated")) return "CONSOLIDATED";
  if (t.includes("emergency")) return "EMERGENCY";
  if (t.includes("bonus")) return "BONUS";
  if (t.includes("koica") || t.includes("abf")) return "KOICA";
  return "DEFAULT";
}

function entryFor(rawType) {
  return LOAN_TYPE_COLORS[resolveLoanTypeKey(rawType)];
}

/** `bg-*-100 text-*-700` pill — the common case for a table-row badge. */
export function getLoanTypeChipClass(rawType) {
  return entryFor(rawType).chip;
}

/** Solid `bg-*-500` — for small accent dots/bars rather than text chips. */
export function getLoanTypeDotClass(rawType) {
  return entryFor(rawType).dot;
}

/** Full { ring, bg, text, chip } set for card-style loan pickers. */
export function getLoanTypeCardStyle(rawType) {
  const e = entryFor(rawType);
  return { ring: e.ring, bg: e.softBg, text: e.text, chip: e.chip };
}

export default LOAN_TYPE_COLORS;
