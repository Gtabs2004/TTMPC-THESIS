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
import { useQuery } from "@tanstack/react-query";
import { Skeleton, SkeletonChart, SkeletonDonut, SkeletonTableRows } from "../../components/Skeleton";
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
  X,
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
import { GENDER_COLORS, GREEN } from '../../lib/chartColors';
import { loanStatusBadge } from '../../utils/transactionStatus';

// Member loan types (CLAUDE.md) — the "Approved Loans per Month" breakdown
// gets one clearly-labeled series per type, not just a consolidated total.
// Order here also sets stacking/legend order.
const APPROVED_LOAN_TYPE_LABELS = ['Consolidated Loan', 'Bonus Loan', 'Emergency Loan'];
// Distinct hues per loan type (not the shared green ramp) so the series are
// tellable apart at a glance; Consolidated keeps the cooperative green.
const APPROVED_LOAN_TYPE_COLORS = {
  'Consolidated Loan': GREEN.dark,
  'Bonus Loan': '#2563eb',
  'Emergency Loan': '#f59e0b',
};
// `loans.loan_types.name` ("Consolidated Loan", "Bonus Loan", "Emergency
// Loan" as actually stored) -> one of the labels above.
const resolveApprovedLoanTypeLabel = (rawName) => {
  const t = String(rawName || '').toLowerCase();
  if (t.includes('consolidated')) return 'Consolidated Loan';
  if (t.includes('emergency')) return 'Emergency Loan';
  if (t.includes('bonus')) return 'Bonus Loan';
  return null;
};

// Consolidated split — same EXCLUSIVE rule as main.py's _BOD_LOAN_THRESHOLD:
// > ₱500,000 goes to BOD, exactly ₱500,000 stays in the standard queue.
const BOD_LOAN_THRESHOLD = 500000;
const CONSOL_ABOVE = 'Above ₱500K';
const CONSOL_BELOW = '₱500K & Below';
const CONSOL_BAND_COLORS = {
  [CONSOL_ABOVE]: '#ea580c',
  [CONSOL_BELOW]: GREEN.dark,
};
const APPROVED_CHART_TABS = [
  { key: 'all', label: 'All Types' },
  { key: 'Consolidated Loan', label: 'Consolidated' },
  { key: 'Emergency Loan', label: 'Emergency' },
  { key: 'Bonus Loan', label: 'Bonus' },
];
const CONSOL_FILTERS = [
  { key: 'all', label: 'All Amounts' },
  { key: CONSOL_ABOVE, label: '> ₱500K' },
  { key: CONSOL_BELOW, label: '≤ ₱500K' },
];

// Fixed per gender (not by slice order) so each always keeps its color.
const GENDER_SLICE_COLORS = { Male: GREEN.dark, Female: '#ea580c' };

