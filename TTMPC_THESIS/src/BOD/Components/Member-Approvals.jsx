import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { bodNav } from "../../components/StaffSidebar/configs/bod";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard,
  Search,
  Bell,
  UserPlus,
  ClipboardList,
  BadgeCheck,
  Banknote,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  CalendarDays,
  CalendarCheck,
  Archive,
  FileText,
  ShieldCheck,
  AlertTriangle,
  History,
  ArrowRight
} from 'lucide-react';
import { supabase } from "../../supabaseClient";
import { resolveAccountFromSessionUser } from "../../utils/sessionIdentity";
import logo from "../../assets/img/ttmpc logo.png";
import NotificationBell from "./NotificationBell";


const Member_Approvals = () => {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [activeTab, setActiveTab] = useState("Pending");
  const [applications, setApplications] = useState([]);
  const [selectedEvaluationRow, setSelectedEvaluationRow] = useState(null);
  const [portalRole, setPortalRole] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const fetchRequestIdRef = useRef(0);
  const [tabCounts, setTabCounts] = useState({
    Pending: 0,
    Training: 0,
    Reschedule: 0,
    Approved: 0,
    "For Revision": 0,
    "Official Member": 0,
  });
  const [rescheduledAppIds, setRescheduledAppIds] = useState([]);
  const [stats, setStats] = useState({
    newThisMonth: null,
    avgPendingDays: null,
    approvalRate: null,
  });
  const LIMIT = 5;

  // LOGIC FIX: Added 'Training' to match your SQL Insert exactly
  const getStatusOrClause = (statusTab, roleOverride) => {
    const tab = roleOverride === "secretary" ? "Pending" : statusTab;

    const buildStatusClause = (values) => {
      const uniqueValues = [...new Set(values)];
      return uniqueValues.map((value) => `application_status.eq.${value}`).join(",");
    };

    if (tab === "Pending") {
      return buildStatusClause(["pending", "Pending", "PENDING"]);
    }
    if (tab === "Training" || tab === "Reschedule") {
      // Both tabs share the same application_status values. The split is done
      // client-side by cross-referencing attendance_logs for members who have
      // a "Rescheduled Training" log.
      return buildStatusClause([
        "Training", // Matches your INSERT
        "training",
        "1st Training",
        "1st_training",
        "training 1",
      ]);
    }
    if (tab === "For Revision") {
      return buildStatusClause(["for revision", "For Revision", "revision", "Revision"]);
    }
    if (tab === "Official Member" || tab === "Approved") {
      return buildStatusClause(["official member", "Official Member", "member", "Member"]);
    }
    return "";
  };

  const resolvePortalRole = async (sessionUser) => {
    if (!sessionUser?.id && !sessionUser?.email) return "";
    const account = await resolveAccountFromSessionUser(sessionUser);
    if (account?.role) {
      return String(account.role).trim().toLowerCase();
    }
    return "";
  };

  const fetchRescheduledAppIds = async () => {
    // A member belongs to the Reschedule tab as soon as they are marked Absent
    // at the Training stage (whether or not a new date has been picked yet).
    // We union that with any explicit "Rescheduled Training" logs so both
    // states move the row out of Training and into Reschedule consistently.
    const [rescheduledRes, absentRes] = await Promise.all([
      supabase
        .from("attendance_logs")
        .select("application_id")
        .eq("training_stage", "Rescheduled Training"),
      supabase
        .from("attendance_logs")
        .select("application_id")
        .eq("training_stage", "Training")
        .in("attendance_status", ["Absent", "Rescheduled"]),
    ]);
    if (rescheduledRes.error) {
      console.warn("Unable to load rescheduled logs:", rescheduledRes.error.message || rescheduledRes.error);
    }
    if (absentRes.error) {
      console.warn("Unable to load absent training logs:", absentRes.error.message || absentRes.error);
    }
    const ids = [
      ...(rescheduledRes.data || []),
      ...(absentRes.data || []),
    ].map((r) => r.application_id).filter(Boolean);
    return [...new Set(ids)];
  };

  const fetchData = async (pageNumber = 1, roleOverride = portalRole) => {
    const requestId = ++fetchRequestIdRef.current;
    const from = (pageNumber - 1) * LIMIT;
    const to = from + LIMIT - 1;

    const effectiveTab = roleOverride === "secretary" ? "Pending" : activeTab;
    const isTrainingSplitTab = effectiveTab === "Training" || effectiveTab === "Reschedule";

    // For Training / Reschedule we need the rescheduled ID set to split rows
    // between the two tabs. Pull it fresh so newly-rescheduled members move
    // out of Training immediately.
    let currentRescheduledIds = rescheduledAppIds;
    if (isTrainingSplitTab) {
      currentRescheduledIds = await fetchRescheduledAppIds();
      if (requestId !== fetchRequestIdRef.current) return;
      setRescheduledAppIds(currentRescheduledIds);
    }

    let query = supabase
      .from("member_applications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    const statusClause = getStatusOrClause(activeTab, roleOverride);
    if (statusClause) {
      query = query.or(statusClause);
    }

    if (isTrainingSplitTab && currentRescheduledIds.length > 0) {
      if (effectiveTab === "Reschedule") {
        query = query.in("application_id", currentRescheduledIds);
      } else {
        // Training: exclude anyone who has been rescheduled.
        const notInList = `(${currentRescheduledIds.map((id) => `"${id}"`).join(",")})`;
        query = query.not("application_id", "in", notInList);
      }
    } else if (isTrainingSplitTab && effectiveTab === "Reschedule") {
      // No rescheduled logs at all → empty page.
      if (requestId !== fetchRequestIdRef.current) return;
      setApplications([]);
      setTotalCount(0);
      setTotalPages(1);
      return;
    }

    query = query.range(from, to);

    const { data, count, error } = await query;

    if (requestId !== fetchRequestIdRef.current) return;
    if (error) {
      console.error("Supabase Error:", error);
      return;
    }

    setApplications(data || []);
    const resolvedCount = count || 0;
    setTotalCount(resolvedCount);
    setTotalPages(Math.max(1, Math.ceil(resolvedCount / LIMIT)));
  };

  const fetchTabCounts = async (roleOverride = portalRole) => {
    const requestId = fetchRequestIdRef.current;
    const tabsForCounts = ["Pending", "Training", "Approved", "For Revision", "Official Member"];

    const rescheduledIds = await fetchRescheduledAppIds();
    if (requestId !== fetchRequestIdRef.current) return;
    setRescheduledAppIds(rescheduledIds);

    const countResults = await Promise.all(
      tabsForCounts.map(async (tab) => {
        let countQuery = supabase
          .from("member_applications")
          .select("application_id", { count: "exact", head: true });

        const statusClause = getStatusOrClause(tab, roleOverride);
        if (statusClause) {
          countQuery = countQuery.or(statusClause);
        }

        // Training count must exclude rescheduled members so it matches the
        // filtered fetch above.
        if (tab === "Training" && rescheduledIds.length > 0) {
          const notInList = `(${rescheduledIds.map((id) => `"${id}"`).join(",")})`;
          countQuery = countQuery.not("application_id", "in", notInList);
        }

        const { count, error } = await countQuery;
        if (requestId !== fetchRequestIdRef.current) return { tab, count: 0 };
        return { tab, count: count || 0, error };
      })
    );

    const nextCounts = countResults.reduce((acc, result) => {
      acc[result.tab] = result.count;
      return acc;
    }, {});

    // Reschedule count = training-status applications that also have a
    // rescheduled log. Compute via a targeted count query.
    if (rescheduledIds.length > 0) {
      const trainingClause = getStatusOrClause("Training", roleOverride);
      let rescheduleCountQuery = supabase
        .from("member_applications")
        .select("application_id", { count: "exact", head: true })
        .in("application_id", rescheduledIds);
      if (trainingClause) rescheduleCountQuery = rescheduleCountQuery.or(trainingClause);
      const { count: rescheduleCount } = await rescheduleCountQuery;
      if (requestId === fetchRequestIdRef.current) {
        nextCounts.Reschedule = rescheduleCount || 0;
      }
    } else {
      nextCounts.Reschedule = 0;
    }

    setTabCounts((prev) => ({ ...prev, ...nextCounts }));
  };

  const fetchStats = async () => {
    // Pull only the columns needed to compute stats. All rows are needed so
    // approval rate is calculated across the whole applicant history.
    const { data, error } = await supabase
      .from("member_applications")
      .select("created_at,application_status");
    if (error) {
      console.error("Stats fetch error:", error);
      return;
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const isPending = (s) => /^pending$/i.test(String(s || "").trim());
    const isApproved = (s) => {
      const v = String(s || "").trim().toLowerCase();
      return v === "official member" || v === "member";
    };
    const isRejected = (s) => {
      const v = String(s || "").trim().toLowerCase();
      return v === "rejected" || v === "denied" || v === "for revision" || v === "revision";
    };

    let newThisMonth = 0;
    let pendingDaysSum = 0;
    let pendingCount = 0;
    let approved = 0;
    let decided = 0;

    (data || []).forEach((row) => {
      const created = row.created_at ? new Date(row.created_at) : null;
      if (created && created >= monthStart) newThisMonth += 1;
      if (isPending(row.application_status) && created) {
        const days = (now - created) / (1000 * 60 * 60 * 24);
        if (Number.isFinite(days) && days >= 0) {
          pendingDaysSum += days;
          pendingCount += 1;
        }
      }
      if (isApproved(row.application_status)) {
        approved += 1;
        decided += 1;
      } else if (isRejected(row.application_status)) {
        decided += 1;
      }
    });

    setStats({
      newThisMonth,
      avgPendingDays: pendingCount ? pendingDaysSum / pendingCount : 0,
      approvalRate: decided ? (approved / decided) * 100 : null,
    });
  };

  useEffect(() => {
    const checkSessionAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const role = await resolvePortalRole(session.user);
        setPortalRole(role);
        fetchData(1, role);
        fetchTabCounts(role);
        fetchStats();
      }
      setAuthReady(true);
    };
    checkSessionAndFetch();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    fetchData(page, portalRole);
  }, [authReady, portalRole, page, activeTab]);

  useEffect(() => {
    if (!authReady) return;
    fetchTabCounts(portalRole);
    fetchStats();
  }, [authReady, portalRole]);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);


  const normalizeStatus = (applicationStatus, trainingStatus) => {
    const normalized = (applicationStatus || "").toLowerCase().trim();
    if (normalized === "pending") return "Pending";
    if (normalized === "training" || normalized === "1st training") return "Training";
    if (normalized === "for revision" || normalized === "revision") return "For Revision";
    if (normalized === "official member" || normalized === "member") return "Official Member";
    return "Pending";
  };

  // Business Logic: 3rd Saturday of March and Sept
  const getThirdSaturday = (year, monthIndex) => {
    const firstDay = new Date(year, monthIndex, 1);
    const dayOfWeek = firstDay.getDay();
    const firstSaturdayDate = dayOfWeek === 6 ? 1 : 1 + ((6 - dayOfWeek + 7) % 7);
    return new Date(year, monthIndex, firstSaturdayDate + 14);
  };

  const getRuleSchedule = (referenceDateInput) => {
    const referenceDate = new Date(referenceDateInput);
    const fallbackDate = isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
    const year = fallbackDate.getFullYear();
    const marchSchedule = getThirdSaturday(year, 2);
    const septemberSchedule = getThirdSaturday(year, 8);

    if (fallbackDate <= marchSchedule) return marchSchedule;
    if (fallbackDate <= septemberSchedule) return septemberSchedule;
    return getThirdSaturday(year + 1, 2);
  };

  const formattedRows = useMemo(() => {
    const rows = applications.map((app) => {
      const fullName = [app.first_name, app.middle_name, app.surname]
        .map((item) => (item || "").trim())
        .filter(Boolean)
        .join(" ");

      const trainingSchedule = getRuleSchedule(app.created_at);
      const normalizedStatusValue = normalizeStatus(app.application_status);
      const cleanAttendance = (app.attendance_status || "Pending").replace(/^[•\s]+/, "").trim();

      return {
        id: app.application_id,
        name: fullName || "Unnamed Applicant",
        email: app.email || "-",
        annualIncome: app.annual_income ? `₱${Number(app.annual_income).toLocaleString()}` : "N/A",
        date: app.created_at ? new Date(app.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-",
        reason: app.remarks || "No reason provided",
        trainingDate: normalizedStatusValue === "Training" ? trainingSchedule.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Not scheduled",
        attendance: cleanAttendance,
        result: app.evaluation_result || "Pending",
        secretaryRemarks: app.remarks || "No secretary remarks yet.",
        status: normalizedStatusValue,
      };
    });
    
    // Sort so Pending status appears at the top
    return rows.sort((a, b) => {
      if (a.status === "Pending" && b.status !== "Pending") return -1;
      if (a.status !== "Pending" && b.status === "Pending") return 1;
      return 0;
    });
  }, [applications]);

  const rowsForActiveTab = formattedRows;
  const isTrainingTab = activeTab === "Training" || activeTab === "Reschedule";
  const isSecretary = portalRole === "secretary";
  const canUseBodActions = !isSecretary;
  const visibleTabs = isSecretary
    ? ["Pending"]
    : ["Pending", "Training", "Reschedule", "Approved", "For Revision"];

  const visiblePageNumbers = useMemo(() => {
    const safeTotal = Math.max(1, totalPages);
    const safePage = Math.min(Math.max(1, page), safeTotal);
    const start = Math.floor((safePage - 1) / 5) * 5 + 1;
    const end = Math.min(start + 4, safeTotal);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [page, totalPages]);

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <StaffSidebar portal="BOD" items={bodNav} />

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input type="text" className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]" placeholder="Search..."></input>
          </div>
          <NotificationBell />
          <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
               <img src="/img/bookkeeper-profile.png" alt="Profile" className="w-full h-full object-cover"></img>
            </div>
            <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="BOD" />
          </div>
        </header>
        <main className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6" >
            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#EAF5EC] flex items-center justify-center flex-shrink-0">
                <UserPlus className="text-[#2C7A3F] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New This Month</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">
                  {stats.newThisMonth ?? "—"}
                </p>
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#FFF4E5] flex items-center justify-center flex-shrink-0">
                <ClipboardList className="text-[#D97706] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg Days in Pending</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">
                  {stats.avgPendingDays === null
                    ? "—"
                    : `${stats.avgPendingDays.toFixed(1)} ${
                        stats.avgPendingDays === 1 ? "Day" : "Days"
                      }`}
                </p>
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#EAF5EC] flex items-center justify-center flex-shrink-0">
                <BadgeCheck className="text-[#2C7A3F] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Approval Rate</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">
                  {stats.approvalRate === null
                    ? "—"
                    : `${stats.approvalRate.toFixed(1)}%`}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-6 px-6 pt-4 border-b border-gray-100">
              {visibleTabs.map(tab => (
                <button 
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-semibold text-sm transition-colors ${activeTab === tab ? "border-[#2C7A3F] text-[#2C7A3F]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                >
                  {tab}
                  <span className={`badge-animated text-[10px] px-2 py-0.5 rounded-full text-white ${activeTab === tab ? "bg-[#2C7A3F]" : "bg-gray-400"}`}>{tabCounts[tab]}</span>
                </button>
              ))}
            </div>

            <div className="flex justify-between items-center p-5 text-sm">
               <h2 className="text-lg font-bold text-gray-800">{isTrainingTab ? `${activeTab} Attendance & Membership Approval` : `${activeTab} Applications`}</h2>
               <div className="text-xs text-gray-400">
                  Showing {totalCount === 0 ? 0 : (page - 1) * LIMIT + 1}-{Math.min(page * LIMIT, totalCount)} of {totalCount} applications
               </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    {isTrainingTab ? (
                      <>
                        <th className="p-5 font-bold">Member Name</th>
                        <th className="p-5 font-bold">Training Schedule</th>
                        <th className="p-5 font-bold">Attendance Status</th>
                        <th className="p-5 font-bold">Evaluation Result</th>
                        <th className="p-5 font-bold">Action</th>
                      </>
                    ) : (
                      <>
                        <th className="p-5 font-bold">Application ID</th>
                        <th className="p-5 font-bold">Member Name</th>
                        <th className="p-5 font-bold">Annual Income</th>
                        <th className="p-5 font-bold">Submitted Date</th>
                        {activeTab === "For Revision" && <th className="p-5 font-bold">Revision Notes</th>}
                        {(activeTab === "Pending" || activeTab === "Training" || activeTab === "Approved") && <th className="p-5 font-bold">Action</th>}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rowsForActiveTab.length === 0 ? (
                    <tr><td colSpan={isTrainingTab ? "5" : activeTab === "For Revision" ? "5" : "5"} className="p-5 text-sm text-center text-gray-500">No {activeTab.toLowerCase()} records found.</td></tr>
                  ) : (
                    rowsForActiveTab.map((row, index) => (
                      <tr key={index} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        {isTrainingTab ? (
                          <>
                            <td className="p-5 text-sm whitespace-nowrap">
                              <button onClick={() => canUseBodActions && navigate(`/member-approvals/${row.id}`)} className={`text-left font-semibold ${canUseBodActions ? 'text-gray-800 hover:text-blue-600 hover:underline' : 'text-gray-500'}`}>{row.name}</button>
                              <div className="text-xs text-gray-400">{row.email}</div>
                            </td>
                            <td className="p-5 text-sm text-gray-600">{row.trainingDate}</td>
                            <td className="p-5 text-sm">
                              <span className={`badge-animated inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border ${row.attendance === "Present" ? "border-green-300 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-600"}`}>
                                <span className={` ${row.attendance === "Present" ? "bg-green-500" : "bg-red-500"}`} />
                                {row.attendance}
                              </span>
                            </td>
                            <td className="p-5 text-sm">
                              <button onClick={() => canUseBodActions && setSelectedEvaluationRow(row)} className={`badge-animated px-3 py-1 rounded-full text-xs font-semibold border ${row.result === "Passed" ? "border-green-300 bg-green-50 text-green-700" : "border-yellow-300 bg-yellow-50 text-yellow-700"}`}>
                                {row.result === "Pending" ? "View Remarks" : row.result}
                              </button>
                            </td>
                            <td className="p-5 text-sm">
                              <button
                                onClick={() => canUseBodActions && navigate(`/member-approvals/${row.id}`)}
                                disabled={!canUseBodActions}
                                className="inline-flex items-center gap-2 px-6 py-2 bg-[#2C7A3F] hover:bg-[#1e5a2a] text-white rounded-lg font-semibold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                View Details
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-5 text-sm font-bold text-[#2C7A3F]">{row.id}</td>
                            <td className="p-5 text-sm">
                              <button onClick={() => canUseBodActions && navigate(`/member-approvals/${row.id}`)} className="font-bold text-gray-800 hover:text-blue-600 hover:underline">{row.name}</button>
                              <div className="text-xs text-gray-400">{row.email}</div>
                            </td>
                            <td className="p-5 text-sm text-gray-600 font-medium">{row.annualIncome}</td>
                            <td className="p-5 text-sm text-gray-500">{row.date}</td>
                            {activeTab === "For Revision" && <td className="p-5 text-sm"><span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">{row.reason}</span></td>}
                            {(activeTab === "Pending" || activeTab === "Training" || activeTab === "Approved") && (
                              <td className="p-5 text-sm">
                                <button onClick={() => canUseBodActions && navigate(`/member-approvals/${row.id}`)} className="inline-flex items-center gap-2 px-6 py-2 bg-[#2C7A3F] hover:bg-[#1e5a2a] text-white rounded-lg font-semibold text-xs transition-colors" disabled={!canUseBodActions}>
                                  View Details
                                </button>
                              </td>
                            )}
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-center gap-2 py-6 border-t border-gray-50">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="w-8 h-8 rounded-full border flex items-center justify-center disabled:opacity-50"><ChevronLeft size={16}/></button>
              {visiblePageNumbers.map(n => (
                <button key={n} onClick={() => setPage(n)} className={`w-8 h-8 rounded-full border text-xs font-semibold ${page === n ? "bg-[#16A34A] text-white" : "bg-white text-gray-600"}`}>{n}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="w-8 h-8 rounded-full border flex items-center justify-center disabled:opacity-50"><ChevronRight size={16}/></button>
            </div>
          </div>
        </main>
      </div>

      {selectedEvaluationRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Evaluation Result Details</h3>
              <button onClick={() => setSelectedEvaluationRow(null)} className="text-gray-500 hover:text-gray-800 text-sm font-semibold">Close</button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div><p className="text-gray-400 text-xs font-bold uppercase">Member</p><p className="font-semibold">{selectedEvaluationRow.name}</p></div>
              <div><p className="text-gray-400 text-xs font-bold uppercase">Attendance</p><p className="font-semibold">{selectedEvaluationRow.attendance}</p></div>
            </div>
            <div className="border rounded-lg p-4 bg-gray-50">
              <p className="text-gray-400 text-xs font-bold uppercase mb-2">Secretary Remarks</p>
              <p className="text-gray-800 text-sm whitespace-pre-wrap">{selectedEvaluationRow.secretaryRemarks}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Member_Approvals;