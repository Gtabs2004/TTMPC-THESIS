// Turns a receipt (as returned by GET /api/receipts/...) into the rows the
// receipt shows. The on-screen viewer and the PDF both read this, so the two
// always carry the same fields. See RECEIPT_SYSTEM_PLAN.md §7.

export const COOP_NAME = "Tubungan Teachers' Multi-Purpose Cooperative";
export const COOP_ADDRESS = "Tubungan, Iloilo, Philippines";
export const RECEIPT_DISCLAIMER = "System-generated transaction receipt. This is not a BIR Official Receipt.";
export const LOGO_URL = encodeURI("/img/ttmpc logo.png");

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// `symbol` is "₱" on screen and "PHP " in the PDF (the PDF's built-in fonts
// have no peso sign).
export const formatMoney = (value, symbol = "₱") =>
  `${symbol}${num(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The PDF's fonts lack the "−" minus sign too, so it gets a plain hyphen.
const deduction = (value, symbol) => `${symbol === "₱" ? "−" : "-"}${formatMoney(value, symbol)}`;

// Timestamps are shown in Philippine time whatever the viewer's clock says.
export const formatDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d).replace(/, (\d{1,2}:)/, " · $1");
};

// Plain dates (due dates) carry no time zone; format them as-is.
export const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(d);
};

const text = (v) => (v === null || v === undefined || String(v).trim() === "" ? "—" : String(v));

const row = (label, value, opts = {}) => ({ label, value, strong: !!opts.strong, mono: !!opts.mono });

function memberGroup(snapshot, accountLabel, account) {
  const member = snapshot.member || {};
  const rows = [row("Name", text(member.name)), row("Membership ID", text(member.membership_id))];
  if (account) rows.push(row(accountLabel, account, { mono: true }));
  return { heading: "Member", rows };
}

function loanPaymentView(snapshot, symbol) {
  const loan = snapshot.loan || {};
  const b = snapshot.breakdown || {};
  const ref = snapshot.reference || {};
  const installment = loan.installment_no
    ? ` · Installment ${loan.installment_no}${loan.term_months ? ` of ${loan.term_months}` : ""}`
    : "";

  const breakdown = [row("Amount paid", formatMoney(b.amount_paid, symbol))];
  if (num(b.penalty_paid) > 0) breakdown.push(row("Penalty paid", formatMoney(b.penalty_paid, symbol)));
  breakdown.push(
    row("Applied to penalty", formatMoney(b.applied_to_penalty, symbol)),
    row("Applied to arrears", formatMoney(b.applied_to_arrears, symbol)),
    row("Applied to this installment", formatMoney(b.applied_to_current, symbol)),
  );
  if (num(b.applied_to_credit) > 0) breakdown.push(row("Advance credit", formatMoney(b.applied_to_credit, symbol)));
  breakdown.push(row("Remaining loan balance", formatMoney(b.remaining_balance, symbol), { strong: true }));

  return {
    title: "Loan Payment",
    subtitle: `${loan.loan_type ? `${loan.loan_type} Loan` : "Loan"}${installment}`,
    groups: [
      memberGroup(snapshot, "Loan account", loan.control_number),
      { heading: "Payment breakdown", rows: breakdown },
      {
        heading: "Reference",
        rows: [
          row("Receipt no.", text(snapshot.receipt_no), { mono: true }),
          row("Payment ref.", text(ref.payment_reference), { mono: true }),
          row("Paid on", formatDateTime(ref.paid_at)),
          row("Received by", text(ref.received_by)),
          row("Validated by", text(ref.validated_by)),
          row("Validated on", formatDateTime(ref.validated_at)),
        ],
      },
    ],
  };
}

function loanReleaseView(snapshot, symbol) {
  const loan = snapshot.loan || {};
  const b = snapshot.breakdown || {};
  const ref = snapshot.reference || {};
  const recorded = b.recorded === true;

  const breakdown = recorded
    ? [
        row("Principal", formatMoney(b.principal, symbol)),
        row("Service fee", deduction(b.service_fee, symbol)),
        row("CBU deduction", deduction(b.cbu_deduction, symbol)),
        row("Insurance", deduction(b.insurance_fee, symbol)),
        row("Notarial fee", deduction(b.notarial_fee, symbol)),
        ...(num(b.renewal_payoff) > 0 ? [row("Previous loan balance", deduction(b.renewal_payoff, symbol))] : []),
        row("Net proceeds", formatMoney(b.net_proceeds, symbol), { strong: true }),
      ]
    : [
        row("Principal released", formatMoney(b.principal, symbol), { strong: true }),
        row("Deductions", "Not recorded for this release"),
      ];

  const repayment = [];
  if (loan.term_months) repayment.push(row("Term", `${loan.term_months} months`));
  if (num(loan.monthly_amortization) > 0) repayment.push(row("Monthly amortization", formatMoney(loan.monthly_amortization, symbol)));
  if (loan.first_due_date) repayment.push(row("First due date", formatDate(loan.first_due_date)));

  return {
    title: "Loan Released",
    subtitle: `${loan.loan_type ? `${loan.loan_type} Loan` : "Loan"} · ${recorded ? "Net proceeds received" : "Principal released"}`,
    groups: [
      memberGroup(snapshot, "Loan account", loan.control_number),
      { heading: "Release breakdown", rows: breakdown },
      ...(repayment.length ? [{ heading: "Repayment", rows: repayment }] : []),
      {
        heading: "Reference",
        rows: [
          row("Receipt no.", text(snapshot.receipt_no), { mono: true }),
          row("Disbursement ref.", text(ref.disbursement_reference), { mono: true }),
          row("Released on", formatDateTime(ref.released_at)),
          row("Released by", text(ref.released_by)),
        ],
      },
    ],
  };
}

function cbuView(snapshot, symbol) {
  const b = snapshot.breakdown || {};
  const ref = snapshot.reference || {};
  return {
    title: "Capital Build-Up Deposit",
    subtitle: `Share capital · Paid by ${text(ref.paid_by)}`,
    groups: [
      memberGroup(snapshot),
      {
        heading: "Capital build-up",
        rows: [
          row("Amount added", formatMoney(b.amount_added, symbol)),
          row("Share capital before", formatMoney(b.share_capital_before, symbol)),
          row("Share capital after", formatMoney(b.share_capital_after, symbol), { strong: true }),
        ],
      },
      {
        heading: "Reference",
        rows: [
          row("Receipt no.", text(snapshot.receipt_no), { mono: true }),
          row("CBU deposit ID", text(ref.cbu_deposit_id), { mono: true }),
          row("Paid by", text(ref.paid_by)),
          row("Date received", formatDate(ref.date_received)),
          row("Received by", text(ref.received_by)),
        ],
      },
    ],
  };
}

const BUILDERS = {
  loan_payment: loanPaymentView,
  loan_release: loanReleaseView,
  cbu: cbuView,
};

// Fallback for a receipt type this build doesn't know yet: still shows the
// essentials rather than nothing.
function genericView(snapshot) {
  return {
    title: text(snapshot.title || "Transaction"),
    subtitle: "",
    groups: [
      memberGroup(snapshot),
      {
        heading: "Reference",
        rows: [
          row("Receipt no.", text(snapshot.receipt_no), { mono: true }),
          row("Issued on", formatDateTime(snapshot.issued_at)),
        ],
      },
    ],
  };
}

export function buildReceiptView(receipt, { symbol = "₱" } = {}) {
  const snapshot = receipt?.snapshot || {};
  const kind = snapshot.kind || receipt?.source_type;
  const view = (BUILDERS[kind] || genericView)(snapshot, symbol);
  return {
    ...view,
    receiptNo: snapshot.receipt_no || receipt?.receipt_no || "",
    amount: formatMoney(snapshot.amount ?? receipt?.amount, symbol),
    issuedAt: snapshot.issued_at || receipt?.issued_at,
  };
}
