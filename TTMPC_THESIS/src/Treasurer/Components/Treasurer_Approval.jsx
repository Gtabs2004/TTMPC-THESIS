import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import { supabase } from "../../supabaseClient";
import StaffSidebar from "../../components/StaffSidebar";
import { treasurerNav } from "../../components/StaffSidebar/configs/treasurer";
import {
  Search,
  Bell,
  UserPlus,
  ClipboardList,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  User,
} from "lucide-react";

const Treasurer_Approval = () => {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    fetchLoans();
  }, [addNotification]);

  const fetchLoans = async () => {
    try {
      setLoading(true);

      const { data: loansData, error: loansError } = await supabase
        .from("loans")
        .select(
          `
          control_number,
          member_id,
          loan_amount,
          term,
          loan_status,
          manager_review_requested_at,
          application_date,
          member:member_id (
            first_name,
            last_name,
            is_bona_fide
          ),
          loan_types:loan_type_id (
            name
          )
        `
        )
        .order("application_date", { ascending: false });

      if (loansError) throw loansError;

      const { data: koicaData, error: koicaError } = await supabase
        .from("koica_loans")
        .select(`
          control_number,
          loan_amount,
          term,
          loan_status,
          manager_review_requested_at,
          application_date,
          full_name,
          loan_type_code
        `)
        .order("application_date", { ascending: false });

      if (koicaError) throw koicaError;

      const needsMemberFallback = (loansData || []).filter(
        (row) => row.member_id && !row.member?.first_name && !row.member?.last_name
      );

      if (needsMemberFallback.length > 0) {
        const unresolvedMemberIds = [...new Set(needsMemberFallback.map((row) => row.member_id))];

        const fetchMembersFrom = async (tableName, keyColumn) => {
          const { data, error } = await supabase
            .from(tableName)
            .select(`${keyColumn}, first_name, last_name, is_bona_fide`)
            .in(keyColumn, unresolvedMemberIds);
          if (error) return [];
          return (data || []).map((row) => ({ ...row, __fkKey: row[keyColumn] }));
        };

        let memberRows = await fetchMembersFrom("member", "id");

        if (memberRows.length) {
          const memberById = memberRows.reduce((acc, row) => {
            if (row.__fkKey) acc[row.__fkKey] = row;
            return acc;
          }, {});

          for (const row of loansData) {
            if ((!row.member?.first_name && !row.member?.last_name) && row.member_id && memberById[row.member_id]) {
              row.member = memberById[row.member_id];
            }
          }
        }
      }

      const mappedKoica = (koicaData || []).map((row) => ({
        ...row,
        source: "koica",
      }));

      const mappedLoans = (loansData || []).map((row) => ({
        ...row,
        source: "loans",
      }));

      const combinedQueue = [...mappedLoans, ...mappedKoica]
        .filter((loan) => String(loan.loan_status || "").trim().toLowerCase() === "to be disbursed")
        .sort((a, b) => new Date(b.application_date || 0) - new Date(a.application_date || 0));

      setLoans(combinedQueue);
      addNotification("Loan applications loaded successfully", "success");
    } catch (err) {
      console.error("Error fetching loans:", err.message);
      addNotification(err?.message || "Unable to load loan applications.", "error");
      setLoans([]);
    } finally {
      setLoading(false);
    }
  };

  const queueStats = (() => {
    const now = Date.now();
    const ageDays = loans
      .map((l) => {
        const t = new Date(l.application_date || l.submittedAt).getTime();
        return Number.isFinite(t) ? (now - t) / (1000 * 60 * 60 * 24) : null;
      })
      .filter((d) => d !== null && d >= 0);
    return {
      pendingCount: loans.length,
      avgDaysWaiting: ageDays.length ? ageDays.reduce((a, b) => a + b, 0) / ageDays.length : 0,
      oldestDays: ageDays.length ? Math.max(...ageDays) : 0,
    };
  })();

  // loan_types.name stores the full product name ("Bonus Loan",
  // "Consolidated Loan", "Emergency Loan" — see loan_form_policies.sql), not
  // the bare word this used to switch on exactly, so the match never hit and
  // every badge silently fell through to gray. Match on keyword instead.
  const getLoanTypeStyle = (type) => {
    const t = String(type || "").toLowerCase();
    if (t.includes("bonus")) return "bg-blue-100 text-blue-700";
    if (t.includes("emergency")) return "bg-red-100 text-red-700";
    if (t.includes("consolidated")) return "bg-purple-100 text-purple-700";
    return "bg-gray-100 text-gray-700";
  };

  const getMigsStyle = (status) => {
    return status === "MIGS" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500";
  };

  const displayLoans = loans.map((loan) => {
    const isKoica = loan.source === "koica";
    const firstName = loan.member?.first_name || "";
    const lastName = loan.member?.last_name || "";
    const memberName = isKoica
      ? (loan.full_name || "Unknown Applicant")
      : (`${firstName} ${lastName}`.trim() || "Unknown Member");

    const loanTypeName = isKoica
      ? (loan.loan_type_code === "NONMEMBER_BONUS" ? "Nonmember Bonus Loan" : "ABFF Loan")
      : (loan.loan_types?.name || "N/A");
    const migsStatus = isKoica ? "N/A" : (loan.member?.is_bona_fide ? "MIGS" : "NON-MIGS");

    return {
      id: loan.control_number,
      source: loan.source,
      name: memberName,
      type: loanTypeName,
      amount: loan.loan_amount ? `\u20B1${Number(loan.loan_amount).toLocaleString()}` : "\u20B10",
      term: `${loan.term || 0} Months`,
      status: migsStatus,
      managerApproval: String(loan.loan_status || "").trim().toLowerCase() === "to be disbursed" ? "Approved" : "Pending",
      date: loan.application_date
        ? new Date(loan.application_date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "N/A",
      actions: "Review",
    };
  });

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Treasurer" items={treasurerNav} />

      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shrink-0 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
              placeholder="Search..."
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
              <User className="w-4.5 h-4.5" />
            </div>
            <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Treasurer" />
          </div>
        </header>

        <main className="p-8 flex-1">
          <StatCardRow cols={3}>
            <StatCard label="Pending Review" value={queueStats.pendingCount} icon={UserPlus} iconColor="text-[#2C7A3F]" />
            <StatCard
              label="Avg Days Waiting"
              value={`${queueStats.avgDaysWaiting.toFixed(1)} ${queueStats.avgDaysWaiting === 1 ? "Day" : "Days"}`}
              icon={ClipboardList}
              iconColor="text-[#D97706]"
            />
            <StatCard
              label="Oldest In Queue"
              value={`${queueStats.oldestDays.toFixed(0)} ${queueStats.oldestDays === 1 ? "Day" : "Days"}`}
              icon={BadgeCheck}
              iconColor="text-[#2C7A3F]"
            />
          </StatCardRow>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Loan ID</th>
                    <th className="p-5 font-bold">Member Name</th>
                    <th className="p-5 font-bold">Loan Type</th>
                    <th className="p-5 font-bold">Amount</th>
                    <th className="p-5 font-bold">Term</th>
                    <th className="p-5 font-bold">MIGS Status</th>
                    <th className="p-5 font-bold">Manager Approval</th>
                    <th className="p-5 font-bold">Submission</th>
                    <th className="p-5 font-bold text-right pr-8">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="9" className="p-5 text-center text-gray-500">
                        Loading applications...
                      </td>
                    </tr>
                  ) : fetchError ? (
                    <tr>
                      <td colSpan="9" className="p-5 text-center text-red-600">
                        Failed to load loans: {fetchError}
                      </td>
                    </tr>
                  ) : fetchError ? (
                    <tr>
                      <td colSpan="9" className="p-5 text-center text-red-600">
                        Failed to load loans: {fetchError}
                      </td>
                    </tr>
                  ) : displayLoans.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="p-5 text-center text-gray-500">
                        No loans found.
                      </td>
                    </tr>
                  ) : (
                    displayLoans.map((loan, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-sm text-gray-500 font-medium">{loan.id}</td>
                        <td className="p-5 text-sm font-bold text-gray-800">{loan.name}</td>
                        <td className="p-5 text-sm">
                          <span
                            className={`inline-block max-w-[12rem] truncate px-3 py-1.5 rounded-full text-xs font-bold ${getLoanTypeStyle(loan.type)}`}
                            title={loan.type}
                          >
                            {loan.type}
                          </span>
                        </td>
                        <td className="p-5 text-sm font-bold text-gray-900">{loan.amount}</td>
                        <td className="p-5 text-sm text-gray-500">{loan.term}</td>
                        <td className="p-5 text-sm">
                          <span className={`badge-animated px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider ${getMigsStyle(loan.status)}`}>
                            {loan.status}
                          </span>
                        </td>
                        <td className="p-5 text-sm">
                          <span className={`badge-animated px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider ${loan.managerApproval === "Approved" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {loan.managerApproval}
                          </span>
                        </td>
                        <td className="p-5 text-sm text-gray-500">{loan.date}</td>
                        <td className="p-5 text-sm text-right pr-8">
                          <button
                            onClick={() => navigate(`/treasurer-approval/${loan.id}?source=${loan.source}`)}
                            className="btn-enhanced text-member-green font-bold hover:text-green-800 transition-all"
                          >
                            {loan.actions}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-center p-6 gap-2 border-t border-gray-100">
              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                <ChevronLeft className="w-4 h-4" />
              </button>

              {[1, 2, 3, 4, 5].map((page) => (
                <button
                  key={page}
                  className={`w-8 h-8 flex items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                    page === 1
                      ? "bg-[#16A34A] text-white border-[#16A34A]"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {page}
                </button>
              ))}

              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Treasurer_Approval;
