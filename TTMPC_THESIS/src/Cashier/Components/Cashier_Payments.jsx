import React, { useEffect, useMemo, useRef, useState } from "react";
import StaffSidebar from "../../components/StaffSidebar";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { useConfirm } from "../../contex/ConfirmContext";
import StaffTopbar from "../../components/StaffTopbar";
import Breadcrumb from "../../components/Breadcrumb";
import { TableToolbar } from "../../components/TableToolbar";
import TableStateRow from "../../components/TableStateRow";
import Pagination from "../../components/Pagination";
// Adjust path to AuthContext if needed
import LoanNotificationBell from "../../components/LoanNotificationBell";
import { authHeaders } from "../../utils/authHeaders";
import { apiErrorMessage } from "../../utils/apiError";
import { formatWithCommas, stripCommas } from "../../utils/numberFormat";
import { 
  LayoutDashboard, 
  Search,
  Bell,
  Banknote,
  ChevronDown,
  ArrowUpDown,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  UserPlus,
  ArrowUpRight,
  Send, 
  PiggyBank,
  ArrowDownLeft,
  ShoppingCart,
  History,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 5;

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value || 0);

const roundCurrency = (value) => Number((value || 0).toFixed(2));

// What the payment field starts at: this period's amortization, capped at what
// is still owed. It is only a starting point -- the cashier overwrites it with
// the amount the member actually hands over (partial, exact, or advance).
// What this period actually owes: the installment, plus anything carried
// forward from earlier periods, less any advance credit. Prefilling the bare
// amortization when arrears exist would under-collect by exactly the shortfall
// and leave the member permanently a period behind.
const getDefaultPaymentAmount = (loan) => {
  const installment = Number(loan?.amortization) || 0;
  const arrears = Number(loan?.carried_arrears) || 0;
  const credit = Number(loan?.applied_credit) || 0;
  const remaining = Number(loan?.remaining_balance) || 0;
  const dueThisPeriod = Math.max(installment + arrears - credit, 0);
  return roundCurrency(Math.max(Math.min(dueThisPeriod, remaining), 0));
};

const formatSequenceId = (prefix, sequenceNumber) => {
  const numericValue = Math.max(Number(sequenceNumber) || 1, 1);
  return `${prefix}${String(numericValue).padStart(3, "0")}`;
};

const normalizeMonthlyInterestPercent = (loan) => {
  let ratePercent = Number(loan?.interest_rate);
  const loanType = String(loan?.loan_type || "").trim().toLowerCase();

  if (!Number.isFinite(ratePercent) || ratePercent <= 0) return 0;

  // Backward compatibility for consolidated monthly format variants.
  if (loanType === "consolidated") {
    if (ratePercent > 0 && ratePercent < 0.1) {
      // 0.083 -> 0.83%
      ratePercent *= 10;
    } else if (ratePercent >= 1 && ratePercent < 10) {
      // 8.3 -> 0.83%
      ratePercent /= 10;
    }
  }

  return ratePercent;
};

const getMonthlyInterestRate = (loan) => {
  const ratePercent = normalizeMonthlyInterestPercent(loan);
  return ratePercent > 0 ? ratePercent / 100 : 0;
};

const calculateAmortization = (loan) => {
  const principal = Number(loan.loan_amount) || 0;
  const months = Number(loan.term_months) || 0;
  const monthlyRate = getMonthlyInterestRate(loan);

  if (principal <= 0 || months <= 0) return 0;


  if (loan.loan_type === "emergency") {
    // First-month total payment under the equal-principal / declining-interest
    // schedule (matches /api/loans/compute and the Emergency_Loan UI).
    const totalPrincipalCents = Math.round(principal * 100);
    const monthlyPrincipalCents = Math.round(totalPrincipalCents / months);
    const endingBalanceCents = totalPrincipalCents - monthlyPrincipalCents;
    const interestCents = Math.round(endingBalanceCents * monthlyRate);
    return roundCurrency((monthlyPrincipalCents + interestCents) / 100);
  }


  const totalPayable = principal * (1 + monthlyRate * months);
  return roundCurrency(totalPayable / months);
};

const getDisplayedInterestRate = (loan) => {
  const loanType = String(loan?.loan_type || "").trim().toLowerCase();
  const ratePercent = normalizeMonthlyInterestPercent(loan).toFixed(2);

  if (loanType === "emergency") return `${ratePercent}% (Diminishing)`;
  if (loanType === "bonus") {
    return `${ratePercent}% (${loan.is_migs_member ? "MIGS" : "Non-MIGS"})`;
  }
  return `${ratePercent}%`;
};

