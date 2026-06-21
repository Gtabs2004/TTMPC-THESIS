import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
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
  UserPlus,
  LogOut,
  ArrowUpRight,
  Users,
  Send,
  PiggyBank,
  ShoppingCart,
  ArrowDownLeft,
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
  const { addNotification } = useNotification();
  const [isDepositsOpen, setIsDepositsOpen] = useState(true);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState(null);
  const [searchTerm, setSearchTerm] = React.useState("");
   
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
    <div className="flex min-h-screen bg-gray-50">
      {/* 1. THE SIDEBAR */}
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
      {/* 2. THE MAIN AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto ml-64">
              <div className="flex-1 flex flex-col min-w-0">
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
      </div>
      

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
                <thead className="bg-[#66B538] text-white uppercase text-[13px] tracking-wider">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Transaction ID</th>
                    <th className="px-6 py-4 font-semibold">Member Name</th>
                    <th className="px-6 py-4 font-semibold">Savings ID</th>
                    <th className="px-6 py-4 font-semibold text-right">Amount</th>
                    <th className="px-6 py-4 font-semibold">Date Posted</th>
                    <th className="px-6 py-4 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-6 text-center text-gray-500">Loading withdrawal transactions...</td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-6 text-center text-gray-500">No posted withdrawals found.</td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                    <tr key={row.transaction_id} className="table-row-enter hover:bg-green-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-gray-800">{row.transaction_id}</span>
                      </td>

                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{row.member_name}</p>
                          <p className="text-xs text-gray-500">{row.membership_number_id || "N/A"}</p>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-gray-800">{row.savings_id}</span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <span className="font-semibold text-gray-900">{formatCurrency(row.amount)}</span>
                      </td>

                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">{formatDate(row.date_posted)}</span>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className={`badge-animated px-3 py-1.5 rounded-full text-xs font-semibold border ${getStatusStyle(row.status)}`}>
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



