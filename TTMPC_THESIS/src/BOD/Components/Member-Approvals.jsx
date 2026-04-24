import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import { 
  LayoutDashboard, 
  Users, 
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
  Archive
} from 'lucide-react';
import { supabase } from "../../supabaseClient";
import { resolveAccountFromSessionUser } from "../../utils/sessionIdentity";
import logo from "../../assets/img/ttmpc logo.png";


const Member_Approvals = () => {
  const navigate = useNavigate();
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
    "For Revision": 0,
    "Official Member": 0,
  });
  const LIMIT = 10;

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
    if (tab === "Training") {
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
    if (tab === "Official Member") {
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

  const fetchData = async (pageNumber = 1, roleOverride = portalRole) => {
    const requestId = ++fetchRequestIdRef.current;
    const from = (pageNumber - 1) * LIMIT;
    const to = from + LIMIT - 1;

    let query = supabase
      .from("member_applications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    const statusClause = getStatusOrClause(activeTab, roleOverride);
    if (statusClause) {
      query = query.or(statusClause);
    }

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
    const tabsForCounts = ["Pending", "Training", "For Revision", "Official Member"];

    const countResults = await Promise.all(
      tabsForCounts.map(async (tab) => {
        let countQuery = supabase
          .from("member_applications")
          .select("application_id", { count: "exact", head: true });

        const statusClause = getStatusOrClause(tab, roleOverride);
        if (statusClause) {
          countQuery = countQuery.or(statusClause);
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

    setTabCounts((prev) => ({ ...prev, ...nextCounts }));
  };

  useEffect(() => {
    const checkSessionAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const role = await resolvePortalRole(session.user);
        setPortalRole(role);
        fetchData(1, role);
        fetchTabCounts(role);
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
  }, [authReady, portalRole]);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  const menuItems = [
    {
      section: "BOD",
      items: [
        { name: "Dashboard", icon: LayoutDashboard },
        { name: "Member Approvals", icon: Users },
        { name: "Manage Member", icon: Users },
      ]
    },
    {
      section: "SECRETARY",
      items: [
        { name: "Training Attendance", icon: CalendarCheck },
        { name: "Membership Records", icon: Archive  }
      ]
    }
  ];
  
  const handleSignOut = async (e) => {
    e.preventDefault();
    navigate("/");
  };

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
    return applications.map((app) => {
      const fullName = [app.first_name, app.middle_name, app.surname]
        .map((item) => (item || "").trim())
        .filter(Boolean)
        .join(" ");

      const trainingSchedule = getRuleSchedule(app.created_at);
      const normalizedStatusValue = normalizeStatus(app.application_status);

      return {
        id: app.application_id,
        name: fullName || "Unnamed Applicant",
        email: app.email || "-",
        annualIncome: app.annual_income ? `₱${Number(app.annual_income).toLocaleString()}` : "N/A",
        date: app.created_at ? new Date(app.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-",
        reason: app.remarks || "No reason provided",
        trainingDate: normalizedStatusValue === "Training" ? trainingSchedule.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Not scheduled",
        attendance: app.attendance_status || "Pending",
        result: app.evaluation_result || "Pending",
        secretaryRemarks: app.remarks || "No secretary remarks yet.",
        status: normalizedStatusValue,
      };
    });
  }, [applications]);

  const rowsForActiveTab = formattedRows;
  const isTrainingTab = activeTab === "Training";
  const isSecretary = portalRole === "secretary";
  const canUseBodActions = !isSecretary;
  const visibleTabs = isSecretary ? ["Pending"] : ["Pending", "Training", "For Revision", "Official Member"];

  const visiblePageNumbers = useMemo(() => {
    const safeTotal = Math.max(1, totalPages);
    const safePage = Math.min(Math.max(1, page), safeTotal);
    const start = Math.floor((safePage - 1) / 5) * 5 + 1;
    const end = Math.min(start + 4, safeTotal);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [page, totalPages]);

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="BOD Portal" fallbackRole="BOD" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((sectionGroup) => (
            <div key={sectionGroup.section} className="mb-4 flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">{sectionGroup.section}</p>
              {sectionGroup.items.map((item) => {
                const Icon = item.icon;
                const routeMap = { "Dashboard": "/BOD-dashboard", "Member Approvals": "/member-approvals", "Manage Member": "/bod-manage-member", "Training Attendance": "/Secretary_Attendance", "Membership Records": "/Secretary_Records" };
                const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;
                return (
                  <NavLink key={item.name} to={to} className={({ isActive }) => `flex items-center gap-3 p-2 rounded-md transition-colors ${isActive ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-700 hover:bg-green-50 hover:text-green-700'}`}>
                    <Icon size={20} />
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        
        <button onClick={handleSignOut} className="mt-auto w-full rounded p-2 text-xs bg-[#2C7A3F] hover:bg-green-800 text-white font-bold transition-colors">Sign out</button>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input type="text" className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]" placeholder="Search..."></input>
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
               <img src="src/assets/img/bookkeeper-profile.png" alt="Profile" className="w-full h-full object-cover"></img>
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
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">45</p>
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#FFF4E5] flex items-center justify-center flex-shrink-0">
                <ClipboardList className="text-[#D97706] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg Process Time</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">2.4 Days</p>
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#EAF5EC] flex items-center justify-center flex-shrink-0">
                <BadgeCheck className="text-[#2C7A3F] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Approval Rate</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">94.2%</p>
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
                  <span className={`text-[10px] px-2 py-0.5 rounded-full text-white ${activeTab === tab ? "bg-[#2C7A3F]" : "bg-gray-400"}`}>{tabCounts[tab]}</span>
                </button>
              ))}
            </div>

            <div className="flex justify-between items-center px-6 py-4">
               <h2 className="text-lg font-bold text-gray-800">{isTrainingTab ? `${activeTab} Attendance & Evaluation` : `${activeTab} Applications`}</h2>
               <div className="text-xs text-gray-400">
                  Showing {totalCount === 0 ? 0 : (page - 1) * LIMIT + 1}-{Math.min(page * LIMIT, totalCount)} of {totalCount} applications
               </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F8FAFC] text-gray-500 text-[11px] uppercase font-bold tracking-wider">
                  <tr>
                    {isTrainingTab ? (
                      <>
                        <th className="px-6 py-4">Member Name</th>
                        <th className="px-6 py-4">Training Schedule</th>
                        <th className="px-6 py-4">Attendance Status</th>
                        <th className="px-6 py-4">Evaluation Result</th>
                      </>
                    ) : (
                      <>
                        <th className="px-6 py-4">Application ID</th>
                        <th className="px-6 py-4">Member Name</th>
                        <th className="px-6 py-4">Annual Income</th>
                        <th className="px-6 py-4">Submitted Date</th>
                        {activeTab === "For Revision" && <th className="px-6 py-4">Revision Notes</th>}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rowsForActiveTab.length === 0 ? (
                    <tr><td colSpan="5" className="px-6 py-10 text-center text-gray-500">No {activeTab.toLowerCase()} records found.</td></tr>
                  ) : (
                    rowsForActiveTab.map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        {isTrainingTab ? (
                          <>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <button onClick={() => canUseBodActions && navigate(`/member-approvals/${row.id}`)} className={`text-left font-semibold ${canUseBodActions ? 'text-gray-800 hover:text-blue-600 hover:underline' : 'text-gray-500'}`}>{row.name}</button>
                              <div className="text-xs text-gray-400">{row.email}</div>
                            </td>
                            <td className="px-6 py-4 text-gray-600">{row.trainingDate}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${row.attendance === "Present" ? "border-green-300 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-600"}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${row.attendance === "Present" ? "bg-green-500" : "bg-red-500"}`} />
                                {row.attendance}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <button onClick={() => canUseBodActions && setSelectedEvaluationRow(row)} className={`px-3 py-1 rounded-full text-xs font-semibold border ${row.result === "Passed" ? "border-green-300 bg-green-50 text-green-700" : "border-yellow-300 bg-yellow-50 text-yellow-700"}`}>
                                {row.result === "Pending" ? "View Remarks" : row.result}
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-6 py-4 font-bold text-[#2C7A3F]">{row.id}</td>
                            <td className="px-6 py-4">
                              <button onClick={() => canUseBodActions && navigate(`/member-approvals/${row.id}`)} className="font-bold text-gray-800 hover:text-blue-600 hover:underline">{row.name}</button>
                              <div className="text-xs text-gray-400">{row.email}</div>
                            </td>
                            <td className="px-6 py-4 text-gray-600 font-medium">{row.annualIncome}</td>
                            <td className="px-6 py-4 text-gray-500">{row.date}</td>
                            {activeTab === "For Revision" && <td className="px-6 py-4"><span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">{row.reason}</span></td>}
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