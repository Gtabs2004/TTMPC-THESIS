import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { useConfirm } from "../../contex/ConfirmContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import Pagination from "../../components/Pagination";
import TableActionButton from "../../components/TableActionButton";
import TableStateRow from "../../components/TableStateRow";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Calculator,
  Activity,
  BarChart3,
  History,
  Search,
  Bell,
  ChevronDown,
  PiggyBank,
  Eye,
  Briefcase,
  Wallet,
  Coins,
  Loader2,
  Zap,
  ShieldAlert,
  Brain,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const ITEMS_PER_PAGE = 10;

// The MIGS pass mark (migs_engine.py MIGS_THRESHOLD). Used only to tint the
// score meter -- the classification itself still comes from migs_status off
// the server, never from re-deriving it here.
const MIGS_THRESHOLD = 50;

// One class string for all three filter selects. h-10 matches the search
// input so the toolbar shares a single baseline.
const FILTER_SELECT_CLASS =
  "h-10 pl-3 pr-8 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#2C7A3F] focus:border-transparent transition-colors";

const MIGS = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [yearFilter, setYearFilter] = useState("2026");
  const [sortBy, setSortBy] = useState("Name A-Z");
  const [computing, setComputing] = useState(false);
  const [lastComputeRun, setLastComputeRun] = useState(null);
  useEffect(() => {
    const fetchMigsMembers = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/migs/members?year=${encodeURIComponent(yearFilter)}`
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.success) {
          throw new Error(result?.detail || "Failed to load MIGS members.");
        }
        setRows(Array.isArray(result.data) ? result.data : []);
        addNotification(
          `Loaded ${result.count || 0} members for MIGS scoring.`,
          "success"
        );
      } catch (err) {
        setRows([]);
        addNotification(err?.message || "Unable to fetch MIGS members.", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchMigsMembers();
  }, [yearFilter]);

  const filtered = useMemo(() => {
    let result = rows;

    // Search filter
    const key = String(query || "").trim().toLowerCase();
    if (key) {
      result = result.filter((r) =>
        String(r.member_id || "").toLowerCase().includes(key) ||
        String(r.full_name || "").toLowerCase().includes(key)
      );
    }

    // Status filter
    if (statusFilter === "Pending") {
      result = result.filter((r) => r.migs_status == null);
    } else if (statusFilter !== "All Status") {
      result = result.filter((r) => r.migs_status === statusFilter);
    }

    // Year filter is applied server-side via the API call; no client-side filtering needed.

    // Sort
    if (sortBy === "Name A-Z") {
      result.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    } else if (sortBy === "Name Z-A") {
      result.sort((a, b) => (b.full_name || "").localeCompare(a.full_name || ""));
    } else if (sortBy === "Score High-Low") {
      result.sort((a, b) => (b.migs_score || 0) - (a.migs_score || 0));
    } else if (sortBy === "Score Low-High") {
      result.sort((a, b) => (a.migs_score || 0) - (b.migs_score || 0));
    }

    return result;
  }, [query, rows, statusFilter, yearFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, rows, statusFilter, yearFilter, sortBy]);

  const handleComputeAll = async () => {
    if (computing) return;
    const ok = await confirm({
      title: "Recompute MIGS Classifications",
      message: "Recompute and label every member's MIGS classification? This saves a snapshot to the system so other modules (loan approval, member view) can use the official label.",
      confirmLabel: "Recompute All",
      tone: "warning",
    });
    if (!ok) return;
    setComputing(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/migs/recompute-all?year=${encodeURIComponent(yearFilter)}`,
        { method: "POST" }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.detail || "Failed to compute MIGS for all members.");
      }
      const total = (result?.inserted || 0) + (result?.updated || 0);
      setLastComputeRun(result?.accrual_date || new Date().toISOString().slice(0, 10));
      addNotification(
        `Labeled ${total} members as of ${result?.accrual_date}. ${result?.errors?.length ? `(${result.errors.length} errors)` : ""}`,
        result?.errors?.length ? "warning" : "success"
      );
    } catch (err) {
      addNotification(err?.message || "Compute failed.", "error");
    } finally {
      setComputing(false);
    }
  };


  const getMIGSStatusColor = (status) => {
    if (status === "MIGS Qualified") {
      return "bg-green-100 text-green-700 border-green-300";
    }
    return "bg-red-100 text-red-700 border-red-300";
  };

  const getMIGSStatusIcon = (status) => {
    return status === "MIGS Qualified" ? "✓" : "○";
  };

  // Same peso formatting as the ISC pages (ISC_Distribution.jsx:42) so the
  // portal reads consistently. A bare toLocaleString() drops the centavos --
  // it rendered 337,758.2 instead of 337,758.20.
  const formatCurrency = (value) =>
    value === null || value === undefined
      ? "—"
      : `₱${Number(value).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {computing && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl px-8 py-7 max-w-sm w-full mx-4 border border-gray-200">
            <div className="flex flex-col items-center text-center">
              <div className="relative w-14 h-14 mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-green-100"></div>
                <Loader2 className="w-14 h-14 text-[#2C7A3F] animate-spin" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                Computing MIGS Classifications
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Scoring every member and writing snapshots to the system. This usually takes 30–60 seconds.
              </p>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-[#2C7A3F] h-1.5 rounded-full animate-pulse w-3/4"></div>
              </div>
              <p className="text-[11px] uppercase tracking-wider text-gray-400 mt-3">
                Please don't close this window
              </p>
            </div>
          </div>
        </div>
      )}

      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

      <div className="flex-1 flex flex-col h-screen overflow-y-auto min-w-0">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        <main className="p-8 min-w-0">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Breadcrumb portal="Bookkeeper" page="MIGS Scoring" />
              <h1 className="font-bold text-2xl text-gray-900">MIGS Scoring</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Compute classification for every member and label them in the system.
                {lastComputeRun ? ` Last run: ${lastComputeRun}.` : ""}
              </p>
            </div>
            <button
              onClick={handleComputeAll}
              disabled={computing}
              className="px-4 py-2 rounded-lg bg-[#2C7A3F] hover:bg-[#1f5a2d] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-80 disabled:cursor-not-allowed"
              title="Recompute all members and write the snapshot to member_classification_temporal"
            >
              {computing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Computing...
                </>
              ) : (
                <>
                  <Zap size={15} />
                  Compute All MIGS
                </>
              )}
            </button>
          </div>

          {/* Table Section (filters toolbar + table share this card) */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Filter toolbar. Every control is h-10 so the row has one
                baseline; the selects share a single class string rather than
                three near-identical copies that drift apart on edit. */}
            <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
              <div className="relative flex-1 min-w-[220px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  type="text"
                  className="bg-gray-50 w-full h-10 rounded-lg border border-gray-200 pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F] focus:border-transparent focus:bg-white transition-colors"
                  placeholder="Search by name or ID..."
                />
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={FILTER_SELECT_CLASS}
                >
                  <option>All Status</option>
                  <option>Pending</option>
                  <option>MIGS Qualified</option>
                  <option>Non-MIGS</option>
                </select>

                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className={FILTER_SELECT_CLASS}
                >
                  <option>2026</option>
                  <option>2025</option>
                  <option>2024</option>
                  <option>2023</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className={FILTER_SELECT_CLASS}
                >
                  <option>Name A-Z</option>
                  <option>Name Z-A</option>
                  <option>Score High-Low</option>
                  <option>Score Low-High</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  {/* Money columns are right-aligned so digits line up
                      column-wise and can be scanned; everything else keeps
                      its existing alignment. */}
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="px-5 py-3.5 font-bold">Member Name</th>
                    <th className="px-4 py-3.5 font-bold">ID</th>
                    <th className="px-4 py-3.5 font-bold text-right">Capital</th>
                    <th className="px-4 py-3.5 font-bold text-right">Loan</th>
                    <th className="px-4 py-3.5 font-bold text-right">Savings</th>
                    <th className="px-4 py-3.5 font-bold text-center w-[132px]">Score</th>
                    <th className="px-4 py-3.5 font-bold text-center">Status</th>
                    <th className="px-5 py-3.5 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={8} variant="loading" label="Loading..." />
                  ) : filtered.length === 0 ? (
                    <TableStateRow
                      colSpan={8}
                      variant="empty"
                      icon={Users}
                      label="No MIGS scoring records found."
                    />
                  ) : (
                    paginatedRows.map((r) => (
                      <tr key={String(r.id || r.member_id)} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4 text-sm font-medium text-gray-800">{r.full_name}</td>
                        <td className="px-4 py-4 text-[12px] text-gray-500 font-mono whitespace-nowrap">{r.member_id}</td>
                        {/* tabular-nums keeps digits a fixed width so the
                            right-aligned amounts stack cleanly down the column. */}
                        <td className="px-4 py-4 text-sm text-right text-gray-700 tabular-nums whitespace-nowrap">{formatCurrency(r.capital)}</td>
                        <td className="px-4 py-4 text-sm text-right text-gray-700 tabular-nums whitespace-nowrap">{formatCurrency(r.loan_balance)}</td>
                        <td className="px-4 py-4 text-sm text-right text-gray-700 tabular-nums whitespace-nowrap">{formatCurrency(r.savings_balance)}</td>
                        <td className="px-4 py-4 text-sm">
                          {r.migs_score == null ? (
                            <span className="block text-center text-gray-400 text-xs italic">Not scored</span>
                          ) : (
                            // Score, then a thin meter of the same value. The
                            // tint follows MIGS_THRESHOLD purely as a visual
                            // cue; the badge beside it remains the source of
                            // truth for classification.
                            <div className="flex flex-col items-center gap-1.5">
                              <span className="tabular-nums leading-none">
                                <span className="font-bold text-gray-900 text-[15px]">{r.migs_score}</span>
                                <span className="text-gray-400 text-xs"> / 100</span>
                              </span>
                              <span className="block w-16 h-1 rounded-full bg-gray-100 overflow-hidden">
                                <span
                                  className={`block h-full rounded-full ${
                                    r.migs_score >= MIGS_THRESHOLD ? "bg-[#2C7A3F]" : "bg-red-400"
                                  }`}
                                  style={{ width: `${Math.max(0, Math.min(100, Number(r.migs_score)))}%` }}
                                />
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-center">
                          {r.migs_status == null ? (
                            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap">
                              Pending
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap ${getMIGSStatusColor(r.migs_status)}`}>
                              <span className="leading-none">{getMIGSStatusIcon(r.migs_status)}</span>
                              {r.migs_status === "MIGS Qualified" ? "MIGS Qualified" : "Non-MIGS"}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm text-right">
                          {/* Bordered pill rather than bare text: a bigger,
                              more obvious hit area, and it reads as a control. */}
                          <TableActionButton
                            icon={Eye}
                            onClick={() => navigate(`/migs-evaluate?member_id=${encodeURIComponent(String(r.member_id || ""))}`)}
                          >
                            Evaluate
                          </TableActionButton>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!loading && filtered.length > 0 ? (
            <div className="mt-4">
              <Pagination page={currentPage} totalPages={totalPages} onChange={setCurrentPage} />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
};

export default MIGS;



