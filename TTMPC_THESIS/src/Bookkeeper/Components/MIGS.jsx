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
  Coins,
  Loader2,
  Zap,
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
  const [computing, setComputing] = useState(false);
  const [lastComputeRun, setLastComputeRun] = useState(null);

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
      { name: "Legacy Member Validation", icon: Search },
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
    "Legacy Member Validation": "/legacy-member-validation",
  };
  useEffect(() => {
    const fetchMigsMembers = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/migs/members?year=${encodeURIComponent(yearFilter)}`
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.success) {
          throw new Error(result?.detail || "Failed to load MIGS members.");
        }
        setRows(Array.isArray(result.data) ? result.data : []);
        addNotification(
          `Loaded ${result.count || 0} members for MIGS scoring.`,
          "success"
        );
      } catch (err) {
        setRows([]);
        addNotification(err?.message || "Unable to fetch MIGS members.", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchMigsMembers();
  }, [yearFilter]);

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
    if (statusFilter === "Pending") {
      result = result.filter((r) => r.migs_status == null);
    } else if (statusFilter !== "All Status") {
      result = result.filter((r) => r.migs_status === statusFilter);
    }

    // Year filter is applied server-side via the API call; no client-side filtering needed.

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

  const handleComputeAll = async () => {
    if (computing) return;
    if (!window.confirm(
      "Recompute and label every member's MIGS classification?\n\n" +
      "This saves a snapshot to the system so other modules (loan approval, member view) can use the official label."
    )) {
      return;
    }
    setComputing(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/migs/recompute-all?year=${encodeURIComponent(yearFilter)}`,
        { method: "POST" }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.detail || "Failed to compute MIGS for all members.");
      }
      const total = (result?.inserted || 0) + (result?.updated || 0);
      setLastComputeRun(result?.accrual_date || new Date().toISOString().slice(0, 10));
      addNotification(
        `Labeled ${total} members as of ${result?.accrual_date}. ${result?.errors?.length ? `(${result.errors.length} errors)` : ""}`,
        result?.errors?.length ? "warning" : "success"
      );
    } catch (err) {
      addNotification(err?.message || "Compute failed.", "error");
    } finally {
      setComputing(false);
    }
  };

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
      {computing && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl px-8 py-7 max-w-sm w-full mx-4 border border-gray-200">
            <div className="flex flex-col items-center text-center">
              <div className="relative w-14 h-14 mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-green-100"></div>
                <Loader2 className="w-14 h-14 text-[#2C7A3F] animate-spin" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                Computing MIGS Classifications
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Scoring every member and writing snapshots to the system. This usually takes 30–60 seconds.
              </p>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-[#2C7A3F] h-1.5 rounded-full animate-pulse w-3/4"></div>
              </div>
              <p className="text-[11px] uppercase tracking-wider text-gray-400 mt-3">
                Please don't close this window
              </p>
            </div>
          </div>
        </div>
      )}

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
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-bold text-2xl text-gray-900">MIGS Scoring</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Compute classification for every member and label them in the system.
                {lastComputeRun ? ` Last run: ${lastComputeRun}.` : ""}
              </p>
            </div>
            <button
              onClick={handleComputeAll}
              disabled={computing}
              className="px-4 py-2 rounded-lg bg-[#2C7A3F] hover:bg-[#1f5a2d] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-80 disabled:cursor-not-allowed"
              title="Recompute all members and write the snapshot to member_classification_temporal"
            >
              {computing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Computing...
                </>
              ) : (
                <>
                  <Zap size={15} />
                  Compute All MIGS
                </>
              )}
            </button>
          </div>

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
                <option>Pending</option>
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
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Member Name</th>
                    <th className="p-5 font-bold">ID</th>
                    <th className="p-5 font-bold text-center">Capital</th>
                    <th className="p-5 font-bold text-center">Loan</th>
                    <th className="p-5 font-bold text-center">Savings</th>
                    <th className="p-5 font-bold text-center">Score</th>
                    <th className="p-5 font-bold text-center">Status</th>
                    <th className="p-5 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-5 text-sm text-center text-gray-500">
                        No MIGS scoring records found.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((r) => (
                      <tr key={String(r.id || r.member_id)} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-sm font-medium text-gray-800">{r.full_name}</td>
                        <td className="p-5 text-sm text-gray-600 font-mono text-[12px]">{r.member_id}</td>
                        <td className="p-5 text-sm text-center text-gray-700">₱{(r.capital || 0).toLocaleString()}</td>
                        <td className="p-5 text-sm text-center text-gray-700">₱{(r.loan_balance || 0).toLocaleString()}</td>
                        <td className="p-5 text-sm text-center text-gray-700">₱{(r.savings_balance || 0).toLocaleString()}</td>
                        <td className="p-5 text-sm text-center">
                          {r.migs_score == null ? (
                            <span className="text-gray-400 text-xs italic">Not scored</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <span className="font-bold text-gray-800">{r.migs_score}</span>
                              <span className="text-gray-400">/</span>
                              <span className="text-gray-500">100</span>
                            </div>
                          )}
                        </td>
                        <td className="p-5 text-sm text-center">
                          {r.migs_status == null ? (
                            <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                              Pending
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${getMIGSStatusColor(r.migs_status)}`}>
                              <span>{getMIGSStatusIcon(r.migs_status)}</span>
                              {r.migs_status === "MIGS Qualified" ? "MIGS Qualified" : "Non-MIGS"}
                            </span>
                          )}
                        </td>
                        <td className="p-5 text-sm text-center">
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



