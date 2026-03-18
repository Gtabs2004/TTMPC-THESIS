import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  CreditCard, 
  Calculator, 
  Activity, 
  BarChart3, 
  History,
  Search,
  Bell,
  CalendarCheck,
  Eye,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Download,
  Archive 
} from 'lucide-react';
import logo from "../../assets/img/ttmpc logo.png";

const Secretary_Records = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  
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
        { name: "Membership Records", icon: Archive  }
      ]
    }
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

  return (
    <div className="flex min-h-screen bg-gray-100">
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
              "Member Approvals": "/Member-Approvals",
              "Training Attendance": "/Secretary_Attendance",
              "Membership Records": "/Secretary_Records"
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
    
          <div className="bg-white w-full rounded-2xl m-auto mt-6 p-8 shadow-sm border border-gray-100 min-h-fit">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-800">All Applicants</h2>
              <div className="flex items-center gap-3">
                  <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                      <Download className="w-4 h-4" />
                      Export List
                  </button>
                  
              </div>
            </div>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="pb-4 font-medium">Applicant  ID</th>
                  <th className="pb-4 font-medium">Applicant Name </th>
                  <th className="pb-4 font-medium">Date Joined</th>
                  <th className="pb-4 font-medium">Shares</th>
                  <th className="pb-4 font-medium">Paid Up Capital</th>
                  <th className="pb-4 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { id: "TTMPCAP-001", name: "Gero Antoni Tabiolo", dateJoined: "2023-01-15", shares: "₱0", loans: "₱500" },
                  { id: "TTMPCAP-002", name: "Erden Jhed Teope", dateJoined: "2023-02-20", shares: "₱0", loans: "₱500" },
                  { id: "TTMPCAP-003", name: "Ashley Nicole Bulotaolo", dateJoined: "2023-03-10", shares: "₱0", loans: "₱500" },
                  { id: "TTMPCAP-004", name: "Romelyn Delos Reyes", dateJoined: "2023-04-05", shares: "₱0", loans: "₱500" },
                  { id: "TTMPCAP-005", name: "Nash Ervine Siaton", dateJoined: "2023-05-12", shares: "₱0", loans: "₱500" },
                ].map((member, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 font-semibold text-[#1a4a2f]">{member.id}</td>
                    <td className="py-4 text-gray-800 font-medium">{member.name}</td>
                    <td className="py-4 text-gray-800 font-medium">{member.dateJoined}</td>
                    <td className="py-4 text-gray-800 font-medium">{member.shares}</td>
                    <td className="py-4 text-gray-800 font-medium">{member.loans}</td>
                    <td className="py-4">
                      <button 
                        onClick={() => navigate('/')}
                        className="text-[#1e9e4a] hover:text-green-800 transition-colors p-1"
                      >
                        <Eye size={20} strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-center items-center mt-8 gap-3">
            
            <button className="w-10 h-10 flex items-center justify-center rounded-full border 
            border-gray-400 text-gray-500 hover:bg-gray-100 transition-colors cursor-not-allowed" disabled>
              <ChevronLeft size={20} />
            </button>
          
            {[1, 2, 3, 4, 5].map((page) => (
              <button 
                key={page} 
                className="w-10 h-10 flex items-center justify-center rounded-full border border-gray-400 
                text-gray-500 font-medium hover:bg-gray-100 transition-colors cursor-pointer"
              >
                {page}
              </button>
            ))}
          
          
            <button className="w-10 h-10 flex items-center justify-center rounded-full border border-gray-400 text-gray-500
             hover:bg-gray-100 transition-colors cursor-pointer">
              <ChevronRight size={20} />
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Secretary_Records;