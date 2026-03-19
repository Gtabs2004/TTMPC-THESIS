import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import {
  LayoutDashboard,
  Search,
  Bell,
  Banknote,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const Cashier_Disbursement = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const [isDepositsOpen, setIsDepositsOpen] = useState(true);
  const [readyLoans, setReadyLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [claimingLoanId, setClaimingLoanId] = useState("");

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

  const handleClaimLoan = async (loanId) => {
    setClaimingLoanId(loanId);
    setErrorMessage("");
    setFeedbackMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/cashier/disbursements/${loanId}/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({}),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.detail || result?.message || "Failed to claim loan disbursement.");
      }

      const firstDueDate = result?.data?.first_due_date || "N/A";
      setFeedbackMessage(
        `Loan disbursed. Schedule created with first due date ${firstDueDate}. Grace period is 3 days and delayed flag starts after 1 month.`
      );
      await fetchReadyLoans();
    } catch (error) {
      setErrorMessage(error.message || "Disbursement failed.");
    } finally {
      setClaimingLoanId("");
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
          <div className="flex items-center justify-between gap-3 mb-5">
            <h1 className="text-2xl font-bold text-gray-800">Loan Disbursement</h1>
            <button
              type="button"
              onClick={fetchReadyLoans}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Refresh
            </button>
          </div>

          {feedbackMessage && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {feedbackMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {loading && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Loading loans ready for disbursement...
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Loan ID</th>
                  <th className="px-4 py-3 text-left font-semibold">Member Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Loan Type</th>
                  <th className="px-4 py-3 text-left font-semibold">Principal</th>
                  <th className="px-4 py-3 text-left font-semibold">Interest</th>
                  <th className="px-4 py-3 text-left font-semibold">Term</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {readyLoans.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No loans are currently in ready for disbursement status.
                    </td>
                  </tr>
                )}

                {readyLoans.map((loan) => (
                  <tr key={loan.loan_id} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-xs text-gray-700">{loan.loan_id}</td>
                    <td className="px-4 py-3 text-gray-700">{loan.member_name}</td>
                    <td className="px-4 py-3 text-gray-700">{loan.loan_type}</td>
                    <td className="px-4 py-3 text-gray-700">{formatCurrency(loan.principal_amount || loan.loan_amount)}</td>
                    <td className="px-4 py-3 text-gray-700">{Number(loan.interest_rate || 0)}%</td>
                    <td className="px-4 py-3 text-gray-700">{loan.term_months} months</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-700">
                        {loan.loan_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleClaimLoan(loan.loan_id)}
                        disabled={claimingLoanId === loan.loan_id}
                        className="rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                      >
                        {claimingLoanId === loan.loan_id ? "Processing..." : "Claim & Disburse"}
                      </button>
                    </td>
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

export default Cashier_Disbursement;
