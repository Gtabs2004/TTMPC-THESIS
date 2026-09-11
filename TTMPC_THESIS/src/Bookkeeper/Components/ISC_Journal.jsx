import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, Download, Search, Loader2, Users, Calendar } from "lucide-react";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import Pagination from "../../components/Pagination";
import { supabase } from "../../supabaseClient";
import { BRAND_GREEN, BAND_FILL, BORDER_SOFT, PESO_FORMAT, colLetter, downloadWorkbook } from "../../utils/excelExport";

/**
 * Expanded 12-Month Share Capital Journal — a dedicated page rather than a
 * modal on ISC_Distribution.jsx. The confirmed grid (FRONTEND_BRIEF.md §13.1
 * spirit, applied here for the summary journal rather than the full 12-month
 * grid it originally described) needs real horizontal room for 36 month
 * columns; a modal capped at max-w-[96vw] was still fighting for space. This
 * is a drill-down page (no sidebar nav entry of its own, same pattern as
 * MIGS-Details.jsx) reached only via the "Full View" button on the main ISC
 * Distribution page.
 *
 * Read-only — the CRJ and CDJ are source books; if a figure looks wrong the
 * fix is in the cashier or loan record that produced it, not here (§3.2). No
 * Post button, no FY picker, and CDJ is correctly labelled as ADDING to
 * share capital — see the three things FRONTEND_BRIEF.md §6 flags as out of
 * date in the old design reference.
 */

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

const clampMonth = (n) => (Number.isInteger(n) && n >= 0 && n <= 11 ? n : new Date().getMonth());

