/**
 * Interest on Share Capital (ISC) Distribution
 *
 * Authoritative formulas, transcribed from the cooperative's accounting
 * specification. Where this code and these formulas disagree, the formulas win.
 * See ISC_DISTRIBUTION_MODULE.md for the full note.
 *
 *  1. Monthly running balance (per member)
 *       Month m Balance = Month (m-1) Balance + CRJ_m - CDJ_m
 *     For January the previous balance is the starting share capital carried
 *     forward from the prior fiscal year.
 *
 *  2. Member annual cumulative total
 *       Member Total = Σ (m = 1..12) Month m Balance = Jan + Feb + ... + Dec
 *     This sums the twelve month-end BALANCES, not the transactions.
 *
 *  3. Individual member average (AMSC)
 *       Member Average = Member Total / 12
 *
 *  4. Total cooperative average share capital
 *       Total Cooperative Average = Σ Member Average
 *                                 = Average_1 + Average_2 + ... + Average_n
 *
 *  5. Cooperative ISC rate
 *       ISC Rate = Audited Net Surplus Allocated for ISC
 *                  ---------------------------------------
 *                        Total Cooperative Average
 *     Held unrounded in state; rounded only for display.
 *
 *  6. Individual member ISC payout
 *       Member Payout = Member Average × ISC Rate
 *
 *  7. Reconciliation check
 *       Σ Member Payouts = Total Audited Net Surplus Allocated for ISC
 *     Exactly, not within a tolerance. Enforced by reconcileToPool().
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Columns3,
  Download,
  Eye,
  RefreshCw,
  Send,
  Table2,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

/** A single member's raw ledger input for one fiscal year. */
export interface MemberLedgerRow {
  /** Stable row key. */
  id: string;
  /** Displayed member number / account code. */
  memberNo: string;
  /** Surname, First name. */
  name: string;
  /** Share capital carried forward from the prior fiscal year. */
  openingBalance: number;
  /** Cash Receipts Journal amounts, index 0 = January … 11 = December. */
  crj: number[];
  /** Cash Disbursements Journal amounts, index 0 = January … 11 = December. */
  cdj: number[];
}

/** A fully computed row, derived from a MemberLedgerRow. */
export interface ComputedMemberRow extends MemberLedgerRow {
  /** Running month-end balance for each of the 12 months. */
  monthEnd: number[];
  /** Σ of the 12 month-end balances. */
  cumulative: number;
  /** cumulative / 12 — the member's average monthly share capital. */
  average: number;
  /** average × ISC rate, unrounded. */
  payoutRaw: number;
  /** payoutRaw after centavo reconciliation against the pool. */
  payout: number;
  /** True when a ±0.01 residual centavo was assigned to this row. */
  adjusted: boolean;
}

export interface PostBatchPayload {
  fiscalYear: number;
  allocatedPool: number;
  iscRate: number;
  totalAverageShareCapital: number;
  rows: ComputedMemberRow[];
}

export interface ISCDistributionModuleProps {
  initialMembers?: MemberLedgerRow[];
  initialPool?: number;
  initialFiscalYear?: number;
  fiscalYears?: number[];
  /** Called when the treasurer posts the batch to the journal. */
  onPostBatch?: (payload: PostBatchPayload) => void | Promise<void>;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Constants & helpers                                                        */
/* -------------------------------------------------------------------------- */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const W_MEMBER = 236;
const W_OPENING = 148;
const W_SUB = 112;
const W_MONTH_ONLY = 124;
const W_SUMMARY = 148;

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plain = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Currency for totals and payouts. */
const money = (n: number) => peso.format(n);
/** Bare number for dense in-grid figures. */
const num = (n: number) => plain.format(n);

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const parseAmount = (raw: string): number => {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
};

/**
 * Largest-remainder allocation.
 *
 * Rounding each payout independently can leave the batch a few centavos short
 * of the allocated pool. This floors every payout to the centavo, then hands
 * the residual centavos to the rows with the largest discarded fractions, so
 * Σ payouts is exactly equal to the pool — the reconciliation constraint.
 */
function reconcileToPool(
  rawPayouts: number[],
  poolTotal: number,
): { values: number[]; adjusted: boolean[] } {
  const n = rawPayouts.length;
  const values = new Array<number>(n).fill(0);
  const adjusted = new Array<boolean>(n).fill(false);
  if (n === 0) return { values, adjusted };

  const baseCents = rawPayouts.map((v) => Math.floor(v * 100));
  const fractions = rawPayouts.map((v, i) => v * 100 - baseCents[i]);
  const targetCents = Math.round(poolTotal * 100);

  let residual = targetCents - baseCents.reduce((sum, c) => sum + c, 0);

  // Rank rows by discarded fraction, descending; ties break on ledger order.
  const ranked = fractions
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f - a.f || a.i - b.i);

