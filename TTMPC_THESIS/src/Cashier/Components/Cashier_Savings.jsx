import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
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
  UserPlus,
  ClipboardList,
  BadgeCheck,
  TrendingUp,
  CheckCircle,
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

const Cashier_Savings = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [displaySavings, setDisplaySavings] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sortBy, setSortBy] = React.useState("date");
  
 const [isDepositsOpen, setIsDepositsOpen] = useState(true);
 
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
      case 'ACTIVE': return 'bg-green-100 text-green-800 border border-green-300';
      case 'PENDING': return 'bg-amber-100 text-amber-800 border border-amber-300';
      case 'INACTIVE': return 'bg-gray-100 text-gray-800 border border-gray-300';
      default: return 'bg-gray-50 text-gray-600';
    }
  };

  React.useEffect(() => {
    const fetchSavings = async () => {
      try {
        setLoading(true);
        setFetchError(null);

        const response = await fetch(`${API_BASE_URL}/api/cashier/savings/accounts`);
        const result = await response.json();

        if (!response.ok || !result?.success) {
          throw new Error(result?.detail || 'Failed to load savings accounts.');
        }

        const rows = (result.data || []).map((row) => ({
          ID: row.id,
          name: row.member_name || 'Unknown Member',
          amount: formatCurrency(row.amount),
          date: row.date_opened ? new Date(row.date_opened).toLocaleDateString('en-US') : 'N/A',
          status: row.status || 'ACTIVE',
        }));

        setDisplaySavings(rows);
      } catch (error) {
        setFetchError(error?.message || 'Unable to fetch savings accounts.');
        setDisplaySavings([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSavings();
  }, []);

  const sortedSavings = [...displaySavings].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'amount') {
      const amountA = Number(String(a.amount || '').replace(/[^\d.-]/g, ''));
      const amountB = Number(String(b.amount || '').replace(/[^\d.-]/g, ''));
      return amountB - amountA;
    }
    return new Date(b.date) - new Date(a.date);
  });

  const filteredSavings = sortedSavings.filter((saving) =>
    saving.name.toLowerCase().includes(searchTerm.toLowerCase())
    || saving.ID.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* SIDEBAR */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Cashier Portal" fallbackRole="Cashier" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        {/* 3. NEW NAVIGATION RENDER LOGIC */}
        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((item) => {
            const Icon = item.icon;

            // If it's a dropdown parent item (like Deposits)
            if (item.isDropdown) {
              return (
                <div key={item.name} className="flex flex-col">
                  {/* Parent Button */}
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

                  {/* Sub-items (Savings, Capital Build-Up) */}
                  {isDepositsOpen && (
                    <div className="flex flex-col mt-1 space-y-1">
                      {item.subItems.map((subItem) => (
                        <NavLink
                          key={subItem.name}
                          to={subItem.path}
                          className={({ isActive }) =>
                            `block pl-11 pr-4 py-2 rounded-md transition-colors ${
                              isActive
                                ? 'text-[#5CBA47] font-semibold' // Active state matches the picture
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

            // Normal NavLink for everything else (Dashboard, Payments, Withdrawals)
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
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input type="text" className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 focus:outline-none focus:ring-2 focus:ring-green-500"></input>
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <p className="ml-4 font-medium">Cashier</p>
        </header>

        {/* Page Content */}
        <main className="p-8">
          
          {/* Search and Filter Bar */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400"/>
                <input 
                  type="text" 
                  placeholder="Search by ID or name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                />
              </div>
              <div className="flex gap-3">
                <select 
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                >
                  <option value="date">Sort by Date</option>
                  <option value="amount">Sort by Amount</option>
                  <option value="name">Sort by Name</option>
                </select>
                <button
                  onClick={() => navigate('/add_savings')}
                  className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
                >
                  <UserPlus size={16} />
                  Add Savings
                </button>
              </div>
            </div>
          </div>

          {/* Enhanced Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="px-6 py-4 font-bold text-sm">Savings ID</th>
                    <th className="px-6 py-4 font-bold text-sm">Member Name</th>
                    <th className="px-6 py-4 font-bold text-sm">Amount</th>
                    <th className="px-6 py-4 font-bold text-sm">Date Opened</th>
                    <th className="px-6 py-4 font-bold text-sm">Status</th>
                    <th className="px-6 py-4 font-bold text-sm text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-gray-500">Loading savings accounts...</td>
                    </tr>
                  ) : fetchError ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-red-600">{fetchError}</td>
                    </tr>
                  ) : null}

                  {!loading && !fetchError && filteredSavings.length > 0 ? (
                    filteredSavings.map((savings, index) => (
                      <tr 
                        key={savings.ID} 
                        className={`border-b border-gray-100  ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <td className="px-6 py-4">
                          <span className="font-semibold text-gray-900">{savings.ID}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-800 font-medium">{savings.name}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-900 font-bold">{savings.amount}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-600 text-sm">{savings.date}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold ${getStatusStyle(savings.status)}`}>
                            {savings.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => navigate(`/Savings_Details/${savings.ID}`)}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 ml-auto cursor-pointer"
                            title="Review Savings"
                          >
                            <CheckCircle size={16} />
                            Review
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : !loading && !fetchError ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                        <Search className="mx-auto mb-2 w-12 h-12 text-gray-300" />
                        <p className="text-lg font-medium">No savings accounts found</p>
                        <p className="text-sm mt-1">Try adjusting your search criteria</p>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Cashier_Savings;