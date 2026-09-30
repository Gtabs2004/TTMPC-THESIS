import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtimeRefetch } from "../../hooks/useRealtimeRefetch";
import { RT } from "../../lib/realtimeSync";
import {
  UserCog,
  Users,
  ShieldCheck,
  UserX,
  UserPlus,
  Search,
  X as CloseIcon,
  AlertTriangle,
  KeyRound,
  Lock,
} from "lucide-react";
import StaffSidebar from "../../components/StaffSidebar";
import { bodNav } from "../../components/StaffSidebar/configs/bod";
import StaffTopbar from "../../components/StaffTopbar";
import Breadcrumb from "../../components/Breadcrumb";
import NotificationBell from "../../components/NotificationBell";
import { StatCard, StatCardRow } from "../../components/StatCard";
import { TableToolbar } from "../../components/TableToolbar";
import TableStateRow from "../../components/TableStateRow";
import TableActionButton from "../../components/TableActionButton";
import { useNotification } from "../../contex/NotificationContext";
import { useConfirm } from "../../contex/ConfirmContext";
import { supabase } from "../../supabaseClient";
import { useAccountAdmin, invalidateAccountAdmin } from "../../utils/useAccountAdmin";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Staff roles a member can be given. "member" (no staff portal) is how a
// role is removed; the member portal is unaffected either way.
const STAFF_ROLES = [
  { value: "bod", label: "BOD" },
  { value: "manager", label: "Manager" },
  { value: "bookkeeper", label: "Bookkeeper" },
  { value: "treasurer", label: "Treasurer" },
  { value: "cashier", label: "Cashier" },
  { value: "secretary", label: "Secretary" },
];
const roleLabel = (role) =>
  STAFF_ROLES.find((r) => r.value === role)?.label || (role === "member" ? "Member" : role || "—");

