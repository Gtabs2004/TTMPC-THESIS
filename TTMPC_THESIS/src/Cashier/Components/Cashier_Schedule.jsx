import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import {
  LayoutDashboard,
  Search,
  Bell,
  ArrowUpRight,
  Send,
  UserPlus,
  PiggyBank,
  ShoppingCart,
  ArrowDownLeft,
  History,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Info,
  Building2,
} from "lucide-react";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

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

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const cycleLabel = (row) =>
  `${MONTH_NAMES[(row.cycle_month || 1) - 1]} ${row.cycle_year} — ${row.cycle_half === 1 ? "1st Half" : "2nd Half"}`;

const statusPill = (status) => {
  const map = {
    on_time:  { label: "On time",  cls: "bg-green-100 text-green-700",     Icon: CheckCircle2 },
    late:     { label: "Late",     cls: "bg-red-100 text-red-700",         Icon: AlertTriangle },
    pending:  { label: "Pending",  cls: "bg-gray-100 text-gray-600",       Icon: Clock },
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

const Cashier_Schedule = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const [isDepositsOpen, setIsDepositsOpen] = useState(false);

  const [agency, setAgency] = useState("NGA");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `${API_BASE_URL}/api/treasurer/payroll/schedule?months_back=3&months_ahead=3&agency=${encodeURIComponent(agency)}`
      );
      const payload = await r.json();
      if (payload?.success) setRows(payload.data || []);
    } catch (e) {
      console.error("Failed to load schedule", e);
    } finally {
      setLoading(false);
    }
  }, [agency]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  // Find the current/nearest cycle for the banner
  const currentCycle = useMemo(() => {
    if (!rows.length) return null;
    const now = new Date().getTime();
    return rows.reduce((best, r) => {
      const diff = Math.abs(new Date(r.expected_date).getTime() - now);
      if (!best || diff < best._diff) return { ...r, _diff: diff };
      return best;
    }, null);
  }, [rows]);

  const bannerMessage = useMemo(() => {
    if (!currentCycle) return null;
    if (currentCycle.status === "on_time") {
      return {
        tone: "green",
        Icon: CheckCircle2,
        title: `${agency} payroll ${cycleLabel(currentCycle)} released on time`,
        body: `Release date: ${formatDate(currentCycle.release_date)}. Members should be able to pay on schedule.`,
      };
    }
    if (currentCycle.status === "late") {
      return {
        tone: "red",
        Icon: AlertTriangle,
        title: `${agency} payroll ${cycleLabel(currentCycle)} was late by ${currentCycle.delay_days} day(s)`,
        body: `Expected ${formatDate(currentCycle.expected_date)}, actually released ${formatDate(currentCycle.release_date)}. ${agency} members are in the grace period — do not mark as late.`,
      };
    }
    if (currentCycle.status === "overdue") {
      return {
        tone: "yellow",
        Icon: AlertTriangle,
        title: `${agency} payroll ${cycleLabel(currentCycle)} not yet logged by Treasurer`,
        body: `Expected release was ${formatDate(currentCycle.expected_date)}. Confirm with the Treasurer before flagging any ${agency} member as late.`,
      };
    }
    return {
      tone: "gray",
      Icon: Clock,
      title: `Next ${agency} payroll: ${cycleLabel(currentCycle)}`,
      body: `Expected ${formatDate(currentCycle.expected_date)}.`,
    };
  }, [currentCycle, agency]);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/Cashier_Dashboard" },
    { name: "Payments", icon: ArrowUpRight, path: "/Cashier_Payments" },
    { name: "Disbursement", icon: Send, path: "/Cashier_Disbursement" },
    { name: "Membership Payments", icon: UserPlus, path: "/Cashier_MembershipPayments" },
    {
      name: "Deposits",
      icon: PiggyBank,
      isDropdown: true,
      subItems: [
        { name: "Savings", path: "/Cashier_Savings" },
        { name: "Capital Build-Up", path: "/Cashier_CBU" },
      ],
    },
    { name: "Withdrawals", icon: ArrowDownLeft, path: "/Cashier_Withdrawals" },
    { name: "Grocery", icon: ShoppingCart, path: "/Cashier_Grocery" },
    { name: "Payroll Schedule", icon: CalendarDays, path: "/Cashier_Schedule" },
    { name: "Audit Log", icon: History, path: "/cashier-audit-log" },
  ];

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const bannerCls = {
    green:  "border-green-200 bg-green-50 text-green-800",
    red:    "border-red-200 bg-red-50 text-red-800",
    yellow: "border-yellow-200 bg-yellow-50 text-yellow-800",
    gray:   "border-gray-200 bg-gray-50 text-gray-700",
  };
  const bannerIcon = {
    green: "text-green-600", red: "text-red-600", yellow: "text-yellow-600", gray: "text-gray-500",
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR — matches Cashier_Dashboard */}
      <aside className="fixed left-0 top-0 h-screen bg-white w-64 p-4 flex flex-col border-r border-gray-200 overflow-y-auto z-50">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity
              className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold"
              fallbackPortal="Cashier Portal"
              fallbackRole="Cashier"
            />
          </div>
        </div>
        <hr className="w-full border-gray-200 mb-6" />
        <nav className="flex flex-col gap-2 text-sm grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
            if (item.isDropdown) {
              return (
                <div key={item.name} className="flex flex-col">
                  <button
                    onClick={() => setIsDepositsOpen(!isDepositsOpen)}
                    className="flex items-center justify-between p-2 rounded-md text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors w-full"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={20} />
                      <span>{item.name}</span>
                    </div>
                    {isDepositsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {isDepositsOpen && (
                    <div className="flex flex-col mt-1 space-y-1">
                      {item.subItems.map((subItem) => (
                        <NavLink
                          key={subItem.name}
                          to={subItem.path}
                          className={({ isActive }) =>
                            `block pl-11 pr-4 py-2 rounded-md transition-colors ${
                              isActive ? "text-green-700 font-semibold" : "text-gray-500 hover:text-green-700 hover:bg-green-50"
                            }`
                          }
                        >
                          {subItem.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <NavLink
                key={item.name}
                to={item.path}
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

      <div className="flex-1 flex flex-col h-screen overflow-y-auto ml-64">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input type="text" className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 pl-9 focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="Search..." />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
          </button>
          <img src="/img/bookkeeper-profile.png" alt="Cashier Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Cashier" />
        </header>

        <main className="p-8">
          <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-bold text-2xl text-gray-800">Salary Schedule</h1>
              <p className="text-sm text-gray-500 mt-1">
                Read-only view of member employer payroll release status. Check this before flagging a member's payment as late — payroll delays extend the grace period.
              </p>
            </div>
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

          {/* Current cycle banner */}
          {bannerMessage && (
            <div className={`mb-6 rounded-xl border p-4 flex items-start gap-3 ${bannerCls[bannerMessage.tone]}`}>
              <bannerMessage.Icon className={`shrink-0 mt-0.5 ${bannerIcon[bannerMessage.tone]}`} size={20} />
              <div className="flex-1">
                <div className="font-semibold">{bannerMessage.title}</div>
                <div className="text-sm mt-0.5 opacity-90">{bannerMessage.body}</div>
              </div>
            </div>
          )}

          {/* Recent + upcoming cycles */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-gray-800 font-bold text-lg">{agency} — Recent &amp; Upcoming Cycles</h3>
              <span className="text-xs text-gray-400">Managed by the Treasurer</span>
            </div>

            {loading ? (
              <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-gray-500 py-8 text-center">No cycles found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-3 font-medium">Cycle</th>
                      <th className="py-2 pr-3 font-medium">Expected</th>
                      <th className="py-2 pr-3 font-medium">Release</th>
                      <th className="py-2 pr-3 font-medium">Delay</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.schedule_id} className="border-b border-gray-50">
                        <td className="py-2 pr-3 text-gray-800">{cycleLabel(row)}</td>
                        <td className="py-2 pr-3 text-gray-600 tabular-nums">{formatDate(row.expected_date)}</td>
                        <td className="py-2 pr-3 text-gray-600 tabular-nums">{formatDate(row.release_date)}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {row.delay_days == null ? "—" : row.delay_days <= 0 ? <span className="text-green-600">on time</span> : <span className="text-red-600">+{row.delay_days}d</span>}
                        </td>
                        <td className="py-2">{statusPill(row.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 text-xs text-gray-400 flex items-start gap-1">
              <Info size={12} className="mt-0.5 shrink-0" />
              <span>Only the Treasurer can log or edit release dates. If a cycle looks wrong, notify them.</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Cashier_Schedule;
