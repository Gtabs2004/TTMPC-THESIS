import React, { useEffect, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { bodNav } from "../../components/StaffSidebar/configs/bod";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import Breadcrumb from "../../components/Breadcrumb";
import LoanDemandForecastCard from "../../components/LoanDemandForecastCard";
import { supabase } from "../../supabaseClient";
import {
  LayoutDashboard,
  Users,
  Archive,
  CalendarCheck,
  Search,
  Download,
  Calendar,
  TrendingUp,
  AlertCircle,
  CreditCard,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  ShieldCheck,
  AlertTriangle,
  CalendarDays,
  History,
  Loader2,
} from 'lucide-react';
import NotificationBell from "../../components/NotificationBell";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { GENDER_COLORS, CATEGORICAL_PALETTE } from '../../lib/chartColors';

// Member loan types (CLAUDE.md) — the "Approved Loans per Month" breakdown
// gets one clearly-labeled series per type, not just a consolidated total.
// Order here also sets stacking/legend order.
const APPROVED_LOAN_TYPE_LABELS = ['Consolidated Loan', 'Bonus Loan', 'Emergency Loan'];
const APPROVED_LOAN_TYPE_COLORS = Object.fromEntries(
  APPROVED_LOAN_TYPE_LABELS.map((label, i) => [label, CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]])
);
// `loans.loan_types.name` ("Consolidated Loan", "Bonus Loan", "Emergency
// Loan" as actually stored) -> one of the labels above.
const resolveApprovedLoanTypeLabel = (rawName) => {
  const t = String(rawName || '').toLowerCase();
  if (t.includes('consolidated')) return 'Consolidated Loan';
  if (t.includes('emergency')) return 'Emergency Loan';
  if (t.includes('bonus')) return 'Bonus Loan';
  return null;
};

