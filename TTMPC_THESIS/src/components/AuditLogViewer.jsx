import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 25;

export const ENTITY_LABELS = {
  loan: "Loan",
  member: "Member",
  account: "Account",
  termination: "Termination",
  application: "Application",
  policy: "Policy",
};

export const ACTION_STYLES = {
  create:      "bg-blue-100 text-blue-700",
  update:      "bg-gray-100 text-gray-600",
  approve:     "bg-green-100 text-green-700",
  reject:      "bg-red-100 text-red-700",
  recommend:   "bg-amber-100 text-amber-700",
  deactivate:  "bg-orange-100 text-orange-700",
  reactivate:  "bg-green-100 text-green-700",
  terminate:   "bg-red-100 text-red-700",
  disburse:    "bg-purple-100 text-purple-700",
  change_role: "bg-indigo-100 text-indigo-700",
  revise:      "bg-yellow-100 text-yellow-700",
};

export const formatAuditTimestamp = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short", day: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

export const describeAuditContext = (row) => {
  const ctx = row.context || {};
  switch (row.entity_type) {
    case "loan":
      return ctx.control_number || row.entity_id;
    case "account":
      return ctx.membership_id || ctx.email || row.entity_id;
    case "termination":
      return ctx.member_id
        ? `${ctx.member_id}${ctx.resolution_no ? ` • ${ctx.resolution_no}` : ""}`
        : row.entity_id;
    case "application":
      return ctx.membership_id
        ? `${ctx.membership_id} • ${[ctx.first_name, ctx.last_name].filter(Boolean).join(" ")}`
        : row.entity_id;
    default:
      return row.entity_id;
  }
};

const formatVal = (v) => {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "object") return "{…}";
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v);
  return s.length > 40 ? s.slice(0, 37) + "…" : s;
};

export const describeAuditChange = (row) => {
  const before = row.before || {};
  const after = row.after || {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  if (keys.length === 0) return "—";
  return keys.map((k) => {
    const b = before[k]; const a = after[k];
    if (b === undefined) return `${k}: → ${formatVal(a)}`;
    if (a === undefined) return `${k}: ${formatVal(b)} →`;
    return `${k}: ${formatVal(b)} → ${formatVal(a)}`;
  }).join(" • ");
};

/**
 * Filterable, paginated audit log viewer.
 * Visibility is enforced by RLS — BOD sees all, staff see only their own rows.
 *
 * Props:
 *   showActorRoleFilter — when false, hides the Actor Role filter (irrelevant for staff
 *                         who only see their own rows). Default: true.
 *   onError — optional callback receiving a string error message.
 */
const AuditLogViewer = ({ showActorRoleFilter = true, onError }) => {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    entity_type: "",
    actor_role: "",
    action: "",
    search: "",
    from: "",
    to: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("audit_log")
        .select("*", { count: "exact" })
        .order("occurred_at", { ascending: false });

      if (filters.entity_type) q = q.eq("entity_type", filters.entity_type);
      if (filters.actor_role)  q = q.eq("actor_role", filters.actor_role.toLowerCase());
      if (filters.action)      q = q.eq("action", filters.action);
      if (filters.from)        q = q.gte("occurred_at", filters.from);
      if (filters.to)          q = q.lte("occurred_at", `${filters.to}T23:59:59`);
      if (filters.search.trim()) {
        const s = filters.search.trim();
        q = q.or(`entity_id.ilike.%${s}%,actor_email.ilike.%${s}%`);
      }

      const start = (page - 1) * PAGE_SIZE;
      q = q.range(start, start + PAGE_SIZE - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      setRows(data || []);
      setTotal(count || 0);
    } catch (err) {
      const msg = err?.message || "Failed to load audit log.";
      if (onError) onError(msg);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleApply = (e) => {
    e?.preventDefault?.();
    setPage(1);
    load();
  };

  const handleReset = () => {
    setFilters({ entity_type: "", actor_role: "", action: "", search: "", from: "", to: "" });
    setPage(1);
    setTimeout(load, 0);
  };

  return (
    <>
      {/* Filters */}
      <form
        onSubmit={handleApply}
        className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6 grid grid-cols-1 md:grid-cols-3 ${showActorRoleFilter ? "lg:grid-cols-6" : "lg:grid-cols-5"} gap-3`}
      >
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Entity</label>
          <select
            value={filters.entity_type}
            onChange={(e) => setFilters((f) => ({ ...f, entity_type: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {showActorRoleFilter ? (
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Actor Role</label>
            <select
              value={filters.actor_role}
              onChange={(e) => setFilters((f) => ({ ...f, actor_role: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All</option>
              <option value="bod">BOD</option>
              <option value="bookkeeper">Bookkeeper</option>
              <option value="manager">Manager</option>
              <option value="treasurer">Treasurer</option>
              <option value="cashier">Cashier</option>
              <option value="secretary">Secretary</option>
              <option value="service_role">System</option>
            </select>
          </div>
        ) : null}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Action</label>
          <select
            value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All</option>
            {Object.keys(ACTION_STYLES).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">From</label>
          <input type="date" value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"/>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">To</label>
          <input type="date" value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"/>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input type="text" value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-full border border-gray-300 rounded-md pl-9 pr-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Loan ID, email…" />
          </div>
        </div>
        <div className="col-span-full flex justify-end gap-2">
          <button type="button" onClick={handleReset}
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 text-sm font-bold hover:bg-gray-50">
            Reset
          </button>
          <button type="submit"
            className="px-5 py-2 rounded-md bg-[#1D6021] text-white text-sm font-bold hover:bg-[#154718]">
            Apply
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-green-700 text-white uppercase text-[10px] tracking-wider font-extrabold">
              <th className="p-4">When</th>
              <th className="p-4">Actor</th>
              <th className="p-4">Role</th>
              <th className="p-4">Entity</th>
              <th className="p-4">Action</th>
              <th className="p-4">Target</th>
              <th className="p-4">Change</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">No audit entries match these filters.</td></tr>
            ) : rows.map((r) => {
              const actionClass = ACTION_STYLES[r.action] || "bg-gray-100 text-gray-600";
              return (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-green-50/40 transition-colors">
                  <td className="p-4 text-xs text-gray-500 whitespace-nowrap">{formatAuditTimestamp(r.occurred_at)}</td>
                  <td className="p-4 text-sm text-gray-700">{r.actor_email || "—"}</td>
                  <td className="p-4 text-xs">
                    <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-bold uppercase">{r.actor_role || "—"}</span>
                  </td>
                  <td className="p-4 text-sm text-gray-700">{ENTITY_LABELS[r.entity_type] || r.entity_type}</td>
                  <td className="p-4 text-xs">
                    <span className={`px-2.5 py-1 rounded-md font-bold tracking-wider uppercase ${actionClass}`}>
                      {r.action}
                    </span>
                  </td>
                  <td className="p-4 text-sm font-mono text-gray-700">{describeAuditContext(r)}</td>
                  <td className="p-4 text-xs text-gray-600 max-w-md">{describeAuditChange(r)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex items-center justify-between p-4 border-t border-gray-100 text-xs text-gray-500">
          <span>{total.toLocaleString()} entries</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 font-bold text-gray-700">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AuditLogViewer;
