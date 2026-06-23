import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarCheck,
  CalendarDays,
  Archive,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldCheck,
   
} from "lucide-react";
import NotificationBell from "./NotificationBell";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const STATUS_LABEL = {
  awaiting_bod_confirmation: { text: "Awaiting BOD", className: "bg-orange-100 text-orange-700" },
  approved: { text: "Approved", className: "bg-green-100 text-green-700" },
  rejected: { text: "Rejected", className: "bg-gray-100 text-gray-600" },
};

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

const Termination_Inbox = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("awaiting_bod_confirmation");

  const menuItems = [
      {
        section: "BOD",
        items: [
          { name: "Dashboard", icon: LayoutDashboard },
          { name: "Member Approvals", icon: Users },
          { name: "Loan Approvals", icon: ShieldCheck },
          { name: "Manage Loans", icon: CreditCard },
          { name: "Manage Member", icon: Users },
          { name: "Termination Inbox", icon: AlertTriangle },
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

  const routeMap = {
    "Dashboard": "/BOD-dashboard",
    "Member Approvals": "/member-approvals",
    "Loan Approvals": "/bod-loan-approvals",
    "Manage Loans": "/bod-manage-loans",
    "Manage Member": "/bod-manage-member",
    "Termination Inbox": "/bod-termination-inbox",
    "Loan Policies": "/bod-loan-policies",
    "Training Attendance": "/Secretary_Attendance",
    "General Assembly": "/Secretary_General_Assembly",
    "Membership Records": "/Secretary_Records",
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await fetch(`${API_BASE_URL}/api/admin/staff/termination/requests${params}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.detail || "Failed to load termination requests.");
      }
      setRows(payload.data || []);
    } catch (err) {
      addNotification(err?.message || "Unable to load termination requests.", "error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const decide = async (id, decision) => {
    if (!window.confirm(`Are you sure you want to ${decision === "approved" ? "approve" : "reject"} this termination?`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/staff/termination/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: id, decision }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.detail || "Request failed.");
      }
      addNotification(`Termination ${decision}.`, "success");
      load();
    } catch (err) {
      addNotification(err?.message || "Failed to record decision.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleSignOut = async (e) => {
    e.preventDefault();
    try { await signOut(); navigate("/"); } catch (err) { console.error(err); }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
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
          <NotificationBell />
          <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
            <img src="/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200" />
            <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="BOD" />
          </div>
        </header>

        <main className="p-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="font-bold text-2xl">Termination Inbox</h1>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="awaiting_bod_confirmation">Awaiting BOD</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#66B53B] text-white uppercase text-[11px] tracking-wider text-center">
                <tr>
                  <th className="px-4 py-3">Member ID</th>
                  <th className="px-4 py-3">Previous Role</th>
                  <th className="px-4 py-3">Resolution No.</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No termination requests.</td></tr>
                ) : rows.map((r) => {
                  const status = STATUS_LABEL[r.status] || { text: r.status, className: "bg-gray-100 text-gray-600" };
                  const pending = r.status === "awaiting_bod_confirmation";
                  return (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-green-50 transition-colors text-center">
                      <td className="px-4 py-3 font-semibold text-gray-800">{r.member_id}</td>
                      <td className="px-4 py-3 text-gray-700 capitalize">{r.previous_role || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{r.resolution_no || "—"}</td>
                      <td className="px-4 py-3 text-gray-700 text-left">{r.reason || "—"}</td>
                      <td className="px-4 py-3 text-gray-700 text-xs">{formatDate(r.requested_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider ${status.className}`}>
                          {status.text}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {pending ? (
                          <div className="flex gap-2 justify-center">
                            <button
                              disabled={busyId === r.id}
                              onClick={() => decide(r.id, "approved")}
                              className="bg-green-600 text-white text-xs font-bold rounded-md px-3 py-1.5 disabled:opacity-50 hover:bg-green-700 transition-colors flex items-center gap-1"
                            >
                              <CheckCircle2 size={14} /> Approve
                            </button>
                            <button
                              disabled={busyId === r.id}
                              onClick={() => decide(r.id, "rejected")}
                              className="bg-gray-600 text-white text-xs font-bold rounded-md px-3 py-1.5 disabled:opacity-50 hover:bg-gray-700 transition-colors flex items-center gap-1"
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
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

export default Termination_Inbox;
