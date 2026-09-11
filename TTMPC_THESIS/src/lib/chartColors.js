// Centralized chart color palette for Recharts-based dashboards/reports across
// every portal (Manager, Bookkeeper, Cashier, Treasurer, BOD).
//
// Source of truth: Bookkeeper Reports.jsx's existing look — a single
// cooperative-green family (BRAND / PIE_COLORS) plus a small semantic trio for
// status charts. That page was confirmed as the cleanest-looking one in the
// app, so every other portal now matches it instead of picking its own ad hoc
// hex values (blues, purples, cyans, extra shades of green, …).
//
// See TTMPC_THESIS/src/system summary files/UI_CONSISTENCY_AUDIT.md for the
// broader app-wide color-token gap this file is a first slice of.

// Cooperative-green family, dark to pale — verbatim from Reports.jsx's BRAND
// and PIE_COLORS constants.
export const GREEN = {
  darkest: "#14532d",
  dark: "#166534",
  mid: "#16a34a",
  light: "#22c55e",
  lighter: "#4ade80",
  pale: "#86efac",
  palest: "#bbf7d0",
};

// The single accent color for a chart's "headline" series (area/line/bar
// primary metric) — approvals trend, transaction volume, collections, etc.
// Every dashboard should pull this instead of re-typing its own shade of green.
export const SERIES_PRIMARY = GREEN.dark;

// Sequential green ramp for "breakdown of one family into sub-types" charts —
// loan-type distributions, transaction-type donuts — exactly Reports.jsx's
// PIE_COLORS. Index-based (by sort rank), darkest first, so the largest slice
// reads as the boldest color.
export const CATEGORICAL_PALETTE = [
  GREEN.dark,
  GREEN.mid,
  GREEN.light,
  GREEN.lighter,
  GREEN.pale,
  GREEN.palest,
];

/**
 * Resolve a color for a loan-type (or similarly-shaped) breakdown row, purely
 * by position in the (already-sorted) list — matching how Reports.jsx colors
 * its Loan Distribution donut. No per-category overrides: this is what keeps
 * the ramp clean instead of turning into a rainbow of unrelated hues.
 */
export function getLoanTypeColor(_name, index = 0) {
  return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];
}

// Semantic colors — meaning-based ("good/warning/bad"), matching the exact
// values Reports.jsx already used for its Payment Status / MIGS pies.
export const SEMANTIC_COLORS = {
  success: GREEN.dark,
  warning: "#f59e0b",
  danger: "#ef4444",
  neutral: "#94a3b8",
  faint: "#e2e8f0", // "Unscored"/unknown bucket
};

// Shared cartesian-grid/axis chrome so gridlines look identical everywhere.
export const CHART_GRID = "#f0f0f0";
export const CHART_AXIS = "#9ca3af";

// Two-series cash-flow forecast colors (Consolidated vs Emergency), shared by
// the Treasurer Vault forecast cards and the LoanDemandForecastCard component
// embedded in the Manager/BOD dashboards — both must agree with each other,
// which they previously didn't (each had its own hex pair).
export const FORECAST_LOAN_TYPE_COLORS = {
  consolidated: SERIES_PRIMARY,
  emergency: SEMANTIC_COLORS.warning,
};

// 30/60/90-day delinquency aging severity ramp (BOD dashboard) — a warm risk
// escalation, deliberately outside the green family since it's flagging risk,
// not identifying a loan type.
export const AGING_SEVERITY_COLORS = ["#FCD34D", "#F97316", "#EF4444"];

// Repayment-behavior scatter thresholds (Bookkeeper dashboard): green/amber/red
// tints so dots read distinctly from the bold reference-line thresholds
// (SEMANTIC_COLORS.warning/danger) they're plotted against.
export const REPAYMENT_HEALTH_COLORS = {
  healthy: GREEN.mid,
  watch: "#fbbf24",
  poor: "#f87171",
  noData: "#d1d5db",
};

// Gender-distribution categorical set (BOD dashboard) — kept separate from
// CATEGORICAL_PALETTE since it's always exactly 3 fixed slots in this order.
export const GENDER_COLORS = [GREEN.dark, GREEN.lighter, SEMANTIC_COLORS.neutral];
