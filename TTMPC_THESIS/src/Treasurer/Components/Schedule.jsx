import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  BarChart3,
  Search,
  Wallet,
  History,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingDown,
  Info,
  PencilLine,
  X,
  ChevronRight,
  Building2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const PHP_FULL = (v) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0 }).format(Number(v || 0));

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const AGENCIES = ["NGA", "LGU", "SUC", "PI", "NGO", "Cooperative"];
const AGENCY_LABEL = {
  NGA: "NGA (National Gov't)",
  LGU: "LGU (Local Gov't)",
  SUC: "SUC (State University)",
  PI:  "PI (Private Institution)",
  NGO: "NGO",
  Cooperative: "Cooperative",
};

// Tailwind green-50 — used as the Recharts tooltip cursor tint so hover state
// matches the app's green hover pattern (bg-green-50 on nav items).
const CHART_HOVER_TINT = "#f0fdf4";

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const cycleLabel = (row) =>
  `${MONTH_NAMES[(row.cycle_month || 1) - 1]} ${row.cycle_year} — ${row.cycle_half === 1 ? "1st Half" : "2nd Half"}`;

// Short label used in the compacted table (drops the year, uses a half-pill instead of text).
const cycleShort = (row) => `${MONTH_NAMES[(row.cycle_month || 1) - 1]} ${String(row.cycle_year).slice(2)}`;

const statusPill = (status) => {
  const map = {
    on_time:  { label: "On time",  cls: "bg-green-100 text-green-700",  Icon: CheckCircle2 },
    late:     { label: "Late",     cls: "bg-red-100 text-red-700",       Icon: AlertTriangle },
    pending:  { label: "Pending",  cls: "bg-gray-100 text-gray-600",     Icon: Clock },
    overdue:  { label: "Not logged", cls: "bg-yellow-100 text-yellow-700", Icon: AlertTriangle },
  };
  const cfg = map[status] || map.pending;
  const I = cfg.Icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
      <I size={12} /> {cfg.label}
    </span>
  );
};

