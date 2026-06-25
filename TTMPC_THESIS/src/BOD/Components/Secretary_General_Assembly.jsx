import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Archive,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  LayoutDashboard,
  Save,
  Search,
  UserPlus,
  Users,
  ShieldCheck,
  AlertTriangle,
  History
} from "lucide-react";

import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import {
  PortalSidebarIdentity,
  PortalTopbarIdentity,
} from "../../components/PortalIdentity";
import logo from "../../assets/img/ttmpc logo.png";
import NotificationBell from "./NotificationBell";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 10;
const SCORING_YEAR = 2026;

const Secretary_General_Assembly = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({}); // { membership_id: { status, remarks } }
  const [meetingDate, setMeetingDate] = useState(`${SCORING_YEAR}-03-01`);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const menuItems = [
      {
        section: "BOD",
        items: [
          { name: "Dashboard", icon: LayoutDashboard },
          { name: "Member Approvals", icon: Users },
          { name: "Loan Approvals", icon: ShieldCheck },
          { name: "Manage Loans", icon: CreditCard },
          { name: "Manage Member", icon: Users },
          { name: "Termination Inbox", icon: AlertTriangle },
          { name: "Audit Log", icon: History },
          { name: "Loan Policies", icon: FileText },
        ],
      },
      {
        section: "SECRETARY",
        items: [
          { name: "Training Attendance", icon: CalendarCheck },
          { name: "General Assembly", icon: CalendarDays },
          { name: "Membership Records", icon: Archive },
        ],
      },
    ];

   const routeMap = {
    "Dashboard": "/BOD-dashboard",
    "Member Approvals": "/member-approvals",
    "Loan Approvals": "/bod-loan-approvals",
    "Manage Loans": "/bod-manage-loans",
    "Manage Member": "/bod-manage-member",
    "Termination Inbox": "/bod-termination-inbox",
    "Audit Log": "/bod-audit-log",
    "Loan Policies": "/bod-loan-policies",
    "Training Attendance": "/Secretary_Attendance",
    "General Assembly": "/Secretary_General_Assembly",
    "Membership Records": "/Secretary_Records",
  };

  const fetchRoster = useCallback(async () => {
    setLoading(true);
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
      if (result.default_meeting_date) {
        setMeetingDate(result.default_meeting_date);
      }
    } catch (err) {
      addNotification(err?.message || "Unable to load roster.", "error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  const effectiveStatus = (row) =>
    edits[row.id]?.status !== undefined ? edits[row.id].status : row.status;
  const effectiveRemarks = (row) =>
    edits[row.id]?.remarks !== undefined ? edits[row.id].remarks : row.remarks;

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
  }, [rows, searchTerm, statusFilter, edits]);

  const totals = useMemo(() => {
    let present = 0;
    let absent = 0;
    rows.forEach((r) => {
      if (effectiveStatus(r) === "Present") present += 1;
      else absent += 1;
    });
    return { present, absent, total: rows.length };
  }, [rows, edits]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => setPage(1), [searchTerm, statusFilter]);

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

  const handleSignOut = async (event) => {
    event.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error(err);
    }
  };

  const dirtyCount = Object.keys(edits).length;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity
              className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold"
              fallbackPortal="Secretary Portal"
              fallbackRole="Secretary"
            />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((sectionGroup) => (
            <div key={sectionGroup.section} className="mb-4 flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">
                {sectionGroup.section}
              </p>
              {sectionGroup.items.map((item) => {
                const Icon = item.icon;
                const to =
                  routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, "-")}`;
                return (
                  <NavLink
                    key={item.name}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 p-2 rounded-md transition-colors ${
                        isActive
                          ? "bg-green-50 text-green-700 font-semibold"
                          : "text-gray-700 hover:bg-green-50 hover:text-green-700"
                      }`
                    }
                  >
                    <Icon size={20} />
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 z-10">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 pl-9 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Search..."
            />
          </div>
          <NotificationBell />
          <PortalTopbarIdentity
            className="ml-4 text-sm font-medium text-gray-700"
            fallbackRole="Secretary"
          />
        </header>

        <main className="p-6 overflow-auto">
          {/* Title */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">General Assembly Attendance</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Record member attendance for the {SCORING_YEAR} General Assembly. Used as MIGS scoring input.
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-600 font-medium">
              {totals.total} members • {totals.present} present
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">Total Members</p>
                <Users className="w-4 h-4 text-gray-500" />
              </div>
              <p className="text-xl font-bold text-gray-900 mt-1.5">{totals.total}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">Marked Present</p>
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-xl font-bold text-green-700 mt-1.5">{totals.present}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">Marked Absent</p>
                <AlertCircle className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-xl font-bold text-gray-900 mt-1.5">{totals.absent}</p>
            </div>
          </div>

          {/* Toolbar */}
          <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] md:max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or membership ID"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full bg-gray-50 border border-gray-300 rounded-md pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>

            {["All", "Present", "Absent"].map((opt) => (
              <button
                key={opt}
                onClick={() => setStatusFilter(opt)}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold ${
                  statusFilter === opt
                    ? opt === "Present"
                      ? "bg-green-100 text-green-800"
                      : opt === "Absent"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-gray-200 text-gray-800"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {opt}
              </button>
            ))}

            <label className="ml-auto flex items-center gap-2 text-xs text-gray-700">
              <CalendarDays size={14} className="text-gray-500" />
              GA Date
              <input
                type="date"
                value={meetingDate}
                onChange={(event) => setMeetingDate(event.target.value)}
                min={`${SCORING_YEAR}-01-01`}
                max={`${SCORING_YEAR}-12-31`}
                className="bg-gray-50 border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </label>

            <button
              onClick={handleSave}
              disabled={saving || dirtyCount === 0}
              className="px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={13} />
              {saving ? "Saving..." : `Save${dirtyCount ? ` (${dirtyCount})` : ""}`}
            </button>
          </div>

          {/* Table */}
          <div className="border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#66B538] text-white uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Member ID</th>
                    <th className="px-3 py-2.5 font-semibold">Member Name</th>
                    <th className="px-3 py-2.5 font-semibold">Attendance</th>
                    <th className="px-3 py-2.5 font-semibold">Remarks</th>
                    <th className="px-3 py-2.5 font-semibold">Last Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                        <Clock className="inline w-4 h-4 mr-1" />
                        Loading members...
                      </td>
                    </tr>
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <AlertCircle size={24} className="text-gray-300" />
                          <p className="text-xs text-gray-500">No members match your filters.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginated.map((row) => {
                      const status = effectiveStatus(row);
                      const isDirty = edits[row.id] !== undefined;
                      return (
                        <tr
                          key={row.id}
                          className={`hover:bg-gray-50 transition-colors ${isDirty ? "bg-amber-50/40" : ""}`}
                        >
                          <td className="px-3 py-2 font-mono text-gray-700">
                            {row.membership_id || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-900 font-medium">{row.full_name}</td>
                          <td className="px-3 py-2">
                            <select
                              value={status}
                              onChange={(event) =>
                                setRowField(row.id, "status", event.target.value)
                              }
                              className={`text-[11px] font-semibold rounded-md border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500 ${
                                status === "Present"
                                  ? "bg-green-50 text-green-800 border-green-300"
                                  : "bg-amber-50 text-amber-800 border-amber-300"
                              }`}
                            >
                              <option value="Absent">Absent</option>
                              <option value="Present">Present</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={effectiveRemarks(row) || ""}
                              onChange={(event) =>
                                setRowField(row.id, "remarks", event.target.value)
                              }
                              placeholder="Optional remarks"
                              className="w-full bg-gray-50 border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-[11px]">
                            {row.recorded_at
                              ? new Date(row.recorded_at).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "2-digit",
                                })
                              : "—"}
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
        </main>
      </div>
    </div>
  );
};

const Pagination = ({ page, totalPages, onChange }) => (
  <div className="flex items-center justify-center p-4 gap-1.5 border-t border-gray-100">
    <button
      className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={page <= 1}
      onClick={() => onChange(Math.max(page - 1, 1))}
    >
      <ChevronLeft className="w-3.5 h-3.5" />
    </button>

    {(() => {
      const groupStart = Math.floor((page - 1) / 5) * 5 + 1;
      const groupEnd = Math.min(groupStart + 4, totalPages);
      return Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`w-7 h-7 flex items-center justify-center rounded-full border text-[11px] font-semibold transition-colors ${
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
      className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={page >= totalPages}
      onClick={() => onChange(Math.min(page + 1, totalPages))}
    >
      <ChevronRight className="w-3.5 h-3.5" />
    </button>
  </div>
);

export default Secretary_General_Assembly;
