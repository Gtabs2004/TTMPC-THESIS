import React, { useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Wallet,
  FileText,
  ClipboardCheck,
  ThumbsUp,
  PackageCheck,
  Banknote,
  Repeat,
  Trophy,
} from "lucide-react";
import {
  formatCurrency,
  formatShortDate,
  isFullyPaidLoan,
  isReleasedLoan,
  memberStatusLabel,
  statusKey,
  toneStyles,
} from "./loanDisplay";

// The selected loan on My Loans: lifecycle stepper, figures, fees, payments and
// schedule. Every amount comes from /api/member/lifecycle, which uses the same
// balance and fee functions as the Cashier.

const LIFECYCLE_STAGES = [
  { id: "submitted", label: "Loan Submitted", icon: FileText, description: "Your application has been received." },
  { id: "review", label: "Under Review", icon: ClipboardCheck, description: "Bookkeeper is reviewing your documents." },
  { id: "approved", label: "Approved", icon: ThumbsUp, description: "The Manager has approved your loan." },
  { id: "ready", label: "Ready for Release", icon: PackageCheck, description: "Awaiting cashier disbursement." },
  { id: "disbursed", label: "Disbursed", icon: Banknote, description: "Funds have been released to you." },
  { id: "ongoing", label: "Ongoing Payments", icon: Repeat, description: "You are actively paying this loan." },
  { id: "paid", label: "Fully Paid", icon: Trophy, description: "Congratulations — this loan is complete." },
];

const STAGE_INDEX = LIFECYCLE_STAGES.reduce((acc, s, i) => ({ ...acc, [s.id]: i }), {});

const resolveStageIndex = (loan) => {
  const status = statusKey(loan);
  if (status === "fully paid") return STAGE_INDEX.paid;
  if (status === "partially paid") return STAGE_INDEX.ongoing;
  if (status === "released") return STAGE_INDEX.disbursed;
  if (status === "to be disbursed" || status === "ready for disbursement") return STAGE_INDEX.ready;
  if (status === "approved") return STAGE_INDEX.approved;
  if (status === "recommended for approval") return STAGE_INDEX.review;
  if (status === "pending") return STAGE_INDEX.submitted;
  // Terminal negative states leave stage at the latest known step.
  if (status === "rejected" || status === "cancelled") return STAGE_INDEX.review;
  return STAGE_INDEX.submitted;
};

const paymentStatusLabel = (status) => {
  const s = String(status || "").trim().toLowerCase();
  if (s === "validated" || s === "confirmed" || s === "approved" || s === "bookkeeper_confirmed") {
    return { text: "Posted", tone: "success" };
  }
  if (s === "rejected") return { text: "Rejected", tone: "error" };
  return { text: "Pending", tone: "warn" };
};

// Emergency loans use 2% *diminishing* interest: equal principal each month
// plus interest on the declining balance, so the payment shrinks every month.
const isDiminishingLoan = (loanType) => String(loanType || "").trim().toLowerCase().includes("emergency");

// Build the diminishing table straight from the stored schedule rows so the
// member sees exactly what the cashier will collect.
const buildDiminishingRows = (schedules) => {
  if (!Array.isArray(schedules)) return [];
  return schedules.map((sched, idx) => {
    const principal = Number(sched.expected_principal || 0);
    const interest = Number(sched.expected_interest || 0);
    const componentSum = principal + interest;
    const total = componentSum > 0 ? componentSum : Number(sched.expected_amount || 0);
    const balance = Number(sched.remaining_principal ?? 0);
    return {
      key: sched.schedule_id || sched.installment_no || idx,
      installmentNo: Number(sched.installment_no || idx + 1),
      dueDate: sched.due_date,
      principal,
      interest,
      total,
      balance,
      openingBalance: balance + principal,
      isPaid: sched.schedule_status === "Paid",
    };
  });
};

const sumBy = (rows, key) => rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);

