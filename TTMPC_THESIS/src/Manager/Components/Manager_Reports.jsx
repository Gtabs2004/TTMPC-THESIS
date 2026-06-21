import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import { supabase } from "../../supabaseClient";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Search,
  AlertCircle,
  Clock,
  TrendingUp,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Award,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const formatCurrency = (value, opts = {}) => {
  const amount = Number(value || 0);
  return `₱${amount.toLocaleString(undefined, {
    minimumFractionDigits: opts.decimals ?? 0,
    maximumFractionDigits: opts.decimals ?? 0,
  })}`;
};

const TYPE_COLORS = ["#166534", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const MIGS_COLORS = { migs: "#16A34A", nonMigs: "#dc2626", unscored: "#9ca3af" };

const Manager_Reports = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [portfolio, setPortfolio] = useState({
    totalActive: 0,
    totalDisbursedYtd: 0,
    totalPrincipalOutstanding: 0,
    overdueLoans: 0,
    overdueRate: 0,
  });
  const [migsBreakdown, setMigsBreakdown] = useState([]);
  const [monthlyApprovals, setMonthlyApprovals] = useState([]);
  const [loanTypeBreakdown, setLoanTypeBreakdown] = useState([]);
  const [topBorrowers, setTopBorrowers] = useState([]);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Loan Approval", icon: Users },
    { name: "Manage Member", icon: Users },
    { name: "Reports", icon: BarChart3 },
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

  useEffect(() => {
    let isMounted = true;
    const loadReports = async () => {
      setLoading(true);
      setError(null);
      try {
        const now = new Date();
        const yearStart = `${now.getFullYear()}-01-01`;
        const trendStart = new Date(now.getFullYear(), now.getMonth() - 11, 1)
          .toISOString()
          .slice(0, 10);

        const [
          activeLoansResult,
          ytdDisbursedResult,
          twelveMonthApprovalsResult,
          overdueResult,
          migsSnapshotResult,
          memberCountResult,
        ] = await Promise.all([
          // Active loans for outstanding + type distribution
          supabase
            .from("loans")
            .select(
              "control_number, member_id, principal_amount, loan_amount, loan_status, loan_type_id, loan_types:loan_type_id(name), member:member_id(first_name, last_name, membership_id)"
            )
            .in("loan_status", ["released", "partially paid"]),
          // YTD disbursed total
          supabase
            .from("loans")
            .select("principal_amount, disbursal_date")
            .gte("disbursal_date", yearStart)
            .in("loan_status", ["released", "partially paid", "fully paid"]),
          // 12-month approval trend
          supabase
            .from("loans")
            .select("application_date, principal_amount, loan_status")
            .gte("application_date", trendStart)
            .in("loan_status", [
              "released",
              "partially paid",
              "fully paid",
              "recommended for approval",
            ]),
          // Overdue schedules
          supabase
            .from("loan_schedules")
            .select("loan_id", { count: "exact" })
            .eq("schedule_status", "overdue"),
          // Most recent MIGS snapshot per member (we'll dedupe in JS)
          supabase
            .from("member_classification_temporal")
            .select(
              "membership_number_id, classification_level_id, total_score, accrual_date"
            )
            .order("accrual_date", { ascending: false }),
          // Total members for MIGS Unscored bucket calculation
          supabase.from("member").select("id", { count: "exact", head: true }),
        ]);

        if (!isMounted) return;

        const activeLoans = activeLoansResult?.data || [];
        const activeLoanIds = new Set(activeLoans.map((l) => l.control_number));

        // Portfolio KPIs
        const totalPrincipalOutstanding = activeLoans.reduce(
          (sum, l) => sum + Number(l.principal_amount ?? l.loan_amount ?? 0),
          0
        );
        const totalDisbursedYtd = (ytdDisbursedResult?.data || []).reduce(
          (sum, l) => sum + Number(l.principal_amount || 0),
          0
        );

        // Overdue loans — distinct loan_ids that intersect with active loans
        const overdueLoanIds = new Set(
          (overdueResult?.data || [])
            .map((s) => s.loan_id)
            .filter((id) => activeLoanIds.has(id))
        );
        const overdueRate = activeLoans.length
          ? (overdueLoanIds.size / activeLoans.length) * 100
          : 0;

        setPortfolio({
          totalActive: activeLoans.length,
          totalDisbursedYtd,
          totalPrincipalOutstanding,
          overdueLoans: overdueLoanIds.size,
          overdueRate,
        });

        // Loan type distribution (active loans only)
        const typeCounts = new Map();
        const typeAmounts = new Map();
        activeLoans.forEach((l) => {
          const name = l.loan_types?.name || "Other";
          typeCounts.set(name, (typeCounts.get(name) || 0) + 1);
          typeAmounts.set(
            name,
            (typeAmounts.get(name) || 0) +
              Number(l.principal_amount ?? l.loan_amount ?? 0)
          );
        });
        setLoanTypeBreakdown(
          [...typeCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, count], i) => ({
              name,
              count,
              amount: typeAmounts.get(name) || 0,
              color: TYPE_COLORS[i % TYPE_COLORS.length],
            }))
        );

        // MIGS breakdown — latest snapshot per member
        const totalMembers = memberCountResult?.count || 0;
        const seen = new Set();
        let migsCount = 0;
        let nonMigsCount = 0;
        (migsSnapshotResult?.data || []).forEach((row) => {
          const mid = row.membership_number_id;
          if (!mid || seen.has(mid)) return;
          seen.add(mid);
          // total_score >= 50 → MIGS Qualified
          if (Number(row.total_score || 0) >= 50) migsCount += 1;
          else nonMigsCount += 1;
        });
        const unscored = Math.max(totalMembers - seen.size, 0);
        setMigsBreakdown([
          { name: "MIGS Qualified", value: migsCount, color: MIGS_COLORS.migs },
          { name: "Non-MIGS", value: nonMigsCount, color: MIGS_COLORS.nonMigs },
          { name: "Unscored", value: unscored, color: MIGS_COLORS.unscored },
        ]);

        // Monthly approvals (12-month bar chart)
        const buckets = new Map();
        for (let i = 11; i >= 0; i -= 1) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
          buckets.set(key, { approved: 0, amount: 0 });
        }
        (twelveMonthApprovalsResult?.data || []).forEach((row) => {
          if (!row.application_date) return;
          const d = new Date(row.application_date);
          const key = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
          if (buckets.has(key)) {
            const b = buckets.get(key);
            b.approved += 1;
            b.amount += Number(row.principal_amount || 0);
            buckets.set(key, b);
          }
        });
        setMonthlyApprovals(
          [...buckets.entries()].map(([name, v]) => ({
            name,
            approved: v.approved,
            amount: v.amount,
          }))
        );

        // Top 5 borrowers by outstanding principal
        const borrowerTotals = new Map();
        activeLoans.forEach((l) => {
          if (!l.member_id) return;
          const key = l.member_id;
          const prev = borrowerTotals.get(key) || {
            member_id: l.member_id,
            name: `${l.member?.first_name || ""} ${l.member?.last_name || ""}`.trim() || "Unknown",
            membership_id: l.member?.membership_id || null,
            loans: 0,
            outstanding: 0,
          };
          prev.loans += 1;
          prev.outstanding += Number(l.principal_amount ?? l.loan_amount ?? 0);
          borrowerTotals.set(key, prev);
        });
        setTopBorrowers(
          [...borrowerTotals.values()]
            .sort((a, b) => b.outstanding - a.outstanding)
            .slice(0, 5)
        );
      } catch (err) {
        if (isMounted) {
          setError(err?.message || "Unable to load reports.");
          addNotification(err?.message || "Unable to load reports.", "error");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadReports();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const migsTotal = useMemo(
    () => migsBreakdown.reduce((s, b) => s + b.value, 0),
    [migsBreakdown]
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity
              className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold"
              fallbackPortal="Manager Portal"
              fallbackRole="Manager"
            />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
            const routeMap = {
              Dashboard: "/manager-dashboard",
              "Loan Approval": "/loan-approval",
              "Manage Member": "/manager-manage-member",
              Reports: "/manager-reports",
            };
            return menuItems.map((item) => {
              const Icon = item.icon;
              const to =
                routeMap[item.name] ||
                `/${item.name.toLowerCase().replace(/\s+/g, "-")}`;
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

      {/* MAIN */}
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
          <LoanNotificationBell role="manager" />
          <img
            src="/img/bookkeeper-profile.png"
            alt="Profile"
            className="ml-4 w-8 h-8 rounded-full bg-gray-200"
          />
          <PortalTopbarIdentity
            className="text-sm font-medium text-gray-700"
            fallbackRole="Manager"
          />
        </header>

        <main className="p-8">
          {/* TITLE */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Portfolio Reports</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Cooperative-wide read-only view for Manager oversight and Board reporting.
              </p>
            </div>
          </div>

          {loading && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
              <Clock size={16} /> Loading portfolio metrics…
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* KPI ROW */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500">Total Active Loans</p>
                <Banknote className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {loading ? "—" : portfolio.totalActive}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Released or partially paid</p>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500">Outstanding Principal</p>
                <Wallet className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {loading ? "—" : formatCurrency(portfolio.totalPrincipalOutstanding)}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Across all active loans</p>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500">Disbursed YTD</p>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {loading ? "—" : formatCurrency(portfolio.totalDisbursedYtd)}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Calendar year to date</p>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500">Overdue Rate</p>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {loading ? "—" : `${portfolio.overdueRate.toFixed(1)}%`}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                {portfolio.overdueLoans} active loans with overdue schedules
              </p>
            </div>
          </div>

          {/* CHARTS ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {/* Monthly approvals (2/3 width) */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-gray-500" />
                <h3 className="text-gray-800 font-bold text-sm">Loan Activity — Last 12 Months</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <BarChart data={monthlyApprovals} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <Tooltip
                      cursor={{ fill: "#f9fafb" }}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                      formatter={(v, n) => (n === "amount" ? formatCurrency(v) : v)}
                    />
                    <Bar dataKey="approved" fill="#166534" radius={[4, 4, 0, 0]} name="Loans" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* MIGS Distribution (1/3 width) */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Award className="w-4 h-4 text-gray-500" />
                <h3 className="text-gray-800 font-bold text-sm">MIGS Distribution</h3>
              </div>
              <div className="relative h-44 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <PieChart>
                    <Pie
                      data={migsBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={1}
                      dataKey="value"
                      stroke="none"
                    >
                      {migsBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute flex flex-col items-center">
                  <span className="text-xl font-bold text-gray-800">{migsTotal}</span>
                  <span className="text-[9px] text-gray-400 font-bold tracking-widest">MEMBERS</span>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                {migsBreakdown.map((row, i) => (
                  <div key={i} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }}></span>
                      <span className="text-gray-600">{row.name}</span>
                    </div>
                    <span className="font-bold text-gray-800">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SECONDARY ROW: Loan type table + Top borrowers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-gray-800 font-bold text-sm">Active Loans by Type</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#66B538] text-white uppercase tracking-wider text-[10px]">
                    <th className="px-4 py-2.5 text-left font-semibold">Type</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Count</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                        Loading…
                      </td>
                    </tr>
                  ) : loanTypeBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-gray-400 italic">
                        No active loans yet
                      </td>
                    </tr>
                  ) : (
                    loanTypeBreakdown.map((row) => (
                      <tr key={row.name} className="hover:bg-gray-50">
                        <td className="px-4 py-2 flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: row.color }}
                          ></span>
                          <span className="text-gray-800 font-medium">{row.name}</span>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700 tabular-nums">{row.count}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900 tabular-nums">
                          {formatCurrency(row.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-gray-800 font-bold text-sm">Top 5 Borrowers — Outstanding</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#66B538] text-white uppercase tracking-wider text-[10px]">
                    <th className="px-4 py-2.5 text-left font-semibold">Member</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Active Loans</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                        Loading…
                      </td>
                    </tr>
                  ) : topBorrowers.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-gray-400 italic">
                        No active borrowers
                      </td>
                    </tr>
                  ) : (
                    topBorrowers.map((b) => (
                      <tr key={b.member_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <p className="text-gray-900 font-medium">{b.name}</p>
                          {b.membership_id ? (
                            <p className="text-[10px] text-gray-500 mt-0.5">{b.membership_id}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700 tabular-nums">{b.loans}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900 tabular-nums">
                          {formatCurrency(b.outstanding)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Manager_Reports;
