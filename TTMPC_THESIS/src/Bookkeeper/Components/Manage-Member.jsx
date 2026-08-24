import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PiggyBank,
  X,
  Briefcase,
  Wallet,
  Coins,
  ShieldAlert,
  Brain,
  User,
} from "lucide-react";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const ITEMS_PER_PAGE = 10;

const Manage_Member = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Filtering & Sorting State
  const [query, setQuery] = useState("");
  const [addressFilter, setAddressFilter] = useState("all"); // all | with | without
  const [sortOrder, setSortOrder] = useState("name_asc"); // name_asc | name_desc | newest | oldest
  const [currentPage, setCurrentPage] = useState(1);
  const [isSavingsOpen, setIsSavingsOpen] = useState(false);

  const hasActiveFilters = addressFilter !== "all" || sortOrder !== "name_asc" || query !== "";

  const clearFilters = () => {
    setQuery("");
    setAddressFilter("all");
    setSortOrder("name_asc");
  };

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Manage Member", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: Briefcase },
    
      { name: "Credit Risk", icon: Brain },
    { name: "Payments", icon: Wallet },
    {
      name: "Savings Accounts",
      icon: PiggyBank,
      isDropdown: true,
      subItems: [
        { name: "All Accounts", path: "/bookkeeper-savings-accounts" },
        { name: "Savings Withdrawals", path: "/bookkeeper-savings-transactions" },
      ],
    },
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
    Delinquency: "/delinquency",
    "Credit Risk": "/bookkeeper-credit-risk",
    Payments: "/payments",
    "Savings Withdrawals": "/bookkeeper-savings-transactions",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
    Grocery: "/grocery",
    "Legacy Member Validation": "/legacy-member-validation",
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/personal_data_sheet`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.detail || payload?.message || "Failed to load personal datasheet.");
        }
        setRows(Array.isArray(payload.data) ? payload.data : []);
      } catch (err) {
        setError(err?.message || "Unable to load personal datasheet.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filtered = useMemo(() => {
    const key = String(query || "").trim().toLowerCase();
    const hasValue = (v) => String(v || "").trim().length > 0;

    const matchPresence = (mode, value) => {
      if (mode === "with") return hasValue(value);
      if (mode === "without") return !hasValue(value);
      return true;
    };

    const result = rows.filter((r) => {
      // 1. Search Query
      if (key) {
        const matchesSearch =
          String(r.member_id || "").toLowerCase().includes(key) ||
          String(r.full_name || "").toLowerCase().includes(key) ||
          String(r.email || "").toLowerCase().includes(key);
        if (!matchesSearch) return false;
      }
      // 2. Address Filter
      if (!matchPresence(addressFilter, r.address)) return false;
      
      return true;
    });

    // 3. Sort Order
    const sorted = [...result];
    sorted.sort((a, b) => {
      if (sortOrder === "name_asc") {
        return String(a.full_name || "").localeCompare(String(b.full_name || ""));
      }
      if (sortOrder === "name_desc") {
        return String(b.full_name || "").localeCompare(String(a.full_name || ""));
      }
      const ta = new Date(a.created_at || 0).getTime() || 0;
      const tb = new Date(b.created_at || 0).getTime() || 0;
      return sortOrder === "newest" ? tb - ta : ta - tb;
    });

    return sorted;
  }, [query, rows, addressFilter, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, rows, addressFilter, sortOrder]);

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-primary">TTMPC</h1>
             <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Bookkeeper Portal" fallbackRole="Bookkeeper" />
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
                    onClick={() => setIsSavingsOpen(!isSavingsOpen)}
                    className="flex items-center justify-between p-2 rounded-md text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors w-full"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={20} />
                      <span>{item.name}</span>
                    </div>
                    {isSavingsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {isSavingsOpen && (
                    <div className="flex flex-col mt-1 space-y-1">
                      {item.subItems.map((subItem) => (
                        <NavLink
                          key={subItem.name}
                          to={subItem.path}
                          className={({ isActive }) =>
                            `block pl-11 pr-4 py-2 rounded-md transition-colors text-[13px] ${
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
                to={routeMap[item.name]}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2 rounded-md transition-all duration-150 ease-in-out ${
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
        <button onClick={handleSignOut} className="mt-auto w-full rounded-md p-2 text-xs bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white font-bold transition-all duration-150 ease-in-out shadow-sm hover:shadow">Sign out</button>
      </aside>

      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shrink-0 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <LoanNotificationBell role="bookkeeper" />
          <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
              <User className="w-4.5 h-4.5" />
            </div>
            <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
          </div>
        </header>
              
        <main className="p-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
              <span>Bookkeeper</span>
              <ChevronRight className="w-4 h-4 text-gray-300" />
              <span className="text-primary">Members Profile</span>
          </div>
          <div className="flex items-end justify-between mb-6">
            <div>
            </div>
          </div>

          {/* DEDICATED SEARCH & FILTER BAR */}
          <div
            className="bg-white rounded-xl border border-gray-200 p-5 mb-6 flex flex-col lg:flex-row items-end gap-5 shadow-sm"
          >
            {/* Primary Search Bar */}
            <div className="flex-1 w-full">
              <label className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1.5 block">Search Members</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-2.5 h-5 w-5 text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  type="text"
                  className="w-full pl-11 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/50 focus:border-[#2C7A3F] transition-all"
                  placeholder="Search by name, ID, or email..."
                />
              </div>
            </div>

            {/* Sort & Address Filters */}
            <div className="flex flex-wrap items-end gap-4 w-full lg:w-auto">
              <div className="flex flex-col gap-1.5 min-w-[160px]">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-bold">Sort by</label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="w-full h-10 px-3 pr-8 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 transition-all focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/50 focus:border-[#2C7A3F] hover:border-gray-300"
                >
                  <option value="name_asc">Name (A–Z)</option>
                  <option value="name_desc">Name (Z–A)</option>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[160px]">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-bold">Address</label>
                <select
                  value={addressFilter}
                  onChange={(e) => setAddressFilter(e.target.value)}
                  className="w-full h-10 px-3 pr-8 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 transition-all focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/50 focus:border-[#2C7A3F] hover:border-gray-300"
                >
                  <option value="all">All Address</option>
                  <option value="with">With Address</option>
                  <option value="without">Without Address</option>
                </select>
              </div>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="h-10 px-4 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 font-bold transition-all hover:bg-red-50 hover:border-red-200 hover:text-red-600 active:scale-95 flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* TABLE SECTION */}
          <div
            className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm transition-shadow duration-150 ease-in-out hover:shadow-md"
          >
            {loading ? <p className="p-8 text-sm font-medium text-gray-500 flex justify-center">Loading personal datasheet...</p> : null}
            {error ? <p className="p-8 text-sm font-medium text-red-600 flex justify-center">{error}</p> : null}
            {!loading && !error ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-member-green text-xs uppercase tracking-wider text-white font-extrabold">
                      <th className="p-5 font-bold">Member ID</th>
                      <th className="p-5 font-bold">Name</th>
                      <th className="p-5 font-bold">Email</th>
                      <th className="p-5 font-bold">Contact</th>
                      <th className="p-5 font-bold">Address</th>
                      <th className="p-5 font-bold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-sm font-medium text-center text-gray-500 bg-gray-50/50">No members match your search criteria.</td></tr>
                    ) : (
                      paginatedRows.map((r) => (
                        <tr
                          key={String(r.id)}
                          className="border-b border-gray-100 hover:bg-green-50/30 transition-colors"
                        >
                          <td className="p-5 text-sm font-bold text-gray-800">{r.member_id}</td>
                          <td className="p-5 text-sm font-semibold text-gray-700">{r.full_name}</td>
                          <td className="p-5 text-sm text-gray-600">{r.email}</td>
                          <td className="p-5 text-sm text-gray-600">{r.contact_number}</td>
                          <td className="p-5 text-sm text-gray-600">{r.address}</td>
                          <td className="p-5 text-sm text-right">
                            <button
                              onClick={() => navigate(`/member_details?member_id=${encodeURIComponent(String(r.member_id || ""))}&portal=bookkeeper`, { state: { member: r, portal: "bookkeeper" } })}
                              className="inline-flex items-center px-4 py-1.5 rounded-md text-member-green font-bold border border-member-green/30 bg-member-green/5 hover:bg-member-green hover:text-white active:scale-95 transition-all duration-200"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-center p-6 gap-2 mt-4">
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
              return Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 flex items-center justify-center rounded-full border text-xs font-bold transition-colors ${
                  page === currentPage
                    ? "bg-member-green text-white border-member-green"
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
        </main>
      </div>
    </div>
  );
};

export default Manage_Member;