import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import RecentActivityCard from "../../components/RecentActivityCard";
import { supabase } from "../../supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Skeleton, SkeletonChart, SkeletonDonut } from "../../components/Skeleton";
import TableStateRow from "../../components/TableStateRow";
import MonthDayPicker from "../../components/MonthDayPicker";
import Pagination from "../../components/Pagination";
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
  Calendar,
  ChevronLeft,
  History,
  Gift,
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
  Tooltip,
  ReferenceDot,
} from "recharts";
import { SERIES_PRIMARY, getLoanTypeColor } from "../../lib/chartColors";

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

const localDayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Transactions per day for the `days` days ending on endDate (YYYY-MM-DD,
// inclusive). Counts the same five sources as the KPI card, timestamps only.
async function fetchDailyTrend(endDate, days) {
  const [y, m, d] = endDate.split("-").map(Number);
  const rangeStart = new Date(y, m - 1, d - (days - 1), 0, 0, 0, 0);
  const rangeEnd = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  const isoStart = rangeStart.toISOString();
  const isoEnd = rangeEnd.toISOString();

  const counts = new Map();
  const labels = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(y, m - 1, d - (days - 1) + i);
    const key = localDayKey(day);
    counts.set(key, 0);
    labels.push({
      key,
      name: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      full: day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    });
  }

  const sources = [
    ["loan_payments", "payment_date"],
    ["loans", "disbursal_date"],
    ["membership_payments", "payment_date"],
    ["capital_build_up", "transaction_date"],
    ["savings_ledger", "posted_at"],
  ];
  const results = await Promise.all(
    sources.map(([table, col]) =>
      supabase.from(table).select(col).gte(col, isoStart).lt(col, isoEnd).limit(10000)
    )
  );

  results.forEach((res, i) => {
    const col = sources[i][1];
    (res?.data || []).forEach((row) => {
      const t = new Date(row[col]);
      if (Number.isNaN(t.getTime())) return;
      const key = localDayKey(t);
      if (counts.has(key)) counts.set(key, counts.get(key) + 1);
    });
  });

  return labels.map(({ key, name, full }) => ({ name, full, iso: key, value: counts.get(key) }));
}

