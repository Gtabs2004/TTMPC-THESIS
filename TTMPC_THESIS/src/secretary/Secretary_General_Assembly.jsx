import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeRefetch } from "../hooks/useRealtimeRefetch";
import { RT } from "../lib/realtimeSync";
import StaffSidebar from "../components/StaffSidebar";
import { secretaryNav } from "../components/StaffSidebar/configs/secretary";
import {
  AlertCircle,
  Archive,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  LayoutDashboard,
  Save,
  Search,
  UserPlus,
  Users,
  ShieldCheck,
  AlertTriangle,
  History,
  Check,
  Download,
} from "lucide-react";

import { UserAuth } from "../contex/AuthContext";
import { useNotification } from "../contex/NotificationContext";
import StaffTopbar from "../components/StaffTopbar";
import { StatCard, StatCardRow } from "../components/StatCard";
import { TableToolbar } from "../components/TableToolbar";
import Pagination from "../components/Pagination";
import ConfirmDialog from "../components/ConfirmDialog";
import NotificationBell from "../components/NotificationBell";
import TableStateRow from "../components/TableStateRow";
import { exportGeneralAssemblyReport } from "../utils/generalAssemblyExport";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 10;
const SCORING_YEAR = 2026;
const getGeneralAssemblyDate = (year) => {
  const firstMarchDay = new Date(year, 2, 1);
  const firstSaturday = 1 + ((6 - firstMarchDay.getDay() + 7) % 7);
  return `${year}-03-${String(firstSaturday + 14).padStart(2, "0")}`;
};
const formatRecordedAt = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      });
};

