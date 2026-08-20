import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
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
  Briefcase,
  Wallet,
  Coins,
  PiggyBank,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Brain,
} from "lucide-react";


const Accounting = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [isSavingsOpen, setIsSavingsOpen] = useState(false);

const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Manage Member", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: Briefcase },

      { name: "Credit Risk", icon: Brain },
    { name: "Payments", icon: Wallet },
    {
      name: "Savings Accounts",
      icon: PiggyBank,
      isDropdown: true,
      subItems: [
        { name: "All Accounts", path: "/bookkeeper-savings-accounts" },
        { name: "Savings Withdrawals", path: "/bookkeeper-savings-transactions" },
      ],
    },
    { name: "Accounting", icon: Calculator },
    { name: "MIGS Scoring", icon: Activity },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Trail", icon: History },
    { name: "Grocery", icon: Coins },
    
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
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="texriutet-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Bookkeeper Portal" fallbackRole="Bookkeeper" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        
        <nav className="flex flex-col gap-2 text-sm flex-grow">
  {(() => {
    const routeMap = {
    Dashboard: "/dashboard",
    "Manage Member": "/manage-member",
    "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans": "/manage-loans",
    Delinquency: "/delinquency",
    "Credit Risk": "/bookkeeper-credit-risk",
    Payments: "/payments",
    "Savings Withdrawals": "/bookkeeper-savings-transactions",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
    Grocery: "/grocery",
    "Legacy Member Validation": "/legacy-member-validation",
  };

    return menuItems.map((item) => {
      const Icon = item.icon;
      if (item.isDropdown) {
        return (
          <div key={item.name} className="flex flex-col">
            <button
              onClick={() => setIsSavingsOpen(!isSavingsOpen)}
              className="flex items-center justify-between p-2 rounded-md text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors w-full"
            >
              <div className="flex items-center gap-3">
                <Icon size={20} />
                <span>{item.name}</span>
              </div>
              {isSavingsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {isSavingsOpen && (
              <div className="flex flex-col mt-1 space-y-1">
                {item.subItems.map((subItem) => (
                  <NavLink
                    key={subItem.name}
                    to={subItem.path}
                    className={({ isActive }) =>
                      `block pl-11 pr-4 py-2 rounded-md transition-colors text-[13px] ${
                        isActive
                          ? 'text-green-700 font-semibold'
                          : 'text-gray-500 hover:text-green-700 hover:bg-green-50'
                      }`
                    }
                  >
                    {subItem.name}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      }
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
          <LoanNotificationBell role="bookkeeper" />
          <img src="/img/bookkeeper-profile.png" alt="Bookkeeper Profile" className="ml-4 w-8 h-8 rounded-full"></img>
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
        </header>

        {/* Page Content */}
        <main className="p-8">
          <h1 className="font-bold text-2xl">Accounting</h1>
        </main>
      </div>
    </div>
  );
};

export default Accounting;




