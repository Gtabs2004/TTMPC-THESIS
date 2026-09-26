import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { StatCard, StatCardRow } from "./StatCard";
import { TableToolbar } from "./TableToolbar";
import {
  Search,
  ChevronDown,
  ClipboardList,
  Receipt,
  Loader2,
  ArrowDownCircle,
  ArrowUpCircle,
  X,
} from "lucide-react";
import Pagination from "./Pagination";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// The audit log is read through the backend rather than straight from Supabase.
// Its RLS only exposes rows where actor_user_id = auth.uid(), and portal writes
// come from the backend on the service-role key — so those rows carry a NULL
// actor and are invisible to the staff who created them. The API scopes rows by
// the caller's verified role instead.
async function auditAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token || ""}` };
}

function buildAuditQuery(filters, extra = {}) {
  const params = new URLSearchParams();
  if (filters.module) params.set("module", filters.module);
  if (filters.action) params.set("action", filters.action);
  if (filters.role) params.set("actor_role", filters.role.toLowerCase());
  if (filters.from) params.set("date_from", filters.from);
  if (filters.to) params.set("date_to", filters.to);
  if (filters.search && filters.search.trim()) params.set("search", filters.search.trim());
  for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  return params.toString();
}

const PAGE_SIZE = 5;

// Map our audit_log.entity_type onto a "Module" label/color — used in the
// View All modal's detailed table and its Module filter menu. The main table
// doesn't show this column (Date & Time / Role / Activity / Status).
const MODULE_BY_ENTITY = {
  loan:               { label: "Loans",             className: "bg-green-50 text-green-600"   },
  application:        { label: "Members",           className: "bg-purple-50 text-purple-600" },
  member:             { label: "Members",           className: "bg-purple-50 text-purple-600" },
  account:            { label: "Accounts",           className: "bg-blue-50 text-blue-600"     },
  termination:        { label: "Members",           className: "bg-purple-50 text-purple-600" },
  policy:             { label: "Accounting",         className: "bg-orange-50 text-orange-600" },
  payment:            { label: "Loan Payments",      className: "bg-teal-50 text-teal-600"     },
  disbursement:       { label: "Disbursements",      className: "bg-indigo-50 text-indigo-600" },
  cbu:                { label: "CBU / Share Capital",className: "bg-cyan-50 text-cyan-600"      },
  savings:            { label: "Savings",            className: "bg-sky-50 text-sky-600"       },
  withdrawal:         { label: "Withdrawals",        className: "bg-rose-50 text-rose-600"     },
  membership_payment: { label: "Membership Fees",    className: "bg-amber-50 text-amber-600"   },
  grocery:            { label: "Grocery",            className: "bg-lime-50 text-lime-600"     },
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
    case "payment":
    case "disbursement":
      return ctx.loan_id || row.entity_id;
    case "cbu":
      return ctx.member_id || row.entity_id;
    case "savings":
    case "withdrawal":
      return ctx.account_number || row.entity_id;
    case "membership_payment":
      return ctx.membership_id || row.entity_id;
    default:
      return row.entity_id;
  }
};

// What was acted on, in words — used by describeAuditActivity below.
const ACTIVITY_NOUN = {
  loan:               "loan",
  application:        "membership application",
  member:             "member record",
  account:            "account",
  termination:        "member termination",
  policy:             "loan policy",
  payment:            "loan payment",
  disbursement:       "loan disbursement",
  cbu:                "share capital deposit",
  savings:            "savings deposit",
  withdrawal:         "savings withdrawal",
  membership_payment: "membership fee payment",
  grocery:            "grocery transaction",
};

const ACTIVITY_VERB = {
  create:      "Created",
  update:      "Updated",
  approve:     "Approved",
  reject:      "Rejected",
  recommend:   "Recommended",
  deactivate:  "Deactivated",
  reactivate:  "Reactivated",
  terminate:   "Terminated",
  disburse:    "Disbursed",
  change_role: "Changed role of",
  revise:      "Returned for revision",
  record:      "Recorded",
  post:        "Posted",
};

const titleCase = (s) =>
  String(s ?? "")
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

const formatPeso = (n) =>
  `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The amount a row moved, from whichever field that entity's trigger writes.
