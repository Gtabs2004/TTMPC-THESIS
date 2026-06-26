import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import AuditLogViewer from "../../components/AuditLogViewer";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  History,
  ClipboardCheck
} from "lucide-react";

const Manager_Audit_Log = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Loan Approval", icon: ClipboardCheck },
    { name: "Manage Member", icon: Users },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Log", icon: History },
  ];

  const routeMap = {
    "Dashboard": "/manager-dashboard",
    "Loan Approval": "/loan-approval",
    "Manage Member": "/manager-manage-member",
    "Reports": "/manager-reports",
    "Audit Log": "/manager-audit-log",
  };

  const handleSignOut = async (e) => {
    e.preventDefault();
    try { await signOut(); navigate("/"); } catch (err) { console.error(err); }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Manager Portal" fallbackRole="Manager" />
          </div>
        </div>
        <hr className="w-full border-gray-200 mb-6" />
        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.name} to={routeMap[item.name]}
                className={({ isActive }) => `flex items-center gap-3 p-2 rounded-md transition-colors ${isActive ? "bg-green-50 text-green-700 font-semibold" : "text-gray-700 hover:bg-green-50 hover:text-green-700"}`}>
                <Icon size={20} /><span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>
        <button onClick={handleSignOut} className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors">Sign out</button>
      </aside>

      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <LoanNotificationBell role="manager" />
          <img src="/img/bookkeeper-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Manager" />
        </header>

        <main className="p-8">
          <AuditLogViewer showActorRoleFilter={false} onError={(msg) => addNotification(msg, "error")} />
        </main>
      </div>
    </div>
  );
};

export default Manager_Audit_Log;
