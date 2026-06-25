import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import { supabase } from "../../supabaseClient";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarCheck,
  CalendarDays,
  Archive,
  FileText,
  AlertTriangle,
  Search,
  ShieldCheck,
  UserPlus,
  ClipboardList,
  BadgeCheck,
  History,
} from "lucide-react";
import NotificationBell from "./NotificationBell";

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

const BOD_Loan_Approval = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  const routeMap = {
    "Dashboard": "/BOD-dashboard",
    "Member Approvals": "/member-approvals",
    "Loan Approvals": "/bod-loan-approvals",
    "Manage Loans": "/bod-manage-loans",
    "Manage Member": "/bod-manage-member",
    "Termination Inbox": "/bod-termination-inbox",
    "Audit Log": "/bod-audit-log",
    "Loan Policies": "/bod-loan-policies",
    "Training Attendance": "/Secretary_Attendance",
    "General Assembly": "/Secretary_General_Assembly",
    "Membership Records": "/Secretary_Records",
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("loans")
        .select(`
          control_number,
          loan_amount,
          term,
          loan_status,
          application_date,
          member:member_id (first_name, last_name, is_bona_fide),
          loan_types:loan_type_id (name)
        `)
        .eq("loan_status", "recommended for bod approval")
        .order("application_date", { ascending: false });
      if (error) throw error;
      setLoans(data || []);
    } catch (err) {
      addNotification(err?.message || "Failed to load BOD loan queue.", "error");
      setLoans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = loans.filter((l) => {
    const key = search.trim().toLowerCase();
    if (!key) return true;
    const name = `${l.member?.first_name || ""} ${l.member?.last_name || ""}`.toLowerCase();
    return name.includes(key) || String(l.control_number || "").toLowerCase().includes(key);
  });

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
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
              placeholder="Search..."
            />
          </div>
          <NotificationBell />
          <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
            <img src="/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200" />
            <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="BOD" />
          </div>
        </header>

        <main className="p-8 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#EAF5EC] flex items-center justify-center flex-shrink-0">
                <UserPlus className="text-[#2C7A3F] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pending Board Review</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">{loans.length}</p>
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#FFF4E5] flex items-center justify-center flex-shrink-0">
                <ClipboardList className="text-[#D97706] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Threshold</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">₱500K+</p>
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#EAF5EC] flex items-center justify-center flex-shrink-0">
                <BadgeCheck className="text-[#2C7A3F] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loan Type</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">Consolidated</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="px-6 pt-5 pb-2">
              <h2 className="text-sm font-bold text-gray-800">High-value Consolidated loans (above ₱500,000) awaiting board approval.</h2>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-green-700 text-white uppercase text-[10px] tracking-wider font-extrabold">
                  <th className="p-5 font-bold">Loan ID</th>
                  <th className="p-5 font-bold">Member Name</th>
                  <th className="p-5 font-bold">Loan Type</th>
                  <th className="p-5 font-bold">Amount</th>
                  <th className="p-5 font-bold">Term</th>
                  <th className="p-5 font-bold">Submitted</th>
                  <th className="p-5 font-bold text-right pr-8">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="p-6 text-center text-gray-400">Loading queue…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-gray-400">No high-value loans awaiting BOD approval.</td></tr>
                ) : filtered.map((loan) => {
                  const memberName = `${loan.member?.first_name || ""} ${loan.member?.last_name || ""}`.trim() || "Unknown Member";
                  return (
                    <tr key={loan.control_number} className="table-row-enter border-b border-gray-100 hover:bg-green-50 transition-colors">
                      <td className="p-5 text-sm text-gray-500 font-medium">{loan.control_number}</td>
                      <td className="p-5 text-sm font-bold text-gray-800">{memberName}</td>
                      <td className="p-5 text-sm">
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                          {loan.loan_types?.name || "Consolidated"}
                        </span>
                      </td>
                      <td className="p-5 text-sm font-bold text-gray-900">{formatCurrency(loan.loan_amount)}</td>
                      <td className="p-5 text-sm text-gray-500">{loan.term || 0} Months</td>
                      <td className="p-5 text-sm text-gray-500">{formatDate(loan.application_date)}</td>
                      <td className="p-5 text-sm text-right pr-8">
                        <button
                          onClick={() => navigate(`/bod-loan-approval/${encodeURIComponent(loan.control_number)}`)}
                          className="text-[#1D6021] font-bold hover:underline transition-all"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default BOD_Loan_Approval;
