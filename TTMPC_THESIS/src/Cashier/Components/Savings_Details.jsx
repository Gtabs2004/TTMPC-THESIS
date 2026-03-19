import React from "react";
import { useNavigate, useParams, NavLink } from "react-router-dom";
import logo from "../../assets/img/ttmpc logo.png";

import { UserAuth } from "../../contex/AuthContext";

import {
  LayoutDashboard,
  CreditCard,
  Banknote,
  Search,
  Bell,
  ArrowDownCircle,
  ArrowUpCircle,
  X,
  Check,
} from "lucide-react";


const Savings_Details = () => {
  const { id } = useParams();
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [showWithdrawForm, setShowWithdrawForm] = React.useState(false);
  const [showDepositForm, setShowDepositForm] = React.useState(false);
  const [withdrawAmount, setWithdrawAmount] = React.useState("");
  const [depositAmount, setDepositAmount] = React.useState("");

  // Mock data - in real app, fetch from API based on 'id'
  const savingsDetails = {
    ID: "TTMPCL-001-123",
    name: "Gero Antoni Tabiolo",
    type: "Regular Savings",
    dateAcquired: "02-15-2026",
    totalAmount: "₱50,000",
    previousDeposit: "₱5,000",
    previousDate: "03-14-2026",
  };

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Disbursement", icon: Banknote },
    { name: "Savings", icon: CreditCard },
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

  const handleWithdraw = () => {
    if (withdrawAmount && Number(withdrawAmount) > 0) {
      console.log(`Withdrawal: ₱${withdrawAmount}`);
      // Add API call here
      setWithdrawAmount("");
      setShowWithdrawForm(false);
      // Show success message
    }
  };

  const handleDeposit = () => {
    if (depositAmount && Number(depositAmount) > 0) {
      console.log(`Deposit: ₱${depositAmount}`);
      // Add API call here
      setDepositAmount("");
      setShowDepositForm(false);
      // Show success message
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
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

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
            const routeMap = {
              Dashboard: "/Cashier_Dashboard",
              Disbursement: "/Cashier_Disbursement",
              Savings: "/Cashier_Savings",
            };

            return menuItems.map((item) => {
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
            });
          })()}
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
            ← Back to Savings
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
            <p className="text-gray-700 font-medium">Cashier</p>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-8">
          <div className="max-w-4xl">
            {/* Title */}
            <h1 className="font-bold text-3xl mb-8 text-gray-900">Savings Account Details</h1>

            {/* Account Information Card */}
            <div className="bg-white rounded-xl shadow-sm p-8 mb-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-800 mb-6">Account Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="border-b md:border-b-0 md:border-r border-gray-200 pb-6 md:pb-0 md:pr-8">
                  <p className="text-gray-600 text-sm font-semibold uppercase tracking-wider mb-2">
                    Member Name
                  </p>
                  <p className="text-gray-900 font-bold text-lg">{savingsDetails.name}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm font-semibold uppercase tracking-wider mb-2">
                    Savings ID
                  </p>
                  <p className="text-gray-900 font-bold text-lg">{savingsDetails.ID}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                <div className="border-b md:border-b-0 md:border-r border-gray-200 pb-6 md:pb-0 md:pr-8">
                  <p className="text-gray-600 text-sm font-semibold uppercase tracking-wider mb-2">
                    Date Acquired
                  </p>
                  <p className="text-gray-900 font-bold text-lg">{savingsDetails.dateAcquired}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm font-semibold uppercase tracking-wider mb-2">
                    Savings Type
                  </p>
                  <span className="inline-flex px-4 py-2 rounded-full text-sm font-bold bg-purple-100 text-purple-800">
                    {savingsDetails.type}
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
                    <p className="text-3xl font-bold text-green-900">{savingsDetails.totalAmount}</p>
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
                  <p className="text-2xl font-bold text-blue-900 mb-2">{savingsDetails.previousDeposit}</p>
                  <p className="text-blue-600 text-sm">Deposited on {savingsDetails.previousDate}</p>
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
                      <span className="absolute left-3 top-3 text-gray-700 font-bold">₱</span>
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
                    Available Balance: <span className="font-bold text-gray-900">{savingsDetails.totalAmount}</span>
                  </p>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleWithdraw}
                      className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Check size={18} />
                      Confirm Withdrawal
                    </button>
                    <button
                      onClick={() => setShowWithdrawForm(false)}
                      className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <X size={18} />
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
                      <span className="absolute left-3 top-3 text-gray-700 font-bold">₱</span>
                      <input
                        type="number"
                        placeholder="Enter amount"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        className="w-full pl-8 pr-4 py-3 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleDeposit}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Check size={18} />
                      Confirm Deposit
                    </button>
                    <button
                      onClick={() => setShowDepositForm(false)}
                      className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <X size={18} />
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Transaction History */}
            <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-800 mb-6">Recent Transactions</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <ArrowUpCircle className="text-green-600" size={20} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Deposit</p>
                      <p className="text-sm text-gray-600">03-14-2026</p>
                    </div>
                  </div>
                  <p className="font-bold text-green-600">+₱5,000</p>
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <ArrowDownCircle className="text-gray-600" size={20} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Account Opening</p>
                      <p className="text-sm text-gray-600">02-15-2026</p>
                    </div>
                  </div>
                  <p className="font-bold text-gray-600">₱45,000</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Savings_Details;