// Everything the dashboard shows for one day (YYYY-MM-DD), fetched in one
// parallel batch. Lives outside the component so TanStack Query can cache
// each day under its own key across navigation.
async function fetchCashierDashboard(selectedDate) {
  const [y, m, d] = selectedDate.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  const dayEnd = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  const isoStart = dayStart.toISOString();
  const isoEnd = dayEnd.toISOString();

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
    // Loan payments in selected day window (cash IN)
    supabase
      .from("loan_payments")
      .select("id, loan_id, amount_paid, payment_date, confirmation_status, payment_reference")
      .gte("payment_date", isoStart)
      .lt("payment_date", isoEnd)
      .order("payment_date", { ascending: false })
      .limit(2000),
    // Loan disbursals in selected day window (cash OUT)
    supabase
      .from("loans")
      .select("control_number, loan_amount, disbursal_date, loan_status, member:member_id(first_name, last_name), loan_types:loan_type_id(name)")
      .gte("disbursal_date", isoStart)
      .lt("disbursal_date", isoEnd)
      .order("disbursal_date", { ascending: false })
      .limit(2000),
    // Membership payments in selected day window
    supabase
      .from("membership_payments")
      .select("id, application_id, payment_date, payment_status, payment_type, amount")
      .gte("payment_date", isoStart)
      .lt("payment_date", isoEnd)
      .order("payment_date", { ascending: false })
      .limit(2000),
    // CBU contributions in selected day window
    supabase
      .from("capital_build_up")
      .select("id, member_id, transaction_date, capital_added")
      .gte("transaction_date", isoStart)
      .lt("transaction_date", isoEnd)
      .order("transaction_date", { ascending: false })
      .limit(2000),
    // Savings ledger in selected day window
    supabase
      .from("savings_ledger")
      .select("id, account_number, entry_type, amount, reference, posted_at")
      .gte("posted_at", isoStart)
      .lt("posted_at", isoEnd)
      .order("posted_at", { ascending: false })
      .limit(2000),
    // Pending disbursal queue (count only)
    supabase
      .from("loans")
      .select("control_number", { count: "exact", head: true })
      .in("loan_status", ["ready for disbursement", "to be disbursed"]),
  ]);

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

  const kpis = {
    totalTransactions,
    cashReceived: cashIn,
    cashReleased: cashOut,
    pendingPayouts,
    membersServed: membersTodaySet.size,
  };

  const trendData = hourLabels.map((h) => ({ name: h, value: trendBuckets.get(h) || 0 }));

  // Distribution donut — collapse to the 4 buckets from the original design.
  const total = totalTransactions || 1;
  const distRows = [
    { name: "Loan Payments",     count: breakdown.loanPayments + breakdown.disbursals },
    { name: "Savings Deposits",  count: breakdown.savingsDeposits },
    { name: "CBU Contributions", count: breakdown.cbuContributions },
    { name: "Withdrawals",       count: breakdown.withdrawals },
  ].map((r, i) => ({ ...r, color: getLoanTypeColor(r.name, i), value: Math.round((r.count / total) * 100) }));

  // Recent activity: merge all transaction sources, newest first. Every row
  // gets a real member name (looked up below) and the same reference shape.
  const fullName = (r) =>
    [r?.first_name, r?.middle_name, r?.surname || r?.last_name].filter(Boolean).join(" ").trim();
  const shortRef = (prefix, id) => `#${prefix}-${String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  const loanOwner = new Map();
  disbursals.forEach((d) => {
    if (d.member) loanOwner.set(d.control_number, fullName(d.member));
  });
  const otherLoanIds = [...new Set(payments.map((p) => p.loan_id).filter((id) => id && !loanOwner.has(id)))];
  const savingsNumbers = [...new Set(ledger.map((l) => l.account_number).filter(Boolean))];
  const applicationIds = [...new Set(memberships.map((m) => m.application_id).filter(Boolean))];

  const [loansRes, savingsAcctRes, applicationsRes] = await Promise.all([
    otherLoanIds.length
      ? supabase.from("loans").select("control_number, member:member_id(first_name, last_name)").in("control_number", otherLoanIds)
      : { data: [] },
    savingsNumbers.length
      ? supabase.from("savings_accounts").select("account_number, account_name, member_id").in("account_number", savingsNumbers)
      : { data: [] },
    applicationIds.length
      ? supabase.from("member_applications").select("application_id, first_name, middle_name, surname").in("application_id", applicationIds)
      : { data: [] },
  ]);
  (loansRes?.data || []).forEach((l) => {
    if (l.member) loanOwner.set(l.control_number, fullName(l.member));
  });
  const savingsAccounts = new Map((savingsAcctRes?.data || []).map((a) => [a.account_number, a]));
  const applicantName = new Map((applicationsRes?.data || []).map((a) => [a.application_id, fullName(a)]));

  const memberIds = [...new Set([
    ...cbus.map((c) => c.member_id),
    ...(savingsAcctRes?.data || []).map((a) => a.member_id),
  ].filter(Boolean))];
  const membersRes = memberIds.length
    ? await supabase.from("member").select("id, first_name, last_name").in("id", memberIds)
    : { data: [] };
  const memberName = new Map((membersRes?.data || []).map((m) => [m.id, fullName(m)]));

  const UNKNOWN = "Unknown member";
  const activity = [];
  payments.forEach((p) => activity.push({
    id: `pmt-${p.id}`,
    name: loanOwner.get(p.loan_id) || UNKNOWN,
    desc: "Loan Payment",
    ref: p.payment_reference ? `#${p.payment_reference}` : shortRef("PMT", p.id),
    amount: PHP(p.amount_paid),
    time: formatTime(p.payment_date),
    ts: p.payment_date,
    type: "in",
  }));
  disbursals.forEach((d) => activity.push({
    id: `dsb-${d.control_number}`,
    name: loanOwner.get(d.control_number) || UNKNOWN,
    desc: d.loan_types?.name ? `${d.loan_types.name} Loan Disbursement` : "Loan Disbursement",
    ref: `#${d.control_number}`,
    amount: PHP(d.loan_amount),
    time: formatTime(d.disbursal_date),
    ts: d.disbursal_date,
    type: "out",
  }));
  memberships.forEach((m) => activity.push({
    id: `mem-${m.id}`,
    name: applicantName.get(m.application_id) || m.application_id || UNKNOWN,
    desc: m.payment_type ? `Membership ${m.payment_type}` : "Membership Payment",
    ref: shortRef("MEM", m.id),
    amount: PHP(m.amount),
    time: formatTime(m.payment_date),
    ts: m.payment_date,
    type: "in",
  }));
  cbus.forEach((c) => activity.push({
    id: `cbu-${c.id}`,
    name: memberName.get(c.member_id) || UNKNOWN,
    desc: "CBU Contribution",
    ref: shortRef("CBU", c.id),
    amount: PHP(c.capital_added),
    time: formatTime(c.transaction_date),
    ts: c.transaction_date,
    type: "in",
  }));
  ledger.forEach((l) => {
    const isWithdrawal = String(l.entry_type || "").toLowerCase().includes("withdraw");
    const acct = savingsAccounts.get(l.account_number);
    activity.push({
      id: `sav-${l.id}`,
      name: memberName.get(acct?.member_id) || acct?.account_name || UNKNOWN,
      desc: isWithdrawal ? "Savings Withdrawal" : "Savings Deposit",
      ref: l.reference ? `#${l.reference}` : shortRef("SAV", l.id),
      amount: PHP(l.amount),
      time: formatTime(l.posted_at),
      ts: l.posted_at,
      type: isWithdrawal ? "out" : "in",
    });
  });
  activity.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  return { kpis, trendData, distributionData: distRows, recentActivity: activity };
}

