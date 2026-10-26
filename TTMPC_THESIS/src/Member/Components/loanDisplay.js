// Shared status and formatting helpers for the My Loans page and its panel.

export const statusKey = (loan) => String(loan?.loan_status || loan?.application_status || "").trim().toLowerCase();

const RELEASED_STATUSES = new Set(["released", "partially paid", "fully paid"]);
export const isReleasedLoan = (loan) => RELEASED_STATUSES.has(statusKey(loan));
export const isFullyPaidLoan = (loan) => statusKey(loan) === "fully paid";
export const isRevisionRequestedLoan = (loan) => statusKey(loan) === "revision_requested";

export const memberStatusLabel = (loan) => {
  const status = statusKey(loan);
  if (status === "fully paid") return { text: "Fully Paid", tone: "success" };
  if (status === "partially paid") return { text: "Ongoing Payments", tone: "info" };
  if (status === "released") return { text: "Disbursed", tone: "info" };
  if (status === "ready for disbursement") return { text: "Ready for Release", tone: "warn" };
  if (status === "to be disbursed") return { text: "Approved", tone: "success" };
  if (status === "pending rescheduling") return { text: "Rescheduled", tone: "warn" };
  if (status === "approved") return { text: "Approved", tone: "success" };
  if (status === "recommended for approval" || status === "recommended for bod approval") return { text: "Pending Approval", tone: "warn" };
  if (status === "pending") return { text: "Submitted", tone: "warn" };
  if (status === "revision_requested") return { text: "Revision Requested", tone: "warn" };
  if (status === "revised_submitted") return { text: "Resubmitted — Under Review", tone: "info" };
  if (status === "rejected") return { text: "Not Approved", tone: "error" };
  if (status === "cancelled") return { text: "Cancelled", tone: "neutral" };
  return { text: "In Process", tone: "neutral" };
};

export const toneStyles = {
  success: "bg-green-100 text-green-700 border-green-200",
  info: "bg-blue-100 text-blue-700 border-blue-200",
  warn: "bg-amber-100 text-amber-700 border-amber-200",
  error: "bg-red-100 text-red-700 border-red-200",
  neutral: "bg-gray-100 text-gray-700 border-gray-200",
};

export const formatShortDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
};

export const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The installment actually due next, from the repayment schedule. Emergency
// loans are diminishing, so this is smaller than the first amortization later on.
export const nextInstallmentAmount = (loan) => {
  const next = loan?.next_due_schedule;
  if (!next) return Number(loan?.monthly_amortization || 0);
  const components = Number(next.expected_principal || 0) + Number(next.expected_interest || 0);
  return components > 0 ? components : Number(next.expected_amount || loan.monthly_amortization || 0);
};

// The loan whose installment falls due soonest (null when none has a schedule).
// The Dashboard's "Next Payment" and My Loans' "Next Payment Due" both use this,
// so the two pages can never show different payments.
export const findNextPaymentLoan = (loans) =>
  [...loans]
    .filter((loan) => loan.next_due_schedule?.due_date)
    .sort((a, b) => String(a.next_due_schedule.due_date).localeCompare(String(b.next_due_schedule.due_date)))[0] || null;
