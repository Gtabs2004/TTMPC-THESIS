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
} from "lucide-react";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

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
  return "bg-gray-100 text-gray-700";
};

const LoanLedger = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { loanId } = useParams();

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Records", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: CreditCard },
    { name: "Payments", icon: Wallet },
    { name: "Accounting", icon: Calculator },
    { name: "MIGS Scoring", icon: Activity },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Trail", icon: History },
  ];

  const routeMap = {
    Dashboard: "/dashboard",
    "Member Records": "/records",
    "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans": "/manage-loans",
    Payments: "/payments",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs-scoring",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
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
              placeholder="Search..."
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
          <p className="ml-2">Bookkeeper</p>
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

            <h2 className="text-sm font-semibold text-gray-700 mb-3">Loan Summary</h2>
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
    </div>
  );
};

export default LoanLedger;
