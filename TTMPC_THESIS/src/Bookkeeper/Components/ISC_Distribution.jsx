import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Download,
  Users,
  Users2,
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
import IscPayoutPreferencesModal from "./IscPayoutPreferencesModal";

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

  // The bookkeeper enters the AMOUNT the General Assembly allocated — the peso
  // figure, e.g. 1,000,000. The RATE is not an input: rule 5 DERIVES it
  //
  //     ISC Rate = Allocated Amount / Total Average Share Capital
  //
  // and the database returns it on every preview row. The amount is also
  // exactly what isc_post takes (p_allocated_pool), so nothing is converted in
  // either direction.
  const [amountInput, setAmountInput] = useState("");
  const [totalAverage, setTotalAverage] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  // The posting for this YEAR — found on page load (via existingPosting
  // below) OR just created by handlePost. Either way, this is what drives
  // the "Set Payout Preferences" section: only isc_settle_posting, called
  // from that modal, ever moves a member's share capital (§14, §17.2, §23);
  // isc_post itself only ever records a payable. Without loading it on
  // mount, a posting made in an earlier session would have no way back into
  // the settlement modal.
  const [lastPostingId, setLastPostingId] = useState(null);
  const [existingPosting, setExistingPosting] = useState(null); // { id, status, total_interest, total_members, posted_at }
  const [showPayoutModal, setShowPayoutModal] = useState(false);
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

  // A simple sum of an already-returned raw field — never a payout/rate
  // calculation — so computing it client-side doesn't touch the "never
  // recompute a payout" rule (FRONTEND_BRIEF.md §5.5); only the seven ISC
  // formulas themselves are off-limits there.
  const monthlyDeposit = useCallback(
    (r) => Number(r.crj_by_month?.[viewMonth] || 0) + Number(r.cdj_by_month?.[viewMonth] || 0),
    [viewMonth]
  );

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

  // Find whether THIS YEAR already has a posting, so the "Set Payout
  // Preferences" section reappears on a fresh page load rather than only
  // right after clicking Post ISC in the current session. Matches on
  // period_start/period_end the way isc_post's own overlap constraint does.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: lookupError } = await supabase
        .from("isc_postings")
        .select("id, status, total_interest, total_members, posted_at")
        .eq("period_start", PERIOD_START)
        .neq("status", "reversed")
        .order("posted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || lookupError) return;
      if (data) {
        setExistingPosting(data);
        setLastPostingId(data.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const amountNum = Number(amountInput);
  // Rounded to the centavo: isc_post re-verifies rule 7 with EXACT equality
  // (isc_v2_03_post_settle.sql ~line 157) while isc_calculate_preview
  // reconciles against `round(p_allocated_pool * 100)`. An amount carrying
  // sub-centavo digits could never satisfy both, so it is normalised once here
  // and the same figure drives the preview, the dialog and the post.
  const allocatedAmount =
    amountInput !== "" && Number.isFinite(amountNum) && amountNum > 0
      ? Math.round(amountNum * 100) / 100
      : null;
  const amountValid = allocatedAmount !== null;

  // Rule 5, for the confirm dialog only — derived, never typed.
  const derivedRate =
    amountValid && totalAverage ? (allocatedAmount / totalAverage) * 100 : null;

  // Debounced preview: recompute isc_calculate_preview with the pool implied
  // by the typed rate, so the ISC Rate / ISC Payout columns already show
  // exactly what would be posted — the real RPC computes it, this only picks
  // which pool to hand it.
  useEffect(() => {
    if (!amountValid) return undefined;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runCalculation(allocatedAmount);
    }, 500);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountInput]);

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
  }, [filtered, sortKey, sortDir, viewMonth, monthlyDeposit]);

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
      average: rows.reduce((sum, r) => sum + Number(r.average_share_capital || 0), 0),
      payout: rows.reduce((sum, r) => sum + Number(r.interest_amount || 0), 0),
    };
  }, [rows, viewMonth, monthlyDeposit]);

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
    sheet.columns = [16, 26, 16, 16, 18, 18, 10, 16].map((width) => ({ width }));
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
        Number(r.average_share_capital || 0),
        r.rate === null || r.rate === undefined ? null : Number(r.rate),
        r.interest_amount === null || r.interest_amount === undefined ? null : Number(r.interest_amount),
      ];
      [3, 4, 5, 6].forEach((col) => {
        row.getCell(col).numFmt = PESO_FORMAT;
      });
      row.getCell(7).numFmt = '0.00"%"';
      row.getCell(8).numFmt = PESO_FORMAT;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber >= 3 && colNumber <= 8) cell.alignment = { horizontal: "right" };
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
      rows.reduce((sum, r) => sum + Number(r.average_share_capital || 0), 0),
      "",
      rows.reduce((sum, r) => sum + Number(r.interest_amount || 0), 0),
    ];
    totalsRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { bold: true };
      cell.border = { top: { style: "medium", color: { argb: "FF9CA3AF" } } };
      if ([3, 4, 5, 6, 8].includes(colNumber)) {
        cell.numFmt = PESO_FORMAT;
        cell.alignment = { horizontal: "right" };
      }
    });

    await downloadWorkbook(workbook, `isc_distribution_${monthLabel.replace(" ", "_")}.xlsx`);
  };

  // Real posting. The allocated amount goes straight through — it is exactly
  // what isc_post takes and exactly what drove the preview, so what is posted
  // is what was reviewed. isc_post re-runs isc_calculate_preview server-side
  // with the same amount and re-verifies rule 7 before writing anything.
  const handlePost = async () => {
    if (!amountValid) return;
    setPosting(true);
    setPostError("");
    try {
      // isc_post RETURNS uuid — the new posting's id. Captured so the
      // payout-preferences modal (the March settlement step) knows which
      // posting's isc_transactions rows to load, without a separate lookup.
      const { data: newPostingId, error: rpcError } = await supabase.rpc("isc_post", {
        p_period_start: PERIOD_START,
        p_period_end: PERIOD_END,
        p_allocated_pool: allocatedAmount,
      });
      if (rpcError) throw new Error(rpcError.message || "Failed to record Interest on Share Capital.");
      setShowConfirm(false);
      setLastPostingId(newPostingId || null);
      setExistingPosting(
        newPostingId
          ? {
              id: newPostingId,
              status: "posted",
              total_interest: allocatedAmount,
              total_members: rows.length,
              posted_at: new Date().toISOString(),
            }
          : null
      );
      addNotification(
        `Interest on Share Capital recorded for ${YEAR} — ${formatCurrency(allocatedAmount)} across ${rows.length} members.`,
        "success"
      );
    } catch (err) {
      setPostError(err?.message || "Unable to record Interest on Share Capital.");
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
                  Allocated Amount
                </label>
                <div
                  className={`flex items-stretch h-11 rounded-lg border bg-gray-50 focus-within:bg-white transition-colors overflow-hidden w-56 ${
                    amountInput !== "" && !amountValid
                      ? "border-red-300 focus-within:ring-2 focus-within:ring-red-400/50"
                      : "border-gray-300 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary"
                  }`}
                >
                  <span className="flex items-center px-3 text-sm font-semibold text-gray-500 bg-gray-100 border-r border-gray-200 shrink-0">
                    ₱
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="e.g. 1000000"
                    className="min-w-0 flex-1 bg-transparent px-3 text-sm text-right tabular-nums focus:outline-none"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={!amountValid || !totalAverage || status === "loading"}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-primary hover:bg-primary-deep text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="w-4 h-4" /> Record ISC
              </button>
              {/* Always visible — not gated on the existingPosting lookup, so
                  the March step is reachable even if that background query
                  finds nothing or fails. The modal itself explains what to do
                  when there is no recorded amount for the year yet. */}
              <button
                type="button"
                onClick={() => setShowPayoutModal(true)}
                disabled={!lastPostingId}
                title={
                  lastPostingId
                    ? "Open the March payout checklist for this year's recorded amount"
                    : "Record the ISC amount for this year first"
                }
                className="inline-flex items-center gap-2 h-11 px-5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <Users2 className="w-4 h-4" /> March Payout Checklist
              </button>
            
            </div>

            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                Recording creates a permanent record for {YEAR} — it cannot be edited afterward, only deleted while
                every member is still unsettled. No share capital moves yet; that only happens at the March General
                Assembly.
              </p>
            </div>

            {/* Shown whenever THIS YEAR has a posting — found on page load
                (existingPosting), including one just created in this session.
                Not gated on session-only state, so a posting from an earlier
                session is still reachable after a refresh. */}
            {existingPosting && (
              <div
                className={`mt-3 rounded-lg border px-3 py-3 flex items-start justify-between gap-3 flex-wrap ${
                  existingPosting.status === "settled"
                    ? "border-gray-200 bg-gray-50"
                    : "border-green-200 bg-green-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <CheckCircle2
                    className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                      existingPosting.status === "settled" ? "text-gray-500" : "text-green-600"
                    }`}
                  />
                  <p className={`text-xs ${existingPosting.status === "settled" ? "text-gray-600" : "text-green-700"}`}>
                    {existingPosting.status === "settled" ? (
                      <>
                        {YEAR} has already been settled —{" "}
                        {formatCurrency(existingPosting.total_interest)} across {existingPosting.total_members}{" "}
                        members. Preferences can be reviewed but not changed.
                      </>
                    ) : (
                      <>
                        Recorded {formatCurrency(existingPosting.total_interest)} on{" "}
                        {new Date(existingPosting.posted_at).toLocaleString("en-PH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        . No member's share capital has changed yet — that happens at the March General Assembly
                        when each member chooses to withdraw or add their payout to share capital.
                      </>
                    )}
                  </p>
                </div>
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
                      <td colSpan={7} className="p-10 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                          <p className="text-xs text-gray-500">Calculating Interest on Share Capital...</p>
                        </div>
                      </td>
                    </tr>
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center">
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
                        <td className="p-4 text-sm text-right text-amber-800 tabular-nums bg-amber-50/70">
                          {formatCurrency(row.average_share_capital)}
                        </td>
                        <td className="p-4 text-sm text-right text-purple-800 tabular-nums bg-purple-50/70">
                          {row.rate === null || row.rate === undefined ? "—" : `${Number(row.rate).toFixed(2)}%`}
                        </td>
                        <td className="p-4 text-sm text-right font-semibold text-green-800 tabular-nums bg-green-50/70">
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
                      <td className="p-4 text-right text-amber-900 tabular-nums bg-amber-200 ring-1 ring-inset ring-amber-400 font-extrabold">{formatCurrency(totals.average)}</td>
                      <td className="p-4 text-right text-gray-500 bg-purple-50/70">—</td>
                      <td className="p-4 text-right text-green-900 tabular-nums bg-green-100">{formatCurrency(totals.payout)}</td>
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
        title="Record Interest on Share Capital"
        tone="warning"
        confirmLabel="Confirm & Record"
        loading={posting}
        errorMessage={postError}
        onConfirm={handlePost}
        onCancel={() => setShowConfirm(false)}
      >
        <div className="text-sm text-gray-700 space-y-3">
          <p>
            You are about to record Interest on Share Capital for <strong>January – December {YEAR}</strong>,
            allocating <strong>{formatCurrency(allocatedAmount)}</strong>.
          </p>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Eligible Members</span>
              <span className="font-semibold">{rows.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Allocated Amount</span>
              <span className="font-semibold">{formatCurrency(allocatedAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Resulting Rate</span>
              <span className="font-semibold">
                {derivedRate === null ? "—" : `${derivedRate.toFixed(4)}%`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total ISC Payout</span>
              <span className="font-semibold">{formatCurrency(totals.payout)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            This records a payable for every eligible member — it does not automatically credit anyone's share
            capital. A member's payout only becomes share capital if they elect to capitalise it at the March
            General Assembly. This cannot be edited once recorded, and can only be deleted while every member is
            still unsettled.
          </p>
          {session?.user?.email && <p className="text-[11px] text-gray-400">Recording as {session.user.email}</p>}
        </div>
      </ConfirmDialog>

      <IscPayoutPreferencesModal
        open={showPayoutModal}
        postingId={lastPostingId}
        onClose={() => setShowPayoutModal(false)}
        onSettled={(result) => {
          const capCount = result?.capitalised_count ?? 0;
          const cashCount = result?.cash_count ?? 0;
          setExistingPosting((prev) => (prev ? { ...prev, status: "settled" } : prev));
          addNotification(
            `Success: Payout allocations saved! ${cashCount} member${cashCount === 1 ? "" : "s"} set to Withdraw, ${capCount} added to Share Capital.`,
            "success"
          );
        }}
      />
    </div>
  );
};

export default Bookkeeper_ISC;