const Schedule = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

  const [agency, setAgency] = useState("NGA");
  const [rows, setRows] = useState([]);
  const [statsByAgency, setStatsByAgency] = useState({});
  const [lateInfo, setLateInfo] = useState({ paused: false, reason: "", cycle: null, data: [], grace_deadline: null });
  const [loading, setLoading] = useState(true);
  const [editCycle, setEditCycle] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAllCycles, setShowAllCycles] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [schedRes, statsRes, lateRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/treasurer/payroll/schedule?agency=${encodeURIComponent(agency)}`),
        fetch(`${API_BASE_URL}/api/treasurer/payroll/stats`),
        fetch(`${API_BASE_URL}/api/treasurer/payroll/late-payments?agency=${encodeURIComponent(agency)}`),
      ]);
      const sched = await schedRes.json();
      const st = await statsRes.json();
      const lp = await lateRes.json();
      if (sched?.success) setRows(sched.data || []);
      if (st?.success) {
        const map = {};
        (st.data || []).forEach((r) => { map[r.agency] = r; });
        setStatsByAgency(map);
      }
      if (lp?.success) setLateInfo(lp);
    } catch (e) {
      console.error("Failed to load salary schedule", e);
    } finally {
      setLoading(false);
    }
  }, [agency]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const upcoming = rows.filter((r) => r.expected_date >= today || r.status === "overdue");
  const history = rows.filter((r) => r.expected_date < today && r.status !== "overdue").slice().reverse();

  const currentCycle = useMemo(() => {
    if (!rows.length) return null;
    const now = new Date().getTime();
    return rows.reduce((best, r) => {
      const diff = Math.abs(new Date(r.expected_date).getTime() - now);
      if (!best || diff < best._diff) return { ...r, _diff: diff };
      return best;
    }, null);
  }, [rows]);

  const stats = statsByAgency[agency] || { sample_size: 0, late_count: 0, avg_delay_when_late: 0, max_delay: 0 };

  const chartData = rows
    .filter((r) => r.release_date)
    .slice(-12)
    .map((r) => ({
      name: `${MONTH_NAMES[r.cycle_month - 1]} ${r.cycle_half === 1 ? "½" : "F"}`,
      delay: r.delay_days || 0,
    }));

  const openEdit = (row) => setEditCycle({
    ...row,
    _release: row.release_date || "",
    _notes: row.notes || "",
  });

  const markToday = async (row) => {
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/treasurer/payroll/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: row.schedule_id,
          release_date: new Date().toISOString().slice(0, 10),
          notes: null,
          recorded_by: session?.user?.id || null,
        }),
      });
      const payload = await r.json();
      if (!r.ok || !payload?.success) throw new Error(payload?.detail || "Failed");
      await fetchAll();
    } catch (e) {
      alert(`Failed to log release: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editCycle) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/treasurer/payroll/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: editCycle.schedule_id,
          release_date: editCycle._release || null,
          notes: editCycle._notes || null,
          recorded_by: session?.user?.id || null,
        }),
      });
      const payload = await r.json();
      if (!r.ok || !payload?.success) throw new Error(payload?.detail || "Failed");
      setEditCycle(null);
      await fetchAll();
    } catch (e) {
      alert(`Failed to save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Disbursement", icon: CreditCard },
    { name: "Vault", icon: Wallet },
    { name: "Schedule", icon: CalendarDays },
    { name: "Payments", icon: Users },
    { name: "Loan Approval", icon: CreditCard },
    { name: "Accounting", icon: BarChart3 },
    { name: "Audit Log", icon: History },
  ];

  const routeMap = {
    "Dashboard": "/Treasurer_Dashboard",
    "Disbursement": "/disbursement",
    "Vault": "/treasurer-vault",
    "Schedule": "/schedule",
    "Payments": "/treasurer-payments",
    "Loan Approval": "/treasurer-approval",
    "Accounting": "/treasurer-accounting",
    "Audit Log": "/treasurer-audit-log",
  };

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Treasurer Portal" fallbackRole="Treasurer" />
          </div>
        </div>
        <hr className="w-full border-gray-200 mb-6" />
        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, "-")}`;
            return (
              <NavLink
                key={item.name}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2 rounded-md transition-colors ${
                    isActive ? "bg-green-50 text-green-700 font-semibold" : "text-gray-700 hover:bg-green-50 hover:text-green-700"
                  }`
                }
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>
        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input type="text" className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 pl-9 focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="Search..." />
          </div>
          <LoanNotificationBell role="treasurer" />
          <img src="/img/bookkeeper-profile.png" alt="Treasurer Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Treasurer" />
        </header>

        <main className="p-8">
          <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
                <span>Treasurer</span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
                <span className="text-[#389734]">Schedule</span>
              </div>
              <h1 className="font-bold text-2xl text-gray-800">Salary Schedule</h1>
              <p className="text-sm text-gray-500 mt-1">
                Manually log when each agency's payroll actually releases. Late-payment detection uses this to apply grace periods and avoid unfair flags.
              </p>
            </div>

            {/* Agency selector */}
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
              <Building2 size={16} className="text-gray-400" />
              <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Agency</label>
              <select
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                className="text-sm font-medium text-gray-700 bg-transparent focus:outline-none"
              >
                {AGENCIES.map((a) => (
                  <option key={a} value={a}>{AGENCY_LABEL[a]}</option>
                ))}
              </select>
            </div>
          </div>

          {lateInfo?.paused && lateInfo?.reason === "payroll_not_logged" && lateInfo.cycle && (
            <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
              <AlertTriangle className="text-yellow-600 shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <div className="font-semibold text-yellow-800">
                  {agency} payroll for {cycleLabel(lateInfo.cycle)} not yet marked as released
                </div>
                <div className="text-sm text-yellow-700 mt-0.5">
                  Late-payment flags are paused until you log the actual release date. This prevents falsely flagging members whose payroll simply hasn't arrived.
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Current Cycle</span>
                <div className="p-2 rounded-lg" style={{ background: "#1D602110", color: "#1D6021" }}>
                  <CalendarDays size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-bold text-gray-800">
                  {currentCycle ? cycleLabel(currentCycle) : "—"}
                </h3>
                <div className="text-xs text-gray-500 mt-1">
                  {agency} · Expected {currentCycle ? formatDate(currentCycle.expected_date) : "—"}
                </div>
                <div className="mt-2">{currentCycle && statusPill(currentCycle.status)}</div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Late Cycles ({agency})</span>
                <div className="p-2 bg-red-50 text-red-500 rounded-lg">
                  <TrendingDown size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800 tabular-nums">
                  {stats.sample_size > 0 ? `${stats.late_count} / ${stats.sample_size}` : "—"}
                </h3>
                <div className="text-xs text-gray-400 mt-2">
                  {stats.sample_size > 0 ? "of last logged cycles" : "no data yet"}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Avg Delay (when late)</span>
                <div className="p-2 bg-orange-50 text-orange-500 rounded-lg">
                  <Clock size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800 tabular-nums">
                  {stats.late_count > 0 ? `${Number(stats.avg_delay_when_late).toFixed(1)}d` : "—"}
                </h3>
                <div className="text-xs text-gray-400 mt-2">
                  worst: {stats.max_delay ? `${stats.max_delay}d late` : "—"}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Flagged This Cycle</span>
                <div className="p-2 bg-yellow-50 text-yellow-600 rounded-lg">
                  <AlertTriangle size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800 tabular-nums">
                  {lateInfo?.paused ? "—" : (lateInfo?.data?.length ?? 0)}
                </h3>
                <div className="text-xs text-gray-400 mt-2">
                  {lateInfo?.paused ? "paused (payroll not logged)" : "active loans past due"}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 lg:col-span-3">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-gray-800 font-bold text-lg">{agency} Release Log</h3>
                <button
                  onClick={() => setShowAllCycles((v) => !v)}
                  className="text-xs text-green-700 hover:text-green-800 font-medium"
                >
                  {showAllCycles ? "Show recent only" : "Show all cycles"}
                </button>
              </div>

              {loading ? (
                <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-100">
                        <th className="py-1.5 pr-2 font-medium">Cycle</th>
                        <th className="py-1.5 pr-2 font-medium">Expected</th>
                        <th className="py-1.5 pr-2 font-medium">Release</th>
                        <th className="py-1.5 pr-2 font-medium">Delay</th>
                        <th className="py-1.5 pr-2 font-medium">Status</th>
                        <th className="py-1.5 font-medium text-right w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Compact default: current cycle + 3 prev + 3 next.
                        const combined = [...upcoming, ...history];
                        if (showAllCycles || !currentCycle) return combined;
                        const idx = combined.findIndex((r) => r.schedule_id === currentCycle.schedule_id);
                        if (idx < 0) return combined.slice(0, 7);
                        const start = Math.max(0, idx - 3);
                        const end = Math.min(combined.length, idx + 4);
                        return combined.slice(start, end);
                      })().map((row) => {
                        const isCurrent = row.schedule_id === currentCycle?.schedule_id;
                        // Downgrade "overdue" pill to plain gray for future cycles that
                        // haven't hit their expected date — reserve yellow for the
                        // actually-overdue current cycle where action is needed.
                        const displayStatus =
                          row.status === "overdue" && !isCurrent ? "pending" : row.status;
                        return (
                          <tr
                            key={row.schedule_id}
                            className={`group border-b border-gray-50 hover:bg-green-50/40 ${
                              isCurrent ? "bg-green-50/60" : ""
                            }`}
                          >
                            <td className="py-1.5 pr-2 text-gray-800 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5">
                                {cycleShort(row)}
                                <span className={`px-1.5 py-px rounded text-[10px] font-semibold ${row.cycle_half === 1 ? "bg-gray-100 text-gray-600" : "bg-gray-200 text-gray-700"}`}>
                                  {row.cycle_half === 1 ? "1H" : "2H"}
                                </span>
                              </span>
                            </td>
                            <td className="py-1.5 pr-2 text-gray-600 tabular-nums whitespace-nowrap">{formatDate(row.expected_date)}</td>
                            <td className="py-1.5 pr-2 text-gray-600 tabular-nums whitespace-nowrap">{formatDate(row.release_date)}</td>
                            <td className="py-1.5 pr-2 tabular-nums whitespace-nowrap">
                              {row.delay_days == null ? "—" : row.delay_days <= 0 ? <span className="text-green-600">0d</span> : <span className="text-red-600">+{row.delay_days}d</span>}
                            </td>
                            <td className="py-1.5 pr-2">{statusPill(displayStatus)}</td>
                            <td className="py-1.5 text-right whitespace-nowrap">
                              <div className="inline-flex gap-1.5 items-center">
                                {!row.release_date && isCurrent && (
                                  <button
                                    onClick={() => markToday(row)}
                                    disabled={saving}
                                    className="text-[11px] bg-green-600 hover:bg-green-700 text-white font-semibold px-2 py-0.5 rounded"
                                  >
                                    Mark today
                                  </button>
                                )}
                                <button
                                  onClick={() => openEdit(row)}
                                  title="Edit"
                                  className={`text-gray-400 hover:text-green-700 p-1 rounded ${
                                    isCurrent ? "" : "opacity-0 group-hover:opacity-100"
                                  } transition-opacity`}
                                >
                                  <PencilLine size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 lg:col-span-2">
              <h3 className="text-gray-800 font-bold text-lg mb-4">Delay History — {agency}</h3>
              {chartData.length === 0 ? (
                <div className="text-sm text-gray-500 py-8 text-center">No logged cycles yet.</div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={(v) => `${v}d`} />
                      <Tooltip formatter={(v) => [`${v} day(s)`, "Delay"]} cursor={{ fill: CHART_HOVER_TINT }} />
                      <Bar dataKey="delay" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="mt-2 text-xs text-gray-400 flex items-start gap-1">
                <Info size={12} className="mt-0.5 shrink-0" />
                <span>0 days = released on or before expected date.</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-gray-800 font-bold text-lg">Late-Payment Detection — {agency}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Active loans of {agency} members with a payment due this cycle but not yet paid. Grace period applied when payroll was late.
                </p>
              </div>
              {lateInfo?.grace_deadline && (
                <div className="text-xs text-gray-500">
                  Grace deadline: <span className="font-semibold text-gray-700">{formatDate(lateInfo.grace_deadline)}</span>
                </div>
              )}
            </div>

            {lateInfo?.paused ? (
              <div className="text-sm text-gray-500 py-6 text-center bg-gray-50 rounded-lg">
                Paused — log the current {agency} release above to enable detection.
              </div>
            ) : (lateInfo?.data?.length ?? 0) === 0 ? (
              <div className="text-sm text-gray-500 py-6 text-center">
                {lateInfo?.note || "No members flagged."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-3 font-medium">Member</th>
                      <th className="py-2 pr-3 font-medium">Employer</th>
                      <th className="py-2 pr-3 font-medium">Loan #</th>
                      <th className="py-2 pr-3 font-medium">Due Date</th>
                      <th className="py-2 pr-3 font-medium">Amount Due</th>
                      <th className="py-2 font-medium">Why Flagged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lateInfo.data.map((row) => (
                      <tr key={row.schedule_id_ref} className="border-b border-gray-50">
                        <td className="py-2 pr-3 text-gray-800">{row.member_name}</td>
                        <td className="py-2 pr-3 text-gray-600">{row.employer_name || "—"}</td>
                        <td className="py-2 pr-3 text-gray-600 tabular-nums">{row.control_number || "—"}</td>
                        <td className="py-2 pr-3 text-gray-600 tabular-nums">{formatDate(row.due_date)}</td>
                        <td className="py-2 pr-3 text-gray-800 tabular-nums font-medium">{PHP_FULL(row.amount_due)}</td>
                        <td className="py-2 text-gray-500 text-xs">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {lateInfo?.unclassified_skipped > 0 && (
              <div className="mt-3 text-xs text-gray-400 flex items-start gap-1">
                <Info size={12} className="mt-0.5 shrink-0" />
                <span>{lateInfo.unclassified_skipped} member(s) skipped — employer_name could not be classified into an agency.</span>
              </div>
            )}
          </div>
        </main>
      </div>

      {editCycle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-lg text-gray-800">Log Salary Release</h3>
                <p className="text-xs text-gray-500 mt-0.5">{editCycle.agency} · {cycleLabel(editCycle)}</p>
              </div>
              <button onClick={() => setEditCycle(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="text-xs text-gray-500 mb-4">
              Expected: <span className="font-semibold text-gray-700">{formatDate(editCycle.expected_date)}</span>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">Actual release date</label>
            <input
              type="date"
              value={editCycle._release}
              onChange={(e) => setEditCycle({ ...editCycle, _release: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-1"
            />
            <div className="text-xs text-gray-400 mb-4">Leave blank to un-mark this cycle.</div>

            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              rows={3}
              value={editCycle._notes}
              onChange={(e) => setEditCycle({ ...editCycle, _notes: e.target.value })}
              placeholder="e.g. DepEd delayed release due to holiday"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-4"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditCycle(null)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Schedule;