  const cents = [...baseCents];
  let cursor = 0;
  while (residual > 0) {
    const target = ranked[cursor % n].i;
    cents[target] += 1;
    adjusted[target] = true;
    residual -= 1;
    cursor += 1;
  }
  cursor = 0;
  while (residual < 0) {
    const target = ranked[(n - 1 - (cursor % n) + n) % n].i;
    cents[target] -= 1;
    adjusted[target] = true;
    residual += 1;
    cursor += 1;
  }

  for (let i = 0; i < n; i += 1) values[i] = cents[i] / 100;
  return { values, adjusted };
}

/* -------------------------------------------------------------------------- */
/*  Verified mock ledger                                                       */
/* -------------------------------------------------------------------------- */

const zeros = () => new Array(12).fill(0);
const at = (entries: Record<number, number>) => {
  const arr = zeros();
  for (const [k, v] of Object.entries(entries)) arr[Number(k)] = v;
  return arr;
};

/**
 * Preloaded fixtures. Each row's monthly movements are chosen so the twelve
 * month-end balances sum to the cumulative total in the accounting spec.
 */
export const SAMPLE_MEMBERS: MemberLedgerRow[] = [
  {
    // Σ month-end = 438,000.00 → average 36,500.00 → payout 4,104.97
    id: "m1",
    memberNo: "SC-2019-0041",
    name: "Gero, Juan Miguel",
    openingBalance: 25000,
    crj: new Array(12).fill(2000),
    cdj: at({ 9: 6000 }),
  },
  {
    // Σ month-end = 1,296,000.00 → average 108,000.00 → payout 12,146.20
    id: "m2",
    memberNo: "SC-2011-0007",
    name: "Bautista, Maria Corazon",
    openingBalance: 100000,
    crj: at({ 0: 8000, 6: 12000 }),
    cdj: at({ 9: 24000 }),
  },
  {
    // Σ month-end = 70,000.00 → average 5,833.33 → payout 656.04
    id: "m3",
    memberNo: "SC-2024-0198",
    name: "Delos Santos, Ramon",
    openingBalance: 5000,
    crj: at({ 2: 1000 }),
    cdj: zeros(),
  },
  {
    // Σ month-end = 90,000.00 → average 7,500.00 → payout 843.49
    id: "m4",
    memberNo: "SC-2022-0113",
    name: "Villanueva, Anna Liza",
    openingBalance: 7000,
    crj: at({ 6: 1000 }),
    cdj: zeros(),
  },
  {
    // Σ month-end = 120,000.00 → average 10,000.00 → payout 1,124.65
    id: "m5",
    memberNo: "SC-2018-0076",
    name: "Ocampo, Jose Enrique",
    openingBalance: 8000,
    crj: at({ 0: 1000, 6: 2000 }),
    cdj: zeros(),
  },
  {
    // Σ month-end = 120,000.00 → average 10,000.00 → payout 1,124.65
    id: "m6",
    memberNo: "SC-2015-0052",
    name: "Fernandez, Grace Ann",
    openingBalance: 15000,
    crj: zeros(),
    cdj: at({ 0: 3000, 6: 4000 }),
  },
];

/* -------------------------------------------------------------------------- */
/*  Editable amount cell                                                       */
/* -------------------------------------------------------------------------- */

interface AmountCellProps {
  value: number;
  tone: "receipt" | "disbursement";
  label: string;
  onCommit: (value: number) => void;
}