const formatCurrency = (v) => `₱${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const formatDateShort = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};
const monthKey = (d) => d.toLocaleDateString('en-US', { month: 'short' });

// Everything the dashboard shows, fetched in one parallel batch (plus one
// small dependent lookup). Lives outside the component so TanStack Query can
// cache it under BOD_DASHBOARD_QUERY_KEY across navigation.
const BOD_DASHBOARD_QUERY_KEY = ['dashboard', 'bod'];
async function fetchBodDashboard() {
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
    recentApplicationsRes,
    recentSavingsRes,
    recentFeesRes,
    recentGroceryRes,
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
      .select('disbursal_date, loan_status, loan_amount, principal_amount, loan_types:loan_type_id(name)')
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
      .select('control_number, loan_amount, disbursal_date, loan_status, member:member_id(first_name, last_name, membership_id), loan_types:loan_type_id(name)')
      .not('disbursal_date', 'is', null)
      .order('disbursal_date', { ascending: false })
      .limit(5),
    // Loan applications — the act of applying, not the loan's current
    // status, so this is keyed off application_date regardless of
    // where the loan is now in its lifecycle.
    supabase
      .from('loans')
      .select('control_number, loan_amount, application_date, loan_status, member:member_id(first_name, last_name, membership_id), loan_types:loan_type_id(name)')
      .not('application_date', 'is', null)
      .order('application_date', { ascending: false })
      .limit(5),
    // Savings deposits/withdrawals. entry_type: 'credit' = deposit,
    // 'debit' = withdrawal (see savings_accounts_schema.sql).
    supabase
      .from('savings_ledger')
      .select('id, account_number, entry_type, amount, reference, posted_at, savings_accounts:account_number(member_id, member:member_id(first_name, last_name, membership_id))')
      .order('posted_at', { ascending: false })
      .limit(5),
    // Membership fee payments.
    supabase
      .from('membership_payments')
      .select('id, payment_id, membership_number_id, member_id, payment_type, amount, payment_date, payment_status, member:member_id(first_name, last_name, membership_id)')
      .order('payment_date', { ascending: false })
      .limit(5),
    // Grocery/POS purchases charged to member accounts.
    supabase
      .from('GROCERY_TRANSACTIONS')
      .select('GroceryID, membership_number_id, TransactionDate, GroceryAmount, Status, balance_due, member:membership_number_id(first_name, last_name, membership_id)')
      .order('TransactionDate', { ascending: false })
      .limit(5),
  ]);

  const activeLoans = activeLoansRes?.data || [];
  const allDisbursed = allDisbursedRes?.data || [];
  const overdueSched = overdueSchedRes?.data || [];
  const approvedRows = approvedTrendRes?.data || [];
  const genderRows = gendersRes?.data || [];
  const recentPayments = recentPaymentsRes?.data || [];
  const recentDisbursals = recentDisbursalRes?.data || [];
  const recentApplications = recentApplicationsRes?.data || [];
  const recentSavings = recentSavingsRes?.data || [];
  const recentFees = recentFeesRes?.data || [];
  const recentGrocery = recentGroceryRes?.data || [];

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

  const kpis = { totalLoansCount, latePaymentsCount, activeLoansCount, approvedThisMonth };

  // Approved-per-month trend, broken down by loan type (via
  // loan_types.name on each disbursed loan).
  const approvedBuckets = new Map();
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    approvedBuckets.set(monthKey(d), {
      month: monthKey(d),
      ...Object.fromEntries(APPROVED_LOAN_TYPE_LABELS.map((label) => [label, 0])),
      [CONSOL_ABOVE]: 0,
      [CONSOL_BELOW]: 0,
    });
  }
  approvedRows.forEach((r) => {
    if (!r.disbursal_date) return;
    const label = resolveApprovedLoanTypeLabel(r.loan_types?.name);
    if (!label) return;
    const slot = approvedBuckets.get(monthKey(new Date(r.disbursal_date)));
    if (!slot) return;
    slot[label] += 1;
    if (label === 'Consolidated Loan') {
      const amount = Number(r.loan_amount ?? r.principal_amount ?? 0);
      slot[amount > BOD_LOAN_THRESHOLD ? CONSOL_ABOVE : CONSOL_BELOW] += 1;
    }
  });
  const approvedTrend = [...approvedBuckets.values()];

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
  const genderTotal = genderArr.reduce((s, g) => s + g.value, 0);

  // Recent transactions — every transaction type the system records,
  // not just loan disbursements/payments (CLAUDE.md's loan lifecycle
  // roles + savings/grocery/membership modules). Each row carries
  // enough to route a click straight to the right place: loan-related
  // rows go to the existing per-loan detail page (`/bod-loan-approval`,
  // shared with Manager/Bookkeeper — see loan_notification_service.py's
  // _redirect_url), everything else opens the in-page details modal
  // since there's no dedicated BOD page for a single ledger/fee/grocery
  // entry yet.
  const memberName = (m) => `${m?.first_name || ''} ${m?.last_name || ''}`.trim() || 'Member';
  const memberNameByLoan = new Map();
  const membershipIdByLoan = new Map();
  const loanStatusByControlNumber = new Map();
  recentDisbursals.forEach((l) => {
    memberNameByLoan.set(l.control_number, memberName(l.member));
    membershipIdByLoan.set(l.control_number, l.member?.membership_id || '');
    loanStatusByControlNumber.set(l.control_number, l.loan_status);
  });
  recentApplications.forEach((l) => {
    memberNameByLoan.set(l.control_number, memberName(l.member));
    membershipIdByLoan.set(l.control_number, l.member?.membership_id || '');
    loanStatusByControlNumber.set(l.control_number, l.loan_status);
  });
  // Loan Payment rows need their parent loan's status too (to tell an
  // ordinary installment "Approved" apart from the payment that fully
  // paid the loan off, "Completed") — fetch only the handful not
  // already covered by the two loan queries above.
  const missingLoanIds = [...new Set(
    recentPayments.map((p) => p.loan_id).filter((id) => id && !loanStatusByControlNumber.has(id))
  )];
  if (missingLoanIds.length) {
    const { data: extraLoanStatuses } = await supabase
      .from('loans')
      .select('control_number, loan_status')
      .in('control_number', missingLoanIds);
    (extraLoanStatuses || []).forEach((l) => loanStatusByControlNumber.set(l.control_number, l.loan_status));
  }

  const txnRows = [];

  recentApplications.forEach((l) => {
    txnRows.push({
      id: l.control_number,
      member: memberNameByLoan.get(l.control_number) || 'Member',
      membershipId: membershipIdByLoan.get(l.control_number) || '',
      txnType: 'Loan Application',
      detail: l.loan_types?.name || '',
      amountValue: Number(l.loan_amount || 0),
      date: l.application_date,
      status: loanStatusBadge(l.loan_status),
      isCredit: null,
      clickType: 'loan',
      loanId: l.control_number,
    });
  });
  recentDisbursals.forEach((l) => {
    txnRows.push({
      id: l.control_number,
      member: memberNameByLoan.get(l.control_number) || 'Member',
      membershipId: membershipIdByLoan.get(l.control_number) || '',
      txnType: 'Loan Approval',
      detail: l.loan_types?.name || '',
      amountValue: Number(l.loan_amount || 0),
      date: l.disbursal_date,
      status: loanStatusBadge(l.loan_status),
      isCredit: false,
      clickType: 'loan',
      loanId: l.control_number,
    });
  });
  recentPayments.forEach((p) => {
    const confirmation = String(p.confirmation_status || '').toLowerCase();
    let status;
    if (confirmation.includes('reject')) status = 'Rejected';
    else if (confirmation.includes('pending')) status = 'Pending';
    else status = loanStatusBadge(loanStatusByControlNumber.get(p.loan_id));
    txnRows.push({
      id: p.payment_reference || `PMT-${p.id}`,
      member: memberNameByLoan.get(p.loan_id) || p.loan_id || 'Member',
      membershipId: membershipIdByLoan.get(p.loan_id) || '',
      txnType: 'Loan Payment',
      detail: '',
      amountValue: Number(p.amount_paid || 0),
      date: p.payment_date,
      status,
      isCredit: true,
      clickType: 'loan',
      loanId: p.loan_id,
    });
  });
  recentSavings.forEach((s) => {
    const acct = s.savings_accounts || {};
    const isWithdrawal = String(s.entry_type || '').toLowerCase() === 'debit';
    txnRows.push({
      id: `SAV-${s.id}`,
      member: acct.member ? memberName(acct.member) : (s.account_number || 'Member'),
      membershipId: acct.member?.membership_id || '',
      txnType: isWithdrawal ? 'Withdrawal' : 'Deposit',
      detail: '',
      amountValue: Number(s.amount || 0),
      date: s.posted_at,
      // A savings_ledger row is final the moment it's posted — there's
      // no pending state modeled for it — so it's always "Approved",
      // never the loan-specific "Completed".
      status: 'Approved',
      isCredit: !isWithdrawal,
      clickType: 'modal',
      modalDetails: [
        ['Account Number', s.account_number || '—'],
        ['Reference', s.reference || '—'],
      ],
    });
  });
  recentFees.forEach((f) => {
    const status = String(f.payment_status || '').toLowerCase();
    let badgeStatus;
    if (status.includes('reject')) badgeStatus = 'Rejected';
    else if (status.includes('pending')) badgeStatus = 'Pending';
    else badgeStatus = 'Approved';
    txnRows.push({
      id: f.payment_id || `MP-${f.id}`,
      member: f.member ? memberName(f.member) : (f.membership_number_id || 'Member'),
      membershipId: f.member?.membership_id || f.membership_number_id || '',
      txnType: 'Fees',
      detail: f.payment_type || '',
      amountValue: Number(f.amount || 0),
      date: f.payment_date,
      status: badgeStatus,
      isCredit: true,
      clickType: 'modal',
      modalDetails: [
        ['Payment Type', f.payment_type || '—'],
        ['Payment ID', f.payment_id || '—'],
      ],
    });
  });
  recentGrocery.forEach((g) => {
    // Grocery is the one non-loan type where "Completed" is still the
    // right word — a purchase with no balance left owing genuinely has
    // been fully paid, matching the same rule that reserves
    // "Completed" for a loan paid off in full rather than any generic
    // success.
    const isSettled = String(g.Status || '').toLowerCase() === 'completed';
    txnRows.push({
      id: g.GroceryID,
      member: g.member ? memberName(g.member) : 'Member',
      membershipId: g.member?.membership_id || '',
      txnType: 'Grocery',
      detail: '',
      amountValue: Number(g.GroceryAmount || 0),
      date: g.TransactionDate,
      status: isSettled ? 'Completed' : 'Pending',
      isCredit: true,
      clickType: 'modal',
      modalDetails: [
        ['Balance Due', formatCurrency(g.balance_due || 0)],
      ],
    });
  });

  txnRows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return {
    kpis,
    approvedTrend,
    genderData: genderArr,
    genderTotal,
    recentTxns: txnRows.slice(0, 10),
  };
}

const Dashboard_BOD = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [chartsReady, setChartsReady] = useState(false);
  // Cached across navigation: coming back to the dashboard renders the last
  // result instantly and refreshes it in the background. `loading` is only
  // true on the very first load, when there's nothing cached to show yet.
  const { data, isPending: loading, error } = useQuery({
    queryKey: BOD_DASHBOARD_QUERY_KEY,
    queryFn: fetchBodDashboard,
  });
  const {
    kpis = { totalLoansCount: 0, latePaymentsCount: 0, activeLoansCount: 0, approvedThisMonth: 0 },
    approvedTrend = [],
    genderData = [],
    genderTotal = 0,
    recentTxns = [],
  } = data || {};
  useEffect(() => {
    if (error) addNotification(error?.message || 'Failed to load BOD dashboard data.', 'error');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const [approvedTab, setApprovedTab] = useState('all');
  const [consolFilter, setConsolFilter] = useState('all');
  // Non-loan transaction types (savings, fees, grocery) have no dedicated
  // BOD detail page to drill into, so clicking one opens this lightweight
  // details modal instead of navigating away. Loan-related rows navigate
  // straight to the existing per-loan detail page.
  const [txnModal, setTxnModal] = useState(null);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setChartsReady(true));
    return () => window.cancelAnimationFrame(frameId);
  }, []);


  // Loan-related rows (Application/Disbursement/Payment) go straight to the
  // existing per-loan detail page — same page Manager/Bookkeeper notification
  // redirects already use for a loan (see _redirect_url in
  // loan_notification_service.py) — so BOD gets the equivalent view. Every
  // other type opens the details modal since there's no dedicated per-record
  // BOD page for a single savings/fee/grocery entry.
  // Series shown in the Approved Loans per Month chart for the selected tab.
  // Consolidated is stacked by amount band (or a single band when filtered).
  const approvedSeries = (() => {
    if (approvedTab === 'all') {
      return APPROVED_LOAN_TYPE_LABELS.map((key) => ({ key, color: APPROVED_LOAN_TYPE_COLORS[key] }));
    }
    if (approvedTab === 'Consolidated Loan') {
      const bands = consolFilter === 'all' ? [CONSOL_BELOW, CONSOL_ABOVE] : [consolFilter];
      return bands.map((key) => ({ key, color: CONSOL_BAND_COLORS[key] }));
    }
    return [{ key: approvedTab, color: APPROVED_LOAN_TYPE_COLORS[approvedTab] }];
  })();

  const handleTxnClick = (txn) => {
    if (txn.clickType === 'loan' && txn.loanId) {
      navigate(`/bod-loan-approval/${encodeURIComponent(txn.loanId)}`);
    } else {
      setTxnModal(txn);
    }
  };

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
              value={kpis.totalLoansCount.toLocaleString()}
              loading={loading}
              icon={TrendingUp}
              iconColor="text-[#2C7A3F]"
              subtext="All loans on file in the cooperative"
            />
            <StatCard
              label="Number of Late Payments"
              value={kpis.latePaymentsCount.toLocaleString()}
              loading={loading}
              icon={AlertCircle}
              iconColor="text-red-500"
              subtext="Overdue installments on active loans"
            />
            <StatCard
              label="Total Active Loans"
              value={kpis.activeLoansCount.toLocaleString()}
              loading={loading}
              icon={CreditCard}
              iconColor="text-blue-500"
              subtext="Loans currently released or partially paid"
            />
            <StatCard
              label="Approved Loan This Month"
              value={kpis.approvedThisMonth}
              loading={loading}
              icon={CheckCircle2}
              iconColor="text-[#2C7A3F]"
              subtext={`Disbursed in ${new Date().toLocaleDateString('en-US', { month: 'long' })}`}
            />
          </StatCardRow>

          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 min-w-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-w-0">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Approved Loans per Month</h3>
              <p className="text-sm text-gray-500 mb-4">
                {approvedTab === 'all'
                  ? 'Disbursed loans over the last 6 months, by loan type'
                  : approvedTab === 'Consolidated Loan'
                    ? 'Disbursed Consolidated loans over the last 6 months, by amount (> ₱500K requires BOD approval)'
                    : `Disbursed ${approvedTab.replace(' Loan', '')} loans over the last 6 months`}
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="tablist" aria-label="Loan type">
                  {APPROVED_CHART_TABS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={approvedTab === t.key}
                      onClick={() => setApprovedTab(t.key)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${approvedTab === t.key ? 'bg-white text-[#2C7A3F] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {approvedTab === 'Consolidated Loan' && (
                  <select
                    value={consolFilter}
                    onChange={(e) => setConsolFilter(e.target.value)}
                    aria-label="Consolidated loan amount"
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/30"
                  >
                    {CONSOL_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                )}
              </div>
              <div className="h-72">
                {loading ? <SkeletonChart /> : chartsReady ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                  <BarChart data={approvedTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} allowDecimals={false} />
                    <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#FFFFFF', padding: '12px' }}/>
                    <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                   
                    {approvedSeries.map(({ key, color }, i) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        name={key}
                        stackId="approved"
                        fill={color}
                        radius={i === approvedSeries.length - 1 ? [6, 6, 0, 0] : 0}
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
                {loading ? <Skeleton className="h-6 w-24 rounded-lg" /> : <span className="text-xs font-medium bg-green-50 text-green-700 px-3 py-1 rounded-lg">{genderTotal} Members</span>}
              </div>
              <div className="h-48 w-full">
                {loading ? <SkeletonDonut /> : chartsReady && genderData.length > 0 ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
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
                      {genderData.map((entry, index) => <Cell key={`cell-${index}`} fill={GENDER_SLICE_COLORS[entry.name] || GENDER_COLORS[index % GENDER_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#FFFFFF', padding: '12px' }} formatter={(value) => `${value} members`} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ paddingTop: '16px' }} />
                  </PieChart>
                </ResponsiveContainer> : <div className="h-full w-full rounded-lg bg-gray-50 flex items-center justify-center text-xs text-gray-400">No gender data available</div>}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Recent Transactions</h3>
              <button
                onClick={() => navigate('/bod-audit-log')}
                className="text-sm text-[#2C7A3F] font-medium hover:underline"
              >
                View All
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Transaction ID</th>
                    <th className="p-5 font-bold">Member / Entity</th>
                    <th className="p-5 font-bold">Transaction Type</th>
                    <th className="p-5 font-bold">Date</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonTableRows rows={5} cols={6} />
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
                    <tr
                      key={`${txn.id}-${txn.date}`}
                      onClick={() => handleTxnClick(txn)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTxnClick(txn); } }}
                      className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer"
                    >
                      <td className="p-5 text-sm font-medium text-gray-900">{txn.id}</td>
                      <td className="p-5 text-sm">{txn.member}</td>
                      <td className="p-5 text-sm text-gray-500">
                        <div className="flex flex-col">
                          <span>{txn.txnType}</span>
                          {txn.detail && <span className="text-xs text-gray-400">{txn.detail}</span>}
                        </div>
                      </td>
                      <td className="p-5 text-sm text-gray-500">{formatDateShort(txn.date)}</td>
                      <td className="p-5 text-sm text-right font-medium">
                        {/* Arrow sits in a fixed slot after the amount so the
                            arrows line up in one column whatever the amount's
                            width. Up/green = money in, down/red = money out. */}
                        <div className="flex items-center justify-end gap-1.5 tabular-nums">
                          <span className={txn.isCredit === true ? "text-green-600" : txn.isCredit === false ? "text-red-600" : "text-gray-800"}>{formatCurrency(txn.amountValue)}</span>
                          <span className="inline-flex w-4 shrink-0 justify-center" aria-hidden="true">
                            {txn.isCredit === true && <ArrowUpRight className="w-4 h-4 text-green-500" />}
                            {txn.isCredit === false && <ArrowDownRight className="w-4 h-4 text-red-500" />}
                          </span>
                        </div>
                      </td>
                      <td className="p-5 text-sm text-center">
                        {txn.status === 'Completed' ? (
                          <span className="badge-animated inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Completed
                          </span>
                        ) : txn.status === 'Approved' ? (
                          <span className="badge-animated inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Approved
                          </span>
                        ) : txn.status === 'Rejected' ? (
                          <span className="badge-animated inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                            Rejected
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

      {/* Transaction details modal — non-loan transaction types (savings,
          membership fees, grocery) have no dedicated BOD detail page, so a
          row click surfaces everything about that transaction here instead
          of leaving the user to go search for it elsewhere. */}
      {txnModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setTxnModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-gray-100 w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-800">{txnModal.txnType}</h3>
                {txnModal.detail && <p className="text-xs text-gray-500 mt-0.5">{txnModal.detail}</p>}
              </div>
              <button
                onClick={() => setTxnModal(null)}
                aria-label="Close"
                className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {[
                ['Transaction ID', txnModal.id],
                ['Member', txnModal.member],
                ['Date', formatDateShort(txnModal.date)],
                ['Amount', formatCurrency(txnModal.amountValue)],
                ['Status', txnModal.status],
                ...(txnModal.modalDetails || []),
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium text-gray-800 text-right">{value || '—'}</span>
                </div>
              ))}
            </div>
            <div className="p-5 pt-0 flex justify-end gap-2">
              {txnModal.membershipId && (
                <button
                  onClick={() => {
                    setTxnModal(null);
                    navigate(`/member_details?member_id=${encodeURIComponent(txnModal.membershipId)}&portal=bod`, {
                      state: { member: { member_id: txnModal.membershipId }, portal: 'bod' },
                    });
                  }}
                  className="text-sm font-semibold text-[#2C7A3F] hover:underline px-3 py-2"
                >
                  View Member Profile
                </button>
              )}
              <button
                onClick={() => setTxnModal(null)}
                className="text-sm font-medium text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg border border-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard_BOD;