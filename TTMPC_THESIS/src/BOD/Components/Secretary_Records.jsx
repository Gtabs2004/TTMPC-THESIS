import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { bodSections } from "../../components/StaffSidebar/configs/bod";
import { secretarySections } from "../../components/StaffSidebar/configs/secretary";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import {
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X as CloseIcon,
} from "lucide-react";
import NotificationBell from "../../components/NotificationBell";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// This page shows both the BOD and Secretary menus at once (BOD staff review
// membership records that Secretary maintains) — StaffSidebar greys out
// whichever section doesn't match the signed-in user's own role.
const sidebarSections = [...bodSections, ...secretarySections];

const Secretary_Records = () => {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
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
      if (!res.ok || !payload?.success) throw new Error(payload?.detail || "Request failed.");
      addNotification("Termination submitted. Account locked; awaiting BOD confirmation.", "success");
      setTermTarget(null);
    } catch (err) {
      addNotification(err?.message || "Failed to submit termination.", "error");
    } finally {
      setTermBusy(false);
    }
  };

  const formatCurrency = (value) => `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
  };

  useEffect(() => {
    async function loadRecords() {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/secretary/membership-records`, { method: "GET", headers: { Accept: "application/json" } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) throw new Error(payload?.detail || payload?.message || "Failed to load membership records.");
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
    return records.filter((row) => String(row.applicant_id || "").toLowerCase().includes(key) || String(row.applicant_name || "").toLowerCase().includes(key));
  }, [records, searchQuery]);
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / itemsPerPage));
  const paginatedRecords = useMemo(() => filteredRecords.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredRecords, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, records]);

  return (
    <div className="flex min-h-screen bg-gray-100">
      <StaffSidebar portal="BOD" sections={sidebarSections} />

      <div className="flex-1 flex flex-col">
        <StaffTopbar
          portal="BOD"
          notifications={<NotificationBell />}
          search={{ value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), placeholder: "Search..." }}
        />

        <main className="p-8">
          <div className="bg-white w-full rounded-2xl m-auto mt-6 p-8 shadow-sm border border-gray-100 min-h-fit">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-bold text-gray-800">All Members</h2><button className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Export List</button></div>
            <table className="w-full text-left border-collapse text-sm"><thead><tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold"><th className="p-5 font-bold">Membership Id</th><th className="p-5 font-bold">Member Name</th><th className="p-5 font-bold">Date Joined</th><th className="p-5 font-bold">Shares</th><th className="p-5 font-bold">Paid Up Capital</th><th className="p-5 font-bold">Action</th></tr></thead><tbody>
              {loading && <tr><td colSpan={6} className="p-5 text-sm text-center text-blue-700">Loading membership records...</td></tr>}
              {paginatedRecords.length === 0 && !loading && <tr><td colSpan={6} className="p-5 text-sm text-center text-gray-500">No records found.</td></tr>}
              {paginatedRecords.map((member, index) => <tr key={`${member.member_uuid}-${index}`} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"><td className="p-5 font-semibold text-[#1a4a2f]">{member.applicant_id}</td><td className="p-5 text-gray-800 font-medium">{member.applicant_name}</td><td className="p-5 text-gray-800 font-medium">{formatDate(member.date_joined)}</td><td className="p-5 text-gray-800 font-medium">{Number(member.shares || 0).toFixed(2)}</td><td className="p-5 text-gray-800 font-medium">{formatCurrency(member.paid_up_capital)}</td><td className="p-5"><div className="flex items-center gap-2"><button onClick={() => navigate(`/record-details/${member.member_uuid}`)} className="text-[#1e9e4a] hover:text-green-800 transition-colors p-1" title="View record"><Eye size={20} /></button><button onClick={() => openTerminate(member)} className="text-red-600 hover:text-red-700 transition-colors p-1" title="Terminate member"><AlertTriangle size={18} /></button></div></td></tr>)}
            </tbody></table>
          </div>
          <div className="flex justify-center items-center mt-8 gap-2"><button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50" disabled={currentPage <= 1} onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}><ChevronLeft className="w-4 h-4" /></button>{Array.from({ length: Math.min(5, totalPages) }, (_, index) => index + 1).map((page) => <button key={page} onClick={() => setCurrentPage(page)} className={`w-8 h-8 rounded-full border text-xs font-semibold ${page === currentPage ? "bg-[#16A34A] text-white border-[#16A34A]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>{page}</button>)}<button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}><ChevronRight className="w-4 h-4" /></button></div>
        </main>
      </div>

      {termTarget && <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl w-full max-w-lg"><div className="flex items-center justify-between px-6 py-5 border-b border-gray-100"><div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" /><h3 className="font-bold text-gray-800">Terminate Membership</h3></div><button onClick={() => setTermTarget(null)} className="text-gray-400 hover:text-gray-600"><CloseIcon className="w-5 h-5" /></button></div><div className="px-6 py-5 space-y-4"><div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-800">Submitting will immediately lock <b>{termTarget.applicant_id}</b> ({termTarget.applicant_name}) and forward a confirmation request to the BOD.</div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Resolution Number</label><input type="text" value={termForm.resolution_no} onChange={(e) => setTermForm((form) => ({ ...form, resolution_no: e.target.value }))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-semibold text-gray-500 mb-1">Resolution Date</label><input type="date" value={termForm.resolution_date} onChange={(e) => setTermForm((form) => ({ ...form, resolution_date: e.target.value }))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Effective Date</label><input type="date" value={termForm.effective_date} onChange={(e) => setTermForm((form) => ({ ...form, effective_date: e.target.value }))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></div></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Reason <span className="text-red-500">*</span></label><textarea value={termForm.reason} onChange={(e) => setTermForm((form) => ({ ...form, reason: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label><textarea value={termForm.notes} onChange={(e) => setTermForm((form) => ({ ...form, notes: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></div></div><div className="flex justify-end gap-2 px-6 py-5 border-t border-gray-100"><button onClick={() => setTermTarget(null)} disabled={termBusy} className="text-sm font-bold rounded-md px-4 py-2 border border-gray-300 text-gray-700">Cancel</button><button onClick={submitTerminate} disabled={termBusy || !termForm.reason.trim()} className="bg-red-600 text-white text-sm font-bold rounded-md px-4 py-2">{termBusy ? "Submitting..." : "Submit Termination"}</button></div></div></div>}
    </div>
  );
};

export default Secretary_Records;
