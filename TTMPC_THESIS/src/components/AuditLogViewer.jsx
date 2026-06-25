import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  ClipboardList,
  Receipt,
  UserPlus,
} from "lucide-react";

const PAGE_SIZE = 10;

// Map our audit_log.entity_type onto the existing Audit Trail design's "Module"
// column, with the same colors as the original mockup.
const MODULE_BY_ENTITY = {
  loan:        { label: "Loans",       className: "bg-green-50 text-green-600"   },
  application: { label: "Members",     className: "bg-purple-50 text-purple-600" },
  member:      { label: "Members",     className: "bg-purple-50 text-purple-600" },
  account:     { label: "Accounts",    className: "bg-blue-50 text-blue-600"     },
  termination: { label: "Members",     className: "bg-purple-50 text-purple-600" },
  policy:      { label: "Accounting",  className: "bg-orange-50 text-orange-600" },
};

// Human-readable action labels keyed by audit_log.action.
const ACTION_LABEL = {
  create:      "Record Created",
  update:      "Record Updated",
  approve:     "Approved",
  reject:      "Rejected",
  recommend:   "Recommended for Approval",
  deactivate:  "Account Deactivated",
  reactivate:  "Account Reactivated",
  terminate:   "Termination Filed",
  disburse:    "Loan Disbursed",
  change_role: "Role Changed",
  revise:      "Returned for Revision",
};

// Which actions should be flagged red in the Status column.
const FLAGGED_ACTIONS = new Set([
  "reject",
  "terminate",
  "deactivate",
  "revise",
]);

// Friendly Log ID — "LOG-<id>" zero-padded to 4 digits for readability.
const formatLogId = (id) => `LOG-${String(id).padStart(4, "0")}`;

export const formatAuditTimestamp = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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