const Secretary_General_Assembly = () => {
  const { session } = UserAuth();
  const { addNotification } = useNotification();

  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({}); // { membership_id: { status, remarks } }
  const [meetingDate] = useState(() => getGeneralAssemblyDate(SCORING_YEAR));
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState("full-list");
  const [exportingFormat, setExportingFormat] = useState("");
  const exportMenuRef = useRef(null);
  
  // New state for bulk selection
  const [selectedMembers, setSelectedMembers] = useState(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmationMode, setConfirmationMode] = useState(null); // 'bulk' or null
  const [bulkStatus, setBulkStatus] = useState("Present"); // status to apply on bulk action



  const fetchRoster = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/secretary/general-assembly/${SCORING_YEAR}`
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || "Failed to load GA roster.");
      }
      setRows(Array.isArray(result.data) ? result.data : []);
      setEdits({});
    } catch (err) {
      if (silent) return;
      addNotification(err?.message || "Unable to load roster.", "error");
      setRows([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addNotification]);
  useRealtimeRefetch([...RT.ATTENDANCE, "member"], () => fetchRoster({ silent: true }));

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  useEffect(() => {
    if (!exportOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!exportMenuRef.current?.contains(event.target)) setExportOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setExportOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [exportOpen]);

  const effectiveStatus = useCallback(
    (row) => edits[row.id]?.status !== undefined ? edits[row.id].status : row.status,
    [edits]
  );
  const effectiveRemarks = useCallback(
    (row) => edits[row.id]?.remarks !== undefined ? edits[row.id].remarks : row.remarks,
    [edits]
  );

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (statusFilter === "All") return true;
        return effectiveStatus(r) === statusFilter;
      })
      .filter((r) => {
        if (!term) return true;
        return (
          String(r.full_name || "").toLowerCase().includes(term) ||
          String(r.membership_id || "").toLowerCase().includes(term)
        );
      });
  }, [rows, searchTerm, statusFilter, effectiveStatus]);

  const totals = useMemo(() => {
    let present = 0;
    let absent = 0;
    rows.forEach((r) => {
      if (effectiveStatus(r) === "Present") present += 1;
      else absent += 1;
    });
    return { present, absent, total: rows.length };
  }, [rows, effectiveStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
    setSelectedMembers(new Set());
  }, [searchTerm, statusFilter]);

  const setRowField = (memberId, field, value) => {
    setEdits((prev) => ({
      ...prev,
      [memberId]: { ...(prev[memberId] || {}), [field]: value },
    }));
  };

  const handleSave = async () => {
    const dirty = Object.keys(edits);
    if (dirty.length === 0) {
      addNotification("No changes to save.", "info");
      return;
    }
    if (!meetingDate) {
      addNotification("Pick a meeting date first.", "error");
      return;
    }

    const entries = dirty.map((memberId) => {
      const row = rows.find((r) => r.id === memberId) || {};
      return {
        membership_number_id: memberId,
        status: edits[memberId].status ?? row.status ?? "Absent",
        remarks: edits[memberId].remarks ?? row.remarks ?? "",
      };
    });

    setSaving(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/secretary/general-assembly/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meeting_date: meetingDate,
            recorded_by: session?.user?.id || null,
            entries,
          }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.detail || "Save failed.");
      }
      const ok = result?.inserted + result?.updated;
      addNotification(
        `Saved ${ok} attendance ${ok === 1 ? "record" : "records"}.`,
        result?.errors?.length ? "warning" : "success"
      );
      if (result?.errors?.length) {
        console.warn("GA save partial errors", result.errors);
      }
      await fetchRoster();
    } catch (err) {
      addNotification(err?.message || "Failed to save attendance.", "error");
    } finally {
      setSaving(false);
    }
  };

  // Bulk selection handlers
  const handleSelectMember = (memberId) => {
    setSelectedMembers((prev) => {
      const updated = new Set(prev);
      if (updated.has(memberId)) {
        updated.delete(memberId);
      } else {
        updated.add(memberId);
      }
      return updated;
    });
  };

  const handleSelectAll = () => {
    const selectableIds = filtered.map((r) => r.id);
    const allSelected =
      selectableIds.length > 0 &&
      selectableIds.every((id) => selectedMembers.has(id));
    if (allSelected) {
      setSelectedMembers(new Set());
    } else {
      setSelectedMembers(new Set(selectableIds));
    }
  };

  const handleMarkSelectedAsPresent = () => {
    if (selectedMembers.size === 0) {
      addNotification("Please select at least one member.", "info");
      return;
    }
    if (Object.keys(edits).length > 0) {
      addNotification(
        "Save or revert your unsaved attendance edits before using bulk marking.",
        "warning"
      );
      return;
    }
    if (!meetingDate) {
      addNotification("Pick a meeting date first.", "error");
      return;
    }
    setConfirmationMode("bulk");
    setShowConfirmModal(true);
  };

  const handleConfirmBulkMark = async () => {
    if (selectedMembers.size === 0) {
      addNotification("No members selected.", "info");
      return;
    }
    if (Object.keys(edits).length > 0) {
      addNotification(
        "Save or revert your unsaved attendance edits before using bulk marking.",
        "warning"
      );
      return;
    }

    const entries = Array.from(selectedMembers).map((memberId) => {
      const row = rows.find((r) => r.id === memberId) || {};
      return {
        membership_number_id: memberId,
        status: bulkStatus,
        remarks: row.remarks ?? "",
      };
    });

    setSaving(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/secretary/general-assembly/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meeting_date: meetingDate,
            recorded_by: session?.user?.id || null,
            entries,
          }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.detail || "Save failed.");
      }
      const ok = result?.inserted + result?.updated;
      addNotification(
        `${ok} member${ok === 1 ? "" : "s"} successfully marked as ${bulkStatus}.`,
        result?.errors?.length ? "warning" : "success"
      );
      if (result?.errors?.length) {
        console.warn("GA bulk mark partial errors", result.errors);
      }
      setSelectedMembers(new Set());
      setShowConfirmModal(false);
      await fetchRoster();
    } catch (err) {
      addNotification(err?.message || "Failed to mark attendance.", "error");
    } finally {
      setSaving(false);
    }
  };


  const dirtyCount = Object.keys(edits).length;
  const exportAllRows = useMemo(
    () => rows.map((row) => ({
      ...row,
      status: edits[row.id]?.status !== undefined ? edits[row.id].status : row.status,
      remarks: edits[row.id]?.remarks !== undefined ? edits[row.id].remarks : row.remarks,
    })),
    [rows, edits]
  );
  const exportScopeRows = useMemo(() => {
    if (exportScope === "present") return exportAllRows.filter((row) => row.status === "Present");
    if (exportScope === "absent") return exportAllRows.filter((row) => row.status !== "Present");
    return exportAllRows;
  }, [exportAllRows, exportScope]);
  const exportScopes = [
    { value: "full-list", label: "Full List", count: rows.length },
    {
      value: "present",
      label: "Present Only",
      count: rows.filter((row) => effectiveStatus(row) === "Present").length,
    },
    {
      value: "absent",
      label: "Absent Only",
      count: rows.filter((row) => effectiveStatus(row) !== "Present").length,
    },
  ];
  const handleExport = async (format) => {
    setExportingFormat(format);
    try {
      await exportGeneralAssemblyReport({
        rows: exportScopeRows,
        allRows: exportAllRows,
        meetingDate,
        scope: exportScope,
        format,
      });
      setExportOpen(false);
      addNotification(
        `Exported ${exportScopeRows.length} attendance records as ${format.toUpperCase()}.`,
        "success"
      );
    } catch (error) {
      console.error("General Assembly report export failed", error);
      addNotification(error?.message || "Unable to export the attendance report.", "error");
    } finally {
      setExportingFormat("");
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
         {/* SIDEBAR */}
         <StaffSidebar portal="Secretary" items={secretaryNav} />
   
         {/* MAIN CONTENT AREA */}
         <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <StaffTopbar portal="Secretary" notifications={<NotificationBell viewAllPath="/Secretary_Records" />} />

        <main className="animate-page-in flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-3">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
                  General Assembly Attendance
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-gray-600">
                  Record member attendance for the {SCORING_YEAR} General Assembly. Attendance contributes to Members Classification.
                </p>
              </div>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-green-200 bg-white px-3 py-2 text-xs font-semibold text-green-900 shadow-sm">
              <CalendarDays className="h-4 w-4 text-green-700" aria-hidden="true" />
              {SCORING_YEAR} Annual Meeting
            </div>
          </header>

          <StatCardRow cols={3}>
            <StatCard
              label="Total Members"
              value={totals.total}
              icon={Users}
              iconColor="text-gray-600"
              subtext="Full member roster"
            />
            <StatCard
              label="Present"
              value={totals.present}
              icon={CheckCircle2}
              iconColor="text-green-700"
              subtext="Marked present"
            />
            <StatCard
              label="Absent"
              value={totals.absent}
              icon={AlertCircle}
              iconColor="text-amber-700"
              subtext="Marked absent"
            />
          </StatCardRow>

          {/* Table (toolbar shares this card) */}
          <div className="overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm">
            <TableToolbar
              title="Member attendance"
              subtitle={`Showing ${paginated.length} of ${filtered.length} filtered members${dirtyCount ? ` · ${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}` : ""}`}
              tabs={[
                { value: "All", label: "All", count: totals.total },
                { value: "Present", label: "Present", count: totals.present },
                { value: "Absent", label: "Absent", count: totals.absent },
              ]}
              activeTab={statusFilter}
              onTabChange={setStatusFilter}
            >
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  aria-label="Search members by name or membership ID"
                  placeholder="Search by name or membership ID"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="h-9 w-full rounded-lg border border-gray-300 bg-gray-50 pl-8 pr-3 text-xs font-medium text-gray-900 placeholder:text-gray-500 focus:border-green-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-700/30"
                />
              </div>

              <div
                className="flex shrink-0 items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-900"
                aria-label={`General Assembly date: ${new Date(`${meetingDate}T12:00:00`).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}`}
              >
                <CalendarDays size={14} className="text-gray-500" />
                <span>GA Date</span>
                <span>
                  {new Date(`${meetingDate}T12:00:00`).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>

              {selectedMembers.size > 0 && (
                <div className="inline-flex items-center gap-1.5">
                  <select
                    value={bulkStatus}
                    onChange={(event) => setBulkStatus(event.target.value)}
                    aria-label="Attendance status to apply to selected members"
                    className="h-9 rounded-lg border border-gray-300 bg-gray-50 px-2 text-xs font-semibold text-gray-900 focus:border-green-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-700/30"
                  >
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                  </select>
                  <button
                    onClick={handleMarkSelectedAsPresent}
                    disabled={saving || dirtyCount > 0}
                    aria-describedby={dirtyCount > 0 ? "bulk-edit-warning" : undefined}
                    title={
                      dirtyCount > 0
                        ? "Save or revert unsaved row edits before bulk marking."
                        : undefined
                    }
                    className={`h-9 px-3 rounded-lg text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      bulkStatus === "Present"
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-amber-600 hover:bg-amber-700"
                    }`}
                  >
                    <Check size={13} />
                    {saving
                      ? "Processing..."
                      : `Mark Selected as ${bulkStatus} (${selectedMembers.size})`}
                  </button>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving || dirtyCount === 0}
                className="h-9 px-3 rounded-lg bg-green-700 hover:bg-green-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-700/40 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={13} />
                {saving ? "Saving..." : `Save${dirtyCount ? ` (${dirtyCount})` : ""}`}
              </button>

              <div className="relative" ref={exportMenuRef}>
                <button
                  type="button"
                  onClick={() => setExportOpen((open) => !open)}
                  aria-haspopup="dialog"
                  aria-expanded={exportOpen}
                  className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-gray-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-700/30 focus:ring-offset-1"
                >
                  <Download size={13} />
                  Export Report
                </button>
                {exportOpen && (
                  <div
                    role="dialog"
                    aria-label="Export General Assembly attendance report"
                    className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
                  >
                    <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Choose report scope
                    </p>
                    <div className="space-y-1">
                      {exportScopes.map((scope) => (
                        <button
                          key={scope.value}
                          type="button"
                          onClick={() => setExportScope(scope.value)}
                          aria-pressed={exportScope === scope.value}
                          className={`w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                            exportScope === scope.value
                              ? "bg-green-50 text-green-800"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <span>{scope.label}</span>
                          <span className="float-right tabular-nums text-gray-500">{scope.count}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        Export format
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: "csv", label: "CSV" },
                          { value: "xlsx", label: "Excel (.xlsx)" },
                          { value: "pdf", label: "PDF" },
                        ].map((format) => (
                          <button
                            key={format.value}
                            type="button"
                            onClick={() => handleExport(format.value)}
                            disabled={Boolean(exportingFormat) || loading}
                            className="h-8 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50"
                          >
                            {exportingFormat === format.value ? "Exporting..." : format.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TableToolbar>

            {selectedMembers.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-6 py-2.5 text-xs">
                <div>
                  <p aria-live="polite" className="font-semibold text-gray-700">
                    {selectedMembers.size} selected. Selection can span pages, but is limited to the current search and status filter.
                  </p>
                  <p className="mt-0.5 text-gray-500">
                    Selection clears when the search or status filter changes.
                  </p>
                  {dirtyCount > 0 && (
                    <p id="bulk-edit-warning" role="status" className="mt-1 font-semibold text-amber-800">
                      Save or revert {dirtyCount} unsaved row edit{dirtyCount === 1 ? "" : "s"} before bulk marking.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMembers(new Set())}
                  className="rounded-md px-2 py-1 font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-700/30"
                >
                  Clear selection
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] table-fixed text-left border-collapse">
                <colgroup>
                  <col className="w-[4%]" />
                  <col className="w-[14%]" />
                  <col className="w-[22%]" />
                  <col className="w-[14%]" />
                  <col className="w-[28%]" />
                  <col className="w-[18%]" />
                </colgroup>
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th scope="col" className="px-3 py-3 font-bold text-center">
                      {(() => {
                        const selectableIds = filtered.map((r) => r.id);
                        const allSelected =
                          selectableIds.length > 0 &&
                          selectableIds.every((id) => selectedMembers.has(id));
                        return (
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={handleSelectAll}
                            aria-label={`Select all ${filtered.length} members matching the current filters across every page`}
                            className="h-4 w-4 cursor-pointer accent-green-700"
                            title={`Select all ${filtered.length} filtered members across every page`}
                          />
                        );
                      })()}
                    </th>
                    <th scope="col" className="px-4 py-3 font-bold">Member ID</th>
                    <th scope="col" className="px-4 py-3 font-bold">Member Name</th>
                    <th scope="col" className="px-4 py-3 font-bold">Attendance</th>
                    <th scope="col" className="px-4 py-3 font-bold">Remarks</th>
                    <th scope="col" className="px-4 py-3 font-bold">Last Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={6} variant="loading" label="Loading..." />
                  ) : paginated.length === 0 ? (
                    <TableStateRow colSpan={6} variant="empty" icon={AlertCircle} label="No members match your filters." />
                  ) : (
                    paginated.map((row) => {
                      const status = effectiveStatus(row);
                      const isDirty = edits[row.id] !== undefined;
                      const isSelected = selectedMembers.has(row.id);
                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-gray-100 transition-colors hover:bg-gray-50/70 ${
                            isSelected ? "bg-green-50/70" : isDirty ? "bg-amber-50/50" : ""
                          }`}
                        >
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectMember(row.id)}
                              aria-label={`Select ${row.full_name || "member"}`}
                              className="h-4 w-4 cursor-pointer accent-green-700"
                              title="Select member"
                            />
                          </td>
                          <td className="px-4 py-3 text-xs font-mono font-medium text-gray-600">
                            <span className="block truncate" title={row.membership_id || "—"}>
                              {row.membership_id || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex min-w-0 items-center">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-gray-900" title={row.full_name}>
                                  {row.full_name || "Unknown Member"}
                                </p>
                                {isDirty && (
                                  <span className="mt-0.5 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
                                    Unsaved
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={status}
                              aria-label={`Attendance status for ${row.full_name || "member"}`}
                              onChange={(event) =>
                                setRowField(row.id, "status", event.target.value)
                              }
                              className={`h-9 w-full min-w-[112px] rounded-lg border px-2.5 text-xs font-semibold focus:border-green-700 focus:outline-none focus:ring-2 focus:ring-green-700/30 ${
                                status === "Present"
                                  ? "border-green-200 bg-green-50 text-green-900"
                                  : "border-amber-200 bg-amber-50 text-amber-900"
                              }`}
                            >
                              <option value="Absent">Absent</option>
                              <option value="Present">Present</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={effectiveRemarks(row) || ""}
                              aria-label={`Remarks for ${row.full_name || "member"}`}
                              onChange={(event) =>
                                setRowField(row.id, "remarks", event.target.value)
                              }
                              placeholder="Optional remarks"
                              className="h-9 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 text-xs text-gray-900 placeholder:text-gray-500 focus:border-green-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-700/30"
                            />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {formatRecordedAt(row.recorded_at) || (
                              <span className="text-gray-400">Not recorded</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > 0 && (
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            )}
          </div>

          {/* Confirmation Modal */}
          <ConfirmDialog
            open={showConfirmModal && confirmationMode === "bulk"}
            title="Confirm Attendance"
            confirmLabel={`Mark as ${bulkStatus}`}
            loadingLabel="Confirming..."
            tone={bulkStatus === "Present" ? "default" : "warning"}
            loading={saving}
            disableConfirm={dirtyCount > 0 || selectedMembers.size === 0}
            onCancel={() => {
              setShowConfirmModal(false);
              setConfirmationMode(null);
            }}
            onConfirm={handleConfirmBulkMark}
          >
            <p className="text-sm text-gray-700 mb-4">
              Mark{" "}
              <strong className={bulkStatus === "Present" ? "text-green-700" : "text-amber-700"}>
                {selectedMembers.size} member{selectedMembers.size === 1 ? "" : "s"}
              </strong>{" "}
              as {bulkStatus}? Review the complete list below. No other members will be changed.
            </p>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                All selected members ({selectedMembers.size})
              </p>
              <div
                role="region"
                aria-label="Complete list of selected members"
                tabIndex={0}
                className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 focus:outline-none focus:ring-2 focus:ring-green-700/30"
              >
                <ul className="space-y-2">
                  {rows
                    .filter((row) => selectedMembers.has(row.id))
                    .map((member) => (
                      <li key={member.id} className="flex items-start gap-2 text-sm text-gray-700">
                        <Check size={16} className="mt-0.5 flex-shrink-0 text-green-600" aria-hidden="true" />
                        <div>
                          <div className="font-medium">{member.full_name}</div>
                          <div className="text-xs text-gray-500">ID: {member.membership_id}</div>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </ConfirmDialog>
        </main>
      </div>
    </div>
  );
};


export default Secretary_General_Assembly;
