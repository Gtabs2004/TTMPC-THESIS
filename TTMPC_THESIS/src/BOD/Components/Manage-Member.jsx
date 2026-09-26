import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { bodNav } from "../../components/StaffSidebar/configs/bod";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import Breadcrumb from "../../components/Breadcrumb";
import Pagination from "../../components/Pagination";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarCheck,
  Archive,
  Search,
  Bell,
  FileText,
  ShieldCheck,
  AlertTriangle,
  CalendarDays,
  History
} from "lucide-react";
import NotificationBell from "../../components/NotificationBell";
import { TableToolbar } from "../../components/TableToolbar";
import TableActionButton from "../../components/TableActionButton";
import TableStateRow from "../../components/TableStateRow";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const ITEMS_PER_PAGE = 5;

const formatDisplayDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const BOD_Manage_Member = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loanSummaryByMemberId, setLoanSummaryByMemberId] = useState({});
  const [terminatedByMemberId, setTerminatedByMemberId] = useState({});
  const [terminatedQuery, setTerminatedQuery] = useState("");
  const [terminatedPage, setTerminatedPage] = useState(1);



  useEffect(() => {
    async function loadData() {
      setLoading(true);

      try {
        // member-loan-summary returns only {activeCount, paidCount} per
        // member (reusing manage-loans' own cache server-side) instead of
        // this page pulling the full manage-loans payload — payment_history,
        // schedules, member/loan_type joins — just to derive two counts.
        // terminated-members is the same "small sidecar fetch" pattern as
        // member-loan-summary — it returns just enough (per membership_id)
        // to split the already-fetched personal_data_sheet rows into Active
        // vs Terminated, instead of a second full member fetch.
        const [memberRes, loanSummaryRes, terminatedRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/personal_data_sheet`, { method: "GET", headers: { Accept: "application/json" } }),
          fetch(`${API_BASE_URL}/api/bod/member-loan-summary`, { method: "GET", headers: { Accept: "application/json" } }),
          fetch(`${API_BASE_URL}/api/bod/terminated-members`, { method: "GET", headers: { Accept: "application/json" } }),
        ]);

        const memberPayload = await memberRes.json().catch(() => ({}));
        const loanSummaryPayload = await loanSummaryRes.json().catch(() => ({}));
        const terminatedPayload = await terminatedRes.json().catch(() => ({}));

        if (!memberRes.ok || !memberPayload?.success) {
          throw new Error(memberPayload?.detail || memberPayload?.message || "Failed to load personal datasheet.");
        }

        const memberRows = Array.isArray(memberPayload.data) ? memberPayload.data : [];
        const loanSummaryByMember = loanSummaryPayload?.success && loanSummaryPayload?.data ? loanSummaryPayload.data : {};
        const terminatedByMember = terminatedPayload?.success && terminatedPayload?.data ? terminatedPayload.data : {};

        const nextSummary = {};
        Object.entries(loanSummaryByMember).forEach(([memberId, counts]) => {
          nextSummary[memberId] = {
            activeCount: Number(counts?.active_count || 0),
            paidCount: Number(counts?.paid_count || 0),
          };
        });

        setRows(memberRows);
        setLoanSummaryByMemberId(nextSummary);
        setTerminatedByMemberId(terminatedByMember);
        addNotification("Member data loaded successfully", "success");
      } catch (err) {
        addNotification(err?.message || "Unable to load personal datasheet.", "error");
        setRows([]);
        setLoanSummaryByMemberId({});
        setTerminatedByMemberId({});
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [addNotification]);

  // Split once, here, so every other memo below just reads activeRows /
  // terminatedRows — the two tables never see each other's records, per the
  // "keep terminated members separate" requirement.
  const activeRows = useMemo(
    () => rows.filter((r) => !terminatedByMemberId[String(r.member_id || "").trim()]),
    [rows, terminatedByMemberId]
  );
  const terminatedRows = useMemo(
    () => rows.filter((r) => terminatedByMemberId[String(r.member_id || "").trim()]),
    [rows, terminatedByMemberId]
  );

  const matchesQuery = (r, key) =>
    String(r.member_id || "").toLowerCase().includes(key) ||
    String(r.full_name || "").toLowerCase().includes(key) ||
    String(r.email || "").toLowerCase().includes(key);

  const filtered = useMemo(() => {
    const key = String(query || "").trim().toLowerCase();
    if (!key) return activeRows;
    return activeRows.filter((r) => matchesQuery(r, key));
  }, [query, activeRows]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, rows]);

  const filteredTerminated = useMemo(() => {
    const key = String(terminatedQuery || "").trim().toLowerCase();
    if (!key) return terminatedRows;
    return terminatedRows.filter((r) => matchesQuery(r, key));
  }, [terminatedQuery, terminatedRows]);

  const terminatedTotalPages = Math.max(1, Math.ceil(filteredTerminated.length / ITEMS_PER_PAGE));
  const paginatedTerminatedRows = useMemo(() => {
    const start = (terminatedPage - 1) * ITEMS_PER_PAGE;
    return filteredTerminated.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTerminated, terminatedPage]);

  useEffect(() => {
    setTerminatedPage(1);
  }, [terminatedQuery, rows]);


  return (
    <div className="flex min-h-screen bg-gray-100">
      <StaffSidebar portal="BOD" items={bodNav} />

       <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <StaffTopbar portal="BOD" notifications={<NotificationBell />} />

        <main className="flex-1 overflow-y-auto p-8">
          <Breadcrumb portal="BOD" page="Manage Member" />
          <h1 className="font-bold text-2xl mb-6">Manage Member</h1>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <TableToolbar
              title="Active Members"
              subtitle={`Showing ${paginatedRows.length} of ${filtered.length} members`}
            >
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by member ID, name, or email..."
                  className="w-full h-8 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
                />
              </div>
            </TableToolbar>
            <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                  <th className="p-5 font-bold">Member ID</th>
                  <th className="p-5 font-bold text-center">Name</th>
                  <th className="p-5 font-bold text-center">Email</th>
                  <th className="p-5 font-bold text-center">Contact</th>
                  <th className="p-5 font-bold text-center">Address</th>
                  <th className="p-5 font-bold text-center">Active Loans</th>
                  <th className="p-5 font-bold text-center">Paid Loans</th>
                  <th className="p-5 font-bold text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableStateRow colSpan={8} variant="loading" label="Loading members..." />
                ) : filtered.length === 0 ? (
                  <TableStateRow colSpan={8} variant="empty" icon={Users} label="No personal datasheet records found." />
                ) : (
                  paginatedRows.map((r) => {
                    const summary = loanSummaryByMemberId[String(r.member_id || "").trim()] || { paidCount: 0, activeCount: 0 };

                    return (
                      <tr key={String(r.id)} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-sm font-semibold text-gray-800">{r.member_id}</td>
                        <td className="p-5 text-sm text-gray-700 text-center">{r.full_name}</td>
                        <td className="p-5 text-sm text-gray-700 text-center">{r.email}</td>
                        <td className="p-5 text-sm text-gray-700 text-center">{r.contact_number}</td>
                        <td className="p-5 text-sm text-gray-700 text-center">{r.address}</td>
                        <td className="p-5 text-sm text-gray-700 text-center">{summary.activeCount}</td>
                        <td className="p-5 text-sm text-gray-700 text-center">{summary.paidCount}</td>
                        <td className="p-5 text-sm text-center">
                          <TableActionButton
                            onClick={() => navigate(`/member_details?member_id=${encodeURIComponent(String(r.member_id || ""))}&portal=bod`, { state: { member: r, portal: "bod" } })}
                          >
                            View
                          </TableActionButton>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          </div>

          <Pagination page={currentPage} totalPages={totalPages} onChange={setCurrentPage} />

          {/* Terminated Members — kept in its own table/pagination/search
              (same design as Active Members above) so a terminated record
              never mixes into the active membership list. */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-8">
            <TableToolbar
              title="Terminated Members"
              subtitle={`Showing ${paginatedTerminatedRows.length} of ${filteredTerminated.length} members`}
            >
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={terminatedQuery}
                  onChange={(e) => setTerminatedQuery(e.target.value)}
                  placeholder="Search by member ID, name, or email..."
                  className="w-full h-8 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
                />
              </div>
            </TableToolbar>
            <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                  <th className="p-5 font-bold">Member ID</th>
                  <th className="p-5 font-bold text-center">Name</th>
                  <th className="p-5 font-bold text-center">Email</th>
                  <th className="p-5 font-bold text-center">Contact</th>
                  <th className="p-5 font-bold text-center">Address</th>
                  <th className="p-5 font-bold text-center">Termination Date</th>
                  <th className="p-5 font-bold text-center">Resolution No.</th>
                  <th className="p-5 font-bold text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableStateRow colSpan={8} variant="loading" label="Loading members..." />
                ) : filteredTerminated.length === 0 ? (
                  <TableStateRow colSpan={8} variant="empty" icon={Users} label="No terminated members." />
                ) : (
                  paginatedTerminatedRows.map((r) => {
                    const term = terminatedByMemberId[String(r.member_id || "").trim()] || {};

                    return (
                      <tr key={String(r.id)} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-sm font-semibold text-gray-800">{r.member_id}</td>
                        <td className="p-5 text-sm text-gray-700 text-center">{r.full_name}</td>
                        <td className="p-5 text-sm text-gray-700 text-center">{r.email}</td>
                        <td className="p-5 text-sm text-gray-700 text-center">{r.contact_number}</td>
                        <td className="p-5 text-sm text-gray-700 text-center">{r.address}</td>
                        <td className="p-5 text-sm text-gray-700 text-center">{formatDisplayDate(term.termination_date)}</td>
                        <td className="p-5 text-sm text-gray-700 text-center">{term.termination_resolution_number || "—"}</td>
                        <td className="p-5 text-sm text-center">
                          <TableActionButton
                            onClick={() => navigate(`/member_details?member_id=${encodeURIComponent(String(r.member_id || ""))}&portal=bod`, { state: { member: r, portal: "bod" } })}
                          >
                            View
                          </TableActionButton>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          </div>

          <Pagination page={terminatedPage} totalPages={terminatedTotalPages} onChange={setTerminatedPage} />
        </main>
      </div>
    </div>
  );
};

export default BOD_Manage_Member;
