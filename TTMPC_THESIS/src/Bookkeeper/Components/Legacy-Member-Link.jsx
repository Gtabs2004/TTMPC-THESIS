import React, { useEffect, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
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
  Briefcase,
  Wallet,
  Coins,
  Link2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const LegacyMemberLink = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pickerFor, setPickerFor] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [actionMsg, setActionMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    { name: "Legacy Member Validation", icon: Link2 },
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

  const handleSignOut = async (e) => {
    e.preventDefault();
    try { await signOut(); navigate("/"); }
    catch (err) { console.error("Failed to sign out:", err); }
  };

  const fetchPending = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/unlinked-legacy-members`);
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.detail || "Failed to load.");
      setPending(json.data?.pending || []);
    } catch (err) {
      setLoadError(err?.message || "Failed to load.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPending(); }, []);

  useEffect(() => {
    if (!pickerFor) return;
    const t = setTimeout(async () => {
      try {
        const url = new URL(`${API_BASE_URL}/api/admin/legacy-member-link/candidates`);
        if (searchTerm) url.searchParams.set("q", searchTerm);
        const res = await fetch(url);
        const json = await res.json();
        setCandidates(json?.data || []);
      } catch { setCandidates([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [searchTerm, pickerFor]);

  const openPicker = (entry) => {
    setPickerFor(entry);
    setSearchTerm(entry.last_name || "");
    setCandidates([]);
    setActionMsg("");
  };

  const closePicker = () => {
    setPickerFor(null);
    setSearchTerm("");
    setCandidates([]);
  };

  const confirmLink = async (memberId, memberName) => {
    if (!pickerFor) return;
    if (!window.confirm(`Confirm: "${pickerFor.last_name}, ${pickerFor.first_name}" from the old records is the same person as "${memberName}"?`)) return;
    setSubmitting(true);
    setActionMsg("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/legacy-member-link/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legacy_master_uuid: pickerFor.master_uuid,
          member_id: memberId,
          confirmed_by: session?.user?.id || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.detail || "Failed.");
      setActionMsg(`Linked. Moved ${json.data?.loans_relinked || 0} loan(s) and ${json.data?.payments_relinked || 0} payment(s).`);
      closePicker();
      await fetchPending();
    } catch (err) {
      setActionMsg(`Error: ${err?.message || "Failed."}`);
    } finally {
      setSubmitting(false);
    }
  };

  const markNoHistory = async (entry) => {
    if (!window.confirm(`Confirm: "${entry.last_name}, ${entry.first_name}" has no old loans or payments?`)) return;
    setSubmitting(true);
    setActionMsg("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/legacy-member-link/no-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legacy_master_uuid: entry.master_uuid,
          confirmed_by: session?.user?.id || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.detail || "Failed.");
      setActionMsg(`Marked ${entry.last_name}, ${entry.first_name} as no old records.`);
      await fetchPending();
    } catch (err) {
      setActionMsg(`Error: ${err?.message || "Failed."}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md p-4 flex flex-col">
        <div className="flex items-center gap-3 mb-4 px-2">
          <img src="/img/ttmpc-logo.png" alt="TTMPC Logo" className="w-10 h-10" />
          <div>
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Bookkeeper Portal
            </p>
          </div>
        </div>
        <hr className="w-full border-gray-200 mb-6" />
        <nav className="flex flex-col gap-2 text-sm flex-grow overflow-y-auto">
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
          className="mt-4 w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-end px-8 shrink-0">
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
        </header>

        <main className="flex-1 p-8 overflow-y-auto">
          {/* Header */}
          <div className="flex items-end justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Match Old Members</h1>
              <p className="text-base text-gray-600 mt-1">
                Match these old records to current members in the system.
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-green-700">
                {loading ? "—" : pending.length}
              </div>
              <div className="text-xs uppercase tracking-wider text-gray-500">Pending</div>
            </div>
          </div>

          {actionMsg && (
            <div className={`mb-4 p-3 rounded-lg text-base ${
              actionMsg.startsWith("Error")
                ? "bg-red-50 text-red-800 border border-red-200"
                : "bg-green-50 text-green-800 border border-green-200"
            }`}>
              {actionMsg}
            </div>
          )}

          {loadError && (
            <div className="mb-4 p-3 rounded-lg text-base bg-red-50 text-red-800 border border-red-200">
              {loadError}
            </div>
          )}

          {/* List */}
          <div className="space-y-3">
            {loading && (
              <div className="text-center text-base text-gray-500 py-12">Loading...</div>
            )}
            {!loading && pending.length === 0 && (
              <div className="text-center text-lg text-gray-700 py-12 bg-white rounded-xl border border-gray-200">
                All members are matched.
              </div>
            )}
            {pending.map((entry) => (
              <div
                key={entry.master_uuid}
                className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-semibold text-gray-900">
                    {entry.last_name}, {entry.first_name}
                    {entry.middle_name && (
                      <span className="text-gray-500 font-normal"> {entry.middle_name}</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mt-1 flex flex-wrap gap-x-5 gap-y-1">
                    {entry.occupation && <span>{entry.occupation}</span>}
                    {entry.address && <span>{entry.address}</span>}
                    <span className="text-gray-500">
                      Old loans: <span className="font-semibold text-gray-700">{entry.loan_count}</span>
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => openPicker(entry)}
                    disabled={submitting}
                    className="px-4 py-2.5 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold disabled:opacity-50 flex items-center gap-2"
                  >
                    <CheckCircle2 size={16} />
                    Match to Member
                  </button>
                  <button
                    onClick={() => markNoHistory(entry)}
                    disabled={submitting}
                    className="px-4 py-2.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold disabled:opacity-50 flex items-center gap-2"
                  >
                    <XCircle size={16} />
                    No old records
                  </button>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* Picker modal */}
      {pickerFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Old record</div>
              <h2 className="text-xl font-bold text-gray-900 mt-1">
                {pickerFor.last_name}, {pickerFor.first_name}
              </h2>
              <p className="text-sm text-gray-600 mt-2">
                Search and choose the matching current member.
              </p>
            </div>
            <div className="px-6 py-3 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name or ID..."
                  className="w-full h-11 pl-10 pr-3 rounded-lg border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {candidates.length === 0 && (
                <div className="px-6 py-10 text-center text-sm text-gray-500">
                  No matches. Try a different name.
                </div>
              )}
              {candidates.map((m) => {
                const fullName = `${m.last_name}, ${m.first_name}${m.middle_name ? " " + m.middle_name : ""}`;
                return (
                  <button
                    key={m.id}
                    onClick={() => confirmLink(m.id, fullName)}
                    disabled={submitting}
                    className="w-full px-6 py-3 text-left hover:bg-green-50 border-b border-gray-100 disabled:opacity-50 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-base font-semibold text-gray-900">
                        {m.last_name}, {m.first_name}
                        {m.middle_name && <span className="text-gray-500 font-normal"> {m.middle_name}</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{m.membership_id}</div>
                    </div>
                    <span className="text-sm text-green-700 font-semibold ml-4">Choose →</span>
                  </button>
                );
              })}
            </div>
            <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
              <button
                onClick={closePicker}
                disabled={submitting}
                className="px-5 py-2.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LegacyMemberLink;
