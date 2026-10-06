// Data layer for the Treasurer dashboard. Every figure here comes from an
// existing backend endpoint — the dashboard never recomputes vault, net-cash-out
// or ranking math itself (that lives in main.py: _compute_vault_available,
// _net_cash_out_for_rows, _compute_disbursement_rank).
//
// Query keys start with "dashboard" so <RealtimeSync /> refetches them on any
// DB change (see queryMatchesEntities in lib/realtimeSync.js).

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export const PHP_FULL = (v) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(v || 0));

export const PHP_COMPACT = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `₱${Math.round(n / 1_000)}k`;
  return `₱${n.toFixed(0)}`;
};

export const formatShortDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

async function getJson(path) {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: { Accept: "application/json" } });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.success === false) throw new Error(payload?.detail || "Request failed.");
  return payload;
}

// Loans awaiting the Treasurer's funding decision ('to be disbursed') with
// per-loan net cash out + funding status, and the vault {balance, committed,
// available} they were judged against.
export const decisionQueueQuery = (limit = 5) => ({
  queryKey: ["dashboard", "treasurer", "decision-queue", limit],
  queryFn: async () => (await getJson(`/api/treasurer/disbursements/decision-queue?limit=${limit}`)).data,
});

// Loans already Treasurer-approved, waiting for the Cashier's release —
// ranked server-side (rank asc, then longest-waiting first).
export const readyForReleaseQuery = (limit = 5) => ({
  queryKey: ["dashboard", "treasurer", "priority-queue", limit],
  queryFn: async () => {
    const payload = await getJson(`/api/treasurer/disbursements/priority-queue?limit=${limit}`);
    return { rows: payload.data || [], summary: payload.summary || { total_count: 0, total_amount: 0 } };
  },
});

// Last 30 days of cash in/out (the endpoint's default window); `limit` only
// trims the entry list — the totals cover the whole window.
export const cashLedgerQuery = (limit = 6) => ({
  queryKey: ["dashboard", "treasurer", "cash-ledger", limit],
  queryFn: async () => (await getJson(`/api/treasurer/cash-ledger?limit=${limit}`)).data,
});

export const releasedLoansQuery = (limit = 5) => ({
  queryKey: ["dashboard", "treasurer", "released-loans"],
  queryFn: async () => {
    const payload = await getJson("/api/treasurer/disbursements/released-loans");
    return { rows: payload.data || [], summary: payload.summary || {} };
  },
  select: (d) => ({ rows: d.rows.slice(0, limit), summary: d.summary }),
});

// Liquidity is judged only from real figures — no tuned thresholds:
//   shortfall: committed releases already exceed the vault, or loans are
//              waiting and not one of them fits in available cash
//   limited:   some waiting loans fit, but not all of them together
//   healthy:   every waiting loan could be funded at once
export function liquidityStatus(vault, summary) {
  if (!vault || !summary) return null;
  const available = Number(vault.available || 0);
  const pending = Number(summary.total_net_cash_out || 0);
  const remaining = available - pending;
  let level = "healthy";
  if (available < 0 || (summary.total_count > 0 && summary.fits_count === 0)) level = "shortfall";
  else if (remaining < 0) level = "limited";
  return { level, available, pending, remaining };
}
