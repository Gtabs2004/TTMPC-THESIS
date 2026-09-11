import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Download,
  Users,
  Loader2,
  Table2,
  Calendar,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Send,
  Info,
  CheckCircle2,
} from "lucide-react";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import Pagination from "../../components/Pagination";
import ConfirmDialog from "../../components/ConfirmDialog";
import { supabase } from "../../supabaseClient";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { BRAND_GREEN, BAND_FILL, BORDER_SOFT, PESO_FORMAT, colLetter, downloadWorkbook } from "../../utils/excelExport";

const PAGE_SIZE = 10;

const YEAR = new Date().getFullYear();
const PERIOD_START = `${YEAR}-01-01`;
const PERIOD_END = `${YEAR}-12-01`; // the RPC expands this to the month's last day itself

// index 0 = January … 11 = December, matching crj_by_month / cdj_by_month /
// month_end_balances from isc_calculate_preview (FRONTEND_BRIEF.md §3).
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
].map((m) => `${m} ${YEAR}`);

const formatCurrency = (value) =>
  value === null || value === undefined
    ? "—"
    : `₱${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Bookkeeper_ISC = () => {
  const navigate = useNavigate();
  const { session } = UserAuth();
  const { addNotification } = useNotification();

  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // The bookkeeper types a RATE (matches how the cooperative actually works),
  // but the only posting function that still exists on the database takes a
  // POOL, not a rate — isc_post's rate-based overload was deliberately
  // dropped in the 2026-09-09 migration (ISC_DIVIDEND_PLAN.md §22.8: "isc_post
  // takes a pool, not a rate" / "exactly one isc_post, no stale overload").
  // So the typed rate is converted to its equivalent pool (rate% ×
  // total_average, itself an RPC-returned figure) before either previewing
  // or posting — the real arithmetic still happens inside
  // isc_calculate_preview/isc_post, this just picks the pool that reproduces
  // the rate the bookkeeper asked for.
  const [rateInput, setRateInput] = useState("");
  const [totalAverage, setTotalAverage] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const [postedAt, setPostedAt] = useState(null);
  const debounceRef = useRef(null);

  // Which month's CRJ/CDJ/Balance the table shows — defaults to the current
  // real-world month (e.g. opens on "Sep 2026" if today is in September),
  // switchable via the Month selector. This only changes which month's
  // FIGURES are displayed/sorted, never the calculation period itself —
  // the year-wide average and rate stay fixed at Jan-Dec (FRONTEND_BRIEF.md
  // §3.1); a display selector is not the period picker that section warns
  // against.
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());

  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const renderSortIcon = (key) => {
    if (sortKey !== key) return <ChevronsUpDown className="w-3 h-3 text-white/50" />;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 text-white" />
    ) : (
      <ChevronDown className="w-3 h-3 text-white" />
    );
  };

  // Two new columns, positioned between Month Balance and Average Share
  // Capital per the bookkeeper's own layout. Both are simple sums of
  // already-returned raw fields — never a payout/rate calculation — so
  // computing them client-side doesn't touch the "never recompute a payout"
  // rule (FRONTEND_BRIEF.md §5.5); only the seven ISC formulas themselves
  // are off-limits there.
  const monthlyDeposit = useCallback(
    (r) => Number(r.crj_by_month?.[viewMonth] || 0) + Number(r.cdj_by_month?.[viewMonth] || 0),
    [viewMonth]
  );

  // Rule 2's annual "Member Total" — the sum of the member's 12 monthly
  // balances, which rule 3 then divides by 12 to GET Average Share Capital.
  // The RPC never returns that sum on its own (only the already-divided
  // average), so it's reconstructed here as average × 12 — the exact
  // inverse of rule 3, not a new calculation. This is deliberately NOT the
  // same field as the RPC's own `total_share_capital` (that one is the
  // member's closing/last-month balance, a different figure entirely).
  const combinedTotal = useCallback((r) => Number(r.average_share_capital || 0) * 12, []);

  const runCalculation = async (pool) => {
    setStatus("loading");
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("isc_calculate_preview", {
        p_period_start: PERIOD_START,
        p_period_end: PERIOD_END,
        p_allocated_pool: pool,
      });
      if (rpcError) throw new Error(rpcError.message || "Failed to calculate Interest on Share Capital.");
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      // Cooperative-wide and identical on every row regardless of the pool
      // passed in — captured once so a typed rate can be converted to its
      // equivalent pool without waiting on another round trip.
      if (list[0]?.total_average) setTotalAverage(Number(list[0].total_average));
      setStatus("ready");
    } catch (err) {
      setError(err?.message || "Unable to calculate Interest on Share Capital.");
      setRows([]);
      setStatus("error");
    }
  };

  // Opens already showing the basis (allocated pool = null) — the
  // bookkeeper's first question is usually "what's our total average?"
  // before the General Assembly has even set a figure (§5.3).
  useEffect(() => {
    runCalculation(null);
  }, []);

  const rateNum = Number(rateInput);
  const rateValid = rateInput !== "" && Number.isFinite(rateNum) && rateNum > 0 && rateNum <= 100;
  const impliedPool = rateValid && totalAverage ? (rateNum / 100) * totalAverage : null;

  // Debounced preview: recompute isc_calculate_preview with the pool implied
  // by the typed rate, so the ISC Rate / ISC Payout columns already show
  // exactly what would be posted — the real RPC computes it, this only picks
  // which pool to hand it.
  useEffect(() => {
    if (!rateValid || !totalAverage) return undefined;
    const pool = (rateNum / 100) * totalAverage;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runCalculation(pool);
    }, 500);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateInput, totalAverage]);

  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return rows;
    return rows.filter(
      (r) =>
        String(r.member_name || "").toLowerCase().includes(key) ||
        String(r.membership_id || "").toLowerCase().includes(key)
    );
  }, [search, rows]);

  // Sorted over the FULL filtered set, then paginated — never the other way
  // around, or sorting would only reorder the ten rows already on screen
  // (§5.1's "paginate the render, not the maths" applies here too).
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    const valueOf = (r) => {
      switch (sortKey) {
        case "name":
          return (r.member_name || "").toLowerCase();
        case "opening":
          return Number(r.opening_balance || 0);
        case "balance":
          return Number(r.month_end_balances?.[viewMonth] || 0);
        case "deposit":
          return monthlyDeposit(r);
        case "combined":
          return combinedTotal(r);
        case "average":
          return Number(r.average_share_capital || 0);
        case "rate":
          return Number(r.rate || 0);
        case "payout":
          return Number(r.interest_amount || 0);
        default:
          return 0;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir, viewMonth, monthlyDeposit, combinedTotal]);

  useEffect(() => setPage(1), [search, rows, sortKey, sortDir, viewMonth]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, page]);

  // Table footer totals — every ELIGIBLE member, not the filtered/paginated
  // subset (§5.1: totals must cover every member, never just the visible
  // page). Average Share Capital's total is rule 4's "Total Average" — the
  // sum of every member's own average, which the RPC already returns as
  // `total_average` (identical on every row); summing average_share_capital
  // client-side reproduces the same number rather than recomputing it a
  // different way.
  const totals = useMemo(() => {
    return {
      opening: rows.reduce((sum, r) => sum + Number(r.opening_balance || 0), 0),
      balance: rows.reduce((sum, r) => sum + Number(r.month_end_balances?.[viewMonth] || 0), 0),
      deposit: rows.reduce((sum, r) => sum + monthlyDeposit(r), 0),
      combined: rows.reduce((sum, r) => sum + combinedTotal(r), 0),
      average: rows.reduce((sum, r) => sum + Number(r.average_share_capital || 0), 0),
      payout: rows.reduce((sum, r) => sum + Number(r.interest_amount || 0), 0),
    };
  }, [rows, viewMonth, monthlyDeposit, combinedTotal]);

  // Every row, never just the current page or the search filter (§5.1). A
  // real formatted workbook rather than plain CSV — bold banded header,
  // currency number formats, zebra rows, frozen header — so it already
  // looks like a finished report the moment it opens in Excel.
  const exportExcel = async () => {
    // Lazy-loaded — ExcelJS is ~1MB and only needed on this one button
    // press, not on every page load across the whole app.
    const { default: ExcelJS } = await import("exceljs");
    const monthLabel = MONTH_LABELS[viewMonth];
    const columnHeaders = [
      "Membership ID",
      "Member Name",
      "Share Capital",
      `${monthLabel} Balance`,
      `Total Deposit (${monthLabel})`,
      "Total Share Capital",
      "Average Share Capital",
      "Rate (%)",
      "ISC Payout",
    ];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "REGANT";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("ISC Distribution", {
      views: [{ state: "frozen", ySplit: 4 }],
    });
    sheet.columns = [16, 26, 16, 16, 18, 18, 18, 10, 16].map((width) => ({ width }));
    const lastCol = colLetter(columnHeaders.length);

    sheet.mergeCells(`A1:${lastCol}1`);
    const title = sheet.getCell("A1");
    title.value = `Interest on Share Capital — ${monthLabel} Balance View`;
    title.font = { size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_GREEN } };
    title.alignment = { vertical: "middle", indent: 1 };
    sheet.getRow(1).height = 26;

    sheet.mergeCells(`A2:${lastCol}2`);
    const subtitle = sheet.getCell("A2");
    subtitle.value = `Period: January – December ${YEAR}  ·  Generated ${new Date().toLocaleString("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    })}`;
    subtitle.font = { size: 10, italic: true, color: { argb: "FF6B7280" } };
    subtitle.alignment = { indent: 1 };

    const headerRow = sheet.getRow(4);
    headerRow.values = columnHeaders;
    headerRow.height = 20;
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_GREEN } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    rows.forEach((r, idx) => {
      const row = sheet.getRow(5 + idx);
      row.values = [
        r.membership_id,
        r.member_name,
        Number(r.opening_balance || 0),
        Number(r.month_end_balances?.[viewMonth] || 0),
        monthlyDeposit(r),
        combinedTotal(r),
        Number(r.average_share_capital || 0),
        r.rate === null || r.rate === undefined ? null : Number(r.rate),
        r.interest_amount === null || r.interest_amount === undefined ? null : Number(r.interest_amount),
      ];
      [3, 4, 5, 6, 7].forEach((col) => {
        row.getCell(col).numFmt = PESO_FORMAT;
      });
      row.getCell(8).numFmt = '0.00"%"';
      row.getCell(9).numFmt = PESO_FORMAT;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber >= 3 && colNumber <= 9) cell.alignment = { horizontal: "right" };
        cell.border = { bottom: { style: "thin", color: { argb: BORDER_SOFT } } };
        if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
      });
    });

    const totalsRow = sheet.getRow(5 + rows.length);
    totalsRow.values = [
      "",
      `Total (${rows.length} members)`,
      rows.reduce((sum, r) => sum + Number(r.opening_balance || 0), 0),
      rows.reduce((sum, r) => sum + Number(r.month_end_balances?.[viewMonth] || 0), 0),
      rows.reduce((sum, r) => sum + monthlyDeposit(r), 0),
      rows.reduce((sum, r) => sum + combinedTotal(r), 0),
      rows.reduce((sum, r) => sum + Number(r.average_share_capital || 0), 0),
      "",
      rows.reduce((sum, r) => sum + Number(r.interest_amount || 0), 0),
    ];
    totalsRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { bold: true };
      cell.border = { top: { style: "medium", color: { argb: "FF9CA3AF" } } };
      if ([3, 4, 5, 6, 7, 9].includes(colNumber)) {
        cell.numFmt = PESO_FORMAT;
        cell.alignment = { horizontal: "right" };
      }
    });

    await downloadWorkbook(workbook, `isc_distribution_${monthLabel.replace(" ", "_")}.xlsx`);
  };

  // Real posting. isc_post only accepts a pool (§22.8 dropped the rate-based
  // overload entirely), so the typed rate travels as impliedPool — the same
  // figure already driving the live preview above, so what gets posted is
  // exactly what was reviewed on screen (isc_post itself re-runs
  // isc_calculate_preview server-side with this same pool before writing
  // anything, so the two can never disagree).
  const handlePost = async () => {
    if (!rateValid || !impliedPool) return;
    setPosting(true);
    setPostError("");
    try {
      const { error: rpcError } = await supabase.rpc("isc_post", {
        p_period_start: PERIOD_START,
        p_period_end: PERIOD_END,
        p_allocated_pool: impliedPool,
      });
      if (rpcError) throw new Error(rpcError.message || "Failed to post Interest on Share Capital.");
      setShowConfirm(false);
      setPostedAt(new Date());
      addNotification(
        `Interest on Share Capital posted at ${rateNum}% for ${YEAR} — ${rows.length} members.`,
        "success"
      );
    } catch (err) {
      setPostError(err?.message || "Unable to post Interest on Share Capital.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

      <div className="flex-1 flex flex-col h-screen overflow-y-auto min-w-0">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        <main className="p-8 min-w-0">
          <Breadcrumb portal="Bookkeeper" page="ISC Distribution" />

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Interest on Share Capital</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Members earn interest in proportion to their average share capital over the period. Period:{" "}
              <span className="font-semibold text-gray-700">January – December {YEAR}</span> (fixed, not editable).
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                  ISC Rate
                </label>
                <div
                  className={`flex items-stretch h-11 rounded-lg border bg-gray-50 focus-within:bg-white transition-colors overflow-hidden w-40 ${
                    rateInput !== "" && !rateValid
                      ? "border-red-300 focus-within:ring-2 focus-within:ring-red-400/50"
                      : "border-gray-300 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary"
                  }`}
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    placeholder="e.g. 5.00"
                    className="min-w-0 flex-1 bg-transparent px-3 text-sm focus:outline-none"
                  />
                  <span className="flex items-center px-3 text-sm font-semibold text-gray-500 bg-gray-100 border-l border-gray-200 shrink-0">
                    %
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={!rateValid || !totalAverage || status === "loading"}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-primary hover:bg-primary-deep text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="w-4 h-4" /> Post ISC
              </button>
              <p className="text-xs text-gray-400 max-w-sm">
                Enter the rate the General Assembly approved. The table below updates to preview it as you type — nothing is posted until you confirm.
              </p>
            </div>

            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                Posting creates a permanent record for {YEAR} — it cannot be edited afterward, only deleted while
                every member is still unsettled.
              </p>
            </div>

            {postedAt && (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                <p className="text-xs text-green-700">
                  Posted at {rateNum}% on {postedAt.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}.
                </p>
              </div>
            )}
          </div>

          {status === "error" && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Member Breakdown</h3>
                <p className="text-xs text-gray-500 mt-0.5">Every figure below comes from the ledger — nothing here is editable.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative shrink-0">
                  <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                  <select
                    value={viewMonth}
                    onChange={(e) => setViewMonth(Number(e.target.value))}
                    aria-label="Month to display"
                    className="h-9 rounded-lg border border-gray-300 bg-gray-50 hover:bg-white focus:bg-white pl-8 pr-3 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors appearance-none cursor-pointer"
                  >
                    {MONTH_LABELS.map((label, i) => (
                      <option key={label} value={i}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="relative w-64 shrink-0">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or membership ID..."
                    className="w-full h-9 bg-gray-50 focus:bg-white border border-gray-300 rounded-lg pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/bookkeeper-isc-journal?month=${viewMonth}`)}
                  disabled={!rows.length}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Table2 className="w-3.5 h-3.5" /> Full View
                </button>
                <button
                  type="button"
                  onClick={exportExcel}
                  disabled={!rows.length}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" /> Export Excel
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-4 font-bold text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("name")}
                        className="inline-flex items-center gap-1 hover:text-white/80 transition-colors"
                      >
                        Member {renderSortIcon("name")}
                      </button>
                    </th>
                    <th className="p-4 font-bold text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("opening")}
                        className="inline-flex items-center gap-1 w-full justify-end hover:text-white/80 transition-colors"
                      >
                       Share Capital {renderSortIcon("opening")}
                      </button>
                    </th>
                    <th className="p-4 font-bold text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("balance")}
                        className="inline-flex items-center gap-1 w-full justify-end hover:text-white/80 transition-colors"
                      >
                        {MONTH_LABELS[viewMonth]} Balance {renderSortIcon("balance")}
                      </button>
                    </th>
                    <th className="p-4 font-bold text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("deposit")}
                        className="inline-flex items-center gap-1 w-full justify-end hover:text-white/80 transition-colors"
                      >
                        Total Deposit ({MONTH_LABELS[viewMonth]}) {renderSortIcon("deposit")}
                      </button>
                    </th>
                    <th className="p-4 font-bold text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("combined")}
                        className="inline-flex items-center gap-1 w-full justify-end hover:text-white/80 transition-colors"
                      >
                        Total Share Capital {renderSortIcon("combined")}
                      </button>
                    </th>
                    <th className="p-4 font-bold text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("average")}
                        className="inline-flex items-center gap-1 w-full justify-end hover:text-white/80 transition-colors"
                      >
                        Average Share Capital {renderSortIcon("average")}
                      </button>
                    </th>
                    <th className="p-4 font-bold text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("rate")}
                        className="inline-flex items-center gap-1 w-full justify-end hover:text-white/80 transition-colors"
                      >
                        ISC Rate {renderSortIcon("rate")}
                      </button>
                    </th>
                    <th className="p-4 font-bold text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("payout")}
                        className="inline-flex items-center gap-1 w-full justify-end hover:text-white/80 transition-colors"
                      >
                        ISC Payout {renderSortIcon("payout")}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {status === "loading" ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                          <p className="text-xs text-gray-500">Calculating Interest on Share Capital...</p>
                        </div>
                      </td>
                    </tr>
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                            <Users className="w-5 h-5 text-gray-400" />
                          </div>
                          <p className="text-sm font-semibold text-gray-700">
                            {rows.length === 0 ? "No eligible members found for this period." : "No members matched your search."}
                          </p>
                          <p className="text-xs text-gray-400">
                            {rows.length === 0 ? "Try Calculate again once CBU data is available." : "Try a different name or membership ID."}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginated.map((row) => (
                      <tr key={row.member_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-4 text-sm">
                          <p className="text-gray-900 font-medium">{row.member_name}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{row.membership_id}</p>
                        </td>
                        <td className="p-4 text-sm text-right text-gray-700 tabular-nums">
                          {formatCurrency(row.opening_balance)}
                        </td>
                        <td className="p-4 text-sm text-right text-gray-700 tabular-nums">
                          {formatCurrency(row.month_end_balances?.[viewMonth])}
                        </td>
                        <td className="p-4 text-sm text-right text-gray-700 tabular-nums">
                          {formatCurrency(monthlyDeposit(row))}
                        </td>
                        <td className="p-4 text-sm text-right text-gray-700 tabular-nums">
                          {formatCurrency(combinedTotal(row))}
                        </td>
                        <td className="p-4 text-sm text-right text-gray-700 tabular-nums">
                          {formatCurrency(row.average_share_capital)}
                        </td>
                        <td className="p-4 text-sm text-right text-gray-700 tabular-nums">
                          {row.rate === null || row.rate === undefined ? "—" : `${Number(row.rate).toFixed(2)}%`}
                        </td>
                        <td className="p-4 text-sm text-right font-semibold text-gray-900 tabular-nums">
                          <span className="inline-flex items-center gap-1.5">
                            {formatCurrency(row.interest_amount)}
                            {row.adjusted && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                                title="Includes a residual centavo adjustment so the batch reconciles exactly to the allocated amount."
                              />
                            )}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {paginated.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                      <td className="p-4 text-gray-900">Total ({rows.length} members)</td>
                      <td className="p-4 text-right text-gray-900 tabular-nums">{formatCurrency(totals.opening)}</td>
                      <td className="p-4 text-right text-gray-900 tabular-nums">{formatCurrency(totals.balance)}</td>
                      <td className="p-4 text-right text-gray-900 tabular-nums">{formatCurrency(totals.deposit)}</td>
                      <td className="p-4 text-right text-gray-900 tabular-nums">{formatCurrency(totals.combined)}</td>
                      <td className="p-4 text-right text-gray-900 tabular-nums">{formatCurrency(totals.average)}</td>
                      <td className="p-4 text-right text-gray-500">—</td>
                      <td className="p-4 text-right text-gray-900 tabular-nums">{formatCurrency(totals.payout)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {filtered.length > 0 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
          </div>
        </main>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="Post Interest on Share Capital"
        tone="warning"
        confirmLabel="Confirm & Post"
        loading={posting}
        errorMessage={postError}
        onConfirm={handlePost}
        onCancel={() => setShowConfirm(false)}
      >
        <div className="text-sm text-gray-700 space-y-3">
          <p>
            You are about to post Interest on Share Capital for <strong>January – December {YEAR}</strong> at{" "}
            <strong>{rateNum}%</strong>.
          </p>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Eligible Members</span>
              <span className="font-semibold">{rows.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Implied Allocated Pool</span>
              <span className="font-semibold">{formatCurrency(impliedPool)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total ISC Payout</span>
              <span className="font-semibold">{formatCurrency(totals.payout)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            This records a payable for every eligible member — it does not automatically credit anyone's share
            capital. A member's payout only becomes share capital if they elect to capitalise it at the March
            General Assembly. This cannot be edited once posted, and can only be deleted while every member is
            still unsettled.
          </p>
          {session?.user?.email && <p className="text-[11px] text-gray-400">Posting as {session.user.email}</p>}
        </div>
      </ConfirmDialog>
    </div>
  );
};

export default Bookkeeper_ISC;
