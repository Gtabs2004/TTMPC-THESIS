import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity"; 
import { 
  LayoutDashboard, 
  Search,
  Bell,
  Banknote,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import logo from "../../assets/img/ttmpc logo.png"; 

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `\u20B1${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-US");
};

const Cashier_Withdrawals = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const [isDepositsOpen, setIsDepositsOpen] = useState(true);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState(null);
  const [searchTerm, setSearchTerm] = React.useState("");
   
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

  React.useEffect(() => {
    const fetchRows = async () => {
      try {
        setLoading(true);
        setFetchError(null);

        const response = await fetch(`${API_BASE_URL}/api/cashier/withdrawals/transactions`);
        const result = await response.json();
        if (!response.ok || !result?.success) {
          throw new Error(result?.detail || "Failed to load withdrawal transactions.");
        }

        setRows(Array.isArray(result.data) ? result.data : []);
      } catch (error) {
        setFetchError(error?.message || "Unable to fetch withdrawal transactions.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRows();
  }, []);

  const filteredRows = rows.filter((row) => {
    const text = searchTerm.trim().toLowerCase();
    if (!text) return true;
    return (
      String(row.transaction_id || "").toLowerCase().includes(text)
      || String(row.member_name || "").toLowerCase().includes(text)
      || String(row.savings_id || "").toLowerCase().includes(text)
    );
  });

  const getStatusStyle = (status) => {
    switch(status) {
      case 'VALIDATED': return 'bg-green-100 text-green-700 font-bold rounded-lg p-8 ';
      default: return 'bg-gray-100 text-gray-700 font-bold';
    }
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
              placeholder="Search transaction..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
          <h1 className="text-2xl font-bold text-[#1F3E35] mb-6">Withdrawals</h1>

          {/* Main Card Container */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden p-6">
            
            {/* Header Section */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-[#1F3E35]">Posted Withdrawal Transactions</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Bookkeeper approved transactions</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
            </div>

            {fetchError ? (
              <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{fetchError}</div>
            ) : null}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                    <th className="px-4 py-4">Transaction ID</th>
                    <th className="px-4 py-4 w-64">Member Name</th>
                    <th className="px-4 py-4">Savings ID</th>
                    <th className="px-4 py-4">Amount</th>
                    <th className="px-4 py-4">Date Posted</th>
                    <th className="px-4 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="px-4 py-6 text-center text-gray-500">Loading withdrawal transactions...</td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-4 py-6 text-center text-gray-500">No posted withdrawals found.</td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                    <tr key={row.transaction_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4">
                        <span className="font-semibold text-gray-900">{row.transaction_id}</span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{row.member_name}</p>
                            <p className="text-[10px] text-gray-400 font-medium">{row.membership_number_id || "N/A"}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <span className="font-semibold text-gray-900">{row.savings_id}</span>
                      </td>

                      <td className="px-4 py-4">
                        <span className="font-bold text-gray-900">{formatCurrency(row.amount)}</span>
                      </td>

                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-500 font-medium">{formatDate(row.date_posted)}</span>
                      </td>

                      <td className="px-4 py-4">
                        <span className={`px-3 py-1 rounded text-[10px] uppercase tracking-wide ${getStatusStyle(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))) }
                </tbody>
              </table>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default Cashier_Withdrawals;



