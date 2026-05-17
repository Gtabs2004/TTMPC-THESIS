import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
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
  Wallet,
  Coins,
  Eye,
} from "lucide-react";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const getLoanTypeStyle = (code) => {
  const key = String(code || "").toUpperCase();
  if (key === "CONSOLIDATED") return "bg-blue-100 text-blue-700";
  if (key === "EMERGENCY") return "bg-red-100 text-red-700";
  if (key === "BONUS") return "bg-amber-100 text-amber-700";
  if (key === "KOICA" || key === "ABF") return "bg-emerald-100 text-emerald-700";
  return "bg-gray-100 text-gray-700";
};

const getStatusStyle = (status) => {
  const key = String(status || "").toLowerCase();
  if (key.includes("fully")) return "bg-green-100 text-green-700";
  if (key.includes("partial")) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-700";
};

const ManageLoans = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const [loans, setLoans] = useState([]);
  const [activeTab, setActiveTab] = useState("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [loanTypeFilter, setLoanTypeFilter] = useState("all");
  const [memberTypeFilter, setMemberTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Manage Member", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: CreditCard },
    { name: "Payments", icon: CreditCard },
    { name: "Savings Withdrawals", icon: CreditCard },
    { name: "Accounting", icon: Calculator },
    { name: "MIGS Scoring", icon: Activity },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Trail", icon: History },
    { name: "Grocery", icon: CreditCard },
  ];

  const routeMap = {
    Dashboard: "/dashboard",
    "Manage Member": "/manage-member",
    "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans": "/manage-loans",
    Payments: "/payments",
    "Savings Withdrawals": "/bookkeeper-savings-transactions",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
    Grocery: "/grocery",
  };

  const dashboardStats = useMemo(() => {
    const totalActiveLoans = loans.filter((loan) => loan.remaining_balance > 0).length;
    const totalOutstanding = loans.reduce((sum, loan) => sum + Number(loan.remaining_balance || 0), 0);
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const collectedThisMonth = loans
      .flatMap((loan) => loan.payment_history || [])
      .filter((payment) => String(payment.date_paid || "").slice(0, 7) === currentMonthKey)
      .reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0);

    return {
      totalActiveLoans,
      totalOutstanding,
      collectedThisMonth,
    };
  }, [loans]);

  const tabs = useMemo(() => {
    const active = loans.filter((loan) => loan.remaining_balance > 0).length;
    const fullyPaid = loans.filter((loan) => loan.remaining_balance <= 0).length;
    return [
      { key: "active", label: "Active Loans", count: active },
      { key: "fully_paid", label: "Fully Paid", count: fullyPaid },
    ];
  }, [loans]);

  const filteredLoans = useMemo(() => {
    const text = searchTerm.trim().toLowerCase();

    return loans.filter((item) => {
      const tabMatch = activeTab === "active" ? item.remaining_balance > 0 : item.remaining_balance <= 0;
      if (!tabMatch) return false;

      if (loanTypeFilter !== "all" && item.loan_type_code !== loanTypeFilter) return false;
      if (memberTypeFilter !== "all" && item.member_type !== memberTypeFilter) return false;

      if (!text) return true;
      return (
        item.member_name.toLowerCase().includes(text) ||
        item.loan_id.toLowerCase().includes(text) ||
        item.status.toLowerCase().includes(text)
      );
    });
  }, [loans, searchTerm, activeTab, loanTypeFilter, memberTypeFilter]);

  async function fetchApprovedLoans() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/manage-loans`);
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || "Failed to fetch Manage Loans data.");
      }

      const rows = Array.isArray(result?.data?.rows) ? result.data.rows : [];
      setLoans(rows);
      addNotification("Loans data synced successfully", "success");
    } catch (error) {
      addNotification(error?.message || "Unable to sync approved loans from backend.", "error");
      setLoans([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchApprovedLoans();
    const intervalId = window.setInterval(fetchApprovedLoans, 10000);
    return () => window.clearInterval(intervalId);
  }, []);

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
    <div className="flex min-h-screen bg-gray-50">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
             <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Bookkeeper Portal" fallbackRole="Bookkeeper" />
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
        <header className="bg-white h-16 shadow-sm flex items-center justify-between px-8 border-b border-gray-100">
          <div className="flex-1 max-w-2xl">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                className="bg-gray-50 w-full h-10 rounded-lg border border-gray-300 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent shadow-sm hover:border-gray-400 transition-all"
                placeholder="Search member, loan ID, status..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-4 ml-6">
            <button className="relative p-1.5 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
            </button>
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <img
                src="src/assets/img/bookkeeper-profile.png"
                alt="Bookkeeper Profile"
                className="w-8 h-8 rounded-full shadow-sm"
              />
              <PortalTopbarIdentity className="text-sm font-semibold text-gray-700 hidden sm:block" fallbackRole="Bookkeeper" />
            </div>
          </div>
        </header>

        <main className="p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="font-bold text-4xl text-gray-900">Manage Loans</h1>
              <p className="text-base text-gray-600 mt-2">Track loan status, monitor balances, and manage member ledger records in real-time.</p>
            </div>
            <button
              type="button"
              onClick={fetchApprovedLoans}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 active:bg-green-800 transition-colors"
            >
              ↻ Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wider text-gray-600 font-semibold">Total Active Loans</p>
                  <h2 className="mt-3 text-3xl font-bold text-gray-900">{dashboardStats.totalActiveLoans}</h2>
                </div>
                <div className="bg-blue-100 rounded-lg p-3">
                  <CreditCard size={20} className="text-blue-600" />
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wider text-gray-600 font-semibold">Outstanding Balance</p>
                  <h2 className="mt-3 text-3xl font-bold text-gray-900">{formatCurrency(dashboardStats.totalOutstanding)}</h2>
                </div>
                <div className="bg-amber-100 rounded-lg p-3">
                  <Wallet size={20} className="text-amber-600" />
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wider text-gray-600 font-semibold">Collected This Month</p>
                  <h2 className="mt-3 text-3xl font-bold text-gray-900">{formatCurrency(dashboardStats.collectedThisMonth)}</h2>
                </div>
                <div className="bg-green-100 rounded-lg p-3">
                  <Coins size={20} className="text-green-600" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-gray-200 shadow-sm mb-6 p-4">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`inline-flex items-center justify-center min-w-6 h-6 rounded-full text-xs font-semibold ${
                    activeTab === tab.key
                      ? "bg-white/30"
                      : "bg-gray-300 text-gray-700"
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white border border-gray-200 shadow-sm mb-6 p-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={loanTypeFilter}
                  onChange={(event) => setLoanTypeFilter(event.target.value)}
                  className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="all">All Loan Types</option>
                  <option value="CONSOLIDATED">Consolidated</option>
                  <option value="EMERGENCY">Emergency</option>
                  <option value="BONUS">Bonus</option>
                  <option value="KOICA">KOICA</option>
                  <option value="ABF">ABF</option>
                </select>

                <select
                  value={memberTypeFilter}
                  onChange={(event) => setMemberTypeFilter(event.target.value)}
                  className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="all">All Member Types</option>
                  <option value="Member">Member</option>
                  <option value="Non-Member">Non-Member</option>
                  <option value="KOICA">KOICA</option>
                </select>
              </div>

              <div className="relative lg:justify-self-end">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="bg-white w-full lg:w-80 h-10 rounded-lg border border-gray-300 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Search by loan ID, member name..."
                />
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <span className="mt-0.5 font-semibold">Note:</span>
              <span>Non-Members are limited to Bonus loans. KOICA users are limited to KOICA or ABF loans.</span>
            </div>

            {loading && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                Syncing approved loans from server...
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-lg enhanced-table">
            <table className="min-w-full">
              <thead className="bg-green-700 border-b border-gray-200 ">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Loan ID</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Member Name</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Loan Type</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Loan Amount</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-white uppercase tracking-wider">Interest</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-white uppercase tracking-wider">Amortization</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-white uppercase tracking-wider">Remaining</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Due Date</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredLoans.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                          <Eye size={24} className="text-gray-300" />
                        </div>
                        <p className="text-gray-500 font-medium">No loans found</p>
                        <p className="text-gray-400 text-sm">Try adjusting your filters</p>
                      </div>
                    </td>
                  </tr>
                )}

                {filteredLoans.map((loan, index) => {
                  return (
                    <tr key={loan.loan_id} className="table-row-enter hover:bg-green-50 transition-colors duration-200">
                      <td className="px-6 py-4 text-sm font-mono font-bold text-green-700">{loan.loan_id}</td>
                      <td className="px-6 py-4 text-sm text-gray-800 font-semibold">{loan.member_name}</td>
                      <td className="px-6 py-4">
                        <span className={`badge-animated ${getLoanTypeStyle(loan.loan_type_code)}`}>
                          {loan.loan_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-800 font-semibold">{formatCurrency(loan.loan_amount)}</td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-right font-medium">{loan.interest_rate}%</td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-right font-medium">{formatCurrency(loan.amortization)}</td>
                      <td className="px-6 py-4 text-sm text-right font-bold">
                        <span className={loan.remaining_balance > 0 ? 'text-amber-600' : 'text-green-600'}>
                          {formatCurrency(loan.remaining_balance)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 font-medium">{loan.due_date}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => navigate(`/bookkeeper-loan-ledger/${loan.loan_id}`, { state: { loan } })}
                          className="btn-enhanced inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                        >
                          <Eye size={14} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ManageLoans;




