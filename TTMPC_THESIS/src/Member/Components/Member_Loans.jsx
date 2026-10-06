import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useMemberSettings } from "../../contex/MemberSettingsContext";
import { useRealtimeVersion } from "../../hooks/useRealtimeRefetch";
import { RT } from "../../lib/realtimeSync";
import { UserAuth } from "../../contex/AuthContext";
import { supabase } from "../../supabaseClient";
import { resolveMemberIdentity } from "../../utils/memberIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import TableStateRow from "../../components/TableStateRow";
import LoanCalculatorModal from "./LoanCalculatorModal";
import LoanJourneyPanel from "./LoanJourneyPanel";
import {
  formatCurrency,
  formatShortDate,
  isFullyPaidLoan,
  isReleasedLoan,
  memberStatusLabel,
  toneStyles,
} from "./loanDisplay";
import { getOrFetch, invalidate, peek } from "../memberDataCache";
import {
  LayoutDashboard,
  Users,
  Activity,
  Banknote,
  CalendarClock,
  FileText,
  Calculator,
  ArrowRight,
  Receipt,
  Settings,
  Scroll,
  ChevronLeft,
  ChevronRight,
  Wallet,
  X,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const styles = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in-up { animation: fadeInUp 0.6s ease-out; }
  .transition-all-smooth { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
`;

const LOANS_PAGE_SIZE = 5;

const menuItems = [
  { name: "Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { name: "Apply for Loan", label: "Apply", icon: Scroll },
  { name: "My Loans", label: "Loans", icon: Activity },
  { name: "Statement of Account", label: "Statement", icon: Receipt },
  { name: "Member Profile", label: "Profile", icon: Users },
];

const routeMap = {
  "Dashboard": "/member-dashboard",
  "Apply for Loan": "/member-apply-loans",
  "My Loans": "/member-loans",
  "Statement of Account": "/member-statement-of-account",
  "Member Profile": "/members-profile",
};

// Released and still being paid. Pending applications owe nothing yet.
const isActiveLoan = (loan) => isReleasedLoan(loan) && !isFullyPaidLoan(loan);

// The installment actually due next, from the repayment schedule. Emergency
// loans are diminishing, so this is smaller than the first amortization later on.
const nextInstallmentAmount = (loan) => {
  const next = loan.next_due_schedule;
  if (!next) return Number(loan.monthly_amortization || 0);
  const components = Number(next.expected_principal || 0) + Number(next.expected_interest || 0);
  return components > 0 ? components : Number(next.expected_amount || loan.monthly_amortization || 0);
};

const StatusBadge = ({ loan }) => {
  const status = memberStatusLabel(loan);
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${toneStyles[status.tone]}`}>
      {status.text}
    </span>
  );
};

