import React, { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
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
  ArrowLeft,
  Wallet,
  Briefcase,
  Coins,
  PiggyBank,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Brain,
  RefreshCw,
  X,
} from "lucide-react";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const getStatusStyle = (status) => {
  const key = String(status || "").toLowerCase();
  if (key.includes("validated") || key.includes("fully")) return "bg-green-100 text-green-700";
  if (key.includes("partial")) return "bg-amber-100 text-amber-700";
  if (key.includes("rejected")) return "bg-red-100 text-red-700";
  if (key.includes("upcoming")) return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-700";
};

const LoanLedger = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { loanId } = useParams();
  const isManagerView = location.state?.readOnly === true;
  const [isSavingsOpen, setIsSavingsOpen] = useState(false);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Manage Member", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: Briefcase },
      { name: "Delinquency", icon: ShieldAlert },
      { name: "Credit Risk", icon: Brain },
    { name: "Payments", icon: Wallet },
    {
      name: "Savings Accounts",
      icon: PiggyBank,
      isDropdown: true,
      subItems: [
        { name: "All Accounts", path: "/bookkeeper-savings-accounts" },
        { name: "Savings Withdrawals", path: "/bookkeeper-savings-transactions" },
      ],
    },
    { name: "Accounting", icon: Calculator },
    { name: "MIGS Scoring", icon: Activity },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Trail", icon: History },
    { name: "Grocery", icon: Coins },
    { name: "Legacy Member Validation", icon: Search },
  ];

  const routeMap = {
    Dashboard: "/dashboard",
    "Manage Member": "/manage-member",
    "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans": "/manage-loans",
    Delinquency: "/delinquency",
    "Credit Risk": "/bookkeeper-credit-risk",
    Payments: "/payments",
    "Savings Withdrawals": "/bookkeeper-savings-transactions",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
    Grocery: "/grocery",
    "Legacy Member Validation": "/legacy-member-validation",
  };

  const initialLoan = location.state?.loan || {
    loan_id: loanId,
    member_name: "",
    member_type: "",
    loan_type: "",
    loan_amount: 0,
    interest_rate: 0,
    term_months: 0,
    amortization: 0,
    remaining_balance: 0,
    due_date: "",
    status: "",
    payment_history: [],
  };

  const [selectedLoan, setSelectedLoan] = useState(initialLoan);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Restructure modal state
  const [showRestructure, setShowRestructure] = useState(false);
  const [newTerm, setNewTerm] = useState("");
  const [restructuring, setRestructuring] = useState(false);
  const [restructureError, setRestructureError] = useState("");
  const [restructureSubmitted, setRestructureSubmitted] = useState(false);

  // Manager-side: pending restructure request for this loan
  const [pendingRequest, setPendingRequest] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewDone, setReviewDone] = useState("");

  useEffect(() => {
    if (!isManagerView || !loanId) return;
    fetch(`${API_BASE_URL}/api/manager/restructure-requests/${encodeURIComponent(loanId)}`)
      .then((r) => r.json())
      .then((res) => { if (res?.success) setPendingRequest(res.data || null); })
      .catch(() => {});
  }, [isManagerView, loanId]);

  const handleReview = async (action) => {
    if (!pendingRequest?.id) return;
    setReviewLoading(true);
    setReviewError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/manager/restructure-requests/${pendingRequest.id}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reviewed_by: "Manager" }),
        }
      );
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.detail || "Action failed.");
      setReviewDone(action);
      setPendingRequest(null);
      if (action === "approved") {
        setSelectedLoan((prev) => ({
          ...prev,
          term_months: result.new_term_months,
          amortization: result.new_amortization,
        }));
      }
    } catch (err) {
      setReviewError(err.message || "Action failed.");
    } finally {
      setReviewLoading(false);
    }
  };

  const previewAmortization = (() => {
    const term = parseInt(newTerm, 10);
    if (!term || term <= 0 || !selectedLoan.loan_amount) return null;
    const principal = Number(selectedLoan.loan_amount);
    const rateRaw = Number(selectedLoan.interest_rate || 0);
    const monthlyRate = rateRaw / 100;
    const loanType = String(selectedLoan.loan_type || "").toLowerCase();
    if (loanType.includes("emergency")) {
      const principalComponent = principal / term;
      const endingBalance = principal - principalComponent;
      return principalComponent + endingBalance * monthlyRate;
    }
    return (principal * (1 + monthlyRate * term)) / term;
  })();

  const handleRestructure = async () => {
    const term = parseInt(newTerm, 10);
    if (!term || term <= 0) {
      setRestructureError("Enter a valid number of months.");
      return;
    }
    if (previewAmortization === null || previewAmortization <= 0) {
      setRestructureError("Unable to compute new amortization.");
      return;
    }
    setRestructuring(true);
    setRestructureError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/bookkeeper/loan-ledger/${encodeURIComponent(loanId)}/restructure-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            new_term_months: term,
            new_amortization: previewAmortization,
            requested_by: "Bookkeeper",
          }),
        }
      );
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || "Failed to submit request.");
      }
      setRestructureSubmitted(true);
      setShowRestructure(false);
      setNewTerm("");
    } catch (err) {
      setRestructureError(err.message || "Failed to submit request.");
    } finally {
      setRestructuring(false);
    }
  };

  useEffect(() => {
    async function fetchLedger() {
      if (!loanId) return;

      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/bookkeeper/loan-ledger/${encodeURIComponent(loanId)}`);
        const result = await response.json();
        if (!response.ok || !result?.success) {
          throw new Error(result?.detail || "Failed to load loan ledger.");
        }
        setSelectedLoan(result.data);
      } catch (error) {
        setLoadError(error?.message || "Unable to load live ledger data.");
      } finally {
        setLoading(false);
      }
    }

    fetchLedger();
  }, [loanId]);

  const handleSignOut = async (event) => {
    event.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-primary">TTMPC</h1>
            <PortalSidebarIdentity
              className="text-xs uppercase tracking-wider text-gray-500 font-semibold"
              fallbackPortal="Bookkeeper Portal"
              fallbackRole="Bookkeeper"
            />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
            if (item.isDropdown) {
              return (
                <div key={item.name} className="flex flex-col">
                  <button
                    onClick={() => setIsSavingsOpen(!isSavingsOpen)}
                    className="flex items-center justify-between p-2 rounded-md text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors w-full"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={20} />
                      <span>{item.name}</span>
                    </div>
                    {isSavingsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {isSavingsOpen && (
                    <div className="flex flex-col mt-1 space-y-1">
                      {item.subItems.map((subItem) => (
                        <NavLink
                          key={subItem.name}
                          to={subItem.path}
                          className={({ isActive }) =>
                            `block pl-11 pr-4 py-2 rounded-md transition-colors text-[13px] ${
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
          <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 pl-9 focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Search..."
                    />
                  </div>
                  <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
                  </button>
                  <img
                    src="/img/bookkeeper-profile.png"
                    alt="Profile"
                    className="ml-4 w-8 h-8 rounded-full bg-gray-200"
                  />
                  <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
                </header>

        <main className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-bold text-2xl text-gray-800">Loan Ledger</h1>
              <p className="text-sm text-gray-500 mt-1">{selectedLoan.loan_id} • {selectedLoan.member_name}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft size={16} /> Back
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 mb-5 shadow-sm">
            {loading && (
              <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Syncing ledger data from server...
              </div>
            )}

            {!!loadError && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {loadError}
              </div>
            )}

            {restructureSubmitted && (
              <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Restructure request sent to Manager for approval. The loan will be updated once approved.
              </div>
            )}

            {/* Manager: pending restructure request notice + approve/reject */}
            {isManagerView && pendingRequest && !reviewDone && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Restructure Request — Pending Approval</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Bookkeeper requests changing term to{" "}
                      <span className="font-bold">{pendingRequest.new_term_months} months</span>
                      {" "}with new amortization of{" "}
                      <span className="font-bold">{formatCurrency(pendingRequest.new_amortization)}</span>.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {reviewError && <span className="text-xs text-red-600">{reviewError}</span>}
                    <button
                      type="button"
                      disabled={reviewLoading}
                      onClick={() => handleReview("rejected")}
                      className="px-3 py-1.5 rounded-lg border border-red-300 bg-white text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      {reviewLoading ? "..." : "Reject"}
                    </button>
                    <button
                      type="button"
                      disabled={reviewLoading}
                      onClick={() => handleReview("approved")}
                      className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      {reviewLoading ? "Saving..." : "Approve"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isManagerView && reviewDone && (
              <div className={`mb-3 rounded-md border px-3 py-2 text-xs font-semibold ${reviewDone === "approved" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                Restructure request {reviewDone === "approved" ? "approved — loan updated." : "rejected."}
              </div>
            )}

            <div className="flex items-center justify-between w-full mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Loan Summary</h2>
              {!isManagerView && (
                <button
                  type="button"
                  onClick={() => { setNewTerm(String(selectedLoan.term_months || "")); setRestructureError(""); setRestructureSubmitted(false); setShowRestructure(true); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  <RefreshCw size={13} /> Restructure Loan
                </button>
              )}
            </div>
                        
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
              <p><span className="font-semibold">Member Name:</span> {selectedLoan.member_name}</p>
              <p><span className="font-semibold">Member Type:</span> {selectedLoan.member_type}</p>
              <p><span className="font-semibold">Loan Type:</span> {selectedLoan.loan_type}</p>
              <p><span className="font-semibold">Loan Amount:</span> {formatCurrency(selectedLoan.loan_amount)}</p>
              <p><span className="font-semibold">Interest:</span> {selectedLoan.interest_rate}%</p>
              <p><span className="font-semibold">Term:</span> {selectedLoan.term_months} months</p>
              <p><span className="font-semibold">Amortization:</span> {formatCurrency(selectedLoan.amortization)}</p>
              <p><span className="font-semibold">Remaining Balance:</span> {formatCurrency(selectedLoan.remaining_balance)}</p>
              <p><span className="font-semibold">Due Date:</span> {selectedLoan.due_date}</p>
              <p>
                <span className="font-semibold">Status:</span>{" "}
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(selectedLoan.status)}`}>
                  {selectedLoan.status}
                </span>
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Reference No.</th>
                  <th className="px-4 py-3 text-left font-semibold">Payment Amount</th>
                  <th className="px-4 py-3 text-left font-semibold">Penalty</th>
                  <th className="px-4 py-3 text-left font-semibold">Remaining After Payment</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedLoan.payment_history.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No ledger entries yet.
                    </td>
                  </tr>
                )}

                {selectedLoan.payment_history.map((entry) => (
                  <tr key={`${entry.reference_no || entry.payment_id}-${entry.date_paid}`} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-700">{new Date(entry.date_paid).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-gray-700">{entry.reference_no || entry.payment_id || "-"}</td>
                    <td className="px-4 py-3 text-gray-700">{formatCurrency(entry.payment_amount || entry.amount_paid)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatCurrency(entry.penalty || entry.penalties)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatCurrency(entry.remaining_after)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(entry.status || entry.confirmation_status)}`}>
                        {entry.status || entry.confirmation_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {showRestructure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-800">Restructure Loan Term</h3>
              <button type="button" onClick={() => setShowRestructure(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Current term: <span className="font-semibold text-gray-700">{selectedLoan.term_months} months</span>
              {" · "}
              Current amortization: <span className="font-semibold text-gray-700">{formatCurrency(selectedLoan.amortization)}</span>
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Term (months)</label>
            <input
              type="number"
              min="1"
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 mb-3"
              placeholder="e.g. 24"
            />
            {previewAmortization !== null && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 mb-3">
                <p className="text-xs text-amber-700 font-medium">New monthly amortization</p>
                <p className="text-lg font-bold text-amber-900">{formatCurrency(previewAmortization)}</p>
              </div>
            )}
            {restructureError && (
              <p className="text-xs text-red-600 mb-3">{restructureError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowRestructure(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestructure}
                disabled={restructuring}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {restructuring ? "Submitting..." : "Send to Manager"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanLedger;
