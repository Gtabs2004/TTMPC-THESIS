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
  CalendarCheck,
  CalendarDays,
  Eye,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Download,
  Archive,
  AlertTriangle,
  ShieldCheck,
  X as CloseIcon,
} from 'lucide-react';
import logo from "../../assets/img/ttmpc logo.png";
import NotificationBell from "./NotificationBell";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

/// naku

const Secretary_Records = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [termTarget, setTermTarget] = useState(null);
  const [termForm, setTermForm] = useState({ resolution_no: "", resolution_date: "", effective_date: "", reason: "", notes: "" });
  const [termBusy, setTermBusy] = useState(false);

  const openTerminate = (member) => {
    setTermForm({ resolution_no: "", resolution_date: "", effective_date: "", reason: "", notes: "" });
    setTermTarget(member);
  };

  const submitTerminate = async () => {
    if (!termTarget?.applicant_id) return;
    if (!termForm.reason.trim()) {
      addNotification("Reason is required.", "error");
      return;
    }
    setTermBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/staff/termination/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: termTarget.applicant_id,
          resolution_no: termForm.resolution_no || null,
          resolution_date: termForm.resolution_date || null,
          effective_date: termForm.effective_date || null,
          reason: termForm.reason,
          notes: termForm.notes || null,
          requested_by_role: "secretary",
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.detail || "Request failed.");
      }
      addNotification("Termination submitted. Account locked; awaiting BOD confirmation.", "success");
      setTermTarget(null);
    } catch (err) {
      addNotification(err?.message || "Failed to submit termination.", "error");
    } finally {
      setTermBusy(false);
    }
  };
  
   const menuItems = [
      {
        section: "BOD",
        items: [
          { name: "Dashboard", icon: LayoutDashboard },
          { name: "Member Approvals", icon: Users },
          { name: "Loan Approvals", icon: ShieldCheck },
          { name: "Manage Loans", icon: CreditCard },
          { name: "Manage Member", icon: Users },
          { name: "Audit Log", icon: History },
          { name: "Loan Policies", icon: FileText },
        ],
      },
      {
        section: "SECRETARY",
        items: [
          { name: "Training Attendance", icon: CalendarCheck },
          { name: "General Assembly", icon: CalendarDays },
          { name: "Membership Records", icon: Archive },
        ],
      },
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

  const formatCurrency = (value) => `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
  };

  useEffect(() => {
    async function loadRecords() {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/secretary/membership-records`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.detail || payload?.message || "Failed to load membership records.");
        }

        setRecords(Array.isArray(payload.data) ? payload.data : []);
        addNotification("Membership records loaded successfully", "success");
      } catch (err) {
        addNotification(err?.message || "Unable to load membership records.", "error");
        setRecords([]);
      } finally {
        setLoading(false);
      }
    }

    loadRecords();
  }, [addNotification]);

  const filteredRecords = useMemo(() => {
    const key = String(searchQuery || "").trim().toLowerCase();
    if (!key) return records;
    return records.filter((row) =>
      String(row.applicant_id || "").toLowerCase().includes(key) ||
      String(row.applicant_name || "").toLowerCase().includes(key)
    );
  }, [records, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / itemsPerPage));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRecords.slice(start, start + itemsPerPage);
  }, [filteredRecords, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, records]);

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Secretary Portal" fallbackRole="Secretary" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />  

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
             const routeMap = {
    "Dashboard": "/BOD-dashboard",
    "Member Approvals": "/member-approvals",
    "Loan Approvals": "/bod-loan-approvals",
    "Manage Loans": "/bod-manage-loans",
    "Manage Member": "/bod-manage-member",
    "Audit Log": "/bod-audit-log",
    "Loan Policies": "/bod-loan-policies",
    "Training Attendance": "/Secretary_Attendance",
    "General Assembly": "/Secretary_General_Assembly",
    "Membership Records": "/Secretary_Records",
  };
        
            return menuItems.map((sectionGroup) => (
              <div key={sectionGroup.section} className="mb-4 flex flex-col gap-2">
                <p className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">
                  {sectionGroup.section}
                </p>
                
                {sectionGroup.items.map((item) => {
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
                })}
              </div>
            ));
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
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
                 <div className="relative">
                   <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
                   <input
                     type="text"
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
                     placeholder="Search..."
                   />
                 </div>
                 <NotificationBell />
                 <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
                   <img src="/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200"></img>
                   <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="BOD" />
                 </div>
               </header>
       
        <main className="p-8">
    
          <div className="bg-white w-full rounded-2xl m-auto mt-6 p-8 shadow-sm border border-gray-100 min-h-fit">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-800">All Members</h2>
              <div className="flex items-center gap-3">
                  <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                      <Download className="w-4 h-4" />
                      Export List
                  </button>
                  
              </div>
            </div>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                  <th className="p-5 font-bold">Membership Id</th>
                  <th className="p-5 font-bold">Member Name</th>
                  <th className="p-5 font-bold">Date Joined</th>
                  <th className="p-5 font-bold">Shares</th>
                  <th className="p-5 font-bold">Paid Up Capital</th>
                  <th className="p-5 font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="p-5 text-sm text-center text-blue-700">Loading membership records...</td>
                  </tr>
                )}
                {paginatedRecords.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="p-5 text-sm text-center text-gray-500">No records found.</td>
                  </tr>
                )}
                {paginatedRecords.map((member, index) => (
                  <tr key={`${member.member_uuid}-${index}`} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="p-5 font-semibold text-[#1a4a2f]">{member.applicant_id}</td>
                    <td className="p-5 text-gray-800 font-medium">{member.applicant_name}</td>
                    <td className="p-5 text-gray-800 font-medium">{formatDate(member.date_joined)}</td>
                    <td className="p-5 text-gray-800 font-medium">{Number(member.shares || 0).toFixed(2)}</td>
                    <td className="p-5 text-gray-800 font-medium">{formatCurrency(member.paid_up_capital)}</td>
                    <td className="p-5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/record-details/${member.member_uuid}`)}
                          className="btn-enhanced text-[#1e9e4a] hover:text-green-800 transition-colors p-1"
                          title="View record"
                        >
                          <Eye size={20} strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => openTerminate(member)}
                          className="text-red-600 hover:text-red-700 transition-colors p-1"
                          title="Terminate member"
                        >
                          <AlertTriangle size={18} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-center items-center mt-8 gap-2">
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

      {termTarget ? (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h3 className="font-bold text-gray-800">Terminate Membership</h3>
              </div>
              <button onClick={() => setTermTarget(null)} className="text-gray-400 hover:text-gray-600">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 p-5 space-y-4">
              <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-800">
                Submitting will immediately lock <b>{termTarget.applicant_id}</b> ({termTarget.applicant_name}) and forward a confirmation request to the BOD.
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Resolution Number</label>
                <input
                  type="text"
                  value={termForm.resolution_no}
                  onChange={(e) => setTermForm((f) => ({ ...f, resolution_no: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. BR-2026-014"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Resolution Date</label>
                  <input
                    type="date"
                    value={termForm.resolution_date}
                    onChange={(e) => setTermForm((f) => ({ ...f, resolution_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Effective Date</label>
                  <input
                    type="date"
                    value={termForm.effective_date}
                    onChange={(e) => setTermForm((f) => ({ ...f, effective_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Reason <span className="text-red-500">*</span></label>
                <textarea
                  value={termForm.reason}
                  onChange={(e) => setTermForm((f) => ({ ...f, reason: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. Voluntary resignation, policy violation, etc."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
                <textarea
                  value={termForm.notes}
                  onChange={(e) => setTermForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Additional context for the BOD..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 p-5 border-t border-gray-100">
              <button
                onClick={() => setTermTarget(null)}
                disabled={termBusy}
                className="text-sm font-bold rounded-md px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitTerminate}
                disabled={termBusy || !termForm.reason.trim()}
                className="bg-red-600 text-white text-sm font-bold rounded-md px-4 py-2 hover:bg-red-700 disabled:opacity-50"
              >
                {termBusy ? "Submitting..." : "Submit Termination"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Secretary_Records;