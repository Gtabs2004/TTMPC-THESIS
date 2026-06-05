import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { LayoutDashboard, Users, FileText, CreditCard, Calculator, Activity, BarChart3, History, Search, Bell, ChevronLeft, ChevronRight, X, Briefcase, Wallet, Coins } from "lucide-react";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const ITEMS_PER_PAGE = 10;

const Manage_Member = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [emailFilter, setEmailFilter] = useState("all"); // all | with | without
  const [contactFilter, setContactFilter] = useState("all"); // all | with | without
  const [addressFilter, setAddressFilter] = useState("all"); // all | with | without
  const [sortOrder, setSortOrder] = useState("name_asc"); // name_asc | name_desc | newest | oldest

  const hasActiveFilters =
    emailFilter !== "all" ||
    contactFilter !== "all" ||
    addressFilter !== "all" ||
    sortOrder !== "name_asc";

  const clearFilters = () => {
    setEmailFilter("all");
    setContactFilter("all");
    setAddressFilter("all");
    setSortOrder("name_asc");
  };

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
      if (key) {
        const matchesSearch =
          String(r.member_id || "").toLowerCase().includes(key) ||
          String(r.full_name || "").toLowerCase().includes(key) ||
          String(r.email || "").toLowerCase().includes(key);
        if (!matchesSearch) return false;
      }
      if (!matchPresence(emailFilter, r.email)) return false;
      if (!matchPresence(contactFilter, r.contact_number)) return false;
      if (!matchPresence(addressFilter, r.address)) return false;
      return true;
    });

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
  }, [query, rows, emailFilter, contactFilter, addressFilter, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, rows, emailFilter, contactFilter, addressFilter, sortOrder]);

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

      <div className="flex-1 flex flex-col">
       <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
                          <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            type="text"
                            className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm placeholder:text-gray-400 transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#2C7A3F] focus:bg-white focus:border-transparent hover:border-gray-300"
                            placeholder="Search..."
                          ></input>
                        </div>
                        <button className="ml-6 relative p-1.5 rounded-full text-gray-500 hover:bg-gray-100 active:scale-95 transition-all duration-150 ease-in-out">
                          <Bell className="w-5 h-5"/>
                          <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
                        </button>
                        <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
                          <img src="/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200"></img>
                          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="BOD" />
                        </div>
                      </header>
              

        <main className="p-8">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h1 className="font-bold text-2xl text-gray-900 tracking-tight">Manage Member</h1>
              <p className="text-sm text-gray-500 mt-1">
                {loading ? "Loading records..." : `${filtered.length} member${filtered.length === 1 ? "" : "s"} found`}
              </p>
            </div>
          </div>

          <div
            className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex flex-wrap items-end gap-4"
            style={{ boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)" }}
          >
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Email</label>
              <select
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value)}
                className="h-9 px-3 pr-8 rounded-md border border-gray-200 bg-white text-sm text-gray-700 transition-all duration-150 ease-in-out hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F] focus:border-transparent"
              >
                <option value="all">All</option>
                <option value="with">With email</option>
                <option value="without">Without email</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Contact</label>
              <select
                value={contactFilter}
                onChange={(e) => setContactFilter(e.target.value)}
                className="h-9 px-3 pr-8 rounded-md border border-gray-200 bg-white text-sm text-gray-700 transition-all duration-150 ease-in-out hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F] focus:border-transparent"
              >
                <option value="all">All</option>
                <option value="with">With contact</option>
                <option value="without">Without contact</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Address</label>
              <select
                value={addressFilter}
                onChange={(e) => setAddressFilter(e.target.value)}
                className="h-9 px-3 pr-8 rounded-md border border-gray-200 bg-white text-sm text-gray-700 transition-all duration-150 ease-in-out hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F] focus:border-transparent"
              >
                <option value="all">All</option>
                <option value="with">With address</option>
                <option value="without">Without address</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Sort by</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="h-9 px-3 pr-8 rounded-md border border-gray-200 bg-white text-sm text-gray-700 transition-all duration-150 ease-in-out hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F] focus:border-transparent"
              >
                <option value="name_asc">Name (A–Z)</option>
                <option value="name_desc">Name (Z–A)</option>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>

            {hasActiveFilters ? (
              <button
                onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-gray-200 bg-white text-sm text-gray-600 font-medium transition-all duration-150 ease-in-out hover:bg-gray-50 hover:border-gray-300 hover:text-[#1D6021] active:scale-[0.97]"
              >
                <X className="w-3.5 h-3.5" />
                Clear filters
              </button>
            ) : null}
          </div>

          <div
            className="bg-white rounded-lg border border-gray-200 overflow-hidden transition-shadow duration-150 ease-in-out hover:shadow-md"
            style={{ boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)" }}
          >
            {loading ? <p className="p-6 text-sm text-gray-500">Loading personal datasheet...</p> : null}
            {error ? <p className="p-6 text-sm text-red-600">{error}</p> : null}
            {!loading && !error ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-green-700 text-white uppercase text-[13px] tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5 text-left font-semibold">Member ID</th>
                      <th className="px-5 py-3.5 text-left font-semibold">Name</th>
                      <th className="px-5 py-3.5 text-left font-semibold">Email</th>
                      <th className="px-5 py-3.5 text-left font-semibold">Contact</th>
                      <th className="px-5 py-3.5 text-left font-semibold">Address</th>
                      <th className="px-5 py-3.5 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-500">No personal datasheet records found.</td></tr>
                    ) : (
                      paginatedRows.map((r) => (
                        <tr
                          key={String(r.id)}
                          className="border-t border-gray-100 transition-colors duration-150 ease-in-out hover:bg-green-50/40 group"
                        >
                          <td className="px-5 py-3.5 font-semibold text-gray-800">{r.member_id}</td>
                          <td className="px-5 py-3.5 text-gray-700">{r.full_name}</td>
                          <td className="px-5 py-3.5 text-gray-700">{r.email}</td>
                          <td className="px-5 py-3.5 text-gray-700">{r.contact_number}</td>
                          <td className="px-5 py-3.5 text-gray-700">{r.address}</td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              onClick={() => navigate(`/member_details?member_id=${encodeURIComponent(String(r.member_id || ""))}&portal=bookkeeper`, { state: { member: r, portal: "bookkeeper" } })}
                              className="inline-flex items-center px-3 py-1.5 rounded-md text-[#1D6021] font-semibold border border-transparent hover:border-[#1D6021]/20 hover:bg-[#1D6021]/5 active:scale-[0.97] transition-all duration-150 ease-in-out"
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

          <div className="flex items-center justify-center p-6 gap-2 border-t border-gray-100">
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
        </main>
      </div>
    </div>
  );
};

export default Manage_Member;
