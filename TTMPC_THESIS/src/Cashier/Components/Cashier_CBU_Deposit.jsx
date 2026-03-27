import React, { useEffect, useState } from "react";
import { useNavigate, NavLink, useParams } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import {
  LayoutDashboard,
  Search,
  Bell,
  Banknote,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Wallet,
  Calculator,
  ReceiptText,
  CheckCircle2,
} from "lucide-react";

import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const SHARE_VALUE = 1000;
const STARTING_CAPITAL = 0;

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const Cashier_CBU_Deposit = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { memberId } = useParams();
  const [isDepositsOpen, setIsDepositsOpen] = useState(true);
  const [selectedMember, setSelectedMember] = useState(null);
  const [loadingMember, setLoadingMember] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [depositAmount, setDepositAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [cbuDepositId, setCbuDepositId] = useState("CBUD_001");
  const [statusMessage, setStatusMessage] = useState("Fill in all required fields before submitting.");

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

  const currentBalance = selectedMember
    ? selectedMember.is_new_member
      ? 0
      : Number(selectedMember.current_balance || 0)
    : 0;
  const amount = Number(depositAmount || 0);
  const totalBalance = currentBalance + (Number.isFinite(amount) ? Math.max(amount, 0) : 0);
  const totalShares = totalBalance / SHARE_VALUE;

  useEffect(() => {
    async function loadMember() {
      if (!memberId) return;
      setLoadingMember(true);
      setLoadError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/cashier/cbu/members/${encodeURIComponent(memberId)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.detail || payload?.message || "Failed to load selected member.");
        }

        setSelectedMember(payload.data || null);
      } catch (err) {
        setLoadError(err?.message || "Unable to load selected member.");
        setSelectedMember(null);
      } finally {
        setLoadingMember(false);
      }
    }

    loadMember();
  }, [memberId]);

  const handleSubmit = async () => {
    if (!selectedMember) {
      setStatusMessage("Selected member not found. Go back and pick a member from the list.");
      return;
    }
    if (!(amount > 0) || !paymentMode.trim() || !transactionDate) {
      setStatusMessage("Please complete required fields: Deposit Amount, Payment Mode, and Transaction Date.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/cashier/cbu/deposits`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          member_id: selectedMember.member_uuid || selectedMember.member_id,
          deposit_amount: amount,
          deposit_account: paymentMode,
          transaction_date: new Date(transactionDate).toISOString(),
          cbu_deposit_id: cbuDepositId,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.message || "Failed to submit CBU deposit.");
      }

      const returnedId = payload?.data?.cbu_deposit_id || cbuDepositId;
      setCbuDepositId(returnedId);
      setStatusMessage(`CBU deposit recorded successfully. Deposit ID: ${returnedId}.`);
      setDepositAmount("");
    } catch (err) {
      setStatusMessage(err?.message || "Failed to submit CBU deposit.");
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Cashier Portal</p>
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
          className="mt-auto w-full rounded p-2 text-xs bg-[#389734] hover:bg-green-700 text-white font-bold transition-colors"
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
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 pl-9 py-1 focus:outline-none focus:ring-2 focus:ring-[#389734]"
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="src/assets/img/bookkeeper-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Cashier" />
        </header>

        <main className="p-8 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-[#1F3E35]">CBU Deposit Entry</h1>
            <button
              type="button"
              onClick={() => navigate("/Cashier_CBU")}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Members
            </button>
          </div>

          {loadingMember && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Loading selected member details...
            </div>
          )}

          {!!loadError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            <h3 className="text-lg font-bold text-[#1F3E35] mb-5">Selected Member</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-2">Member ID</p>
                <div className="h-11 rounded-lg border border-gray-200 bg-gray-50 px-3 flex items-center text-sm font-semibold text-gray-700">
                  {selectedMember?.member_id || "N/A"}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-2">Member Name</p>
                <div className="h-11 rounded-lg border border-gray-200 bg-gray-50 px-3 flex items-center text-sm font-semibold text-gray-700">
                  {selectedMember?.member_name || "N/A"}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-2">Current Capital</p>
                <div className="h-11 rounded-lg border border-gray-200 bg-gray-50 px-3 flex items-center text-sm font-semibold text-gray-700">
                  {formatCurrency(currentBalance)}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-2">Starting Point</p>
                <div className="h-11 rounded-lg border border-gray-200 bg-gray-50 px-3 flex items-center text-sm font-semibold text-gray-700">
                  {selectedMember?.is_new_member ? `${formatCurrency(STARTING_CAPITAL)} (New)` : "Existing Capital"}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-[#1F3E35] mb-5">Required Deposit Fields</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-2 block">Deposit Amount *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={depositAmount}
                  onChange={(event) => setDepositAmount(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 h-11 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#389734]"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-2 block">Payment Mode *</label>
                <select
                  value={paymentMode}
                  onChange={(event) => setPaymentMode(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 h-11 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#389734]"
                >
                  <option value="Cash">Cash</option>
                  <option value="GCash">GCash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-2 block">CBU Deposit ID *</label>
                <div className="w-full rounded-lg border border-gray-300 bg-gray-50 h-11 px-3 flex items-center text-sm font-semibold text-gray-700">
                  {cbuDepositId}
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-2 block">Transaction Date *</label>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(event) => setTransactionDate(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 h-11 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#389734]"
                />
              </div>

            </div>

            

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 mb-5 text-sm text-gray-700 flex items-start gap-2">
              <Calculator className="w-4 h-4 mt-0.5 text-[#389734]" />
              <span>{statusMessage}</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                className="bg-[#389734] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
              >
                <ReceiptText className="w-4 h-4" /> Submit CBU Deposit
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Cashier_CBU_Deposit;




