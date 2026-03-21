import React from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
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
  UserPlus,
  ClipboardList

} from 'lucide-react';


const LoanApplication = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  
const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Records", icon: Users },
    { name: "Loan Application", icon: FileText },
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

     
      <div className="flex-1 flex flex-col ">
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
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
        </header>

        
        <main className="p-8">
          <h1 className="font-bold text-2xl">Loan-Application</h1>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 mt-4">
                    <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
                      <div className="w-12 h-12 rounded-lg bg-[#EAF5EC] flex items-center justify-center flex-shrink-0">
                        <UserPlus className="text-[#2C7A3F] w-6 h-6" />
                      </div>
                      <div className="flex flex-col">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Kiosk Today</h3>
                        <p className="text-2xl font-extrabold text-slate-800 mt-0.5">24</p>
                      </div>
                    </div>
        
                    <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
                      <div className="w-12 h-12 rounded-lg bg-[#FFF4E5] flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="text-[#D97706] w-6 h-6" />
                      </div>
                      <div className="flex flex-col">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pending Review</h3>
                        <p className="text-2xl font-extrabold text-slate-800 mt-0.5">8</p>
                      </div>
                     </div> 
                       <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
                      <div className="w-12 h-12 rounded-lg bg-[#FFF4E5] flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="text-[#D97706] w-6 h-6" />
                      </div>
                      <div className="flex flex-col">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Approved</h3>
                        <p className="text-2xl font-extrabold text-slate-800 mt-0.5">12</p>
                      </div>
                     </div> 
                       <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
                      <div className="w-12 h-12 rounded-lg bg-[#FFF4E5] flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="text-[#D97706] w-6 h-6" />
                      </div>
                      <div className="flex flex-col">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AVG. PROCESSING</h3>
                        <p className="text-2xl font-extrabold text-slate-800 mt-0.5">1.4h</p>
                      </div>
                     </div> 
                  </div>

        
          <div className="bg-white w-full rounded-2xl m-auto mt-6 p-8 shadow-sm border border-gray-100 min-h-fit">
            <h2 className="text-lg font-bold text-gray-800 mb-6">All Applications</h2>
            <table className="w-full text-left border-collapse text-sm mb-24">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500">
                        <th className="pb-4 font-medium">Application ID</th>
                        <th className="pb-4 font-medium">Member Name</th>
                        <th className="pb-4 font-medium">Loan Type</th>
                        <th className="pb-4 font-medium">Amount</th>
                        <th className="pb-4 font-medium">Term</th>
                        <th className="pb-4 font-medium"> MIGS Status</th>
                        <th className="pb-4 font-medium">Submission</th>
                        <th className="pb-4 font-medium">Status</th>
                      </tr>
                  </thead>
                  <tbody>
                    {[
                     { ID: "TTMPCL-001-123", name: "Gero Antoni Tabiolo", type: "Bonus Loan", amount: "â‚±50,000", term: "12 Months", status: "MIGS", purpose: "Home Improvement" },
                     { ID: "TTMPCL-002-123", name: "Erden Jhed Teope", type: "Emergency Loan", amount: "â‚±25,000", term: "12 Months", status: "Non-MIGS", purpose: "Medical Emergency" },
                     { ID: "TTMPCL-003-123", name: "Ashley Nicole Bulotaolo", type: "Consolidated Loan", amount: "â‚±120,000", term: "24 Months", status: "Approved", purpose: "Debt Consolidation" },
                     { ID: "TTMPCL-004-123", name: "Romelyn Delos Reyes", type: "Bonus Loan", amount: "â‚±20,000", term: "6 Months", status: "Approved", purpose: "Education" },
                     { ID: "TTMPCL-005-123", name: "Nash Ervine Siaton", type: "Bonus Loan", amount: "â‚±30,000", term: "12 Months", status: "Pending", purpose: "Business Capital" }  
                    ].map((loan, index) => (
                        <tr key={loan.ID} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-4 font-semibold text-gray-800">{loan.ID}</td>
                          <td className="py-4 text-gray-800 font-medium">{loan.name}</td>
                          <td className="py-4 text-gray-600">{loan.type}</td>
                          <td className="py-4 text-gray-800 font-medium">{loan.amount}</td>
                          <td className="py-4 text-gray-600">{loan.date}</td>
                          <td className="py-4 text-gray-600">{loan.status}</td>
                          <td className="py-4 text-gray-600">{loan.purpose}</td>
                        </tr>
                      ))}
                    </tbody>
              </table>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LoanApplication;



