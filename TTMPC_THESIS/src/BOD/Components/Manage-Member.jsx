import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import { LayoutDashboard, Users, CalendarCheck, Archive, Search, Bell, ChevronLeft, ChevronRight } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const ITEMS_PER_PAGE = 10;

const BOD_Manage_Member = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const menuItems = [
    { section: "BOD", items: [
      { name: "Dashboard", icon: LayoutDashboard },
      { name: "Member Approvals", icon: Users },
      { name: "Manage Member", icon: Users },
    ]},
    { section: "SECRETARY", items: [
      { name: "Training Attendance", icon: CalendarCheck },
      { name: "Membership Records", icon: Archive },
    ]},
  ];

  const routeMap = {
    "Dashboard": "/BOD-dashboard",
    "Member Approvals": "/member-approvals",
    "Manage Member": "/bod-manage-member",
    "Training Attendance": "/Secretary_Attendance",
    "Membership Records": "/Secretary_Records",
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/personal_data_sheet`, { method: "GET", headers: { Accept: "application/json" } });
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
    if (!key) return rows;
    return rows.filter((r) =>
      String(r.member_id || "").toLowerCase().includes(key) ||
      String(r.full_name || "").toLowerCase().includes(key) ||
      String(r.email || "").toLowerCase().includes(key)
    );
  }, [query, rows]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, rows]);

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
    <div className="flex min-h-screen bg-gray-100">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="BOD Portal" fallbackRole="BOD" />
          </div>
        </div>
        <hr className="w-full border-gray-200 mb-6" />
        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((section) => (
            <div key={section.section} className="mb-4 flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">{section.section}</p>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink key={item.name} to={routeMap[item.name]} className={({ isActive }) => `flex items-center gap-3 p-2 rounded-md transition-colors ${isActive ? "bg-green-50 text-green-700 font-semibold" : "text-gray-700 hover:bg-green-50 hover:text-green-700"}`}>
                    <Icon size={20} /><span>{item.name}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <button onClick={handleSignOut} className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors">Sign out</button>
      </aside>

      <div className="flex-1 flex flex-col">
         <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
                         <div className="relative">
                           <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
                           <input type="text" className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-200 pl-10 pr-4 
                           py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]" placeholder="Search..."></input>
                         </div>
                         <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
                           <Bell className="w-5 h-5"/>
                           <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
                         </button>
                         <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
                           <img src="src/assets/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200"></img>
                           <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="BOD" />
                         </div>
                       </header>

        <main className="p-8">
          <h1 className="font-bold text-2xl mb-6">Manage Member</h1>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            {loading ? <p className="p-6 text-blue-700">Loading personal datasheet...</p> : null}
            {error ? <p className="p-6 text-red-600">{error}</p> : null}
            {!loading && !error ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Member ID</th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Contact</th>
                    <th className="px-4 py-3 text-left">Address</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No personal datasheet records found.</td></tr>
                  ) : (
                    paginatedRows.map((r) => (
                      <tr key={String(r.id)} className="border-t border-gray-100">
                        <td className="px-4 py-3 font-semibold text-gray-800">{r.member_id}</td>
                        <td className="px-4 py-3 text-gray-700">{r.full_name}</td>
                        <td className="px-4 py-3 text-gray-700">{r.email}</td>
                        <td className="px-4 py-3 text-gray-700">{r.contact_number}</td>
                        <td className="px-4 py-3 text-gray-700">{r.address}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => navigate(`/member_details?member_id=${encodeURIComponent(String(r.member_id || ""))}`, { state: { member: r } })}
                            className="text-[#1D6021] font-bold hover:underline transition-all"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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

export default BOD_Manage_Member;