const formatRole = (r) => {
  if (!r) return "—";
  const lower = String(r).toLowerCase();
  if (lower === "bod") return "BOD";
  if (lower === "service_role") return "System";
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

/**
 * Audit Log viewer matching the original Audit Trail mockup design.
 *
 * Props:
 *   showActorRoleFilter — when false, the Role filter is hidden (irrelevant for
 *                         staff who only see their own rows by RLS). Default: true.
 *   onError             — optional callback receiving a string error message.
 */
const AuditLogViewer = ({ showActorRoleFilter = true, onError }) => {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  // KPI counts pulled across the whole filter-set, not just current page.
  const [kpis, setKpis] = useState({
    activitiesToday: 0,
    paymentsDeposits: 0,
    profilesCreated: 0,
    reportsGenerated: 0,
  });

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({
    module: "",      // mapped to entity_type on apply
    role: "",        // actor_role
    action: "",      // audit_log.action
    from: "",
    to: "",
    search: "",
  });
  const [showModuleMenu, setShowModuleMenu] = useState(false);
  const [showDateMenu, setShowDateMenu] = useState(false);

  const applyQueryFilters = (q) => {
    if (filters.module)  q = q.eq("entity_type", filters.module);
    if (filters.role)    q = q.eq("actor_role", filters.role.toLowerCase());
    if (filters.action)  q = q.eq("action", filters.action);
    if (filters.from)    q = q.gte("occurred_at", filters.from);
    if (filters.to)      q = q.lte("occurred_at", `${filters.to}T23:59:59`);
    if (filters.search.trim()) {
      const s = filters.search.trim();
      q = q.or(`entity_id.ilike.%${s}%,actor_email.ilike.%${s}%`);
    }
    return q;
  };

  const loadRows = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("audit_log")
        .select("*", { count: "exact" })
        .order("occurred_at", { ascending: false });
      q = applyQueryFilters(q);

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

  const loadKpis = async () => {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const isoToday = startOfDay.toISOString();

      const todayCountRes = await supabase
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .gte("occurred_at", isoToday);

      const disburseCountRes = await supabase
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("action", "disburse");

      const createdProfilesRes = await supabase
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "application")
        .eq("action", "approve");

      const policyEventsRes = await supabase
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "policy");

      setKpis({
        activitiesToday: todayCountRes?.count || 0,
        paymentsDeposits: disburseCountRes?.count || 0,
        profilesCreated: createdProfilesRes?.count || 0,
        reportsGenerated: policyEventsRes?.count || 0,
      });
    } catch {
      // KPIs are best-effort; failures shouldn't break the page.
    }
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    loadKpis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e) => {
    e?.preventDefault?.();
    setFilters((f) => ({ ...f, search: searchInput }));
    setPage(1);
    setTimeout(loadRows, 0);
  };

  const setModule = (value) => {
    setFilters((f) => ({ ...f, module: value }));
    setShowModuleMenu(false);
    setPage(1);
    setTimeout(loadRows, 0);
  };

  const setDateRange = (key) => {
    const today = new Date();
    let from = "";
    let to = today.toISOString().slice(0, 10);
    if (key === "today") {
      from = to;
    } else if (key === "week") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      from = d.toISOString().slice(0, 10);
    } else if (key === "month") {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      from = d.toISOString().slice(0, 10);
    } else if (key === "all") {
      from = "";
      to = "";
    }
    setFilters((f) => ({ ...f, from, to }));
    setShowDateMenu(false);
    setPage(1);
    setTimeout(loadRows, 0);
  };

  const exportCsv = async () => {
    // Fetch up to 5000 rows for export with current filters.
    let q = supabase.from("audit_log").select("*").order("occurred_at", { ascending: false }).limit(5000);
    q = applyQueryFilters(q);
    const { data, error } = await q;
    if (error) {
      if (onError) onError(error.message || "Export failed.");
      return;
    }
    const header = ["Log ID", "Date & Time", "User", "Role", "Module", "Action Type", "Record", "Status"];
    const lines = [header.join(",")];
    (data || []).forEach((r) => {
      const moduleInfo = MODULE_BY_ENTITY[r.entity_type] || { label: r.entity_type };
      const status = FLAGGED_ACTIONS.has(r.action) ? "Flagged" : "Success";
      const cells = [
        formatLogId(r.id),
        formatAuditTimestamp(r.occurred_at),
        r.actor_email || "—",
        formatRole(r.actor_role),
        moduleInfo.label,
        ACTION_LABEL[r.action] || r.action,
        describeAuditContext(r),
        status,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageNumbers = useMemo(() => {
    const groupStart = Math.floor((page - 1) / 5) * 5 + 1;
    const groupEnd = Math.min(groupStart + 4, totalPages);
    return Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i);
  }, [page, totalPages]);

  const kpiData = [
    { title: "Activities Today",   value: kpis.activitiesToday,  badge: "Live",    badgeType: "success", icon: ClipboardList,  iconColor: "text-blue-600",   iconBg: "bg-blue-50" },
    { title: "Loan Disbursements", value: kpis.paymentsDeposits, badge: "All",     badgeType: "success", icon: Receipt,        iconColor: "text-green-600",  iconBg: "bg-green-50" },
    { title: "Profiles Approved",  value: kpis.profilesCreated,  badge: "New",     badgeType: "info",    icon: UserPlus,       iconColor: "text-purple-600", iconBg: "bg-purple-50" },
    { title: "Policy Events",      value: kpis.reportsGenerated, badge: "Total",   badgeType: "info",    icon: FileSpreadsheet,iconColor: "text-orange-600", iconBg: "bg-orange-50" },
  ];

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {kpiData.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div key={idx} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.iconBg} ${kpi.iconColor}`}>
                  <Icon size={20} />
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                  kpi.badgeType === "success" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"
                }`}>
                  {kpi.badge}
                </span>
              </div>
              <p className="text-xs font-medium text-gray-500 mb-1">{kpi.title}</p>
              <h3 className="text-2xl font-black text-gray-900">{kpi.value.toLocaleString()}</h3>
            </div>
          );
        })}
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-4 justify-between items-center bg-white rounded-t-xl">
          <form onSubmit={handleSearch} className="flex gap-4 items-center flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search my logs..."
                className="bg-gray-50 w-64 h-10 rounded-lg border border-gray-200 px-4 pl-10 py-1 text-sm focus:outline-none focus:border-green-500 transition-colors"
              />
            </div>

            {/* Module filter */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowModuleMenu((v) => !v); setShowDateMenu(false); }}
                className="flex items-center gap-2 h-10 px-4 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {filters.module ? (MODULE_BY_ENTITY[filters.module]?.label || filters.module) : "All Modules"}
                <ChevronDown size={16} className="text-gray-400" />
              </button>
              {showModuleMenu ? (
                <div className="absolute z-20 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden text-sm">
                  <button type="button" onClick={() => setModule("")} className="w-full text-left px-4 py-2 hover:bg-gray-50">All Modules</button>
                  {Object.entries(MODULE_BY_ENTITY).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setModule(k)} className="w-full text-left px-4 py-2 hover:bg-gray-50">{v.label}</button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Date range quick-pick */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowDateMenu((v) => !v); setShowModuleMenu(false); }}
                className="flex items-center gap-2 h-10 px-4 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {filters.from || filters.to
                  ? `${filters.from || "…"} → ${filters.to || "…"}`
                  : "Date Range"}
                <ChevronDown size={16} className="text-gray-400" />
              </button>
              {showDateMenu ? (
                <div className="absolute z-20 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden text-sm">
                  <button type="button" onClick={() => setDateRange("today")}  className="w-full text-left px-4 py-2 hover:bg-gray-50">Today</button>
                  <button type="button" onClick={() => setDateRange("week")}   className="w-full text-left px-4 py-2 hover:bg-gray-50">Last 7 days</button>
                  <button type="button" onClick={() => setDateRange("month")}  className="w-full text-left px-4 py-2 hover:bg-gray-50">Last 30 days</button>
                  <button type="button" onClick={() => setDateRange("all")}    className="w-full text-left px-4 py-2 hover:bg-gray-50">All time</button>
                </div>
              ) : null}
            </div>

            {/* Role filter (BOD-only) */}
            {showActorRoleFilter ? (
              <select
                value={filters.role}
                onChange={(e) => {
                  const v = e.target.value;
                  setFilters((f) => ({ ...f, role: v }));
                  setPage(1);
                  setTimeout(loadRows, 0);
                }}
                className="h-10 px-3 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <option value="">All Roles</option>
                <option value="bod">BOD</option>
                <option value="bookkeeper">Bookkeeper</option>
                <option value="manager">Manager</option>
                <option value="treasurer">Treasurer</option>
                <option value="cashier">Cashier</option>
                <option value="secretary">Secretary</option>
                <option value="service_role">System</option>
              </select>
            ) : null}
          </form>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 h-10 px-4 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <FileDown size={16} />
              PDF
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="flex items-center gap-2 h-10 px-4 text-sm font-bold text-white bg-[#166534] hover:bg-green-800 rounded-lg transition-colors shadow-sm"
            >
              <FileSpreadsheet size={16} />
              Excel
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-green-700 text-white text-[10px] uppercase rounded-sm font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Log ID</th>
                <th className="px-6 py-4">Date &amp; Time</th>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Module</th>
                <th className="px-6 py-4">Action Type</th>
                <th className="px-6 py-4">Record</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-400">No audit entries match these filters.</td></tr>
              ) : rows.map((r) => {
                const moduleInfo = MODULE_BY_ENTITY[r.entity_type] || { label: r.entity_type, className: "bg-gray-50 text-gray-600" };
                const flagged = FLAGGED_ACTIONS.has(r.action);
                const status = flagged ? "Flagged" : "Success";
                return (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{formatLogId(r.id)}</td>
                    <td className="px-6 py-4 text-gray-500">{formatAuditTimestamp(r.occurred_at)}</td>
                    <td className="px-6 py-4 font-bold text-gray-900">{r.actor_email || "—"}</td>
                    <td className="px-6 py-4 text-gray-500">{formatRole(r.actor_role)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide ${moduleInfo.className}`}>
                        {moduleInfo.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{ACTION_LABEL[r.action] || r.action}</td>
                    <td className="px-6 py-4 text-gray-500 font-medium tracking-wide">{describeAuditContext(r)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide ${
                        flagged ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${flagged ? "bg-red-500" : "bg-green-500"}`}></div>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex justify-center items-center p-6 gap-2 border-t border-gray-100">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {pageNumbers.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              className={`w-8 h-8 flex items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                p === page
                  ? "bg-[#16A34A] text-white border-[#16A34A]"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {p}
            </button>
          ))}

          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
};

// Re-exports kept for the RecentActivityCard widget that imports them.
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

export default AuditLogViewer;
