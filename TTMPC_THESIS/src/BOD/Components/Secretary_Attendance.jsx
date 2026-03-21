import React, { useEffect, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { supabase } from "../../supabaseClient";
import { 
  LayoutDashboard, 
  Users, 
  CalendarCheck,
  Search,
  Bell,
  UserPlus,
  ClipboardList,
  BadgeCheck,
  Download,
  Archive
} from 'lucide-react';
import logo from "../../assets/img/ttmpc logo.png";



const Secretary_Attendance = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  
  // --- STATE ---
  const [activeTab, setActiveTab] = useState("1st Training");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [editedRemark, setEditedRemark] = useState("");
  const [tableData, setTableData] = useState({
    Pending: [],
    "1st Training": [],
    Rejected: [],
  });
  const [portalRole, setPortalRole] = useState("");
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [pageError, setPageError] = useState("");

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

  const normalizeStatus = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "pending") return "Pending";
    if (["1st training", "first training", "training 1"].includes(normalized)) return "1st Training";
    if (["2nd training", "second training", "training 2"].includes(normalized)) return "1st Training";
    if (normalized === "rejected") return "Rejected";
    return "Pending";
  };

  const formatDisplayDate = (value) => {
    if (!value) return "Not scheduled";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not scheduled";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
    if (Number.isNaN(date.getTime())) return getRuleSchedule(new Date().toISOString());
    const year = date.getFullYear();
    const month = date.getMonth();
    if (month === 2) return getThirdSaturday(year, 8);
    if (month === 8) return getThirdSaturday(year + 1, 2);
    return getRuleSchedule(date.toISOString());
  };

  const resolvePortalRole = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return "";

    for (const table of ["member_account", "member_accounts"]) {
      const byUserId = await supabase.from(table).select("role").eq("user_id", user.id).limit(1).maybeSingle();
      if (!byUserId.error && byUserId.data?.role) return String(byUserId.data.role).trim().toLowerCase();

      const byEmail = user.email
        ? await supabase.from(table).select("role").ilike("email", user.email).limit(1).maybeSingle()
        : { data: null, error: null };
      if (!byEmail.error && byEmail.data?.role) return String(byEmail.data.role).trim().toLowerCase();
    }

    return "";
  };

  const fetchAttendanceRows = async () => {
    setPageError("");
    const { data, error } = await supabase
      .from("member_applications")
      .select("application_id, first_name, middle_name, surname, email, created_at, application_status, attendance_status, remarks")
      .order("created_at", { ascending: false });

    if (error) {
      setPageError(error.message || "Unable to load attendance records.");
      return;
    }

    const grouped = {
      Pending: [],
      "1st Training": [],
      Rejected: [],
    };

    for (const row of data || []) {
      const status = normalizeStatus(row.application_status);
      if (!grouped[status]) continue;

      const fullName = [row.first_name, row.middle_name, row.surname]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
        .join(" ") || "Unnamed Applicant";

      const firstTrainingSchedule = getRuleSchedule(row.created_at || new Date().toISOString());
      const scheduleDate = firstTrainingSchedule;

      grouped[status].push({
        id: row.application_id,
        applicationId: row.application_id,
        name: fullName,
        email: row.email || "-",
        schedule: `${formatDisplayDate(scheduleDate.toISOString())} - 9:00 AM`,
        status: row.attendance_status || "Pending",
        remarks: row.remarks || "",
      });
    }

    setTableData(grouped);
  };

  const persistAttendanceToApplication = async (member) => {
    const payload = {
      attendance_status: member.status,
      remarks: member.remarks ?? editedRemark,
    };

    const { error } = await supabase
      .from("member_applications")
      .update(payload)
      .eq("application_id", member.applicationId || member.id);

    if (error) {
      throw new Error(error.message || "Unable to save attendance in member_applications.");
    }
  };

  const upsertAttendanceLog = async (member, currentTab) => {
    const { data: authData } = await supabase.auth.getUser();
    const payload = {
      application_id: member.applicationId || member.id,
      member_name: member.name,
      member_email: member.email,
      training_stage: currentTab,
      attendance_status: member.status,
      remarks: editedRemark,
      recorded_at: new Date().toISOString(),
      recorded_by: authData?.user?.id || null,
    };

    const tableCandidates = ["attendance_logs", "ATTENDANCE_LOGS"];
    for (const tableName of tableCandidates) {
      const upsertTry = await supabase.from(tableName).upsert(payload, { onConflict: "application_id,training_stage" });
      if (!upsertTry.error) return { ok: true };

      const insertTry = await supabase.from(tableName).insert(payload);
      if (!insertTry.error) return { ok: true };
    }

    return {
      ok: false,
      warning: "Saved to member_applications, but attendance_logs insert failed. Run src/server/attendance_logs_schema.sql in Supabase.",
    };
  };

  useEffect(() => {
    const init = async () => {
      const role = await resolvePortalRole();
      setPortalRole(role);
      await fetchAttendanceRows();
    };
    init();
  }, []);

  // naku ervine
  

  const tabs = [
    { name: "Pending", count: tableData["Pending"].length, color: "bg-green-600" },
    { name: "1st Training", count: tableData["1st Training"].length, color: "bg-blue-500" },
    { name: "Rejected", count: tableData["Rejected"].length, color: "bg-red-500" }
  ];
  const isSecretary = portalRole === "secretary";
  const visibleTabs = isSecretary ? ["Pending", "1st Training"] : tabs.map((tab) => tab.name);

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  // --- MODAL HANDLERS ---
  const openModal = (member) => {
    setSelectedMember(member);
    setEditedRemark(member.remarks);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedMember(null);
    setEditedRemark("");
  };

  const saveRemark = async () => {
    if (!selectedMember) return;
    setSavingAttendance(true);
    // Update the remark in our state
    setTableData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(member => 
        member.id === selectedMember.id ? { ...member, remarks: editedRemark } : member
      )
    }));

    try {
      const updatedMember = { ...selectedMember, remarks: editedRemark };
      await persistAttendanceToApplication(updatedMember);
      const logResult = await upsertAttendanceLog(updatedMember, activeTab);
      if (!logResult.ok) {
        setPageError(logResult.warning);
      }
      closeModal();
    } catch (err) {
      setPageError(err.message || "Unable to save attendance log.");
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleAttendanceStatusChange = async (member, nextStatus) => {
    setSavingAttendance(true);
    const updatedMember = { ...member, status: nextStatus };

    setTableData((prev) => ({
      ...prev,
      [activeTab]: prev[activeTab].map((row) =>
        row.id === member.id ? { ...row, status: nextStatus } : row
      ),
    }));

    try {
      await persistAttendanceToApplication(updatedMember);
      const logResult = await upsertAttendanceLog(updatedMember, activeTab);
      if (!logResult.ok) {
        setPageError(logResult.warning);
      }
    } catch (err) {
      setPageError(err.message || "Unable to save attendance status.");
    } finally {
      setSavingAttendance(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Secretary Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
            const routeMap = {
              "Dashboard": "/BOD-dashboard",
              "Member Approvals": "/member-approvals",
              "Manage Member": "/bod-manage-member",
              "Training Attendance": "/Secretary_Attendance",
              "Membership Records": "/Secretary_Records",
            };

            return menuItems.map((sectionGroup) => (
              <div key={sectionGroup.section} className="mb-4 flex flex-col gap-2">
                <p className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">
                  {sectionGroup.section}
                </p>
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
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 z-10">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input type="text" className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="src/assets/img/bookkeeper-profile.png" alt="Bookkeeper Profile" className="ml-4 w-8 h-8 rounded-full" />
          <p className="ml-2 font-medium text-gray-700">Secretary</p>
        </header>

        <main className="p-8 overflow-auto">
          {/* Top Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#EAF5EC] flex items-center justify-center flex-shrink-0">
                <UserPlus className="text-[#2C7A3F] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TOTAL EVALUATED</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">8</p>
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#FFF4E5] flex items-center justify-center flex-shrink-0">
                <ClipboardList className="text-[#D97706] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PASSED 1ST TRAINING</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">6</p>
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#EAF5EC] flex items-center justify-center flex-shrink-0">
                <BadgeCheck className="text-[#2C7A3F] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PENDING EVAL</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">2</p>
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#EAF5EC] flex items-center justify-center flex-shrink-0">
                <BadgeCheck className="text-[#2C7A3F] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NO SHOW</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">2</p>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            {pageError ? (
              <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {pageError}
              </div>
            ) : null}

            {/* Tabs */}
            <div className="flex gap-8 px-6 pt-4 border-b border-gray-200">
              {tabs.filter((tab) => visibleTabs.includes(tab.name)).map((tab) => (
                <button
                  key={tab.name}
                  onClick={() => setActiveTab(tab.name)}
                  className={`flex items-center gap-2 pb-4 px-1 text-sm font-semibold transition-colors relative ${
                    activeTab === tab.name 
                      ? "text-green-600 border-b-2 border-green-600" 
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.name}
                  <span className={`px-2 py-0.5 rounded-full text-xs text-white ${tab.color}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Table Header */}
            <div className="p-6 flex justify-between items-center">
              <h2 className="text-xl font-bold text-[#2A2B4A]">
                {activeTab} Attendance & Evaluation
              </h2>
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                <Download size={16} />
                Export List
              </button>
            </div>

            {/* Table Body */}
            <div className="overflow-x-auto pb-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-y border-gray-200 bg-gray-50/50 text-xs uppercase tracking-wider text-[#2A2B4A] font-bold">
                    <th className="py-4 px-6">Member Name</th>
                    <th className="py-4 px-6">Training Schedule</th>
                    <th className="py-4 px-6">Attendance Status</th>
                    <th className="py-4 px-6">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tableData[activeTab]?.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <p className="font-bold text-[#2A2B4A] text-sm">{row.name}</p>
                        <p className="text-xs text-gray-500">{row.email}</p>
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-600 font-medium">
                        {row.schedule}
                      </td>
                      <td className="py-4 px-6">
                        {/* Note: I left this as a native select as before, but if you want this to ALSO be controlled by the modal, you can change it */}
                        <select 
                          className={`text-sm font-bold bg-transparent border border-gray-200 rounded-md py-1.5 px-3 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer
                            ${row.status === 'Present' ? 'text-green-600' : row.status === 'Absent' ? 'text-red-500' : 'text-gray-600'}
                          `}
                          value={row.status}
                          disabled={activeTab !== '1st Training'}
                          onChange={(e) => handleAttendanceStatusChange(row, e.target.value)}
                          style={{
                            backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%239CA3AF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "right 0.7rem top 50%",
                            backgroundSize: "0.65rem auto"
                          }}
                        >
                          <option value="Present" className="text-green-600">Present</option>
                          <option value="Absent" className="text-red-500">Absent</option>
                          <option value="Pending" className="text-gray-600">Pending</option>
                        </select>
                      </td>
                      <td className="py-4 px-6">
                         {/* Trigger button for Modal instead of select */}
                         <button 
                          onClick={() => openModal(row)}
                          className="w-full text-left text-sm font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-md py-2 px-3 hover:bg-gray-100 transition-colors truncate"
                        >
                          {row.remarks || "Add evaluation remarks..."}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!tableData[activeTab] || tableData[activeTab].length === 0) && (
                    <tr>
                      <td colSpan="4" className="py-8 text-center text-gray-500 font-medium">
                        No records found for this category.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* --- MODAL OVERLAY --- */}
      {isModalOpen && selectedMember && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-[500px] overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="bg-[#65B741] p-4">
              <h2 className="text-white font-bold text-lg">Training Evaluation Details</h2>
            </div>
            
            {/* Modal Body */}
            <div className="p-6">
              {/* Info Row */}
              <div className="flex justify-between mb-6">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Member Name</p>
                  <p className="font-bold text-gray-800">{selectedMember.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Training Date</p>
                  <p className="font-medium text-gray-800 text-sm">{selectedMember.schedule.split(' - ')[0]}</p>
                </div>
              </div>

              {/* Status Row */}
              <div className="mb-6">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Attendance Status</p>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold 
                  ${selectedMember.status === 'Present' ? 'bg-green-100 text-green-700' : 
                    selectedMember.status === 'Absent' ? 'bg-red-100 text-red-700' : 
                    'bg-gray-100 text-gray-700'}
                `}>
                  <div className={`w-1.5 h-1.5 rounded-full 
                    ${selectedMember.status === 'Present' ? 'bg-green-500' : 
                      selectedMember.status === 'Absent' ? 'bg-red-500' : 
                      'bg-gray-500'}
                  `}></div>
                  {selectedMember.status}
                </div>
              </div>

              {/* Editable Remarks */}
              <div className="mb-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Secretary Remarks</p>
                <textarea
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#65B741] min-h-[100px] resize-none"
                  placeholder="Enter evaluation remarks..."
                  value={editedRemark}
                  onChange={(e) => setEditedRemark(e.target.value)}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button 
                  onClick={closeModal} 
                  className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                <button 
                  onClick={saveRemark} 
                  disabled={savingAttendance}
                  className="px-6 py-2 bg-[#1B5E20] hover:bg-green-800 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {savingAttendance ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Secretary_Attendance;