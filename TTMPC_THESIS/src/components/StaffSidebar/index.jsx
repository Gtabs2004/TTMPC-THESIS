import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity } from "../PortalIdentity";

/**
 * Single-source-of-truth sidebar for all staff portals (Bookkeeper, BOD,
 * Manager, Treasurer). Every staff page renders `<StaffSidebar />` instead of
 * hand-rolling its own <aside> block. Menu contents come from a per-portal
 * config file under ./configs/.
 *
 * Props:
 *   portal — display label ("Bookkeeper" / "BOD" / "Manager" / "Treasurer").
 *            Drives the sidebar header fallback text.
 *   items  — array of { name, icon, path } (see ./configs/*). Each item's
 *            `path` is used directly — no routeMap lookup, no fallback
 *            string-mangling. Adding a menu item = one line in the config.
 */
export default function StaffSidebar({ portal, items }) {
  const { signOut } = UserAuth();
  const navigate = useNavigate();

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
    <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0">
      <div className="flex flex-row items-start gap-2 mb-6">
        <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
        <div className="flex flex-col">
          <h1 className="text-xl font-bold text-primary-deep">TTMPC</h1>
          <PortalSidebarIdentity
            className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold"
            fallbackPortal={`${portal} Portal`}
            fallbackRole={portal}
          />
        </div>
      </div>

      <hr className="w-full border-gray-200 mb-6" />

      <nav className="flex flex-col gap-2 text-sm flex-grow">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 p-2 rounded-md transition-colors ${
                  isActive
                    ? "bg-green-50 text-green-700 font-semibold"
                    : "text-gray-700 hover:bg-green-50 hover:text-green-700"
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
        className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
      >
        Sign out
      </button>
    </aside>
  );
}
