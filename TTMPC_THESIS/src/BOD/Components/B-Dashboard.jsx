import React, { useEffect, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { bodNav } from "../../components/StaffSidebar/configs/bod";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
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
  History
} from 'lucide-react';
import NotificationBell from "./NotificationBell";
import {
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const COLORS = ['#2C7A3F', '#4ADE80', '#9CA3AF'];

const formatCurrency = (v) => `₱${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const formatCurrencyShort = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `₱${(n / 1_000).toFixed(1)}K`;
  return `₱${n.toFixed(0)}`;
};
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
    delinquencyRate: 0,
    avgDebtCapacity: 0,
    approvedThisMonth: 0,
  });
  const [delinquencyTrend, setDelinquencyTrend] = useState([]);
  const [approvedTrend, setApprovedTrend] = useState([]);
  const [genderData, setGenderData] = useState([]);
  const [genderTotal, setGenderTotal] = useState(0);
  const [debtScatter, setDebtScatter] = useState([]);
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
          paymentsRes,
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
            .from('loan_payments')
            .select('loan_id, amount_paid, payment_date, confirmation_status')
            .limit(20000),
          supabase
            .from('loan_schedules')
            .select('loan_id, due_date, schedule_status')
            .eq('schedule_status', 'overdue')
            .gte('due_date', sixMoStart)
            .limit(20000),
          supabase
            .from('loans')
            .select('disbursal_date, loan_status')
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
        const allPayments = paymentsRes?.data || [];
        const overdueSched = overdueSchedRes?.data || [];
        const approvedRows = approvedTrendRes?.data || [];
        const genderRows = gendersRes?.data || [];
        const recentPayments = recentPaymentsRes?.data || [];
        const recentDisbursals = recentDisbursalRes?.data || [];

        const totalLoansCount = totalLoansCountRes?.count || 0;
        const activeIds = new Set(activeLoans.map((l) => l.control_number));
        const overdueLoanIds = new Set(
          overdueSched.map((s) => s.loan_id).filter((id) => activeIds.has(id))
        );
        const delinquencyRate = activeLoans.length
          ? (overdueLoanIds.size / activeLoans.length) * 100
          : 0;
        const avgDebt = activeLoans.length
          ? activeLoans.reduce((s, l) => s + Number(l.principal_amount || l.loan_amount || 0), 0) / activeLoans.length
          : 0;
        const approvedThisMonth = allDisbursed.filter(
          (l) => l.disbursal_date && l.disbursal_date >= monthStart
        ).length;

        setKpis({ totalLoansCount, delinquencyRate, avgDebtCapacity: avgDebt, approvedThisMonth });

        // Delinquency trajectory — last 6 mo, bucketed 30/60/90
        const buckets = new Map();
        for (let i = 5; i >= 0; i -= 1) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          buckets.set(monthKey(d), { month: monthKey(d), '30-Day': 0, '60-Day': 0, '90-Day': 0 });
        }
        overdueSched.forEach((s) => {
          if (!s.due_date) return;
          const due = new Date(s.due_date);
          const ageDays = Math.floor((now - due) / (1000 * 60 * 60 * 24));
          if (ageDays < 0) return;
          const key = monthKey(due);
          if (!buckets.has(key)) return;
          const slot = buckets.get(key);
          if (ageDays >= 90) slot['90-Day'] += 1;
          else if (ageDays >= 60) slot['60-Day'] += 1;
          else if (ageDays >= 30) slot['30-Day'] += 1;
        });
        setDelinquencyTrend([...buckets.values()]);

        // Approved-per-month trend
        const approvedBuckets = new Map();
        for (let i = 5; i >= 0; i -= 1) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          approvedBuckets.set(monthKey(d), { month: monthKey(d), count: 0 });
        }
        approvedRows.forEach((r) => {
          if (!r.disbursal_date) return;
          const d = new Date(r.disbursal_date);
          const key = monthKey(d);
          if (approvedBuckets.has(key)) approvedBuckets.get(key).count += 1;
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

        // Debt vs repayment speed scatter
        const validatedByLoan = new Map();
        allPayments.forEach((p) => {
          const status = String(p.confirmation_status || '').toLowerCase();
          if (!status.includes('valid') && status !== 'confirmed' && status !== 'approved') return;
          validatedByLoan.set(p.loan_id, (validatedByLoan.get(p.loan_id) || 0) + Number(p.amount_paid || 0));
        });
        const scatter = activeLoans.slice(0, 200).map((l) => {
          const principal = Number(l.principal_amount || l.loan_amount || 0);
          const monthly = Number(l.monthly_amortization || 0);
          const term = Number(l.term || 0);
          const expected = monthly * term || principal;
          const paid = validatedByLoan.get(l.control_number) || 0;
          const speed = expected > 0 ? Math.min(100, Math.round((paid / expected) * 100)) : 0;
          return { debt: principal, repaymentSpeed: speed };
        }).filter((d) => d.debt > 0);
        setDebtScatter(scatter);

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
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input type="text" className="bg-gray-50 w-72 h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]" placeholder="Search..." />
          </div>
          <NotificationBell />
          <img src="/img/bookkeeper-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="BOD" />
        </header>
        
        {/* SCROLLABLE DASHBOARD CONTENT */}
        <main className="flex-1 overflow-y-auto p-8">
          
          {/* Action Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="font-bold text-2xl text-gray-800">Analytical Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">Real-time cooperative performance metrics</p>
            </div>

          </div>

          {/* ROW 1: QUICK INSIGHTS (KPIs) */}
          <StatCardRow cols={4}>
            <StatCard
              label="Total Loans"
              value={loading ? '—' : kpis.totalLoansCount.toLocaleString()}
              icon={TrendingUp}
              iconColor="text-[#2C7A3F]"
              subtext="All loans on file in the cooperative"
            />
            <StatCard
              label="Delinquency Rate"
              value={loading ? '—' : `${kpis.delinquencyRate.toFixed(1)}%`}
              icon={AlertCircle}
              iconColor="text-red-500"
              subtext="Active loans with overdue schedules"
            />
            <StatCard
              label="Avg Debt Capacity"
              value={loading ? '—' : formatCurrencyShort(kpis.avgDebtCapacity)}
              icon={CreditCard}
              iconColor="text-blue-500"
              subtext="Mean principal across active loans"
            />
            <StatCard
              label="Approved This Month"
              value={loading ? '—' : kpis.approvedThisMonth}
              icon={CheckCircle2}
              iconColor="text-[#2C7A3F]"
              subtext={`Disbursed in ${new Date().toLocaleDateString('en-US', { month: 'long' })}`}
            />
          </StatCardRow>

          {/* ROW 2: STRATEGIC TRENDS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 min-w-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-w-0">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Approved Loans per Month</h3>
              <p className="text-sm text-gray-500 mb-4">Disbursed loans over the last 6 months</p>
              <div className="h-72">
                {chartsReady ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                  <BarChart data={approvedTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} allowDecimals={false} />
                    <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#FFFFFF', padding: '12px' }}/>
                    <Bar dataKey="count" name="Approved" fill="#2C7A3F" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer> : <div className="h-full w-full rounded-lg bg-gray-50" />}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-w-0">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Delinquency Trajectory (30/60/90 Days)</h3>
              <p className="text-sm text-gray-500 mb-4">Stacked delinquency aging by month</p>
              <div className="h-72">
                {chartsReady ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                  <BarChart data={delinquencyTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} allowDecimals={false} />
                    <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#FFFFFF', padding: '12px' }}/>
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar dataKey="30-Day" stackId="a" fill="#FCD34D" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="60-Day" stackId="a" fill="#F97316" />
                    <Bar dataKey="90-Day" stackId="a" fill="#EF4444" radius={[0, 0, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer> : <div className="h-full w-full rounded-lg bg-gray-50" />}
              </div>
            </div>
          </div>

          {/* ROW 3: DEMOGRAPHICS & DIAGNOSTICS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 min-w-0">
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
                      {genderData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#FFFFFF', padding: '12px' }} formatter={(value) => `${value} members`} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ paddingTop: '16px' }} />
                  </PieChart>
                </ResponsiveContainer> : <div className="h-full w-full rounded-lg bg-gray-50 flex items-center justify-center text-xs text-gray-400">{loading ? 'Loading…' : 'No gender data available'}</div>}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-w-0">
              <h3 className="text-sm font-bold text-gray-800 mb-1">Debt Capacity vs Repayment Speed</h3>
              <p className="text-xs text-gray-500 mb-4">Per-loan principal vs % paid of expected</p>
              <div className="h-48">
                {chartsReady && debtScatter.length > 0 ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
                  <ScatterChart margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f0f0f0" />
                    <XAxis type="number" dataKey="debt" name="Principal" tickFormatter={(val) => `${(val/1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <YAxis type="number" dataKey="repaymentSpeed" name="Speed %" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <Tooltip cursor={{ strokeDasharray: '0' }} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#FFFFFF', padding: '12px' }} formatter={(value, name) => name === 'Principal' ? formatCurrency(value) : `${value}%`} />
                    <Scatter name="Loans" data={debtScatter} fill="#10B981" />
                  </ScatterChart>
                </ResponsiveContainer> : <div className="h-full w-full rounded-lg bg-gray-50 flex items-center justify-center text-xs text-gray-400">{loading ? 'Loading…' : 'No active loans to plot'}</div>}
              </div>
            </div>
          </div>

          {/* ROW 4: TRANSACTION HISTORY */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Recent Transactions</h3>
              <button className="text-sm text-[#2C7A3F] font-medium hover:underline">View All</button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
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
                    <tr><td colSpan={6} className="p-5 text-sm text-center text-gray-400">Loading transactions…</td></tr>
                  ) : recentTxns.length === 0 ? (
                    <tr><td colSpan={6} className="p-5 text-sm text-center text-gray-400">No recent transactions.</td></tr>
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