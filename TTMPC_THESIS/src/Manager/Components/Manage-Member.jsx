import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { managerNav } from "../../components/StaffSidebar/configs/manager";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import Breadcrumb from "../../components/Breadcrumb";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Search,
  Bell,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  History,
  Brain,
  Briefcase,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const ITEMS_PER_PAGE = 10;

const Manager_Manage_Member = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);



  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/personal_data_sheet`, { method: "GET", headers: { Accept: "application/json" } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.detail || payload?.message || "Failed to load personal datasheet.");
        }
        setRows(Array.isArray(payload.data) ? payload.data : []);
        addNotification("Member data loaded successfully", "success");
      } catch (err) {
        addNotification(err?.message || "Unable to load personal datasheet.", "error");
        setRows([]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [addNotification]);

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


  return (
    <div className="flex min-h-screen bg-gray-50">
          {/* SIDEBAR (Kept from your original code) */}
          <StaffSidebar portal="Manager" items={managerNav} />
    
          {/* MAIN CONTENT WRAPPER */}
          <div className="flex-1 flex flex-col h-screen overflow-y-auto">
            {/* HEADER (Kept mostly identical) */}
            <StaffTopbar portal="Manager" notifications={<LoanNotificationBell role="manager" />} />

        <main className="p-8">
          <Breadcrumb portal="Manager" page="Manage Member" />
          {/* TITLE */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Manage Member</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Browse personal datasheets for cooperative members.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            {!loading ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Member ID</th>
                    <th className="p-5 font-bold">Name</th>
                    <th className="p-5 font-bold">Email</th>
                    <th className="p-5 font-bold">Contact</th>
                    <th className="p-5 font-bold">Address</th>
                    <th className="p-5 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="p-5 text-sm text-center text-gray-500">No personal datasheet records found.</td></tr>
                  ) : (
                    paginatedRows.map((r) => (
                      <tr key={String(r.id)} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-sm font-semibold text-gray-800">{r.member_id}</td>
                        <td className="p-5 text-sm text-gray-700">{r.full_name}</td>
                        <td className="p-5 text-sm text-gray-700">{r.email}</td>
                        <td className="p-5 text-sm text-gray-700">{r.contact_number}</td>
                        <td className="p-5 text-sm text-gray-700">{r.address}</td>
                        <td className="p-5 text-sm text-center">
                          <button
                            onClick={() => navigate(`/member_details?member_id=${encodeURIComponent(String(r.member_id || ""))}`, { state: { member: r, portal: 'manager' } })}
                            className="btn-enhanced text-member-green font-bold hover:text-green-800 transition-all"
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

export default Manager_Manage_Member;