const formatCurrency = (v) => `₱${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const formatDateShort = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};
const monthKey = (d) => d.toLocaleDateString('en-US', { month: 'short' });

const Dashboard_BOD = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [chartsReady, setChartsReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const [kpis, setKpis] = useState({
    totalLoansCount: 0,
    latePaymentsCount: 0,
    activeLoansCount: 0,
    approvedThisMonth: 0,
  });
  const [approvedTrend, setApprovedTrend] = useState([]);
  const [genderData, setGenderData] = useState([]);
  const [genderTotal, setGenderTotal] = useState(0);
  const [recentTxns, setRecentTxns] = useState([]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setChartsReady(true));
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const sixMoStart = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10);

        const [
          activeLoansRes,
          allDisbursedRes,
          totalLoansCountRes,
          overdueSchedRes,
          approvedTrendRes,
          gendersRes,
          recentPaymentsRes,
          recentDisbursalRes,
        ] = await Promise.all([
          supabase
            .from('loans')
            .select('control_number, member_id, principal_amount, loan_amount, monthly_amortization, term, loan_status')
            .in('loan_status', ['released', 'partially paid'])
            .limit(10000),
          supabase
            .from('loans')
            .select('loan_amount, principal_amount, disbursal_date')
            .in('loan_status', ['released', 'partially paid', 'fully paid'])
            .limit(20000),
          supabase
            .from('loans')
            .select('control_number', { count: 'exact', head: true }),
          supabase
            .from('loan_schedules')
            .select('loan_id, due_date, schedule_status')
            .in('schedule_status', ['Unpaid', 'unpaid', 'Overdue', 'overdue', 'Pending', 'pending'])
            .gte('due_date', sixMoStart)
            .lt('due_date', now.toISOString().slice(0, 10))
            .limit(20000),
          supabase
            .from('loans')
            .select('disbursal_date, loan_status, loan_types:loan_type_id(name)')
            .gte('disbursal_date', sixMoStart)
            .in('loan_status', ['released', 'partially paid', 'fully paid'])
            .limit(20000),
          supabase
            .from('personal_data_sheet')
            .select('gender')
            .limit(20000),
          supabase
            .from('loan_payments')
            .select('id, loan_id, amount_paid, payment_date, confirmation_status, payment_reference')
            .order('payment_date', { ascending: false })
            .limit(5),
          supabase
            .from('loans')
            .select('control_number, loan_amount, disbursal_date, loan_status, member:member_id(first_name, last_name), loan_types:loan_type_id(name)')
            .not('disbursal_date', 'is', null)
            .order('disbursal_date', { ascending: false })
            .limit(5),
        ]);

        if (cancelled) return;

        const activeLoans = activeLoansRes?.data || [];
        const allDisbursed = allDisbursedRes?.data || [];
        const overdueSched = overdueSchedRes?.data || [];
        const approvedRows = approvedTrendRes?.data || [];
        const genderRows = gendersRes?.data || [];
        const recentPayments = recentPaymentsRes?.data || [];
        const recentDisbursals = recentDisbursalRes?.data || [];

        const totalLoansCount = totalLoansCountRes?.count || 0;
        const activeIds = new Set(activeLoans.map((l) => l.control_number));
        // One count per overdue/unpaid/pending installment past its due date
        // on a currently active loan — i.e. an actual number of late
        // payments, not the distinct loans they belong to or a percentage.
        const latePaymentsCount = overdueSched.filter((s) => activeIds.has(s.loan_id)).length;
        // Same record set used for latePaymentsCount above — loans currently
        // disbursed and not yet fully repaid ('released' = disbursed, no
        // payments recorded yet; 'partially paid' = actively being repaid).
        // Counting from that array (not a separate query) guarantees this
        // KPI and the rest of the dashboard can never disagree on which
        // loans count as "active".
        const activeLoansCount = activeLoans.length;
        const approvedThisMonth = allDisbursed.filter(
          (l) => l.disbursal_date && l.disbursal_date >= monthStart
        ).length;

        setKpis({ totalLoansCount, latePaymentsCount, activeLoansCount, approvedThisMonth });

        // Approved-per-month trend, broken down by loan type (via
        // loan_types.name on each disbursed loan).
        const approvedBuckets = new Map();
        for (let i = 5; i >= 0; i -= 1) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          approvedBuckets.set(monthKey(d), {
            month: monthKey(d),
            ...Object.fromEntries(APPROVED_LOAN_TYPE_LABELS.map((label) => [label, 0])),
          });
        }
        approvedRows.forEach((r) => {
          if (!r.disbursal_date) return;
          const label = resolveApprovedLoanTypeLabel(r.loan_types?.name);
          if (!label) return;
          const slot = approvedBuckets.get(monthKey(new Date(r.disbursal_date)));
          if (slot) slot[label] += 1;
        });
        setApprovedTrend([...approvedBuckets.values()]);

        // Gender distribution
        const genderCounts = new Map();
        genderRows.forEach((r) => {
          const raw = String(r.gender || '').trim();
          if (!raw) return;
          const norm = raw.toLowerCase().startsWith('f') ? 'Female'
            : raw.toLowerCase().startsWith('m') ? 'Male'
            : 'Other';
          genderCounts.set(norm, (genderCounts.get(norm) || 0) + 1);
        });
        const genderArr = [...genderCounts.entries()].map(([name, value]) => ({ name, value }));
        setGenderData(genderArr);
        setGenderTotal(genderArr.reduce((s, g) => s + g.value, 0));

        // Recent transactions — disbursals + payments
        const memberNameByLoan = new Map();
        recentDisbursals.forEach((l) => {
          const m = l.member || {};
          memberNameByLoan.set(l.control_number, `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Member');
        });
        const txnRows = [];
        recentDisbursals.forEach((l) => {
          txnRows.push({
            id: l.control_number,
            member: memberNameByLoan.get(l.control_number) || 'Member',
            type: `${l.loan_types?.name || 'Loan'} Disbursement`,
            amountValue: Number(l.loan_amount || 0),
            date: l.disbursal_date,
            status: 'Completed',
            isCredit: false,
          });
        });
        recentPayments.forEach((p) => {
          const status = String(p.confirmation_status || '').toLowerCase();
          const isPending = status.includes('pending');
          txnRows.push({
            id: p.payment_reference || `PMT-${p.id}`,
            member: memberNameByLoan.get(p.loan_id) || p.loan_id || 'Member',
            type: 'Loan Repayment',
            amountValue: Number(p.amount_paid || 0),
            date: p.payment_date,
            status: isPending ? 'Pending' : 'Completed',
            isCredit: true,
          });
        });
        txnRows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        setRecentTxns(txnRows.slice(0, 6));
      } catch (err) {
        if (!cancelled) addNotification(err?.message || 'Failed to load BOD dashboard data.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <StaffSidebar portal="BOD" items={bodNav} />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        {/* TOPBAR */}
        <StaffTopbar portal="BOD" notifications={<NotificationBell />} />

        {/* SCROLLABLE DASHBOARD CONTENT */}
        <main className="flex-1 overflow-y-auto p-8">
          <Breadcrumb portal="BOD" page="Dashboard" />
          {/* Action Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="font-bold text-2xl text-gray-800">TTMPC   Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">Real-time cooperative performance metrics</p>
            </div>

          </div>

          {/* ROW 1: QUICK INSIGHTS (KPIs) */}
          <StatCardRow cols={4}>
            <StatCard
              label="Total Loan Applications"
              value={loading ? '—' : kpis.totalLoansCount.toLocaleString()}
              icon={TrendingUp}
              iconColor="text-[#2C7A3F]"
              subtext="All loans on file in the cooperative"
            />
            <StatCard
              label="Number of Late Payments"
              value={loading ? '—' : kpis.latePaymentsCount.toLocaleString()}
              icon={AlertCircle}
              iconColor="text-red-500"
              subtext="Overdue installments on active loans"
            />
            <StatCard
              label="Total Active Loans"
              value={loading ? '—' : kpis.activeLoansCount.toLocaleString()}
              icon={CreditCard}
              iconColor="text-blue-500"
              subtext="Loans currently released or partially paid"
            />
            <StatCard
              label="Approved Loan This Month"
              value={loading ? '—' : kpis.approvedThisMonth}
              icon={CheckCircle2}
              iconColor="text-[#2C7A3F]"
              subtext={`Disbursed in ${new Date().toLocaleDateString('en-US', { month: 'long' })}`}
            />
          </StatCardRow>

          {/* ROW 2: TRENDS & DEMOGRAPHICS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 min-w-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-w-0">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Approved Loans per Month</h3>
              <p className="text-sm text-gray-500 mb-4">Disbursed loans over the last 6 months, by loan type</p>
              <div className="h-72">
                {chartsReady ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                  <BarChart data={approvedTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} allowDecimals={false} />
                    <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#FFFFFF', padding: '12px' }}/>
                    <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                    {/* Stacked so the combined bar height still reads as the
                        consolidated total, while each loan type stays its
                        own clearly-labeled, distinctly-colored series. */}
                    {APPROVED_LOAN_TYPE_LABELS.map((label, i) => (
                      <Bar
                        key={label}
                        dataKey={label}
                        name={label}
                        stackId="approved"
                        fill={APPROVED_LOAN_TYPE_COLORS[label]}
                        radius={i === APPROVED_LOAN_TYPE_LABELS.length - 1 ? [6, 6, 0, 0] : 0}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer> : <div className="h-full w-full rounded-lg bg-gray-50" />}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center min-w-0">
              <div className="w-full flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Gender Distribution</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Member composition</p>
                </div>
                <span className="text-xs font-medium bg-green-50 text-green-700 px-3 py-1 rounded-lg">{genderTotal} Members</span>
              </div>
              <div className="h-48 w-full">
                {chartsReady && genderData.length > 0 ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
                  <PieChart>
                    <Pie
                      data={genderData}
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="white"
                      strokeWidth={2}
                    >
                      {genderData.map((entry, index) => <Cell key={`cell-${index}`} fill={GENDER_COLORS[index % GENDER_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#FFFFFF', padding: '12px' }} formatter={(value) => `${value} members`} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ paddingTop: '16px' }} />
                  </PieChart>
                </ResponsiveContainer> : <div className="h-full w-full rounded-lg bg-gray-50 flex items-center justify-center text-xs text-gray-400">{loading ? 'Loading…' : 'No gender data available'}</div>}
              </div>
            </div>
          </div>

          {/* ROW 3: TRANSACTION HISTORY */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Recent Transactions</h3>
              <button className="text-sm text-[#2C7A3F] font-medium hover:underline">View All</button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Transaction ID</th>
                    <th className="p-5 font-bold">Member / Entity</th>
                    <th className="p-5 font-bold">Type</th>
                    <th className="p-5 font-bold">Date</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-10 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Loader2 size={24} className="text-gray-300 animate-spin" />
                          <p className="text-sm text-gray-400">Loading...</p>
                        </div>
                      </td>
                    </tr>
                  ) : recentTxns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-10 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <History size={32} className="text-gray-300" />
                          <p className="text-sm font-medium text-gray-500">No recent transactions.</p>
                        </div>
                      </td>
                    </tr>
                  ) : recentTxns.map((txn) => (
                    <tr key={`${txn.id}-${txn.date}`} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="p-5 text-sm font-medium text-gray-900">{txn.id}</td>
                      <td className="p-5 text-sm">{txn.member}</td>
                      <td className="p-5 text-sm text-gray-500">{txn.type}</td>
                      <td className="p-5 text-sm text-gray-500">{formatDateShort(txn.date)}</td>
                      <td className="p-5 text-sm text-right font-medium">
                        <div className="flex items-center justify-end gap-1">
                          {txn.isCredit ? <ArrowDownRight className="w-4 h-4 text-green-500" /> : <ArrowUpRight className="w-4 h-4 text-red-500" />}
                          <span className={txn.isCredit ? "text-green-600" : "text-gray-800"}>{formatCurrency(txn.amountValue)}</span>
                        </div>
                      </td>
                      <td className="p-5 text-sm text-center">
                        {txn.status === 'Completed' ? (
                          <span className="badge-animated inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Completed
                          </span>
                        ) : (
                          <span className="badge-animated inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8">
            <LoanDemandForecastCard defaultLoanType="consolidated" periods={12} />
          </div>

        </main>
      </div>
    </div>
  );
};

export default Dashboard_BOD;