const Member_Loans = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { openSettings } = useMemberSettings();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loadingLoans, setLoadingLoans] = useState(true);
  const [loanError, setLoanError] = useState('');
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [loansPage, setLoansPage] = useState(1);
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const detailRef = useRef(null);

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/memberlogin", { replace: true });
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  // One source for every figure on this page: /api/member/lifecycle, which
  // uses the Cashier's balance, fee and interest-rate functions.
  const buildLoansSnapshot = async () => {
    const { memberId } = await resolveMemberIdentity();
    if (!memberId) throw new Error('Please sign in again to load your loans.');

    const response = await fetch(`${API_BASE_URL}/api/member/lifecycle/${encodeURIComponent(memberId)}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.detail || payload?.message || "Unable to load your loans.");
    }

    const data = payload.data || {};
    const loanRows = (Array.isArray(data.loans) ? data.loans : []).map((loan) => {
      const totalPayable = Number(loan.total_payable || 0);
      const amountPaid = Number(loan.amount_paid || 0);
      return {
        ...loan,
        progress_percent: totalPayable > 0 ? Math.min(100, Math.round((amountPaid / totalPayable) * 100)) : 0,
      };
    });
    const paymentRows = (Array.isArray(data.payments) ? data.payments : []).map((row) => ({
      loan_id: row.loan_id,
      payment_id: row.payment_id || "N/A",
      amount_paid: Number(row.amount_paid || 0),
      penalties: Number(row.penalties || 0),
      payment_date: row.payment_date,
      confirmation_status: row.confirmation_status || "pending_bookkeeper",
    }));
    return { loans: loanRows, payments: paymentRows };
  };

  const rtVersion = useRealtimeVersion(RT.LOANS);
  const rtSeen = useRef(rtVersion);
  useEffect(() => {
    const silent = rtSeen.current !== rtVersion;
    rtSeen.current = rtVersion;
    let isMounted = true;
    (async () => {
      try {
        if (!silent) setLoanError('');
        const { data: authData } = await supabase.auth.getUser();
        const cacheKey = `member-loans:${authData?.user?.id || 'anon'}`;
        // Also drop an entry cached in the older { rows } shape.
        if (silent || (peek(cacheKey) && !peek(cacheKey).loans)) invalidate(cacheKey);
        const cached = peek(cacheKey);
        if (cached?.loans) {
          setLoans(cached.loans);
          setPayments(cached.payments);
          if (!silent) setLoadingLoans(false);
        } else if (!silent) {
          setLoadingLoans(true);
        }
        const snap = await getOrFetch(cacheKey, buildLoansSnapshot, 60_000);
        if (isMounted && snap?.loans) {
          setLoans(snap.loans);
          setPayments(snap.payments);
        }
      } catch (err) {
        if (silent) return;
        if (isMounted) setLoanError(err.message || 'Unable to load loan records.');
      } finally {
        if (!silent && isMounted) setLoadingLoans(false);
      }
    })();
    return () => { isMounted = false; };
  }, [rtVersion]);

  // Nothing is open until the member clicks View; drop a selection whose loan
  // disappeared on refresh.
  useEffect(() => {
    if (selectedLoanId && !loans.some((l) => l.loan_id === selectedLoanId)) setSelectedLoanId('');
  }, [loans, selectedLoanId]);

  const selectedLoan = useMemo(
    () => loans.find((l) => l.loan_id === selectedLoanId) || null,
    [loans, selectedLoanId]
  );

  const activeLoans = useMemo(() => loans.filter(isActiveLoan), [loans]);

  const totalOutstanding = useMemo(
    () => activeLoans.reduce((sum, loan) => sum + Number(loan.remaining_balance || 0), 0),
    [activeLoans]
  );

  const totalMonthly = useMemo(
    () => activeLoans.reduce((sum, loan) => sum + nextInstallmentAmount(loan), 0),
    [activeLoans]
  );

  const nextPayment = useMemo(() => {
    const upcoming = activeLoans
      .filter((loan) => loan.next_due_schedule?.due_date)
      .sort((a, b) => String(a.next_due_schedule.due_date).localeCompare(String(b.next_due_schedule.due_date)));
    return upcoming[0] || null;
  }, [activeLoans]);

  const activeTypes = useMemo(
    () => [...new Set(activeLoans.map((loan) => String(loan.loan_type || '').trim()).filter(Boolean))],
    [activeLoans]
  );

  // View opens a loan; clicking View on the open loan closes it again.
  const toggleLoan = (loanId) => {
    if (loanId === selectedLoanId) {
      setSelectedLoanId('');
      return;
    }
    setSelectedLoanId(loanId);
  };

  // Scroll after the panel has rendered, not before it exists.
  useEffect(() => {
    if (selectedLoanId) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedLoanId]);

  const totalPages = Math.max(1, Math.ceil(loans.length / LOANS_PAGE_SIZE));
  const pageLoans = loans.slice((loansPage - 1) * LOANS_PAGE_SIZE, loansPage * LOANS_PAGE_SIZE);

  // A loan closed by a renewal never records the payoff as a payment, so its
  // computed balance isn't zero; its status is what says it's closed.
  const balanceLabel = (loan) => {
    if (isFullyPaidLoan(loan)) return 'Closed';
    return isReleasedLoan(loan) ? formatCurrency(loan.remaining_balance) : '—';
  };
  const rateLabel = (loan) => (loan.interest_rate ? `${Number(loan.interest_rate).toFixed(2)}%` : 'N/A');
  const paymentLabel = (loan) => (Number(loan.monthly_amortization) > 0 ? formatCurrency(loan.monthly_amortization) : 'N/A');

  return (
    <div className="relative flex h-screen overflow-hidden bg-[#F8F9FA] dark:bg-mdark-bg">
      <style>{styles}</style>
      {/* Sidebar — desktop only. Mobile navigation is MemberMobileNav. */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 bg-white dark:bg-mdark-nav p-4 flex-col border-r border-gray-200 dark:border-mdark-border">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-primary">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-mdark-text-secondary font-bold">
              Members Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-100 dark:border-mdark-border mb-6" />

        <nav className="flex grow flex-col gap-2 text-sm">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={routeMap[item.name]}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-[#EAF1EB] text-member-green font-bold dark:bg-mdark-accent/15 dark:text-mdark-accent'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-member-green font-medium dark:text-mdark-text-secondary dark:hover:bg-mdark-elevated dark:hover:text-mdark-accent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    <span>{item.name}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded-lg p-2.5 text-sm bg-member-green hover:bg-[#154718] dark:bg-mdark-accent dark:hover:bg-mdark-accent/90 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden lg:ml-64">
        <header className="bg-white dark:bg-mdark-nav h-16 shrink-0 shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 border-b border-gray-100 dark:border-mdark-border">
          <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-0">
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] dark:text-mdark-accent lg:hidden">My Loans</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <LoanNotificationBell role="member" accentClass="bg-member-green dark:bg-mdark-accent" />
            <button
              type="button"
              onClick={openSettings}
              className="p-2 rounded-md text-gray-500 dark:text-mdark-text-secondary hover:bg-gray-100 dark:hover:bg-mdark-elevated transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="animate-page-in p-4 sm:p-6 lg:p-8 overflow-y-auto pb-28 lg:pb-8">
          <div className="mb-6 lg:mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="hidden lg:block font-extrabold text-[#1a4a2f] dark:text-mdark-accent text-2xl">My Loans</h1>
              <p className="text-xs text-gray-500 dark:text-mdark-text-secondary mt-1">
                What you owe, where each loan is, and the payments you've made.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCalculatorOpen(true)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-member-green px-4 py-2 text-xs font-bold text-member-green hover:bg-[#EAF1EB] dark:border-mdark-accent dark:text-mdark-accent dark:hover:bg-mdark-accent/15 sm:w-auto"
            >
              <Calculator className="w-4 h-4" /> Loan Calculator
            </button>
          </div>

          {/* Summary cards — released loans only */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-8">
            <div className="bg-white dark:bg-mdark-card p-3.5 sm:p-5 lg:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border flex flex-col">
              <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-mdark-elevated flex items-center justify-center mb-2.5 sm:mb-4 border border-gray-200 dark:border-mdark-border">
                <Banknote className="w-4 h-4 text-gray-600 dark:text-mdark-text-secondary" />
              </div>
              <p className="text-[11px] sm:text-xs font-bold text-gray-500 dark:text-mdark-text-secondary mb-1">Total Outstanding Balance</p>
              <h3 className="text-base sm:text-2xl font-black text-gray-900 dark:text-mdark-text break-words">{formatCurrency(totalOutstanding)}</h3>
              <p className="text-[10px] font-medium text-gray-500 dark:text-mdark-text-secondary mt-auto pt-2">Across active loans</p>
            </div>

            <div className="bg-white dark:bg-mdark-card p-3.5 sm:p-5 lg:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border flex flex-col">
              <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-mdark-elevated flex items-center justify-center mb-2.5 sm:mb-4 border border-gray-200 dark:border-mdark-border">
                <CalendarClock className="w-4 h-4 text-member-green dark:text-mdark-accent" />
              </div>
              <p className="text-[11px] sm:text-xs font-bold text-gray-500 dark:text-mdark-text-secondary mb-1">Total Monthly Payment</p>
              <h3 className="text-base sm:text-2xl font-black text-gray-900 dark:text-mdark-text break-words">{formatCurrency(totalMonthly)}</h3>
              <p className="text-[10px] font-medium text-gray-500 dark:text-mdark-text-secondary mt-auto pt-2">Next installment of each active loan</p>
            </div>

            <div className="bg-white dark:bg-mdark-card p-3.5 sm:p-5 lg:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border flex flex-col">
              <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-mdark-elevated flex items-center justify-center mb-2.5 sm:mb-4 border border-gray-200 dark:border-mdark-border">
                <FileText className="w-4 h-4 text-gray-600 dark:text-mdark-text-secondary" />
              </div>
              <p className="text-[11px] sm:text-xs font-bold text-gray-500 dark:text-mdark-text-secondary mb-1">Active Loans</p>
              <h3 className="text-base sm:text-2xl font-black text-gray-900 dark:text-mdark-text">{activeLoans.length}</h3>
              <p className="text-[10px] font-medium text-gray-500 dark:text-mdark-text-secondary mt-auto pt-2 break-words">
                {activeTypes.join(', ') || 'No active loans'}
              </p>
            </div>

            <div className="bg-white dark:bg-mdark-card p-3.5 sm:p-5 lg:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border flex flex-col">
              <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-mdark-elevated flex items-center justify-center mb-2.5 sm:mb-4 border border-gray-200 dark:border-mdark-border">
                <Wallet className="w-4 h-4 text-gray-600 dark:text-mdark-text-secondary" />
              </div>
              <p className="text-[11px] sm:text-xs font-bold text-gray-500 dark:text-mdark-text-secondary mb-1">Next Payment Due</p>
              <h3 className="text-base sm:text-2xl font-black text-gray-900 dark:text-mdark-text break-words">
                {nextPayment ? formatShortDate(nextPayment.next_due_schedule.due_date) : '—'}
              </h3>
              <p className="text-[10px] font-medium text-gray-500 dark:text-mdark-text-secondary mt-auto pt-2 break-words">
                {nextPayment
                  ? `${formatCurrency(nextInstallmentAmount(nextPayment))} · ${nextPayment.loan_type}`
                  : 'No upcoming payment'}
              </p>
            </div>
          </div>

          {/* All loans */}
          <div className="bg-white dark:bg-mdark-card rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border overflow-hidden mb-8 flex flex-col">
            <div className="px-4 py-3.5 sm:p-6 flex items-center justify-between border-b border-gray-100 dark:border-mdark-border">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-mdark-text">All Loans</h3>
              <span className="text-[10px] font-bold text-gray-400 dark:text-mdark-text-muted uppercase tracking-wider">
                {loans.length} loan{loans.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[900px] text-left border-collapse">
                <thead>
                  <tr className="bg-primary-deep dark:bg-mdark-nav text-[10px] uppercase tracking-wider text-white dark:text-mdark-text font-extrabold">
                    <th className="p-5 font-bold">Loan Type</th>
                    <th className="p-5 font-bold">Original Amount</th>
                    <th className="p-5 font-bold">Remaining Balance</th>
                    <th className="p-5 font-bold">Interest Rate</th>
                    <th className="p-5 font-bold">Monthly Payment</th>
                    <th className="p-5 font-bold">Status</th>
                    <th className="p-5 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLoans ? (
                    <TableStateRow colSpan={7} variant="loading" label="Loading loans..." />
                  ) : loanError ? (
                    <tr>
                      <td colSpan="7" className="p-5 text-sm text-red-600 dark:text-red-400">{loanError}</td>
                    </tr>
                  ) : loans.length === 0 ? (
                    <TableStateRow colSpan={7} variant="empty" icon={Banknote} label="No loan records found." />
                  ) : pageLoans.map((loan) => {
                    const isSelected = loan.loan_id === selectedLoanId;
                    return (
                      <tr
                        key={loan.loan_id}
                        className={`border-b border-gray-100 dark:border-mdark-border transition-colors ${
                          isSelected ? 'bg-[#EAF1EB]/60 dark:bg-mdark-accent/10' : 'hover:bg-gray-50/50 dark:hover:bg-mdark-elevated/50'
                        }`}
                      >
                        <td className="p-5">
                          <p className="text-sm font-bold text-gray-900 dark:text-mdark-text">{loan.loan_type}</p>
                          <p className="text-[10px] text-gray-400 dark:text-mdark-text-muted font-medium">ID: {loan.loan_id}</p>
                        </td>
                        <td className="p-5 text-sm font-bold text-gray-600 dark:text-mdark-text-secondary">{formatCurrency(loan.principal)}</td>
                        <td className="p-5 text-sm font-black text-gray-900 dark:text-mdark-text">{balanceLabel(loan)}</td>
                        <td className="p-5 text-sm font-bold text-gray-700 dark:text-mdark-text">{rateLabel(loan)}</td>
                        <td className="p-5 text-sm font-bold text-member-green dark:text-mdark-accent">{paymentLabel(loan)}</td>
                        <td className="p-5"><StatusBadge loan={loan} /></td>
                        <td className="p-5 text-right">
                          <button
                            type="button"
                            onClick={() => toggleLoan(loan.loan_id)}
                            aria-expanded={isSelected}
                            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                              isSelected
                                ? 'bg-member-green text-white hover:bg-[#154718] dark:bg-mdark-accent dark:hover:bg-mdark-accent/90'
                                : 'border border-member-green text-member-green hover:bg-[#EAF1EB] dark:border-mdark-accent dark:text-mdark-accent dark:hover:bg-mdark-accent/15'
                            }`}
                          >
                            {isSelected ? <>Close <X className="w-3.5 h-3.5" /></> : <>View <ArrowRight className="w-3.5 h-3.5" /></>}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-mdark-border md:hidden">
              {loadingLoans ? (
                <TableStateRow bare variant="loading" label="Loading loans..." />
              ) : loanError ? (
                <p className="p-6 text-sm text-red-600 dark:text-red-400 text-center">{loanError}</p>
              ) : loans.length === 0 ? (
                <TableStateRow bare variant="empty" icon={Banknote} label="No loan records found." />
              ) : pageLoans.map((loan) => {
                const isSelected = loan.loan_id === selectedLoanId;
                // One headline figure per card: what is still owed on an active
                // loan, otherwise the amount borrowed / applied for.
                const owing = isActiveLoan(loan);
                const headline = owing ? formatCurrency(loan.remaining_balance) : formatCurrency(loan.principal);
                const headlineLabel = owing
                  ? `left of ${formatCurrency(loan.principal)}`
                  : isReleasedLoan(loan) ? 'loan amount' : 'applied for';
                return (
                  <button
                    type="button"
                    key={loan.loan_id}
                    onClick={() => toggleLoan(loan.loan_id)}
                    aria-expanded={isSelected}
                    className={`flex w-full items-center gap-3 text-left px-4 py-3 transition-colors ${
                      isSelected
                        ? 'bg-[#EAF1EB]/70 dark:bg-mdark-accent/10 shadow-[inset_3px_0_0_0_var(--color-member-green)]'
                        : 'active:bg-gray-50 dark:active:bg-gray-800/60'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold text-gray-900 dark:text-mdark-text">{loan.loan_type}</p>
                        <StatusBadge loan={loan} />
                      </div>
                      <p className="mt-1 text-lg font-black leading-tight text-gray-900 dark:text-mdark-text">
                        {headline}
                        <span className="ml-1.5 text-[11px] font-medium text-gray-500 dark:text-mdark-text-secondary">{headlineLabel}</span>
                      </p>
                      <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-mdark-text-secondary">
                        <span className="font-semibold text-member-green dark:text-mdark-accent">{paymentLabel(loan)}/mo</span>
                        <span className="mx-1.5 text-gray-300 dark:text-mdark-text-muted">·</span>
                        {rateLabel(loan)} monthly
                        <span className="mx-1.5 text-gray-300 dark:text-mdark-text-muted">·</span>
                        <span className="font-mono">{loan.loan_id}</span>
                      </p>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${isSelected ? 'rotate-90 text-member-green' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>

            {loans.length > LOANS_PAGE_SIZE && (
              <div className="flex items-center justify-center p-4 sm:p-6 gap-2 border-t border-gray-100 dark:border-mdark-border">
                {(() => {
                  const groupStart = Math.floor((loansPage - 1) / 5) * 5 + 1;
                  const groupEnd = Math.min(groupStart + 4, totalPages);
                  return (
                    <>
                      <button
                        type="button"
                        aria-label="Previous page"
                        className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-mdark-elevated dark:border-mdark-border dark:text-mdark-text-secondary"
                        disabled={loansPage <= 1}
                        onClick={() => setLoansPage(Math.max(loansPage - 1, 1))}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      {Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map((p) => (
                        <button
                          type="button"
                          key={p}
                          onClick={() => setLoansPage(p)}
                          className={`w-8 h-8 flex items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                            p === loansPage
                              ? 'bg-[#16A34A] text-white border-[#16A34A]'
                              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-mdark-elevated dark:border-mdark-border dark:text-mdark-text-secondary'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-label="Next page"
                        className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-mdark-elevated dark:border-mdark-border dark:text-mdark-text-secondary"
                        disabled={loansPage >= totalPages}
                        onClick={() => setLoansPage(Math.min(loansPage + 1, totalPages))}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Selected loan */}
          {selectedLoan ? (
            <section ref={detailRef} className="scroll-mt-6">
              <div className="mb-3 sm:mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-mdark-text">Loan Details</h2>
                <div className="flex items-center gap-2">
                  {/* On phones the loan cards above are the switcher. */}
                  {loans.length > 1 ? (
                    <select
                      value={selectedLoanId}
                      onChange={(e) => setSelectedLoanId(e.target.value)}
                      aria-label="Select a loan"
                      className="hidden sm:block min-w-0 max-w-sm rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-member-green/30 dark:border-mdark-border dark:bg-mdark-elevated dark:text-mdark-text"
                    >
                      {loans.map((l) => (
                        <option key={l.loan_id} value={l.loan_id}>
                          {l.loan_type} — {formatCurrency(l.principal)} ({l.loan_id})
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setSelectedLoanId('')}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-mdark-border dark:text-mdark-text-secondary dark:hover:bg-mdark-elevated"
                  >
                    <X className="w-3.5 h-3.5" /> Close
                  </button>
                </div>
              </div>
              {/* key resets the panel's expand/collapse state per loan */}
              <LoanJourneyPanel key={selectedLoan.loan_id} loan={selectedLoan} payments={payments} />
            </section>
          ) : null}

        </main>
      </div>

      <LoanCalculatorModal open={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
    </div>
  );
};

export default Member_Loans;