const formatPlain = (value) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Before disbursement there are no loan_schedules rows yet, so project the
// schedule from the loan terms. Mirrors /api/loans/compute exactly.
const projectDiminishingRows = (principal, term, monthlyRate) => {
  const totalCents = Math.round(Number(principal || 0) * 100);
  const months = Number(term || 0);
  if (totalCents <= 0 || months <= 0 || !(monthlyRate > 0)) return [];

  const monthlyPrincipalCents = Math.floor(totalCents / months);
  const rows = [];
  let balanceCents = totalCents;
  let accumulatedCents = 0;

  for (let m = 1; m <= months; m += 1) {
    const principalCents = m < months ? monthlyPrincipalCents : totalCents - accumulatedCents;
    const endingBalanceCents = balanceCents - principalCents;
    const interestCents = Math.round(endingBalanceCents * monthlyRate);
    rows.push({
      key: `projected-${m}`,
      installmentNo: m,
      dueDate: null,
      principal: principalCents / 100,
      interest: interestCents / 100,
      total: (principalCents + interestCents) / 100,
      balance: endingBalanceCents / 100,
      openingBalance: balanceCents / 100,
      isPaid: false,
    });
    balanceCents = endingBalanceCents;
    accumulatedCents += principalCents;
  }
  return rows;
};

// Recover the monthly rate from the stored first amortization rather than
// hardcoding 2%: firstAmort = P/term + (P - P/term) * rate
const inferDiminishingRate = (principal, term, firstAmortization) => {
  const p = Number(principal || 0);
  const n = Number(term || 0);
  const first = Number(firstAmortization || 0);
  if (p <= 0 || n <= 0 || first <= 0) return 0;
  const monthlyPrincipal = p / n;
  const balanceAfter = p - monthlyPrincipal;
  if (balanceAfter <= 0) return 0;
  const rate = (first - monthlyPrincipal) / balanceAfter;
  if (!(rate > 0) || rate >= 0.2) return 0;
  // Stored amortization is rounded to centavos; snap to the nearest 0.01%.
  return Math.round(rate * 10000) / 10000;
};

const RECENT_PAYMENTS = 5;

const DetailRow = ({ label, children, emphasis = false }) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className="text-gray-600 dark:text-mdark-text-secondary font-medium">{label}</span>
    <span className={`text-right ${emphasis ? "font-extrabold text-member-green dark:text-mdark-accent" : "font-bold text-gray-900 dark:text-mdark-text"}`}>
      {children}
    </span>
  </div>
);

