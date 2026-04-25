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
  ChevronRight,
  ArrowUpDown,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter
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
  let ratePercent = Number(loan?.interest_rate);
  const loanType = String(loan?.loan_type || '').trim().toLowerCase();

  // Backward compatibility for consolidated decimal monthly format (e.g., 0.083).
  if (loanType === 'consolidated' && Number.isFinite(ratePercent) && ratePercent > 0 && ratePercent < 1) {
    ratePercent *= 100;
  }

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
  
  // Filtering and sorting
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState({ key: "due_date", direction: "asc" });
  const [showFilters, setShowFilters] = useState(false);

  // Derived data: filtered and sorted loans
  const filteredAndSortedLoans = useMemo(() => {
    let filtered = loans.filter((loan) => {
      const matchesSearch =
        loan.member_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        loan.loan_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        loan.member_id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || loan.loan_status === statusFilter;

      return matchesSearch && matchesStatus;
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
        if (sortConfig.key === "due_date") {
          aValue = new Date(aValue);
          bValue = new Date(bValue);
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
  }, [loans, searchTerm, statusFilter, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((prevConfig) => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === "asc" ? "desc" : "asc",
    }));
  };

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
          <div className="mb-8">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
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

            {feedbackMessage && (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
                <CheckCircle2 size={16} />
                {feedbackMessage}
              </div>
            )}

            {/* Search and Filter Bar */}
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
              <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Loan Status
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {["all", "Fully Paid", "Partially Paid", "Unpaid"].map((status) => (
                        <button
                          key={status}
                          onClick={() => setStatusFilter(status)}
                          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                            statusFilter === status
                              ? "bg-green-600 text-white"
                              : "bg-white border border-gray-300 text-gray-700 hover:border-green-500"
                          }`}
                        >
                          {status === "all" ? "All Status" : status}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Main Loans Table */}
          <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-linear-to-r from-gray-50 to-gray-100">
                    <th className="px-6 py-4 text-left">
                      <button
                        onClick={() => handleSort("member_name")}
                        className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-gray-900 transition group"
                      >
                        Member Name
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <button
                        onClick={() => handleSort("loan_amount")}
                        className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-gray-900 transition group"
                      >
                        Loan Amount
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700">
                      Interest Rate
                    </th>
                    <th className="px-6 py-4 text-left">
                      <button
                        onClick={() => handleSort("term_months")}
                        className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-gray-900 transition group"
                      >
                        Term
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700">
                      Amortization
                    </th>
                    <th className="px-6 py-4 text-left">
                      <button
                        onClick={() => handleSort("due_date")}
                        className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-gray-900 transition group"
                      >
                        Due Date
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700">
                      Delay Status
                    </th>
                    <th className="px-6 py-4 text-left">
                      <button
                        onClick={() => handleSort("remaining_balance")}
                        className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-gray-900 transition group"
                      >
                        Balance
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <button
                        onClick={() => handleSort("loan_status")}
                        className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-gray-900 transition group"
                      >
                        Status
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAndSortedLoans.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <AlertCircle size={32} className="text-gray-300" />
                          <p className="text-sm text-gray-500">
                            No loans found matching your criteria
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedLoans.map((loan) => (
                      <tr key={loan.loan_id} className="hover:bg-green-50 transition">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {loan.member_name}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700 font-semibold">
                          {formatCurrency(loan.loan_amount)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {getDisplayedInterestRate(loan)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {loan.term_months} mo
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {formatCurrency(loan.amortization)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {new Date(loan.due_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                              loan.is_delayed
                                ? "bg-red-100 text-red-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {loan.is_delayed ? (
                              <>
                                <AlertCircle size={12} />
                                Delayed
                              </>
                            ) : (
                              <>
                                <CheckCircle2 size={12} />
                                On Time
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                          {formatCurrency(loan.remaining_balance)}
                        </td>
                        <td className="px-6 py-4">
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
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={() => openPaymentModal(loan)}
                            disabled={loan.loan_status === "Fully Paid"}
                            className="rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 transition disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                          >
                            Pay
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

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
                          <span className="text-gray-600">Loan Amount:</span>
                          <span className="font-semibold text-green-600">{formatCurrency(selectedLoan.loan_amount)}</span>
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
                        <p className="text-xs text-yellow-700 mb-1">Penalty (if overdue)</p>
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
                        className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition"
                      >
                        Submit Payment
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Payment Records Table */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-200 bg-linear-to-r from-gray-50 to-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">Payment Records</h2>
              <p className="text-sm text-gray-600 mt-1">{paymentRecords.length} transactions recorded</p>
            </div>
            
            {paymentRecords.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="flex flex-col items-center gap-3">
                  <Banknote size={40} className="text-gray-300" />
                  <p className="text-sm text-gray-500">
                    No payments recorded yet
                  </p>
                  <p className="text-xs text-gray-400">
                    Payments will appear here once submitted
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                        Payment ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                        Member Info
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                        Payment Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                        Penalties
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                        Deficiency
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paymentRecords.map((record) => {
                      const relatedLoan = loans.find((l) => l.loan_id === record.loan_id);
                      return (
                        <tr key={record.payment_id} className="hover:bg-green-50 transition">
                          <td className="px-6 py-3 text-xs font-mono text-gray-700">
                            <span className="inline-flex rounded bg-gray-100 px-2 py-1">
                              {record.payment_id?.slice(0, 8)}...
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm">
                            <div>
                              <p className="font-medium text-gray-900">{relatedLoan?.member_name || "N/A"}</p>
                              <p className="text-xs text-gray-500">{record.loan_id?.slice(0, 8)}...</p>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-sm font-semibold text-green-600">
                            {formatCurrency(record.amount_paid)}
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-700">
                            {new Date(record.payment_date).toLocaleString("en-PH", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-6 py-3 text-sm text-orange-600 font-medium">
                            {formatCurrency(record.penalties)}
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-700">
                            {record.deficiency}
                          </td>
                          <td className="px-6 py-3">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                record.confirmation_status === "confirmed"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-yellow-100 text-yellow-700"
                              }`}
                            >
                              {record.confirmation_status === "confirmed"
                                ? "Confirmed"
                                : "Pending"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Cashier_Payments;



