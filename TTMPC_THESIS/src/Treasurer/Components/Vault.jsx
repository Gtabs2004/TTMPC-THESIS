import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TableToolbar } from "../../components/TableToolbar";
import TableStateRow from "../../components/TableStateRow";
import Pagination from "../../components/Pagination";
import { supabase } from "../../supabaseClient";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import StaffSidebar from "../../components/StaffSidebar";
import { treasurerNav } from "../../components/StaffSidebar/configs/treasurer";
import {
  Plus,
  RefreshCw,
  X,
  AlertCircle,
  Search,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  User,
  Inbox,
} from "lucide-react";
import { FORECAST_LOAN_TYPE_COLORS } from "../../lib/chartColors";
import { formatWithCommas, stripCommas } from "../../utils/numberFormat";
import { useRealtimeRefetch } from "../../hooks/useRealtimeRefetch";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
// Shared with LoanDemandForecastCard.jsx via chartColors.js — both forecast
// surfaces must use the same Consolidated/Emergency pairing.
const FORECAST_LOAN_TYPES = [
  { value: "consolidated", label: "Consolidated", color: FORECAST_LOAN_TYPE_COLORS.consolidated },
  { value: "emergency",    label: "Emergency",    color: FORECAST_LOAN_TYPE_COLORS.emergency },
  { value: "bonus",        label: "Bonus",        color: FORECAST_LOAN_TYPE_COLORS.bonus },
];

const FORECAST_MONTHS_AHEAD = 1;

// Cash sufficiency rule (confirmed by the cooperative, see
// 2026-10-21_profile_change_requests.md part B). Coverage = cash available /
// forecast need (upper 80% band):
//   >= 120%        Sufficient: prepare nothing
//   100% to < 120% Tight: top up to restore the 20% buffer
//   80% to < 100%  Near target: a small shortfall
//   < 80%          Critical: a large shortfall
// For Tight/Near target/Critical, "recommended" = need x CASH_BUFFER - available.
// For the two shortfall levels, the minimum is need - available.
const CASH_BUFFER = 1.2;
const CRITICAL_COVERAGE = 0.8;

