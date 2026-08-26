import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { UserAuth } from "../../contex/AuthContext";
import { usePortalRole } from "../../utils/usePortalRole";
import { PortalSidebarIdentity } from "../PortalIdentity";

const navLinkClass = ({ isActive }) =>
  `flex items-center gap-3 p-2 rounded-md transition-colors ${
    isActive
      ? "bg-green-50 text-green-700 font-semibold"
      : "text-gray-700 hover:bg-green-50 hover:text-green-700"
  }`;

const subNavLinkClass = ({ isActive }) =>
  `block pl-11 pr-4 py-2 rounded-md transition-colors text-[13px] ${
    isActive
      ? "text-green-700 font-semibold"
      : "text-gray-500 hover:text-green-700 hover:bg-green-50"
  }`;

/**
 * Single-source-of-truth sidebar for all staff portals (BOD, Bookkeeper,
 * Cashier, Manager, Secretary, Treasurer). Every staff page renders
 * `<StaffSidebar />` instead of hand-rolling its own <aside> block. Menu
 * contents come from a per-portal config file under ./configs/.
 *
 * (Member portal keeps its own sidebar — it has dark-mode and mobile-drawer
 * behavior the staff portals don't need.)
 *
 * Props:
 *   portal — display label ("BOD" / "Bookkeeper" / "Cashier" / "Manager" /
 *            "Secretary" / "Treasurer"). Drives the sidebar header fallback
 *            text.
 *   items  — flat array of nav entries for the common case. Each entry is
 *            either a plain link `{ name, icon, path }` or a collapsible
 *            group `{ name, icon, isDropdown: true, subItems: [{ name, path }] }`.
 *   sections — alternative to `items`, for pages that need to show more than
 *            one role's menu at once (e.g. a BOD page that also lists
 *            Secretary links). Shape: `[{ section, items }]`. Items outside
 *            the signed-in user's portal role render disabled/greyed out
 *            instead of linking. Only pass one of `items` / `sections`.
 */
export default function StaffSidebar({ portal, items, sections }) {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const portalRole = usePortalRole();
  const [openDropdowns, setOpenDropdowns] = useState({});

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const toggleDropdown = (name) =>
    setOpenDropdowns((prev) => ({ ...prev, [name]: !prev[name] }));

  const renderItem = (item) => {
    const Icon = item.icon;

    if (item.isDropdown) {
      const isOpen = !!openDropdowns[item.name];
      return (
        <div key={item.name} className="flex flex-col">
          <button
            type="button"
            onClick={() => toggleDropdown(item.name)}
            className="flex items-center justify-between p-2 rounded-md text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors w-full"
          >
            <div className="flex items-center gap-3">
              <Icon size={20} />
              <span>{item.name}</span>
            </div>
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {isOpen && (
            <div className="flex flex-col mt-1 space-y-1">
              {item.subItems.map((subItem) => (
                <NavLink key={subItem.name} to={subItem.path} className={subNavLinkClass}>
                  {subItem.name}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <NavLink key={item.name} to={item.path} className={navLinkClass}>
        <Icon size={20} />
        <span>{item.name}</span>
      </NavLink>
    );
  };

  return (
    <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0">
      <div className="flex flex-row items-start gap-2 mb-6">
        <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
        <div className="flex flex-col">
          <h1 className="text-xl font-bold text-primary">TTMPC</h1>
          <PortalSidebarIdentity
            className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold"
            fallbackPortal={`${portal} Portal`}
            fallbackRole={portal}
          />
        </div>
      </div>

      <hr className="w-full border-gray-200 mb-6" />

      <nav className="flex flex-col gap-2 text-sm flex-grow">
        {sections
          ? sections.map((group) => (
              <div key={group.section} className="mb-4 flex flex-col gap-2">
                <p className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">
                  {group.section}
                </p>
                {group.items.map((item) => {
                  const isAccessible = !portalRole || group.section.toLowerCase() === portalRole;
                  if (!isAccessible) {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.name}
                        title={`Only ${group.section} accounts can access this`}
                        className="flex items-center gap-3 p-2 rounded-md text-gray-400 cursor-not-allowed select-none opacity-60"
                      >
                        <Icon size={20} />
                        <span>{item.name}</span>
                      </div>
                    );
                  }
                  return renderItem(item);
                })}
              </div>
            ))
          : items.map((item) => renderItem(item))}
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