const auditAmount = (row) => {
  const a = row.after || {};
  const c = row.context || {};
  const v = a.amount_paid ?? a.capital_added ?? a.GroceryAmount ?? a.loan_amount ?? a.amount ?? c.amount_paid ?? c.capital_added ?? c.amount;
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? n : null;
};

// One plain sentence of what the actor did, e.g. "Recorded loan payment of
// ₱10,000.00" or "Changed loan status: Released → Partially Paid". Built from
// the row's action + before/after snapshot, so it works for every entity type
// without a per-type table in the database.
export const describeAuditActivity = (row) => {
  const before = row.before || {};
  const after = row.after || {};
  const ctx = row.context || {};
  const noun = ctx.kind === "renewal_override"
    ? "6-month renewal override request"
    : ACTIVITY_NOUN[row.entity_type] || titleCase(row.entity_type).toLowerCase();

  if (row.action === "change_role" && (before.role || after.role)) {
    return `Changed role: ${titleCase(before.role || "—")} → ${titleCase(after.role || "—")}`;
  }

  // A status transition is the most informative thing an update can say.
  const statusKey = Object.keys(after).find(
    (k) => /status$/i.test(k) && before[k] != null && before[k] !== after[k]
  );
  if (statusKey && (row.action === "update" || row.action === "approve" || row.action === "reject" || row.action === "recommend")) {
    const transition = `${titleCase(before[statusKey])} → ${titleCase(after[statusKey])}`;
    return row.action === "update"
      ? `Changed ${noun} status: ${transition}`
      : `${ACTIVITY_VERB[row.action]} ${noun} (${transition})`;
  }

  if (row.entity_type === "policy" && row.action === "update") {
    const changed = Object.keys(after).filter((k) => before[k] !== after[k]);
    if (changed.length) {
      const scope = ctx.loan_type_code ? `${titleCase(ctx.loan_type_code)} ` : "";
      return `Updated ${scope}loan policy: ${changed.map((k) => `${titleCase(k)} ${titleCase(before[k] ?? "—")} → ${titleCase(after[k])}`).join(", ")}`;
    }
  }

  if (row.entity_type === "account" && (row.action === "deactivate" || row.action === "reactivate")) {
    return `${ACTIVITY_VERB[row.action]} member login account`;
  }

  if (row.entity_type === "termination" && after.reason) {
    return `Terminated membership — ${after.reason}`;
  }

  const verb = ACTIVITY_VERB[row.action] || titleCase(row.action);
  const amount = auditAmount(row);
  return `${verb} ${noun}${amount != null ? ` of ${formatPeso(amount)}` : ""}`;
};

