import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import LoanDemandForecastCard from "../../components/LoanDemandForecastCard";
import RecentActivityCard from "../../components/RecentActivityCard";
import PriorityQueueCard from "../../components/PriorityQueueCard";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Calculator, 
  BarChart3, 
  Search,
  Bell,
  ClipboardList,
  ArrowUpRight,
  Wallet,
  CalendarDays,
  ChevronDown,
  MoreVertical,
  TrendingUp,
  TrendingDown,
  History
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

// --- MOCK DATA ---
const trendData = [
  { name: 'Jan', value: 650000 },
  { name: 'Feb', value: 720000 },
  { name: 'Mar', value: 580000 },
  { name: 'Apr', value: 890000 },
  { name: 'May', value: 750000 },
  { name: 'Jun', value: 850000 },
];

const distributionData = [
  { name: 'Bonus', value: 20, color: '#22c55e' },         // Green 500
  { name: 'Consolidation', value: 55, color: '#166534' }, // Green 800
  { name: 'Emergency', value: 25, color: '#4ade80' },     // Green 400
];

const recentActivity = [
  { id: 1, name: "Robert C. Santos", loanId: "#LN-8921", type: "Consolidated", amount: "\u20B150,000.00", date: "Oct 22, 2023", status: "PENDING DISBURSEMENT", statusColor: "bg-yellow-100 text-yellow-700" },
  { id: 2, name: "Maria Elena Cruz", loanId: "#LN-8918", type: "Emergency", amount: "\u20B115,000.00", date: "Oct 21, 2023", status: "DISBURSED", statusColor: "bg-green-100 text-green-700" },
  { id: 3, name: "Juan Dela Cruz", loanId: "#LN-8915", type: "Consolidated", amount: "\u20B1100,000.00", date: "Oct 20, 2023", status: "APPROVED", statusColor: "bg-blue-100 text-blue-700" },
  { id: 4, name: "Liza Soberano", loanId: "#LN-8912", type: "Bonus", amount: "\u20B120,000.00", date: "Oct 19, 2023", status: "SCHEDULED", statusColor: "bg-gray-100 text-gray-600" },
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const PHP_COMPACT = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `₱${Math.round(n / 1_000)}k`;
  return `₱${n.toFixed(0)}`;
};

const PHP_FULL = (v) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0 }).format(Number(v || 0));

