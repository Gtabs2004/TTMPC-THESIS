import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import { supabase } from "../../supabaseClient";
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
  TrendingUp,
  TrendingDown,
  Calendar,
  PiggyBank,
  Briefcase,
  Wallet,
  Coins,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const PESO = "₱";

const isDelinquent = (loan) =>
  String(loan?.loan_status || "").toLowerCase().includes("delinquent");

const formatPeso = (value) => {
  const n = Number(value || 0);
  return `${PESO}${n.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
};

const formatPesoCompact = (value) => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return `${PESO}${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${PESO}${(n / 1_000).toFixed(1)}K`;
  return `${PESO}${n.toFixed(0)}`;
};

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (d) => d.toLocaleString("en-US", { month: "short" });

const buildCalendarYearMonths = () => {
  const arr = [];
  const year = new Date().getFullYear();
  for (let m = 0; m < 12; m++) {
    const d = new Date(year, m, 1);
    arr.push({ key: monthKey(d), label: monthLabel(d) });
  }
  return arr;
};

const timeAgo = (iso) => {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const Dashboard = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();

  const [loans, setLoans] = useState([]);
  const [shareCapitalTotal, setShareCapitalTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Manage Member", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: Briefcase },
    { name: "Payments", icon: Wallet },
    { name: "Savings Withdrawals", icon: CreditCard },
    { name: "Accounting", icon: Calculator },
    { name: "MIGS Scoring", icon: Activity },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Trail", icon: History },
    { name: "Grocery", icon: Coins },
  ];

  const routeMap = {
    Dashboard: "/dashboard",
    "Manage Member": "/manage-member",
    "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans": "/manage-loans",
    Payments: "/payments",
    "Savings Withdrawals": "/bookkeeper-savings-transactions",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
    Grocery: "/grocery",
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

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const loansRes = await fetch(`${API_BASE_URL}/api/bookkeeper/manage-loans`);
        const loansJson = await loansRes.json();
        if (!loansRes.ok || !loansJson?.success) {
          throw new Error(loansJson?.detail || "Failed to load loans data.");
        }
        const rows = Array.isArray(loansJson?.data?.rows) ? loansJson.data.rows : [];
        const filtered = rows.filter((loan) => !isDelinquent(loan));

        // Total share capital: backend aggregates from member.share_capital_amount
        // (falling back to latest capital_build_up.ending_share_capital, then PDS
        // initial_paid_up_capital). Going through the API bypasses RLS that
        // would otherwise hide other members' rows from the browser client.
        let totalCapital = 0;
        try {
          const capRes = await fetch(`${API_BASE_URL}/api/secretary/membership-records`);
          const capJson = await capRes.json();
          const records = Array.isArray(capJson)
            ? capJson
            : Array.isArray(capJson?.data)
              ? capJson.data
              : Array.isArray(capJson?.records)
                ? capJson.records
                : [];
          totalCapital = records.reduce(
            (sum, r) => sum + Number(r?.paid_up_capital || 0),
            0
          );
        } catch (capErr) {
          console.warn("Share capital aggregation failed, falling back to client-side CBU query:", capErr);
          const { data: cbuRows } = await supabase
            .from("capital_build_up")
            .select("member_id, ending_share_capital, transaction_date")
            .order("transaction_date", { ascending: false });
          const latestByMember = new Map();
          (cbuRows || []).forEach((row) => {
            if (!row?.member_id) return;
            if (!latestByMember.has(row.member_id)) {
              latestByMember.set(row.member_id, Number(row.ending_share_capital || 0));
            }
          });
          totalCapital = Array.from(latestByMember.values()).reduce((s, v) => s + v, 0);
        }

        if (cancelled) return;
        setLoans(filtered);
        setShareCapitalTotal(totalCapital);
        setLoadError("");
      } catch (err) {
        if (cancelled) return;
        console.error("Dashboard load failed:", err);
        setLoadError(err?.message || "Unable to load dashboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    const intervalId = window.setInterval(fetchData, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const allPayments = useMemo(
    () => loans.flatMap((loan) => (loan.payment_history || []).map((p) => ({ ...p, loan }))),
    [loans]
  );

  const stats = useMemo(() => {
    const activeLoans = loans.filter((loan) => Number(loan.remaining_balance || 0) > 0).length;

    const currentKey = monthKey(new Date());
    const prevDate = new Date();
    prevDate.setMonth(prevDate.getMonth() - 1);
    const prevKey = monthKey(prevDate);

    const sumForKey = (key) =>
      allPayments
        .filter((p) => String(p.date_paid || "").slice(0, 7) === key)
        .reduce((s, p) => s + Number(p.amount_paid || 0), 0);

    const paymentsThisMonth = sumForKey(currentKey);
    const paymentsLastMonth = sumForKey(prevKey);
    const monthChangePct = paymentsLastMonth > 0
      ? ((paymentsThisMonth - paymentsLastMonth) / paymentsLastMonth) * 100
      : 0;

    return {
      activeLoans,
      paymentsThisMonth,
      paymentsLastMonth,
      monthChangePct,
      shareCapital: shareCapitalTotal,
    };
  }, [loans, allPayments, shareCapitalTotal]);

  const barChartData = useMemo(() => {
    const months = buildCalendarYearMonths();
    return months.map(({ key, label }) => {
      const total = allPayments
        .filter((p) => String(p.date_paid || "").slice(0, 7) === key)
        .reduce((s, p) => s + Number(p.amount_paid || 0), 0);
      return { name: label, value: Math.round(total) };
    });
  }, [allPayments]);

  const collectionsChangePct = useMemo(() => {
    const currentMonthIdx = new Date().getMonth();
    if (currentMonthIdx === 0) return 0;
    const latest = barChartData[currentMonthIdx]?.value || 0;
    const prior = barChartData[currentMonthIdx - 1]?.value || 0;
    if (prior <= 0) return 0;
    return ((latest - prior) / prior) * 100;
  }, [barChartData]);

  const lineChartData = useMemo(() => {
    const months = buildCalendarYearMonths();
    return months.map(({ key, label }) => {
      const monthPays = allPayments.filter(
        (p) => String(p.date_paid || "").slice(0, 7) === key
      );
      const total = monthPays.length;
      if (total === 0) return { name: label, onTime: 0, late: 0 };
      const late = monthPays.filter((p) => Number(p.penalties || 0) > 0).length;
      const onTime = total - late;
      return {
        name: label,
        onTime: Math.round((onTime / total) * 100),
        late: Math.round((late / total) * 100),
      };
    });
  }, [allPayments]);

  const recentActivities = useMemo(() => {
    const sorted = [...allPayments].sort((a, b) => {
      const da = new Date(a.date_paid || 0).getTime();
      const db = new Date(b.date_paid || 0).getTime();
      return db - da;
    });
    return sorted.slice(0, 5).map((p, idx) => {
      const isLate = Number(p.penalties || 0) > 0;
      return {
        id: p.payment_id || `${p.loan?.loan_id || "loan"}-${idx}`,
        title: isLate ? "Late payment received" : "Payment received",
        name: p.loan?.member_name || "Member",
        amount: formatPeso(p.amount_paid),
        time: timeAgo(p.date_paid),
        color: isLate ? "bg-red-400" : "bg-green-500",
      };
    });
  }, [allPayments]);

  const renderTrend = (pct) => {
    const positive = pct >= 0;
    const Icon = positive ? TrendingUp : TrendingDown;
    const color = positive ? "text-green-500" : "text-red-500";
    return (
      <div className="flex items-center mt-2 text-xs">
        <Icon size={14} className={`${color} mr-1`} />
        <span className={`${color} font-medium`}>
          {positive ? "+" : ""}
          {pct.toFixed(1)}%
        </span>
        <span className="text-gray-400 ml-1">vs last month</span>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Bookkeeper Portal" fallbackRole="Bookkeeper" />
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
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 pl-9 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Search..."
            />
          </div>
          <LoanNotificationBell role="bookkeeper" />
          <img
            src="/img/bookkeeper-profile.png"
            alt="Profile"
            className="ml-4 w-8 h-8 rounded-full bg-gray-200"
          />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
        </header>

        <main className="p-8">
          {loadError ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {loadError}
            </div>
          ) : null}

          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Card 1: Active Loans */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Active Loans</span>
                <div className="p-2 bg-green-50 text-green-500 rounded-lg">
                  <Users size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800">
                  {loading ? "..." : stats.activeLoans}
                </h3>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-gray-400">Excludes delinquent accounts</span>
                </div>
              </div>
            </div>

            {/* Card 2: Payment This Month */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Payment This Month</span>
                <div className="p-2 bg-blue-50 text-blue-500 rounded-lg">
                  <Calendar size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800">
                  {loading ? "..." : formatPeso(stats.paymentsThisMonth)}
                </h3>
                {loading ? null : renderTrend(stats.monthChangePct)}
              </div>
            </div>

            {/* Card 3: Total Share Capital */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Total Share Capital</span>
                <div className="p-2 bg-purple-50 text-purple-500 rounded-lg">
                  <PiggyBank size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800">
                  {loading ? "..." : formatPesoCompact(stats.shareCapital)}
                </h3>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-gray-400">Across all members</span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Bar Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <h3 className="text-gray-800 font-bold text-lg">Monthly Collections</h3>
                  <p className="text-gray-400 text-xs">{new Date().getFullYear()} overview</p>
                </div>
                <div
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    collectionsChangePct >= 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                  }`}
                >
                  {collectionsChangePct >= 0 ? "+" : ""}
                  {collectionsChangePct.toFixed(1)}%
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(val) => `${PESO}${Math.round(val / 1000)}k`} />
                    <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Line Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <h3 className="text-gray-800 font-bold text-lg">Repayment Trends</h3>
                  <p className="text-gray-400 text-xs">On-time vs late payments</p>
                </div>
                <div className="flex gap-4 text-xs font-medium">
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500"></span><span className="text-gray-500">On-time</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400"></span><span className="text-gray-500">Late</span></div>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <LineChart data={lineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(val) => `${val}%`} />
                    <Line type="monotone" dataKey="onTime" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }} />
                    <Line type="monotone" dataKey="late" stroke="#f87171" strokeWidth={3} dot={{ r: 4, fill: "#f87171", strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Bottom Activity Section */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-gray-800 font-bold text-lg mb-4">Recent Activity</h3>
            <div className="flex flex-col">
              {recentActivities.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">
                  {loading ? "Loading recent activity..." : "No recent payments recorded."}
                </p>
              ) : (
                recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between py-4 border-b border-gray-50 last:border-0 last:pb-0">
                    <div className="flex items-start gap-4">
                      <div className={`mt-1.5 w-2 h-2 rounded-full ${activity.color} shrink-0`} />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{activity.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{activity.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-800">{activity.amount}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{activity.time}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
