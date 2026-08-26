import React, { useEffect, useState } from "react";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { bodNav } from "../../components/StaffSidebar/configs/bod";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
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
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");



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


  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="BOD" items={bodNav} />

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100 shrink-0">
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
          <StatCardRow cols={3}>
            <StatCard label="Pending Board Review" value={loans.length} icon={UserPlus} iconColor="text-[#2C7A3F]" />
            <StatCard label="Threshold" value="₱500K+" icon={ClipboardList} iconColor="text-[#D97706]" />
            <StatCard label="Loan Type" value="Consolidated" icon={BadgeCheck} iconColor="text-[#2C7A3F]" />
          </StatCardRow>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
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
                    <tr key={loan.control_number} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
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
                          className="text-member-green font-bold hover:underline transition-all"
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
