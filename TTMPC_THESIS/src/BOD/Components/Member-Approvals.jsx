import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
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
  CalendarCheck
} from 'lucide-react';
import { supabase } from "../../supabaseClient";
import logo from "../../assets/img/ttmpc logo.png";


const Member_Approvals = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Pending");
  const [applications, setApplications] = useState([]);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from("member_applications")
      .select("*")
      .order("created_at", { ascending: false });

    console.log("Supabase Data:", data);
    if (error) {
      console.error("Supabase Error:", error);
    }

    if (!error && data) {
      setApplications(data);
    }
  };

  useEffect(() => {
    const checkSessionAndFetch = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      console.log("Current User:", session?.user?.email);

      if (session) {
        fetchData();
      } else {
        console.warn("No active session! RLS will block the query.");
      }
    };

    checkSessionAndFetch();
  }, []);


 const menuItems = [
    {
      section: "BOD",
      items: [
        { name: "Dashboard", icon: LayoutDashboard },
        { name: "Member Approvals", icon: Users },
      ]
    },
    {
      section: "SECRETARY",
      items: [
        { name: "Training Attendance", icon: CalendarCheck },
      ]
    }
  ];
  
  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const normalizeStatus = (value) => {
    const normalized = (value || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

    if (normalized === "pending") return "Pending";
    if (normalized === "rejected") return "Rejected";
    if (normalized === "for revision" || normalized === "revision") return "For Revision";
    if (normalized === "1st training" || normalized === "first training" || normalized === "training 1") return "1st Training";
    if (normalized === "2nd training" || normalized === "second training" || normalized === "training 2") return "2nd Training";
    if (normalized === "official member" || normalized === "member") return "Official Member";
    return "Pending";
  };

  const formatDisplayDate = (value) => {
    if (!value) return "Not scheduled";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const getThirdSaturday = (year, monthIndex) => {
    const firstDay = new Date(year, monthIndex, 1);
    const dayOfWeek = firstDay.getDay();
    const firstSaturdayDate = dayOfWeek === 6 ? 1 : 1 + ((6 - dayOfWeek + 7) % 7);
    return new Date(year, monthIndex, firstSaturdayDate + 14);
  };

  const getRuleSchedule = (referenceDateInput) => {
    const referenceDate = new Date(referenceDateInput);
    const fallbackDate = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
    const year = fallbackDate.getFullYear();

    const marchSchedule = getThirdSaturday(year, 2);
    const septemberSchedule = getThirdSaturday(year, 8);

    if (fallbackDate <= marchSchedule) return marchSchedule;
    if (fallbackDate <= septemberSchedule) return septemberSchedule;

    return getThirdSaturday(year + 1, 2);
  };

  const getNextRuleSchedule = (currentScheduleDate) => {
    const date = new Date(currentScheduleDate);
    if (Number.isNaN(date.getTime())) {
      return getRuleSchedule(new Date().toISOString());
    }

    const year = date.getFullYear();
    const month = date.getMonth();

    if (month === 2) return getThirdSaturday(year, 8);
    if (month === 8) return getThirdSaturday(year + 1, 2);
    return getRuleSchedule(date.toISOString());
  };

  const formattedRows = useMemo(() => {
    return applications.map((app) => {
      const fullName = [app.first_name, app.middle_name, app.surname]
        .map((item) => (item || "").trim())
        .filter(Boolean)
        .join(" ");

      const firstTrainingSchedule = getRuleSchedule(app.created_at || new Date().toISOString());
      const secondTrainingSchedule = getNextRuleSchedule(firstTrainingSchedule);

      let computedTrainingDate = "Not scheduled";
      const normalized = normalizeStatus(app.application_status);
      if (normalized === "1st Training") {
        computedTrainingDate = formatDisplayDate(firstTrainingSchedule.toISOString());
      }
      if (normalized === "2nd Training") {
        computedTrainingDate = formatDisplayDate(secondTrainingSchedule.toISOString());
      }

      return {
        id: app.application_id,
        name: fullName || "Unnamed Applicant",
        email: app.email || "-",
        annualIncome: app.annual_income || "N/A",
        date: app.created_at
          ? new Date(app.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "-",
        reason: app.rejection_reason || app.remarks || "No reason provided",
        trainingDate: computedTrainingDate,
        attendance: app.attendance_status || "Pending",
        result: app.evaluation_result || "Pending",
        status: normalizeStatus(app.application_status),
      };
    });
  }, [applications]);

  const tabData = useMemo(() => {
    return {
      Pending: formattedRows.filter((row) => row.status === "Pending"),
      "1st Training": formattedRows.filter((row) => row.status === "1st Training"),
      "2nd Training": formattedRows.filter((row) => row.status === "2nd Training"),
      "For Revision": formattedRows.filter((row) => row.status === "For Revision"),
      Rejected: formattedRows.filter((row) => row.status === "Rejected"),
      "Official Member": formattedRows.filter((row) => row.status === "Official Member"),
    };
  }, [formattedRows]);

  const isTrainingTab = activeTab === "1st Training" || activeTab === "2nd Training";

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              BOD Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
                  {(() => {
                    const routeMap = {
                      "Dashboard": "/BOD-dashboard",
                      "Member Approvals": "/member-approvals",
                      "Training Attendance": "/Secretary_Attendance"
                    };
        
                    // 1. Map through the section categories first
                    return menuItems.map((sectionGroup) => (
                      <div key={sectionGroup.section} className="mb-4 flex flex-col gap-2">
                        {/* Optional: You can display the section name here if you want */}
                        <p className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">
                          {sectionGroup.section}
                        </p>
                        
                        {/* 2. Then map through the actual items inside that section */}
                        {sectionGroup.items.map((item) => {
                          const Icon = item.icon;
                          const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;
        
                          return (
                            <NavLink
                              key={item.name}
                              to={to}
                              className={({ isActive }) =>
                                `flex items-center gap-3 p-2 rounded-md transition-colors ${
                                  isActive
                                    ? 'bg-green-50 text-green-700 font-semibold'
                                    : 'text-gray-700 hover:bg-green-50 hover:text-green-700'
                                }`
                              }
                            >
                              <Icon size={20} />
                              <span>{item.name}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </nav>
        
        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded p-2 text-xs bg-[#2C7A3F] hover:bg-green-800 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input type="text" className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-200 pl-10 pr-4 
            py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]" placeholder="Search..."></input>
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
            <img src="src/assets/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200"></img>
            <p className="text-sm font-medium text-gray-700">Manager</p>
          </div>
        </header>

        <main className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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
              <button 
                onClick={() => setActiveTab("Pending")}
                className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-semibold text-sm transition-colors ${activeTab === "Pending" ? "border-[#2C7A3F] text-[#2C7A3F]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                Pending
                <span className={`text-[10px] px-2 py-0.5 rounded-full text-white ${activeTab === "Pending" ? "bg-[#2C7A3F]" : "bg-gray-400"}`}>{tabData["Pending"].length}</span>
              </button>
              <button 
                onClick={() => setActiveTab("1st Training")}
                className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-semibold text-sm transition-colors ${activeTab === "1st Training" ? "border-[#2C7A3F] text-[#2C7A3F]" : "border-transparent text-gray-400 hover:text-gray-700"}`}
              >
                1st Training
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${activeTab === "1st Training" ? "bg-[#2C7A3F] text-white" : "bg-gray-100 text-gray-500"}`}>{tabData["1st Training"].length}</span>
              </button>
              <button 
                onClick={() => setActiveTab("2nd Training")}
                className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-semibold text-sm transition-colors ${activeTab === "2nd Training" ? "border-[#2C7A3F] text-[#2C7A3F]" : "border-transparent text-gray-400 hover:text-gray-700"}`}
              >
                2nd Training
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${activeTab === "2nd Training" ? "bg-[#2C7A3F] text-white" : "bg-gray-100 text-gray-500"}`}>{tabData["2nd Training"].length}</span>
              </button>
              <button 
                onClick={() => setActiveTab("Rejected")}
                className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-semibold text-sm transition-colors ${activeTab === "Rejected" ? "border-[#2C7A3F] text-[#2C7A3F]" : "border-transparent text-gray-400 hover:text-gray-700"}`}
              >
                Rejected
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${activeTab === "Rejected" ? "bg-red-500 text-white" : "bg-red-100 text-red-500"}`}>{tabData["Rejected"].length}</span>
              </button>
              <button
                onClick={() => setActiveTab("For Revision")}
                className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-semibold text-sm transition-colors ${activeTab === "For Revision" ? "border-[#2C7A3F] text-[#2C7A3F]" : "border-transparent text-gray-400 hover:text-gray-700"}`}
              >
                For Revision
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${activeTab === "For Revision" ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-600"}`}>{tabData["For Revision"].length}</span>
              </button>
              <button
                onClick={() => setActiveTab("Official Member")}
                className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-semibold text-sm transition-colors ${activeTab === "Official Member" ? "border-[#2C7A3F] text-[#2C7A3F]" : "border-transparent text-gray-400 hover:text-gray-700"}`}
              >
                Official Member
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${activeTab === "Official Member" ? "bg-green-600 text-white" : "bg-green-100 text-green-700"}`}>{tabData["Official Member"].length}</span>
              </button>
            </div>

            
            {isTrainingTab ? (
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-800">
                  {activeTab} Attendance &amp; Evaluation
                </h2>
                <div className="flex items-center gap-3">
                  <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                    <Download className="w-4 h-4" />
                    Export List
                  </button>
                  <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2C7A3F] text-white text-sm font-medium hover:bg-green-800 transition-colors">
                    <CalendarDays className="w-4 h-4" />
                    Schedule Training
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center px-6 py-4">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>Filter by Annual Income:</span>
                  <div className="relative">
                    <select className="appearance-none bg-white border border-gray-200 text-gray-700 py-1.5 pl-3 pr-8 rounded-md focus:outline-none focus:ring-1 focus:ring-[#2C7A3F] text-sm font-medium cursor-pointer">
                      <option>All</option>
                      <option>Below ₱50,000</option>
                      <option>₱50,000 - ₱100,000</option>
                      <option>Above ₱100,000</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Showing 1-{tabData[activeTab].length} of {tabData[activeTab].length} {activeTab.toLowerCase()} applications
                </div>
              </div>
            )}

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
                        {activeTab === "Pending" && <th className="px-6 py-4">Submitted Date</th>}
                        {activeTab === "Rejected" && (
                          <>
                            <th className="px-6 py-4">Submitted Date</th> 
                            <th className="px-6 py-4">Rejection Reason</th>
                          </>
                        )}
                        {activeTab === "For Revision" && (
                          <>
                            <th className="px-6 py-4">Submitted Date</th>
                            <th className="px-6 py-4">Revision Notes</th>
                          </>
                        )}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 cursor-pointer">
                  {tabData[activeTab].map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      {isTrainingTab ? (
                        <>
                        
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              className="text-left font-semibold text-gray-800 hover:text-blue-600 hover:underline"
                              onClick={() => row.id && navigate(`/member-approvals/${row.id}`)}
                            >
                              {row.name}
                            </button>
                            <div className="text-xs text-gray-400">{row.email}</div>
                          </td>
                         
                          <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                            {row.trainingDate}
                          </td>
                         
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                              row.attendance === "Present"
                                ? "border-green-300 bg-green-50 text-green-700"
                                : "border-red-300 bg-red-50 text-red-600"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                row.attendance === "Present" ? "bg-green-500" : "bg-red-500"
                              }`} />
                              {row.attendance}
                            </span>
                          </td>
                         
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
                              row.result === "Passed"
                                ? "border-green-300 bg-green-50 text-green-700"
                                : row.result === "Pending"
                                ? "border-yellow-300 bg-yellow-50 text-yellow-700"
                                : "border-gray-300 bg-gray-50 text-gray-500"
                            }`}>
                              {row.result}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-bold text-[#2C7A3F]">{row.id}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              className="text-left font-bold text-gray-800 hover:text-blue-600 hover:underline"
                              onClick={() => row.id && navigate(`/member-approvals/${row.id}`)}
                            >
                              {row.name}
                            </button>
                            <div className="text-xs text-gray-400">{row.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-600 font-medium">
                            {row.annualIncome}
                          </td>
                          {activeTab === "Pending" && (
                            <td className="px-6 py-4 whitespace-nowrap text-gray-500">{row.date}</td>
                          )}
                          {activeTab === "Rejected" && (
                            <>
                              <td className="px-6 py-4 whitespace-nowrap text-gray-500">{row.date}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">
                                  {row.reason}
                                </span>
                              </td>
                            </>
                          )}
                          {activeTab === "For Revision" && (
                            <>
                              <td className="px-6 py-4 whitespace-nowrap text-gray-500">{row.date}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                                  {row.reason}
                                </span>
                              </td>
                            </>
                          )}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-center gap-2 py-6 border-t border-gray-50">
              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {[1, 2, 3, 4, 5].map((page) => (
                <button
                  key={page}
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    page === 1
                      ? "bg-[#2C7A3F] text-white border-transparent"
                      : "border border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default Member_Approvals;