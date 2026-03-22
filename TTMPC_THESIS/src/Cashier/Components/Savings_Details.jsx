import React from "react";
import { useNavigate, useParams, NavLink } from "react-router-dom";
import logo from "../../assets/img/ttmpc logo.png";

import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";

import {
  LayoutDashboard,
  CreditCard,
  Banknote,
  Search,
  Bell,
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronDown,
  ChevronRight,
  Check,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `\u20B1${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString("en-US");
};

const Savings_Details = () => {
  const { id } = useParams();
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const [isDepositsOpen, setIsDepositsOpen] = React.useState(true);
  const [details, setDetails] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState(null);
  const [showWithdrawForm, setShowWithdrawForm] = React.useState(false);
  const [withdrawAmount, setWithdrawAmount] = React.useState("");
  const [withdrawError, setWithdrawError] = React.useState(null);
  const [withdrawSuccess, setWithdrawSuccess] = React.useState(null);
  const [showDepositForm, setShowDepositForm] = React.useState(false);
  const [depositAmount, setDepositAmount] = React.useState("");
  const [depositError, setDepositError] = React.useState(null);
  const [depositSuccess, setDepositSuccess] = React.useState(null);
  const [isSubmittingDeposit, setIsSubmittingDeposit] = React.useState(false);
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = React.useState(false);

  const loadDetails = React.useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);

      const response = await fetch(`${API_BASE_URL}/api/cashier/savings/accounts/${encodeURIComponent(id)}`);
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || "Failed to load savings details.");
      }

      setDetails(result.data || null);
    } catch (error) {
      setFetchError(error?.message || "Unable to fetch savings details.");
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    loadDetails();
  }, [loadDetails]);

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

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const handleWithdraw = async () => {
    const numericAmount = Number(withdrawAmount);
    const currentBalance = Number(details?.total_amount || 0);

    if (!numericAmount || numericAmount <= 0) {
      setWithdrawError("Please enter a valid withdrawal amount.");
      return;
    }

    if (numericAmount > currentBalance) {
      setWithdrawError("Withdrawal amount cannot be greater than available balance.");
      return;
    }

    try {
      setIsSubmittingWithdraw(true);
      setWithdrawError(null);
      setWithdrawSuccess(null);
      setDepositSuccess(null);

      const response = await fetch(`${API_BASE_URL}/api/cashier/savings/accounts/${encodeURIComponent(id)}/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: numericAmount }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || "Failed to post withdrawal.");
      }

      setWithdrawAmount("");
      setShowWithdrawForm(false);
      setWithdrawSuccess(result?.message || "Withdrawal submitted and pending Bookkeeper verification.");
      await loadDetails();
    } catch (error) {
      setWithdrawError(error?.message || "Unable to complete withdrawal.");
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  const handleDeposit = async () => {
    const numericAmount = Number(depositAmount);
    if (!numericAmount || numericAmount <= 0) {
      setDepositError("Please enter a valid deposit amount.");
      return;
    }

    try {
      setIsSubmittingDeposit(true);
      setDepositError(null);
      setDepositSuccess(null);
      setWithdrawSuccess(null);

      const response = await fetch(`${API_BASE_URL}/api/cashier/savings/accounts/${encodeURIComponent(id)}/deposit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: numericAmount }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || "Failed to post deposit.");
      }

      setDepositAmount("");
      setShowDepositForm(false);
      setDepositSuccess(result?.message || "Deposit submitted and pending Bookkeeper verification.");
      await loadDetails();
    } catch (error) {
      setDepositError(error?.message || "Unable to complete deposit.");
    } finally {
      setIsSubmittingDeposit(false);
    }
  };

  const recentDeposits = details?.deposits || [];

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Cashier Portal" fallbackRole="Cashier" />
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white h-16 shadow-sm flex items-center justify-between px-8">
          <button
            onClick={() => navigate("/Cashier_Savings")}
            className="text-gray-600 hover:text-gray-900 font-semibold"
          >
            {"<- Back to Savings"}
          </button>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
            </button>
            <img
              alt="Cashier Profile"
              className="ml-4 w-8 h-8 rounded-full"
            />
            <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Cashier" />
          </div>
        </header>

        {/* Page Content */}
        <main className="p-8">
          <div className="max-w-4xl">
            {/* Title */}
            <h1 className="font-bold text-3xl mb-8 text-gray-900">Savings Account Details</h1>

            {loading ? (
              <div className="bg-white rounded-xl shadow-sm p-8 mb-6 border border-gray-200 text-gray-500">
                Loading savings details...
              </div>
            ) : null}

            {fetchError ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700">
                {fetchError}
              </div>
            ) : null}

            {depositSuccess ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-green-700">
                {depositSuccess}
              </div>
            ) : null}

            {withdrawSuccess ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-green-700">
                {withdrawSuccess}
              </div>
            ) : null}

            {/* Account Information Card */}
            <div className="bg-white rounded-xl shadow-sm p-8 mb-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-800 mb-6">Account Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="border-b md:border-b-0 md:border-r border-gray-200 pb-6 md:pb-0 md:pr-8">
                  <p className="text-gray-600 text-sm font-semibold uppercase tracking-wider mb-2">
                    Member Name
                  </p>
                  <p className="text-gray-900 font-bold text-lg">{details?.member_name || "N/A"}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm font-semibold uppercase tracking-wider mb-2">
                    Savings ID
                  </p>
                  <p className="text-gray-900 font-bold text-lg">{details?.id || id}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                <div className="border-b md:border-b-0 md:border-r border-gray-200 pb-6 md:pb-0 md:pr-8">
                  <p className="text-gray-600 text-sm font-semibold uppercase tracking-wider mb-2">
                    Date Acquired
                  </p>
                  <p className="text-gray-900 font-bold text-lg">{formatDate(details?.date_opened)}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm font-semibold uppercase tracking-wider mb-2">
                    Savings Type
                  </p>
                  <span className="inline-flex px-4 py-2 rounded-full text-sm font-bold bg-purple-100 text-purple-800">
                    {details?.savings_type || "Regular Savings"}
                  </span>
                </div>
              </div>
            </div>

            {/* Balance Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Total Amount */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-sm p-6 border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-700 text-sm font-semibold uppercase tracking-wider mb-2">
                      Total Amount
                    </p>
                    <p className="text-3xl font-bold text-green-900">{formatCurrency(details?.total_amount)}</p>
                  </div>
                  <CreditCard className="text-green-600 w-12 h-12 opacity-20" />
                </div>
              </div>

              {/* Previous Deposit */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-sm p-6 border border-blue-200">
                <div>
                  <p className="text-blue-700 text-sm font-semibold uppercase tracking-wider mb-2">
                    Previous Deposit
                  </p>
                  <p className="text-2xl font-bold text-blue-900 mb-2">{formatCurrency(details?.previous_deposit)}</p>
                  <p className="text-blue-600 text-sm">Deposited on {formatDate(details?.previous_date)}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 mb-8">
              <button
                onClick={() => setShowWithdrawForm(!showWithdrawForm)}
                className="flex-1 px-6 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <ArrowDownCircle size={20} />
                Withdraw
              </button>
              <button
                onClick={() => setShowDepositForm(!showDepositForm)}
                className="flex-1 px-6 py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <ArrowUpCircle size={20} />
                Deposit
              </button>
            </div>

            {/* Withdraw Form */}
            {showWithdrawForm && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Withdrawal Details</h3>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Amount to Withdraw
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-gray-700 font-bold">{"\u20B1"}</span>
                      <input
                        type="number"
                        placeholder="Enter amount"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="w-full pl-8 pr-4 py-3 border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    Available Balance: <span className="font-bold text-gray-900">{formatCurrency(details?.total_amount)}</span>
                  </p>
                  {withdrawError ? (
                    <p className="text-sm text-red-700">{withdrawError}</p>
                  ) : null}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleWithdraw}
                      disabled={isSubmittingWithdraw}
                      className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Check size={18} />
                      {isSubmittingWithdraw ? "Submitting..." : "Confirm Withdrawal"}
                    </button>
                    <button
                      onClick={() => setShowWithdrawForm(false)}
                      className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Deposit Form */}
            {showDepositForm && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Deposit Details</h3>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Amount to Deposit
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-gray-700 font-bold">{"\u20B1"}</span>
                      <input
                        type="number"
                        placeholder="Enter amount"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        className="w-full pl-8 pr-4 py-3 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>
                  {depositError ? (
                    <p className="text-sm text-red-700">{depositError}</p>
                  ) : null}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleDeposit}
                      disabled={isSubmittingDeposit}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Check size={18} />
                      {isSubmittingDeposit ? "Submitting..." : "Confirm Deposit"}
                    </button>
                    <button
                      onClick={() => setShowDepositForm(false)}
                      className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Deposit History */}
            <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-800 mb-6">Recent Deposits</h2>
              <div className="space-y-3">
                {recentDeposits.length > 0 ? (
                  recentDeposits.map((entry, index) => (
                    <div key={`${entry.label}-${entry.date || index}`} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                          <ArrowUpCircle className="text-green-600" size={20} />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{entry.label || "Deposit"}</p>
                          <p className="text-sm text-gray-600">{formatDate(entry.date)}</p>
                        </div>
                      </div>
                      <p className="font-bold text-green-600">+{formatCurrency(entry.amount)}</p>
                    </div>
                  ))
                ) : (
                  <div className="p-4 border border-gray-200 rounded-lg text-gray-500 text-sm">
                    No deposit history available.
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Savings_Details;



