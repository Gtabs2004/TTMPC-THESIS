import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity"; 
import { 
  LayoutDashboard, 
  Search,
  Bell,
  Banknote,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserSearch,
  ArrowRightCircle,
  Filter,
  Download,
} from 'lucide-react';
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 10;


const Cashier_CBU = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const [isDepositsOpen, setIsDepositsOpen] = useState(true);
  const [memberSearch, setMemberSearch] = useState("");
  const [members, setMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [memberPage, setMemberPage] = useState(1);
  const [transactionPage, setTransactionPage] = useState(1);

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
        { name: "Capital Build-Up", path: "/Cashier_CBU" }
      ]
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

  const getStatusStyle = (status) => {
    switch(status) {
      case 'VERIFIED': return 'bg-green-50 text-green-600';
      case 'PENDING': return 'bg-orange-50 text-orange-500';
      case 'FLAGGED': return 'bg-red-50 text-red-500';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

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

  const filteredMembers = useMemo(() => {
    const key = String(memberSearch || "").trim().toLowerCase();
    if (!key) return members;
    return members.filter((row) =>
      String(row.member_id || "").toLowerCase().includes(key) ||
      String(row.member_name || "").toLowerCase().includes(key)
    );
  }, [memberSearch, members]);

  const totalMemberPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const paginatedMembers = useMemo(() => {
    const start = (memberPage - 1) * PAGE_SIZE;
    return filteredMembers.slice(start, start + PAGE_SIZE);
  }, [filteredMembers, memberPage]);

  const totalTransactionPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const paginatedTransactions = useMemo(() => {
    const start = (transactionPage - 1) * PAGE_SIZE;
    return transactions.slice(start, start + PAGE_SIZE);
  }, [transactions, transactionPage]);

  useEffect(() => {
    setMemberPage(1);
  }, [memberSearch, members]);

  useEffect(() => {
    setTransactionPage(1);
  }, [transactions]);

  useEffect(() => {
    if (memberPage > totalMemberPages) {
      setMemberPage(totalMemberPages);
    }
  }, [memberPage, totalMemberPages]);

  useEffect(() => {
    if (transactionPage > totalTransactionPages) {
      setTransactionPage(totalTransactionPages);
    }
  }, [transactionPage, totalTransactionPages]);

  async function fetchCbuData() {
    setLoading(true);
    setLoadError("");
    try {
      const [membersRes, txRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/cashier/cbu/members`, { method: "GET", headers: { Accept: "application/json" } }),
        fetch(`${API_BASE_URL}/api/cashier/cbu/transactions`, { method: "GET", headers: { Accept: "application/json" } }),
      ]);

      const membersPayload = await membersRes.json().catch(() => ({}));
      const txPayload = await txRes.json().catch(() => ({}));

      if (!membersRes.ok || !membersPayload?.success) {
        throw new Error(membersPayload?.detail || "Failed to load CBU members.");
      }
      if (!txRes.ok || !txPayload?.success) {
        throw new Error(txPayload?.detail || "Failed to load CBU transactions.");
      }

      setMembers(Array.isArray(membersPayload.data) ? membersPayload.data : []);
      setTransactions(Array.isArray(txPayload.data) ? txPayload.data : []);
    } catch (err) {
      setLoadError(err?.message || "Unable to load CBU data.");
      setMembers([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCbuData();
  }, []);

  const proceedToDepositPage = (member) => {
    const memberRef = member?.member_uuid || member?.member_id;
    navigate(`/Cashier_CBU_Deposit/${encodeURIComponent(memberRef)}`);
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* 1. THE SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0">
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
                                ? 'text-[#5CBA47] font-semibold'
                                : 'text-gray-500 hover:text-[#5CBA47] hover:bg-green-50'
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
                      ? 'bg-green-50 text-[#5CBA47] font-semibold'
                      : 'text-gray-700 hover:bg-green-50 hover:text-[#5CBA47]'
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

      {/* 2. THE MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              placeholder="Search..."
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 pl-9 py-1 focus:outline-none focus:ring-2 focus:ring-[#389734]"
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="src/assets/img/bookkeeper-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Cashier" />
        </header>

        {/* 3. PAGE CONTENT */}
        <main className="p-8 overflow-auto">
          <h1 className="text-2xl font-bold text-[#1F3E35] mb-6">Capital Build-Up</h1>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-[#1F3E35]">Member Accounts</h3>
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#389734] bg-green-50 px-2 py-1 rounded">
                Live Data
              </span>
            </div>

            {loading && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Loading members and CBU records...
              </div>
            )}

            {!!loadError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {loadError}
              </div>
            )}

            <div className="relative mb-4 max-w-md">
              <UserSearch className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Search by Member ID or Name"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 h-11 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#389734]"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-white text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    <th className="px-4 py-3">Member ID</th>
                    <th className="px-4 py-3">Member Name</th>
                    <th className="px-4 py-3">Current Balance</th>
                    <th className="px-4 py-3">Starting Point</th>
                    <th className="px-4 py-3">Current Shares</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-gray-700 divide-y divide-gray-50">
                  {filteredMembers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-gray-500">No member accounts matched your search.</td>
                    </tr>
                  )}
                  {paginatedMembers.map((member) => {
                    const currentBal = Number(member.current_balance || 0);
                    return (
                      <tr key={member.member_uuid || member.member_id} className="hover:bg-gray-50 transition-colors bg-white">
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{member.member_id}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{member.member_name}</td>
                        <td className="px-4 py-3 font-semibold text-gray-700">{formatCurrency(currentBal)}</td>
                        <td className="px-4 py-3 text-gray-600">{member.is_new_member ? `${formatCurrency(member.starting_capital)} (New Member)` : "Existing Capital"}</td>
                        <td className="px-4 py-3 text-gray-700">{Number(member.current_shares || 0).toFixed(2)} shares</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => proceedToDepositPage(member)}
                            className="inline-flex items-center gap-2 rounded-lg bg-[#389734] px-3 py-2 text-xs font-bold text-white hover:bg-green-700"
                          >
                            <ArrowRightCircle className="w-4 h-4" /> Proceed to Deposit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-between items-center bg-white">
              <p className="text-xs text-gray-500">
                Page {memberPage} of {totalMemberPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMemberPage((prev) => Math.max(prev - 1, 1))}
                  disabled={memberPage <= 1}
                  className="h-8 w-8 rounded border border-gray-300 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center justify-center"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMemberPage((prev) => Math.min(prev + 1, totalMemberPages))}
                  disabled={memberPage >= totalMemberPages}
                  className="h-8 w-8 rounded border border-gray-300 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center justify-center"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
};

export default Cashier_CBU;



