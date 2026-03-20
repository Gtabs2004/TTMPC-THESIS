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
  Bell
} from 'lucide-react';


const M_Dashboard = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  
const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Loan Approval", icon: Users },
  { name: "Manage Member", icon: Users },
    
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
              Manager Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        
        <nav className="flex flex-col gap-2 text-sm flex-grow">
  {(() => {
    const routeMap = {
      "Dashboard": "/manager-dashboard",
      "Loan Approval": "/loan-approval",
      "Manage Member": "/manager-manage-member",
      
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

        {/* Page Content */}
        <main className="p-8">
          <h1 className="font-bold text-2xl">Dashboard</h1>

          <div className="flex flex-row gap-4 mt-8">
            <div className="flex-1 bg-white p-4 rounded-lg shadow w-12 h-34">
                <div className="mt-8">
                <span className="float-end bg-[#EA580C] bg-opacity-10 text-[#EA580C] rounded-lg px-2 py-1 text-xs font-semibold mb-10">Action Required</span>
                <h3 className="text-slate-400 text-[12px] font-semibold">Pending Approvals</h3>
                <p className="font-extrabold text-slate-800 mt-0.5">12</p>
                <p className="text-[10px] font-semibold"><span className="text-[#1C5F20]">+5%</span> from last week</p>
                </div>  
             </div>
             <div className="flex-1 bg-white p-4 rounded-lg shadow w-12 h-34">
                <div className="mt-8">
                <h3 className="text-slate-400 text-[12px] font-semibold">Approved Loans</h3>
                <p className="font-extrabold text-slate-800 mt-0.5">30</p>
                <p className="text-[10px] font-semibold"><span className="text-[#1C5F20]">-2%</span> from last month</p>
                </div>
            </div>
             <div className="flex-1 bg-white p-4 rounded-lg shadow w-12 h-34">
                <div className="mt-8">
                <h3 className="text-slate-400 text-[12px] font-semibold">Total Active Loans</h3>
                <p className="font-extrabold text-slate-800 mt-0.5">150</p>
                <p className="text-[10px] font-semibold"><span className="text-[#1C5F20]">+12%</span> year to date</p>
                </div>
            </div>
             <div className="flex-1 bg-white p-4 rounded-lg shadow w-12 h-34">
                <div className="mt-8">
                <h3 className="text-slate-400 text-[12px] font-semibold">Deliquent Rate</h3>
                <p className="font-extrabold text-slate-800 mt-0.5">2.4%</p>
                <p className="text-[10px] font-semibold"><span className="text-[#1C5F20]">-0.5%</span> improvemnet</p>
                </div>
            </div>
         </div>
        </main>
      </div>
    </div>
  );
};

export default M_Dashboard;