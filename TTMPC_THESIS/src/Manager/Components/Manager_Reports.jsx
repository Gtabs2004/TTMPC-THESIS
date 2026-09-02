import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { managerNav } from "../../components/StaffSidebar/configs/manager";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import Breadcrumb from "../../components/Breadcrumb";
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
  History,
  Brain,
  ClipboardCheck,
  Briefcase,
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
const MIGS_COLORS = { migs: "#166534", nonMigs: "#dc2626",  };

const Manager_Reports = () => {
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
      <StaffSidebar portal="Manager" items={managerNav} />

      {/* MAIN */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Manager" notifications={<LoanNotificationBell role="manager" />} />

        <main className="p-8">
          <Breadcrumb portal="Manager" page="Portfolio Reports" />
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
          <StatCardRow cols={4}>
            <StatCard
              label="Total Active Loans"
              value={loading ? "—" : portfolio.totalActive}
              icon={Banknote}
              iconColor="text-blue-600"
              subtext="Released or partially paid"
            />
            <StatCard
              label="Outstanding Principal"
              value={loading ? "—" : formatCurrency(portfolio.totalPrincipalOutstanding)}
              icon={Wallet}
              iconColor="text-green-600"
              subtext="Across all active loans"
            />
            <StatCard
              label="Disbursed YTD"
              value={loading ? "—" : formatCurrency(portfolio.totalDisbursedYtd)}
              icon={CheckCircle2}
              iconColor="text-emerald-600"
              subtext="Calendar year to date"
            />
            <StatCard
              label="Overdue Rate"
              value={loading ? "—" : `${portfolio.overdueRate.toFixed(1)}%`}
              icon={AlertTriangle}
              iconColor="text-rose-600"
              subtext={`${portfolio.overdueLoans} active loans with overdue schedules`}
            />
          </StatCardRow>

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
                <h3 className="text-gray-800 font-bold text-sm">Member Classification</h3>
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
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold text-left">Type</th>
                    <th className="p-5 font-bold text-left">Count</th>
                    <th className="p-5 font-bold text-left">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="p-5 text-sm text-center text-gray-500">
                        Loading…
                      </td>
                    </tr>
                  ) : loanTypeBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-5 text-sm text-center text-gray-400 italic">
                        No active loans yet
                      </td>
                    </tr>
                  ) : (
                    loanTypeBreakdown.map((row) => (
                      <tr key={row.name} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-sm flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: row.color }}
                          ></span>
                          <span className="text-gray-800 font-medium">{row.name}</span>
                        </td>
                        <td className="p-5 text-sm text-right text-gray-700 tabular-nums text-left">{row.count}</td>
                        <td className="p-5 text-sm text-right font-semibold text-gray-900 tabular-nums text-left">
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
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Member</th>
                    <th className="p-5 font-bold text-right">Active Loans</th>
                    <th className="p-5 font-bold text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="p-5 text-sm text-center text-gray-500">
                        Loading…
                      </td>
                    </tr>
                  ) : topBorrowers.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-5 text-sm text-center text-gray-400 italic">
                        No active borrowers
                      </td>
                    </tr>
                  ) : (
                    topBorrowers.map((b) => (
                      <tr key={b.member_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-sm">
                          <p className="text-gray-900 font-medium">{b.name}</p>
                          {b.membership_id ? (
                            <p className="text-[10px] text-gray-500 mt-0.5">{b.membership_id}</p>
                          ) : null}
                        </td>
                        <td className="p-5 text-sm text-right text-gray-700 tabular-nums">{b.loans}</td>
                        <td className="p-5 text-sm text-right font-semibold text-gray-900 tabular-nums">
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