function DiminishingBreakdown({ loan }) {
  const scheduleRows = buildDiminishingRows(loan.schedules);
  const isProjected = scheduleRows.length === 0;
  const inferredRate = inferDiminishingRate(loan.principal, loan.term, loan.monthly_amortization);
  const rows = isProjected ? projectDiminishingRows(loan.principal, loan.term, inferredRate) : scheduleRows;
  if (rows.length === 0) return null;
  const ratePercentLabel = inferredRate > 0 ? `${(inferredRate * 100).toFixed(2).replace(/\.00$/, "")}%` : "the monthly rate";
  const firstRow = rows[0];
  const monthlyPrincipal = firstRow.principal;

  return (
    <div className="rounded-xl border border-gray-100 dark:border-mdark-border bg-[#FAF9FB] dark:bg-mdark-elevated p-4">
      <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-wider">How Your Payments Are Computed</p>
      <p className="mt-2 text-xs text-gray-600 dark:text-mdark-text-secondary">
        This is a <span className="font-bold">diminishing</span> loan. You pay the same principal every month, but interest
        is charged only on your remaining balance &mdash; so your payment gets <span className="font-bold">smaller each month</span>.
      </p>
      {isProjected ? (
        <p className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[11px] font-medium text-amber-800 dark:text-amber-300">
          Estimated schedule. Exact due dates and amounts are finalized when your loan is released.
        </p>
      ) : null}

      <div className="mt-3 rounded-lg border border-gray-200 dark:border-mdark-border bg-white dark:bg-mdark-card p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-mdark-text-secondary">
          Where {formatCurrency(firstRow.total)} comes from
        </p>
        <ol className="mt-2 space-y-2 text-[11px] text-gray-700 dark:text-mdark-text-secondary">
          <li>
            <span className="font-bold">1. Principal per month</span> &mdash; your loan split evenly over the term.
            <div className="mt-0.5 font-mono text-[11px] text-gray-900 dark:text-mdark-text">
              {formatPlain(loan.principal)} &divide; {loan.term} = {formatPlain(monthlyPrincipal)}
            </div>
          </li>
          <li>
            <span className="font-bold">2. Balance after that payment</span> &mdash; interest is charged on what remains.
            <div className="mt-0.5 font-mono text-[11px] text-gray-900 dark:text-mdark-text">
              {formatPlain(loan.principal)} &minus; {formatPlain(monthlyPrincipal)} = {formatPlain(firstRow.balance)}
            </div>
          </li>
          <li>
            <span className="font-bold">3. Interest for month 1</span> &mdash; {ratePercentLabel} of that balance.
            <div className="mt-0.5 font-mono text-[11px] text-gray-900 dark:text-mdark-text">
              {formatPlain(firstRow.balance)} &times; {ratePercentLabel} = {formatPlain(firstRow.interest)}
            </div>
          </li>
          <li>
            <span className="font-bold">4. First payment</span> &mdash; principal plus interest.
            <div className="mt-0.5 font-mono text-[11px] font-bold text-member-green dark:text-mdark-accent">
              {formatPlain(monthlyPrincipal)} + {formatPlain(firstRow.interest)} = {formatPlain(firstRow.total)}
            </div>
          </li>
        </ol>
        <p className="mt-2 border-t border-gray-100 dark:border-mdark-border pt-2 text-[11px] text-gray-600 dark:text-mdark-text-secondary">
          Every following month repeats steps 2&ndash;4 on the smaller balance, which is why the payment keeps going down.
        </p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 dark:text-mdark-text-secondary">
              <th className="py-2 pr-2 font-bold">Mo</th>
              <th className="py-2 px-2 font-bold text-right">Principal</th>
              <th className="py-2 px-2 font-bold text-right">Interest</th>
              <th className="py-2 px-2 font-bold">How interest was computed</th>
              <th className="py-2 px-2 font-bold text-right">Payment</th>
              <th className="py-2 pl-2 font-bold text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-mdark-border">
            {rows.map((row) => (
              <tr key={row.key} className={row.isPaid ? "text-gray-400 dark:text-mdark-text-muted" : "text-gray-900 dark:text-mdark-text"}>
                <td className="py-2 pr-2 font-bold">{row.installmentNo}</td>
                <td className="py-2 px-2 text-right font-mono">{formatCurrency(row.principal)}</td>
                <td className="py-2 px-2 text-right font-mono">{formatCurrency(row.interest)}</td>
                <td className="py-2 px-2 font-mono text-[10px] text-gray-500 dark:text-mdark-text-secondary whitespace-nowrap">
                  {formatPlain(row.balance)} &times; {ratePercentLabel}
                </td>
                <td className="py-2 px-2 text-right font-mono font-bold">{formatCurrency(row.total)}</td>
                <td className="py-2 pl-2 text-right font-mono">{formatCurrency(row.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-mdark-border font-bold text-gray-900 dark:text-mdark-text">
              <td className="py-2 pr-2 text-[10px] uppercase tracking-wider">Total</td>
              <td className="py-2 px-2 text-right font-mono">{formatCurrency(sumBy(rows, "principal"))}</td>
              <td className="py-2 px-2 text-right font-mono text-member-green dark:text-mdark-accent">{formatCurrency(sumBy(rows, "interest"))}</td>
              <td className="py-2 px-2 text-[10px] font-medium text-gray-500 dark:text-mdark-text-secondary">sum of column</td>
              <td className="py-2 px-2 text-right font-mono">{formatCurrency(sumBy(rows, "total"))}</td>
              <td className="py-2 pl-2 text-right font-mono">{formatCurrency(0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-gray-500 dark:text-mdark-text-secondary">
        Total interest is the sum of the interest column &mdash; not the first payment multiplied by the term, because every
        payment differs.
      </p>
    </div>
  );
}

function AddOnBreakdown({ loan }) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-mdark-border bg-[#FAF9FB] dark:bg-mdark-elevated p-4">
      <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-wider mb-3">How Total Interest is Computed</p>
      <div className="space-y-2">
        <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span className="text-gray-500 dark:text-mdark-text-secondary">Monthly Amortization × Term</span>
          <span className="break-words font-bold text-gray-900 dark:text-mdark-text font-mono sm:text-right">
            {formatCurrency(loan.monthly_amortization)} × {loan.term} mo
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-gray-500 dark:text-mdark-text-secondary">= Total Payable</span>
          <span className="shrink-0 font-bold text-gray-900 dark:text-mdark-text">{formatCurrency(loan.total_payable)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-gray-500 dark:text-mdark-text-secondary">− Principal (Loan Amount)</span>
          <span className="shrink-0 font-bold text-gray-900 dark:text-mdark-text">− {formatCurrency(loan.principal)}</span>
        </div>
        <div className="border-t border-gray-200 dark:border-mdark-border pt-2 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-gray-700 dark:text-mdark-text-secondary">= Total Interest</span>
          <span className="text-sm font-extrabold text-member-green dark:text-mdark-accent">{formatCurrency(loan.total_interest)}</span>
        </div>
      </div>
    </div>
  );
}

// Per-installment amount = principal + interest components; falls back to
// expected_amount, guarding against legacy rows that stored a running total.
const installmentAmount = (sched, monthlyAmortization) => {
  const componentSum = Number(sched.expected_principal || 0) + Number(sched.expected_interest || 0);
  const rawExpected = Number(sched.expected_amount || 0);
  const monthly = Number(monthlyAmortization || 0);
  const sanityCap = monthly > 0 ? monthly * 1.5 : Infinity;
  if (componentSum > 0 && componentSum <= sanityCap) return componentSum;
  if (rawExpected > 0 && rawExpected <= sanityCap) return rawExpected;
  return monthly;
};

const StatTile = ({ label, children }) => (
  <div className="rounded-xl bg-[#FAF9FB] dark:bg-mdark-elevated border border-gray-100 dark:border-mdark-border px-3 py-2.5 min-w-0">
    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-mdark-text-secondary">{label}</p>
    <p className="mt-0.5 truncate text-sm font-extrabold text-gray-900 dark:text-mdark-text">{children}</p>
  </div>
);

const stageCircleClass = (isFinalTrophy, isComplete, isActive) =>
  isFinalTrophy
    ? "bg-member-green text-white ring-4 ring-member-green/20 dark:bg-mdark-accent dark:ring-mdark-accent/20"
    : isComplete && !isActive
      ? "bg-member-green text-white dark:bg-mdark-accent"
      : isActive
        ? "bg-[#66B53B] text-white ring-4 ring-[#66B53B]/20"
        : "bg-gray-100 dark:bg-mdark-elevated text-gray-400";

const StageIconFor = ({ stage, isFinalTrophy, isComplete, isActive, size = "w-4 h-4" }) => {
  if (isFinalTrophy) return <Trophy className={size} />;
  if (isComplete && !isActive) return <CheckCircle2 className={size} />;
  const Icon = stage.icon;
  return <Icon className={size} />;
};

const BreakdownGroup = ({ title, children }) => (
  <div>
    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-mdark-text-muted">{title}</p>
    <div className="space-y-2">{children}</div>
  </div>
);

const TotalRow = ({ label, children, emphasis = false }) => (
  <div className="flex items-center justify-between gap-3 border-t border-dashed border-gray-200 dark:border-mdark-border pt-2 text-sm">
    <span className="font-bold text-gray-800 dark:text-mdark-text">{label}</span>
    <span className={`text-right font-extrabold ${emphasis ? "text-member-green dark:text-mdark-accent" : "text-gray-900 dark:text-mdark-text"}`}>
      {children}
    </span>
  </div>
);

// A row inside the shared "More details" card; rows are separated by a divider.
const Collapsible = ({ icon, title, open, onToggle, children }) => {
  const Icon = icon;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full px-4 sm:px-5 py-3.5 sm:py-4 flex items-center justify-between gap-3 text-left hover:bg-gray-50 dark:hover:bg-mdark-elevated transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 shrink-0 text-member-green dark:text-mdark-accent" />
          <span className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-mdark-text">{title}</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-gray-500" /> : <ChevronDown className="w-4 h-4 shrink-0 text-gray-500" />}
      </button>
      {open ? <div className="border-t border-gray-100 dark:border-mdark-border">{children}</div> : null}
    </div>
  );
};

export default function LoanJourneyPanel({ loan, payments }) {
  const [showComputation, setShowComputation] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);

  const isFullyPaid = isFullyPaidLoan(loan);
  const released = isReleasedLoan(loan);
  const owing = released && !isFullyPaid;
  const status = memberStatusLabel(loan);
  const stageIndex = resolveStageIndex(loan);
  const lastIdx = LIFECYCLE_STAGES.length - 1;
  const currentIdx = isFullyPaid ? lastIdx : stageIndex;
  const diminishing = isDiminishingLoan(loan.loan_type);
  const stageState = (idx) => ({
    isComplete: isFullyPaid ? true : idx < stageIndex,
    isActive: isFullyPaid ? idx === lastIdx : idx === stageIndex,
    isFinalTrophy: isFullyPaid && idx === lastIdx,
  });

  const loanPayments = payments.filter((p) => p.loan_id === loan.loan_id);
  const visiblePayments = isFullyPaid || showAllPayments ? loanPayments : loanPayments.slice(0, RECENT_PAYMENTS);

  const nextDueLabel = isFullyPaid
    ? "None"
    : loan.next_due_schedule?.due_date
      ? formatShortDate(loan.next_due_schedule.due_date)
      : released
        ? "None"
        : "When released";

  const headlineLabel = owing ? "Remaining balance" : isFullyPaid ? "Loan amount" : "Amount applied for";
  const headline = owing ? loan.remaining_balance : loan.principal;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Summary */}
      <div className={`rounded-2xl border shadow-sm p-4 sm:p-6 animate-fade-in-up ${
        isFullyPaid
          ? "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-mdark-accent/10 dark:to-emerald-950/40 border-green-200 dark:border-mdark-accent/30"
          : "bg-white dark:bg-mdark-card border-gray-100 dark:border-mdark-border"
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-mdark-text">{loan.loan_type}</p>
            <p className="text-[11px] text-gray-500 dark:text-mdark-text-secondary font-mono truncate">{loan.loan_id}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold border ${toneStyles[status.tone]}`}>
            {isFullyPaid ? <Trophy className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
            {status.text}
          </span>
        </div>

        <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-mdark-text-secondary">{headlineLabel}</p>
        <p className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-mdark-text leading-tight">{formatCurrency(headline)}</p>

        {owing ? (
          <div className="mt-3">
            <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-mdark-elevated overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-member-green to-[#66B53B] transition-all duration-500"
                style={{ width: `${loan.progress_percent}%` }}
              />
            </div>
            <p className="mt-1.5 flex justify-between gap-2 text-[11px] text-gray-500 dark:text-mdark-text-secondary">
              <span>{formatCurrency(loan.amount_paid)} paid of {formatCurrency(loan.total_payable)}</span>
              <span className="font-bold text-member-green dark:text-mdark-accent">{loan.progress_percent}%</span>
            </p>
          </div>
        ) : null}

        {isFullyPaid ? (
          <div className="mt-3 rounded-xl bg-member-green/10 border border-member-green/20 px-3 py-2.5 flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-member-green dark:text-mdark-accent shrink-0" />
            <p className="text-xs font-semibold text-[#1a4a2f] dark:text-mdark-accent">Loan fully settled. This loan is now closed.</p>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatTile label={diminishing ? "First payment" : "Monthly"}>{formatCurrency(loan.monthly_amortization)}</StatTile>
          <StatTile label="Next due">{nextDueLabel}</StatTile>
          <StatTile label="Rate">{loan.interest_rate ? `${Number(loan.interest_rate).toFixed(2)}% / mo` : "—"}</StatTile>
          <StatTile label="Term">{loan.term ? `${loan.term} months` : "—"}</StatTile>
        </div>
      </div>

      {/* Lifecycle */}
      <div className="rounded-2xl border shadow-sm p-4 sm:p-6 bg-white dark:bg-mdark-card border-gray-100 dark:border-mdark-border">
        <div className="flex items-center gap-2 mb-3 md:mb-5">
          <CalendarClock className="w-4 h-4 sm:w-5 sm:h-5 text-member-green dark:text-mdark-accent" />
          <h3 className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-mdark-text">Loan Lifecycle</h3>
          <span className="ml-auto text-[11px] font-bold text-gray-500 dark:text-mdark-text-secondary md:hidden">
            Step {currentIdx + 1} of {LIFECYCLE_STAGES.length}
          </span>
        </div>

        {/* Mobile: compact progress, full list on demand */}
        <div className="md:hidden">
          <p className="text-sm font-bold text-member-green dark:text-mdark-accent">{LIFECYCLE_STAGES[currentIdx].label}</p>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {LIFECYCLE_STAGES.map((stage, idx) => (
              <span
                key={stage.id}
                className={`h-1.5 flex-1 rounded-full ${
                  idx < currentIdx || isFullyPaid
                    ? "bg-member-green dark:bg-mdark-accent"
                    : idx === currentIdx
                      ? "bg-[#66B53B]"
                      : "bg-gray-200 dark:bg-mdark-elevated"
                }`}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-mdark-text-secondary">
            {isFullyPaid ? "All payments received and validated." : LIFECYCLE_STAGES[stageIndex]?.description}
          </p>
          <button
            type="button"
            onClick={() => setShowAllSteps((v) => !v)}
            aria-expanded={showAllSteps}
            className="mt-2 text-xs font-bold text-member-green dark:text-mdark-accent hover:underline"
          >
            {showAllSteps ? "Hide steps" : "Show all steps"}
          </button>
          {showAllSteps ? (
            <ol className="mt-3 space-y-2.5">
              {LIFECYCLE_STAGES.map((stage, idx) => {
                const s = stageState(idx);
                return (
                  <li key={stage.id} className="flex items-center gap-3">
                    <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${stageCircleClass(s.isFinalTrophy, s.isComplete, s.isActive)}`}>
                      <StageIconFor stage={stage} {...s} size="w-3.5 h-3.5" />
                    </div>
                    <p className={`text-sm font-semibold ${
                      s.isFinalTrophy || s.isActive
                        ? "text-member-green dark:text-mdark-accent"
                        : s.isComplete ? "text-gray-800 dark:text-mdark-text" : "text-gray-400"
                    }`}>
                      {stage.label}
                    </p>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>

        {/* Desktop: horizontal stepper */}
        <div className="hidden md:block">
          <div className="flex items-start justify-between gap-2">
            {LIFECYCLE_STAGES.map((stage, idx) => {
              const s = stageState(idx);
              return (
                <React.Fragment key={stage.id}>
                  <div className="flex flex-col items-center text-center min-w-0 flex-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${stageCircleClass(s.isFinalTrophy, s.isComplete, s.isActive)}`}>
                      <StageIconFor stage={stage} {...s} />
                    </div>
                    <p className={`mt-2 text-[11px] font-bold leading-tight ${
                      s.isFinalTrophy || s.isActive
                        ? "text-member-green dark:text-mdark-accent"
                        : s.isComplete ? "text-gray-700 dark:text-mdark-text-secondary" : "text-gray-400"
                    }`}>
                      {stage.label}
                    </p>
                  </div>
                  {idx < lastIdx ? (
                    <div className={`flex-1 h-0.5 mt-5 ${isFullyPaid || idx < stageIndex ? "bg-member-green" : "bg-gray-200 dark:bg-mdark-elevated"}`} />
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>
          <p className="mt-5 text-sm text-gray-600 dark:text-mdark-text-secondary font-medium">
            <span className="font-bold text-member-green dark:text-mdark-accent">{isFullyPaid ? "Status:" : "Current step:"}</span>{" "}
            {isFullyPaid ? "All payments received and validated. This loan is fully closed." : LIFECYCLE_STAGES[stageIndex]?.description}
          </p>
        </div>
      </div>

      {/* Breakdown: loan, payments and release deductions in one card */}
      <div className="bg-white dark:bg-mdark-card rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border p-4 sm:p-6">
        <h3 className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-mdark-text">Breakdown</h3>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-4">
          <BreakdownGroup title="Loan">
            <DetailRow label="Principal">{formatCurrency(loan.principal)}</DetailRow>
            <DetailRow label="Interest">{formatCurrency(loan.total_interest)}</DetailRow>
            <TotalRow label="Total payable">{formatCurrency(loan.total_payable)}</TotalRow>
          </BreakdownGroup>

          <BreakdownGroup title="Payments">
            <DetailRow label="Paid so far">{released ? formatCurrency(loan.amount_paid) : "—"}</DetailRow>
            <TotalRow label="Remaining" emphasis>
              {isFullyPaid ? "Closed" : released ? formatCurrency(loan.remaining_balance) : "Starts when released"}
            </TotalRow>
          </BreakdownGroup>

          {loan.fees ? (
            <BreakdownGroup title="Deducted on release">
              <DetailRow label="Service fee">{formatCurrency(loan.fees.service_fee)}</DetailRow>
              <DetailRow label="Capital Build-Up">{formatCurrency(loan.fees.cbu_deduction)}</DetailRow>
              <DetailRow label="Insurance">{formatCurrency(loan.fees.insurance_fee)}</DetailRow>
              <DetailRow label="Notarial fee">{formatCurrency(loan.fees.notarial_fee)}</DetailRow>
              <TotalRow label="Net proceeds" emphasis>{formatCurrency(loan.fees.net_proceeds)}</TotalRow>
              {!loan.fees.saved_at_application ? (
                <p className="text-[11px] text-gray-500 dark:text-mdark-text-secondary">
                  Based on the current fee policy; fees weren't recorded when this loan was submitted.
                </p>
              ) : null}
              {String(loan.application_type || "").toLowerCase() === "renewal" ? (
                <p className="text-[11px] text-gray-500 dark:text-mdark-text-secondary">
                  Renewal: the old loan's remaining balance is also deducted at release.
                </p>
              ) : null}
            </BreakdownGroup>
          ) : null}
        </div>

        <p className="mt-4 pt-3 border-t border-gray-100 dark:border-mdark-border text-[11px] text-gray-500 dark:text-mdark-text-secondary">
          Applied {formatShortDate(loan.application_date)}
          {loan.disbursal_date ? ` · Disbursed ${formatShortDate(loan.disbursal_date)}` : ""}
        </p>
      </div>

      {/* Payments for this loan only */}
      <div className="bg-white dark:bg-mdark-card rounded-2xl border border-gray-100 dark:border-mdark-border shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-gray-100 dark:border-mdark-border flex items-center gap-2">
          <Wallet className="w-4 h-4 text-member-green dark:text-mdark-accent" />
          <h3 className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-mdark-text">
            {isFullyPaid || showAllPayments ? "Payment History" : "Recent Payments"}
          </h3>
          {loanPayments.length > 0 ? (
            <span className="ml-auto text-[10px] font-bold text-gray-400 dark:text-mdark-text-muted uppercase tracking-wider">
              {loanPayments.length} payment{loanPayments.length !== 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
        {visiblePayments.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-mdark-text-secondary">No payments recorded for this loan yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-mdark-border">
            {visiblePayments.map((row, idx) => {
              const paymentStatus = paymentStatusLabel(row.confirmation_status);
              return (
                <li key={`${row.payment_id}-${idx}`} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-mdark-text">{formatCurrency(row.amount_paid)}</p>
                    <p className="text-[11px] text-gray-500 dark:text-mdark-text-secondary font-medium">
                      {formatShortDate(row.payment_date)}
                      {row.penalties > 0 ? ` · includes ${formatCurrency(row.penalties)} penalty` : ""}
                    </p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border ${toneStyles[paymentStatus.tone]}`}>
                    {paymentStatus.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {!isFullyPaid && loanPayments.length > RECENT_PAYMENTS ? (
          <div className="border-t border-gray-100 dark:border-mdark-border px-4 py-3 text-center">
            <button
              type="button"
              onClick={() => setShowAllPayments((v) => !v)}
              className="text-xs font-bold text-member-green hover:underline dark:text-mdark-accent"
            >
              {showAllPayments ? "Show recent payments only" : `View all ${loanPayments.length} payments`}
            </button>
          </div>
        ) : null}
      </div>

      <div className="bg-white dark:bg-mdark-card rounded-2xl border border-gray-100 dark:border-mdark-border shadow-sm overflow-hidden divide-y divide-gray-100 dark:divide-mdark-border">
        <Collapsible
          icon={ShieldCheck}
          title="How payments are computed"
          open={showComputation}
          onToggle={() => setShowComputation((v) => !v)}
        >
          <div className="p-4 sm:p-5 text-sm">
            {diminishing ? <DiminishingBreakdown loan={loan} /> : <AddOnBreakdown loan={loan} />}
          </div>
        </Collapsible>

        {loan.schedules && loan.schedules.length > 0 ? (
          <Collapsible
            icon={CalendarClock}
            title="Payment schedule"
            open={showSchedule}
            onToggle={() => setShowSchedule((v) => !v)}
          >
            <ul className="divide-y divide-gray-100 dark:divide-mdark-border">
              {loan.schedules.map((sched, idx) => {
                const isPaid = sched.schedule_status === "Paid";
                return (
                  <li key={`${sched.schedule_id || sched.installment_no}-${idx}`} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-mdark-text">Installment #{sched.installment_no}</p>
                      <p className="text-[11px] text-gray-500 dark:text-mdark-text-secondary font-medium">Due {formatShortDate(sched.due_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-gray-900 dark:text-mdark-text">
                        {formatCurrency(installmentAmount(sched, loan.monthly_amortization))}
                      </p>
                      <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${toneStyles[isPaid ? "success" : "warn"]}`}>
                        {isPaid ? "Paid" : "Unpaid"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Collapsible>
        ) : null}
      </div>
    </div>
  );
}
