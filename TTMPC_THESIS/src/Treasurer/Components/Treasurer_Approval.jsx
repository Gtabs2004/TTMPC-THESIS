import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getLoanTypeChipClass as getLoanTypeStyle } from "../../utils/loanTypeColors";
import { StatCard, StatCardRow } from "../../components/StatCard";
import { TableToolbar } from "../../components/TableToolbar";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import Pagination from "../../components/Pagination";
import { apiErrorMessage } from "../../utils/apiError";
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
  Inbox,
  Loader2,
  Wallet,
  Landmark,
  AlertTriangle,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const RESCHEDULED_PAGE_SIZE = 10;

const PHP = (v) =>
  `₱${Number(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatShortDate = (value) => {
  if (!value) return "N/A";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "N/A"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const Treasurer_Approval = () => {
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  // ---- Tab 1: Awaiting Disbursement (unchanged behaviour) ------------------
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // ---- Tab 2: Rescheduled ---------------------------------------------------
  const [activeTab, setActiveTab] = useState("awaiting");
  const [rescheduled, setRescheduled] = useState([]);
  const [vault, setVault] = useState({ balance: 0, committed: 0, available: 0 });
  const [rescheduledLoading, setRescheduledLoading] = useState(false);
  const [rescheduledError, setRescheduledError] = useState("");
  const [rescheduledLoaded, setRescheduledLoaded] = useState(false);
  const [rescheduledPage, setRescheduledPage] = useState(1);

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

  const fetchRescheduled = async () => {
    setRescheduledLoading(true);
    setRescheduledError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/treasurer/disbursements/rescheduled`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(apiErrorMessage(result, "Failed to load rescheduled loans."));
      }
      setRescheduled(result.data?.rows || []);
      setVault(result.data?.vault || { balance: 0, committed: 0, available: 0 });
      setRescheduledLoaded(true);
    } catch (err) {
      setRescheduledError(err?.message || "Unable to load rescheduled loans.");
      setRescheduled([]);
    } finally {
      setRescheduledLoading(false);
    }
  };

  // Loaded once, the first time the Rescheduled tab is opened; refreshed on
  // demand from there. Tab 1's own load stays exactly as it was.
  useEffect(() => {
    if (activeTab === "rescheduled" && !rescheduledLoaded) {
      fetchRescheduled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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
      amount: loan.loan_amount ? `₱${Number(loan.loan_amount).toLocaleString()}` : "₱0",
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

  const totalRescheduledPages = Math.max(1, Math.ceil(rescheduled.length / RESCHEDULED_PAGE_SIZE));
  const paginatedRescheduled = useMemo(() => {
    const start = (rescheduledPage - 1) * RESCHEDULED_PAGE_SIZE;
    return rescheduled.slice(start, start + RESCHEDULED_PAGE_SIZE);
  }, [rescheduled, rescheduledPage]);
  useEffect(() => setRescheduledPage(1), [rescheduled.length]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Treasurer" items={treasurerNav} />

      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Treasurer" notifications={<LoanNotificationBell role="treasurer" />} />

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
            <TableToolbar
              title="Disbursement Queue"
              subtitle={activeTab === "awaiting" ? `Showing ${loans.length} loans` : `Showing ${rescheduledLoaded ? rescheduled.length : 0} loans`}
              tabs={[
                { value: "awaiting", label: "Awaiting Disbursement", count: loans.length },
                { value: "rescheduled", label: "Rescheduled", count: rescheduledLoaded ? rescheduled.length : undefined },
              ]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />

            {activeTab === "awaiting" && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
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
                          <td colSpan={9} className="p-10 text-center">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Loader2 size={24} className="text-gray-300 animate-spin" />
                              <p className="text-sm text-gray-400">Loading...</p>
                            </div>
                          </td>
                        </tr>
                      ) : fetchError ? (
                        <tr>
                          <td colSpan={9} className="p-5 text-center text-red-600">
                            Failed to load loans: {fetchError}
                          </td>
                        </tr>
                      ) : displayLoans.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-10 text-center">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Inbox size={32} className="text-gray-300" />
                              <p className="text-sm font-medium text-gray-500">No loans found.</p>
                            </div>
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
              </>
            )}

            {activeTab === "rescheduled" && (
              <>
                <div className="p-5 border-b border-gray-100">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        <Wallet size={12} /> Vault Balance
                      </p>
                      <p className="mt-1 text-lg font-extrabold text-gray-900 tabular-nums">
                        {rescheduledLoading && !rescheduledLoaded ? "…" : PHP(vault.balance)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        <Landmark size={12} /> Committed (Ready for Release)
                      </p>
                      <p className="mt-1 text-lg font-extrabold text-amber-700 tabular-nums">
                        {rescheduledLoading && !rescheduledLoaded ? "…" : PHP(vault.committed)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-green-700">
                        <BadgeCheck size={12} /> Available Now
                      </p>
                      <p className="mt-1 text-lg font-extrabold text-green-700 tabular-nums">
                        {rescheduledLoading && !rescheduledLoaded ? "…" : PHP(vault.available)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-gray-400">
                    Required amounts below are net cash out (after fee deductions, and — for a renewal — after
                    netting off the old loan's balance), not gross loan amount. Shortfall is recomputed live, so a
                    row clears itself once funds are available; nothing here needs a manual re-check.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                        <th className="p-5 font-bold">Loan ID</th>
                        <th className="p-5 font-bold">Member Name</th>
                        <th className="p-5 font-bold">Loan Type</th>
                        <th className="p-5 font-bold">Required (Net)</th>
                        <th className="p-5 font-bold">Shortfall</th>
                        <th className="p-5 font-bold">Rescheduled</th>
                        <th className="p-5 font-bold text-right pr-8">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rescheduledLoading ? (
                        <tr>
                          <td colSpan={7} className="p-10 text-center">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Loader2 size={24} className="text-gray-300 animate-spin" />
                              <p className="text-sm text-gray-400">Loading...</p>
                            </div>
                          </td>
                        </tr>
                      ) : rescheduledError ? (
                        <tr>
                          <td colSpan={7} className="p-5 text-center text-red-600">
                            {rescheduledError}
                            <button
                              type="button"
                              onClick={fetchRescheduled}
                              className="ml-3 font-semibold underline decoration-red-400 underline-offset-2 hover:text-red-900"
                            >
                              Retry
                            </button>
                          </td>
                        </tr>
                      ) : paginatedRescheduled.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-10 text-center">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Inbox size={32} className="text-gray-300" />
                              <p className="text-sm font-medium text-gray-500">No rescheduled loans.</p>
                              <p className="text-xs text-gray-400">
                                Loans parked here after a "Reschedule" decision for insufficient funds.
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedRescheduled.map((row) => (
                          <tr key={`${row.source}-${row.loan_id}`} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                            <td className="p-5 text-sm text-gray-500 font-medium">{row.loan_id}</td>
                            <td className="p-5 text-sm font-bold text-gray-800">{row.member_name}</td>
                            <td className="p-5 text-sm">
                              <span
                                className={`inline-block max-w-[12rem] truncate px-3 py-1.5 rounded-full text-xs font-bold ${getLoanTypeStyle(row.loan_type)}`}
                                title={row.loan_type}
                              >
                                {row.loan_type}
                              </span>
                            </td>
                            <td className="p-5 text-sm font-bold text-gray-900 tabular-nums">
                              {PHP(row.net_cash_out)}
                              {row.is_estimated && (
                                <span
                                  title="KOICA/non-member loans aren't disbursed through the Cashier flow, so fees can't be computed — this is the gross loan amount."
                                  className="ml-1.5 inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500"
                                >
                                  Est.
                                </span>
                              )}
                            </td>
                            <td className="p-5 text-sm tabular-nums">
                              {row.shortfall > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1.5 text-[11px] font-bold text-red-700">
                                  <AlertTriangle size={11} /> {PHP(row.shortfall)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1.5 text-[11px] font-bold text-green-700">
                                  Covered
                                </span>
                              )}
                            </td>
                            <td className="p-5 text-sm text-gray-500">
                              {formatShortDate(row.rescheduled_at)}
                              {row.reschedule_note && (
                                <p className="mt-0.5 max-w-[16rem] truncate text-xs text-gray-400" title={row.reschedule_note}>
                                  {row.reschedule_note}
                                </p>
                              )}
                            </td>
                            <td className="p-5 text-sm text-right pr-8">
                              <button
                                onClick={() => navigate(`/treasurer-approval/${row.loan_id}?source=${row.source === "koica_loans" ? "koica" : "loans"}`)}
                                className="btn-enhanced text-member-green font-bold hover:text-green-800 transition-all"
                              >
                                Review
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {!rescheduledLoading && !rescheduledError && rescheduled.length > RESCHEDULED_PAGE_SIZE && (
                  <Pagination page={rescheduledPage} totalPages={totalRescheduledPages} onChange={setRescheduledPage} />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Treasurer_Approval;
