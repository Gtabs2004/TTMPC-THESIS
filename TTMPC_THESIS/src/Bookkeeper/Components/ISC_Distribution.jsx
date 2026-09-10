import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Download,
  Users,
  Loader2,
  Table2,
  X,
  Calendar,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import Pagination from "../../components/Pagination";
import { supabase } from "../../supabaseClient";

const PAGE_SIZE = 10;

// Export styling — mirrors the app's own palette (DESIGN.md: Cooperative
// Green — Deep for real text/fills, the soft border tone for zebra rows) so
// the spreadsheet reads as the same product, not a generic data dump.
const BRAND_GREEN = "FF2E7A2A";
const BAND_FILL = "FFF3F4F6";
const BORDER_SOFT = "FFE5E7EB";
const PESO_FORMAT = '"₱"#,##0.00';

// Excel column letter for a 1-indexed column number (1 -> A, 27 -> AA, ...).
const colLetter = (n) => {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const downloadWorkbook = async (workbook, filename) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

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
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showFullView, setShowFullView] = useState(false);

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
      setRows(Array.isArray(data) ? data : []);
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
  }, [filtered, sortKey, sortDir, viewMonth]);

  useEffect(() => setPage(1), [search, rows, sortKey, sortDir, viewMonth]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, page]);

  // Journal footer totals — every eligible member, never just the page
  // rendered in the modal (§5.1).
  const journalTotals = useMemo(() => {
    const opening = rows.reduce((sum, r) => sum + Number(r.opening_balance || 0), 0);
    const perMonth = MONTH_LABELS.map((_, i) => ({
      crj: rows.reduce((sum, r) => sum + Number(r.crj_by_month?.[i] || 0), 0),
      cdj: rows.reduce((sum, r) => sum + Number(r.cdj_by_month?.[i] || 0), 0),
      balance: rows.reduce((sum, r) => sum + Number(r.month_end_balances?.[i] || 0), 0),
    }));
    return { opening, perMonth };
  }, [rows]);

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
      "Opening Balance",
      `${monthLabel} Balance`,
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
    sheet.columns = [16, 26, 16, 16, 18, 10, 16].map((width) => ({ width }));
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
        Number(r.average_share_capital || 0),
        r.rate === null || r.rate === undefined ? null : Number(r.rate),
        r.interest_amount === null || r.interest_amount === undefined ? null : Number(r.interest_amount),
      ];
      row.getCell(3).numFmt = PESO_FORMAT;
      row.getCell(4).numFmt = PESO_FORMAT;
      row.getCell(5).numFmt = PESO_FORMAT;
      row.getCell(6).numFmt = '0.00"%"';
      row.getCell(7).numFmt = PESO_FORMAT;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber >= 3 && colNumber <= 7) cell.alignment = { horizontal: "right" };
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
      rows.reduce((sum, r) => sum + Number(r.average_share_capital || 0), 0),
      "",
      rows.reduce((sum, r) => sum + Number(r.interest_amount || 0), 0),
    ];
    totalsRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { bold: true };
      cell.border = { top: { style: "medium", color: { argb: "FF9CA3AF" } } };
      if ([3, 4, 5, 7].includes(colNumber)) {
        cell.numFmt = PESO_FORMAT;
        cell.alignment = { horizontal: "right" };
      }
    });

    await downloadWorkbook(workbook, `isc_distribution_${monthLabel.replace(" ", "_")}.xlsx`);
  };

  // Full month-by-month journal — every row, every month, never just the
  // page on screen (§5.1). Same merged month-group header the on-screen grid
  // uses, ported to real merged Excel cells rather than a flat CSV row.
  const exportJournalExcel = async () => {
    const { default: ExcelJS } = await import("exceljs");
    const totalCols = 3 + MONTH_LABELS.length * 3;
    const lastCol = colLetter(totalCols);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "REGANT";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("ISC Journal", {
      views: [{ state: "frozen", xSplit: 2, ySplit: 5 }],
    });

    sheet.getColumn(1).width = 16;
    sheet.getColumn(2).width = 26;
    sheet.getColumn(3).width = 14;
    MONTH_LABELS.forEach((_, i) => {
      sheet.getColumn(4 + i * 3).width = 12;
      sheet.getColumn(5 + i * 3).width = 12;
      sheet.getColumn(6 + i * 3).width = 13;
    });

    sheet.mergeCells(`A1:${lastCol}1`);
    const title = sheet.getCell("A1");
    title.value = `Expanded 12-Month Share Capital Journal — ${YEAR}`;
    title.font = { size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_GREEN } };
    title.alignment = { vertical: "middle", indent: 1 };
    sheet.getRow(1).height = 26;

    sheet.mergeCells(`A2:${lastCol}2`);
    const subtitle = sheet.getCell("A2");
    subtitle.value = `Read-only, sourced from the cashier and loan ledgers  ·  Generated ${new Date().toLocaleString(
      "en-PH",
      { dateStyle: "medium", timeStyle: "short" }
    )}`;
    subtitle.font = { size: 10, italic: true, color: { argb: "FF6B7280" } };
    subtitle.alignment = { indent: 1 };

    sheet.mergeCells("A4:A5");
    sheet.getCell("A4").value = "Membership ID";
    sheet.mergeCells("B4:B5");
    sheet.getCell("B4").value = "Member Name";
    sheet.mergeCells("C4:C5");
    sheet.getCell("C4").value = "Opening Balance";

    MONTH_LABELS.forEach((label, i) => {
      const start = 4 + i * 3;
      const startLetter = colLetter(start);
      sheet.mergeCells(`${startLetter}4:${colLetter(start + 2)}4`);
      sheet.getCell(`${startLetter}4`).value = label;
      sheet.getCell(`${startLetter}5`).value = "CRJ";
      sheet.getCell(`${colLetter(start + 1)}5`).value = "CDJ";
      sheet.getCell(`${colLetter(start + 2)}5`).value = "Bal";
    });

    [4, 5].forEach((rowNum) => {
      sheet.getRow(rowNum).eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_GREEN } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
    });
    sheet.getRow(4).height = 18;
    sheet.getRow(5).height = 16;

    rows.forEach((r, idx) => {
      const row = sheet.getRow(6 + idx);
      const values = [r.membership_id, r.member_name, Number(r.opening_balance || 0)];
      MONTH_LABELS.forEach((_, i) => {
        values.push(
          Number(r.crj_by_month?.[i] || 0),
          Number(r.cdj_by_month?.[i] || 0),
          Number(r.month_end_balances?.[i] || 0)
        );
      });
      row.values = values;
      for (let col = 3; col <= totalCols; col++) row.getCell(col).numFmt = PESO_FORMAT;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber >= 3) cell.alignment = { horizontal: "right" };
        cell.border = { bottom: { style: "thin", color: { argb: BORDER_SOFT } } };
        if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
      });
    });

    const totalsRow = sheet.getRow(6 + rows.length);
    const totalValues = [
      "",
      `Total (${rows.length} accounts)`,
      rows.reduce((sum, r) => sum + Number(r.opening_balance || 0), 0),
    ];
    MONTH_LABELS.forEach((_, i) => {
      totalValues.push(
        rows.reduce((sum, r) => sum + Number(r.crj_by_month?.[i] || 0), 0),
        rows.reduce((sum, r) => sum + Number(r.cdj_by_month?.[i] || 0), 0),
        rows.reduce((sum, r) => sum + Number(r.month_end_balances?.[i] || 0), 0)
      );
    });
    totalsRow.values = totalValues;
    totalsRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { bold: true };
      cell.border = { top: { style: "medium", color: { argb: "FF9CA3AF" } } };
      if (colNumber >= 3) {
        cell.numFmt = PESO_FORMAT;
        cell.alignment = { horizontal: "right" };
      }
    });

    await downloadWorkbook(workbook, `isc_journal_${YEAR}.xlsx`);
  };

  // Opening the full journal scrolls straight to the selected month (the
  // current month by default) instead of dropping the bookkeeper on January.
  const monthHeaderRefs = useRef([]);
  useEffect(() => {
    if (!showFullView) return;
    requestAnimationFrame(() => {
      monthHeaderRefs.current[viewMonth]?.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
    });
  }, [showFullView, viewMonth]);

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
              <div className="flex items-center gap-2">
                <div className="relative">
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
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or membership ID..."
                    className="w-full bg-gray-50 focus:bg-white border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowFullView(true)}
                  disabled={!rows.length}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 px-3.5 py-2 text-xs font-semibold text-gray-700 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Table2 className="w-3.5 h-3.5" /> Full View
                </button>
                <button
                  type="button"
                  onClick={exportExcel}
                  disabled={!rows.length}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 px-3.5 py-2 text-xs font-semibold text-gray-700 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        Opening Balance {renderSortIcon("opening")}
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
                      <td colSpan={6} className="p-10 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                          <p className="text-xs text-gray-500">Calculating Interest on Share Capital...</p>
                        </div>
                      </td>
                    </tr>
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-10 text-center">
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
              </table>
            </div>

            {filtered.length > 0 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
          </div>
        </main>
      </div>

      {/* Full View — the expanded month-by-month CRJ/CDJ/Balance journal.
          Opt-in and separate from the default Member Breakdown table: the
          brief flags the full 12-month grid as more honest as an on-demand
          drill-down than the default view while most 2026 months are still
          data-entry gaps (FRONTEND_BRIEF.md §7, §9). Read-only — the CRJ and
          CDJ are source books; if a figure looks wrong the fix is in the
          cashier or loan record that produced it, not here (§3.2). No Post
          button, no FY picker, and CDJ is correctly labelled as ADDING to
          share capital — see the three things FRONTEND_BRIEF.md §6 flags as
          out of date in the old design reference. */}
      {showFullView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4"
          onClick={() => setShowFullView(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-[96vw] max-h-[92vh] flex flex-col border border-transparent"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-6 py-5 bg-gray-50 border-b border-gray-100 rounded-t-2xl shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <Table2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-gray-900">Expanded 12-Month Share Capital Journal</h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-500 ring-1 ring-gray-200">
                      Preview Only
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    January – December {YEAR} · every figure is read-only, sourced from the cashier and loan
                    ledgers.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={exportJournalExcel}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 px-3.5 py-2 text-xs font-semibold text-gray-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Export Excel
                </button>
                <button
                  onClick={() => setShowFullView(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-auto flex-1">
              <table className="border-collapse text-sm">
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      className="sticky left-0 top-0 z-30 bg-green-700 text-white text-[10px] uppercase tracking-wider font-extrabold p-3 text-left align-bottom min-w-[200px]"
                    >
                      Member
                    </th>
                    <th
                      rowSpan={2}
                      className="sticky top-0 z-20 bg-green-700 text-white text-[10px] uppercase tracking-wider font-extrabold p-3 text-right align-bottom min-w-[130px]"
                    >
                      Opening Balance
                    </th>
                    {MONTH_LABELS.map((label, i) => (
                      <th
                        key={label}
                        ref={(el) => (monthHeaderRefs.current[i] = el)}
                        colSpan={3}
                        className={`sticky top-0 z-20 text-white text-[10px] uppercase tracking-wider font-extrabold p-2 text-center border-l border-green-600 ${
                          i === viewMonth ? "bg-emerald-600 ring-2 ring-inset ring-amber-300" : "bg-green-800"
                        }`}
                      >
                        {label}
                        {i === viewMonth && <span className="block text-[8px] font-bold tracking-wide text-amber-200">SELECTED</span>}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {MONTH_LABELS.map((label, i) => (
                      <React.Fragment key={`${label}-sub`}>
                        <th
                          className={`sticky top-[37px] z-20 text-white text-[9px] uppercase tracking-wider font-bold p-2 text-right border-l border-green-600 min-w-[90px] ${
                            i === viewMonth ? "bg-emerald-600" : "bg-green-700"
                          }`}
                        >
                          CRJ
                        </th>
                        <th
                          className={`sticky top-[37px] z-20 text-white text-[9px] uppercase tracking-wider font-bold p-2 text-right min-w-[90px] ${
                            i === viewMonth ? "bg-emerald-600" : "bg-green-700"
                          }`}
                        >
                          CDJ
                        </th>
                        <th
                          className={`sticky top-[37px] z-20 text-white text-[9px] uppercase tracking-wider font-bold p-2 text-right min-w-[100px] ${
                            i === viewMonth ? "bg-emerald-600" : "bg-green-700"
                          }`}
                        >
                          Bal
                        </th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {status === "loading" ? (
                    <tr>
                      <td colSpan={2 + MONTH_LABELS.length * 3} className="p-10 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                          <p className="text-xs text-gray-500">Loading the journal...</p>
                        </div>
                      </td>
                    </tr>
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={2 + MONTH_LABELS.length * 3} className="p-10 text-center text-sm text-gray-500">
                        No eligible members found for this period.
                      </td>
                    </tr>
                  ) : (
                    paginated.map((row) => (
                      <tr key={row.member_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="sticky left-0 z-10 bg-white p-3 min-w-[200px]">
                          <p className="text-gray-900 font-medium">{row.member_name}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{row.membership_id}</p>
                        </td>
                        <td className="p-3 text-right text-gray-700 tabular-nums min-w-[130px]">
                          {formatCurrency(row.opening_balance)}
                        </td>
                        {MONTH_LABELS.map((label, i) => (
                          <React.Fragment key={`${row.member_id}-${label}`}>
                            <td
                              className={`p-2 text-right text-emerald-700 tabular-nums border-l border-gray-100 min-w-[90px] ${
                                i === viewMonth ? "bg-amber-50" : ""
                              }`}
                            >
                              {Number(row.crj_by_month?.[i] || 0) > 0 ? formatCurrency(row.crj_by_month[i]) : "–"}
                            </td>
                            <td className={`p-2 text-right text-sky-700 tabular-nums min-w-[90px] ${i === viewMonth ? "bg-amber-50" : ""}`}>
                              {Number(row.cdj_by_month?.[i] || 0) > 0 ? formatCurrency(row.cdj_by_month[i]) : "–"}
                            </td>
                            <td
                              className={`p-2 text-right font-semibold text-gray-900 tabular-nums min-w-[100px] ${
                                i === viewMonth ? "bg-amber-50" : ""
                              }`}
                            >
                              {formatCurrency(row.month_end_balances?.[i])}
                            </td>
                          </React.Fragment>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
                {paginated.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                      <td className="sticky left-0 z-10 bg-gray-100 p-3 text-gray-900 min-w-[200px]">
                        Total Cooperative ({rows.length} accounts)
                      </td>
                      <td className="p-3 text-right text-gray-900 tabular-nums min-w-[130px]">
                        {formatCurrency(journalTotals.opening)}
                      </td>
                      {journalTotals.perMonth.map((m, i) => (
                        <React.Fragment key={`total-${MONTH_LABELS[i]}`}>
                          <td className="p-2 text-right text-emerald-800 tabular-nums border-l border-gray-200 min-w-[90px]">
                            {m.crj > 0 ? formatCurrency(m.crj) : "–"}
                          </td>
                          <td className="p-2 text-right text-sky-800 tabular-nums min-w-[90px]">
                            {m.cdj > 0 ? formatCurrency(m.cdj) : "–"}
                          </td>
                          <td className="p-2 text-right text-gray-900 tabular-nums min-w-[100px]">
                            {formatCurrency(m.balance)}
                          </td>
                        </React.Fragment>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 rounded-b-2xl flex items-center justify-between gap-3 flex-wrap shrink-0">
              <div className="flex items-center gap-4 flex-wrap text-[11px] text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <strong className="text-gray-700">CRJ:</strong> paid in at the cashier's CBU counter
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-600" />
                  <strong className="text-gray-700">CDJ:</strong> 2% loan retention — automatically{" "}
                  <strong>added</strong> to share capital on disbursement
                </span>
              </div>
              {filtered.length > 0 && (
                <Pagination page={page} totalPages={totalPages} onChange={setPage} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bookkeeper_ISC;