const STATUS_META = {
  sufficient: {
    label: "Sufficient",
    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    panel: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-800",
    Icon: CheckCircle2,
    title: "Vault is sufficient for next month",
  },
  tight: {
    label: "Tight",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    panel: "bg-amber-50 border-amber-200",
    text: "text-amber-800",
    Icon: AlertTriangle,
    title: "Vault is tight for next month",
  },
  near_target: {
    label: "Near target",
    badge: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
    panel: "bg-orange-50 border-orange-200",
    text: "text-orange-800",
    Icon: AlertCircle,
    title: "Vault is slightly short for next month",
  },
  critical: {
    label: "Critical",
    badge: "bg-red-50 text-red-700 ring-1 ring-red-200",
    panel: "bg-red-50 border-red-200",
    text: "text-red-800",
    Icon: AlertCircle,
    title: "Vault shortfall next month",
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CHANGE_TYPES = [
  { value: "deposit",         label: "Deposit",         sign: +1, tone: "text-emerald-700 bg-emerald-50 ring-emerald-200" },
  { value: "withdrawal",      label: "Withdrawal",      sign: -1, tone: "text-red-700 bg-red-50 ring-red-200" },
  { value: "adjustment",      label: "Adjustment",      sign: +1, tone: "text-amber-700 bg-amber-50 ring-amber-200" },
  { value: "opening_balance", label: "Opening Balance", sign: +1, tone: "text-blue-700 bg-blue-50 ring-blue-200" },
];

const ITEMS_PER_PAGE = 10;

// How each ledger entry type is shown in the table: same full-pill, normal-case
// badge as the Ledger Transactions page (inflows green, outflows red/orange).
// Separate from CHANGE_TYPES, which only lists what the Update Balance form can
// record (it has no "Disbursement": those come from the loan release).
const LEDGER_TYPE_BADGES = {
  deposit:         { label: "Deposit",         cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  withdrawal:      { label: "Withdrawal",      cls: "bg-orange-50 text-orange-700 ring-1 ring-orange-200" },
  disbursement:    { label: "Disbursement",    cls: "bg-red-50 text-red-700 ring-1 ring-red-200" },
  adjustment:      { label: "Adjustment",      cls: "bg-gray-50 text-gray-700 ring-1 ring-gray-200" },
  opening_balance: { label: "Opening Balance", cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" },
};

const PHP = (v) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(Number(v || 0));

const formatWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const Vault = () => {
  const { session } = UserAuth();
  const { addNotification } = useNotification();

  const [balance, setBalance] = useState({ current_balance: 0, last_updated_at: null, entry_count: 0 });
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [monthlyForecast, setMonthlyForecast] = useState([]); // Next month's forecast by loan type
  const [reservedCash, setReservedCash] = useState(0); // approved/ready-for-disbursement loans not yet released
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState("");
  const [forecastUpdatedAt, setForecastUpdatedAt] = useState(null);

  // -------------------------------------------------------------------------
  // Data fetching — direct Supabase (RLS enforced by is_vault_reader).
  // -------------------------------------------------------------------------
  // `silent` = realtime refresh while the page is open: no spinner, and a
  // failed refresh keeps the figures already on screen.
  const fetchData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const [balRes, entriesRes] = await Promise.all([
        supabase.from("vault_balance_v").select("*").limit(1).maybeSingle(),
        supabase.from("vault_entries")
          .select("id,amount,change_type,note,reference_id,entered_by,entered_at")
          .order("entered_at", { ascending: false })
          .limit(100),
      ]);
      if (balRes.error) throw balRes.error;
      if (entriesRes.error) throw entriesRes.error;
      setBalance(balRes.data || { current_balance: 0, last_updated_at: null, entry_count: 0 });
      setEntries(entriesRes.data || []);
    } catch (err) {
      if (!silent) setError(err?.message || "Failed to load vault data.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  // vault_balance_v is computed from vault_entries, which loan releases and
  // cashier-side vault postings write to.
  useRealtimeRefetch(["vault_entries"], () => fetchData({ silent: true }));

  // Pull the SARIMA forecast through next month for Consolidated, Emergency
  // and Bonus, plus the cash already committed to approved loans
  // waiting for release (so "available" isn't just the raw vault balance).
  // Cash planning uses `upper` (upper 80% CI, the model/API default) as the
  // "need" to prepare for — point estimate is shown only as "likely" and
  // upper95 only as the "stress case". See 2026-10-21_cash_forecast_addition.md.
  const fetchForecast = useCallback(async () => {
    setForecastLoading(true);
    setForecastError("");
    try {
      const results = await Promise.all(
        FORECAST_LOAN_TYPES.map(async (t) => {
          const res = await fetch(
            `${API_BASE_URL}/api/analytics/demand/forecast?loan_type=${t.value}&months_from_today=${FORECAST_MONTHS_AHEAD}`,
            { headers: { Accept: "application/json" } },
          );
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(payload?.detail || `Failed to fetch ${t.label} forecast.`);
          const fcArray = (payload?.data?.forecast || payload?.forecast || []);
          return [t.value, fcArray];
        }),
      );

      // Merge the three per-type arrays into one row per period (YYYY-MM).
      const byPeriod = new Map();
      for (const [typeValue, fcArray] of results) {
        for (const row of fcArray) {
          const key = String(row.period || "").slice(0, 7); // YYYY-MM
          if (!byPeriod.has(key)) byPeriod.set(key, { period: key });
          byPeriod.get(key)[typeValue] = {
            predicted: row.predicted,
            upper: row.upper,
            upper95: row.upper95,
          };
        }
      }
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const nextMonthKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
      const rows = Array.from(byPeriod.values())
        .filter((row) => row.period === nextMonthKey);
      setMonthlyForecast(rows);

      // Cash already spoken for: the NET cash out of loans in "ready for
      // disbursement" (Treasurer-approved, awaiting the Cashier's release), from
      // the same _compute_vault_available() the approval screens judge against.
      // Released loans are already out of the vault; loans still "to be
      // disbursed" are not reserved yet.
      const reservedRes = await fetch(
        `${API_BASE_URL}/api/treasurer/vault/available`,
        { headers: { Accept: "application/json" } },
      );
      const reservedPayload = await reservedRes.json().catch(() => ({}));
      setReservedCash(reservedRes.ok ? Number(reservedPayload?.data?.committed || 0) : 0);

      setForecastUpdatedAt(new Date());
    } catch (err) {
      setForecastError(err?.message || "Failed to load forecast.");
    } finally {
      setForecastLoading(false);
    }
  }, []);

  useEffect(() => { fetchForecast(); }, [fetchForecast]);

  // "Refresh forecast" re-pulls the forecast AND the vault balance it is
  // compared against, so the verdict reflects what is in the vault right now.
  const handleRefreshForecast = useCallback(
    () => Promise.all([fetchForecast(), fetchData({ silent: true })]),
    [fetchForecast, fetchData],
  );

  const filteredEntries = useMemo(() => {
    if (typeFilter === "all") return entries;
    return entries.filter((e) => e.change_type === typeFilter);
  }, [entries, typeFilter]);

  useEffect(() => { setCurrentPage(1); }, [typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / ITEMS_PER_PAGE));
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredEntries.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredEntries, currentPage]);

  // Cash available to cover upcoming releases = vault balance minus cash
  // already committed to loans approved and waiting for disbursement. We
  // compare next month's forecast against cash available now since future
  // collections aren't forecast — see the "Questions
  // only you can answer" #3 in 2026-10-21_cash_forecast_addition.md.
  const availableCash = useMemo(
    () => Number(balance.current_balance || 0) - reservedCash,
    [balance.current_balance, reservedCash],
  );

  // One row for next month: need (upper 80% CI, summed across
  // Consolidated/Emergency/Bonus) vs. availableCash, plus likely (point
  // estimate) and the stress case (upper 95% CI) for context only; the status
  // is decided on the 80% need alone. See CASH_BUFFER / CRITICAL_COVERAGE.
  const monthlyCashPosition = useMemo(() => {
    return monthlyForecast.map((row) => {
      let likely = 0, need = 0, stress = 0;
      for (const t of FORECAST_LOAN_TYPES) {
        const r = row[t.value];
        if (!r) continue;
        likely += r.predicted ?? 0;
        need += r.upper ?? r.predicted ?? 0;
        stress += r.upper95 ?? r.upper ?? r.predicted ?? 0;
      }
      // No forecast demand at all: nothing to cover.
      const coverageRatio = need > 0 ? availableCash / need : null;
      const gap = Math.max(0, need - availableCash); // minimum to cover the need
      const recommended = Math.max(0, need * CASH_BUFFER - availableCash); // restores the 20% buffer
      let status = "sufficient";
      if (coverageRatio !== null) {
        if (coverageRatio < CRITICAL_COVERAGE) status = "critical";
        else if (coverageRatio < 1) status = "near_target";
        else if (coverageRatio < CASH_BUFFER) status = "tight";
      }
      const [y, m] = row.period.split("-").map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString("en-PH", { year: "numeric", month: "long" });
      return {
        period: row.period, label, likely, need, stress, coverageRatio, status,
        // Sufficient: nothing. Tight: top-up only. Shortfall levels: a minimum and a recommended amount.
        minimum: status === "near_target" || status === "critical" ? gap : 0,
        recommended: status === "sufficient" ? 0 : recommended,
      };
    });
  }, [monthlyForecast, availableCash]);

  const nextMonthPosition = monthlyCashPosition[0] || null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <StaffSidebar portal="Treasurer" items={treasurerNav} />

      {/* MAIN */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Treasurer" notifications={<LoanNotificationBell role="treasurer" />} />

        <main className="animate-page-in p-8 flex flex-col gap-6">
          {/* HEADER + REFRESH */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Vault</h1>
              <p className="text-sm text-gray-600 mt-1">
                Track the coop's cash-on-hand for loan disbursements. Every entry is permanent — corrections are recorded as new adjustment rows.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchData}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw size={14} /> Refresh
              </button>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1D6021] text-white text-xs font-semibold hover:bg-green-700"
              >
                <Plus size={16} /> Update Balance
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* BALANCE HEADER — uses the app's brand greens (#389734 sidebar,
              #1D6021 forecast card) so it stays consistent with the rest of
              the TTMPC identity. */}
          <div
            className="rounded-2xl text-white p-8 shadow-lg bg-[#1D6021]"
          >
            <p className="text-sm uppercase tracking-wider font-semibold text-white/90">Current Vault Balance</p>
            <p className="mt-2 text-5xl font-extrabold tabular-nums text-white">{PHP(balance.current_balance)}</p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-white/90">
              <span>Last updated: {formatWhen(balance.last_updated_at)}</span>
              <span className="text-white/60">•</span>
              <span>{balance.entry_count} ledger {balance.entry_count === 1 ? "entry" : "entries"}</span>
            </div>
          </div>

          {/* CASH POSITION vs. FORECAST */}
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="flex items-center text-lg font-bold text-gray-900">
                  <TrendingUp size={18} className="mr-2 text-emerald-700" />
                  Cash Sufficiency Forecast
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Cash available vs. forecasted loan releases for next month only. Status
                  uses a safe-side estimate (80% confidence) and a 20% cash buffer; "Likely" and the 95% "Stress
                  Case" are shown for context only. Compared against today's cash on hand, not a projected future balance.
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={handleRefreshForecast}
                  disabled={forecastLoading}
                  aria-busy={forecastLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={12} className={forecastLoading ? "animate-spin" : ""} aria-hidden="true" />
                  {forecastLoading ? "Refreshing…" : "Refresh forecast"}
                </button>
                {forecastUpdatedAt && (
                  <span className="text-[11px] text-gray-500" aria-live="polite">
                    Updated {forecastUpdatedAt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                  </span>
                )}
              </div>
            </div>

            {forecastError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-center gap-2 mb-3">
                <AlertCircle size={14} /> Couldn't load forecast: {forecastError}
              </div>
            )}

            {forecastLoading && monthlyCashPosition.length === 0 && (
              <p className="text-sm text-gray-500 py-6 text-center">Loading forecast…</p>
            )}

            {monthlyCashPosition.length > 0 && (
              <>
                {/* Cash available breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Vault Balance</p>
                    <p className="text-xl font-extrabold text-gray-900 tabular-nums mt-1">{PHP(balance.current_balance)}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cash Reserved</p>
                    <p className="text-xl font-extrabold text-amber-700 tabular-nums mt-1">− {PHP(reservedCash)}</p>
                    <p className="text-[11px] text-gray-500 mt-1">Net cash of loans ready for disbursement</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cash Available</p>
                    <p className="text-xl font-extrabold text-gray-900 tabular-nums mt-1">{PHP(availableCash)}</p>
                    <p className="text-[11px] text-gray-500 mt-1">Compared against next month's forecast</p>
                  </div>
                </div>

                {/* Verdict block — next month only */}
                {nextMonthPosition && (() => {
                  const meta = STATUS_META[nextMonthPosition.status];
                  const Icon = meta.Icon;
                  const pct = nextMonthPosition.coverageRatio === null ? null : (nextMonthPosition.coverageRatio * 100).toFixed(0);
                  const s = nextMonthPosition.status;
                  return (
                    <div className={`rounded-xl border p-5 ${meta.panel} mb-4`}>
                      <div className="flex items-start gap-3">
                        <Icon size={22} className={meta.text} />
                        <div className="flex-1">
                          <p className={`text-base font-bold ${meta.text}`}>{meta.title} ({nextMonthPosition.label})</p>
                          <p className="text-sm text-gray-700 mt-1">
                            Cash available: <span className="font-bold tabular-nums">{PHP(availableCash)}</span> ·
                            <span className="ml-1">Forecasted need: <span className="font-bold tabular-nums">{PHP(nextMonthPosition.need)}</span></span>
                            {pct !== null && <span className="ml-1">· Coverage: <span className="font-bold">{pct}%</span></span>}
                          </p>
                          {s === "sufficient" && (
                            <p className="text-sm text-gray-700 mt-2">Nothing to prepare.</p>
                          )}
                          {s === "tight" && (
                            <p className="text-sm text-gray-700 mt-2">
                              Cash covers the forecast but not the 20% buffer. Prepare about{" "}
                              <span className="font-bold tabular-nums">{PHP(nextMonthPosition.recommended)}</span> more
                              before {nextMonthPosition.label} in case demand runs high.
                            </p>
                          )}
                          {(s === "near_target" || s === "critical") && (
                            <p className="text-sm text-gray-700 mt-2">
                              Prepare at least <span className="font-bold tabular-nums">{PHP(nextMonthPosition.minimum)}</span> to cover projected releases
                              in {nextMonthPosition.label}; <span className="font-bold tabular-nums">{PHP(nextMonthPosition.recommended)}</span> restores the 20% buffer.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </>
            )}
          </div>

          {/* LEDGER */}
          <div className="rounded-xl bg-white border border-gray-200 shadow-sm">
            <TableToolbar
              title="Vault Ledger"
              subtitle={`Showing ${paginatedEntries.length} of ${filteredEntries.length} entries${entries.length >= 100 ? " · latest 100 loaded" : ""}`}
            >
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-8 rounded-lg border border-gray-200 bg-white px-2 pr-6 text-[11px] font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
              >
                <option value="all">All Types</option>
                <option value="deposit">Deposits</option>
                <option value="withdrawal">Withdrawals</option>
                <option value="disbursement">Disbursements</option>
                <option value="adjustment">Adjustments</option>
                <option value="opening_balance">Opening Balances</option>
              </select>
            </TableToolbar>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Date</th>
                    <th className="p-5 font-bold">Type</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold">Remarks</th>
                    <th className="p-5 font-bold">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <TableStateRow colSpan={5} variant="loading" label="Loading..." />
                  )}
                  {!loading && filteredEntries.length === 0 && (
                    <TableStateRow
                      colSpan={5}
                      variant="empty"
                      icon={Inbox}
                      label="No vault entries yet."
                      sublabel="Click Update Balance to record the first one."
                    />
                  )}
                  {!loading && paginatedEntries.map((row) => {
                    const type = LEDGER_TYPE_BADGES[row.change_type];
                    const isCredit = Number(row.amount) >= 0;
                    return (
                      <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-gray-700 whitespace-nowrap">{formatWhen(row.entered_at)}</td>
                        <td className="p-5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${type?.cls || "bg-gray-50 text-gray-700 ring-1 ring-gray-200"}`}>
                            {type?.label || row.change_type}
                          </span>
                        </td>
                        <td className={`p-5 text-right tabular-nums font-bold ${isCredit ? "text-emerald-700" : "text-red-700"}`}>
                          {isCredit ? "+" : ""}{PHP(row.amount)}
                        </td>
                        <td className="p-5 text-gray-700">{row.note || <span className="text-gray-400">—</span>}</td>
                        <td className="p-5 whitespace-nowrap">
                          {row.reference_id ? (
                            <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-600 ring-1 ring-gray-200">
                              #{row.reference_id}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!loading && filteredEntries.length > 0 && (
              <Pagination page={currentPage} totalPages={totalPages} onChange={setCurrentPage} />
            )}
          </div>
        </main>
      </div>

      {showModal && (
        <UpdateBalanceModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchData(); addNotification("Vault balance updated.", "success"); }}
          session={session}
          currentBalance={balance.current_balance}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Modal — add to (or subtract from) the vault balance.
// Treasurer types an amount of cash moving in or out; we insert it directly
// as an 'adjustment' entry and the running SUM (vault_balance_v) reflects it.
// Choose "Subtract" to record cash taken out instead of added.
// ---------------------------------------------------------------------------
const UpdateBalanceModal = ({ onClose, onSaved, session, currentBalance }) => {
  const [amountInput, setAmountInput] = useState("");
  const [direction, setDirection] = useState("add"); // "add" | "subtract"
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const amountNum = Number(amountInput);
  const signedAmount = Number.isFinite(amountNum) ? (direction === "add" ? amountNum : -amountNum) : 0;
  const resultingBalance = Number(currentBalance || 0) + signedAmount;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setErr("Enter a valid amount greater than 0.");
      return;
    }
    if (direction === "subtract" && resultingBalance < 0) {
      setErr("That would take the vault balance below zero.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("vault_entries").insert({
        amount: signedAmount,
        change_type: "adjustment",
        note: note.trim() || `${direction === "add" ? "Added" : "Subtracted"} ${PHP(amountNum)}`,
        entered_by: session?.user?.id || null,
      });
      if (error) throw error;
      onSaved();
    } catch (e2) {
      setErr(e2?.message || "Failed to save balance.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Update Vault Balance</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Enter an amount of cash moving in or out of the vault. It will be
            added to (or subtracted from) the current balance.
          </p>

          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Current Balance</span>
            <span className="text-sm font-bold text-gray-700 tabular-nums">{PHP(currentBalance)}</span>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
              Direction
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection("add")}
                className={`h-10 rounded-lg border text-sm font-semibold transition-colors ${
                  direction === "add"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                + Add
              </button>
              <button
                type="button"
                onClick={() => setDirection("subtract")}
                className={`h-10 rounded-lg border text-sm font-semibold transition-colors ${
                  direction === "subtract"
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                − Subtract
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
              Amount (PHP)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={formatWithCommas(amountInput)}
              onChange={(e) => setAmountInput(stripCommas(e.target.value))}
              placeholder="0.00"
              className="w-full h-11 rounded-lg border border-gray-300 px-3 text-lg font-bold text-gray-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-green-500"
              autoFocus
            />
            {amountInput !== "" && Number.isFinite(amountNum) && amountNum > 0 && (
              <p className={`mt-2 text-xs font-semibold ${direction === "add" ? "text-emerald-700" : "text-red-700"}`}>
                New balance: {PHP(resultingBalance)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
              Note <span className="text-gray-400 font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Counted after morning collection"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={14} /> {err}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Balance"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Vault;