const Cashier_Dashboard = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();

  // Selected date for the dashboard view. Defaults to today but a cashier can
  // rewind to inspect any past day's transactions. Stored as YYYY-MM-DD (the
  // native <input type="date"> format) to avoid timezone drift.
  const toIso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayIso = useMemo(() => toIso(new Date()), []);

  const [selectedDate, setSelectedDate] = useState(todayIso);
  // Month calendar opened by clicking the date (or "Pick") above the chart.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const isViewingToday = selectedDate === todayIso;
  const selectedDateObj = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate]);
  const selectedDateLabel = useMemo(
    () =>
      selectedDateObj.toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      }),
    [selectedDateObj]
  );

  // Cached per selected day: coming back to the dashboard renders the last
  // result instantly and refreshes it in the background. `loading` is only
  // true when there's nothing cached yet for that day.
  const { data, isPending: loading, error, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard', 'cashier', selectedDate],
    queryFn: () => fetchCashierDashboard(selectedDate),
  });
  const trendDays = 7;
  const { data: trendData = [], isPending: trendLoading } = useQuery({
    queryKey: ['dashboard', 'cashier', 'daily-trend', todayIso, trendDays],
    queryFn: () => fetchDailyTrend(todayIso, trendDays),
  });
  const ACTIVITY_PAGE_SIZE = 6;
  const [activityPage, setActivityPage] = useState(1);
  useEffect(() => setActivityPage(1), [selectedDate]);
  const trendTotal = trendData.reduce((sum, r) => sum + r.value, 0);
  const trendBusiest = trendData.reduce((best, r) => (!best || r.value > best.value ? r : best), null);
  const selectedTrendPoint = trendData.find((r) => r.iso === selectedDate);
  const {
    kpis = { totalTransactions: 0, cashReceived: 0, cashReleased: 0, pendingPayouts: 0, membersServed: 0 },
    distributionData = [],
    recentActivity = [],
  } = data || {};
  const activityPages = Math.max(1, Math.ceil(recentActivity.length / ACTIVITY_PAGE_SIZE));
  const activityStart = (Math.min(activityPage, activityPages) - 1) * ACTIVITY_PAGE_SIZE;
  const pagedActivity = recentActivity.slice(activityStart, activityStart + ACTIVITY_PAGE_SIZE);
  useEffect(() => {
    if (error) addNotification(error?.message || "Failed to load dashboard data.", "error");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);



  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <StaffSidebar portal="Cashier" items={cashierNav} />

      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Cashier" notifications={<LoanNotificationBell role="cashier" />} />

        {/* DASHBOARD CONTENT */}
        <main className="animate-page-in p-8">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <button
              type="button"
              onClick={() => navigate("/Cashier_NonMember_Bonus")}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition"
            >
              <Gift size={16} />
              New Non-Member Bonus Loan
            </button>
          </div>

          {/* KPI Cards */}
          <StatCardRow cols={4}>
            <StatCard
              label="Total Transactions"
              value={kpis.totalTransactions}
              loading={loading}
              icon={FileText}
              iconColor="text-blue-500"
              subtext={isViewingToday ? "Recorded today" : `Recorded on ${selectedDateLabel}`}
            />
            <StatCard
              label="Cash Received"
              value={PHP(kpis.cashReceived)}
              loading={loading}
              icon={Banknote}
              iconColor="text-green-600"
              subtext="Payments, deposits, CBU, membership"
            />
            <StatCard
              label="Cash Released"
              value={PHP(kpis.cashReleased)}
              loading={loading}
              icon={ArrowUpRight}
              iconColor="text-red-500"
              subtext={loading ? <Skeleton className="h-3 w-36 mt-1" /> : <><span className="text-orange-500">{kpis.pendingPayouts}</span> loans ready for release</>}
            />
            <StatCard
              label="Members Served"
              value={kpis.membersServed}
              loading={loading}
              icon={Users}
              iconColor="text-purple-500"
              subtext={isViewingToday ? "Unique accounts today" : `Unique accounts on ${selectedDateLabel}`}
            />
          </StatCardRow>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Area Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 lg:col-span-2">
              {/* Chart header — big date display + preset chips + day-stepper */}
              <div className="mb-6 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-gray-800 font-bold text-lg leading-tight">Daily Transactions</h3>
                    <p className="text-xs text-gray-400">Transactions in the last 7 days.</p>
                  </div>

                  {/* Date picker: the calendar opens right under this button */}
                  <div className="relative">
                    <button
                      type="button"
                      data-calendar-trigger
                      onClick={() => setCalendarOpen((open) => !open)}
                      aria-haspopup="dialog"
                      aria-expanded={calendarOpen}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                    >
                      <Calendar size={14} className="text-gray-500" aria-hidden="true" />
                      <span>Pick</span>
                    </button>
                    <MonthDayPicker
                      open={calendarOpen}
                      onClose={() => setCalendarOpen(false)}
                      value={selectedDate}
                      onChange={(iso) => {
                        setSelectedDate(iso);
                        setCalendarOpen(false);
                      }}
                      maxIso={todayIso}
                      align="right"
                    />
                  </div>
                </div>
              </div>
              {!trendLoading && trendData.length > 0 && (
                <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <div className="text-lg font-bold text-gray-800">{trendTotal}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Total</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <div className="text-lg font-bold text-gray-800">{(trendTotal / trendData.length).toFixed(1)}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Daily average</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <div className="text-lg font-bold text-gray-800">{trendBusiest && trendBusiest.value > 0 ? trendBusiest.name : "—"}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Busiest day</div>
                  </div>
                </div>
              )}
              <div className="h-64">
                {trendLoading ? <SkeletonChart /> : <ResponsiveContainer debounce={200} width="100%" height="100%" minWidth={0} minHeight={1}>
                  <AreaChart
                    data={trendData}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    style={{ cursor: "pointer" }}
                    onClick={(state) => {
                      const iso = state?.activePayload?.[0]?.payload?.iso;
                      if (iso) setSelectedDate(iso);
                    }}
                  >
                    <defs>
                      <linearGradient id="colorTxn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={SERIES_PRIMARY} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={SERIES_PRIMARY} stopOpacity={0} />
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
                      allowDecimals={false}
                      tick={{ fill: "#9ca3af", fontSize: 12 }}
                    />
                    <Tooltip
                      cursor={{ stroke: SERIES_PRIMARY, strokeDasharray: "4 4" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload;
                        return (
                          <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs shadow-md">
                            <div className="font-semibold text-gray-800">{row.full}</div>
                            <div className="text-gray-600">{row.value} transaction{row.value === 1 ? "" : "s"}</div>
                          </div>
                        );
                      }}
                    />
                    {selectedTrendPoint && (
                      <ReferenceDot x={selectedTrendPoint.name} y={selectedTrendPoint.value} r={9} fill={SERIES_PRIMARY} fillOpacity={0.15} stroke={SERIES_PRIMARY} strokeWidth={2} />
                    )}
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={SERIES_PRIMARY}
                      strokeWidth={3}
                      fill="url(#colorTxn)"
                      activeDot={{ r: 6, fill: "#fff", stroke: SERIES_PRIMARY, strokeWidth: 2 }}
                      dot={{ r: 4, fill: "#fff", stroke: SERIES_PRIMARY, strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>}
              </div>
            </div>

            {/* Donut Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-gray-800 font-bold text-lg mb-4">Transaction Breakdown</h3>
              <div className="relative h-48 flex justify-center items-center">
                {loading ? <SkeletonDonut /> : <><ResponsiveContainer debounce={200} width="100%" height="100%" minWidth={0} minHeight={1}>
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
                </div></>}
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {loading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
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
                <p className="text-xs text-gray-400 mt-1">{dataUpdatedAt ? `Last updated: ${formatTime(new Date(dataUpdatedAt).toISOString())}` : " "}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Member</th>
                    <th className="p-5 font-bold">Transaction</th>
                    <th className="p-5 font-bold">Reference</th>
                    <th className="p-5 font-bold">Amount</th>
                    <th className="p-5 font-bold">Time</th>
                    <th className="p-5 font-bold">Cash Flow</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={6} variant="loading" label="Loading..." />
                  ) : recentActivity.length === 0 ? (
                    <TableStateRow
                      colSpan={6}
                      variant="empty"
                      icon={FileText}
                      label="No transactions recorded today."
                    />
                  ) : pagedActivity.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="p-5 text-sm font-bold text-gray-800">{row.name}</td>
                      <td className="p-5 text-sm text-gray-500">{row.desc}</td>
                      <td className="p-5 text-sm text-gray-400 font-medium">{row.ref}</td>
                      <td className="p-5 text-sm font-bold text-gray-800">{row.amount}</td>
                      <td className="p-5 text-sm text-gray-500">{row.time}</td>
                      <td className="p-5">
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

            <Pagination page={activityPage} totalPages={activityPages} onChange={setActivityPage} />
          </div>


        </main>
      </div>
    </div>
  );
};

export default Cashier_Dashboard;
