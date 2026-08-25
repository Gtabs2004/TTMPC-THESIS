import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import StaffSidebar from "../../components/StaffSidebar";
import { treasurerNav } from "../../components/StaffSidebar/configs/treasurer";
import {
  CreditCard,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  X,
  AlertCircle,
  Search,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  User,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
// System Green (#16A34A) / Warning (#B45309) — matches the same Consolidated
// vs. Emergency color pairing used on the Treasurer dashboard's forecast
// cards. Previously used Member Green (var(--color-member-green)), which
// DESIGN.md scopes to the Member self-service portal only.
const FORECAST_LOAN_TYPES = [
  { value: "consolidated", label: "Consolidated", color: "#16A34A" },
  { value: "emergency",    label: "Emergency",    color: "#B45309" },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CHANGE_TYPES = [
  { value: "deposit",         label: "Deposit",         sign: +1, tone: "text-emerald-700 bg-emerald-50 ring-emerald-200" },
  { value: "withdrawal",      label: "Withdrawal",      sign: -1, tone: "text-red-700 bg-red-50 ring-red-200" },
  { value: "adjustment",      label: "Adjustment",      sign: +1, tone: "text-amber-700 bg-amber-50 ring-amber-200" },
  { value: "opening_balance", label: "Opening Balance", sign: +1, tone: "text-blue-700 bg-blue-50 ring-blue-200" },
];

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
  const [forecast, setForecast] = useState({ consolidated: null, emergency: null, targetPeriod: null });
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState("");

  // -------------------------------------------------------------------------
  // Data fetching — direct Supabase (RLS enforced by is_vault_reader).
  // -------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
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
      setError(err?.message || "Failed to load vault data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Pull the SARIMA forecast for the *next calendar month* for both loan
  // types, so the treasurer can compare vault-on-hand against upcoming
  // release demand. We use `upper` (upper 80% CI) as the planning number —
  // cash planning should err toward over-provision, not point estimate.
  const fetchForecast = useCallback(async () => {
    setForecastLoading(true);
    setForecastError("");
    try {
      // Compute the YYYY-MM key for next month.
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const targetKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;

      const results = await Promise.all(
        FORECAST_LOAN_TYPES.map(async (t) => {
          const res = await fetch(
            `${API_BASE_URL}/api/analytics/demand/forecast?loan_type=${t.value}&periods=60`,
            { headers: { Accept: "application/json" } },
          );
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(payload?.detail || `Failed to fetch ${t.label} forecast.`);
          const fcArray = (payload?.data?.forecast || payload?.forecast || []);
          // Match by YYYY-MM prefix — API returns full ISO dates.
          const row = fcArray.find((r) => String(r.period || "").startsWith(targetKey));
          return [t.value, row ? { predicted: row.predicted, lower: row.lower, upper: row.upper } : null];
        }),
      );

      const map = { targetPeriod: targetKey };
      for (const [k, v] of results) map[k] = v;
      setForecast(map);
    } catch (err) {
      setForecastError(err?.message || "Failed to load forecast.");
    } finally {
      setForecastLoading(false);
    }
  }, []);

  useEffect(() => { fetchForecast(); }, [fetchForecast]);

  const filteredEntries = useMemo(() => {
    if (typeFilter === "all") return entries;
    return entries.filter((e) => e.change_type === typeFilter);
  }, [entries, typeFilter]);

  const totals = useMemo(() => {
    const t = { deposit: 0, withdrawal: 0, adjustment: 0, disbursement: 0, opening_balance: 0 };
    for (const e of entries) t[e.change_type] = (t[e.change_type] || 0) + Number(e.amount || 0);
    return t;
  }, [entries]);

  // Compare current vault balance against next month's forecasted disbursement
  // need. We use the upper 80% CI as the planning number (safer for cash
  // planning) but expose the point estimate too so the treasurer sees the range.
  const cashPosition = useMemo(() => {
    const con = forecast.consolidated;
    const emg = forecast.emergency;
    if (!con && !emg) return null;
    const conPoint = con?.predicted ?? 0;
    const emgPoint = emg?.predicted ?? 0;
    const conUpper = con?.upper ?? conPoint;
    const emgUpper = emg?.upper ?? emgPoint;
    const totalPoint = conPoint + emgPoint;
    const totalUpper = conUpper + emgUpper;
    const vault = Number(balance.current_balance || 0);
    const gap = vault - totalUpper;              // negative = shortfall
    const coverageRatio = totalUpper > 0 ? vault / totalUpper : 1;
    let status = "sufficient";
    if (coverageRatio < 1) status = "shortfall";
    else if (coverageRatio < 1.2) status = "tight";
    return {
      con: { point: conPoint, upper: conUpper },
      emg: { point: emgPoint, upper: emgUpper },
      totalPoint,
      totalUpper,
      vault,
      gap,
      coverageRatio,
      status,
    };
  }, [forecast, balance.current_balance]);

  const targetMonthLabel = useMemo(() => {
    if (!forecast.targetPeriod) return "";
    const [y, m] = forecast.targetPeriod.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-PH", { year: "numeric", month: "long" });
  }, [forecast.targetPeriod]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <StaffSidebar portal="Treasurer" items={treasurerNav} />

      {/* MAIN */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shrink-0 shadow-sm flex items-center justify-between px-8 border-b border-gray-100">
          <div className="flex-1 max-w-2xl">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                className="bg-gray-50 w-full h-10 rounded-lg border border-gray-300 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent shadow-sm"
                placeholder="Search entries..."
                disabled
              />
            </div>
          </div>
          <div className="flex items-center gap-4 ml-6">
            <LoanNotificationBell role="treasurer" />
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <div className="w-8 h-8 rounded-full shadow-sm bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
                <User className="w-4.5 h-4.5" />
              </div>
              <PortalTopbarIdentity className="text-sm font-semibold text-gray-700 hidden sm:block" fallbackRole="Treasurer" />
            </div>
          </div>
        </header>

        <main className="p-8 flex flex-col gap-6">
          {/* HEADER + REFRESH */}
          <div className="flex items-start justify-between gap-4">
            <div>
                 <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
                <span>Treasurer</span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
                <span className="text-primary">Cooperative Vault</span>
              </div>
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
                className="inline-flex items-center gap-2 px-4 py-1 rounded-lg bg-[#1D6021] text-white text-xs font-semibold hover:bg-green-700"
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
                  Cash Position — Next Month ({targetMonthLabel || "…"})
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Compares the current vault balance against the SARIMA forecast of upcoming loan disbursements.
                  Planning uses the upper 80% confidence bound so you don't run short if demand runs high.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchForecast}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw size={12} /> Refresh forecast
              </button>
            </div>

            {forecastError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-center gap-2 mb-3">
                <AlertCircle size={14} /> Couldn't load forecast: {forecastError}
              </div>
            )}

            {forecastLoading && !cashPosition && (
              <p className="text-sm text-gray-500 py-6 text-center">Loading forecast…</p>
            )}

            {cashPosition && (
              <>
                {/* Per-loan-type forecast */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  {FORECAST_LOAN_TYPES.map((t) => {
                    const row = t.value === "consolidated" ? cashPosition.con : cashPosition.emg;
                    return (
                      <div key={t.value} className="rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                          <h3 className="text-sm font-bold text-gray-800">{t.label}</h3>
                        </div>
                        <p className="text-2xl font-extrabold text-gray-900 tabular-nums">{PHP(row.upper)}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Point estimate: <span className="font-semibold text-gray-700">{PHP(row.point)}</span>
                          <span className="ml-1 text-gray-400">(upper CI shown above)</span>
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Verdict block */}
                {(() => {
                  const s = cashPosition.status;
                  const bg = s === "sufficient" ? "bg-emerald-50 border-emerald-200" :
                             s === "tight"      ? "bg-amber-50 border-amber-200"   :
                                                  "bg-red-50 border-red-200";
                  const txt = s === "sufficient" ? "text-emerald-800" :
                              s === "tight"      ? "text-amber-800"   :
                                                   "text-red-800";
                  const Icon = s === "sufficient" ? CheckCircle2 :
                               s === "tight"      ? AlertTriangle :
                                                    AlertCircle;
                  const title = s === "sufficient" ? "Vault is sufficient" :
                                s === "tight"      ? "Vault is tight" :
                                                     "Vault shortfall";
                  return (
                    <div className={`rounded-xl border p-5 ${bg}`}>
                      <div className="flex items-start gap-3">
                        <Icon size={22} className={txt} />
                        <div className="flex-1">
                          <p className={`text-base font-bold ${txt}`}>{title}</p>
                          <p className="text-sm text-gray-700 mt-1">
                            Vault today: <span className="font-bold tabular-nums">{PHP(cashPosition.vault)}</span> ·
                            <span className="ml-1">Total forecasted need: <span className="font-bold tabular-nums">{PHP(cashPosition.totalUpper)}</span></span>
                          </p>
                          {s === "sufficient" && (
                            <p className="text-sm text-gray-700 mt-2">
                              You have <span className="font-bold text-emerald-700 tabular-nums">{PHP(cashPosition.gap)}</span> above the projected need for {targetMonthLabel}.
                              Coverage ratio: <span className="font-bold">{(cashPosition.coverageRatio * 100).toFixed(0)}%</span>.
                            </p>
                          )}
                          {s === "tight" && (
                            <p className="text-sm text-gray-700 mt-2">
                              Vault covers the forecast, but with only <span className="font-bold text-amber-700 tabular-nums">{PHP(cashPosition.gap)}</span> buffer
                              ({(cashPosition.coverageRatio * 100).toFixed(0)}% coverage). Consider bringing in more cash before {targetMonthLabel} in case demand runs high.
                            </p>
                          )}
                          {s === "shortfall" && (
                            <div className="mt-2 space-y-1">
                              <p className="text-sm text-gray-700">
                                The coop needs to raise <span className="font-bold text-red-700 tabular-nums">{PHP(-cashPosition.gap)}</span> more
                                to fully cover projected releases in {targetMonthLabel}.
                              </p>
                              <p className="text-xs text-gray-600">
                                Current coverage: {(cashPosition.coverageRatio * 100).toFixed(0)}% of forecasted need.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* MINI-TOTALS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { key: "deposit", label: "Deposits", icon: ArrowDownRight, tone: "text-emerald-700 bg-emerald-50" },
              { key: "withdrawal", label: "Withdrawals", icon: ArrowUpRight, tone: "text-red-700 bg-red-50" },
              { key: "disbursement", label: "Disbursements", icon: CreditCard, tone: "text-blue-700 bg-blue-50" },
              { key: "adjustment", label: "Adjustments", icon: RefreshCw, tone: "text-amber-700 bg-amber-50" },
            ].map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.key} className="rounded-xl bg-white border border-gray-200 p-4 flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{c.label}</p>
                    <p className="mt-2 text-lg font-bold text-gray-900 tabular-nums">{PHP(totals[c.key])}</p>
                  </div>
                  <div className={`rounded-lg p-2 ${c.tone}`}><Icon size={16} /></div>
                </div>
              );
            })}
          </div>

          {/* LEDGER */}
          <div className="rounded-xl bg-white border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Ledger</h2>
                <p className="text-xs text-gray-500 mt-0.5">Newest entries first. {entries.length} shown (max 100).</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 font-semibold">Filter:</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="all">All Types</option>
                  <option value="deposit">Deposit</option>
                  <option value="withdrawal">Withdrawal</option>
                  <option value="disbursement">Disbursement</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="opening_balance">Opening Balance</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-600">
                  <tr>
                    <th className="text-left px-5 py-3 font-bold">When</th>
                    <th className="text-left px-5 py-3 font-bold">Type</th>
                    <th className="text-right px-5 py-3 font-bold">Amount</th>
                    <th className="text-left px-5 py-3 font-bold">Note</th>
                    <th className="text-left px-5 py-3 font-bold">Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-500">Loading…</td></tr>
                  )}
                  {!loading && filteredEntries.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                      No entries yet. Click <span className="font-semibold text-green-700">Update Balance</span> to record the first one.
                    </td></tr>
                  )}
                  {!loading && filteredEntries.map((row) => {
                    const type = CHANGE_TYPES.find((t) => t.value === row.change_type);
                    const isCredit = Number(row.amount) >= 0;
                    return (
                      <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                        <td className="px-5 py-3 text-gray-700 whitespace-nowrap">{formatWhen(row.entered_at)}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ring-1 ${type?.tone || "text-gray-700 bg-gray-50 ring-gray-200"}`}>
                            {type?.label || row.change_type}
                          </span>
                        </td>
                        <td className={`px-5 py-3 text-right tabular-nums font-bold ${isCredit ? "text-emerald-700" : "text-red-700"}`}>
                          {isCredit ? "+" : ""}{PHP(row.amount)}
                        </td>
                        <td className="px-5 py-3 text-gray-700">{row.note || <span className="text-gray-400">—</span>}</td>
                        <td className="px-5 py-3 text-gray-500 font-mono text-xs">{row.reference_id ? `#${row.reference_id}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
// Modal — record the current vault balance.
// The vault's only job is to answer "how much cash is in the vault right now?"
// Treasurer types the *new* balance; we compute the delta from the previous
// running total and insert it as an 'adjustment' entry so the running SUM
// still equals the value they entered. The ledger keeps the full history of
// balance snapshots for audit.
// ---------------------------------------------------------------------------
const UpdateBalanceModal = ({ onClose, onSaved, session, currentBalance }) => {
  const [newBalance, setNewBalance] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const targetNum = Number(newBalance);
  const delta = Number.isFinite(targetNum) ? targetNum - Number(currentBalance || 0) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!Number.isFinite(targetNum) || targetNum < 0) {
      setErr("Enter a valid balance (0 or greater).");
      return;
    }
    if (delta === 0) {
      setErr("New balance matches the current balance — nothing to record.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("vault_entries").insert({
        amount: delta,
        change_type: "adjustment",
        note: note.trim() || `Balance snapshot: ${PHP(targetNum)}`,
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
            Enter the amount of cash currently in the vault. The system will
            record the change from the previous balance for audit history.
          </p>

          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Previous Balance</span>
            <span className="text-sm font-bold text-gray-700 tabular-nums">{PHP(currentBalance)}</span>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
              Current Vault Balance (PHP)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
              placeholder="0.00"
              className="w-full h-11 rounded-lg border border-gray-300 px-3 text-lg font-bold text-gray-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-green-500"
              autoFocus
            />
            {newBalance !== "" && Number.isFinite(targetNum) && delta !== 0 && (
              <p className={`mt-2 text-xs font-semibold ${delta > 0 ? "text-emerald-700" : "text-red-700"}`}>
                {delta > 0 ? "▲" : "▼"} {PHP(Math.abs(delta))} vs. previous balance
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
