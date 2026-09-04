import React, { useEffect, useMemo, useRef, useState } from "react";
import StaffSidebar from "../../components/StaffSidebar";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { useConfirm } from "../../contex/ConfirmContext";
import StaffTopbar from "../../components/StaffTopbar";
import Breadcrumb from "../../components/Breadcrumb";
import Pagination from "../../components/Pagination";
// Adjust path to AuthContext if needed
import LoanNotificationBell from "../../components/LoanNotificationBell";
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
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [formError, setFormError] = useState("");
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
  const availableTypes = useMemo(() => {
    const set = new Set();
    for (const l of loans) {
      const t = String(l.loan_type ?? "").trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort();
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
      },
      body: JSON.stringify(paymentPayload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.detail || result?.message || "Failed to submit payment.");
    }

    return result?.data || paymentPayload;
  }

  const selectedLoanPenalty = useMemo(() => {
    if (!selectedLoan) return 0;
    const installmentAmount =
      Number(selectedLoan.expected_installment) > 0
        ? Number(selectedLoan.expected_installment)
        : Number(selectedLoan.amortization) || 0;
    return calculatePenalty(
      selectedLoan.due_date,
      installmentAmount,
      selectedLoan.penalty_rate_percent,
      selectedLoan.loan_type
    );
  }, [selectedLoan]);

  const updatedBalancePreview = useMemo(() => {
    if (!selectedLoan) return 0;
    const numericPayment = Number(paymentAmount) || 0;
    const totalDue = selectedLoan.remaining_balance + selectedLoanPenalty;
    return Math.max(totalDue - numericPayment, 0);
  }, [selectedLoan, selectedLoanPenalty, paymentAmount]);

  const openPaymentModal = (loan) => {
    setSelectedLoan(loan);
    setPaymentAmount("");
    setFormError("");
    setIsPaymentModalOpen(true);
  };

  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setSelectedLoan(null);
    setPaymentAmount("");
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
    setPaymentAmount(String(selectedLoan.amortization || ""));
    setFormError("");
    setIsPaymentModalOpen(true);
  };

  const handleSubmitPayment = async (event) => {
    event.preventDefault();
    if (!selectedLoan || isSubmittingPayment) return;

    const parsedPaymentAmount = Number(paymentAmount);
    const totalDue = selectedLoan.remaining_balance + selectedLoanPenalty;

    if (!Number.isFinite(parsedPaymentAmount) || parsedPaymentAmount <= 0) {
      setFormError("Enter a valid payment amount greater than zero.");
      return;
    }

    if (parsedPaymentAmount > totalDue) {
      setFormError("Payment cannot exceed current balance plus penalty.");
      return;
    }

    const ok = await confirm({
      title: "Log Payment",
      message: `Log a payment of ${formatCurrency(parsedPaymentAmount)} for this loan? This will be sent to the Bookkeeper for review; the loan balance stays unchanged until they confirm it.`,
      confirmLabel: "Log Payment",
      tone: "default",
    });
    if (!ok) return;

    const penaltyCollected = Math.min(selectedLoanPenalty, parsedPaymentAmount);
    const principalPaid = Math.max(parsedPaymentAmount - penaltyCollected, 0);
    const nextSequence = paymentRecords.length + 1;
    const paymentPayload = {
      loan_id: selectedLoan.loan_id,
      schedule_id: selectedLoan.schedule_id || formatSequenceId("TTMPCLP_SI_", nextSequence),
      payment_amount: roundCurrency(principalPaid),
      penalties: roundCurrency(penaltyCollected),
      deficiency: getMissedDueDates(selectedLoan.due_date),
      payment_reference: formatSequenceId("TTMPCLP-", nextSequence),
      transaction_reference: formatSequenceId("TTMPCLP_TXN_", nextSequence),
    };

    setIsSubmittingPayment(true);
    try {
      const insertedRecord = await processPayment(paymentPayload);
      setPaymentRecords((previous) => [insertedRecord, ...previous]);
      addNotification("Payment logged and pending Bookkeeper confirmation. Loan balance is unchanged until confirmation.", "success");
      closePaymentModal();
      await fetchLoans();
    } catch (error) {
      setFormError(error.message || "Failed to submit payment.");
      addNotification(error.message || "Failed to submit payment.", "error");
    } finally {
      setIsSubmittingPayment(false);
    }
  };



  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Cashier" items={cashierNav} />

      <div ref={scrollContainerRef} className="flex-1 flex flex-col h-screen overflow-y-auto">
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
            <div className="p-4 border-b border-gray-100 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by member name, loan ID, or member ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 pl-10 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200 transition"
                  />
                </div>
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                <Filter size={16} />
                Filters
              </button>
            </div>

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
                          {type}
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
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="px-3 py-3 font-bold whitespace-nowrap">
                      <button
                        onClick={() => handleSort("member_name")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Member Name
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-3 py-3 font-bold whitespace-nowrap">
                      <button
                        onClick={() => handleSort("loan_amount")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Loan Amount
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                   
                    <th className="px-3 py-3 font-bold whitespace-nowrap">
                      <button
                        onClick={() => handleSort("term_months")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Term
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-3 py-3 font-bold whitespace-nowrap">
                      Amortization
                    </th>
                  
                    <th className="px-3 py-3 font-bold whitespace-nowrap">
                      Delay Status
                    </th>
                   
                   
                    <th className="px-3 py-3 font-bold whitespace-nowrap">
                      <button
                        onClick={() => handleSort("remaining_balance")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Total Balance
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-3 py-3 font-bold whitespace-nowrap">
                      <button
                        onClick={() => handleSort("loan_status")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Status
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-3 py-3 font-bold whitespace-nowrap">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLoans.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-3 py-6 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <AlertCircle size={32} className="text-gray-300" />
                          <p className="text-sm text-gray-500">
                            No loans found matching your criteria
                          </p>
                        </div>
                      </td>
                    </tr>
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
                          <span
                            className={`badge-animated inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              loan.loan_status === "Fully Paid"
                                ? "bg-green-100 text-green-700"
                                : loan.loan_status === "Partially Paid"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {loan.loan_status}
                          </span>
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
                        <td colSpan={13} className="px-3 py-3">&nbsp;</td>
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
                        <span className="text-gray-500">Status: </span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          selectedLoan.loan_status === "Fully Paid" ? "bg-green-100 text-green-700"
                          : selectedLoan.loan_status === "Partially Paid" ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                        }`}>{selectedLoan.loan_status}</span>
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
                            <thead className="bg-gray-50">
                              <tr className="text-left text-xs uppercase text-gray-500">
                                <th className="px-4 py-2 font-medium">Date</th>
                                <th className="px-4 py-2 font-medium">Reference #</th>
                                <th className="px-4 py-2 font-medium text-right">Amount</th>
                                <th className="px-4 py-2 font-medium text-right">Penalty</th>
                                <th className="px-4 py-2 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {loanPayments.map((p) => (
                                <tr key={p.payment_id} className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
                                  <td className="px-4 py-2 text-gray-700 tabular-nums whitespace-nowrap">
                                    {p.payment_date ? new Date(p.payment_date).toLocaleDateString() : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{p.payment_id || "—"}</td>
                                  <td className="px-4 py-2 text-gray-900 font-medium tabular-nums text-right whitespace-nowrap">
                                    {formatCurrency(p.amount_paid)}
                                  </td>
                                  <td className="px-4 py-2 text-gray-700 tabular-nums text-right whitespace-nowrap">
                                    {formatCurrency(p.penalties || 0)}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap">
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

          {isPaymentModalOpen && selectedLoan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
              <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-gray-200 bg-linear-to-r from-green-50 to-emerald-50 px-6 py-5">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Process Loan Payment</h2>
                    <p className="text-sm text-gray-600 mt-1">Enter payment details for {selectedLoan.member_name}</p>
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
                <div className="overflow-y-auto max-h-[calc(100vh-200px)] p-6">
                  {/* Status banner — penalty warning takes precedence over no-payment */}
                  {selectedLoan.is_overdue_for_penalty ? (
                    <div className="mb-4 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 flex items-start gap-3">
                      <AlertCircle size={20} className="text-red-600 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-bold text-red-800">Overdue — Penalty applies</p>
                        <p className="text-red-700 mt-0.5">
                          This installment was due {new Date(selectedLoan.due_date).toLocaleDateString()}. The
                          3-month grace period has lapsed, so a penalty has been added below.
                          {selectedLoan.last_payment_date
                            ? ` Last payment recorded: ${new Date(selectedLoan.last_payment_date).toLocaleDateString()}.`
                            : " No payment has ever been recorded on this loan."}
                        </p>
                      </div>
                    </div>
                  ) : selectedLoan.is_delayed ? (
                    <div className="mb-4 rounded-lg border-2 border-yellow-300 bg-yellow-50 px-4 py-3 flex items-start gap-3">
                      <AlertCircle size={20} className="text-yellow-700 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-bold text-yellow-900">No payment in over 1 month</p>
                        <p className="text-yellow-800 mt-0.5">
                          Installment due {new Date(selectedLoan.due_date).toLocaleDateString()}.
                          {selectedLoan.last_payment_date
                            ? ` Last payment: ${new Date(selectedLoan.last_payment_date).toLocaleDateString()}.`
                            : " No payment has ever been recorded on this loan."}
                          {" "}Penalty will start after the 3-month grace period.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {/* Loan Overview Cards */}
                  <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Loan Information</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Member ID:</span>
                          <span className="font-medium text-gray-900">{selectedLoan.member_id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Loan Type:</span>
                          <span className="font-medium text-gray-900">{toTitleCase(selectedLoan.loan_type)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Principal:</span>
                          <span className="font-semibold text-green-600">{formatCurrency(selectedLoan.loan_amount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Interest:</span>
                          <span className="font-semibold text-gray-900">{formatCurrency(selectedLoan.total_interest || Math.max((selectedLoan.amortization || 0) * (selectedLoan.term_months || 0) - (selectedLoan.loan_amount || 0), 0))}</span>
                        </div>
                        <div className="flex justify-between border-t border-gray-200 pt-2">
                          <span className="text-gray-700 font-semibold">Total Payment:</span>
                          <span className="font-bold text-green-700">{formatCurrency(selectedLoan.total_payable || ((selectedLoan.loan_amount || 0) + (selectedLoan.total_interest || Math.max((selectedLoan.amortization || 0) * (selectedLoan.term_months || 0) - (selectedLoan.loan_amount || 0), 0))))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Term:</span>
                          <span className="font-medium text-gray-900">{selectedLoan.term_months} months</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-blue-50 p-4">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Payment Status</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Loan Status:</span>
                          <span className={`font-semibold ${
                            selectedLoan.loan_status === "Fully Paid"
                              ? "text-green-600"
                              : selectedLoan.loan_status === "Partially Paid"
                              ? "text-amber-600"
                              : "text-red-600"
                          }`}>
                            {selectedLoan.loan_status}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Due Date:</span>
                          <span className="font-medium text-gray-900">{new Date(selectedLoan.due_date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Interest Rate:</span>
                          <span className="font-medium text-gray-900">{getDisplayedInterestRate(selectedLoan)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Amortization:</span>
                          <span className="font-medium text-gray-900">{formatCurrency(selectedLoan.amortization)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Balance Summary */}
                  <div className="mb-6 rounded-lg border-2 border-yellow-300 bg-yellow-50 p-4">
                    <p className="text-xs font-semibold text-yellow-900 uppercase tracking-wide mb-3">Balance Summary</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <p className="text-xs text-yellow-700 mb-1">Current Balance</p>
                        <p className="text-xl font-bold text-yellow-900">{formatCurrency(selectedLoan.remaining_balance)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-yellow-700 mb-1">
                          Penalty {selectedLoanPenalty > 0 ? "(applies)" : "(none yet)"}
                        </p>
                        <p className="text-xl font-bold text-yellow-900">{formatCurrency(selectedLoanPenalty)}</p>
                      </div>
                      <div className="rounded bg-white p-2 border border-yellow-200">
                        <p className="text-xs text-yellow-700 mb-1">Total Due</p>
                        <p className="text-xl font-bold text-yellow-900">{formatCurrency(selectedLoan.remaining_balance + selectedLoanPenalty)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Payment Form */}
                  <form onSubmit={handleSubmitPayment} className="space-y-4">
                    <div>
                      <label htmlFor="payment-amount" className="mb-2 block text-sm font-semibold text-gray-900">
                        Payment Amount
                      </label>
                      <input
                        id="payment-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        max={selectedLoan.remaining_balance + selectedLoanPenalty}
                        value={paymentAmount}
                        onChange={(event) => {
                          setPaymentAmount(event.target.value);
                          setFormError("");
                        }}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200 transition"
                        placeholder="Enter amount"
                        required
                      />
                    </div>

                    {/* Updated Balance Preview */}
                    {paymentAmount && (
                      <div className="rounded-lg border border-green-300 bg-green-50 p-4">
                        <p className="text-xs font-semibold text-green-900 uppercase tracking-wide mb-2">Preview</p>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600 mb-1">Payment Amount</p>
                            <p className="font-bold text-green-600">{formatCurrency(Number(paymentAmount) || 0)}</p>
                          </div>
                          <div>
                            <p className="text-gray-600 mb-1">Remaining After Payment</p>
                            <p className="font-bold text-gray-900">{formatCurrency(updatedBalancePreview)}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {formError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                        <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700">{formError}</p>
                      </div>
                    )}

                    {/* Form Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                      <button
                        type="button"
                        onClick={closePaymentModal}
                        disabled={isSubmittingPayment}
                        className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingPayment}
                        className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition disabled:opacity-50"
                      >
                        {isSubmittingPayment ? "Logging..." : "Submit Payment"}
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