const Treasurer_Dashboard = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

  // Live KPI state. All four cards refresh together on mount + on demand.
  // Each fetch is independent so a partial failure (e.g. forecast API down)
  // doesn't blank out the vault or pending numbers.
  const [kpis, setKpis] = useState({
    vault: { value: null, loading: true, error: "" },
    pending: { count: null, amount: null, loading: true, error: "" },
    forecastConsolidated: { value: null, loading: true, error: "" },
    forecastEmergency: { value: null, loading: true, error: "" },
    nextMonthLabel: "",
  });

  const fetchKpis = useCallback(async () => {
    // Compute next-month key once so both forecast fetches use the same target.
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const targetKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    const targetLabel = next.toLocaleDateString("en-PH", { year: "numeric", month: "long" });

    setKpis((k) => ({
      vault: { ...k.vault, loading: true, error: "" },
      pending: { ...k.pending, loading: true, error: "" },
      forecastConsolidated: { ...k.forecastConsolidated, loading: true, error: "" },
      forecastEmergency: { ...k.forecastEmergency, loading: true, error: "" },
      nextMonthLabel: targetLabel,
    }));

    // 1) Vault balance — direct Supabase, RLS enforced via user session.
    (async () => {
      try {
        const { data, error } = await supabase.from("vault_balance_v").select("current_balance").maybeSingle();
        if (error) throw error;
        setKpis((k) => ({ ...k, vault: { value: Number(data?.current_balance || 0), loading: false, error: "" } }));
      } catch (e) {
        setKpis((k) => ({ ...k, vault: { value: null, loading: false, error: e?.message || "Failed" } }));
      }
    })();

    // 2) Pending release — reuse the priority-queue summary (already ranked).
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/treasurer/disbursements/priority-queue?limit=1`, {
          headers: { Accept: "application/json" },
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.success) throw new Error(payload?.detail || "Failed");
        setKpis((k) => ({
          ...k,
          pending: {
            count: payload.summary?.total_count ?? 0,
            amount: payload.summary?.total_amount ?? 0,
            loading: false,
            error: "",
          },
        }));
      } catch (e) {
        setKpis((k) => ({ ...k, pending: { count: null, amount: null, loading: false, error: e?.message || "Failed" } }));
      }
    })();

    // 3 & 4) Forecast per loan type — pull enough periods to reach next month.
    const forecastFetch = async (loanType, key) => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/analytics/demand/forecast?loan_type=${loanType}&periods=60`,
          { headers: { Accept: "application/json" } },
        );
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.detail || "Failed");
        const fcArray = payload?.data?.forecast || payload?.forecast || [];
        const row = fcArray.find((r) => String(r.period || "").startsWith(targetKey));
        setKpis((k) => ({
          ...k,
          [key]: {
            // Use the point estimate for the KPI card (users expect a single
            // headline number here); the Vault page shows the upper CI band.
            value: row ? Number(row.predicted || 0) : null,
            loading: false,
            error: row ? "" : "No forecast for next month",
          },
        }));
      } catch (e) {
        setKpis((k) => ({ ...k, [key]: { value: null, loading: false, error: e?.message || "Failed" } }));
      }
    };
    forecastFetch("consolidated", "forecastConsolidated");
    forecastFetch("emergency", "forecastEmergency");
  }, []);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);
  const { addNotification } = useNotification();
  
  const menuItems = [
      { name: "Dashboard", icon: LayoutDashboard },
      { name: "Disbursement", icon: CreditCard },
      { name: "Vault", icon: Wallet },
      { name: "Schedule", icon: Calculator },
      { name: "Payments", icon: Users },
      { name: "Loan Approval", icon: CreditCard },
      { name: "Accounting", icon: BarChart3 },
      { name: "Audit Log", icon: History },
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

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
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
          {(() => {
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

            return menuItems.map((item) => {
              const Icon = item.icon;
              const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;

              return (
                <NavLink
                  key={item.name}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-2 rounded-md transition-colors ${
                      isActive
                        ? 'bg-green-50 text-green-700 font-semibold'
                        : 'text-gray-700 hover:bg-green-50 hover:text-green-700'
                    }`
                  }
                >
                  <Icon size={20} />
                  <span>{item.name}</span>
                </NavLink>
              );
            });
          })()}
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
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 pl-9 focus:outline-none focus:ring-2 focus:ring-green-500" 
              placeholder="Search..."
            />
          </div>
          <LoanNotificationBell role="treasurer" />
          <img src="/img/bookkeeper-profile.png" alt="Treasurer Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200"></img>
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Treasurer" />
        </header>

        {/* DASHBOARD CONTENT */}
        <main className="p-8">
          
          {/* Top KPI Cards \u2014 live data. Each card gracefully shows "\u2014" while
              loading or on error so a slow/failed sub-fetch doesn't blank
              the whole strip. */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {/* Card 1 \u2014 Cash in Vault (from vault_balance_v) */}
            <button
              type="button"
              onClick={() => navigate("/treasurer-vault")}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between text-left hover:border-green-300 hover:shadow-md transition"
            >
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Cash in Vault</span>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Wallet size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800 tabular-nums">
                  {kpis.vault.loading ? "\u2026" : kpis.vault.error ? "\u2014" : PHP_COMPACT(kpis.vault.value)}
                </h3>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-gray-400">Manage in Vault \u2192</span>
                </div>
              </div>
            </button>

            {/* Card 2 \u2014 Pending Release (count + total) */}
            <button
              type="button"
              onClick={() => navigate("/disbursement")}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between text-left hover:border-green-300 hover:shadow-md transition"
            >
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Pending Release</span>
                <div className="p-2 bg-orange-50 text-orange-500 rounded-lg">
                  <ClipboardList size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800 tabular-nums">
                  {kpis.pending.loading ? "\u2026" : kpis.pending.error ? "\u2014" : (kpis.pending.count ?? 0)}
                </h3>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-gray-500 font-medium tabular-nums">
                    {kpis.pending.loading ? "" : PHP_FULL(kpis.pending.amount || 0)}
                  </span>
                  <span className="text-gray-400 ml-1">awaiting release</span>
                </div>
              </div>
            </button>

            {/* Card 3 - Forecast: Consolidated (next month) */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Forecast - Consolidated</span>
                <div className="p-2 rounded-lg" style={{ background: "#1D602110", color: "#1D6021" }}>
                  <TrendingUp size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800 tabular-nums">
                  {kpis.forecastConsolidated.loading ? "\u2026" : kpis.forecastConsolidated.value == null ? "\u2014" : PHP_COMPACT(kpis.forecastConsolidated.value)}
                </h3>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-gray-400">expected in {kpis.nextMonthLabel || "next month"}</span>
                </div>
              </div>
            </div>

            {/* Card 4 - Forecast: Emergency (next month) */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Forecast - Emergency</span>
                <div className="p-2 rounded-lg" style={{ background: "#B4530910", color: "#B45309" }}>
                  <TrendingUp size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800 tabular-nums">
                  {kpis.forecastEmergency.loading ? "\u2026" : kpis.forecastEmergency.value == null ? "\u2014" : PHP_COMPACT(kpis.forecastEmergency.value)}
                </h3>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-gray-400">expected in {kpis.nextMonthLabel || "next month"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
            
            {/* Area Chart (Takes up 3 columns) */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 lg:col-span-3">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-gray-800 font-bold text-lg">Monthly Disbursement Trend</h3>
                <button className="flex items-center gap-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50">
                  Last 6 Months <ChevronDown size={14} />
                </button>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(val) => `\u20B1${val / 1000}k`} />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#22c55e" 
                      strokeWidth={3} 
                      fill="url(#colorTrend)" 
                      activeDot={{ r: 6, fill: "#fff", stroke: "#22c55e", strokeWidth: 2 }}
                      dot={{ r: 4, fill: "#fff", stroke: "#22c55e", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Priority Queue (Takes up 2 columns) — replaces the old
                Loan Type Distribution donut. The queue tells the treasurer
                which loans to release next based on TTMPC policy ranking,
                which is directly actionable vs. a static category donut. */}
            <PriorityQueueCard className="lg:col-span-2" limit={10} seeAllHref="/treasurer-approval" />
          </div>
          <div className="mt-8">
            <RecentActivityCard to="/treasurer-audit-log" title="My Audit Activity" />
          </div>

          <div className="mt-8">
            <LoanDemandForecastCard defaultLoanType="consolidated" periods={12} />
          </div>

        </main>
      </div>
    </div>
  );
};

export default Treasurer_Dashboard;