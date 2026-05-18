import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import {
  LayoutDashboard,
  Search,
  Bell,
  Banknote,
  ChevronDown,
  ChevronRight,
  Filter,
  Download,
  CheckCircle,
} from "lucide-react";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 10;

const PAYMENT_TYPES = [
  { value: "membership_fee", label: "Membership Fee (₱100)", amount: 100 },
  { value: "paid_up_capital", label: "Initial Paid-Up Capital (₱10,000)", amount: 10000 },
];

const PAYMENT_METHODS = ["Cash", "GCash", "Bank Transfer"];

const STATUS_OPTIONS = [
  { value: "validated", label: "Validated" },
  { value: "pending_verification", label: "Pending" },
  { value: "rejected", label: "Rejected" },
];

const Cashier_Membership_Payments = () => {
  const { signOut, session } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [isDepositsOpen, setIsDepositsOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [members, setMembers] = useState([]);
  const [applicants, setApplicants] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [memberPage, setMemberPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedPaymentType, setSelectedPaymentType] = useState(PAYMENT_TYPES[0]);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [paymentStatus, setPaymentStatus] = useState("validated");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [formError, setFormError] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/Cashier_Dashboard" },
    { name: "Payments", icon: Banknote, path: "/Cashier_Payments" },
    { name: "Membership Payments", icon: Banknote, path: "/Cashier_Membership_Payments" },
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
    { name: "Grocery", icon: Banknote, path: "/Cashier_Grocery" },
  ];

  const formatCurrency = (value) =>
    `₱${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const formatDate = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  };

  const getStatusStyle = (status) => {
    switch (String(status || "").toLowerCase()) {
      case "validated":
        return "bg-green-50 text-green-600";
      case "pending_verification":
        return "bg-orange-50 text-orange-600";
      case "rejected":
        return "bg-red-50 text-red-600";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const filteredMembers = useMemo(() => {
    const key = String(memberSearch || "").trim().toLowerCase();
    if (!key) return applicants;
    return applicants.filter((row) =>
      String(row.member_id || "").toLowerCase().includes(key) ||
      String(row.member_name || "").toLowerCase().includes(key)
    );
  }, [memberSearch, applicants]);

  const totalMemberPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const paginatedMembers = useMemo(() => {
    const start = (memberPage - 1) * PAGE_SIZE;
    return filteredMembers.slice(start, start + PAGE_SIZE);
  }, [filteredMembers, memberPage]);

  const filteredPayments = useMemo(() => {
    const key = String(paymentSearch || "").trim().toLowerCase();
    return payments.filter((row) => {
      if (statusFilter !== "all" && String(row.payment_status || "").toLowerCase() !== statusFilter) {
        return false;
      }
      if (typeFilter !== "all" && String(row.payment_type || "").toLowerCase() !== typeFilter) {
        return false;
      }
      if (!key) return true;
      return [
        row.payment_id,
        row.member_id,
        row.member_name,
        row.reference_number,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(key));
    });
  }, [payments, paymentSearch, statusFilter, typeFilter]);

  const totalPaymentPages = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
  const paginatedPayments = useMemo(() => {
    const start = (paymentPage - 1) * PAGE_SIZE;
    return filteredPayments.slice(start, start + PAGE_SIZE);
  }, [filteredPayments, paymentPage]);

  useEffect(() => {
    setMemberPage(1);
  }, [memberSearch, applicants]);

  useEffect(() => {
    setPaymentPage(1);
  }, [payments, paymentSearch, statusFilter, typeFilter]);

  useEffect(() => {
    if (memberPage > totalMemberPages) {
      setMemberPage(totalMemberPages);
    }
  }, [memberPage, totalMemberPages]);

  useEffect(() => {
    if (paymentPage > totalPaymentPages) {
      setPaymentPage(totalPaymentPages);
    }
  }, [paymentPage, totalPaymentPages]);

  const fetchMembershipData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [membersRes, paymentsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/cashier/membership-payments/members`, {
          method: "GET",
          headers: { Accept: "application/json" },
        }),
        fetch(`${API_BASE_URL}/api/cashier/membership-payments/transactions`, {
          method: "GET",
          headers: { Accept: "application/json" },
        }),
      ]);

      const membersPayload = await membersRes.json().catch(() => ({}));
      const paymentsPayload = await paymentsRes.json().catch(() => ({}));

      if (!membersRes.ok || !membersPayload?.success) {
        throw new Error(membersPayload?.detail || "Failed to load members.");
      }
      if (!paymentsRes.ok || !paymentsPayload?.success) {
        throw new Error(paymentsPayload?.detail || "Failed to load membership payments.");
      }

      setMembers(Array.isArray(membersPayload.data?.members) ? membersPayload.data.members : []);
      setApplicants(Array.isArray(membersPayload.data?.applicants) ? membersPayload.data.applicants : []);
      setPayments(Array.isArray(paymentsPayload.data) ? paymentsPayload.data : []);
    } catch (error) {
      setLoadError(error.message || "Unable to load membership payment data.");
      setMembers([]);
      setApplicants([]);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembershipData();
  }, []);

  const openPaymentModal = (member) => {
    setSelectedMember(member);
    setSelectedPaymentType(PAYMENT_TYPES[0]);
    setPaymentMethod(PAYMENT_METHODS[0]);
    setPaymentStatus("validated");
    setReferenceNumber("");
    setPaymentDate("");
    setFormError("");
    setFeedbackMessage("");
    setIsPaymentModalOpen(true);
  };

  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setSelectedMember(null);
    setFormError("");
  };

  const handleSubmitPayment = async (event) => {
    event.preventDefault();
    if (!selectedMember) return;

    const memberCode = selectedMember.member_id || selectedMember.application_id;
    const memberId = selectedMember.member_uuid || null;

    if (!memberCode) {
      setFormError("Member reference is missing.");
      return;
    }

    const payload = {
      member_id: memberId,
      member_code: memberCode,
      payment_type: selectedPaymentType.value,
      amount: selectedPaymentType.amount,
      payment_status: paymentStatus,
      payment_method: paymentMethod,
      reference_number: referenceNumber.trim() || null,
      processed_by: session?.user?.email || session?.user?.id || "Cashier",
      processed_by_role: "cashier",
      payment_date: paymentDate || null,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/cashier/membership-payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || "Failed to record membership payment.");
      }

      setFeedbackMessage("Membership payment recorded successfully.");
      addNotification?.("Payment recorded successfully.", "success");
      closePaymentModal();
      await fetchMembershipData();
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
      {/* SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0">
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
                                ? "text-[#5CBA47] font-semibold"
                                : "text-gray-500 hover:text-[#5CBA47] hover:bg-green-50"
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
                      ? "bg-green-50 text-[#5CBA47] font-semibold"
                      : "text-gray-700 hover:bg-green-50 hover:text-[#5CBA47]"
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

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 pl-9 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img
            src="/img/bookkeeper-profile.png"
            alt="Profile"
            className="ml-4 w-8 h-8 rounded-full bg-gray-200 object-cover"
          />
          <PortalTopbarIdentity className="font-medium text-sm text-gray-700 ml-2" fallbackRole="Cashier" />
        </header>

        <main className="p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Membership Payments</h1>
              <p className="text-sm text-gray-500">Record payments for new applicants only</p>
            </div>
            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
                <Filter className="w-4 h-4" /> Filter
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-[#2C7A3F] hover:bg-[#236332] text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
                <Download className="w-4 h-4" /> Export
              </button>
            </div>
          </div>

          {loadError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {feedbackMessage && (
            <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {feedbackMessage}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">New Applicants</h2>
                  <p className="text-xs text-gray-500">Select an applicant to record a payment</p>
                </div>
                <span className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-1 rounded-lg">
                  Applicants Only
                </span>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search by name or ID"
                    className="w-full h-10 rounded-lg border border-gray-200 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-gray-500 border-b">
                      <th className="py-3 px-2">Member ID</th>
                      <th className="py-3 px-2">Member Name</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedMembers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-sm text-gray-400">
                          {loading ? "Loading members..." : "No members found."}
                        </td>
                      </tr>
                    )}
                    {paginatedMembers.map((member) => (
                      <tr key={member.member_id} className="border-b last:border-0">
                        <td className="py-3 px-2 text-sm text-gray-600">{member.member_id}</td>
                        <td className="py-3 px-2 text-sm font-semibold text-gray-800">{member.member_name}</td>
                        <td className="py-3 px-2">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-600">
                            {member.application_status || "Pending"}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <button
                            onClick={() => openPaymentModal(member)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-green-700 hover:underline"
                          >
                            <CheckCircle className="w-4 h-4" /> Record Payment
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
                <span>Page {memberPage} of {totalMemberPages}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMemberPage((prev) => Math.max(1, prev - 1))}
                    className="px-2 py-1 border rounded text-gray-600 hover:bg-gray-50"
                    disabled={memberPage <= 1}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setMemberPage((prev) => Math.min(totalMemberPages, prev + 1))}
                    className="px-2 py-1 border rounded text-gray-600 hover:bg-gray-50"
                    disabled={memberPage >= totalMemberPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Membership Payment Records</h2>
                  <p className="text-xs text-gray-500">Latest transactions and status</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600"
                  >
                    <option value="all">All Types</option>
                    <option value="membership_fee">Membership Fee</option>
                    <option value="paid_up_capital">Paid-Up Capital</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600"
                  >
                    <option value="all">All Status</option>
                    <option value="validated">Validated</option>
                    <option value="pending_verification">Pending</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                    placeholder="Search payments"
                    className="w-full h-10 rounded-lg border border-gray-200 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-gray-500 border-b">
                      <th className="py-3 px-2">Payment ID</th>
                      <th className="py-3 px-2">Member</th>
                      <th className="py-3 px-2">Type</th>
                      <th className="py-3 px-2">Amount</th>
                      <th className="py-3 px-2">Method</th>
                      <th className="py-3 px-2">Reference</th>
                      <th className="py-3 px-2">Cashier</th>
                      <th className="py-3 px-2">Date</th>
                      <th className="py-3 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPayments.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-6 text-center text-sm text-gray-400">
                          {loading ? "Loading payments..." : "No payments found."}
                        </td>
                      </tr>
                    )}
                    {paginatedPayments.map((payment) => (
                      <tr key={payment.payment_id} className="border-b last:border-0">
                        <td className="py-3 px-2 text-xs text-gray-500">{payment.payment_id}</td>
                        <td className="py-3 px-2">
                          <p className="text-sm font-semibold text-gray-800">{payment.member_name}</p>
                          <p className="text-xs text-gray-500">{payment.member_id}</p>
                        </td>
                        <td className="py-3 px-2 text-xs text-gray-600">
                          {payment.payment_type === "paid_up_capital" ? "Paid-Up Capital" : "Membership Fee"}
                        </td>
                        <td className="py-3 px-2 text-sm font-semibold text-gray-800">
                          {formatCurrency(payment.amount)}
                        </td>
                        <td className="py-3 px-2 text-xs text-gray-600">{payment.payment_method || "Cash"}</td>
                        <td className="py-3 px-2 text-xs text-gray-500">{payment.reference_number || "-"}</td>
                        <td className="py-3 px-2 text-xs text-gray-600">{payment.processed_by || "Cashier"}</td>
                        <td className="py-3 px-2 text-xs text-gray-600">{formatDate(payment.payment_date)}</td>
                        <td className="py-3 px-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${getStatusStyle(payment.payment_status)}`}>
                            {String(payment.payment_status || "").replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
                <span>Page {paymentPage} of {totalPaymentPages}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPaymentPage((prev) => Math.max(1, prev - 1))}
                    className="px-2 py-1 border rounded text-gray-600 hover:bg-gray-50"
                    disabled={paymentPage <= 1}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPaymentPage((prev) => Math.min(totalPaymentPages, prev + 1))}
                    className="px-2 py-1 border rounded text-gray-600 hover:bg-gray-50"
                    disabled={paymentPage >= totalPaymentPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Recent Membership Payments</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {payments.slice(0, 3).map((payment) => (
                <div key={payment.payment_id} className="border border-gray-100 rounded-lg p-4">
                  <p className="text-xs text-gray-500">{payment.payment_id}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-1">{payment.member_name}</p>
                  <p className="text-xs text-gray-500">{payment.member_id}</p>
                  <p className="text-sm font-bold text-gray-800 mt-2">{formatCurrency(payment.amount)}</p>
                  <p className="text-xs text-gray-500">{formatDate(payment.payment_date)}</p>
                </div>
              ))}
              {payments.length === 0 && (
                <div className="text-sm text-gray-400">No recent payments.</div>
              )}
            </div>
          </div>
        </main>
      </div>

      {isPaymentModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={closePaymentModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>

            <h3 className="text-xl font-bold text-gray-900 mb-2">Record Membership Payment</h3>
            <p className="text-sm text-gray-600 mb-6">
              {selectedMember.member_name} • {selectedMember.member_id}
            </p>

            {formError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Payment Type
                </label>
                <select
                  value={selectedPaymentType.value}
                  onChange={(e) => {
                    const nextType = PAYMENT_TYPES.find((item) => item.value === e.target.value) || PAYMENT_TYPES[0];
                    setSelectedPaymentType(nextType);
                  }}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
                >
                  {PAYMENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Amount
                </label>
                <input
                  type="text"
                  value={formatCurrency(selectedPaymentType.amount)}
                  readOnly
                  className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Reference Number
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Enter receipt/reference"
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closePaymentModal}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#1a4a2f] text-white text-sm font-semibold hover:bg-[#123622]"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cashier_Membership_Payments;
