import React from "react";
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
  ChevronLeft,
  ChevronRight,
  Eye
} from 'lucide-react';


const Records = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  
const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Records", icon: Users },
    { name: "Loan Application", icon: FileText },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: CreditCard },
    { name: "Payments", icon: CreditCard },
    { name: "Accounting", icon: Calculator },
    { name: "MIGS Scoring", icon: Activity },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Trail", icon: History },
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
              Bookkeeper Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        
        <nav className="flex flex-col gap-2 text-sm flex-grow">
  {(() => {
    const routeMap = {
      Dashboard: "/dashboard",
      "Member Records": "/records",
      "Loan Application": "/loan-application",
      "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans":"/manage-loans",
      Payments: "/payments",
      Accounting: "/accounting",
      MIGS: "/migs",
      Reports: "/reports",
      "Audit Trail": "/audit-trail",
    };

    return menuItems.map((item) => {
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
    });
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
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8">
          <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
          <input type="text" className=" bg-gray-50  w-52 h-10 rounded-lg border border-gray-300 px-4 
          py-1 focus:outline-none focus:ring-2 focus:ring-green-500"></input>
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
          <Bell className="w-5 h-5"/>
          <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="src/assets/img/bookkeeper-profile.png" alt="Bookkeeper Profile" className="ml-4 w-8 h-8 rounded-full"></img>
          <p>Bookkeeper</p>
        </header>

        <main className="p-8">
          <h1 className="font-bold text-2xl">Records</h1>
          <div className="bg-white w-full rounded-2xl m-auto mt-6 p-8 shadow-sm border border-gray-100 min-h-fit">
  
  <h2 className="text-lg font-bold text-gray-800 mb-6">All Members</h2>
  
  <table className="w-full text-left border-collapse text-sm mb-24">
    <thead>
      <tr className="border-b border-gray-200 text-gray-500">
        <th className="pb-4 font-medium">Member Name</th>
        <th className="pb-4 font-medium">Employer</th>
        <th className="pb-4 font-medium">Share Capital</th>
        <th className="pb-4 font-medium">MIGS Status</th>
        <th className="pb-4 font-medium">Active Loans</th>
        <th className="pb-4 font-medium">Actions</th>
      </tr>
    </thead>
    <tbody>
      {[
        { name: "Gero Antoni Tabiolo", employer: "DepEd", capital: "₱450,000", status: "MIGS", loans: 2 },
        { name: "Erden Jhed Teope", employer: "DepEd", capital: "₱320,000", status: "NON-MIGS", loans: 1 },
        { name: "Ashley Nicole Bulotaolo", employer: "DepEd", capital: "₱580,000", status: "MIGS", loans: 3 },
        { name: "Romelyn Delos Reyes", employer: "DepEd", capital: "₱280,000", status: "MIGS", loans: 2 },
        { name: "Nash Ervine Siaton", employer: "DepEd", capital: "₱676,767", status: "NON-MIGS", loans: 0 },
        
      ].map((member, index) => (
        <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
          <td className="py-4 font-semibold text-[#1a4a2f]">{member.name}</td>
          <td className="py-4 text-gray-800 font-medium">{member.employer}</td>
          <td className="py-4 text-gray-800 font-medium">{member.capital}</td>
          <td className="py-4">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${
              member.status === "MIGS" ? "bg-[#1e9e4a]" : "bg-[#a5abb3]"
            }`}>
              {member.status}
            </span>
          </td>
          <td className="py-4 text-gray-800 font-medium">{member.loans}</td>
          <td className="py-4">
            <button onClick={() => navigate('/member_details')}
            className="text-[#1e9e4a] hover:text-green-800 transition-colors p-1">
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

export default Records;