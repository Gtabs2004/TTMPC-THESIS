import React, { useEffect, useMemo, useState } from "react";
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

  const [loans, setLoans] = useState([]);
  const [activeTab, setActiveTab] = useState("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [loanTypeFilter, setLoanTypeFilter] = useState("all");
  const [memberTypeFilter, setMemberTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Manage Member", icon: Users },
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
    "Manage Member": "/manage-member",
    "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans": "/manage-loans",
    Payments: "/payments",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs-scoring",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
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
    } catch (error) {
      setLoadError(error?.message || "Unable to sync approved loans from backend.");
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
    <div className="flex min-h-screen bg-gray-100">
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
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="bg-gray-50 w-72 h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
              placeholder="Search member, loan ID, status"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
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
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
        </header>

        <main className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-bold text-2xl text-gray-800">Manage Loans</h1>
              <p className="text-sm text-gray-500 mt-1">Track loan status, balances, and complete member ledger records.</p>
            </div>
            <button
              type="button"
              onClick={fetchApprovedLoans}
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
            >
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Total Active Loans</p>
                <CreditCard size={16} className="text-[#2C7A3F]" />
              </div>
              <h2 className="mt-2 text-2xl font-bold text-gray-800">{dashboardStats.totalActiveLoans}</h2>
            </div>

            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Outstanding Balance</p>
                <Wallet size={16} className="text-[#2C7A3F]" />
              </div>
              <h2 className="mt-2 text-2xl font-bold text-gray-800">{formatCurrency(dashboardStats.totalOutstanding)}</h2>
            </div>

            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Collected This Month</p>
                <Coins size={16} className="text-[#2C7A3F]" />
              </div>
              <h2 className="mt-2 text-2xl font-bold text-gray-800">{formatCurrency(dashboardStats.collectedThisMonth)}</h2>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-gray-200 shadow-sm mb-4 p-3">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="inline-flex items-center justify-center min-w-6 h-6 rounded-full bg-white border border-gray-200 text-xs font-semibold">
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white border border-gray-200 shadow-sm mb-4 p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={loanTypeFilter}
                  onChange={(event) => setLoanTypeFilter(event.target.value)}
                  className="h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
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
                  className="h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
                >
                  <option value="all">All Member Types</option>
                  <option value="Member">Member</option>
                  <option value="Non-Member">Non-Member</option>
                  <option value="KOICA">KOICA</option>
                </select>
              </div>

              <div className="relative lg:justify-self-end">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="bg-gray-50 w-full lg:w-80 h-10 rounded-lg border border-gray-200 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
                  placeholder="Search loan/member"
                />
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Business Rules: Non-Member accounts are limited to Bonus loans. KOICA users are limited to KOICA or ABF loans.
            </div>

            {loading && (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Syncing approved loans from server...
              </div>
            )}

            {!!loadError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {loadError}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-lg">
            <table className="min-w-full">
              <thead className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Loan ID</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Member Name</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Loan Type</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Loan Amount</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Interest</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Amortization</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Remaining Balance</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Due Date</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLoans.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500 font-medium">
                      No loans found.
                    </td>
                  </tr>
                )}

                {filteredLoans.map((loan) => {
                  return (
                    <tr key={loan.loan_id}>
                      <td className="px-6 py-4 text-sm font-mono text-gray-600">{loan.loan_id}</td>
                      <td className="px-6 py-4 text-sm text-gray-800 font-semibold">{loan.member_name}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${getLoanTypeStyle(loan.loan_type_code)}`}>
                          {loan.loan_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-right font-medium">{formatCurrency(loan.loan_amount)}</td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-right font-medium">{loan.interest_rate}%</td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-right font-medium">{formatCurrency(loan.amortization)}</td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-right font-semibold">{formatCurrency(loan.remaining_balance)}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{loan.due_date}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => navigate(`/bookkeeper-loan-ledger/${loan.loan_id}`, { state: { loan } })}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-4 py-2 text-xs font-semibold text-green-700 border border-green-200 hover:bg-green-100 hover:border-green-300 hover:text-green-800 transition-all duration-150"
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




