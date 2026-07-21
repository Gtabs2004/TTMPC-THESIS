import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import AuditLogViewer from "../../components/AuditLogViewer";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarCheck,
  CalendarDays,
  Archive,
  FileText,
  AlertTriangle,
  History,
} from "lucide-react";
import NotificationBell from "./NotificationBell";

const Audit_Log = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const menuItems = [
    { section: "BOD", items: [
      { name: "Dashboard", icon: LayoutDashboard },
      { name: "Member Approvals", icon: Users },
      { name: "Loan Approvals", icon: CreditCard },
      { name: "Loan Ledger", icon: CreditCard },
      { name: "Manage Member", icon: Users },
      { name: "Audit Log", icon: History },
      { name: "Loan Policies", icon: FileText },
    ]},
    { section: "SECRETARY", items: [
      { name: "Training Attendance", icon: CalendarCheck },
      { name: "Membership Records", icon: Archive },
    ]},
  ];

  const routeMap = {
    "Dashboard": "/BOD-dashboard",
    "Member Approvals": "/member-approvals",
    "Loan Approvals": "/bod-loan-approvals",
    "Loan Ledger": "/bod-manage-loans",
    "Manage Member": "/bod-manage-member",
    "Audit Log": "/bod-audit-log",
    "Loan Policies": "/bod-loan-policies",
    "Training Attendance": "/Secretary_Attendance",
    "Membership Records": "/Secretary_Records",
  };

  const handleSignOut = async (e) => {
    e.preventDefault();
    try { await signOut(); navigate("/"); } catch (err) { console.error(err); }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="BOD Portal" fallbackRole="BOD" />
          </div>
        </div>
        <hr className="w-full border-gray-200 mb-6" />
        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((section) => (
            <div key={section.section} className="mb-4 flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">{section.section}</p>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink key={item.name} to={routeMap[item.name]} className={({ isActive }) => `flex items-center gap-3 p-2 rounded-md transition-colors ${isActive ? "bg-green-50 text-green-700 font-semibold" : "text-gray-700 hover:bg-green-50 hover:text-green-700"}`}>
                    <Icon size={20} /><span>{item.name}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <button onClick={handleSignOut} className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors">Sign out</button>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <NotificationBell />
          <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
            <img src="/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200" />
            <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="BOD" />
          </div>
        </header>

        <main className="p-8">
          <AuditLogViewer
            showActorRoleFilter
            onError={(msg) => addNotification(msg, "error")}
          />
        </main>
      </div>
    </div>
  );
};

export default Audit_Log;
