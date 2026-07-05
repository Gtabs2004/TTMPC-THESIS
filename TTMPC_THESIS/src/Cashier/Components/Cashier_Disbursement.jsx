import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
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
  ArrowUpDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
  UserPlus,
  X,
  Hash,
  Calendar,
  User,
  Tag,
  ArrowUpRight,
  Send,
  PiggyBank,
  ArrowDownLeft,
  ShoppingCart,
  Printer
} from "lucide-react";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const toTitleCase = (value) => {
  if (!value) return "-";
  const text = String(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const Cashier_Disbursement = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [isDepositsOpen, setIsDepositsOpen] = useState(true);
  const [readyLoans, setReadyLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [disbursingLoanId, setDisbursingLoanId] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState({ key: "member_name", direction: "asc" });
  const [showFilters, setShowFilters] = useState(false);

  // Pre-disbursement preview state. Holds the loan being released plus the
  // deduction breakdown fetched from /api/loans/compute. Showing this to the
  // cashier before commit is the audit trail for the 2% CBU retention,
  // service fee, insurance, and notarial fee.
  const [previewLoan, setPreviewLoan] = useState(null);
  const [previewDeductions, setPreviewDeductions] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

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

  useEffect(() => {
    fetchReadyLoans();
  }, []);

  const fetchReadyLoans = async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/cashier/disbursements/ready-loans`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.detail || result?.message || "Failed to fetch ready disbursement loans.");
      }

      setReadyLoans(result?.data || []);
    } catch (error) {
      setErrorMessage(error.message || "Unable to load disbursement loans.");
      setReadyLoans([]);
    } finally {
      setLoading(false);
    }
  };

  // Map the cashier's loan_type label (e.g., "Consolidated Loan") to the
  // lowercase code expected by /api/loans/compute.
  const resolveComputeLoanType = (label) => {
    const normalized = String(label || "").toLowerCase();
    if (normalized.includes("consolidated")) return "consolidated";
    if (normalized.includes("emergency")) return "emergency";
    if (normalized.includes("bonus")) return "bonus";
    return null;
  };

  const openDisbursementPreview = async (loan) => {
    setErrorMessage("");
    setFeedbackMessage("");
    setPreviewLoan(loan);
    setPreviewDeductions(null);
    setPreviewError("");

    const computeType = resolveComputeLoanType(loan.loan_type);
    const principal = Number(loan.principal_amount || loan.loan_amount || 0);
    const term = Number(loan.term_months || loan.term || 0);

    if (!computeType || principal <= 0 || term <= 0) {
      setPreviewError("Unable to compute deductions for this loan (missing type, principal, or term).");
      return;
    }

    setPreviewLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/loans/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          loan_type: computeType,
          principal,
          term_months: term,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.detail || result?.message || "Failed to compute deductions.");
      }
      setPreviewDeductions(result?.data || null);
    } catch (error) {
      setPreviewError(error.message || "Unable to compute deductions.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeDisbursementPreview = () => {
    if (disbursingLoanId) return;
    setPreviewLoan(null);
    setPreviewDeductions(null);
    setPreviewError("");
  };

  const handleDisburseLoan = async (loanId) => {
    setDisbursingLoanId(loanId);
    setErrorMessage("");
    setFeedbackMessage("");

    const cashierUser = session?.user || {};
    const cashierMeta = cashierUser.user_metadata || {};
    const cashierName =
      cashierMeta.full_name ||
      `${cashierMeta.first_name || ""} ${cashierMeta.last_name || ""}`.trim() ||
      cashierUser.email ||
      "Cashier";

    try {
      const response = await fetch(`${API_BASE_URL}/api/cashier/disbursements/${loanId}/disburse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          cashier_id: cashierUser.id || null,
          cashier_name: cashierName,
          cashier_email: cashierUser.email || null,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.detail || result?.message || "Failed to disburse loan.");
      }

      const firstDueDate = result?.data?.first_due_date || "N/A";
      setFeedbackMessage(
        `Loan disbursed. Schedule created with first due date ${firstDueDate}. Grace period is 3 days and delayed flag starts after 1 month.`
      );
      if (result?.data?.confirmation) {
        // Attach the deduction breakdown that the cashier already saw and
        // approved so the post-release receipt shows the same numbers.
        setConfirmation({
          ...result.data.confirmation,
          deductions: previewDeductions || null,
        });
      }
      setPreviewLoan(null);
      setPreviewDeductions(null);
      setPreviewError("");
      await fetchReadyLoans();
    } catch (error) {
      setErrorMessage(error.message || "Disbursement failed.");
    } finally {
      setDisbursingLoanId("");
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

  const loanTypes = useMemo(() => {
    const types = new Set(readyLoans.map((l) => String(l.loan_type || "").toLowerCase()).filter(Boolean));
    return ["all", ...Array.from(types)];
  }, [readyLoans]);

  const filteredAndSortedLoans = useMemo(() => {
    const term = searchTerm.toLowerCase();
    let filtered = readyLoans.filter((loan) => {
      const matchesSearch =
        !term ||
        String(loan.member_name || "").toLowerCase().includes(term) ||
        String(loan.loan_id || "").toLowerCase().includes(term) ||
        String(loan.loan_type || "").toLowerCase().includes(term);

      const matchesType =
        typeFilter === "all" ||
        String(loan.loan_type || "").toLowerCase() === typeFilter;

      return matchesSearch && matchesType;
    });

    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === "principal_amount") {
          aValue = Number(a.principal_amount || a.loan_amount || 0);
          bValue = Number(b.principal_amount || b.loan_amount || 0);
        }

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
        }

        aValue = String(aValue ?? "").toLowerCase();
        bValue = String(bValue ?? "").toLowerCase();
        return sortConfig.direction === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      });
    }

    return filtered;
  }, [readyLoans, searchTerm, typeFilter, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
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
    <div className="flex-1 flex flex-col h-screen overflow-y-auto ml-64">
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

        <main className="p-8 overflow-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Loan Disbursement</h1>
                <p className="text-sm text-gray-500 mt-1">Release approved loans and generate payment schedules</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-600 font-medium">
                  {readyLoans.length} ready for disbursement
                </div>
                <button
                  type="button"
                  onClick={fetchReadyLoans}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>
            </div>

            {loading && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
                <Clock size={16} />
                Loading loans ready for disbursement...
              </div>
            )}

            {feedbackMessage && (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <span>{feedbackMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by member name, loan ID, or loan type..."
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

            {showFilters && (
              <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Loan Type
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {loanTypes.map((type) => (
                        <button
                          key={type}
                          onClick={() => setTypeFilter(type)}
                          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                            typeFilter === type
                              ? "bg-green-600 text-white"
                              : "bg-white border border-gray-300 text-gray-700 hover:border-green-500"
                          }`}
                        >
                          {type === "all" ? "All Types" : toTitleCase(type)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">
                      Loan ID
                    </th>
                    <th className="p-5 font-bold">
                      <button
                        onClick={() => handleSort("member_name")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Member Name
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="p-5 font-bold">
                      <button
                        onClick={() => handleSort("loan_type")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Loan Type
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="p-5 font-bold">
                      <button
                        onClick={() => handleSort("principal_amount")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Principal
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="p-5 font-bold">
                      Interest
                    </th>
                    <th className="p-5 font-bold">
                      <button
                        onClick={() => handleSort("term_months")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Term
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="p-5 font-bold">
                      Status
                    </th>
                    <th className="p-5 font-bold">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedLoans.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-5 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Banknote size={40} className="text-gray-300" />
                          <p className="text-sm text-gray-500">
                            {readyLoans.length === 0
                              ? "No loans are currently ready for disbursement"
                              : "No loans match your search criteria"}
                          </p>
                          <p className="text-xs text-gray-400">
                            Approved loans will appear here once they're ready to disburse
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedLoans.map((loan) => (
                      <tr key={loan.loan_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-xs font-mono text-gray-700">
                          <span className="inline-flex rounded bg-gray-100 px-2 py-1">
                            {String(loan.loan_id).slice(0, 8)}...
                          </span>
                        </td>
                        <td className="p-5 text-sm font-medium text-gray-900">
                          {loan.member_name}
                        </td>
                        <td className="p-5 text-sm text-gray-700">
                          {toTitleCase(loan.loan_type)}
                        </td>
                        <td className="p-5 text-sm text-gray-700 font-semibold">
                          {formatCurrency(loan.principal_amount || loan.loan_amount)}
                        </td>
                        <td className="p-5 text-sm text-gray-700">
                          {Number(loan.interest_rate || 0)}%
                        </td>
                        <td className="p-5 text-sm text-gray-700">
                          {loan.term_months} mo
                        </td>
                        <td className="p-5">
                          <span className="badge-animated inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-700">
                            <CheckCircle2 size={12} />
                            {String(loan.loan_status || "")
                              .split(" ")
                              .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ""))
                              .join(" ")}
                          </span>
                        </td>
                        <td className="p-5">
                          <button
                            type="button"
                            onClick={() => openDisbursementPreview(loan)}
                            disabled={disbursingLoanId === loan.loan_id}
                            className="btn-enhanced rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 transition disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                          >
                            {disbursingLoanId === loan.loan_id ? "Processing..." : "Review & Disburse"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {confirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-6 py-5 bg-gradient-to-r from-[#389734] to-[#66B538] text-white">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-white/20 p-2">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold leading-tight">Disbursement Successful</h2>
                  <p className="text-xs text-white/80 mt-0.5">Loan released and recorded for audit.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="rounded-full p-1 hover:bg-white/15 transition"
                aria-label="Close confirmation"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3">
                <Hash size={18} className="text-green-700" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-green-700 font-semibold">Reference Number</p>
                  <p className="text-sm font-mono font-bold text-green-900 truncate">{confirmation.reference_number}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1"><User size={12} /> Member</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{confirmation.member_name}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1"><Tag size={12} /> Loan Type</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{toTitleCase(confirmation.loan_type)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1"><Banknote size={12} /> Loan Amount</p>
                  <p className="font-bold text-green-700 mt-0.5">{formatCurrency(confirmation.loan_amount)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1"><Calendar size={12} /> Disbursed At</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{new Date(confirmation.disbursed_at).toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Cashier</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{confirmation.cashier_name || "—"}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Loan Status</p>
                  <p className="font-semibold text-[#389734] mt-0.5 capitalize">{confirmation.loan_status}</p>
                </div>
              </div>

              {confirmation.deductions && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold mb-2">
                    Deductions Applied
                  </p>
                  <div className="space-y-1.5 text-xs text-gray-800">
                    <div className="flex justify-between">
                      <span>Service Fee</span>
                      <span className="font-mono font-semibold">
                        {formatCurrency(confirmation.deductions?.deductions?.service_fee)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Capital Build-Up (2%)</span>
                      <span className="font-mono font-semibold text-[#389734]">
                        {formatCurrency(confirmation.deductions?.deductions?.cbu_deduction)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Insurance Fee</span>
                      <span className="font-mono font-semibold">
                        {formatCurrency(confirmation.deductions?.deductions?.insurance_fee)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Notarial Fee</span>
                      <span className="font-mono font-semibold">
                        {formatCurrency(confirmation.deductions?.deductions?.notarial_fee)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-amber-200 pt-1.5 mt-1.5">
                      <span className="font-semibold">Total Deductions</span>
                      <span className="font-mono font-bold">
                        {formatCurrency(confirmation.deductions?.total_deductions)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">Net Proceeds Released</span>
                      <span className="font-mono font-bold text-[#389734]">
                        {formatCurrency(confirmation.deductions?.net_proceeds)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-amber-700">
                    The 2% CBU retention is credited to the member's Capital Build-Up ledger automatically.
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-700">
                Saved to transaction history. Reference this entry for audit, validation, and member ledger reconciliation.
              </div>
            </div>

            <div className="p-5 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
              {/* TODO: PRINT-RECEIPT-OVERLAY · loan disbursement voucher */}
              <button
                type="button"
                onClick={() =>
                  alert(
                    "PRINT-RECEIPT-OVERLAY · Coming soon.\n\nWill render only the variable fields (member, amount, date, reference) onto the cooperative's pre-printed disbursement voucher bond paper."
                  )
                }
                className="rounded-lg border-2 border-dashed border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-semibold px-4 py-2 transition inline-flex items-center gap-2"
                title="PRINT-RECEIPT-OVERLAY · Coming soon"
              >
                <Printer size={16} />
                Print Voucher
                <span className="ml-1 text-[10px] uppercase tracking-wider bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded-full">
                  Soon
                </span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="rounded-lg bg-[#389734] hover:bg-[#2d7c29] text-white text-sm font-semibold px-5 py-2 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {previewLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-6 py-5 bg-gradient-to-r from-[#389734] to-[#66B538] text-white">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-white/20 p-2">
                  <Banknote size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold leading-tight">Review Disbursement</h2>
                  <p className="text-xs text-white/80 mt-0.5">
                    Confirm the deduction breakdown before releasing this loan.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDisbursementPreview}
                disabled={!!disbursingLoanId}
                className="rounded-full p-1 hover:bg-white/15 transition disabled:opacity-40"
                aria-label="Close preview"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Member</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{previewLoan.member_name}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Loan Type</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{toTitleCase(previewLoan.loan_type)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Principal</p>
                  <p className="font-bold text-gray-900 mt-0.5">
                    {formatCurrency(previewLoan.principal_amount || previewLoan.loan_amount)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Term</p>
                  <p className="font-semibold text-gray-900 mt-0.5">
                    {previewLoan.term_months || previewLoan.term || "—"} months
                  </p>
                </div>
              </div>

              {previewLoading && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
                  <Clock size={16} />
                  Computing deductions...
                </div>
              )}

              {previewError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{previewError}</span>
                </div>
              )}

              {previewDeductions && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold mb-2">
                    Deductions Breakdown
                  </p>
                  <div className="space-y-1.5 text-xs text-gray-800">
                    <div className="flex justify-between">
                      <span>Service Fee <span className="text-gray-500">(₱100 / ₱50,000)</span></span>
                      <span className="font-mono font-semibold">
                        {formatCurrency(previewDeductions?.deductions?.service_fee)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Capital Build-Up <span className="text-gray-500">(2% of principal)</span></span>
                      <span className="font-mono font-semibold text-[#389734]">
                        {formatCurrency(previewDeductions?.deductions?.cbu_deduction)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Insurance Fee <span className="text-gray-500">(₱1.35 / ₱1,000)</span></span>
                      <span className="font-mono font-semibold">
                        {formatCurrency(previewDeductions?.deductions?.insurance_fee)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Notarial Fee</span>
                      <span className="font-mono font-semibold">
                        {formatCurrency(previewDeductions?.deductions?.notarial_fee)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-amber-200 pt-1.5 mt-1.5">
                      <span className="font-semibold">Total Deductions</span>
                      <span className="font-mono font-bold">
                        {formatCurrency(previewDeductions?.total_deductions)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pt-1">
                      <span className="font-bold">Net Proceeds to Release</span>
                      <span className="font-mono font-bold text-[#389734]">
                        {formatCurrency(previewDeductions?.net_proceeds)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-amber-700">
                    The 2% CBU retention will be credited to the member's Capital Build-Up ledger on release.
                  </p>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDisbursementPreview}
                disabled={!!disbursingLoanId}
                className="rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold px-4 py-2 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDisburseLoan(previewLoan.loan_id)}
                disabled={
                  !!disbursingLoanId ||
                  previewLoading ||
                  !!previewError ||
                  !previewDeductions
                }
                className="rounded-lg bg-[#389734] hover:bg-[#2d7c29] text-white text-sm font-semibold px-5 py-2 transition disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              >
                {disbursingLoanId === previewLoan.loan_id ? "Releasing..." : "Confirm & Release"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cashier_Disbursement;
