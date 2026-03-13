import React, { useState } from "react";
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
  CalendarDays
} from 'lucide-react';
import { supabase } from "../../supabaseClient";


const Member_Approvals = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Pending");
  const [application, setApplication] = useState();


   const fetchData = async ()=>{
    const [error, data] = await supabase
    .from("Membership_Form")
    .select("")
    .order("created_at", { ascending: false });


    if (!error) {
      setApplication(data);
    }
  };


  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Approvals", icon: Users }
  ];

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const tabData = {
    "Pending": [
      { id: "APP-001", name: "Juan Dela Cruz", email: "juan.cruz@email.com", employer: "DepEd", date: "Oct 12, 2023" },
      { id: "APP-002", name: "Maria Santos", email: "m.santos88@email.com", employer: "DepEd", date: "Oct 11, 2023" },
      { id: "APP-003", name: "Ricardo Lim", email: "ric_lim@email.com", employer: "DepEd", date: "Oct 11, 2023" },
      { id: "APP-004", name: "Elena Reyes", email: "e.reyes_90@email.com", employer: "DepEd", date: "Oct 10, 2023" },
      { id: "APP-005", name: "Roberto Gomez", email: "rob.gomez@email.com", employer: "DepEd", date: "Oct 10, 2023" },
    ],
    "1st Training": [
      { name: "Carlo Mendoza",      email: "carlo.mendoza@gmail.com",   trainingDate: "Jan. 31, 2026 – 9:00 AM", attendance: "Present", result: "Passed" },
      { name: "Angela Reyes",       email: "angela.reyes@gmail.com",    trainingDate: "Jan. 31, 2026 – 9:00 AM", attendance: "Present", result: "Pending" },
      { name: "Jessa Mae Gonzales", email: "jm.gonzales@gmail.com",     trainingDate: "Jan. 31, 2026 – 9:00 AM", attendance: "Absent",  result: "N/A" },
      { name: "Nicole Anne Bautista", email: "nicole.bautista@gmail.com", trainingDate: "Jan. 31, 2026 – 9:00 AM", attendance: "Present", result: "Passed" },
      { name: "Kevin Navarro",      email: "kevin.navarro@gmail.com",   trainingDate: "Jan. 31, 2026 – 9:00 AM", attendance: "Absent",  result: "N/A" },
      { name: "Jasmine Flores",     email: "jasmine.flores@gmail.com",  trainingDate: "Jan. 31, 2026 – 9:00 AM", attendance: "Present", result: "Passed" },
      { name: "Bea Castro",         email: "bea.castro@gmail.com",      trainingDate: "Jan. 31, 2026 – 9:00 AM", attendance: "Present", result: "Pending" },
      { name: "Dave Herrera",       email: "dave.herrera@gmail.com",    trainingDate: "Jan. 31, 2026 – 9:00 AM", attendance: "Present", result: "Passed" },
    ],
    "2nd Training": [
      { name: "Carlo Mendoza",      email: "carlo.mendoza@gmail.com",   trainingDate: "Feb. 7, 2026 – 9:00 AM", attendance: "Present", result: "Passed" },
      { name: "Angela Reyes",       email: "angela.reyes@gmail.com",    trainingDate: "Feb. 7, 2026 – 9:00 AM", attendance: "Present", result: "Passed" },
      { name: "Jessa Mae Gonzales", email: "jm.gonzales@gmail.com",     trainingDate: "Feb. 7, 2026 – 9:00 AM", attendance: "Present", result: "Passed" },
      { name: "Nicole Anne Bautista", email: "nicole.bautista@gmail.com", trainingDate: "Feb. 7, 2026 – 9:00 AM", attendance: "Present", result: "Passed" },
      { name: "Kevin Navarro",      email: "kevin.navarro@gmail.com",   trainingDate: "Feb. 7, 2026 – 9:00 AM", attendance: "Absent",  result: "N/A" },
    ],
    "Rejected": [
      { id: "APP-014", name: "Pedro Castillo", email: "pedro.c@email.com", employer: "DepEd", date: "Oct 8, 2023", reason: "Incomplete Documents" },
      { id: "APP-015", name: "Luz Miranda", email: "luz.m@email.com", employer: "DepEd", date: "Oct 7, 2023", reason: "Failed Background Check" },
      { id: "APP-016", name: "Tony Ocampo", email: "tony.o@email.com", employer: "DepEd", date: "Oct 6, 2023", reason: "Duplicate Application" },
    ],
  };

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
          {menuItems.map((item) => {
            const Icon = item.icon;
            const routeMap = {
              "Dashboard": "/manager-dashboard",
              "Member Approvals": "/member-approvals"
            };
            const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;

            return (
              <NavLink
                key={item.name}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2 rounded-md transition-colors ${
                    isActive || item.name === "Member Approvals" 
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#EAF5EC] flex items-center justify-center flex-shrink-0">
                <Banknote className="text-[#2C7A3F] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Projected Capital</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">₱142.5K</p>
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
                  <span>Filter by Employer:</span>
                  <div className="relative">
                    <select className="appearance-none bg-white border border-gray-200 text-gray-700 py-1.5 pl-3 pr-8 rounded-md focus:outline-none focus:ring-1 focus:ring-[#2C7A3F] text-sm font-medium cursor-pointer">
                      <option>All Employers</option>
                      <option>DepEd</option>
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
                        <th className="px-6 py-4">Employer</th>
                        {activeTab === "Pending" && <th className="px-6 py-4">Submitted Date</th>}
                        {activeTab === "Rejected" && (
                          <>
                            <th className="px-6 py-4">Submitted Date</th>
                            <th className="px-6 py-4">Rejection Reason</th>
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
                            <div className="font-semibold text-gray-800">{row.name}</div>
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
                              onClick={() => navigate(`/member-approvals/${row.id}`)}
                            >
                              {row.name}
                            </button>
                            <div className="text-xs text-gray-400">{row.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-600 font-medium">
                            {row.employer}
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