const peso = (n) =>
  n == null
    ? "—"
    : `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

async function api(path, { method = "GET", body } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.detail || "Request failed.");
  return payload;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-600/30";

/* --------------------------------------------------------------- modal shell */

function Modal({ title, subtitle, icon, tone = "default", onClose, children, footer, busy }) {
  const Icon = icon;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className={`rounded-lg p-2 ${tone === "danger" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-bold text-gray-800">{title}</h3>
              {subtitle ? <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p> : null}
            </div>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

const secondaryBtn =
  "rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const primaryBtn =
  "rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn =
  "rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50";

/* ------------------------------------------------------------ member search */

// Debounced name / membership-ID search. `renderNote(member)` explains why a
// result can't be picked (returns falsy when it can).
function MemberPicker({ onPick, renderNote }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const body = await api(`/api/admin/accounts/member-search?q=${encodeURIComponent(term)}`);
        if (!cancelled) setResults(body.data || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-gray-700">Find a member</label>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or membership ID (e.g. TTMPC-150)"
          className={`${inputClass} pl-9`}
        />
      </div>
      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-gray-100">
        {loading ? (
          <p className="px-3 py-3 text-sm text-gray-400">Searching…</p>
        ) : error ? (
          <p className="px-3 py-3 text-sm text-red-600">{error}</p>
        ) : query.trim().length < 2 ? (
          <p className="px-3 py-3 text-sm text-gray-400">Type at least 2 characters.</p>
        ) : results.length === 0 ? (
          <p className="px-3 py-3 text-sm text-gray-400">No active member matches.</p>
        ) : (
          results.map((m) => {
            const note = renderNote?.(m);
            return (
              <button
                key={m.membership_id}
                type="button"
                disabled={Boolean(note)}
                onClick={() => onPick(m)}
                className="flex w-full items-start justify-between gap-3 border-b border-gray-100 px-3 py-2.5 text-left last:border-0 hover:bg-green-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-semibold ${note ? "text-gray-400" : "text-gray-800"}`}>{m.name}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {m.membership_id} · {m.email || "no email"}
                  </span>
                  {note ? <span className="mt-0.5 block text-[11px] text-amber-700">{note}</span> : null}
                </span>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
                  {roleLabel(m.role)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- role assignment */

function RoleModal({ target, onClose, onSaved }) {
  const { addNotification } = useNotification();
  // target: null = pick a member first; otherwise a staff/member row to edit.
  const [member, setMember] = useState(target);
  const [role, setRole] = useState(target && target.role !== "member" ? target.role : "cashier");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const changed = member && role !== member.role;
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/accounts/role", { method: "POST", body: { membership_id: member.membership_id, role } });
      addNotification(
        role === "member"
          ? `${member.name} no longer has staff access. Their member portal is unchanged.`
          : `${member.name} can now use the ${roleLabel(role)} portal.`,
        "success"
      );
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      icon={UserPlus}
      title={target ? "Change staff role" : "Assign staff role"}
      subtitle="Staff access is added to the member's own login. They keep their member portal."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button onClick={onClose} disabled={busy} className={secondaryBtn}>Cancel</button>
          <button onClick={submit} disabled={busy || !changed} className={role === "member" ? dangerBtn : primaryBtn}>
            {busy ? "Saving…" : role === "member" ? "Remove staff access" : "Save role"}
          </button>
        </>
      }
    >
      {!member ? (
        <MemberPicker
          onPick={(m) => {
            setMember(m);
            if (m.role !== "member") setRole(m.role);
          }}
          renderNote={(m) => (m.has_login ? "" : "This member has no login yet.")}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-800">{member.name}</p>
              <p className="truncate text-xs text-gray-500">{member.membership_id} · {member.email || "no email"}</p>
              <p className="mt-1 text-[11px] text-gray-500">Current role: <span className="font-semibold">{roleLabel(member.role)}</span></p>
            </div>
            {!target ? (
              <button onClick={() => setMember(null)} disabled={busy} className="text-xs font-semibold text-green-700 hover:underline">
                Change
              </button>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-gray-700">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass} disabled={busy}>
              {STAFF_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
              {member.role !== "member" ? <option value="member">Member (remove staff access)</option> : null}
            </select>
          </div>

          {changed ? (
            <p className={`rounded-lg px-3 py-2 text-xs ${role === "member" ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
              {role === "member"
                ? <>{member.name} will lose the {roleLabel(member.role)} portal. They can still use the member portal with the same login.</>
                : <>{member.name} will get the <b>{roleLabel(role)}</b> portal. They sign in with <b>{member.email || "their member email"}</b> — the same login as their member portal.</>}
            </p>
          ) : null}

          {changed && role !== "member" && member.needs_setup ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This member still has a temporary email. On their first staff sign-in they'll be asked to set a real email and a new password.
            </p>
          ) : null}

          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p> : null}
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------- terminate */

function TerminateModal({ onClose, onDone }) {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [member, setMember] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [form, setForm] = useState({ reason: "", effective_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = async (m) => {
    setMember(m);
    setPreview(null);
    setError("");
    setLoadingPreview(true);
    try {
      const body = await api(`/api/admin/accounts/terminate-preview/${encodeURIComponent(m.membership_id)}`);
      setPreview(body.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  // CBU < loans owed: the member can't leave yet (coop rule) and picks one of
  // two options -- stay, or use their CBU now and leave once the rest is paid.
  const hasShortfall = (preview?.shortfall || 0) > 0;
  const [option, setOption] = useState("");
  const canSubmit = preview && form.reason.trim() && (!hasShortfall || option) && !busy;

  const confirmCopy = !hasShortfall
    ? {
        title: "Terminate membership",
        message: `Terminate ${member?.name} (${member?.membership_id})? ${
          (preview?.applied_to_loans || 0) > 0 ? `${peso(preview?.applied_to_loans)} of their CBU pays off their loans now. ` : ""
        }Their login is locked immediately and this can't be undone — a returning member re-applies from scratch.`,
        confirmLabel: "Terminate",
      }
    : option === "stay"
      ? {
          title: "Member stays",
          message: `${member?.name} stays a member and keeps paying their loans normally. Nothing changes; the request is kept in the history.`,
          confirmLabel: "Record choice",
        }
      : {
          title: "Use CBU now, leave when paid",
          message: `All of ${member?.name}'s CBU (${peso(preview?.total_cbu)}) is applied to their loans now. They still owe ${peso(preview?.shortfall)}, can't take new loans, and are terminated automatically once that reaches ₱0.`,
          confirmLabel: "Apply CBU",
        };

  const submit = async () => {
    const ok = await confirm({ ...confirmCopy, tone: option === "stay" ? "default" : "destructive" });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const body = await api("/api/admin/accounts/terminate", {
        method: "POST",
        body: {
          membership_id: member.membership_id,
          ...form,
          notes: form.notes || null,
          option: hasShortfall ? option : null,
        },
      });
      const messages = {
        stayed: `${member.name} stays a member. The choice was recorded.`,
        exiting: `${member.name}'s CBU was applied to their loans. They leave once the remaining ${peso(body.remaining_loans)} is paid.`,
        closed: `${member.name} terminated and closed — nothing left to pay out. Resolution ${body.resolution_no}.`,
        terminated: `${member.name} terminated. Resolution ${body.resolution_no}. The Cashier will pay out their CBU.`,
      };
      addNotification(messages[body.outcome] || `${member.name} updated.`, "success");
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      icon={UserX}
      tone="danger"
      title="Terminate member"
      subtitle="Locks all access and saves their CBU for the Cashier's payout. The Secretary and Cashier are notified."
      onClose={onClose}
      busy={busy}
      footer={
        member ? (
          <>
            <button onClick={onClose} disabled={busy} className={secondaryBtn}>Cancel</button>
            <button onClick={submit} disabled={!canSubmit} className={option === "stay" ? primaryBtn : dangerBtn}>
              {busy ? "Saving…" : !hasShortfall ? "Terminate member" : option === "stay" ? "Record: member stays" : "Apply CBU to loans"}
            </button>
          </>
        ) : null
      }
    >
      {!member ? (
        <MemberPicker onPick={pick} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-800">{member.name}</p>
              <p className="truncate text-xs text-gray-500">{member.membership_id} · {roleLabel(member.role)}</p>
            </div>
            <button onClick={() => { setMember(null); setPreview(null); setError(""); setOption(""); }} disabled={busy} className="text-xs font-semibold text-green-700 hover:underline">
              Change
            </button>
          </div>

          {loadingPreview ? (
            <p className="text-sm text-gray-400">Checking CBU and loans…</p>
          ) : preview ? (
            <div className="rounded-lg border border-gray-200">
              <p className="border-b border-gray-100 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">Settlement</p>
              <dl className="space-y-1.5 px-4 py-3 text-sm">
                <div className="flex justify-between"><dt className="text-gray-600">Total CBU</dt><dd className="font-semibold text-gray-900">{peso(preview.total_cbu)}</dd></div>
                {preview.deductions.map((d) => (
                  <div key={d.control_number} className="flex justify-between gap-3 text-gray-600">
                    <dt>{d.loan_type} loan {d.control_number} <span className="text-[11px]">(owes {peso(d.owed)} incl. {peso(d.accrued_penalty)} penalty)</span></dt>
                    <dd className="shrink-0 text-red-700">− {peso(d.applied)}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-gray-100 pt-1.5">
                  <dt className="font-semibold text-gray-800">Member receives</dt>
                  <dd className="font-bold text-green-700">{peso(preview.refundable)}</dd>
                </div>
                {hasShortfall ? (
                  <div className="flex justify-between">
                    <dt className="font-semibold text-red-700">Loans still owed after CBU</dt>
                    <dd className="font-bold text-red-700">{peso(preview.shortfall)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}

          {hasShortfall ? (
            <div className="space-y-2">
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {member.name}&apos;s CBU doesn&apos;t cover their loans, so they <b>can&apos;t leave the cooperative</b> until
                  the balance is settled. Record what they chose:
                </p>
              </div>
              {[
                { value: "stay", title: "Stay as a member", text: "Nothing changes. They keep their membership and keep paying their loans normally." },
                { value: "exit_when_paid", title: "Use CBU now, leave when paid", text: `All ${peso(preview.total_cbu)} of CBU is applied to the loans now. They pay the remaining ${peso(preview.shortfall)}, can't take new loans, and are terminated automatically at ₱0.` },
              ].map((o) => (
                <label key={o.value} className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 ${option === o.value ? "border-green-600 bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}>
                  <input type="radio" name="termination-option" value={o.value} checked={option === o.value} onChange={() => setOption(o.value)} disabled={busy} className="mt-1 accent-green-600" />
                  <span>
                    <span className="block text-sm font-semibold text-gray-800">{o.title}</span>
                    <span className="block text-xs text-gray-600">{o.text}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          {preview ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-700">Reason <span className="text-red-500">*</span></label>
                <textarea rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className={inputClass} placeholder="e.g. Did not renew membership" disabled={busy} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-700">Effective date</label>
                <input type="date" value={form.effective_date} onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))} className={inputClass} disabled={busy} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-700">Notes</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputClass} disabled={busy} />
              </div>
              <p className="text-[11px] text-gray-500">
                {hasShortfall && option === "exit_when_paid"
                  ? "The resolution number is generated when their balance reaches ₱0."
                  : "The resolution number is generated automatically."}
              </p>
            </>
          ) : null}

          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p> : null}
        </div>
      )}
    </Modal>
  );
}

const STATUS_BADGE = {
  exiting: "bg-amber-50 text-amber-800",
  terminated: "bg-red-50 text-red-700",
  closed: "bg-gray-100 text-gray-700",
};

/* --------------------------------------------------------------------- page */

const Account_Management = () => {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const isAdmin = useAccountAdmin();
  const [staff, setStaff] = useState([]);
  const [terminated, setTerminated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleModal, setRoleModal] = useState(null); // null | { target }
  const [showTerminate, setShowTerminate] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [staffBody, termBody] = await Promise.all([
        api("/api/admin/accounts/staff"),
        api("/api/admin/accounts/terminated"),
      ]);
      setStaff(staffBody.data || []);
      setTerminated(termBody.data || []);
    } catch (err) {
      if (silent) return;
      addNotification(err.message || "Failed to load accounts.", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addNotification]);
  useRealtimeRefetch([...RT.MEMBERS, ...RT.CBU, ...RT.LOANS], () => load({ silent: true }));

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // Part C: a Closed member's login is removed from Supabase Auth. If that
  // failed, it can be retried from here (the login stays blocked meanwhile).
  const [retrying, setRetrying] = useState("");
  const retryLoginRemoval = async (row) => {
    setRetrying(row.membership_id);
    try {
      await api(`/api/admin/accounts/closures/${encodeURIComponent(row.membership_id)}/retry`, { method: "POST" });
      addNotification(`${row.name}'s login was removed. Their email is free to use again.`, "success");
      load();
    } catch (err) {
      addNotification(err.message, "error");
    } finally {
      setRetrying("");
    }
  };

  const toggleAdmin = async (row) => {
    const enabling = !row.can_manage_accounts;
    const ok = await confirm({
      title: enabling ? "Give account access" : "Remove account access",
      message: enabling
        ? `${row.name} will be able to open Account Management: assign staff roles, give or remove this access, and terminate members.`
        : `${row.name} will no longer be able to open Account Management. They keep their BOD role.`,
      confirmLabel: enabling ? "Give access" : "Remove access",
      tone: enabling ? "default" : "destructive",
    });
    if (!ok) return;
    try {
      await api("/api/admin/accounts/admin-flag", {
        method: "POST",
        body: { membership_id: row.membership_id, enabled: enabling },
      });
      invalidateAccountAdmin();
      addNotification(enabling ? `${row.name} can now manage accounts.` : `${row.name}'s account access was removed.`, "success");
      load();
    } catch (err) {
      addNotification(err.message, "error");
    }
  };

  const roleCounts = useMemo(() => {
    const counts = {};
    staff.forEach((s) => { counts[s.role] = (counts[s.role] || 0) + 1; });
    return counts;
  }, [staff]);
  const shownStaff = roleFilter === "all" ? staff : staff.filter((s) => s.role === roleFilter);
  const tabs = [
    { value: "all", label: "All", count: staff.length },
    ...STAFF_ROLES.filter((r) => roleCounts[r.value]).map((r) => ({ value: r.value, label: r.label, count: roleCounts[r.value] })),
  ];

  return (
    <div className="flex min-h-screen bg-gray-100">
      <StaffSidebar portal="BOD" items={bodNav} />

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <StaffTopbar portal="BOD" notifications={<NotificationBell />} />

        <main className="animate-page-in flex-1 overflow-y-auto p-8">
          <Breadcrumb portal="BOD" page="Account Management" />

          {isAdmin === null ? (
            <p className="mt-6 text-sm text-gray-400">Loading…</p>
          ) : isAdmin === false ? (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-6">
              <Lock className="h-5 w-5 shrink-0 text-gray-400" />
              <div>
                <p className="font-bold text-gray-800">Account Management is restricted</p>
                <p className="mt-1 text-sm text-gray-600">Only the BOD member designated as account administrator can manage staff roles and terminations.</p>
              </div>
            </div>
          ) : (
            <>
              <StatCardRow cols={4}>
                <StatCard label="Staff accounts" value={staff.length} icon={Users} iconColor="text-green-600" loading={loading} />
                <StatCard label="BOD members" value={roleCounts.bod || 0} icon={ShieldCheck} iconColor="text-blue-600" loading={loading} />
                <StatCard label="Account administrators" value={staff.filter((s) => s.can_manage_accounts).length} icon={KeyRound} iconColor="text-amber-600" loading={loading} />
                <StatCard label="Terminated members" value={terminated.length} icon={UserX} iconColor="text-red-600" loading={loading} />
              </StatCardRow>

              {/* Staff accounts */}
              <div className="mt-6 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                <TableToolbar
                  title="Staff Accounts"
                  subtitle={`${shownStaff.length} of ${staff.length} staff · a staff role is added to the member's own login`}
                  tabs={tabs}
                  activeTab={roleFilter}
                  onTabChange={setRoleFilter}
                >
                  <button
                    type="button"
                    onClick={() => setRoleModal({ target: null })}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-[11px] font-bold text-white hover:bg-green-700"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Assign Staff Role
                  </button>
                </TableToolbar>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="bg-primary-deep text-[10px] font-extrabold uppercase tracking-wider text-white">
                        <th className="p-5 font-bold">Member</th>
                        <th className="p-5 font-bold">Login Email</th>
                        <th className="p-5 font-bold">Role</th>
                        <th className="p-5 font-bold">Account Access</th>
                        <th className="p-5 font-bold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <TableStateRow colSpan={5} variant="loading" label="Loading…" />
                      ) : shownStaff.length === 0 ? (
                        <TableStateRow colSpan={5} variant="empty" icon={Users} label="No staff accounts." />
                      ) : (
                        shownStaff.map((row) => (
                          <tr key={row.membership_id} className="border-b border-gray-100 transition-colors hover:bg-gray-50/50">
                            <td className="p-5">
                              <p className="font-semibold text-gray-800">{row.name}{row.is_you ? <span className="ml-1.5 text-[10px] font-bold uppercase text-green-700">You</span> : null}</p>
                              <p className="text-xs text-gray-500">{row.membership_id}</p>
                            </td>
                            <td className="p-5">
                              <p className="text-gray-700">{row.email || "—"}</p>
                              {row.needs_setup ? <p className="text-[11px] text-amber-700">Temporary email — setup required on first sign-in</p> : null}
                              {!row.is_active ? <p className="text-[11px] text-red-600">Login locked</p> : null}
                            </td>
                            <td className="p-5">
                              <span className="rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-bold text-green-700">{roleLabel(row.role)}</span>
                            </td>
                            <td className="p-5">
                              {row.role === "bod" ? (
                                <button
                                  type="button"
                                  onClick={() => toggleAdmin(row)}
                                  disabled={row.is_you && row.can_manage_accounts}
                                  title={row.is_you && row.can_manage_accounts ? "You can't remove your own access" : undefined}
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors disabled:cursor-not-allowed ${
                                    row.can_manage_accounts
                                      ? "bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:hover:bg-amber-50"
                                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                  }`}
                                >
                                  <KeyRound className="h-3 w-3" />
                                  {row.can_manage_accounts ? "Can manage accounts" : "Give access"}
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="p-5">
                              <TableActionButton
                                variant="neutral"
                                icon={UserCog}
                                disabled={row.is_you}
                                title={row.is_you ? "You can't change your own role" : undefined}
                                onClick={() => setRoleModal({ target: row })}
                              >
                                Change Role
                              </TableActionButton>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Terminated members */}
              <div className="mt-6 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                <TableToolbar title="Leaving & Terminated Members" subtitle={`${terminated.length} members · CBU is paid out by the Cashier`}>
                  <button
                    type="button"
                    onClick={() => setShowTerminate(true)}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-[11px] font-bold text-white hover:bg-red-700"
                  >
                    <UserX className="h-3.5 w-3.5" /> Terminate Member
                  </button>
                </TableToolbar>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="bg-primary-deep text-[10px] font-extrabold uppercase tracking-wider text-white">
                        <th className="p-5 font-bold">Member</th>
                        <th className="p-5 font-bold">Status</th>
                        <th className="p-5 font-bold">Resolution No.</th>
                        <th className="p-5 font-bold">Reason</th>
                        <th className="p-5 font-bold text-right">CBU</th>
                        <th className="p-5 font-bold text-right">To Loans</th>
                        <th className="p-5 font-bold text-right">Paid Out</th>
                        <th className="p-5 font-bold text-right">Still Owed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <TableStateRow colSpan={8} variant="loading" label="Loading…" />
                      ) : terminated.length === 0 ? (
                        <TableStateRow colSpan={8} variant="empty" icon={UserX} label="No terminated members." />
                      ) : (
                        terminated.map((row) => (
                          <tr key={row.membership_id} className="border-b border-gray-100 transition-colors hover:bg-gray-50/50">
                            <td className="p-5">
                              <p className="font-semibold text-gray-800">{row.name}</p>
                              <p className="text-xs text-gray-500">{row.membership_id}</p>
                            </td>
                            <td className="p-5">
                              <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_BADGE[row.status] || STATUS_BADGE.terminated}`}>
                                {row.payout_status}
                              </span>
                              {row.status === "closed" && row.login_removed === true ? (
                                <p className="mt-1.5 text-[11px] text-gray-500">Login removed · email freed</p>
                              ) : null}
                              {row.status === "closed" && row.login_removed === false ? (
                                <div className="mt-1.5">
                                  <p className="text-[11px] text-amber-700" title={row.login_removal_error || undefined}>Login removal pending</p>
                                  <button
                                    type="button"
                                    onClick={() => retryLoginRemoval(row)}
                                    disabled={retrying === row.membership_id}
                                    className="mt-0.5 text-[11px] font-bold text-green-700 hover:underline disabled:opacity-50"
                                  >
                                    {retrying === row.membership_id ? "Retrying…" : "Retry"}
                                  </button>
                                </div>
                              ) : null}
                            </td>
                            <td className="p-5 text-gray-700">
                              {row.resolution_no || "—"}
                              {row.termination_date ? <p className="text-[11px] text-gray-500">{formatDate(row.termination_date)}</p> : null}
                            </td>
                            <td className="max-w-[14rem] p-5 text-gray-600">{row.reason || "—"}</td>
                            <td className="p-5 text-right text-gray-800">{peso(row.cbu_total)}</td>
                            <td className="p-5 text-right text-gray-700">{peso(row.applied_to_loans)}</td>
                            <td className="p-5 text-right text-gray-700">{peso(row.paid_so_far)}</td>
                            <td className="p-5 text-right font-semibold">
                              {row.status === "exiting" ? (
                                <span className="text-red-700" title="Loan balance they must pay before they can leave">
                                  {peso(row.loans_left)}
                                  <span className="block text-[10px] font-normal">loans left</span>
                                </span>
                              ) : (
                                <span className={row.remaining > 0 ? "text-amber-700" : "text-gray-600"}>
                                  {peso(row.remaining)}
                                  <span className="block text-[10px] font-normal">CBU to pay out</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {roleModal ? (
        <RoleModal
          target={roleModal.target}
          onClose={() => setRoleModal(null)}
          onSaved={() => { setRoleModal(null); load(); }}
        />
      ) : null}
      {showTerminate ? (
        <TerminateModal
          onClose={() => setShowTerminate(false)}
          onDone={() => { setShowTerminate(false); load(); }}
        />
      ) : null}
    </div>
  );
};

export default Account_Management;