const formatRole = (r) => {
  if (!r) return "—";
  const lower = String(r).toLowerCase();
  if (lower === "bod") return "BOD";
  if (lower === "service_role") return "System";
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

/**
 * Audit Log viewer — a compact Date & Time / Role / Status table on the main
 * page (matching the rest of the system's dashboard cards/toolbar via
 * StatCard/StatCardRow/TableToolbar), with a "View All" modal for the full
 * filterable, multi-column detail view.
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
  const [showViewAll, setShowViewAll] = useState(false);

  // KPI counts pulled across the whole filter-set, not just current page.
  const [kpis, setKpis] = useState({
    activitiesToday: 0,
    loanDisbursements: 0,
    profilesCreated: 0,
    loanPayments: 0,
    cashDeposits: 0,
    cashWithdrawals: 0,
    loanApplications: 0,
    membershipFees: 0,
    groceryTransactions: 0,
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

  const loadRows = async () => {
    setLoading(true);
    try {
      const qs = buildAuditQuery(filters, { page, page_size: PAGE_SIZE });
      const res = await fetch(`${API_BASE}/api/audit-log?${qs}`, {
        headers: await auditAuthHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Failed to load audit log.");
      setRows(body.rows || []);
      setTotal(body.total || 0);
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
      const res = await fetch(`${API_BASE}/api/audit-log/kpis`, {
        headers: await auditAuthHeaders(),
      });
      if (!res.ok) return;
      const body = await res.json();
      setKpis({
        activitiesToday: body.activitiesToday || 0,
        loanDisbursements: body.loanDisbursements || 0,
        profilesCreated: body.profilesCreated || 0,
        loanPayments: body.loanPayments || 0,
        cashDeposits: body.cashDeposits || 0,
        cashWithdrawals: body.cashWithdrawals || 0,
        loanApplications: body.loanApplications || 0,
        membershipFees: body.membershipFees || 0,
        groceryTransactions: body.groceryTransactions || 0,
      });
    } catch {
      /* KPIs are decorative; the table is the source of truth. */
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Trimmed to the 4 that matter most for an audit trail — actual money
  // movement — instead of every count the API can produce. Activities Today
  // and Profiles Approved were dropped (least specific to "transactions");
  // Loan Applications/Fees/Grocery were dropped as the least-central of the
  // per-type breakdown, still visible via the View All modal's Module filter.
  const overviewKpis = [
    { label: "Loan Disbursements", value: kpis.loanDisbursements, icon: Receipt,         iconColor: "text-green-600" },
    { label: "Loan Payments",      value: kpis.loanPayments,      icon: Receipt,         iconColor: "text-teal-600" },
    { label: "Cash Deposits",      value: kpis.cashDeposits,      icon: ArrowDownCircle, iconColor: "text-emerald-600" },
    { label: "Cash Withdrawals",   value: kpis.cashWithdrawals,   icon: ArrowUpCircle,   iconColor: "text-rose-600" },
  ];

  // Shared filter toolbar — lives only inside the View All modal now (item 6:
  // the main page stays minimal, this is "the place for complete audit
  // details"). Kept as its own bespoke dropdown-button design rather than
  // forced into TableToolbar's plain pills, same reasoning as before: these
  // are popover menus (Module/Date Range), not a fixed pill set.
  const filterToolbar = (
    <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-center flex-1">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search my logs..."
          className="bg-gray-50 w-56 h-10 rounded-lg border border-gray-200 px-4 pl-10 py-1 text-sm focus:outline-none focus:border-green-500 transition-colors"
        />
      </div>

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
          <div className="absolute z-20 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden text-sm max-h-72 overflow-y-auto">
            <button type="button" onClick={() => setModule("")} className="w-full text-left px-4 py-2 hover:bg-gray-50">All Modules</button>
            {Object.entries(MODULE_BY_ENTITY).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setModule(k)} className="w-full text-left px-4 py-2 hover:bg-gray-50">{v.label}</button>
            ))}
          </div>
        ) : null}
      </div>

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
  );

  // Full 7-column row, used only inside the View All modal.
  const renderDetailedRow = (r) => {
    const moduleInfo = MODULE_BY_ENTITY[r.entity_type] || { label: r.entity_type, className: "bg-gray-50 text-gray-600" };
    const flagged = FLAGGED_ACTIONS.has(r.action);
    const status = flagged ? "Flagged" : "Success";
    return (
      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
        <td className="p-4 font-medium text-gray-900">{formatLogId(r.id)}</td>
        <td className="p-4 text-gray-500">{formatAuditTimestamp(r.occurred_at)}</td>
        <td className="p-4 text-gray-500">{formatRole(r.actor_role)}</td>
        <td className="p-4">
          <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide ${moduleInfo.className}`}>
            {moduleInfo.label}
          </span>
        </td>
        <td className="p-4 text-gray-600">{describeAuditActivity(r)}</td>
        <td className="p-4 text-gray-500 font-medium tracking-wide">{describeAuditContext(r)}</td>
        <td className="p-4">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide ${
            flagged ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${flagged ? "bg-red-500" : "bg-green-500"}`}></div>
            {status}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <>
      {/* Summary cards — StatCard/StatCardRow, the same shared component every
          other dashboard in the system uses, so this page follows the same
          layout/spacing/typography/color standards instead of its own
          bespoke card markup (item 1). */}
      <StatCardRow cols={4}>
        {overviewKpis.map((kpi) => (
          <StatCard key={kpi.label} label={kpi.label} value={kpi.value.toLocaleString()} icon={kpi.icon} iconColor={kpi.iconColor} />
        ))}
      </StatCardRow>

      {/* Main Table — Date & Time / Role / Activity / Status. Activity is a
          one-line "what was done" plus the record it was done to.
          "View All" opens the full filterable, multi-column view (item 6). */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col">
        <TableToolbar
          title="Audit Trail"
          subtitle={`Showing ${rows.length} of ${total} log entries`}
        >
          <button
            type="button"
            onClick={() => setShowViewAll(true)}
            className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            View All
          </button>
        </TableToolbar>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
            <thead>
              <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                <th className="p-5 font-bold">Date &amp; Time</th>
                <th className="p-5 font-bold">Role</th>
                <th className="p-5 font-bold">Activity</th>
                <th className="p-5 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-10 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 size={24} className="text-gray-300 animate-spin" />
                      <p className="text-sm text-gray-400">Loading...</p>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-10 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ClipboardList size={32} className="text-gray-300" />
                      <p className="text-sm font-medium text-gray-500">No audit entries match these filters.</p>
                    </div>
                  </td>
                </tr>
              ) : rows.map((r) => {
                const flagged = FLAGGED_ACTIONS.has(r.action);
                const status = flagged ? "Flagged" : "Success";
                return (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="p-5 text-gray-500">{formatAuditTimestamp(r.occurred_at)}</td>
                    <td className="p-5 text-gray-500">{formatRole(r.actor_role)}</td>
                    <td className="p-5 whitespace-normal min-w-[16rem]">
                      <p className="text-gray-700">{describeAuditActivity(r)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{describeAuditContext(r)}</p>
                    </td>
                    <td className="p-5">
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

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {/* View All modal — the complete picture: full filter toolbar + every
          column (User/member, Action, Transaction type/Module, Reference ID,
          Date & Time, Role, Status), same underlying rows/filters/pagination
          as the compact table above, just more of it visible at once. No
          export buttons here either (item 4 removes them everywhere, not
          just the main view). */}
      {showViewAll && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowViewAll(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-gray-100 w-full max-w-6xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Complete Audit Trail</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Showing {rows.length} of {total} log entries
                </p>
              </div>
              <button
                onClick={() => setShowViewAll(false)}
                aria-label="Close"
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center shrink-0">
              {filterToolbar}
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold sticky top-0 z-10">
                    <th className="p-4 font-bold">Log ID</th>
                    <th className="p-4 font-bold">Date &amp; Time</th>
                    <th className="p-4 font-bold">Role</th>
                    <th className="p-4 font-bold">Transaction Type</th>
                    <th className="p-4 font-bold">Action</th>
                    <th className="p-4 font-bold">Reference / Record</th>
                    <th className="p-4 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Loader2 size={24} className="text-gray-300 animate-spin" />
                          <p className="text-sm text-gray-400">Loading...</p>
                        </div>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <ClipboardList size={32} className="text-gray-300" />
                          <p className="text-sm font-medium text-gray-500">No audit entries match these filters.</p>
                        </div>
                      </td>
                    </tr>
                  ) : rows.map(renderDetailedRow)}
                </tbody>
              </table>
            </div>

            <div className="shrink-0 border-t border-gray-100">
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          </div>
        </div>
      )}
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
