import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import { supabase } from "../../supabaseClient";
import {
  LayoutDashboard,
  Search,
  Bell,
  Banknote,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserSearch,
  UserPlus,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowUpRight,
  
  Send,
  PiggyBank,
  ShoppingCart,
  ArrowDownLeft,
} from "lucide-react";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 10;
const MEMBERSHIP_FEE = 100;
const PAID_UP_REQUIRED = 10000;

const PAYMENT_TYPE_META = {
  MEMBERSHIP_FEE: {
    label: "Membership Fee",
    short: "Fee",
    defaultAmount: MEMBERSHIP_FEE,
    minAmount: MEMBERSHIP_FEE,
  },
  INITIAL_PAID_UP_CAPITAL: {
    label: "Initial Paid-Up Capital",
    short: "Paid-Up",
    defaultAmount: PAID_UP_REQUIRED,
    minAmount: PAID_UP_REQUIRED,
  },
};

const Cashier_MembershipPayments = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [isDepositsOpen, setIsDepositsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("applicants"); // applicants | transactions
  const [applicants, setApplicants] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | unpaid | paid
  const [applicantsPage, setApplicantsPage] = useState(1);
  const [transactionsPage, setTransactionsPage] = useState(1);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [selectedPaymentType, setSelectedPaymentType] = useState("MEMBERSHIP_FEE");
  const [amountInput, setAmountInput] = useState(String(MEMBERSHIP_FEE));
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/Cashier_Dashboard" },
        { name: "Payments", icon: ArrowUpRight, path: "/Cashier_Payments" },
        { name: "Disbursement", icon: Send, path: "/Cashier_Disbursement" },
        { name: "Membership Payments", icon: UserPlus, path: "/Cashier_MembershipPayments" },
        {
          name: "Deposits",
          icon: PiggyBank,
          isDropdown: true,
          subItems: [
            { name: "Savings", path: "/Cashier_Savings" },
            { name: "Capital Build-Up", path: "/Cashier_CBU" },
          ],
        },
        { name: "Withdrawals", icon: ArrowDownLeft, path: "/Cashier_Withdrawals" },
        { name: "Grocery", icon: ShoppingCart, path: "/Cashier_Grocery" },
      ];
    

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const formatCurrency = (value) =>
    `₱${Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const formatDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-PH", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  };

  const formatDateTime = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-PH", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const fetchAll = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [appsRes, txRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/cashier/membership-payments/applicants`, {
          headers: { Accept: "application/json" },
        }),
        fetch(`${API_BASE_URL}/api/cashier/membership-payments`, {
          headers: { Accept: "application/json" },
        }),
      ]);
      const appsJson = await appsRes.json().catch(() => ({}));
      const txJson = await txRes.json().catch(() => ({}));

      if (!appsRes.ok || !appsJson?.success) {
        throw new Error(appsJson?.detail || "Failed to load applicants.");
      }
      if (!txRes.ok || !txJson?.success) {
        throw new Error(txJson?.detail || "Failed to load transactions.");
      }

      setApplicants(Array.isArray(appsJson.data) ? appsJson.data : []);
      setTransactions(Array.isArray(txJson.data) ? txJson.data : []);
    } catch (err) {
      setLoadError(err?.message || "Unable to load membership payment data.");
      setApplicants([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredApplicants = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return applicants.filter((row) => {
      if (statusFilter === "paid" && !row.membership_fee_paid) return false;
      if (statusFilter === "unpaid" && row.membership_fee_paid) return false;
      if (!needle) return true;
      return (
        String(row.full_name || "").toLowerCase().includes(needle) ||
        String(row.application_id || "").toLowerCase().includes(needle) ||
        String(row.email || "").toLowerCase().includes(needle)
      );
    });
  }, [applicants, search, statusFilter]);

  const filteredTransactions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return transactions;
    return transactions.filter(
      (row) =>
        String(row.applicant_name || "").toLowerCase().includes(needle) ||
        String(row.payment_id || "").toLowerCase().includes(needle) ||
        String(row.reference_number || "").toLowerCase().includes(needle)
    );
  }, [transactions, search]);

  const totalApplicantPages = Math.max(1, Math.ceil(filteredApplicants.length / PAGE_SIZE));
  const paginatedApplicants = useMemo(() => {
    const start = (applicantsPage - 1) * PAGE_SIZE;
    return filteredApplicants.slice(start, start + PAGE_SIZE);
  }, [filteredApplicants, applicantsPage]);

  const totalTransactionPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const paginatedTransactions = useMemo(() => {
    const start = (transactionsPage - 1) * PAGE_SIZE;
    return filteredTransactions.slice(start, start + PAGE_SIZE);
  }, [filteredTransactions, transactionsPage]);

  useEffect(() => setApplicantsPage(1), [search, statusFilter]);
  useEffect(() => setTransactionsPage(1), [search]);

  const openModal = (applicant, paymentType = "MEMBERSHIP_FEE") => {
    setSelectedApplicant(applicant);
    setSelectedPaymentType(paymentType);
    setAmountInput(String(PAYMENT_TYPE_META[paymentType].defaultAmount));
    setPaymentMethod("cash");
    setReferenceNumber("");
    setNotes("");
    setSubmitError("");
    setShowModal(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setShowModal(false);
    setSelectedApplicant(null);
  };

  const handlePaymentTypeChange = (nextType) => {
    setSelectedPaymentType(nextType);
    setAmountInput(String(PAYMENT_TYPE_META[nextType].defaultAmount));
  };

  const handleSubmitPayment = async () => {
    if (!selectedApplicant) return;
    const meta = PAYMENT_TYPE_META[selectedPaymentType];
    const amount = Number(amountInput || 0);
    if (!(amount > 0)) {
      setSubmitError("Amount must be greater than zero.");
      return;
    }
    if (amount < meta.minAmount) {
      setSubmitError(`${meta.label} must be at least ₱${meta.minAmount.toLocaleString()}.`);
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const { data: { user } = {} } = (await supabase.auth.getUser()) || {};
      const body = {
        application_id: selectedApplicant.application_id,
        payment_type: selectedPaymentType,
        amount,
        payment_method: paymentMethod,
        reference_number: referenceNumber.trim() || null,
        processed_by: user?.id || null,
        processed_by_name: user?.email || null,
        notes: notes.trim() || null,
      };
      const res = await fetch(`${API_BASE_URL}/api/cashier/membership-payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.message || "Failed to record payment.");
      }
      addNotification(
        `${meta.label} recorded for ${selectedApplicant.full_name}. Receipt: ${payload?.data?.payment_id}`,
        "success",
        5000
      );
      setShowModal(false);
      setSelectedApplicant(null);
      await fetchAll();
    } catch (err) {
      setSubmitError(err?.message || "Unable to record payment.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusBadge = (paid) =>
    paid ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 text-[#1D6021] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
        <CheckCircle2 size={12} /> Paid
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
        <AlertCircle size={12} /> Unpaid
      </span>
    );

  const renderPaidUpBadge = (paid, amount, satisfied) =>
    paid && satisfied ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 text-[#1D6021] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
        <CheckCircle2 size={12} /> Paid {amount ? `(${formatCurrency(amount)})` : ""}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
        <AlertCircle size={12} /> Unpaid
      </span>
    );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className="fixed left-0 top-0 h-screen bg-white w-64 p-4 flex flex-col border-r border-gray-200 overflow-y-auto z-50">
              <div className="flex flex-row items-start gap-2 mb-6">
                <img src={logo} alt="Logo" className="h-12 w-auto" />
                <div className="flex flex-col">
                  <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
                  <PortalSidebarIdentity
                    className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold"
                    fallbackPortal="Cashier Portal"
                    fallbackRole="Cashier"
                  />
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
                          className="flex items-center justify-between p-2 rounded-md text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors w-full"
                        >
                          <div className="flex items-center gap-3">
                            <Icon size={20} />
                            <span>{item.name}</span>
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
                                      ? "text-green-700 font-semibold"
                                      : "text-gray-500 hover:text-green-700 hover:bg-green-50"
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
      
      {/* MAIN */}
     <div className="flex-1 flex flex-col h-screen overflow-y-auto ml-64">
             <div className="flex-1 flex flex-col min-w-0">
       <header className="bg-white h-16 border-b border-gray-100 flex items-center justify-between px-8 shrink-0 ">
         
         
         
     
         {/* Right Side: Grouped Utilities */}
         <div className="flex items-center space-x-4 ml-auto">
           
           {/* Search Input */}
           <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
             <input
               type="text"
               placeholder="Search..."
               className="bg-gray-50 w-60 h-10 rounded-lg border border-gray-200 px-4 pl-9 py-1 focus:outline-none focus:ring-2 focus:ring-[#00A859] focus:border-transparent transition-all placeholder-gray-400 text-sm"
             />
           </div>
     
           {/* Notifications */}
           <button className="relative p-2 rounded-full text-gray-500 hover:bg-gray-50 transition-colors">
             <Bell className="w-5 h-5" />
             {/* Adjusted badge alignment so it sits perfectly on the shoulder of the bell */}
             <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
           </button>
     
           {/* Profile Divider (Optional but adds a premium touch) */}
           <span className="h-6 w-px bg-gray-200"></span>
     
           {/* User Identity Group */}
           <div className="flex items-center space-x-3">
             <img
               src="/img/bookkeeper-profile.png"
               alt="Profile"
               className="w-9 h-9 rounded-full object-cover border border-gray-100 bg-gray-50"
             />
             <PortalTopbarIdentity className="text-sm font-semibold text-green-600" fallbackRole="Cashier" />
           </div>
     
         </div>
       </header>
     </div>
     
        <main className="p-8 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-[#1F3E35]">Membership Payments</h1>
              <p className="text-sm text-gray-500 mt-1">
                Collect the ₱{MEMBERSHIP_FEE.toLocaleString()} Membership Fee and the
                ₱{PAID_UP_REQUIRED.toLocaleString()} Initial Paid-Up Capital from new applicants.
                Both are required before the BOD can finalize approval.
              </p>
            </div>
            <button
              onClick={fetchAll}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : null}
              Refresh
            </button>
          </div>

          {!!loadError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab("applicants")}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === "applicants"
                  ? "bg-[#1D6021] text-white"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              Applicants ({filteredApplicants.length})
            </button>
            <button
              onClick={() => setActiveTab("transactions")}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === "transactions"
                  ? "bg-[#1D6021] text-white"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              Transactions ({filteredTransactions.length})
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative max-w-md flex-1">
              <UserSearch className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  activeTab === "applicants"
                    ? "Search by applicant name, email, or application ID"
                    : "Search by name, payment ID, or reference number"
                }
                className="w-full rounded-lg border border-gray-300 bg-gray-50 h-11 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#389734]"
              />
            </div>
            {activeTab === "applicants" && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#389734]"
              >
                <option value="all">All Applicants</option>
                <option value="unpaid">Unpaid Only</option>
                <option value="paid">Paid Only</option>
              </select>
            )}
          </div>

          {/* APPLICANTS TABLE */}
          {activeTab === "applicants" && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Applicant</th>
                    <th className="p-5 font-bold">Contact</th>
                    <th className="p-5 font-bold">Status</th>
                    <th className="p-5 font-bold">Membership Fee</th>
                    <th className="p-5 font-bold">Paid-Up Capital</th>
                    <th className="p-5 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedApplicants.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-5 text-sm text-center text-gray-500 font-medium">
                        {loading
                          ? "Loading eligible applicants..."
                          : "No applicants match the current filter."}
                      </td>
                    </tr>
                  )}
                  {paginatedApplicants.map((row) => (
                    <tr key={row.application_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="p-5">
                        <div className="text-sm font-bold text-gray-900">{row.full_name}</div>
                        <div className="text-[11px] text-gray-500">{row.application_id}</div>
                      </td>
                      <td className="p-5 text-sm text-gray-700">
                        <div>{row.email || "—"}</div>
                        <div className="text-[11px] text-gray-500">{row.contact_number || "—"}</div>
                      </td>
                      <td className="p-5 text-sm">
                        <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
                          {row.application_status || "Pending"}
                        </span>
                      </td>
                      <td className="p-5">{renderStatusBadge(row.membership_fee_paid)}</td>
                      <td className="p-5">
                        {renderPaidUpBadge(
                          row.paid_up_capital_paid,
                          row.paid_up_capital_amount,
                          row.paid_up_capital_satisfied
                        )}
                      </td>
                      <td className="p-5 text-center">
                        <div className="flex flex-col gap-1.5 items-center">
                          {row.membership_fee_paid ? (
                            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                              Fee Paid
                            </span>
                          ) : (
                            <button
                              onClick={() => openModal(row, "MEMBERSHIP_FEE")}
                              className="inline-flex items-center gap-1.5 rounded-md bg-[#1D6021] text-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider hover:bg-[#164a18] transition-colors w-full justify-center"
                            >
                              <Banknote size={12} /> Record Fee
                            </button>
                          )}
                          {row.paid_up_capital_paid ? (
                            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                              Paid-Up Recorded
                            </span>
                          ) : (
                            <button
                              onClick={() => openModal(row, "INITIAL_PAID_UP_CAPITAL")}
                              className="inline-flex items-center gap-1.5 rounded-md bg-[#0D4F8B] text-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider hover:bg-[#0a3f70] transition-colors w-full justify-center"
                            >
                              <Banknote size={12} /> Record Paid-Up
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalApplicantPages > 1 && (
                <Pagination
                  page={applicantsPage}
                  totalPages={totalApplicantPages}
                  onChange={setApplicantsPage}
                />
              )}
            </div>
          )}

          {/* TRANSACTIONS TABLE */}
          {activeTab === "transactions" && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Payment ID</th>
                    <th className="p-5 font-bold">Applicant</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold">Method</th>
                    <th className="p-5 font-bold">Reference</th>
                    <th className="p-5 font-bold">Status</th>
                    <th className="p-5 font-bold">Processed By</th>
                    <th className="p-5 font-bold">Payment Date</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTransactions.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-5 text-sm text-center text-gray-500 font-medium">
                        {loading ? "Loading transactions..." : "No transactions recorded yet."}
                      </td>
                    </tr>
                  )}
                  {paginatedTransactions.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="p-5 text-sm font-mono font-semibold text-gray-900">
                        {row.payment_id}
                      </td>
                      <td className="p-5 text-sm text-gray-700">{row.applicant_name}</td>
                      <td className="p-5 text-sm font-bold text-[#1D6021] text-right">
                        {formatCurrency(row.amount)}
                      </td>
                      <td className="p-5 text-sm text-gray-700 capitalize">
                        {(row.payment_method || "").replace("_", " ")}
                      </td>
                      <td className="p-5 text-sm text-gray-700">
                        {row.reference_number || "—"}
                      </td>
                      <td className="p-5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                            row.payment_status === "paid"
                              ? "bg-green-50 text-[#1D6021]"
                              : row.payment_status === "voided"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {row.payment_status}
                        </span>
                      </td>
                      <td className="p-5 text-sm text-gray-700">
                        {row.processed_by_name || "—"}
                      </td>
                      <td className="p-5 text-sm text-gray-700">
                        {formatDateTime(row.payment_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalTransactionPages > 1 && (
                <Pagination
                  page={transactionsPage}
                  totalPages={totalTransactionPages}
                  onChange={setTransactionsPage}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* RECORD PAYMENT MODAL */}
      {showModal && selectedApplicant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={closeModal}
              disabled={submitting}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Record {PAYMENT_TYPE_META[selectedPaymentType].label}
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              Recording payment for{" "}
              <span className="font-bold text-gray-900">{selectedApplicant.full_name}</span>.
            </p>

            <div className="bg-gray-50 rounded-lg p-3 mb-5 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Application ID</span>
                <span className="font-mono font-semibold text-gray-700">
                  {selectedApplicant.application_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className="font-semibold text-gray-700">
                  {selectedApplicant.application_status}
                </span>
              </div>
            </div>

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Payment Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedPaymentType}
                  onChange={(e) => handlePaymentTypeChange(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#389734]"
                >
                  <option value="MEMBERSHIP_FEE">Membership Fee (₱{MEMBERSHIP_FEE})</option>
                  <option value="INITIAL_PAID_UP_CAPITAL">
                    Initial Paid-Up Capital (₱{PAID_UP_REQUIRED.toLocaleString()})
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Amount (₱) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={PAYMENT_TYPE_META[selectedPaymentType].minAmount}
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#389734]"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Minimum: ₱
                  {PAYMENT_TYPE_META[selectedPaymentType].minAmount.toLocaleString()}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Payment Method <span className="text-red-500">*</span>
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#389734]"
                >
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="check">Check</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Reference Number{" "}
                  <span className="text-gray-400 font-normal lowercase">(optional)</span>
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g., OR-001234, GCash ref"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#389734]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Notes <span className="text-gray-400 font-normal lowercase">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#389734]"
                />
              </div>
            </div>

            {submitError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitPayment}
                disabled={submitting}
                className="px-5 py-2 rounded-lg bg-[#1D6021] hover:bg-[#164a18] text-white font-bold text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {submitting ? "Recording..." : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Pagination = ({ page, totalPages, onChange }) => (
  <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
    <button
      onClick={() => onChange(Math.max(1, page - 1))}
      disabled={page === 1}
      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      <ChevronLeft size={14} /> Previous
    </button>
    <span className="text-sm text-gray-600">
      Page <span className="font-semibold">{page}</span> of{" "}
      <span className="font-semibold">{totalPages}</span>
    </span>
    <button
      onClick={() => onChange(Math.min(totalPages, page + 1))}
      disabled={page === totalPages}
      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      Next <ChevronRight size={14} />
    </button>
  </div>
);

export default Cashier_MembershipPayments;