const AmountCell: React.FC<AmountCellProps> = ({ value, tone, label, onCommit }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const display = editing
    ? (draft as string)
    : value === 0
      ? ""
      : num(value);

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={display}
      placeholder="–"
      onFocus={(e) => {
        setDraft(value === 0 ? "" : String(value));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null) onCommit(draft.trim() === "" ? 0 : parseAmount(draft));
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cx(
        "w-full bg-transparent px-2 py-1.5 text-right text-[13px] tabular-nums",
        "rounded-[3px] outline-none transition-colors",
        "placeholder:text-slate-300",
        "hover:bg-white focus:bg-white focus:ring-2 focus:ring-inset",
        tone === "receipt"
          ? "text-emerald-800 focus:ring-emerald-500"
          : "text-rose-800 focus:ring-rose-500",
      )}
    />
  );
};

/* -------------------------------------------------------------------------- */
/*  Module                                                                     */
/* -------------------------------------------------------------------------- */

const ISCDistributionModule: React.FC<ISCDistributionModuleProps> = ({
  initialMembers = SAMPLE_MEMBERS,
  initialPool = 20000,
  initialFiscalYear = 2025,
  fiscalYears = [2023, 2024, 2025, 2026],
  onPostBatch,
  className,
}) => {
  const [members, setMembers] = useState<MemberLedgerRow[]>(initialMembers);
  const [fiscalYear, setFiscalYear] = useState<number>(initialFiscalYear);
  const [pool, setPool] = useState<number>(initialPool);
  const [poolDraft, setPoolDraft] = useState<string | null>(null);
  const [fullJournal, setFullJournal] = useState(true);
  const [ratePercent, setRatePercent] = useState(true);
  const [posted, setPosted] = useState<string | null>(null);
  const [recalcPulse, setRecalcPulse] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  /* ---- derived ledger ---------------------------------------------------- */

  const ledger = useMemo(() => {
    const rows = members.map((m) => {
      // (1) Month m Balance = Month (m-1) Balance + CRJ_m - CDJ_m
      const monthEnd: number[] = [];
      let running = m.openingBalance;
      for (let i = 0; i < 12; i += 1) {
        running = running + (m.crj[i] ?? 0) - (m.cdj[i] ?? 0);
        monthEnd.push(running);
      }
      // (2) Member Total = Σ of the twelve month-end balances.
      const cumulative = monthEnd.reduce((a, b) => a + b, 0);
      // (3) Member Average = Member Total / 12
      return { ...m, monthEnd, cumulative, average: cumulative / 12 };
    });

    // (4) Total Cooperative Average = Σ of the individual averages.
    const totalAverage = rows.reduce((a, r) => a + r.average, 0);

    // (5) ISC Rate = allocated surplus / total cooperative average.
    // Full unrounded precision is kept here and used for every payout.
    const rate = totalAverage > 0 ? pool / totalAverage : 0;

    // (6) Member Payout = Member Average × ISC Rate
    const rawPayouts = rows.map((r) => r.average * rate);
    // (7) Σ Member Payouts must equal the pool exactly.
    const { values, adjusted } = reconcileToPool(rawPayouts, pool);

    const computed: ComputedMemberRow[] = rows.map((r, i) => ({
      ...r,
      payoutRaw: rawPayouts[i],
      payout: values[i],
      adjusted: adjusted[i],
    }));

    const monthTotals = MONTHS.map((_, i) => ({
      crj: rows.reduce((a, r) => a + (r.crj[i] ?? 0), 0),
      cdj: rows.reduce((a, r) => a + (r.cdj[i] ?? 0), 0),
      end: rows.reduce((a, r) => a + r.monthEnd[i], 0),
    }));

    const totalPayout = computed.reduce((a, r) => a + r.payout, 0);

    return {
      rows: computed,
      totalOpening: rows.reduce((a, r) => a + r.openingBalance, 0),
      monthTotals,
      grandCumulative: rows.reduce((a, r) => a + r.cumulative, 0),
      totalAverage,
      rate,
      totalPayout,
      variance: totalPayout - pool,
      balanced: Math.abs(totalPayout - pool) < 0.005,
    };
  }, [members, pool, recalcPulse]);

  /* ---- mutations --------------------------------------------------------- */

  const updateEntry = useCallback(
    (rowId: string, book: "crj" | "cdj", monthIndex: number, value: number) => {
      setPosted(null);
      setMembers((prev) =>
        prev.map((m) => {
          if (m.id !== rowId) return m;
          const next = [...m[book]];
          next[monthIndex] = value;
          return { ...m, [book]: next };
        }),
      );
    },
    [],
  );

  const updateOpening = useCallback((rowId: string, value: number) => {
    setPosted(null);
    setMembers((prev) =>
      prev.map((m) => (m.id === rowId ? { ...m, openingBalance: value } : m)),
    );
  }, []);

  const exportCsv = useCallback(() => {
    const head = [
      "Member no.",
      "Member name",
      `Share capital (${fiscalYear - 1})`,
      ...MONTHS.flatMap((mo) => [`${mo} CRJ`, `${mo} CDJ`, `${mo} balance`]),
      "Annual total",
      "Average share capital",
      "ISC rate",
      "ISC payout",
    ];
    const body = ledger.rows.map((r) => [
      r.memberNo,
      r.name,
      r.openingBalance.toFixed(2),
      ...MONTHS.flatMap((_, i) => [
        (r.crj[i] ?? 0).toFixed(2),
        (r.cdj[i] ?? 0).toFixed(2),
        r.monthEnd[i].toFixed(2),
      ]),
      r.cumulative.toFixed(2),
      r.average.toFixed(2),
      ledger.rate.toFixed(9),
      r.payout.toFixed(2),
    ]);
    const foot = [
      "",
      "Total",
      ledger.totalOpening.toFixed(2),
      ...ledger.monthTotals.flatMap((t) => [
        t.crj.toFixed(2),
        t.cdj.toFixed(2),
        t.end.toFixed(2),
      ]),
      ledger.grandCumulative.toFixed(2),
      ledger.totalAverage.toFixed(2),
      ledger.rate.toFixed(9),
      ledger.totalPayout.toFixed(2),
    ];

    const csv = [head, ...body, foot]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\r\n");

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `isc-distribution-${fiscalYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [ledger, fiscalYear]);

  const postBatch = useCallback(async () => {
    if (!ledger.balanced) return;
    await onPostBatch?.({
      fiscalYear,
      allocatedPool: pool,
      iscRate: ledger.rate,
      totalAverageShareCapital: ledger.totalAverage,
      rows: ledger.rows,
    });
    setPosted(
      `Posted ${ledger.rows.length} member payouts to the ${fiscalYear} journal at ${new Date().toLocaleTimeString(
        "en-PH",
        { hour: "2-digit", minute: "2-digit" },
      )}.`,
    );
  }, [ledger, fiscalYear, pool, onPostBatch]);

  /* ---- shared cell classes ---------------------------------------------- */

  const rule = "border-b border-r border-slate-200";
  const headBase =
    "sticky bg-slate-800 text-slate-100 font-medium text-[11px] tracking-normal";
  const stickyMember = "sticky left-0";

  const monthSpan = fullJournal ? 3 : 1;
  const monthWidth = fullJournal ? W_SUB * 3 : W_MONTH_ONLY;

  // Fixed layout keeps the colgroup widths authoritative, which is what the
  // sticky left offsets below are measured against.
  const tableWidth =
    W_MEMBER + W_OPENING + 12 * monthWidth + W_SUMMARY * 3 + 122;

  const rateLabel = ratePercent
    ? `${(ledger.rate * 100).toFixed(6)}%`
    : ledger.rate.toFixed(9);

  return (
    <section
      className={cx(
        "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-slate-300 bg-white",
        "font-sans text-slate-900",
        className,
      )}
    >
      {/* ------------------------------ toolbar ----------------------------- */}
      <header className="border-b border-slate-300 bg-slate-800 px-4 py-3 text-slate-100">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-[260px]">
            <h2 className="text-[17px] font-semibold leading-tight text-white">
              Interest on Share Capital (ISC) Distribution
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-400">
              Fiscal year {fiscalYear} · {ledger.rows.length} members with share
              capital on record
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-400">Fiscal year</span>
              <select
                value={fiscalYear}
                onChange={(e) => {
                  setFiscalYear(Number(e.target.value));
                  setPosted(null);
                }}
                className="h-9 rounded-md border border-slate-600 bg-slate-900 px-2.5 text-[13px] text-slate-100 outline-none focus:ring-2 focus:ring-amber-400"
              >
                {fiscalYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-400">
                Net surplus allocated for ISC
              </span>
              <div className="flex h-9 items-center rounded-md border border-slate-600 bg-slate-900 pl-2.5 focus-within:ring-2 focus-within:ring-amber-400">
                <span className="text-[13px] text-slate-400">₱</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Net surplus allocated for interest on share capital"
                  value={poolDraft ?? num(pool)}
                  onFocus={(e) => {
                    setPoolDraft(String(pool));
                    requestAnimationFrame(() => e.target.select());
                  }}
                  onChange={(e) => setPoolDraft(e.target.value)}
                  onBlur={() => {
                    if (poolDraft !== null) {
                      setPool(Math.max(0, parseAmount(poolDraft)));
                      setPosted(null);
                    }
                    setPoolDraft(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="w-36 bg-transparent px-1.5 text-right text-[13px] font-medium tabular-nums text-white outline-none"
                />
              </div>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFullJournal((v) => !v)}
                title={
                  fullJournal
                    ? "Collapse to month-end balances only"
                    : "Expand to show CRJ and CDJ entries"
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-600 bg-slate-900 px-3 text-[13px] text-slate-100 transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {fullJournal ? (
                  <Columns3 className="h-4 w-4" />
                ) : (
                  <Table2 className="h-4 w-4" />
                )}
                {fullJournal ? "Full journal view" : "Month totals only"}
              </button>

              <button
                type="button"
                onClick={() => setRecalcPulse((n) => n + 1)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-600 bg-slate-900 px-3 text-[13px] text-slate-100 transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <RefreshCw className="h-4 w-4" />
                Recalculate
              </button>

              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-600 bg-slate-900 px-3 text-[13px] text-slate-100 transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <Download className="h-4 w-4" />
                Export
              </button>

              <button
                type="button"
                onClick={postBatch}
                disabled={!ledger.balanced}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-amber-400 px-3.5 text-[13px] font-semibold text-slate-900 transition-colors hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400"
              >
                <Send className="h-4 w-4" />
                Post batch
              </button>
            </div>
          </div>
        </div>

        {/* Reconciliation readout — one line, no metric cards. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-slate-700 pt-2.5 text-[12px] tabular-nums text-slate-300">
          <span>
            Total average share capital{" "}
            <strong className="font-semibold text-white">
              {money(ledger.totalAverage)}
            </strong>
          </span>
          <span className="text-slate-600">|</span>
          <button
            type="button"
            onClick={() => setRatePercent((v) => !v)}
            title={`Unrounded rate: ${ledger.rate}`}
            className="inline-flex items-center gap-1.5 rounded px-1 text-slate-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <Eye className="h-3.5 w-3.5" />
            ISC rate{" "}
            <strong className="font-semibold text-amber-300">{rateLabel}</strong>
          </button>
          <span className="text-slate-600">|</span>
          <span
            className={cx(
              "inline-flex items-center gap-1.5",
              ledger.balanced ? "text-emerald-300" : "text-rose-300",
            )}
          >
            {ledger.balanced ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            {ledger.balanced
              ? `Distribution reconciles to ${money(pool)}`
              : `Out of balance by ${money(ledger.variance)}`}
          </span>
          {posted && (
            <>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-300">{posted}</span>
            </>
          )}
        </div>
      </header>

      {/* ------------------------------- grid ------------------------------- */}
      <div ref={gridRef} className="min-h-0 flex-1 overflow-auto">
        <table
          className="table-fixed border-separate border-spacing-0 text-[13px]"
          style={{ width: tableWidth }}
        >
          <colgroup>
            <col style={{ width: W_MEMBER }} />
            <col style={{ width: W_OPENING }} />
            {MONTHS.map((mo) =>
              fullJournal ? (
                <React.Fragment key={mo}>
                  <col style={{ width: W_SUB }} />
                  <col style={{ width: W_SUB }} />
                  <col style={{ width: W_SUB }} />
                </React.Fragment>
              ) : (
                <col key={mo} style={{ width: W_MONTH_ONLY }} />
              ),
            )}
            <col style={{ width: W_SUMMARY }} />
            <col style={{ width: W_SUMMARY }} />
            <col style={{ width: 122 }} />
            <col style={{ width: W_SUMMARY }} />
          </colgroup>

          <thead>
            {/* Tier 1 — group headers */}
            <tr>
              <th
                rowSpan={2}
                className={cx(
                  headBase,
                  stickyMember,
                  "top-0 z-40 border-b border-r border-slate-600 px-3 text-left align-bottom pb-2",
                )}
                style={{ width: W_MEMBER }}
              >
                Member
              </th>
              <th
                rowSpan={2}
                className={cx(
                  headBase,
                  "top-0 z-40 border-b border-r border-slate-600 px-3 pb-2 text-right align-bottom",
                  "shadow-[6px_0_8px_-6px_rgba(15,23,42,0.25)]",
                )}
                style={{ left: W_MEMBER, position: "sticky", width: W_OPENING }}
              >
                Share capital
                <span className="block font-normal text-slate-400">
                  as of Dec {fiscalYear - 1}
                </span>
              </th>

              {MONTHS.map((mo, i) => (
                <th
                  key={mo}
                  colSpan={monthSpan}
                  rowSpan={fullJournal ? 1 : 2}
                  className={cx(
                    headBase,
                    "top-0 z-20 border-b border-r border-slate-600 px-2 py-1.5",
                    fullJournal ? "text-center" : "text-right align-bottom pb-2",
                    i % 2 === 1 && "bg-slate-700",
                  )}
                  style={{ width: monthWidth }}
                >
                  {mo} {fiscalYear}
                </th>
              ))}

              <th
                colSpan={4}
                className={cx(
                  headBase,
                  "top-0 z-20 border-b border-l-2 border-r border-slate-600 border-l-amber-400 bg-slate-900 px-2 py-1.5 text-center",
                )}
              >
                Interest on share capital
              </th>
            </tr>

            {/* Tier 2 — sub headers */}
            <tr>
              {fullJournal &&
                MONTHS.map((mo, i) => (
                  <React.Fragment key={mo}>
                    <th
                      className={cx(
                        headBase,
                        "top-[29px] z-20 border-b border-r border-slate-600 px-2 py-1 text-right font-normal text-emerald-300",
                        i % 2 === 1 && "bg-slate-700",
                      )}
                      title={`${mo} cash receipts journal`}
                    >
                      CRJ
                    </th>
                    <th
                      className={cx(
                        headBase,
                        "top-[29px] z-20 border-b border-r border-slate-600 px-2 py-1 text-right font-normal text-rose-300",
                        i % 2 === 1 && "bg-slate-700",
                      )}
                      title={`${mo} cash disbursements journal`}
                    >
                      CDJ
                    </th>
                    <th
                      className={cx(
                        headBase,
                        "top-[29px] z-20 border-b border-r border-slate-600 px-2 py-1 text-right",
                        i % 2 === 1 && "bg-slate-700",
                      )}
                      title={`${mo} month-end balance`}
                    >
                      Balance
                    </th>
                  </React.Fragment>
                ))}

              <th
                className={cx(
                  headBase,
                  "top-[29px] z-20 border-b border-l-2 border-r border-slate-600 border-l-amber-400 bg-slate-900 px-2 py-1 text-right",
                )}
                title="Sum of the twelve month-end balances"
              >
                Total
              </th>
              <th
                className={cx(
                  headBase,
                  "top-[29px] z-20 border-b border-r border-slate-600 bg-slate-900 px-2 py-1 text-right",
                )}
                title="Average monthly share capital = Total ÷ 12"
              >
                Average
              </th>
              <th
                className={cx(
                  headBase,
                  "top-[29px] z-20 border-b border-r border-slate-600 bg-slate-900 px-2 py-1 text-right",
                )}
              >
                ISC rate
              </th>
              <th
                className={cx(
                  headBase,
                  "top-[29px] z-20 border-b border-r border-slate-600 bg-slate-900 px-2 py-1 text-right",
                )}
              >
                Payout
              </th>
            </tr>
          </thead>

          <tbody>
            {ledger.rows.map((row, rowIndex) => {
              const band = rowIndex % 2 === 1;
              const bandBg = band ? "bg-[#F1F6F0]" : "bg-white";
              return (
                <tr key={row.id} className="group">
                  <th
                    scope="row"
                    className={cx(
                      stickyMember,
                      "z-10 px-3 py-1.5 text-left font-normal",
                      rule,
                      bandBg,
                      "group-hover:bg-amber-50",
                    )}
                  >
                    <span className="block truncate text-[13px] font-medium text-slate-900">
                      {row.name}
                    </span>
                    <span className="block truncate text-[11px] tabular-nums text-slate-500">
                      {row.memberNo}
                    </span>
                  </th>

                  <td
                    className={cx(
                      "z-10 px-1 py-0 shadow-[6px_0_8px_-6px_rgba(15,23,42,0.18)]",
                      rule,
                      bandBg,
                      "group-hover:bg-amber-50",
                    )}
                    style={{ left: W_MEMBER, position: "sticky" }}
                  >
                    <AmountCell
                      value={row.openingBalance}
                      tone="receipt"
                      label={`${row.name} beginning share capital`}
                      onCommit={(v) => updateOpening(row.id, v)}
                    />
                  </td>

                  {MONTHS.map((mo, i) => {
                    const shade = i % 2 === 1;
                    const cellBg = shade
                      ? band
                        ? "bg-[#E8F0E6]"
                        : "bg-slate-50"
                      : bandBg;
                    return fullJournal ? (
                      <React.Fragment key={mo}>
                        <td className={cx("px-1 py-0", rule, cellBg, "group-hover:bg-amber-50")}>
                          <AmountCell
                            value={row.crj[i] ?? 0}
                            tone="receipt"
                            label={`${row.name} ${mo} cash receipts`}
                            onCommit={(v) => updateEntry(row.id, "crj", i, v)}
                          />
                        </td>
                        <td className={cx("px-1 py-0", rule, cellBg, "group-hover:bg-amber-50")}>
                          <AmountCell
                            value={row.cdj[i] ?? 0}
                            tone="disbursement"
                            label={`${row.name} ${mo} cash disbursements`}
                            onCommit={(v) => updateEntry(row.id, "cdj", i, v)}
                          />
                        </td>
                        <td
                          className={cx(
                            "px-2 py-1.5 text-right tabular-nums text-slate-700",
                            rule,
                            cellBg,
                            "group-hover:bg-amber-50",
                          )}
                        >
                          {num(row.monthEnd[i])}
                        </td>
                      </React.Fragment>
                    ) : (
                      <td
                        key={mo}
                        className={cx(
                          "px-2 py-1.5 text-right tabular-nums text-slate-700",
                          rule,
                          cellBg,
                          "group-hover:bg-amber-50",
                        )}
                      >
                        {num(row.monthEnd[i])}
                      </td>
                    );
                  })}

                  <td
                    className={cx(
                      "border-l-2 border-l-amber-400 px-2 py-1.5 text-right font-medium tabular-nums",
                      rule,
                      bandBg,
                      "group-hover:bg-amber-50",
                    )}
                  >
                    {num(row.cumulative)}
                  </td>
                  <td
                    className={cx(
                      "px-2 py-1.5 text-right tabular-nums",
                      rule,
                      bandBg,
                      "group-hover:bg-amber-50",
                    )}
                  >
                    {num(row.average)}
                  </td>
                  <td
                    className={cx(
                      "px-2 py-1.5 text-right tabular-nums text-slate-500",
                      rule,
                      bandBg,
                      "group-hover:bg-amber-50",
                    )}
                    title={`Unrounded: ${ledger.rate}`}
                  >
                    {rateLabel}
                  </td>
                  <td
                    className={cx(
                      "px-2 py-1.5 text-right font-semibold tabular-nums text-slate-900",
                      rule,
                      bandBg,
                      "group-hover:bg-amber-50",
                    )}
                    title={
                      row.adjusted
                        ? `Unrounded ${row.payoutRaw.toFixed(
                            6,
                          )} — carries a residual centavo so the batch reconciles`
                        : `Unrounded ${row.payoutRaw.toFixed(6)}`
                    }
                  >
                    {money(row.payout)}
                    {row.adjusted && (
                      <span
                        aria-hidden
                        className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <th
                scope="row"
                className={cx(
                  stickyMember,
                  "sticky bottom-0 z-40 border-t-2 border-b border-r border-slate-400 border-t-slate-800 bg-slate-100 px-3 py-2 text-left text-[13px] font-semibold",
                )}
              >
                Total
                <span className="block text-[11px] font-normal text-slate-500">
                  {ledger.rows.length} members
                </span>
              </th>
              <td
                className="sticky bottom-0 z-40 border-b border-r border-t-2 border-slate-400 border-t-slate-800 bg-slate-100 px-2 py-2 text-right font-semibold tabular-nums shadow-[6px_0_8px_-6px_rgba(15,23,42,0.18)]"
                style={{ left: W_MEMBER, position: "sticky" }}
              >
                {num(ledger.totalOpening)}
              </td>

              {ledger.monthTotals.map((t, i) =>
                fullJournal ? (
                  <React.Fragment key={MONTHS[i]}>
                    <td className="sticky bottom-0 z-30 border-t-2 border-b border-r border-slate-400 border-t-slate-800 bg-slate-100 px-2 py-2 text-right tabular-nums text-emerald-800">
                      {t.crj === 0 ? "–" : num(t.crj)}
                    </td>
                    <td className="sticky bottom-0 z-30 border-t-2 border-b border-r border-slate-400 border-t-slate-800 bg-slate-100 px-2 py-2 text-right tabular-nums text-rose-800">
                      {t.cdj === 0 ? "–" : num(t.cdj)}
                    </td>
                    <td className="sticky bottom-0 z-30 border-t-2 border-b border-r border-slate-400 border-t-slate-800 bg-slate-100 px-2 py-2 text-right font-semibold tabular-nums">
                      {num(t.end)}
                    </td>
                  </React.Fragment>
                ) : (
                  <td
                    key={MONTHS[i]}
                    className="sticky bottom-0 z-30 border-t-2 border-b border-r border-slate-400 border-t-slate-800 bg-slate-100 px-2 py-2 text-right font-semibold tabular-nums"
                  >
                    {num(t.end)}
                  </td>
                ),
              )}

              <td className="sticky bottom-0 z-30 border-t-2 border-b border-l-2 border-r border-slate-400 border-t-slate-800 border-l-amber-400 bg-slate-100 px-2 py-2 text-right font-semibold tabular-nums">
                {num(ledger.grandCumulative)}
              </td>
              <td className="sticky bottom-0 z-30 border-t-2 border-b border-r border-slate-400 border-t-slate-800 bg-slate-100 px-2 py-2 text-right font-semibold tabular-nums">
                {num(ledger.totalAverage)}
              </td>
              <td className="sticky bottom-0 z-30 border-t-2 border-b border-r border-slate-400 border-t-slate-800 bg-slate-100 px-2 py-2 text-right tabular-nums text-slate-500">
                {rateLabel}
              </td>
              <td
                className={cx(
                  "sticky bottom-0 z-30 border-t-2 border-b border-r border-slate-400 border-t-slate-800 px-2 py-2 text-right font-bold tabular-nums",
                  ledger.balanced
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-rose-50 text-rose-900",
                )}
                title={
                  ledger.balanced
                    ? "Reconciles exactly to the allocated pool"
                    : `Variance ${money(ledger.variance)}`
                }
              >
                {money(ledger.totalPayout)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ------------------------------ legend ------------------------------ */}
      <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-300 bg-slate-50 px-4 py-2 text-[11.5px] text-slate-600">
        {fullJournal && (
          <>
            <span>
              <span className="mr-1 font-medium text-emerald-800">CRJ</span>
              share capital received
            </span>
            <span>
              <span className="mr-1 font-medium text-rose-800">CDJ</span>
              share capital withdrawn
            </span>
          </>
        )}
        <span>Balance carries forward into the next month</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          residual centavo assigned by largest remainder
        </span>
        <span className="ml-auto text-slate-500">
          {fullJournal
            ? "Click any CRJ or CDJ figure to edit. Totals update as you type."
            : "Switch to the full journal view to edit monthly entries."}
        </span>
      </footer>
    </section>
  );
};

export default ISCDistributionModule;