const toTitleCase = (value) => {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

// 4-tier delay status. Backend already factors in *skipped* prior installments
// when setting `is_delayed` and `is_overdue_for_penalty`. We also surface the
// soft "Past Due" tag and bump the badge based on `missed_count`.
const resolveDelayStatus = (loan) => {
  if (!loan?.due_date) return "on_time";
  const today = new Date();
  const due = new Date(loan.due_date);
  if (Number.isNaN(due.getTime())) return "on_time";

  if (loan.is_overdue_for_penalty) return "overdue";
  if (loan.is_delayed) return "no_payment";
  // Any past-due missed installment, even if it's only days behind.
  if ((loan.missed_count || 0) > 0) return "past_due";
  if (today > due) return "past_due";
  return "on_time";
};

const formatDelayLabel = (key, missedCount) => {
  if (key === "on_time") return "On Time";
  const suffix = missedCount > 1 ? ` (${missedCount} mo)` : "";
  if (key === "past_due")   return `Past Due${suffix}`;
  if (key === "no_payment") return `No Recent Payment${suffix}`;
  if (key === "overdue")    return `Overdue · Penalty${suffix}`;
  return "On Time";
};

const DELAY_STATUS_META = {
  on_time:    { className: "bg-green-50 text-green-700 ring-1 ring-green-200"    },
  past_due:   { className: "bg-gray-50 text-gray-700 ring-1 ring-gray-200"       },
  no_payment: { className: "bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200" },
  overdue:    { className: "bg-red-50 text-red-700 ring-1 ring-red-200"         },
};

// Penalty policy (updated):
//   • 3-month grace period after the schedule due date — no penalty.
//   • Charged on the *missed installment amount* (not the whole remaining balance).
//   • Rate comes from loan_schedules.penalty (1% for bonus, 2% for others).
//
// Inputs (all optional but recommended):
//   dueDate            — ISO string of the schedule's due_date
//   installmentAmount  — expected_amount for that installment; fallback to amortization
//   penaltyRatePercent — schedule's penalty rate as a percent (e.g. 2 for 2%)
//   loanType           — used only as last-resort fallback when rate is missing
const calculatePenalty = (dueDate, installmentAmount, penaltyRatePercent = null, loanType = "") => {
  if (!dueDate) return 0;

  const today = new Date();
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 0;

  const amount = Number(installmentAmount) || 0;
  if (amount <= 0) return 0;

  // 3-month grace period.
  const penaltyStartDate = new Date(due);
  penaltyStartDate.setMonth(penaltyStartDate.getMonth() + 3);
  if (today < penaltyStartDate) return 0;

  const monthsOverdue = Math.max(
    1,
    (today.getFullYear() - penaltyStartDate.getFullYear()) * 12 +
      today.getMonth() -
      penaltyStartDate.getMonth() +
      1
  );

  // Resolve rate: explicit override → fall back to loan-type default.
  let rate = Number(penaltyRatePercent);
  if (!Number.isFinite(rate) || rate <= 0) {
    rate = String(loanType).toLowerCase() === "bonus" ? 1 : 2;
  }
  const ratePerMonth = rate / 100;

  return amount * ratePerMonth * monthsOverdue;
};

// Map backend/network failures onto messages a cashier can act on. The raw
// error is preserved in the console for debugging but never shown verbatim,
// so SQL/stack detail cannot leak into the UI.
const friendlyPaymentError = (error) => {
  const raw = String(error?.message || "").toLowerCase();
  if (!raw) return "Something went wrong while recording the payment. Please try again.";
  if (raw.includes("already fully paid") || raw.includes("409")) {
    return "This loan is already fully paid and can no longer accept payments.";
  }
  // Server-side amount check: the message is already written for the cashier.
  if (raw.includes("outstanding balance")) return error.message;
  if (raw.includes("no loan schedule")) {
    return "This loan has no payment schedule yet. Ask the Bookkeeper to generate it first.";
  }
  if (raw.includes("loan not found") || raw.includes("404")) {
    return "This loan could not be found. Refresh the list and try again.";
  }
  if (raw.includes("schedule_id") && raw.includes("belong")) {
    return "This payment no longer matches the loan's current schedule. Refresh and try again.";
  }
  if (raw.includes("failed to fetch") || raw.includes("networkerror") || raw.includes("network")) {
    return "Cannot reach the server. Check your connection and try again.";
  }
  if (raw.includes("401") || raw.includes("403") || raw.includes("unauthor") || raw.includes("forbidden")) {
    return "Your session has expired. Please sign in again to record payments.";
  }
  if (raw.includes("duplicate") || raw.includes("unique")) {
    return "This payment appears to have already been recorded. Refresh to confirm before retrying.";
  }
  if (raw.includes("500") || raw.includes("database") || raw.includes("sql") || raw.includes("supabase")) {
    return "The server could not record the payment. Please try again in a moment.";
  }
  return "Something went wrong while recording the payment. Please try again.";
};

// "Aug 9, 2026" — easier to scan than 8/9/2026 in a dense financial modal.
const formatLongDate = (value) => {
  if (!value) return "\u2014";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const getLoanStatus = (remainingBalance, loanAmount) => {
  if (remainingBalance <= 0) return "Fully Paid";
  if (remainingBalance < loanAmount) return "Partially Paid";
  return "Unpaid";
};

const getMissedDueDates = (dueDate) => {
  const today = new Date();
  const due = new Date(dueDate);

  if (Number.isNaN(due.getTime()) || today <= due) return 0;

  const monthDiff =
    (today.getFullYear() - due.getFullYear()) * 12 +
    (today.getMonth() - due.getMonth());
  const hasCrossedDueDay = today.getDate() >= due.getDate() ? 1 : 0;
  return Math.max(monthDiff + hasCrossedDueDay, 1);
};

const normalizeLoanType = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (text.includes("consolidated")) return "consolidated";
  if (text.includes("emergency")) return "emergency";
  if (text.includes("bonus")) return "bonus";
  return "consolidated";
};

const Cashier_Payments = () => {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [loans, setLoans] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  // Ledger modal shows loan info + full payment history before the Cashier
  // proceeds to the payment modal. Same selectedLoan is reused so the Pay
  // action in the ledger flows straight into the existing payment flow.
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  // Holds the reference for the in-flight submission so a retry reuses it and
  // is deduped server-side. Cleared once the payment lands or the modal closes.
  const submissionReferenceRef = useRef(null);
  const [formError, setFormError] = useState("");
  // Amount the cashier is collecting, as plain numeric text (no commas).
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [loansError, setLoansError] = useState("");
  
  
  // Filtering and sorting
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  // Default LIFO: newest disbursed loan first. Panelists expect the most recent
  // activity at the top; sorting by due_date buried fresh loans below overdue ones.
  const [sortConfig, setSortConfig] = useState({ key: "disbursal_date", direction: "desc" });
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [page]);

  // Derived data: filtered and sorted loans
  const filteredAndSortedLoans = useMemo(() => {
    const q = (searchTerm ?? "").toLowerCase();
    let filtered = loans.filter((loan) => {
      const memberName = (loan.member_name ?? "").toLowerCase();
      const loanId = (loan.loan_id ?? "").toLowerCase();
      const memberId = (loan.member_id ?? "").toLowerCase();
      const matchesSearch =
        memberName.includes(q) || loanId.includes(q) || memberId.includes(q);

      const loanType = String(loan.loan_type ?? "").toLowerCase();
      const matchesType =
        typeFilter === "all" || loanType === typeFilter.toLowerCase();

      const disbursalYear = loan.disbursal_date
        ? String(new Date(loan.disbursal_date).getFullYear())
        : "";
      const matchesYear = yearFilter === "all" || disbursalYear === yearFilter;

      return matchesSearch && matchesType && matchesYear;
    });

    // Sort the filtered results
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle numeric comparisons
        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
        }

        // Handle date comparisons
        if (sortConfig.key === "due_date" || sortConfig.key === "disbursal_date") {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
          return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
        }

        // Handle string comparisons
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
        return sortConfig.direction === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      });
    }

    return filtered;
  }, [loans, searchTerm, typeFilter, yearFilter, sortConfig]);

  // Derive available years + loan types from the loaded loans so the filter
  // dropdowns only offer values that will actually match something.
  // The three member loan types are always offered, even when no loan of that
  // type is currently collectible -- otherwise a filter silently disappears
  // (Bonus loans repay in a single shot, so they are often absent from the
  // active set). Any other type present in the data is appended after them.
  const availableTypes = useMemo(() => {
    const baseTypes = ["consolidated", "bonus", "emergency"];
    const seen = new Set(baseTypes);
    const extras = [];
    for (const l of loans) {
      const t = String(l.loan_type ?? "").trim().toLowerCase();
      if (t && !seen.has(t)) {
        seen.add(t);
        extras.push(t);
      }
    }
    return [...baseTypes, ...extras.sort()];
  }, [loans]);

  const availableYears = useMemo(() => {
    const set = new Set();
    for (const l of loans) {
      if (l.disbursal_date) {
        set.add(String(new Date(l.disbursal_date).getFullYear()));
      }
    }
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [loans]);

  const handleSort = (key) => {
    setSortConfig((prevConfig) => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === "asc" ? "desc" : "asc",
    }));
  };

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedLoans.length / PAGE_SIZE));
  const paginatedLoans = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredAndSortedLoans.slice(start, start + PAGE_SIZE);
  }, [filteredAndSortedLoans, page]);

  useEffect(() => setPage(1), [searchTerm, typeFilter, yearFilter, sortConfig]);


  useEffect(() => {
    fetchLoans();
  }, []);

  async function fetchLoans() {
    setLoadingLoans(true);
    setLoansError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/cashier/loan-payments/loans`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.detail || result?.message || "Failed to fetch loans for payments.");
      }

      const backendLoans = result?.data?.loans || [];
      const mappedLoans = backendLoans.map((loan) => {
        const normalizedLoan = {
          ...loan,
          loan_type: normalizeLoanType(loan.loan_type),
          interest_rate: Number(loan.interest_rate || 0),
          is_migs_member: Boolean(loan.is_migs_member),
          loan_amount: Number(loan.loan_amount || 0),
          term_months: Number(loan.term_months || 0),
          remaining_balance: Number(loan.remaining_balance || 0),
          total_payable: Number(loan.total_payable || 0),
          total_interest: Number(loan.total_interest || 0),
          due_date: loan.due_date || null,
          disbursal_date: loan.disbursal_date || null,
          last_payment_date: loan.last_payment_date || null,
          expected_installment: Number(loan.expected_installment || 0),
          penalty_rate_percent: Number(loan.penalty_rate_percent || 0),
          accrued_penalty: loan.accrued_penalty === undefined || loan.accrued_penalty === null
            ? null
            : Number(loan.accrued_penalty),
          zero_payment_streak: Number(loan.zero_payment_streak || 0),
          is_legacy: Boolean(loan.is_legacy),
          is_delayed: Boolean(loan.is_delayed),
          is_overdue_for_penalty: Boolean(loan.is_overdue_for_penalty),
          missed_count: Number(loan.missed_count || 0),
        };

        return {
          ...normalizedLoan,
          amortization: Number(loan.amortization || 0) > 0
            ? Number(loan.amortization)
            : calculateAmortization(normalizedLoan),
        };
      });

      const rawPaymentRecords = result?.data?.payment_records || [];

      // Waterfall split of cumulative payments into interest-first, then principal.
      // Live calc against loan_payments — no schema change, always in sync with what
      // the Cashier has actually recorded. Assumes payments cover interest first
      // (standard cooperative practice), which matches how amortization is built.
      const paidByLoan = rawPaymentRecords.reduce((acc, p) => {
        const key = String(p.loan_id || "");
        if (!key) return acc;
        acc[key] = (acc[key] || 0) + Number(p.amount_paid || 0);
        return acc;
      }, {});

      const enrichedLoans = mappedLoans.map((loan) => {
        const totalPaid = paidByLoan[String(loan.loan_id || "")] || 0;
        // Prefer the backend-provided total_interest, but fall back to
        // (amortization × term − principal) when the field is 0/missing.
        // Old loans and mock data both hit this fallback.
        let totalInterest = Number(loan.total_interest || 0);
        if (totalInterest <= 0) {
          const derived =
            Number(loan.amortization || 0) * Number(loan.term_months || 0) -
            Number(loan.loan_amount || 0);
          if (derived > 0) totalInterest = derived;
        }
        const interestPaid = Math.min(totalPaid, totalInterest);
        const outstandingInterest = Math.max(totalInterest - interestPaid, 0);
        const outstandingPrincipal = Math.max(
          Number(loan.remaining_balance || 0) - outstandingInterest,
          0,
        );
        return {
          ...loan,
          total_interest: totalInterest,
          interest_paid: interestPaid,
          outstanding_interest: outstandingInterest,
          outstanding_principal: outstandingPrincipal,
        };
      });

      setLoans(enrichedLoans);
      setPaymentRecords(rawPaymentRecords);
    } catch (error) {
      console.error("Failed to fetch cashier loan data:", error);
      setLoans([]);
      setPaymentRecords([]);
      const message = error?.message || "Unable to load loans. Please try again.";
      setLoansError(message);
      addNotification(`Failed to load loans: ${message}`, "error");
    } finally {
      setLoadingLoans(false);
    }
  }

  async function processPayment(paymentPayload) {
    const response = await fetch(`${API_BASE_URL}/api/cashier/loan-payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(await authHeaders()),
      },
      body: JSON.stringify(paymentPayload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(apiErrorMessage(result, "Failed to submit payment."));
    }

    return result?.data || paymentPayload;
  }

  // The server decides what penalty is chargeable -- it is the only side that
  // can see payment history, the consecutive zero-payment streak, and whether
  // the loan is legacy (legacy loans are exempt). The local formula is kept
  // only as a fallback for responses predating `accrued_penalty`.
  const selectedLoanPenalty = useMemo(() => {
    if (!selectedLoan) return 0;
    if (selectedLoan.accrued_penalty !== undefined && selectedLoan.accrued_penalty !== null) {
      return Number(selectedLoan.accrued_penalty) || 0;
    }
    if (selectedLoan.is_legacy) return 0;
    const installmentAmount = Number(selectedLoan.amortization) || 0;
    return calculatePenalty(
      selectedLoan.due_date,
      installmentAmount,
      selectedLoan.penalty_rate_percent,
      selectedLoan.loan_type
    );
  }, [selectedLoan]);

  // What the schedule says is due for the CURRENT period: this installment,
  // never the whole outstanding balance, capped at the remaining balance.
  // Uses the loan's amortization, NOT expected_installment: the latter comes
  // from loan_schedules.expected_amount, which on legacy rows holds the
  // running total (principal + total interest) instead of the per-period
  // amount and would collect several times the real due.
  const scheduledPaymentAmount = useMemo(
    () => getDefaultPaymentAmount(selectedLoan),
    [selectedLoan]
  );

  const outstandingBalance = Number(selectedLoan?.remaining_balance) || 0;

  // Carry-forward from earlier periods, computed by the backend and attached
  // to the current schedule row: arrears ADD to what is due, credit REDUCES it.
  const priorOutstanding = Number(selectedLoan?.carried_arrears) || 0;
  const priorCredit = Number(selectedLoan?.applied_credit) || 0;
  // scheduledPaymentAmount already nets arrears and credit (see
  // getDefaultPaymentAmount), so this is that same figure -- adding the
  // carry-forward again here would double-count it.
  const totalAmountDueThisPeriod = scheduledPaymentAmount;

  // The amount the cashier actually entered. Everything downstream (penalty
  // total, balance preview, confirmation text, receipt, API payload) reads
  // this, so what is typed is what gets recorded.
  const currentPaymentAmount = useMemo(() => {
    const parsed = Number(paymentAmountInput);
    return Number.isFinite(parsed) && parsed > 0 ? roundCurrency(parsed) : 0;
  }, [paymentAmountInput]);

  const paymentAmountError = useMemo(() => {
    if (!selectedLoan) return "";
    if (paymentAmountInput === "" || paymentAmountInput === ".") return "Enter the amount received.";
    if (!(Number(paymentAmountInput) > 0)) return "Amount must be greater than zero.";
    if ((paymentAmountInput.split(".")[1] || "").length > 2) return "Use at most 2 decimal places.";
    if (currentPaymentAmount > roundCurrency(outstandingBalance)) {
      return `Amount cannot exceed the outstanding balance of ${formatCurrency(outstandingBalance)}.`;
    }
    return "";
  }, [selectedLoan, paymentAmountInput, currentPaymentAmount, outstandingBalance]);

  // What the cashier collects = this period's amortization + any penalty that
  // has actually accrued under the 3-month grace rule.
  const currentTotalDue = useMemo(
    () => roundCurrency(currentPaymentAmount + selectedLoanPenalty),
    [currentPaymentAmount, selectedLoanPenalty]
  );

  const updatedBalancePreview = useMemo(() => {
    if (!selectedLoan) return 0;
    const remaining = Number(selectedLoan.remaining_balance) || 0;
    return Math.max(roundCurrency(remaining - currentPaymentAmount), 0);
  }, [selectedLoan, currentPaymentAmount]);

  const openPaymentModal = (loan) => {
    setSelectedLoan(loan);
    setPaymentAmountInput(String(getDefaultPaymentAmount(loan)));
    setFormError("");
    setIsPaymentModalOpen(true);
  };

  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setSelectedLoan(null);
    setPaymentAmountInput("");
    setFormError("");
  };

  // Row click / Pay button entry point: show the loan ledger first so the
  // Cashier reviews context before entering a payment amount.
  const openLedgerModal = (loan) => {
    setSelectedLoan(loan);
    setIsLedgerModalOpen(true);
  };

  const closeLedgerModal = () => {
    setIsLedgerModalOpen(false);
    setSelectedLoan(null);
  };

  // Ledger → Payment transition. Keeps the same selectedLoan and pre-fills
  // the amortization amount so we preserve the previous one-click UX for
  // Cashiers who don't need to change the amount.
  const proceedFromLedgerToPayment = () => {
    if (!selectedLoan) return;
    setIsLedgerModalOpen(false);
    setPaymentAmountInput(String(getDefaultPaymentAmount(selectedLoan)));
    setFormError("");
    setIsPaymentModalOpen(true);
  };

  const handleSubmitPayment = async (event) => {
    event.preventDefault();
    if (!selectedLoan || isSubmittingPayment) return;

    // The amount the cashier entered, plus any accrued penalty.
    if (paymentAmountError) {
      setFormError(paymentAmountError);
      return;
    }
    const principalPaid = currentPaymentAmount;
    const penaltyCollected = roundCurrency(selectedLoanPenalty);
    const totalCollected = currentTotalDue;

    if (!Number.isFinite(totalCollected) || totalCollected <= 0) {
      setFormError("Enter the amount received before logging the payment.");
      return;
    }

    const differsFromSchedule = Math.abs(principalPaid - scheduledPaymentAmount) >= 0.005;
    const scheduleNote = differsFromSchedule
      ? ` This differs from the scheduled amortization of ${formatCurrency(scheduledPaymentAmount)}.`
      : "";

    const ok = await confirm({
      title: "Log Payment",
      message: penaltyCollected > 0
        ? `Log ${formatCurrency(totalCollected)} for this loan (${formatCurrency(principalPaid)} payment + ${formatCurrency(penaltyCollected)} penalty)?${scheduleNote} This will be sent to the Bookkeeper for review; the loan balance stays unchanged until they confirm it.`
        : `Log a payment of ${formatCurrency(totalCollected)} for this loan?${scheduleNote} This will be sent to the Bookkeeper for review; the loan balance stays unchanged until they confirm it.`,
      confirmLabel: "Log Payment",
      tone: "default",
    });
    if (!ok) return;
    const nextSequence = paymentRecords.length + 1;
    // One reference per submission attempt, not per list position: a
    // length-based sequence collides whenever two cashiers submit at once or
    // the list is stale, which would let the server's duplicate guard reject a
    // legitimate second payment. The random suffix makes each attempt distinct
    // while a retry of THIS attempt reuses the same value and is deduped.
    if (!submissionReferenceRef.current) {
      const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
      submissionReferenceRef.current = {
        payment: `TTMPCLP-${unique}`,
        transaction: `TTMPCLP_TXN_${unique}`,
      };
    }
    const paymentPayload = {
      loan_id: selectedLoan.loan_id,
      schedule_id: selectedLoan.schedule_id || formatSequenceId("TTMPCLP_SI_", nextSequence),
      payment_amount: roundCurrency(principalPaid),
      penalties: roundCurrency(penaltyCollected),
      deficiency: getMissedDueDates(selectedLoan.due_date),
      payment_reference: submissionReferenceRef.current.payment,
      transaction_reference: submissionReferenceRef.current.transaction,
    };

    setIsSubmittingPayment(true);
    try {
      const insertedRecord = await processPayment(paymentPayload);
      // This attempt landed; the next payment must not reuse its reference.
      submissionReferenceRef.current = null;
      setPaymentRecords((previous) => [insertedRecord, ...previous]);
      // Confirmation carries only data we actually have: the reference the
      // backend echoed back, the member, and the resulting balance.
      setPaymentReceipt({
        amount: totalCollected,
        principal: principalPaid,
        penalty: penaltyCollected,
        memberName: selectedLoan.member_name,
        loanType: selectedLoan.loan_type,
        remainingBalance: updatedBalancePreview,
        reference: insertedRecord?.payment_id || paymentPayload.payment_reference,
        paidAt: insertedRecord?.payment_date || new Date().toISOString(),
      });
      addNotification(
        `Payment of ${formatCurrency(totalCollected)} recorded — pending Bookkeeper confirmation.`,
        "success"
      );
      closePaymentModal();
      await fetchLoans();
    } catch (error) {
      console.error("Loan payment submission failed:", error);
      const message = friendlyPaymentError(error);
      setFormError(message);
      addNotification(message, "error");
    } finally {
      setIsSubmittingPayment(false);
    }
  };



  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Cashier" items={cashierNav} />

      <div ref={scrollContainerRef} className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Cashier" notifications={<LoanNotificationBell role="cashier" />} />

        {/* 3. CASHIER LOAN PAYMENTS */}
        <main className="p-8 ">
          <div className="mb-8">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <Breadcrumb portal="Cashier" page="Loan Payments" />
                <h1 className="text-3xl font-bold text-gray-900">Loan Payments</h1>
                <p className="text-sm text-gray-500 mt-1">Manage and process member loan payments</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-600 font-medium">
                {loans.length} loans • {paymentRecords.length} payments
              </div>
            </div>

            {/* Alerts */}
            {loadingLoans && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
                <Clock size={16} />
                Loading loans and payment records...
              </div>
            )}

            {!loadingLoans && loansError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium">Unable to load loans</div>
                    <div className="text-red-600">{loansError}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchLoans}
                  className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition"
                >
                  Retry
                </button>
              </div>
            )}

          </div>

          {/* Main Loans Table (search & filter toolbar shares this card) */}
          <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <TableToolbar subtitle={`Showing ${paginatedLoans.length} of ${filteredAndSortedLoans.length} loans`}>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by member name, loan ID, or member ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-8 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                <Filter size={13} />
                Filters
              </button>
            </TableToolbar>

            {/* Filters Dropdown */}
            {showFilters && (
              <div className="border-b border-gray-100 bg-gray-50 p-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Loan Category
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setTypeFilter("all")}
                        className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                          typeFilter === "all"
                            ? "bg-green-600 text-white"
                            : "bg-white border border-gray-300 text-gray-700 hover:border-green-500"
                        }`}
                      >
                        All Types
                      </button>
                      {availableTypes.map((type) => (
                        <button
                          key={type}
                          onClick={() => setTypeFilter(type)}
                          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                            typeFilter === type
                              ? "bg-green-600 text-white"
                              : "bg-white border border-gray-300 text-gray-700 hover:border-green-500"
                          }`}
                        >
                          {toTitleCase(type)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Disbursal Year
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setYearFilter("all")}
                        className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                          yearFilter === "all"
                            ? "bg-green-600 text-white"
                            : "bg-white border border-gray-300 text-gray-700 hover:border-green-500"
                        }`}
                      >
                        All Years
                      </button>
                      {availableYears.map((year) => (
                        <button
                          key={year}
                          onClick={() => setYearFilter(year)}
                          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                            yearFilter === year
                              ? "bg-green-600 text-white"
                              : "bg-white border border-gray-300 text-gray-700 hover:border-green-500"
                          }`}
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(typeFilter !== "all" || yearFilter !== "all") && (
                    <div className="pt-2 border-t border-gray-200">
                      <button
                        onClick={() => {
                          setTypeFilter("all");
                          setYearFilter("all");
                        }}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Clear all filters
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold whitespace-nowrap">
                      <button
                        onClick={() => handleSort("member_name")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Member Name
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="p-5 font-bold whitespace-nowrap">
                      <button
                        onClick={() => handleSort("loan_amount")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Loan Amount
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>

                    <th className="p-5 font-bold whitespace-nowrap">
                      <button
                        onClick={() => handleSort("term_months")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Term
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="p-5 font-bold whitespace-nowrap">
                      Amortization
                    </th>

                    <th className="p-5 font-bold whitespace-nowrap">
                      Delay Status
                    </th>


                    <th className="p-5 font-bold whitespace-nowrap">
                      <button
                        onClick={() => handleSort("remaining_balance")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Total Balance
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="p-5 font-bold whitespace-nowrap">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLoans ? (
                    <TableStateRow colSpan={7} variant="loading" label="Loading..." />
                  ) : paginatedLoans.length === 0 ? (
                    <TableStateRow
                      colSpan={7}
                      variant="empty"
                      icon={AlertCircle}
                      label="No loans found matching your criteria"
                    />
                  ) : (
                    paginatedLoans.map((loan) => (
                      <tr
                        key={loan.loan_id}
                        onClick={() => openLedgerModal(loan)}
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-3 text-xs font-medium text-gray-900 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{loan.member_name}</span>
                            {(loan.prior_versions || 0) > 0 ? (
                              <span
                                title={`Renewal chain: this loan supersedes ${loan.prior_versions} prior version${loan.prior_versions > 1 ? "s" : ""}. Payment goes to this loan only — old balance was rolled into it.`}
                                className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700"
                              >
                                Renewed
                              </span>
                            ) : (
                              <span
                                title="First loan of this type for this member — no prior renewals."
                                className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700"
                              >
                                Original
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-700 font-semibold whitespace-nowrap">
                          {formatCurrency(loan.loan_amount)}
                        </td>
                      
                        <td className="px-3 py-3 text-xs text-gray-700 whitespace-nowrap">
                          {loan.term_months} mo
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-700 whitespace-nowrap">
                          {formatCurrency(loan.amortization)}
                        </td>
                       
                      
                        <td className="px-3 py-3 whitespace-nowrap">
                          {(() => {
                            const key = resolveDelayStatus(loan);
                            const meta = DELAY_STATUS_META[key];
                            const Icon = key === "on_time" ? CheckCircle2 : AlertCircle;
                            return (
                              <span className={`badge-animated inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${meta.className}`}>
                                <Icon size={12} />
                                {formatDelayLabel(key, loan.missed_count)}
                              </span>
                            );
                          })()}
                        </td>
                       
                        <td className="px-3 py-3 text-xs font-semibold text-gray-900 whitespace-nowrap">
                          {formatCurrency(loan.remaining_balance)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openLedgerModal(loan); }}
                            disabled={loan.loan_status === "Fully Paid"}
                            className="btn-enhanced rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                  
                  {paginatedLoans.length > 0 && paginatedLoans.length < PAGE_SIZE &&
                    Array.from({ length: PAGE_SIZE - paginatedLoans.length }).map((_, idx) => (
                      <tr key={`spacer-${idx}`} className="border-b border-gray-100">
                        <td colSpan={7} className="px-3 py-3">&nbsp;</td>
                      </tr>
                    ))}
                </tbody>
              </table>

              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          </div>

          {isLedgerModalOpen && selectedLoan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
              <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl">
                {/* Ledger Modal Header */}
                <div className="flex items-start justify-between border-b border-gray-200 bg-linear-to-r from-green-50 to-emerald-50 px-6 py-5 rounded-t-2xl">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Loan Ledger</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedLoan.loan_id} · {selectedLoan.member_name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeLedgerModal}
                    className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
                  >
                    <X size={24} />
                  </button>
                </div>

                {/* Ledger Content — scrollable */}
                <div className="flex-1 overflow-y-auto p-6">
                  {/* Loan Info */}
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Loan Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                      <div><span className="text-gray-500">Loan Type: </span><span className="font-medium text-gray-900">{selectedLoan.loan_type}</span></div>
                      <div><span className="text-gray-500">Loan Amount: </span><span className="font-medium text-gray-900">{formatCurrency(selectedLoan.loan_amount)}</span></div>
                      <div><span className="text-gray-500">Interest Rate: </span><span className="font-medium text-gray-900">{getDisplayedInterestRate(selectedLoan)}</span></div>
                      <div><span className="text-gray-500">Term: </span><span className="font-medium text-gray-900">{selectedLoan.term_months} months</span></div>
                      <div><span className="text-gray-500">Amortization: </span><span className="font-medium text-gray-900">{formatCurrency(selectedLoan.amortization)}</span></div>
                      <div><span className="text-gray-500">Disbursed: </span><span className="font-medium text-gray-900">{selectedLoan.disbursal_date ? new Date(selectedLoan.disbursal_date).toLocaleDateString() : "—"}</span></div>
                      <div><span className="text-gray-500">Next Unpaid Due: </span><span className="font-medium text-gray-900">{selectedLoan.due_date ? new Date(selectedLoan.due_date).toLocaleDateString() : "—"}</span></div>
                      <div><span className="text-gray-500">Remaining Balance: </span><span className="font-semibold text-gray-900">{formatCurrency(selectedLoan.remaining_balance)}</span></div>
                      <div>
                        <span className="text-gray-500">Delay Status: </span>
                        {(() => {
                          const key = resolveDelayStatus(selectedLoan);
                          const meta = DELAY_STATUS_META[key];
                          const Icon = key === "on_time" ? CheckCircle2 : AlertCircle;
                          return (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.className}`}>
                              <Icon size={12} />
                              {formatDelayLabel(key, selectedLoan.missed_count)}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Payment History */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment History</h3>
                    {(() => {
                      const loanPayments = paymentRecords
                        .filter((p) => String(p.loan_id) === String(selectedLoan.loan_id))
                        .sort((a, b) => new Date(b.payment_date || 0) - new Date(a.payment_date || 0));

                      if (loanPayments.length === 0) {
                        return (
                          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                            No payments recorded for this loan yet.
                          </div>
                        );
                      }

                      return (
                        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                                <th className="p-5 font-bold">Date</th>
                                <th className="p-5 font-bold">Reference #</th>
                                <th className="p-5 font-bold text-right">Amount</th>
                                <th className="p-5 font-bold text-right">Penalty</th>
                                <th className="p-5 font-bold">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {loanPayments.map((p) => (
                                <tr key={p.payment_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                                  <td className="p-5 text-gray-700 tabular-nums whitespace-nowrap">
                                    {p.payment_date ? new Date(p.payment_date).toLocaleDateString() : "—"}
                                  </td>
                                  <td className="p-5 text-gray-700 whitespace-nowrap">{p.payment_id || "—"}</td>
                                  <td className="p-5 text-gray-900 font-medium tabular-nums text-right whitespace-nowrap">
                                    {formatCurrency(p.amount_paid)}
                                  </td>
                                  <td className="p-5 text-gray-700 tabular-nums text-right whitespace-nowrap">
                                    {formatCurrency(p.penalties || 0)}
                                  </td>
                                  <td className="p-5 whitespace-nowrap">
                                    {(() => {
                                      const st = String(p.confirmation_status || "").toLowerCase();
                                      const cls =
                                        st.includes("validated") || st.includes("confirmed") || st.includes("approved")
                                          ? "bg-green-100 text-green-700"
                                          : st.includes("reject")
                                          ? "bg-red-100 text-red-700"
                                          : "bg-amber-100 text-amber-700";
                                      return (
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
                                          {p.confirmation_status || "pending"}
                                        </span>
                                      );
                                    })()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Ledger Modal Footer */}
                <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 rounded-b-2xl bg-gray-50">
                  <button
                    type="button"
                    onClick={closeLedgerModal}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={proceedFromLedgerToPayment}
                    disabled={selectedLoan.loan_status === "Fully Paid"}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                  >
                    Pay
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Payment confirmation. Shown after a successful post so the cashier has
              an unambiguous record that the payment was captured, with the
              reference the backend returned. */}
          {paymentReceipt && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
                <div className="px-6 pt-6 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle2 size={26} className="text-green-600" />
                  </div>
                  <h2 className="mt-3 text-lg font-bold text-gray-900">Payment collected successfully</h2>
                  <p className="mt-1 text-3xl font-extrabold text-green-700 tabular-nums">
                    {formatCurrency(paymentReceipt.amount)}
                  </p>
                  {paymentReceipt.penalty > 0 ? (
                    <p className="mt-1 text-xs text-gray-500">
                      {formatCurrency(paymentReceipt.principal)} payment + {formatCurrency(paymentReceipt.penalty)} penalty
                    </p>
                  ) : null}
                </div>

                <dl className="mt-5 space-y-2 border-t border-gray-100 px-6 pt-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">Member</dt>
                    <dd className="truncate font-medium text-gray-900">{paymentReceipt.memberName}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">Loan type</dt>
                    <dd className="font-medium text-gray-900">{toTitleCase(paymentReceipt.loanType)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">Payment date</dt>
                    <dd className="font-medium text-gray-900 tabular-nums">{formatLongDate(paymentReceipt.paidAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">Remaining balance</dt>
                    <dd className="font-medium text-gray-900 tabular-nums">{formatCurrency(paymentReceipt.remainingBalance)}</dd>
                  </div>
                  {paymentReceipt.reference ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Reference</dt>
                      <dd className="break-all font-mono text-xs font-medium text-gray-900">{paymentReceipt.reference}</dd>
                    </div>
                  ) : null}
                </dl>

                <p className="mx-6 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Pending Bookkeeper confirmation — the loan balance updates once they validate it.
                </p>

                <div className="px-6 py-5">
                  <button
                    type="button"
                    onClick={() => setPaymentReceipt(null)}
                    className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}

          {isPaymentModalOpen && selectedLoan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
              <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
                {/* Modal Header */}
                <div className="flex shrink-0 items-start justify-between gap-3 rounded-t-2xl border-b border-gray-200 bg-linear-to-r from-green-50 to-emerald-50 px-6 py-5">
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Process Loan Payment</h2>
                    <p className="mt-0.5 truncate text-sm text-gray-600">{selectedLoan.member_name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={closePaymentModal}
                    className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
                  >
                    <X size={24} />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  {/* Status banner — penalty warning takes precedence over no-payment.
                      Headline first, supporting dates as muted metadata underneath so the
                      banner reads at a glance without competing with Total Due. */}
                  {selectedLoan.is_overdue_for_penalty || selectedLoan.is_delayed ? (
                    (() => {
                      const isPenalty = Boolean(selectedLoan.is_overdue_for_penalty);
                      const tone = isPenalty
                        ? { wrap: "border-red-200 bg-red-50", icon: "text-red-600", title: "text-red-900", meta: "text-red-700" }
                        : { wrap: "border-amber-200 bg-amber-50", icon: "text-amber-600", title: "text-amber-900", meta: "text-amber-700" };
                      const meta = [
                        selectedLoan.due_date ? `Installment due ${formatLongDate(selectedLoan.due_date)}` : null,
                        selectedLoan.last_payment_date
                          ? `Last payment ${formatLongDate(selectedLoan.last_payment_date)}`
                          : "No payment recorded yet",
                        isPenalty ? "Grace period lapsed" : "Within 3-month grace period",
                      ].filter(Boolean);
                      return (
                        <div className={`mb-5 flex items-start gap-3 rounded-lg border px-4 py-3 ${tone.wrap}`}>
                          <AlertCircle size={18} className={`mt-0.5 shrink-0 ${tone.icon}`} />
                          <div className="min-w-0">
                            <p className={`text-sm font-semibold ${tone.title}`}>
                              {isPenalty ? "Overdue — penalty applies" : "Payment attention required"}
                            </p>
                            <p className={`mt-1 text-xs leading-relaxed ${tone.meta}`}>
                              {meta.join(" · ")}
                            </p>
                          </div>
                        </div>
                      );
                    })()
                  ) : null}

                  {/* Loan — flat definition list, no card. The loan type leads; the
                      member UUID drops to muted metadata since it is rarely read but
                      still required by the workflow. */}
                  <section className="mb-6">
                    <h3 className="mb-3 border-b border-gray-200 pb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Loan
                    </h3>

                    <p className="text-lg font-bold text-gray-900">{toTitleCase(selectedLoan.loan_type)}</p>
                    {/* Loan reference is what staff quote, so it stays legible; the
                        member UUID is a lookup key only and drops to the faintest tier. */}
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-mono text-xs font-medium text-gray-600">{selectedLoan.loan_id}</span>
                      {selectedLoan.member_id ? (
                        <span className="break-all font-mono text-[10px] text-gray-400">{selectedLoan.member_id}</span>
                      ) : null}
                    </p>

                    {/* Column-major (grid-flow-col + 3 rows) so each column reads top
                        to bottom as a group -- money on the left, loan terms on the
                        right -- instead of the eye zig-zagging across columns.
                        Collapses to a single ordered column on small screens. */}
                    <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-2.5 text-sm sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-3">
                      <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 pb-2">
                        <dt className="text-gray-500">Principal</dt>
                        <dd className="font-medium text-gray-900 tabular-nums">{formatCurrency(selectedLoan.loan_amount)}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 pb-2">
                        <dt className="text-gray-500">Outstanding Balance</dt>
                        <dd className="font-medium text-gray-900 tabular-nums">{formatCurrency(selectedLoan.remaining_balance)}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 pb-2">
                        <dt className="text-gray-500">Amortization</dt>
                        <dd className="font-semibold text-gray-900 tabular-nums">{formatCurrency(selectedLoan.amortization)}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 pb-2">
                        <dt className="text-gray-500">Interest Rate</dt>
                        <dd className="font-medium text-gray-900 tabular-nums">{getDisplayedInterestRate(selectedLoan)}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 pb-2">
                        <dt className="text-gray-500">Term</dt>
                        <dd className="font-medium text-gray-900 tabular-nums">{selectedLoan.term_months} months</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 pb-2">
                        <dt className="text-gray-500">Due Date</dt>
                        <dd className="font-medium text-gray-900 tabular-nums">
                          {selectedLoan.due_date ? formatLongDate(selectedLoan.due_date) : "\u2014"}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  {/* Payment summary. The amount starts at the scheduled amortization
                      but is editable: the cashier records what the member actually
                      hands over, and every figure below (and the record sent to the
                      server) follows it -- see currentPaymentAmount.
                      Total to Collect is the focal point; penalty stays secondary at zero. */}
                  <section className="mb-6">
                    <h3 className="mb-3 border-b border-gray-200 pb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Payment Summary
                    </h3>

                    <div className="space-y-3 text-sm">
                      <div>
                        <label htmlFor="payment-amount" className="mb-1.5 block text-gray-600">
                          Payment amount
                        </label>
                        <div
                          className={`flex h-11 items-stretch overflow-hidden rounded-lg border bg-white focus-within:ring-2 ${
                            paymentAmountError
                              ? "border-red-300 focus-within:ring-red-200"
                              : "border-gray-300 focus-within:ring-green-200"
                          }`}
                        >
                          <span className="flex items-center border-r border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-500">
                            &#8369;
                          </span>
                          <input
                            id="payment-amount"
                            form="cashier-payment-form"
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={formatWithCommas(paymentAmountInput)}
                            onChange={(event) => {
                              setPaymentAmountInput(stripCommas(event.target.value));
                              setFormError("");
                            }}
                            onFocus={(event) => event.target.select()}
                            disabled={isSubmittingPayment}
                            aria-invalid={Boolean(paymentAmountError)}
                            aria-describedby="payment-amount-hint"
                            placeholder="0.00"
                            className="min-w-0 flex-1 bg-transparent px-3 text-base font-semibold tabular-nums text-gray-900 focus:outline-none disabled:opacity-60"
                          />
                        </div>
                        <div id="payment-amount-hint" className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                          {paymentAmountError ? (
                            <span role="alert" className="font-medium text-red-600">{paymentAmountError}</span>
                          ) : currentPaymentAmount < scheduledPaymentAmount ? (
                            <span className="font-medium text-amber-700">
                              Partial payment. {priorOutstanding > 0 ? "Amount due this period" : "Scheduled amortization"} is {formatCurrency(scheduledPaymentAmount)}.
                            </span>
                          ) : currentPaymentAmount > scheduledPaymentAmount ? (
                            <span className="font-medium text-blue-700">
                              Above the {priorOutstanding > 0 ? "amount due this period" : "scheduled amortization"} of {formatCurrency(scheduledPaymentAmount)}.
                            </span>
                          ) : (
                            <span className="text-gray-500">
                              Matches the {priorOutstanding > 0 ? "amount due this period" : "scheduled amortization"}.
                            </span>
                          )}
                          {currentPaymentAmount !== scheduledPaymentAmount && (
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentAmountInput(String(scheduledPaymentAmount));
                                setFormError("");
                              }}
                              disabled={isSubmittingPayment}
                              className="font-semibold text-green-700 underline-offset-2 hover:underline disabled:opacity-50"
                            >
                              {priorOutstanding > 0 ? "Use full amount due" : "Use scheduled amount"}
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Carry-forward from earlier periods. Shown only when
                          non-zero so the common case stays uncluttered. */}
                      {priorOutstanding > 0 && (
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-medium text-red-700">
                            Previous outstanding
                            <span className="ml-1.5 text-xs text-red-500">(carried forward)</span>
                          </span>
                          <span className="font-medium text-red-700 tabular-nums">
                            +{formatCurrency(priorOutstanding)}
                          </span>
                        </div>
                      )}
                      {priorCredit > 0 && (
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-medium text-green-700">
                            Previous credit
                            <span className="ml-1.5 text-xs text-green-600">(advance payment)</span>
                          </span>
                          <span className="font-medium text-green-700 tabular-nums">
                            -{formatCurrency(priorCredit)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={selectedLoanPenalty > 0 ? "font-medium text-amber-700" : "text-gray-500"}>
                          Penalty
                          {selectedLoanPenalty > 0 ? null : (
                            <span className="ml-1.5 text-xs text-gray-400">(within grace period)</span>
                          )}
                        </span>
                        <span className={`tabular-nums ${selectedLoanPenalty > 0 ? "font-medium text-amber-700" : "text-gray-400"}`}>
                          {formatCurrency(selectedLoanPenalty)}
                        </span>
                      </div>
                      {(priorOutstanding > 0 || priorCredit > 0) && (
                        <div className="flex items-baseline justify-between gap-3 border-t border-gray-200 pt-2">
                          <span className="font-semibold text-gray-900">Total amount due this period</span>
                          <span className="font-semibold text-gray-900 tabular-nums">
                            {formatCurrency(totalAmountDueThisPeriod)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-baseline justify-between gap-3 border-t-2 border-gray-900 pt-4">
                      <span className="text-sm font-bold uppercase tracking-wide text-gray-900">Total to Collect</span>
                      <span className="text-3xl font-extrabold text-green-700 tabular-nums">{formatCurrency(currentTotalDue)}</span>
                    </div>

                    {/* Flat row, not a card -- it is the consequence of the total above,
                        so it stays visually attached rather than becoming another box. */}
                    <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-gray-100 pt-3">
                      <div>
                        <p className="text-sm text-gray-600">Remaining loan balance</p>
                        <p className="text-xs text-gray-400">After this payment</p>
                      </div>
                      <p className="text-base font-semibold text-gray-700 tabular-nums">{formatCurrency(updatedBalancePreview)}</p>
                    </div>
                  </section>

                  {/* Payment Form */}
                  <form id="cashier-payment-form" onSubmit={handleSubmitPayment} className="space-y-4">
                    {formError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                        <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700">{formError}</p>
                      </div>
                    )}

                    {/* Form Actions. Stacks on small screens; the collect button keeps
                        the amount visible and is disabled while submitting so a second
                        click cannot double-post the payment. */}
                    <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={closePaymentModal}
                        disabled={isSubmittingPayment}
                        className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingPayment || Boolean(paymentAmountError)}
                        aria-busy={isSubmittingPayment}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 active:bg-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none"
                      >
                        {isSubmittingPayment ? (
                          <>
                            <Clock size={16} className="animate-spin" />
                            Collecting payment...
                          </>
                        ) : (
                          `Collect ${formatCurrency(currentTotalDue)}`
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};


export default Cashier_Payments;



