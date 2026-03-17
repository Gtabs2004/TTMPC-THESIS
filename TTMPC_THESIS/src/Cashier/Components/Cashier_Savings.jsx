import React from "react";
import { useNavigate, NavLink } from "react-router-dom";
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
  UserPlus,
  ClipboardList,
  BadgeCheck,
  TrendingUp,
  CheckCircle
} from 'lucide-react';
import Cashier_Dashboard from "./Cashier_Dashboard";
import logo from "../../assets/img/ttmpc logo.png";



const Cashier_Savings = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [displayLoans, setDisplayLoans] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sortBy, setSortBy] = React.useState("date");
  
const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
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

  const getLoanTypeStyle = (type) => {
    switch(type) {
      case 'Regular Savings':
        return 'bg-blue-100 text-blue-800';
      case 'Time-Deposit':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getMigsStyle = (status) => {
    switch(status) {
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const savingsData = [
    { ID: "TTMPCL-001-123", name: "Gero Antoni Tabiolo", type: "Regular Savings", amount: "₱50,000", date: "02-15-2026", status: "ACTIVE"},
    { ID: "TTMPCL-002-123", name: "Erden Jhed Teope", type: "Time-Deposit", amount: "₱25,000", date: "03-12-2026", status: "ACTIVE" },
    { ID: "TTMPCL-003-123", name: "Ashley Nicole Bulotaolo", type: "Time-Deposit", amount: "₱120,000", date: "03-15-2026", status: "ACTIVE"},
    { ID: "TTMPCL-004-123", name: "Romelyn Delos Reyes", type: "Regular Savings", amount: "₱20,000", date: "03-25-2026", status: "PENDING" },
    { ID: "TTMPCL-005-123", name: "Nash Ervine Siaton", type: "Regular Savings", amount: "₱30,000", date: "04-20-2026", status: "ACTIVE"}  
  ];

  const filteredSavings = savingsData.filter(saving => 
    saving.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    saving.ID.toLowerCase().includes(searchTerm.toLowerCase()) ||
    saving.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusStyle = (status) => {
    switch(status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800 border border-green-300';
      case 'PENDING':
        return 'bg-amber-100 text-amber-800 border border-amber-300';
      case 'INACTIVE':
        return 'bg-gray-100 text-gray-800 border border-gray-300';
      default:
        return 'bg-gray-50 text-gray-600';
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
              BOD Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        
        <nav className="flex flex-col gap-2 text-sm flex-grow">
  {(() => {
    const routeMap = {
      "Dashboard": "/Cashier_Dashboard",
      "Savings": "/Cashier_Savings",
    };

    return menuItems.map((item) => {
      const Icon = item.icon;
      const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;

      return (
        <NavLink
          key={item.name}
          to={to}
          className={({ isActive }) =>
            `flex items-center gap-3 p-2 rounded-md transition-colors ${
              isActive
                ? 'bg-green-50 text-green-700 font-semibold'
                : 'text-gray-700 hover:bg-green-50 hover:text-green-700'
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

     
      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8">
          <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
          <input type="text" className=" bg-gray-50  w-52 h-10 rounded-lg border border-gray-300 px-4 
          py-1 focus:outline-none focus:ring-2 focus:ring-green-500"></input>
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
          <Bell className="w-5 h-5"/>
          <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <p>Cashier</p>
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
                  placeholder="Search by ID, name, or type..."
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

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm p-5 ">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Total Savings</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">₱245,000</p>
                </div>
                <CreditCard className="text-green-600 w-10 h-10" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-5 ">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Active Accounts</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{filteredSavings.length}</p>
                </div>
                <Users className="text-blue-600 w-10 h-10" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-5 ">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Pending Review</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{filteredSavings.filter(s => s.status === 'PENDING').length}</p>
                </div>
                <TrendingUp className="text-amber-600 w-10 h-10" />
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
                    <th className="px-6 py-4 font-bold text-sm">Type</th>
                    <th className="px-6 py-4 font-bold text-sm">Amount</th>
                    <th className="px-6 py-4 font-bold text-sm">Date Opened</th>
                    <th className="px-6 py-4 font-bold text-sm">Status</th>
                    <th className="px-6 py-4 font-bold text-sm text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSavings.length > 0 ? (
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
                          <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold ${getLoanTypeStyle(savings.type)}`}>
                            {savings.type}
                          </span>
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
                  ) : (
                    <tr>
                      <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                        <Search className="mx-auto mb-2 w-12 h-12 text-gray-300" />
                        <p className="text-lg font-medium">No savings accounts found</p>
                        <p className="text-sm mt-1">Try adjusting your search criteria</p>
                      </td>
                    </tr>
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

export default Cashier_Savings;