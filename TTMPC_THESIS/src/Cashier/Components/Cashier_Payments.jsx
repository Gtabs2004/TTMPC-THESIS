import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity"; // Adjust path to AuthContext if needed
import { 
  LayoutDashboard, 
  Search,
  Bell,
  Banknote,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import logo from "../../assets/img/ttmpc logo.png"; // Adjust path to logo if needed

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const MOCK_LOANS = [
  {
    loan_id: "a5fe5f28-4fc9-4a43-b4c9-a206a94587d1",
    schedule_id: "TTMPCLP_SI_001",
    member_id: "M-0001",
    member_name: "Juan Dela Cruz",
    loan_type: "consolidated",
    is_migs_member: true,
    loan_amount: 50000,
    term_months: 12,
    due_date: "2026-02-28",
    remaining_balance: 21450,
    loan_status: "Partially Paid",
  },
  {
    loan_id: "8d8f7906-a326-4587-ab98-a64fd5ab6fa4",
    schedule_id: "TTMPCLP_SI_002",
    member_id: "M-0002",
    member_name: "Maria Santos",
    loan_type: "emergency",
    is_migs_member: false,
    loan_amount: 30000,
    term_months: 8,
    due_date: "2026-03-10",
    remaining_balance: 30000,
    loan_status: "Unpaid",
  },
  {
    loan_id: "0f7414a7-950d-4fcd-b0bc-3ca98f59c4e0",
    schedule_id: "TTMPCLP_SI_003",
    member_id: "M-0003",
    member_name: "Pedro Reyes",
    loan_type: "bonus",
    is_migs_member: true,
    loan_amount: 20000,
    term_months: 6,
    due_date: "2026-01-15",
    remaining_balance: 0,
    loan_status: "Fully Paid",
  },
];

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

const getMonthlyInterestRate = (loan) => {
  const ratePercent = Number(loan?.interest_rate);
  if (Number.isFinite(ratePercent) && ratePercent > 0) {
    return ratePercent / 100;
  }
  return 0;
};

const calculateAmortization = (loan) => {
  const principal = Number(loan.loan_amount) || 0;
  const months = Number(loan.term_months) || 0;
  const monthlyRate = getMonthlyInterestRate(loan);

  if (principal <= 0 || months <= 0) return 0;


  if (loan.loan_type === "emergency") {
    const factor = Math.pow(1 + monthlyRate, months);
    const emi = (principal * monthlyRate * factor) / (factor - 1);
    return roundCurrency(emi);
  }


  const totalPayable = principal * (1 + monthlyRate * months);
  return roundCurrency(totalPayable / months);
};

const getDisplayedInterestRate = (loan) => {
  const ratePercent = (getMonthlyInterestRate(loan) * 100).toFixed(2);
  if (loan.loan_type === "emergency") return `${ratePercent}% (Diminishing)`;
  if (loan.loan_type === "bonus") {
    return `${ratePercent}% (${loan.is_migs_member ? "MIGS" : "Non-MIGS"})`;
  }
  return `${ratePercent}%`;
};

const toTitleCase = (value) => {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const calculatePenalty = (dueDate, remainingBalance) => {
  if (!dueDate) {
    return 0;
  }

  const today = new Date();
  const due = new Date(dueDate);

  if (Number.isNaN(due.getTime()) || remainingBalance <= 0) {
    return 0;
  }

  // One-month grace period after due date before penalty starts.
  const penaltyStartDate = new Date(due);
  penaltyStartDate.setMonth(penaltyStartDate.getMonth() + 1);

  if (today < penaltyStartDate) {
    return 0;
  }

  const monthsOverdue = Math.max(
    1,
    (today.getFullYear() - penaltyStartDate.getFullYear()) * 12 +
      today.getMonth() -
      penaltyStartDate.getMonth() +
      1
  );

  return remainingBalance * 0.02 * monthsOverdue;
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
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const [isDepositsOpen, setIsDepositsOpen] = useState(true);
  const [loans, setLoans] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [loadingLoans, setLoadingLoans] = useState(false);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/Cashier_Dashboard" },
    { name: "Payments", icon: Banknote, path: "/Cashier_Payments" },
    { name: "Disbursement", icon: Banknote, path: "/Cashier_Disbursement" },
    {
      name: "Deposits",
      icon: Banknote,
      isDropdown: true,
      subItems: [
        { name: "Savings", path: "/Cashier_Savings" },
        { name: "Capital Build-Up", path: "/Cashier_CBU" },
      ],
    },
    { name: "Withdrawals", icon: Banknote, path: "/Cashier_Withdrawals" },
  ];

  useEffect(() => {
    fetchLoans();
  }, []);

  async function fetchLoans() {
    setLoadingLoans(true);
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
          due_date: loan.due_date || null,
        };

        return {
          ...normalizedLoan,
          amortization: Number(loan.amortization || 0) > 0
            ? Number(loan.amortization)
            : calculateAmortization(normalizedLoan),
        };
      });

      setLoans(mappedLoans);
      setPaymentRecords(result?.data?.payment_records || []);
    } catch (error) {
      console.error("Failed to fetch cashier loan data:", error);
      const fallbackLoans = MOCK_LOANS.map((loan) => ({
        ...loan,
        amortization: calculateAmortization(loan),
      }));
      setLoans(fallbackLoans);
      setPaymentRecords([]);
      setFeedbackMessage("Backend unavailable. Showing mock loan data.");
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
    return calculatePenalty(selectedLoan.due_date, selectedLoan.remaining_balance);
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
    setFeedbackMessage("");
    setIsPaymentModalOpen(true);
  };

  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setSelectedLoan(null);
    setPaymentAmount("");
    setFormError("");
  };

  const handleSubmitPayment = async (event) => {
    event.preventDefault();
    if (!selectedLoan) return;

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

    try {
      const insertedRecord = await processPayment(paymentPayload);
      setPaymentRecords((previous) => [insertedRecord, ...previous]);
      setFeedbackMessage("Payment logged and pending Bookkeeper confirmation. Loan balance is unchanged until confirmation.");
      closePaymentModal();
      await fetchLoans();
    } catch (error) {
      setFormError(error.message || "Failed to submit payment.");
    }
  };


  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* 1. THE SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Cashier Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm grow">
          {menuItems.map((item) => {
            const Icon = item.icon;

            if (item.isDropdown) {
              return (
                <div key={item.name} className="flex flex-col">
                  <button
                    onClick={() => setIsDepositsOpen(!isDepositsOpen)}
                    className="flex items-center justify-between p-2 rounded-md text-gray-700 hover:bg-green-50 hover:text-[#5CBA47] transition-colors w-full"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={20} />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    {isDepositsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {isDepositsOpen && (
                    <div className="flex flex-col mt-1 space-y-1">
                      {item.subItems.map((subItem) => (
                        <NavLink
                          key={subItem.name}
                          to={subItem.path}
                          className={({ isActive }) =>
                            `block pl-11 pr-4 py-2 rounded-md transition-colors ${
                              isActive
                                ? 'text-[#5CBA47] font-semibold'
                                : 'text-gray-500 hover:text-[#5CBA47] hover:bg-green-50'
                            }`
                          }
                        >
                          {subItem.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2 rounded-md transition-colors ${
                    isActive
                      ? 'bg-green-50 text-[#5CBA47] font-semibold'
                      : 'text-gray-700 hover:bg-green-50 hover:text-[#5CBA47]'
                  }`
                }
              >
                <Icon size={20} />
                <span className="font-medium">{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      {/* 2. THE MAIN AREA (HEADER + PAGE CONTENT) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* THE HEADER */}
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              placeholder="Search..."
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 pl-9 py-1 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <p className="ml-4 font-medium">Cashier</p>
        </header>

        {/* 3. CASHIER LOAN PAYMENTS */}
        <main className="p-8 overflow-auto">
          <div className="flex items-center justify-between gap-4 mb-5">
            <h1 className="text-2xl font-bold text-gray-800">Loan Payments</h1>
            <div className="text-sm text-gray-500">Cashier module (mock data, backend-ready)</div>
          </div>

          {loadingLoans && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Loading loans and payment records...
            </div>
          )}

          {feedbackMessage && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {feedbackMessage}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Member Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Loan Amount</th>
                  <th className="px-4 py-3 text-left font-semibold">Interest Rate</th>
                  <th className="px-4 py-3 text-left font-semibold">Term</th>
                  <th className="px-4 py-3 text-left font-semibold">Amortization</th>
                  <th className="px-4 py-3 text-left font-semibold">Due Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Grace (3 days)</th>
                  <th className="px-4 py-3 text-left font-semibold">Delay Flag</th>
                  <th className="px-4 py-3 text-left font-semibold">Remaining Balance</th>
                  <th className="px-4 py-3 text-left font-semibold">Loan Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan.loan_id} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-700">{loan.member_name}</td>
                    <td className="px-4 py-3 text-gray-700">{formatCurrency(loan.loan_amount)}</td>
                    <td className="px-4 py-3 text-gray-700">{getDisplayedInterestRate(loan)}</td>
                    <td className="px-4 py-3 text-gray-700">{loan.term_months} months</td>
                    <td className="px-4 py-3 text-gray-700">{formatCurrency(loan.amortization)}</td>
                    <td className="px-4 py-3 text-gray-700">{loan.due_date}</td>
                    <td className="px-4 py-3 text-gray-700">{loan.grace_deadline || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${loan.is_delayed ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                        {loan.is_delayed ? "Delayed" : "On Time"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{formatCurrency(loan.remaining_balance)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
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
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openPaymentModal(loan)}
                        disabled={loan.loan_status === "Fully Paid"}
                        className="rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                      >
                        Pay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isPaymentModalOpen && selectedLoan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h2 className="text-xl font-bold text-gray-800">Process Loan Payment</h2>
                  <button
                    type="button"
                    onClick={closePaymentModal}
                    className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100"
                  >
                    Close
                  </button>
                </div>

                <div className="mb-4 grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-2">
                  <p><span className="font-semibold">Member:</span> {selectedLoan.member_name}</p>
                  <p><span className="font-semibold">Loan ID:</span> {selectedLoan.loan_id}</p>
                  <p><span className="font-semibold">Schedule ID:</span> {selectedLoan.schedule_id}</p>
                  <p><span className="font-semibold">Loan Amount:</span> {formatCurrency(selectedLoan.loan_amount)}</p>
                  <p><span className="font-semibold">Loan Type:</span> {toTitleCase(selectedLoan.loan_type)}</p>
                  <p><span className="font-semibold">Interest Rate:</span> {getDisplayedInterestRate(selectedLoan)}</p>
                  <p><span className="font-semibold">Term:</span> {selectedLoan.term_months} months</p>
                  <p><span className="font-semibold">Amortization:</span> {formatCurrency(selectedLoan.amortization)}</p>
                  <p><span className="font-semibold">Due Date:</span> {selectedLoan.due_date}</p>
                  <p><span className="font-semibold">Status:</span> {selectedLoan.loan_status}</p>
                </div>

                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  <p><span className="font-semibold">Current Balance:</span> {formatCurrency(selectedLoan.remaining_balance)}</p>
                  <p><span className="font-semibold">Computed Penalty:</span> {formatCurrency(selectedLoanPenalty)}</p>
                  <p><span className="font-semibold">Deficiency (Missed Due Dates):</span> {getMissedDueDates(selectedLoan.due_date)}</p>
                  <p><span className="font-semibold">Total Due:</span> {formatCurrency(selectedLoan.remaining_balance + selectedLoanPenalty)}</p>
                </div>

                <form onSubmit={handleSubmitPayment} className="space-y-3">
                  <div>
                    <label htmlFor="payment-amount" className="mb-1 block text-sm font-medium text-gray-700">
                      Payment Amount
                    </label>
                    <input
                      id="payment-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentAmount}
                      onChange={(event) => {
                        setPaymentAmount(event.target.value);
                        setFormError("");
                      }}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                      placeholder="Enter amount"
                      required
                    />
                  </div>

                  <div className="rounded-md border border-gray-200 p-3 text-sm text-gray-700">
                    <p><span className="font-semibold">Updated Balance (Preview):</span> {formatCurrency(updatedBalancePreview)}</p>
                  </div>

                  {formError && (
                    <p className="text-sm text-red-600">{formError}</p>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closePaymentModal}
                      className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                    >
                      Submit Payment
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="mt-8 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-lg font-semibold text-gray-800">Records</h2>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">PaymentID</th>
                  <th className="px-4 py-3 text-left font-semibold">LoanID</th>
                  <th className="px-4 py-3 text-left font-semibold">ScheduleID</th>
                  <th className="px-4 py-3 text-left font-semibold">TransactionID</th>
                  <th className="px-4 py-3 text-left font-semibold">AmountPaid</th>
                  <th className="px-4 py-3 text-left font-semibold">PaymentDate</th>
                  <th className="px-4 py-3 text-left font-semibold">Penalties</th>
                  <th className="px-4 py-3 text-left font-semibold">Deficiency</th>
                  <th className="px-4 py-3 text-left font-semibold">Confirmation</th>
                </tr>
              </thead>
              <tbody>
                {paymentRecords.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                      No payments yet. Submit a payment to generate a LOAN_PAYMENTS row preview.
                    </td>
                  </tr>
                )}
                {paymentRecords.map((record) => (
                  <tr key={record.payment_id} className="border-t border-gray-100 align-top">
                    <td className="px-4 py-3 text-xs text-gray-700">{record.payment_id}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{record.loan_id}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{record.schedule_id}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{record.transaction_id}</td>
                    <td className="px-4 py-3 text-gray-700">{formatCurrency(record.amount_paid)}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{new Date(record.payment_date).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-700">{formatCurrency(record.penalties)}</td>
                    <td className="px-4 py-3 text-gray-700">{record.deficiency}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{record.confirmation_status || "pending_bookkeeper"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Cashier_Payments;



