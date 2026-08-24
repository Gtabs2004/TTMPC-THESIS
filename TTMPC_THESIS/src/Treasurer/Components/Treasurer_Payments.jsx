import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import StaffSidebar from "../../components/StaffSidebar";
import { treasurerNav } from "../../components/StaffSidebar/configs/treasurer";
import {
  Search,
  Wallet,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  ArrowDownCircle,
  ArrowUpCircle,
  Filter,
  Info,
  User,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const PHP = (v) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(Number(v || 0));

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
};

// The backend composes description as "<category> · <detail>" (e.g. "Loan
// payment · CTRL-2024-001") when there's a specific record to point at, or
// just "<category>" when there isn't (e.g. "CBU contribution"). Split it so
// the table can show the category as a bold headline and the detail as a
// muted line underneath, instead of one flat run-on string with a raw dot.
const splitDescription = (desc) => {
  const s = String(desc || "").trim();
  const sepIdx = s.indexOf(" · ");
  if (sepIdx === -1) return { primary: s || "—", secondary: "" };
  return { primary: s.slice(0, sepIdx), secondary: s.slice(sepIdx + 3) };
};

// Ledger-entry type metadata. Colors distinguish inflow (green tint) vs
// outflow (red tint) so a treasurer scanning the ledger sees direction at
// a glance without reading the debit/credit columns.
const TYPE_META = {
  loan_payment:        { label: "Loan Payment",        cls: "bg-green-50 text-green-700 ring-1 ring-green-200",     dir: "in"  },
  loan_disbursal:      { label: "Loan Disbursal",      cls: "bg-red-50 text-red-700 ring-1 ring-red-200",           dir: "out" },
  savings_deposit:     { label: "Savings Deposit",     cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", dir: "in"  },
  savings_withdrawal:  { label: "Savings Withdrawal",  cls: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",  dir: "out" },
  cbu_contribution:    { label: "CBU Contribution",    cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",        dir: "in"  },
  membership_payment:  { label: "Membership Payment",  cls: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",  dir: "in"  },
  vault_adjustment:    { label: "Vault Adjustment",    cls: "bg-gray-50 text-gray-700 ring-1 ring-gray-200",        dir: "any" },
};

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "loan_payment", label: "Loan Payments" },
  { value: "loan_disbursal", label: "Loan Disbursals" },
  { value: "savings_deposit", label: "Savings Deposits" },
  { value: "savings_withdrawal", label: "Savings Withdrawals" },
  { value: "cbu_contribution", label: "CBU Contributions" },
  { value: "membership_payment", label: "Membership Payments" },
  { value: "vault_adjustment", label: "Vault Adjustments" },
];

// Default window: last 30 days ending today. Formatted as YYYY-MM-DD for the
// native date inputs (avoids timezone drift from toISOString/toLocaleDateString).
const toIsoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const Treasurer_Payments = () => {
  const today = useMemo(() => new Date(), []);
  const defaultStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return d;
  }, [today]);

  const [startDate, setStartDate] = useState(toIsoDate(defaultStart));
  const [endDate, setEndDate] = useState(toIsoDate(today));
  const [typeFilter, setTypeFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [ledger, setLedger] = useState({
    entries: [],
    total_count: 0,
    total_debit: 0,
    total_credit: 0,
    net: 0,
    window: { start: "", end: "" },
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        limit: "2000",
        offset: "0",
      });
      if (typeFilter) params.set("type_filter", typeFilter);
      const r = await fetch(`${API_BASE_URL}/api/treasurer/cash-ledger?${params.toString()}`);
      const payload = await r.json();
      if (!r.ok || !payload?.success) {
        throw new Error(payload?.detail || "Failed to load ledger.");
      }
      setLedger(payload.data);
      setPage(1);
    } catch (e) {
      setLoadError(e?.message || "Unable to load ledger.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, typeFilter]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  // Client-side search filter across description + member + reference. The
  // backend already applied the date window and type filter; search is
  // client-side because the entry list is bounded (paged 2000 max).
  const searchedEntries = useMemo(() => {
    const q = String(searchTerm || "").trim().toLowerCase();
    if (!q) return ledger.entries;
    return ledger.entries.filter((e) => {
      return (
        String(e.description || "").toLowerCase().includes(q) ||
        String(e.member_name || "").toLowerCase().includes(q) ||
        String(e.reference || "").toLowerCase().includes(q)
      );
    });
  }, [ledger.entries, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(searchedEntries.length / PAGE_SIZE));
  const pagedEntries = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return searchedEntries.slice(start, start + PAGE_SIZE);
  }, [searchedEntries, page]);

  const setQuickRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(toIsoDate(start));
    setEndDate(toIsoDate(end));
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Treasurer" items={treasurerNav} />

      {/* MAIN */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shrink-0 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 pl-9 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Search description / member / ref..."
            />
          </div>
          <LoanNotificationBell role="treasurer" />
          <div className="ml-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
            <User className="w-4.5 h-4.5" />
          </div>
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Treasurer" />
        </header>

        <main className="p-8">
          {/* Breadcrumb + Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
              <span>Treasurer</span>
              <ChevronRightIcon className="w-4 h-4 text-gray-300" />
              <span className="text-primary">Payments</span>
            </div>
           
          </div>

          {/* KPI STRIP */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Total Debits (Cash In)</span>
                <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                  <ArrowDownCircle size={18} />
                </div>
              </div>
              <h3 className="mt-4 text-3xl font-bold text-gray-800 tabular-nums">
                {loading ? "…" : PHP(ledger.total_debit)}
              </h3>
              <div className="text-xs text-gray-400 mt-2">payments in for selected window</div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Total Credits (Cash Out)</span>
                <div className="p-2 bg-red-50 text-red-500 rounded-lg">
                  <ArrowUpCircle size={18} />
                </div>
              </div>
              <h3 className="mt-4 text-3xl font-bold text-gray-800 tabular-nums">
                {loading ? "…" : PHP(ledger.total_credit)}
              </h3>
              <div className="text-xs text-gray-400 mt-2">disbursals + withdrawals for selected window</div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Net Cash Movement</span>
                <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                  <Wallet size={18} />
                </div>
              </div>
              <h3 className={`mt-4 text-3xl font-bold tabular-nums ${
                ledger.net < 0 ? "text-red-600" : "text-gray-800"
              }`}>
                {loading ? "…" : PHP(ledger.net)}
              </h3>
              <div className="text-xs text-gray-400 mt-2">debits − credits (not vault balance)</div>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4 flex flex-wrap items-end gap-4">
            <div className="flex flex-col">
              <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1 flex items-center gap-1">
                <Filter size={11} /> Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setQuickRange(7)}
                className="text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-md px-3 py-1.5 font-medium"
              >
                Last 7d
              </button>
              <button
                onClick={() => setQuickRange(30)}
                className="text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-md px-3 py-1.5 font-medium"
              >
                Last 30d
              </button>
              <button
                onClick={() => setQuickRange(90)}
                className="text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-md px-3 py-1.5 font-medium"
              >
                Last 90d
              </button>
            </div>
          </div>

          {/* LEDGER TABLE */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="text-gray-800 font-bold text-lg">Ledger Entries</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {loading ? "Loading…" : `${searchedEntries.length} entries · ${ledger.window.start} to ${ledger.window.end}`}
                </p>
              </div>
              <div className="text-xs text-gray-400 flex items-center gap-1">
                <Info size={12} /> Debit = cash in, Credit = cash out (cooperative's cash-account perspective)
              </div>
            </div>

            {loadError && (
              <div className="mx-6 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {loadError}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-green-700 text-left text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="px-4 py-3 font-bold">Date</th>
                    <th className="px-4 py-3 font-bold">Reference</th>
                    <th className="px-4 py-3 font-bold">Description</th>
                    <th className="px-4 py-3 font-bold">Type</th>
                    <th className="px-4 py-3 font-bold">Member</th>
                    <th className="px-4 py-3 font-bold text-right" title="Cash in — from the cooperative's cash-account perspective">Debit</th>
                    <th className="px-4 py-3 font-bold text-right" title="Cash out — from the cooperative's cash-account perspective">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">Loading ledger…</td></tr>
                  ) : pagedEntries.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">No entries in this window.</td></tr>
                  ) : (
                    pagedEntries.map((e, idx) => {
                      const meta = TYPE_META[e.type] || { label: e.type, cls: "bg-gray-50 text-gray-700 ring-1 ring-gray-200", dir: "any" };
                      const { primary, secondary } = splitDescription(e.description);
                      return (
                        <tr key={`${e.source_table}-${e.reference}-${idx}`} className="border-b border-gray-50 hover:bg-gray-50/60">
                          <td className="px-4 py-2 text-gray-700 tabular-nums whitespace-nowrap">{formatDate(e.date)}</td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-600 ring-1 ring-gray-200">
                              {e.reference}
                            </span>
                          </td>
                          <td className="px-4 py-2 max-w-[16rem]">
                            <div className="font-semibold text-gray-800 truncate" title={e.description}>{primary}</div>
                            {secondary ? (
                              <div className="text-xs text-gray-500 truncate mt-0.5">{secondary}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{e.member_name || "—"}</td>
                          <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap font-medium">
                            {e.debit > 0 ? <span className="text-green-700">{PHP(e.debit)}</span> : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap font-medium">
                            {e.credit > 0 ? <span className="text-red-700">{PHP(e.credit)}</span> : <span className="text-gray-400">—</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {searchedEntries.length > 0 && (
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr className="border-t-2 border-gray-200">
                      <td colSpan={5} className="px-4 py-3 text-right text-gray-600 text-xs uppercase tracking-wider">Window totals</td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-700">{PHP(ledger.total_debit)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-700">{PHP(ledger.total_credit)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Pagination — reuses the pattern from Cashier_Payments (5-page groups). */}
            {searchedEntries.length > PAGE_SIZE && (
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

// Pagination — copied from Cashier_Payments.jsx to keep the paginator identical
// across the two payment pages. Renders 5-page groups with prev/next chevrons.
const Pagination = ({ page, totalPages, onChange }) => (
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

export default Treasurer_Payments;