const ISC_Journal = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // The selected month travels via the URL (?month=) so the link from ISC
  // Distribution's Month selector lands here already scrolled to the same
  // month, and the page stays bookmarkable/shareable/refresh-safe.
  const [viewMonth, setViewMonth] = useState(() => clampMonth(Number(searchParams.get("month"))));

  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      setStatus("loading");
      setError("");
      try {
        const { data, error: rpcError } = await supabase.rpc("isc_calculate_preview", {
          p_period_start: PERIOD_START,
          p_period_end: PERIOD_END,
          p_allocated_pool: null,
        });
        if (rpcError) throw new Error(rpcError.message || "Failed to load the journal.");
        setRows(Array.isArray(data) ? data : []);
        setStatus("ready");
      } catch (err) {
        setError(err?.message || "Unable to load the journal.");
        setRows([]);
        setStatus("error");
      }
    })();
  }, []);

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("month", String(viewMonth));
      return next;
    }, { replace: true });
  }, [viewMonth, setSearchParams]);

  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return rows;
    return rows.filter(
      (r) =>
        String(r.member_name || "").toLowerCase().includes(key) ||
        String(r.membership_id || "").toLowerCase().includes(key)
    );
  }, [search, rows]);

  useEffect(() => setPage(1), [search, rows]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // Every eligible member, never just the page rendered (§5.1).
  const journalTotals = useMemo(() => {
    const opening = rows.reduce((sum, r) => sum + Number(r.opening_balance || 0), 0);
    const perMonth = MONTH_LABELS.map((_, i) => ({
      crj: rows.reduce((sum, r) => sum + Number(r.crj_by_month?.[i] || 0), 0),
      cdj: rows.reduce((sum, r) => sum + Number(r.cdj_by_month?.[i] || 0), 0),
      balance: rows.reduce((sum, r) => sum + Number(r.month_end_balances?.[i] || 0), 0),
    }));
    return { opening, perMonth };
  }, [rows]);

  // Landing on the page scrolls straight to the selected month instead of
  // dropping the bookkeeper on January.
  const monthHeaderRefs = useRef([]);
  useEffect(() => {
    requestAnimationFrame(() => {
      monthHeaderRefs.current[viewMonth]?.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
    });
  }, [viewMonth, status]);

  // Full month-by-month journal — every row, every month, never just the
  // page on screen (§5.1). Merged Excel cells mirror the on-screen
  // month-group header rather than a flat spreadsheet row.
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

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

      <div className="flex-1 flex flex-col h-screen overflow-y-auto min-w-0">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        <main className="p-8 min-w-0">
          <Breadcrumb portal="Bookkeeper" page="ISC Journal" />

          <button
            type="button"
            onClick={() => navigate("/bookkeeper-isc")}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3"
          >
            <ChevronLeft className="w-4 h-4" /> Back to ISC Distribution
          </button>

          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">Expanded 12-Month Share Capital Journal</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-500 ring-1 ring-gray-200">
                  Preview Only
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                January – December {YEAR} · every figure is read-only, sourced from the cashier and loan ledgers.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative shrink-0">
                <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                <select
                  value={viewMonth}
                  onChange={(e) => setViewMonth(clampMonth(Number(e.target.value)))}
                  aria-label="Month to highlight"
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
                onClick={exportJournalExcel}
                disabled={!rows.length}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" /> Export Excel
              </button>
            </div>
          </div>

          {status === "error" && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
              <table className="border-collapse text-[15px]">
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      className="sticky left-0 top-0 z-30 bg-green-700 text-white text-[10px] uppercase tracking-wider font-extrabold p-3 text-left align-bottom min-w-[220px]"
                    >
                      Member
                    </th>
                    <th
                      rowSpan={2}
                      className="sticky top-0 z-20 bg-green-700 text-white text-[10px] uppercase tracking-wider font-extrabold p-3 text-right align-bottom min-w-[140px]"
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
                        {i === viewMonth && (
                          <span className="block text-[8px] font-bold tracking-wide text-amber-200">SELECTED</span>
                        )}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {MONTH_LABELS.map((label, i) => (
                      <React.Fragment key={`${label}-sub`}>
                        <th
                          className={`sticky top-[37px] z-20 text-white text-[9px] uppercase tracking-wider font-bold p-2 text-right border-l border-green-600 min-w-[100px] ${
                            i === viewMonth ? "bg-emerald-600" : "bg-green-700"
                          }`}
                        >
                          CRJ
                        </th>
                        <th
                          className={`sticky top-[37px] z-20 text-white text-[9px] uppercase tracking-wider font-bold p-2 text-right min-w-[100px] ${
                            i === viewMonth ? "bg-emerald-600" : "bg-green-700"
                          }`}
                        >
                          CDJ
                        </th>
                        <th
                          className={`sticky top-[37px] z-20 text-white text-[9px] uppercase tracking-wider font-bold p-2 text-right min-w-[110px] ${
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
                        {rows.length === 0 ? "No eligible members found for this period." : "No members matched your search."}
                      </td>
                    </tr>
                  ) : (
                    paginated.map((row) => (
                      <tr key={row.member_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="sticky left-0 z-10 bg-white p-3.5 min-w-[220px]">
                          <p className="text-gray-900 font-medium">{row.member_name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{row.membership_id}</p>
                        </td>
                        <td className="p-3.5 text-right text-gray-700 tabular-nums min-w-[140px]">
                          {formatCurrency(row.opening_balance)}
                        </td>
                        {MONTH_LABELS.map((label, i) => (
                          <React.Fragment key={`${row.member_id}-${label}`}>
                            <td
                              className={`p-2.5 text-right text-emerald-700 tabular-nums border-l border-gray-100 min-w-[100px] ${
                                i === viewMonth ? "bg-amber-50" : ""
                              }`}
                            >
                              {Number(row.crj_by_month?.[i] || 0) > 0 ? formatCurrency(row.crj_by_month[i]) : "–"}
                            </td>
                            <td
                              className={`p-2.5 text-right text-sky-700 tabular-nums min-w-[100px] ${
                                i === viewMonth ? "bg-amber-50" : ""
                              }`}
                            >
                              {Number(row.cdj_by_month?.[i] || 0) > 0 ? formatCurrency(row.cdj_by_month[i]) : "–"}
                            </td>
                            <td
                              className={`p-2.5 text-right font-semibold text-gray-900 tabular-nums min-w-[110px] ${
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
                      <td className="sticky left-0 z-10 bg-gray-100 p-3.5 text-gray-900 min-w-[220px]">
                        Total Cooperative ({rows.length} accounts)
                      </td>
                      <td className="p-3.5 text-right text-gray-900 tabular-nums min-w-[140px]">
                        {formatCurrency(journalTotals.opening)}
                      </td>
                      {journalTotals.perMonth.map((m, i) => (
                        <React.Fragment key={`total-${MONTH_LABELS[i]}`}>
                          <td className="p-2.5 text-right text-emerald-800 tabular-nums border-l border-gray-200 min-w-[100px]">
                            {m.crj > 0 ? formatCurrency(m.crj) : "–"}
                          </td>
                          <td className="p-2.5 text-right text-sky-800 tabular-nums min-w-[100px]">
                            {m.cdj > 0 ? formatCurrency(m.cdj) : "–"}
                          </td>
                          <td className="p-2.5 text-right text-gray-900 tabular-nums min-w-[110px]">
                            {formatCurrency(m.balance)}
                          </td>
                        </React.Fragment>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
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
              {filtered.length > 0 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ISC_Journal;
