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
import LoanDeductionsCard from "../../components/LoanDeductionsCard";
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
    <span className="text-gray-600 dark:text-gray-400 font-medium">{label}</span>
    <span className={`text-right ${emphasis ? "font-extrabold text-member-green dark:text-green-400" : "font-bold text-gray-900 dark:text-white"}`}>
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
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-[#FAF9FB] dark:bg-gray-800 p-4">
      <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">How Your Payments Are Computed</p>
      <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
        This is a <span className="font-bold">diminishing</span> loan. You pay the same principal every month, but interest
        is charged only on your remaining balance &mdash; so your payment gets <span className="font-bold">smaller each month</span>.
      </p>
      {isProjected ? (
        <p className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[11px] font-medium text-amber-800 dark:text-amber-300">
          Estimated schedule. Exact due dates and amounts are finalized when your loan is released.
        </p>
      ) : null}

      <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Where {formatCurrency(firstRow.total)} comes from
        </p>
        <ol className="mt-2 space-y-2 text-[11px] text-gray-700 dark:text-gray-300">
          <li>
            <span className="font-bold">1. Principal per month</span> &mdash; your loan split evenly over the term.
            <div className="mt-0.5 font-mono text-[11px] text-gray-900 dark:text-white">
              {formatPlain(loan.principal)} &divide; {loan.term} = {formatPlain(monthlyPrincipal)}
            </div>
          </li>
          <li>
            <span className="font-bold">2. Balance after that payment</span> &mdash; interest is charged on what remains.
            <div className="mt-0.5 font-mono text-[11px] text-gray-900 dark:text-white">
              {formatPlain(loan.principal)} &minus; {formatPlain(monthlyPrincipal)} = {formatPlain(firstRow.balance)}
            </div>
          </li>
          <li>
            <span className="font-bold">3. Interest for month 1</span> &mdash; {ratePercentLabel} of that balance.
            <div className="mt-0.5 font-mono text-[11px] text-gray-900 dark:text-white">
              {formatPlain(firstRow.balance)} &times; {ratePercentLabel} = {formatPlain(firstRow.interest)}
            </div>
          </li>
          <li>
            <span className="font-bold">4. First payment</span> &mdash; principal plus interest.
            <div className="mt-0.5 font-mono text-[11px] font-bold text-member-green dark:text-green-400">
              {formatPlain(monthlyPrincipal)} + {formatPlain(firstRow.interest)} = {formatPlain(firstRow.total)}
            </div>
          </li>
        </ol>
        <p className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2 text-[11px] text-gray-600 dark:text-gray-300">
          Every following month repeats steps 2&ndash;4 on the smaller balance, which is why the payment keeps going down.
        </p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <th className="py-2 pr-2 font-bold">Mo</th>
              <th className="py-2 px-2 font-bold text-right">Principal</th>
              <th className="py-2 px-2 font-bold text-right">Interest</th>
              <th className="py-2 px-2 font-bold">How interest was computed</th>
              <th className="py-2 px-2 font-bold text-right">Payment</th>
              <th className="py-2 pl-2 font-bold text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row) => (
              <tr key={row.key} className={row.isPaid ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"}>
                <td className="py-2 pr-2 font-bold">{row.installmentNo}</td>
                <td className="py-2 px-2 text-right font-mono">{formatCurrency(row.principal)}</td>
                <td className="py-2 px-2 text-right font-mono">{formatCurrency(row.interest)}</td>
                <td className="py-2 px-2 font-mono text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {formatPlain(row.balance)} &times; {ratePercentLabel}
                </td>
                <td className="py-2 px-2 text-right font-mono font-bold">{formatCurrency(row.total)}</td>
                <td className="py-2 pl-2 text-right font-mono">{formatCurrency(row.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-bold text-gray-900 dark:text-white">
              <td className="py-2 pr-2 text-[10px] uppercase tracking-wider">Total</td>
              <td className="py-2 px-2 text-right font-mono">{formatCurrency(sumBy(rows, "principal"))}</td>
              <td className="py-2 px-2 text-right font-mono text-member-green dark:text-green-400">{formatCurrency(sumBy(rows, "interest"))}</td>
              <td className="py-2 px-2 text-[10px] font-medium text-gray-500 dark:text-gray-400">sum of column</td>
              <td className="py-2 px-2 text-right font-mono">{formatCurrency(sumBy(rows, "total"))}</td>
              <td className="py-2 pl-2 text-right font-mono">{formatCurrency(0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
        Total interest is the sum of the interest column &mdash; not the first payment multiplied by the term, because every
        payment differs.
      </p>
    </div>
  );
}

function AddOnBreakdown({ loan }) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-[#FAF9FB] dark:bg-gray-800 p-4">
      <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">How Total Interest is Computed</p>
      <div className="space-y-2">
        <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span className="text-gray-500 dark:text-gray-400">Monthly Amortization × Term</span>
          <span className="break-words font-bold text-gray-900 dark:text-white font-mono sm:text-right">
            {formatCurrency(loan.monthly_amortization)} × {loan.term} mo
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-gray-500 dark:text-gray-400">= Total Payable</span>
          <span className="shrink-0 font-bold text-gray-900 dark:text-white">{formatCurrency(loan.total_payable)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-gray-500 dark:text-gray-400">− Principal (Loan Amount)</span>
          <span className="shrink-0 font-bold text-gray-900 dark:text-white">− {formatCurrency(loan.principal)}</span>
        </div>
        <div className="border-t border-gray-200 dark:border-gray-600 pt-2 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">= Total Interest</span>
          <span className="text-sm font-extrabold text-member-green dark:text-green-400">{formatCurrency(loan.total_interest)}</span>
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

export default function LoanJourneyPanel({ loan, payments }) {
  const [showComputation, setShowComputation] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);

  const isFullyPaid = isFullyPaidLoan(loan);
  const released = isReleasedLoan(loan);
  const status = memberStatusLabel(loan);
  const stageIndex = resolveStageIndex(loan);
  const lastIdx = LIFECYCLE_STAGES.length - 1;
  const diminishing = isDiminishingLoan(loan.loan_type);

  const loanPayments = payments.filter((p) => p.loan_id === loan.loan_id);
  const visiblePayments = isFullyPaid || showAllPayments ? loanPayments : loanPayments.slice(0, RECENT_PAYMENTS);

  const nextDueLabel = isFullyPaid
    ? "No upcoming payment"
    : loan.next_due_schedule?.due_date
      ? formatShortDate(loan.next_due_schedule.due_date)
      : released
        ? "No upcoming payment"
        : "Set when released";

  return (
    <>
      {/* Header + progress */}
      <div className={`rounded-2xl border shadow-sm p-5 sm:p-6 mb-6 animate-fade-in-up ${
        isFullyPaid
          ? "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40 border-green-200 dark:border-green-800"
          : "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            {isFullyPaid ? (
              <div className="shrink-0 w-11 h-11 rounded-full bg-member-green flex items-center justify-center shadow-sm">
                <Trophy className="w-5 h-5 text-white" />
              </div>
            ) : null}
            <div>
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">{loan.loan_type}</p>
              <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white">{formatCurrency(loan.principal)}</h2>
              <p className="mt-0.5 break-words text-xs text-gray-500 dark:text-gray-400 font-mono">Loan ID: {loan.loan_id}</p>
            </div>
          </div>
          <span className={`inline-flex self-start items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border ${toneStyles[status.tone]}`}>
            {isFullyPaid ? <Trophy className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {status.text}
          </span>
        </div>

        {isFullyPaid ? (
          <div className="mt-5 rounded-xl bg-member-green/10 border border-member-green/20 px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-member-green dark:text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-extrabold text-[#1a4a2f] dark:text-green-300">Loan fully settled</p>
              <p className="text-xs text-[#2d6a38] dark:text-green-400 mt-0.5">All payments have been received and validated. This loan is now closed.</p>
            </div>
          </div>
        ) : released ? (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Payment Progress</p>
              <p className="text-sm font-extrabold text-member-green dark:text-green-400">{loan.progress_percent}%</p>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-member-green to-[#66B53B] transition-all duration-500"
                style={{ width: `${loan.progress_percent}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 font-medium">
              {formatCurrency(loan.amount_paid)} paid of {formatCurrency(loan.total_payable)} total
            </p>
          </div>
        ) : null}
      </div>

      {/* Lifecycle stepper */}
      <div className="rounded-2xl border shadow-sm p-5 sm:p-6 mb-6 animate-fade-in-up bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-5">
          <CalendarClock className="w-5 h-5 text-member-green dark:text-green-400" />
          <h3 className="font-extrabold text-gray-900 dark:text-white">Loan Lifecycle</h3>
          {isFullyPaid ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/40 border border-green-200 dark:border-green-800 px-2.5 py-1 text-[10px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wider">
              <CheckCircle2 className="w-3 h-3" /> Complete
            </span>
          ) : null}
        </div>

        <div className="hidden md:block">
          <div className="flex items-start justify-between gap-2">
            {LIFECYCLE_STAGES.map((stage, idx) => {
              const isComplete = isFullyPaid ? true : idx < stageIndex;
              const isActive = isFullyPaid ? idx === lastIdx : idx === stageIndex;
              const isFinalTrophy = isFullyPaid && idx === lastIdx;
              const StageIcon = stage.icon;
              return (
                <React.Fragment key={stage.id}>
                  <div className="flex flex-col items-center text-center min-w-0 flex-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isFinalTrophy
                        ? "bg-member-green text-white ring-4 ring-member-green/20"
                        : isComplete && !isActive
                          ? "bg-member-green text-white"
                          : isActive
                            ? "bg-[#66B53B] text-white ring-4 ring-[#66B53B]/20"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-400"
                    }`}>
                      {isFinalTrophy
                        ? <Trophy className="w-4 h-4" />
                        : (isComplete && !isActive)
                          ? <CheckCircle2 className="w-5 h-5" />
                          : <StageIcon className="w-4 h-4" />}
                    </div>
                    <p className={`mt-2 text-[11px] font-bold leading-tight ${
                      isFinalTrophy || isActive
                        ? "text-member-green dark:text-green-400"
                        : isComplete
                          ? "text-gray-700 dark:text-gray-300"
                          : "text-gray-400"
                    }`}>
                      {stage.label}
                    </p>
                  </div>
                  {idx < lastIdx ? (
                    <div className={`flex-1 h-0.5 mt-5 ${
                      isFullyPaid || idx < stageIndex ? "bg-member-green" : "bg-gray-200 dark:bg-gray-700"
                    }`} />
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>
          <p className="mt-5 text-sm text-gray-600 dark:text-gray-400 font-medium">
            <span className="font-bold text-member-green dark:text-green-400">{isFullyPaid ? "Status:" : "Current step:"}</span>{" "}
            {isFullyPaid
              ? "All payments received and validated. This loan is fully closed."
              : LIFECYCLE_STAGES[stageIndex]?.description}
          </p>
        </div>

        <ol className="md:hidden space-y-3">
          {LIFECYCLE_STAGES.map((stage, idx) => {
            const isComplete = isFullyPaid ? true : idx < stageIndex;
            const isActive = isFullyPaid ? idx === lastIdx : idx === stageIndex;
            const isFinalTrophy = isFullyPaid && idx === lastIdx;
            const StageIcon = stage.icon;
            return (
              <li key={stage.id} className="flex items-start gap-3">
                <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                  isFinalTrophy
                    ? "bg-member-green text-white ring-4 ring-member-green/20"
                    : isComplete && !isActive
                      ? "bg-member-green text-white"
                      : isActive
                        ? "bg-[#66B53B] text-white ring-4 ring-[#66B53B]/20"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-400"
                }`}>
                  {isFinalTrophy
                    ? <Trophy className="w-4 h-4" />
                    : (isComplete && !isActive)
                      ? <CheckCircle2 className="w-4 h-4" />
                      : <StageIcon className="w-4 h-4" />}
                </div>
                <div className="pt-1">
                  <p className={`text-sm font-bold ${
                    isFinalTrophy || isActive
                      ? "text-member-green dark:text-green-400"
                      : isComplete
                        ? "text-gray-800 dark:text-gray-200"
                        : "text-gray-400"
                  }`}>
                    {stage.label}
                  </p>
                  {(isActive || isFinalTrophy) ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                      {isFinalTrophy ? "All payments received and validated." : stage.description}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Loan details + deductions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 sm:p-6">
          <h3 className="font-extrabold text-gray-900 dark:text-white mb-4">Loan Details</h3>
          <div className="space-y-3">
            <DetailRow label="Principal">{formatCurrency(loan.principal)}</DetailRow>
            <DetailRow label="Interest Rate">
              {loan.interest_rate ? `${Number(loan.interest_rate).toFixed(2)}% monthly` : "—"}
            </DetailRow>
            <DetailRow label="Term">{loan.term ? `${loan.term} months` : "—"}</DetailRow>
            <DetailRow label="Total Interest">{formatCurrency(loan.total_interest)}</DetailRow>
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
              <DetailRow label="Total Payable">{formatCurrency(loan.total_payable)}</DetailRow>
            </div>
            <DetailRow label="Amount Paid">{released ? formatCurrency(loan.amount_paid) : "—"}</DetailRow>
            <DetailRow label="Remaining Balance" emphasis>
              {isFullyPaid ? "Closed" : released ? formatCurrency(loan.remaining_balance) : "Starts when released"}
            </DetailRow>
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
              <DetailRow label={diminishing ? "First Amortization" : "Monthly Amortization"}>
                {formatCurrency(loan.monthly_amortization)}
              </DetailRow>
              <DetailRow label="Next Due Date">{nextDueLabel}</DetailRow>
              <DetailRow label="Applied On">{formatShortDate(loan.application_date)}</DetailRow>
              <DetailRow label="Disbursed On">{formatShortDate(loan.disbursal_date)}</DetailRow>
            </div>
          </div>
        </div>

        <LoanDeductionsCard
          loan={loan.fees}
          isRenewal={String(loan.application_type || "").toLowerCase() === "renewal"}
          estimated={Boolean(loan.fees) && !loan.fees.saved_at_application}
        />
      </div>

      {/* Payments for this loan only */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm mb-6 animate-fade-in-up overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-member-green dark:text-green-400" />
          <h3 className="font-extrabold text-gray-900 dark:text-white">
            {isFullyPaid || showAllPayments ? "Payment History" : "Recent Payments"}
          </h3>
          {loanPayments.length > 0 ? (
            <span className="ml-auto text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {loanPayments.length} payment{loanPayments.length !== 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
        {visiblePayments.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No payments recorded for this loan yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {visiblePayments.map((row, idx) => {
              const paymentStatus = paymentStatusLabel(row.confirmation_status);
              return (
                <li key={`${row.payment_id}-${idx}`} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(row.amount_paid)}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                      {formatShortDate(row.payment_date)}
                      {row.penalties > 0 ? ` · includes ${formatCurrency(row.penalties)} penalty` : ""}
                    </p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border ${toneStyles[paymentStatus.tone]}`}>
                    {paymentStatus.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {!isFullyPaid && loanPayments.length > RECENT_PAYMENTS ? (
          <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3 text-center">
            <button
              type="button"
              onClick={() => setShowAllPayments((v) => !v)}
              className="text-xs font-bold text-member-green hover:underline dark:text-green-400"
            >
              {showAllPayments ? "Show recent payments only" : `View all ${loanPayments.length} payments`}
            </button>
          </div>
        ) : null}
      </div>

      {/* How the amortization is computed */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm mb-4 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowComputation((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <span className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-member-green dark:text-green-400" />
            <span className="font-extrabold text-gray-900 dark:text-white">How Your Payments Are Computed</span>
          </span>
          {showComputation ? <ChevronUp className="w-4 h-4 text-gray-500 dark:text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
        </button>
        {showComputation ? (
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 text-sm">
            {diminishing ? <DiminishingBreakdown loan={loan} /> : <AddOnBreakdown loan={loan} />}
          </div>
        ) : null}
      </div>

      {/* Payment schedule */}
      {loan.schedules && loan.schedules.length > 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm mb-6 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSchedule((v) => !v)}
            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-member-green dark:text-green-400" />
              <span className="font-extrabold text-gray-900 dark:text-white">View Payment Schedule</span>
            </span>
            {showSchedule ? <ChevronUp className="w-4 h-4 text-gray-500 dark:text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
          </button>
          {showSchedule ? (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
              {loan.schedules.map((sched, idx) => {
                const isPaid = sched.schedule_status === "Paid";
                return (
                  <li key={`${sched.schedule_id || sched.installment_no}-${idx}`} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">Installment #{sched.installment_no}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Due {formatShortDate(sched.due_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-gray-900 dark:text-white">
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
          ) : null}
        </div>
      ) : null}
    </>
  );
}
