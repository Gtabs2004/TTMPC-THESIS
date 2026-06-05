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
  ChevronLeft,
  ChevronRight,
  Eye,
  Briefcase,
  Wallet,
  Coins
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const ITEMS_PER_PAGE = 10;

const MIGS = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [yearFilter, setYearFilter] = useState("2026");
  const [sortBy, setSortBy] = useState("Name A-Z");

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Manage Member", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: Briefcase },
    { name: "Payments", icon: Wallet },
    { name: "Savings Withdrawals", icon: CreditCard },
    { name: "Accounting", icon: Calculator },
    { name: "MIGS Scoring", icon: Activity },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Trail", icon: History },
    { name: "Grocery", icon: Coins },
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

  const mockData = [
    { id: 1, full_name: "Adelaida Soriano", member_id: "TTMPC-2024-051", capital: 9800, loan_balance: 98000, savings_balance: 52000, migs_score: 93, migs_status: "MIGS Qualified" },
    { id: 2, full_name: "Adoracion Salcedo", member_id: "TTMPC-2024-021", capital: 9200, loan_balance: 92000, savings_balance: 46000, migs_score: 88, migs_status: "MIGS Qualified" },
    { id: 3, full_name: "Aida Valdez", member_id: "TTMPC-2024-117", capital: 3900, loan_balance: 29000, savings_balance: 9000, migs_score: 47, migs_status: "Non-MIGS" },
    { id: 4, full_name: "Alfonsina Yap", member_id: "TTMPC-2024-143", capital: 7400, loan_balance: 67500, savings_balance: 30500, migs_score: 78, migs_status: "MIGS Qualified" },
    { id: 5, full_name: "Alfredo Castillo", member_id: "TTMPC-2024-016", capital: 10500, loan_balance: 105000, savings_balance: 55000, migs_score: 100, migs_status: "MIGS Qualified" },
    { id: 6, full_name: "Amalia Tayag", member_id: "TTMPC-2024-093", capital: 7700, loan_balance: 71000, savings_balance: 32000, migs_score: 73, migs_status: "MIGS Qualified" },
    { id: 7, full_name: "Ambrosio Samson", member_id: "TTMPC-2024-060", capital: 1600, loan_balance: 11000, savings_balance: 3000, migs_score: 10, migs_status: "Non-MIGS" },
    { id: 8, full_name: "Ana Cruz", member_id: "TTMPC-2024-003", capital: 3500, loan_balance: 15000, savings_balance: 8000, migs_score: 23, migs_status: "Non-MIGS" },
    { id: 9, full_name: "Angelita Domingo", member_id: "TTMPC-2024-029", capital: 8800, loan_balance: 88000, savings_balance: 40000, migs_score: 88, migs_status: "MIGS Qualified" },
    { id: 10, full_name: "Apolinario Bacani", member_id: "TTMPC-2024-073", capital: 7400, loan_balance: 67000, savings_balance: 30000, migs_score: 73, migs_status: "MIGS Qualified" },
  ];

  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setRows(mockData);
      setLoading(false);
      addNotification("MIGS scoring data loaded successfully", "success");
    }, 500);
  }, []);

  const filtered = useMemo(() => {
    let result = rows;

    // Search filter
    const key = String(query || "").trim().toLowerCase();
    if (key) {
      result = result.filter((r) =>
        String(r.member_id || "").toLowerCase().includes(key) ||
        String(r.full_name || "").toLowerCase().includes(key)
      );
    }

    // Status filter
    if (statusFilter !== "All Status") {
      result = result.filter((r) => r.migs_status === statusFilter);
    }

    // Year filter (assuming created_year field exists)
    if (yearFilter !== "2026") {
      result = result.filter((r) => String(r.created_year || "") === yearFilter);
    }

    // Sort
    if (sortBy === "Name A-Z") {
      result.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    } else if (sortBy === "Name Z-A") {
      result.sort((a, b) => (b.full_name || "").localeCompare(a.full_name || ""));
    } else if (sortBy === "Score High-Low") {
      result.sort((a, b) => (b.migs_score || 0) - (a.migs_score || 0));
    } else if (sortBy === "Score Low-High") {
      result.sort((a, b) => (a.migs_score || 0) - (b.migs_score || 0));
    }

    return result;
  }, [query, rows, statusFilter, yearFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, rows, statusFilter, yearFilter, sortBy]);

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const getMIGSStatusColor = (status) => {
    if (status === "MIGS Qualified") {
      return "bg-green-100 text-green-700 border-green-300";
    }
    return "bg-red-100 text-red-700 border-red-300";
  };

  const getMIGSStatusIcon = (status) => {
    return status === "MIGS Qualified" ? "✓" : "○";
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="fixed inset-y-0 left-0 bg-white w-64 p-4 flex flex-col border-r border-gray-200 z-30">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Bookkeeper Portal" fallbackRole="Bookkeeper" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={routeMap[item.name]}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2 rounded-md transition-colors ${
                    isActive ? "bg-green-50 text-green-700 font-semibold" : "text-gray-700 hover:bg-green-50 hover:text-green-700"
                  }`
                }
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        <button onClick={handleSignOut} className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors">
          Sign out
        </button>
      </aside>

      <div className="flex-1 flex flex-col ml-64">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button className="relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
            </button>
            <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
              <img src="/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200" />
              <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
            </div>
          </div>
        </header>

        <main className="p-8 flex-1 overflow-y-auto">
          <h1 className="font-bold text-2xl mb-6">MIGS Scoring</h1>

          {/* Filters Section */}
          <div className="flex gap-4 mb-6 items-center justify-between">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="text"
                className="bg-gray-50 w-full h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
                placeholder="Search by name or ID..."
              />
            </div>

            <div className="flex gap-4 items-center">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
              >
                <option>All Status</option>
                <option>MIGS Qualified</option>
                <option>Non-MIGS</option>
              </select>

              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
              >
                <option>2026</option>
                <option>2025</option>
                <option>2024</option>
                <option>2023</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
              >
                <option>Name A-Z</option>
                <option>Name Z-A</option>
                <option>Score High-Low</option>
                <option>Score Low-High</option>
              </select>
            </div>
          </div>

          {/* Table Section */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            {loading ? (
              <p className="p-6 text-blue-700 text-center">Loading MIGS scoring data...</p>
            ) : null}
            {!loading ? (
              <table className="w-full text-sm enhanced-table">
                <thead className="bg-gradient-to-r from-green-700 to-green-600 text-white text-center uppercase text-[13px] tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Member Name</th>
                    <th className="px-4 py-3 text-left font-semibold">ID</th>
                    <th className="px-4 py-3 text-center font-semibold">Capital</th>
                    <th className="px-4 py-3 text-center font-semibold">Loan</th>
                    <th className="px-4 py-3 text-center font-semibold">Savings</th>
                    <th className="px-4 py-3 text-center font-semibold">Score</th>
                    <th className="px-4 py-3 text-center font-semibold">Status</th>
                    <th className="px-4 py-3 text-center font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        No MIGS scoring records found.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((r) => (
                      <tr key={String(r.id || r.member_id)} className="table-row-enter hover:bg-green-50 transition-colors duration-200">
                        <td className="px-4 py-3 font-medium text-gray-800">{r.full_name}</td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-[12px]">{r.member_id}</td>
                        <td className="px-4 py-3 text-center text-gray-700">₱{(r.capital || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center text-gray-700">₱{(r.loan_balance || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center text-gray-700">₱{(r.savings_balance || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="font-bold text-gray-800">{r.migs_score || 0}</span>
                            <span className="text-gray-400">/</span>
                            <span className="text-gray-500">100</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`badge-animated inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${getMIGSStatusColor(r.migs_status)}`}>
                            <span>{getMIGSStatusIcon(r.migs_status)}</span>
                            {r.migs_status === "MIGS Qualified" ? "MIGS Qualified" : "Non-MIGS"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => navigate(`/migs-evaluate?member_id=${encodeURIComponent(String(r.member_id || ""))}`)}
                            className="btn-enhanced text-[#1D6021] font-bold hover:text-[#0d4a1a] transition-colors flex items-center justify-center gap-1"
                          >
                            <Eye className="w-4 h-4" />
                            Evaluate
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : null}
          </div>

          {/* Pagination */}
          {!loading && filtered.length > 0 ? (
            <div className="flex items-center justify-center p-6 gap-2 border-t border-gray-100 mt-4">
              <button
                className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {(() => {
                const groupStart = Math.floor((currentPage - 1) / 5) * 5 + 1;
                const groupEnd = Math.min(groupStart + 4, totalPages);
                return Array.from(
                  { length: groupEnd - groupStart + 1 },
                  (_, i) => groupStart + i
                ).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 flex items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                      page === currentPage
                        ? "bg-[#16A34A] text-white border-[#16A34A]"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {page}
                  </button>
                ));
              })()}

              <button
                className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
};

export default MIGS;



