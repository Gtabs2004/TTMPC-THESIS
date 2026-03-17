import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { 
  LayoutDashboard, 
  Users, 
  CalendarCheck,
  Search,
  Bell,
  UserPlus,
  ClipboardList,
  BadgeCheck,
  Download
} from 'lucide-react';
import logo from "../../assets/img/ttmpc logo.png";

const Secretary_Attendance = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  
  // --- STATE ---
  const [activeTab, setActiveTab] = useState("1st Training");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [editedRemark, setEditedRemark] = useState("");

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

  // --- MOCK DATA (Now in State so we can update remarks) ---
  const [tableData, setTableData] = useState({
    "Pending": [
      { id: 1, name: "Mark Wilson", email: "mark.w@gmail.com", schedule: "Mar. 21, 2026 - 9:00 AM", status: "Pending", remarks: "Awaiting schedule confirmation" },
      { id: 2, name: "Lisa Wong", email: "lisa.wong@gmail.com", schedule: "Mar. 21, 2026 - 9:00 AM", status: "Pending", remarks: "Needs documentation" },
    ],
    "1st Training": [
      // 3rd Saturday of March 2026 is March 21
      { id: 3, name: "Carlo Mendoza", email: "carlo.mendoza@gmail.com", schedule: "Mar. 21, 2026 - 9:00 AM", status: "Present", remarks: "Attended and completed the training" },
      { id: 4, name: "Angela Reyes", email: "angela.reyes@gmail.com", schedule: "Mar. 21, 2026 - 9:00 AM", status: "Absent", remarks: "Absent without prior notice" },
      { id: 5, name: "Jessa Mae Gonzales", email: "jm.gonzales@gmail.com", schedule: "Mar. 21, 2026 - 9:00 AM", status: "Present", remarks: "Attended but left early" },
      { id: 6, name: "Nicole Anne Bautista", email: "nicole.bautista@gmail.com", schedule: "Mar. 21, 2026 - 9:00 AM", status: "Present", remarks: "Attended and completed the training" },
      { id: 7, name: "Kevin Navarro", email: "kevin.navarro@gmail.com", schedule: "Mar. 21, 2026 - 9:00 AM", status: "Absent", remarks: "Absent with prior notice" },
      { id: 8, name: "Jasmine Flores", email: "jasmine.flores@gmail.com", schedule: "Mar. 21, 2026 - 9:00 AM", status: "Present", remarks: "Attended and completed the training" },
      { id: 9, name: "Bea Castro", email: "bea.castro@gmail.com", schedule: "Mar. 21, 2026 - 9:00 AM", status: "Absent", remarks: "Will attend the next scheduled training" },
      { id: 10, name: "Dave Herrera", email: "dave.herrera@gmail.com", schedule: "Mar. 21, 2026 - 9:00 AM", status: "Present", remarks: "Attended and completed the training" },
    ],
    "2nd Training": [
      // 3rd Saturday of September 2026 is September 19
      { id: 11, name: "Sarah Connor", email: "sarah.c@gmail.com", schedule: "Sep. 19, 2026 - 9:00 AM", status: "Present", remarks: "Attended and completed the training" },
      { id: 12, name: "John Smith", email: "john.s@gmail.com", schedule: "Sep. 19, 2026 - 9:00 AM", status: "Present", remarks: "Excellent participation" },
    ],
    "Rejected": [
      { id: 13, name: "Tom Hardy", email: "tom.h@gmail.com", schedule: "Mar. 21, 2026 - 9:00 AM", status: "Absent", remarks: "Failed to attend 3 times" },
    ]
  });

  const tabs = [
    { name: "Pending", count: tableData["Pending"].length, color: "bg-green-600" },
    { name: "1st Training", count: tableData["1st Training"].length, color: "bg-blue-500" },
    { name: "2nd Training", count: tableData["2nd Training"].length, color: "bg-yellow-400 text-black" },
    { name: "Rejected", count: tableData["Rejected"].length, color: "bg-red-500" }
  ];

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

  const saveRemark = () => {
    // Update the remark in our state
    setTableData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(member => 
        member.id === selectedMember.id ? { ...member, remarks: editedRemark } : member
      )
    }));
    closeModal();
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
            {/* Tabs */}
            <div className="flex gap-8 px-6 pt-4 border-b border-gray-200">
              {tabs.map((tab) => (
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
                          defaultValue={row.status}
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
                  className="px-6 py-2 bg-[#1B5E20] hover:bg-green-800 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  Save
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