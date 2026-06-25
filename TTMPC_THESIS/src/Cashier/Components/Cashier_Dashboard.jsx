import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import RecentActivityCard from "../../components/RecentActivityCard";
import { supabase } from "../../supabaseClient";
import {
  LayoutDashboard,
  Search,
  Bell,
  Banknote,
  ChevronDown,
  ChevronRight,
  FileText,
  ArrowUpRight,
  Users,
  UserPlus,
  Send,
  PiggyBank,
  ShoppingCart,
  ArrowDownLeft,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import logo from "../../assets/img/ttmpc logo.png";

const PHP = (v) => `₱${Number(v || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

const hourLabel = (d) => {
  const h = d.getHours();
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${suffix}`;
};

const formatTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
};

const Cashier_Dashboard = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [isDepositsOpen, setIsDepositsOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    totalTransactions: 0,
    cashReceived: 0,
    cashReleased: 0,
    pendingPayouts: 0,
    membersServed: 0,
  });
  const [trendData, setTrendData] = useState([]);
  const [distributionData, setDistributionData] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isoToday = today.toISOString();

        // Build hourly buckets (8AM–3PM, the active window from the original chart).
        const hourLabels = ["8AM", "9AM", "10AM", "11AM", "12PM", "1PM", "2PM", "3PM"];
        const trendBuckets = new Map(hourLabels.map((h) => [h, 0]));

        const [
          paymentsRes,
          disbursalsRes,
          membershipRes,
          cbuRes,
          ledgerRes,
          readyLoansRes,
        ] = await Promise.all([
          // Loan payments today (cash IN)
          supabase
            .from("loan_payments")
            .select("id, loan_id, amount_paid, payment_date, confirmation_status, payment_reference")
            .gte("payment_date", isoToday)
            .order("payment_date", { ascending: false })
            .limit(2000),
          // Loan disbursals today (cash OUT)
          supabase
            .from("loans")
            .select("control_number, loan_amount, disbursal_date, loan_status, member:member_id(first_name, last_name), loan_types:loan_type_id(name)")
            .gte("disbursal_date", isoToday)
            .order("disbursal_date", { ascending: false })
            .limit(2000),
          // Membership payments today (cash IN — application/share fees)
          supabase
            .from("membership_payments")
            .select("id, application_id, payment_date, payment_status, payment_type, amount")
            .gte("payment_date", isoToday)
            .order("payment_date", { ascending: false })
            .limit(2000),
          // CBU contributions today (cash IN)
          supabase
            .from("capital_build_up")
            .select("id, member_id, transaction_date, capital_added")
            .gte("transaction_date", isoToday)
            .order("transaction_date", { ascending: false })
            .limit(2000),
          // Savings ledger today (deposits IN, withdrawals OUT)
          supabase
            .from("savings_ledger")
            .select("id, account_number, entry_type, amount, reference, posted_at")
            .gte("posted_at", isoToday)
            .order("posted_at", { ascending: false })
            .limit(2000),
          // Pending disbursal queue (count only)
          supabase
            .from("loans")
            .select("control_number", { count: "exact", head: true })
            .in("loan_status", ["ready for disbursement", "to be disbursed"]),
        ]);

        if (cancelled) return;

        const payments = paymentsRes?.data || [];
        const disbursals = disbursalsRes?.data || [];
        const memberships = membershipRes?.data || [];
        const cbus = cbuRes?.data || [];
        const ledger = ledgerRes?.data || [];
        const pendingPayouts = readyLoansRes?.count || 0;

        // Helper: bucket a timestamp into the hour label, if within window.
        const bucket = (iso) => {
          if (!iso) return;
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return;
          const label = hourLabel(d);
          if (trendBuckets.has(label)) trendBuckets.set(label, trendBuckets.get(label) + 1);
        };

        let cashIn = 0;
        let cashOut = 0;
        const membersTodaySet = new Set();
        const breakdown = {
          loanPayments: 0,
          savingsDeposits: 0,
          cbuContributions: 0,
          withdrawals: 0,
          disbursals: 0,
          memberships: 0,
        };

        payments.forEach((p) => {
          cashIn += Number(p.amount_paid || 0);
          bucket(p.payment_date);
          breakdown.loanPayments += 1;
          if (p.loan_id) membersTodaySet.add(`loan-${p.loan_id}`);
        });
        disbursals.forEach((d) => {
          cashOut += Number(d.loan_amount || 0);
          bucket(d.disbursal_date);
          breakdown.disbursals += 1;
          const memberKey = d.member ? `${d.member.first_name}-${d.member.last_name}` : d.control_number;
          membersTodaySet.add(`m-${memberKey}`);
        });
        memberships.forEach((m) => {
          cashIn += Number(m.amount || 0);
          bucket(m.payment_date);
          breakdown.memberships += 1;
          if (m.application_id) membersTodaySet.add(`app-${m.application_id}`);
        });
        cbus.forEach((c) => {
          cashIn += Number(c.capital_added || 0);
          bucket(c.transaction_date);
          breakdown.cbuContributions += 1;
          if (c.member_id) membersTodaySet.add(`cbu-${c.member_id}`);
        });
        ledger.forEach((l) => {
          const amt = Number(l.amount || 0);
          const entry = String(l.entry_type || "").toLowerCase();
          if (entry.includes("withdraw")) {
            cashOut += amt;
            breakdown.withdrawals += 1;
          } else {
            cashIn += amt;
            breakdown.savingsDeposits += 1;
          }
          bucket(l.posted_at);
          if (l.account_number) membersTodaySet.add(`sav-${l.account_number}`);
        });

        const totalTransactions =
          payments.length + disbursals.length + memberships.length + cbus.length + ledger.length;

        setKpis({
          totalTransactions,
          cashReceived: cashIn,
          cashReleased: cashOut,
          pendingPayouts,
          membersServed: membersTodaySet.size,
        });

        setTrendData(hourLabels.map((h) => ({ name: h, value: trendBuckets.get(h) || 0 })));

        // Distribution donut — collapse to the 4 buckets from the original design.
        const total = totalTransactions || 1;
        const distRows = [
          { name: "Loan Payments",     count: breakdown.loanPayments + breakdown.disbursals, color: "#166534" },
          { name: "Savings Deposits",  count: breakdown.savingsDeposits,                     color: "#3b82f6" },
          { name: "CBU Contributions", count: breakdown.cbuContributions,                    color: "#8b5cf6" },
          { name: "Withdrawals",       count: breakdown.withdrawals,                         color: "#ef4444" },
        ].map((r) => ({ ...r, value: Math.round((r.count / total) * 100) }));
        setDistributionData(distRows);

        // Recent activity: merge all transaction sources, sort newest first, take top 6.
        const memberLookup = new Map();
        disbursals.forEach((d) => {
          if (d.member) {
            const name = `${d.member.first_name || ""} ${d.member.last_name || ""}`.trim();
            memberLookup.set(d.control_number, name || "Member");
          }
        });

        const activity = [];
        payments.forEach((p) => activity.push({
          id: `pmt-${p.id}`,
          name: memberLookup.get(p.loan_id) || p.loan_id || "Member",
          desc: "Loan Payment",
          ref: `#${p.payment_reference || `PMT-${p.id}`}`,
          amount: PHP(p.amount_paid),
          time: formatTime(p.payment_date),
          ts: p.payment_date,
          type: "in",
        }));
        disbursals.forEach((d) => activity.push({
          id: `dsb-${d.control_number}`,
          name: memberLookup.get(d.control_number) || "Member",
          desc: `${d.loan_types?.name || "Loan"} Disbursement`,
          ref: `#${d.control_number}`,
          amount: PHP(d.loan_amount),
          time: formatTime(d.disbursal_date),
          ts: d.disbursal_date,
          type: "out",
        }));
        memberships.forEach((m) => activity.push({
          id: `mem-${m.id}`,
          name: m.application_id || "Applicant",
          desc: `Membership ${m.payment_type || "Payment"}`,
          ref: `#MEM-${m.id}`,
          amount: PHP(m.amount),
          time: formatTime(m.payment_date),
          ts: m.payment_date,
          type: "in",
        }));
        cbus.forEach((c) => activity.push({
          id: `cbu-${c.id}`,
          name: c.member_id || "Member",
          desc: "CBU Contribution",
          ref: `#CBU-${c.id}`,
          amount: PHP(c.capital_added),
          time: formatTime(c.transaction_date),
          ts: c.transaction_date,
          type: "in",
        }));
        ledger.forEach((l) => {
          const isWithdrawal = String(l.entry_type || "").toLowerCase().includes("withdraw");
          activity.push({
            id: `sav-${l.id}`,
            name: l.account_number || "Savings",
            desc: isWithdrawal ? "Savings Withdrawal" : "Savings Deposit",
            ref: `#${l.reference || `SAV-${l.id}`}`,
            amount: PHP(l.amount),
            time: formatTime(l.posted_at),
            ts: l.posted_at,
            type: isWithdrawal ? "out" : "in",
          });
        });
        activity.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
        setRecentActivity(activity.slice(0, 6));
      } catch (err) {
        if (!cancelled) addNotification(err?.message || "Failed to load dashboard data.", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    { name: "Audit Log", icon: ShoppingCart, path: "/cashier-audit-log" },
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
                              isActive
                                ? "text-green-700 font-semibold"
                                : "text-gray-500 hover:text-green-700 hover:bg-green-50"
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

      
      <div className="flex-1 flex flex-col h-screen overflow-y-auto ml-64">
        <div className="flex-1 flex flex-col min-w-0">
  <header className="bg-white h-16 border-b border-gray-100 flex items-center justify-between px-8 shrink-0 ">
    
    
    

    {/* Right Side: Grouped Utilities */}
    <div className="flex items-center space-x-4 ml-auto">
      
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search..."
          className="bg-gray-50 w-60 h-10 rounded-lg border border-gray-200 px-4 pl-9 py-1 focus:outline-none focus:ring-2 focus:ring-[#00A859] focus:border-transparent transition-all placeholder-gray-400 text-sm"
        />
      </div>

      {/* Notifications */}
      <button className="relative p-2 rounded-full text-gray-500 hover:bg-gray-50 transition-colors">
        <Bell className="w-5 h-5" />
        {/* Adjusted badge alignment so it sits perfectly on the shoulder of the bell */}
        <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
      </button>

      {/* Profile Divider (Optional but adds a premium touch) */}
      <span className="h-6 w-px bg-gray-200"></span>

      {/* User Identity Group */}
      <div className="flex items-center space-x-3">
        <img
          src="/img/bookkeeper-profile.png"
          alt="Profile"
          className="w-9 h-9 rounded-full object-cover border border-gray-100 bg-gray-50"
        />
        <PortalTopbarIdentity className="text-sm font-semibold text-green-600" fallbackRole="Cashier" />
      </div>

    </div>
  </header>
</div>

        {/* DASHBOARD CONTENT */}
        <main className="p-8">

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-blue-50 text-blue-500 rounded-lg"><FileText size={20} /></div>
                <span className="bg-blue-50 text-blue-600 rounded-full px-3 py-1 text-xs font-bold">Today</span>
              </div>
              <div>
                <h3 className="text-gray-500 text-sm font-medium">Total Transactions</h3>
                <p className="font-bold text-3xl text-gray-800 mt-1">{loading ? "—" : kpis.totalTransactions}</p>
                <p className="text-xs font-medium text-gray-400 mt-2">Recorded today</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-green-50 text-green-600 rounded-lg"><Banknote size={20} /></div>
                <span className="bg-green-50 text-green-700 rounded-full px-3 py-1 text-xs font-bold">Cash In</span>
              </div>
              <div>
                <h3 className="text-gray-500 text-sm font-medium">Cash Received</h3>
                <p className="font-bold text-3xl text-gray-800 mt-1">{loading ? "—" : PHP(kpis.cashReceived)}</p>
                <p className="text-xs font-medium text-gray-400 mt-2">Payments, deposits, CBU, membership</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-red-50 text-red-500 rounded-lg"><ArrowUpRight size={20} /></div>
                <span className="bg-orange-50 text-orange-600 rounded-full px-3 py-1 text-xs font-bold">
                  {kpis.pendingPayouts} Pending
                </span>
              </div>
              <div>
                <h3 className="text-gray-500 text-sm font-medium">Cash Released</h3>
                <p className="font-bold text-3xl text-gray-800 mt-1">{loading ? "—" : PHP(kpis.cashReleased)}</p>
                <p className="text-xs font-medium text-gray-400 mt-2">
                  <span className="text-orange-500">{kpis.pendingPayouts}</span> loans ready for disbursement
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-purple-50 text-purple-500 rounded-lg"><Users size={20} /></div>
                <span className="bg-teal-50 text-teal-600 rounded-full px-3 py-1 text-xs font-bold">Today</span>
              </div>
              <div>
                <h3 className="text-gray-500 text-sm font-medium">Members Served</h3>
                <p className="font-bold text-3xl text-gray-800 mt-1">{loading ? "—" : kpis.membersServed}</p>
                <p className="text-xs font-medium text-gray-400 mt-2">Unique accounts today</p>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Area Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 lg:col-span-2">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-gray-800 font-bold text-lg">Transaction Volume Today</h3>
                <button className="flex items-center gap-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50">
                  Hourly <ChevronDown size={14} />
                </button>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTxn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#9ca3af", fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#9ca3af", fontSize: 12 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#22c55e"
                      strokeWidth={3}
                      fill="url(#colorTxn)"
                      activeDot={{ r: 6, fill: "#fff", stroke: "#22c55e", strokeWidth: 2 }}
                      dot={{ r: 4, fill: "#fff", stroke: "#22c55e", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Donut Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-gray-800 font-bold text-lg mb-4">Transaction Breakdown</h3>
              <div className="relative h-48 flex justify-center items-center">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={0}
                      dataKey="value"
                      stroke="none"
                    >
                      {distributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-800">{kpis.totalTransactions}</span>
                  <span className="text-[10px] text-gray-400 font-bold tracking-widest">TOTAL</span>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {distributionData.map((item, index) => (
                  <div key={index} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                      <span className="text-gray-600">{item.name}</span>
                    </div>
                    <span className="font-bold text-gray-800">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Activity Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 flex justify-between items-center border-b border-gray-100">
              <div>
                <h3 className="text-gray-800 font-bold text-lg">Recent Activity</h3>
                <p className="text-xs text-gray-400 mt-1">Last updated: 3 mins ago</p>
              </div>
              <button className="text-green-700 text-sm font-bold hover:underline">View All</button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#66B538] text-white text-[11px] font-bold tracking-wider uppercase">
                    <th className="p-4 pl-6">Member</th>
                    <th className="p-4">Transaction</th>
                    <th className="p-4">Reference</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Time</th>
                    <th className="p-4 pr-6">Type</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {loading ? (
                    <tr><td colSpan={6} className="p-6 text-center text-gray-400">Loading activity…</td></tr>
                  ) : recentActivity.length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-gray-400">No transactions recorded today.</td></tr>
                  ) : recentActivity.map((row) => (
                    <tr key={row.id} className="table-row-enter border-b border-gray-50 hover:bg-green-50 transition-colors">
                      <td className="p-4 pl-6 font-bold text-gray-800">{row.name}</td>
                      <td className="p-4 text-gray-500">{row.desc}</td>
                      <td className="p-4 text-gray-400 font-medium">{row.ref}</td>
                      <td className="p-4 font-bold text-gray-800">{row.amount}</td>
                      <td className="p-4 text-gray-500">{row.time}</td>
                      <td className="p-4 pr-6">
                        <span
                          className={`badge-animated px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase ${
                            row.type === "in"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {row.type === "in" ? "Cash In" : "Cash Out"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 px-6 border-t border-gray-50 flex justify-between items-center text-xs text-gray-400 font-medium">
              <span>Showing {recentActivity.length} of {kpis.totalTransactions} transactions today</span>
              <div className="flex gap-2">
                <button className="px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50">Previous</button>
                <button className="px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600">Next</button>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <RecentActivityCard to="/cashier-audit-log" title="My Audit Activity" />
          </div>

        </main>
      </div>
    </div>
  );
};

export default Cashier_Dashboard;
