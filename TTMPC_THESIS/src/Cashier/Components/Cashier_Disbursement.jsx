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
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [isDepositsOpen, setIsDepositsOpen] = useState(true);
  const [readyLoans, setReadyLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [disbursingLoanId, setDisbursingLoanId] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState({ key: "member_name", direction: "asc" });
  const [showFilters, setShowFilters] = useState(false);

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

  const handleDisburseLoan = async (loanId) => {
    setDisbursingLoanId(loanId);
    setErrorMessage("");
    setFeedbackMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/cashier/disbursements/${loanId}/disburse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({}),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.detail || result?.message || "Failed to disburse loan.");
      }

      const firstDueDate = result?.data?.first_due_date || "N/A";
      setFeedbackMessage(
        `Loan disbursed. Schedule created with first due date ${firstDueDate}. Grace period is 3 days and delayed flag starts after 1 month.`
      );
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
    <div className="flex min-h-screen bg-gray-100">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Cashier Portal</p>
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

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 pl-9 py-1 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <p className="ml-4 font-medium">Cashier</p>
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
              <table className="w-full">
                <thead className="bg-[#66B538] text-white uppercase text-[13px] tracking-wider">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">
                      Loan ID
                    </th>
                    <th className="px-6 py-4 text-left font-semibold">
                      <button
                        onClick={() => handleSort("member_name")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Member Name
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left font-semibold">
                      <button
                        onClick={() => handleSort("loan_type")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Loan Type
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left font-semibold">
                      <button
                        onClick={() => handleSort("principal_amount")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Principal
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left font-semibold">
                      Interest
                    </th>
                    <th className="px-6 py-4 text-left font-semibold">
                      <button
                        onClick={() => handleSort("term_months")}
                        className="flex items-center gap-2 font-semibold hover:text-green-100 transition group"
                      >
                        Term
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left font-semibold">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left font-semibold">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAndSortedLoans.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center">
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
                      <tr key={loan.loan_id} className="table-row-enter hover:bg-green-50 transition">
                        <td className="px-6 py-4 text-xs font-mono text-gray-700">
                          <span className="inline-flex rounded bg-gray-100 px-2 py-1">
                            {String(loan.loan_id).slice(0, 8)}...
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {loan.member_name}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {toTitleCase(loan.loan_type)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700 font-semibold">
                          {formatCurrency(loan.principal_amount || loan.loan_amount)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {Number(loan.interest_rate || 0)}%
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {loan.term_months} mo
                        </td>
                        <td className="px-6 py-4">
                          <span className="badge-animated inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-700">
                            <CheckCircle2 size={12} />
                            {loan.loan_status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={() => handleDisburseLoan(loan.loan_id)}
                            disabled={disbursingLoanId === loan.loan_id}
                            className="btn-enhanced rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 transition disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                          >
                            {disbursingLoanId === loan.loan_id ? "Processing..." : "Disburse"}
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
    </div>
  );
};

export default Cashier_Disbursement;
