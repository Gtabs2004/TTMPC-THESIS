import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Calculator,
  Activity,
  BarChart3,
  History,
  Search,
  Bell,
  CheckCircle,
  XCircle,
  Eye,
  Wallet,
  Coins,
} from "lucide-react";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const getLoanTypeStyle = (code) => {
  const key = String(code || "").toUpperCase();
  if (key === "CONSOLIDATED") return "bg-blue-100 text-blue-700";
  if (key === "EMERGENCY") return "bg-red-100 text-red-700";
  if (key === "BONUS") return "bg-amber-100 text-amber-700";
  if (key === "KOICA" || key === "ABF") return "bg-emerald-100 text-emerald-700";
  return "bg-gray-100 text-gray-700";
};

const getStatusStyle = (status) => {
  const key = String(status || "").toLowerCase();
  if (key.includes("pending")) return "bg-yellow-100 text-yellow-700";
  if (key.includes("validated")) return "bg-green-100 text-green-700";
  if (key.includes("rejected")) return "bg-red-100 text-red-700";
  if (key.includes("fully")) return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-700";
};

const BookkeeperPayments = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();

  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [activeTab, setActiveTab] = useState("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [loanTypeFilter, setLoanTypeFilter] = useState("all");
  const [memberTypeFilter, setMemberTypeFilter] = useState("all");
  const [selectedRejectPayment, setSelectedRejectPayment] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workingPaymentId, setWorkingPaymentId] = useState("");

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Manage Member", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: CreditCard },
    { name: "Payments", icon: Wallet },
    { name: "Savings Transactions", icon: CreditCard },
    { name: "Accounting", icon: Calculator },
    { name: "MIGS Scoring", icon: Activity },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Trail", icon: History },
  ];

  const routeMap = {
    Dashboard: "/dashboard",
    "Manage Member": "/manage-member",
    "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans": "/manage-loans",
    Payments: "/payments",
    "Savings Transactions": "/bookkeeper-savings-transactions",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs-scoring",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
  };

  const loanById = useMemo(() => {
    const map = new Map();
    loans.forEach((loan) => map.set(loan.loan_id, loan));
    return map;
  }, [loans]);

  const tabItems = useMemo(() => {
    const pendingCount = payments.filter((p) => p.confirmation_status === "pending_bookkeeper").length;
    const validatedCount = payments.filter((p) => p.confirmation_status === "validated").length;
    const rejectedCount = payments.filter((p) => p.confirmation_status === "rejected").length;
    const activeLoansCount = loans.filter((loan) => loan.remaining_balance > 0).length;
    const fullyPaidCount = loans.filter((loan) => loan.remaining_balance <= 0).length;

    return [
      { key: "pending", label: "Pending Payments", count: pendingCount },
      { key: "validated", label: "Validated Payments", count: validatedCount },
      { key: "rejected", label: "Rejected Payments", count: rejectedCount },
      { key: "active", label: "Active Loans", count: activeLoansCount },
      { key: "fully_paid", label: "Fully Paid", count: fullyPaidCount },
    ];
  }, [payments, loans]);

  const dashboardStats = useMemo(() => {
    const totalActiveLoans = loans.filter((loan) => loan.remaining_balance > 0).length;
    const totalOutstanding = loans.reduce((sum, loan) => sum + Number(loan.remaining_balance || 0), 0);
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const collectedThisMonth = payments
      .filter((item) => item.confirmation_status === "validated")
      .filter((item) => String(item.date_paid || "").slice(0, 7) === currentMonthKey)
      .reduce((sum, item) => sum + Number(item.payment_amount || 0), 0);

    return {
      totalActiveLoans,
      totalOutstanding,
      collectedThisMonth,
    };
  }, [payments, loans]);

  const filteredPaymentRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const statusByTab = {
      pending: "pending_bookkeeper",
      validated: "validated",
      rejected: "rejected",
    };

    const targetStatus = statusByTab[activeTab];
    if (!targetStatus) return [];

    return payments
      .filter((item) => item.confirmation_status === targetStatus)
      .filter((item) => {
        const loan = loanById.get(item.loan_id);
        if (!loan) return true;

        if (loanTypeFilter !== "all" && loan.loan_type_code !== loanTypeFilter) return false;
        if (memberTypeFilter !== "all" && loan.member_type !== memberTypeFilter) return false;

        if (!normalizedSearch) return true;

        return (
          String(item.payment_id).toLowerCase().includes(normalizedSearch) ||
          String(item.loan_id).toLowerCase().includes(normalizedSearch) ||
          String(loan.member_name).toLowerCase().includes(normalizedSearch)
        );
      });
  }, [activeTab, payments, loanById, loanTypeFilter, memberTypeFilter, searchTerm]);

  const filteredLoanRows = useMemo(() => {
    if (!(activeTab === "active" || activeTab === "fully_paid")) return [];

    const normalizedSearch = searchTerm.trim().toLowerCase();
    return loans
      .filter((loan) => (activeTab === "active" ? loan.remaining_balance > 0 : loan.remaining_balance <= 0))
      .filter((loan) => (loanTypeFilter === "all" ? true : loan.loan_type_code === loanTypeFilter))
      .filter((loan) => (memberTypeFilter === "all" ? true : loan.member_type === memberTypeFilter))
      .filter((loan) => {
        if (!normalizedSearch) return true;
        return (
          String(loan.loan_id).toLowerCase().includes(normalizedSearch) ||
          String(loan.member_name).toLowerCase().includes(normalizedSearch)
        );
      });
  }, [activeTab, loans, loanTypeFilter, memberTypeFilter, searchTerm]);

  const activeRecordCount = activeTab === "active" || activeTab === "fully_paid"
    ? filteredLoanRows.length
    : filteredPaymentRows.length;

  useEffect(() => {
    fetchPendingPayments();
  }, []);

  const buildPaymentsFromLoanHistory = (loanRows) => {
    const result = [];
    for (const loan of loanRows || []) {
      const history = Array.isArray(loan.payment_history) ? loan.payment_history : [];
      for (const row of history) {
        result.push({
          payment_id: row.payment_id,
          loan_id: loan.loan_id,
          schedule_id: row.schedule_id || null,
          payment_amount: Number(row.amount_paid || 0),
          penalties: Number(row.penalties || 0),
          date_paid: row.date_paid,
          entered_by: row.entered_by || "Cashier",
          reference_no: row.reference_no || row.payment_id,
          confirmation_status: row.confirmation_status || "pending_bookkeeper",
        });
      }
    }
    return result;
  };

  async function fetchPendingPayments() {
    setLoading(true);
    setFeedback("");

    try {
      const [pendingRes, loansRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/bookkeeper/payments/pending`, {
          method: "GET",
          headers: { Accept: "application/json" },
        }),
        fetch(`${API_BASE_URL}/api/bookkeeper/manage-loans`, {
          method: "GET",
          headers: { Accept: "application/json" },
        }),
      ]);

      const pendingPayload = await pendingRes.json().catch(() => ({}));
      const loansPayload = await loansRes.json().catch(() => ({}));

      if (!pendingRes.ok) {
        throw new Error(pendingPayload?.detail || "Failed to load pending payments queue.");
      }
      if (!loansRes.ok) {
        throw new Error(loansPayload?.detail || "Failed to load loan monitoring data.");
      }

      const loanRows = Array.isArray(loansPayload?.data?.rows) ? loansPayload.data.rows : [];
      const pendingRows = Array.isArray(pendingPayload?.data) ? pendingPayload.data : [];

      const queueRows = pendingRows.map((row) => ({
        payment_id: row.payment_id,
        loan_id: row.loan_id,
        schedule_id: row.schedule_id,
        payment_amount: Number(row.amount_paid || 0),
        penalties: Number(row.penalties || 0),
        date_paid: row.date_paid,
        entered_by: row.entered_by || "Cashier",
        reference_no: row.transaction_reference || row.payment_id,
        confirmation_status: row.confirmation_status || "pending_bookkeeper",
      }));

      const historyRows = buildPaymentsFromLoanHistory(loanRows)
        .filter((row) => ["validated", "rejected"].includes(String(row.confirmation_status || "").toLowerCase()));

      setLoans(loanRows);
      setPayments([...queueRows, ...historyRows]);
    } catch (error) {
      setLoans([]);
      setPayments([]);
      setFeedback(error?.message || "Unable to sync payments queue.");
    } finally {
      setLoading(false);
    }
  }

  async function approvePayment(paymentId) {
    setWorkingPaymentId(paymentId);
    setFeedback("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/payments/${encodeURIComponent(paymentId)}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ notes: "Validated by Bookkeeper" }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || payload?.message || "Failed to validate payment.");
      }

      setFeedback(`Payment ${paymentId} validated and confirmed. Ledger is now updated.`);
      await fetchPendingPayments();
    } catch (error) {
      setFeedback(error?.message || "Failed to validate payment.");
    } finally {
      setWorkingPaymentId("");
    }
  }

  async function rejectPayment(paymentId, reason) {
    setWorkingPaymentId(paymentId);
    setFeedback("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/payments/${encodeURIComponent(paymentId)}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ notes: reason || "Rejected by Bookkeeper" }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || payload?.message || "Failed to reject payment.");
      }

      setFeedback(`Payment ${paymentId} rejected.`);
      await fetchPendingPayments();
    } catch (error) {
      setFeedback(error?.message || "Failed to reject payment.");
    } finally {
      setWorkingPaymentId("");
    }
  }

  const handleSignOut = async (event) => {
    event.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  const openRejectFlow = (payment) => {
    setSelectedRejectPayment(payment);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!selectedRejectPayment) return;
    await rejectPayment(selectedRejectPayment.payment_id, rejectReason);
    setShowRejectModal(false);
    setSelectedRejectPayment(null);
    setRejectReason("");
  };

  const openLoanDetailsFromPayment = (payment) => {
    const loan = loanById.get(payment.loan_id);
    if (!loan) return;
    navigate(`/bookkeeper-loan-ledger/${loan.loan_id}`, { state: { loan } });
  };

  const openLoanDetailsFromLoan = (loan) => {
    navigate(`/bookkeeper-loan-ledger/${loan.loan_id}`, { state: { loan } });
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Bookkeeper Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, "-")}`;

            return (
              <NavLink
                key={item.name}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2 rounded-md transition-colors ${
                    isActive
                      ? "bg-green-50 text-green-700 font-semibold"
                      : "text-gray-700 hover:bg-green-50 hover:text-green-700"
                  }`
                }
              >
                <Icon size={20} />
                <span>{item.name}</span>
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

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="bg-gray-50 w-60 h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
              placeholder="Search member, loan ID, payment ID"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img
            src="src/assets/img/bookkeeper-profile.png"
            alt="Bookkeeper Profile"
            className="ml-4 w-8 h-8 rounded-full"
          />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
        </header>

        <main className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-bold text-2xl text-gray-800">Bookkeeper Loan Monitoring</h1>
              <p className="text-sm text-gray-500 mt-1">Validate cashier payments and monitor loan repayment ledgers.</p>
            </div>
            <button
              type="button"
              onClick={fetchPendingPayments}
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
            >
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Total Active Loans</p>
                <CreditCard size={16} className="text-[#2C7A3F]" />
              </div>
              <h2 className="mt-2 text-2xl font-bold text-gray-800">{dashboardStats.totalActiveLoans}</h2>
            </div>

            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Outstanding Balance</p>
                <Wallet size={16} className="text-[#2C7A3F]" />
              </div>
              <h2 className="mt-2 text-2xl font-bold text-gray-800">{formatCurrency(dashboardStats.totalOutstanding)}</h2>
            </div>

            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Collected This Month</p>
                <Coins size={16} className="text-[#2C7A3F]" />
              </div>
              <h2 className="mt-2 text-2xl font-bold text-gray-800">{formatCurrency(dashboardStats.collectedThisMonth)}</h2>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-gray-200 shadow-sm mb-4 p-3">
            <div className="flex flex-wrap gap-2">
              {tabItems.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="inline-flex items-center justify-center min-w-6 h-6 rounded-full bg-white border border-gray-200 text-xs font-semibold">
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white border border-gray-200 shadow-sm mb-4 p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={loanTypeFilter}
                  onChange={(event) => setLoanTypeFilter(event.target.value)}
                  className="h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
                >
                  <option value="all">All Loan Types</option>
                  <option value="CONSOLIDATED">Consolidated</option>
                  <option value="EMERGENCY">Emergency</option>
                  <option value="BONUS">Bonus</option>
                  <option value="KOICA">KOICA</option>
                  <option value="ABF">ABF</option>
                </select>

                <select
                  value={memberTypeFilter}
                  onChange={(event) => setMemberTypeFilter(event.target.value)}
                  className="h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
                >
                  <option value="all">All Member Types</option>
                  <option value="Member">Member</option>
                  <option value="Non-Member">Non-Member</option>
                  <option value="KOICA">KOICA</option>
                </select>
              </div>

              <div className="relative lg:justify-self-end">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="bg-gray-50 w-full lg:w-80 h-10 rounded-lg border border-gray-200 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
                  placeholder="Search loan/member/payment"
                />
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Business Rules: Non-Member accounts are limited to Bonus loans. KOICA users are limited to KOICA or ABF loans.
            </div>

            {feedback && (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {feedback}
              </div>
            )}

            {loading && (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Syncing payment queue and loan ledger data...
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                {activeTab === "active" || activeTab === "fully_paid" ? (
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Loan ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Member Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Loan Type</th>
                    <th className="px-4 py-3 text-left font-semibold">Loan Amount</th>
                    <th className="px-4 py-3 text-left font-semibold">Remaining Balance</th>
                    <th className="px-4 py-3 text-left font-semibold">Due Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Action</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Payment ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Member Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Loan Details</th>
                    <th className="px-4 py-3 text-left font-semibold">Payment Amount</th>
                    <th className="px-4 py-3 text-left font-semibold">Date Paid</th>
                    <th className="px-4 py-3 text-left font-semibold">Entered By</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Action</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {activeRecordCount === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No records found for this tab.
                    </td>
                  </tr>
                )}

                {(activeTab === "active" || activeTab === "fully_paid") &&
                  filteredLoanRows.map((loan) => (
                    <tr key={loan.loan_id} className="border-t border-gray-100">
                      <td className="px-4 py-3 text-xs text-gray-700">{loan.loan_id}</td>
                      <td className="px-4 py-3 text-gray-800 font-medium">{loan.member_name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getLoanTypeStyle(loan.loan_type_code)}`}>
                          {loan.loan_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(loan.loan_amount)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(loan.remaining_balance)}</td>
                      <td className="px-4 py-3 text-gray-700">{loan.due_date}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(loan.status)}`}>
                          {loan.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openLoanDetailsFromLoan(loan)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          <Eye size={14} /> View Ledger
                        </button>
                      </td>
                    </tr>
                  ))}

                {!(activeTab === "active" || activeTab === "fully_paid") &&
                  filteredPaymentRows.map((item) => {
                    const loan = loanById.get(item.loan_id);

                    return (
                      <tr key={item.payment_id} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-3 text-xs text-gray-700">{item.payment_id}</td>
                        <td className="px-4 py-3 text-gray-800 font-medium">{loan?.member_name || "Unknown Member"}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <div className="text-xs text-gray-500">Loan ID: {item.loan_id}</div>
                          <div className="mt-1">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getLoanTypeStyle(loan?.loan_type_code)}`}>
                              {loan?.loan_type || "N/A"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-800">
                          <div>{formatCurrency(item.payment_amount)}</div>
                          <div className="text-xs text-gray-500">Penalty: {formatCurrency(item.penalties)}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{new Date(item.date_paid).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-gray-700">{item.entered_by}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(item.confirmation_status)}`}>
                            {item.confirmation_status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
                            <button
                              type="button"
                              onClick={() => openLoanDetailsFromPayment(item)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              <Eye size={14} /> View
                            </button>
                            {activeTab === "pending" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => approvePayment(item.payment_id)}
                                  disabled={workingPaymentId === item.payment_id}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-green-600 px-3 py-2 text-xs text-white hover:bg-green-700"
                                >
                                  <CheckCircle size={14} /> {workingPaymentId === item.payment_id ? "Processing..." : "Approve"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openRejectFlow(item)}
                                  disabled={workingPaymentId === item.payment_id}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-600 px-3 py-2 text-xs text-white hover:bg-red-700"
                                >
                                  <XCircle size={14} /> Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {showRejectModal && selectedRejectPayment && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Reject Payment</h2>
            <p className="text-sm text-gray-600 mb-3">
              Provide reason for rejecting payment {selectedRejectPayment.payment_id}.
            </p>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Enter rejection reason"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedRejectPayment(null);
                  setRejectReason("");
                }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReject}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookkeeperPayments;




