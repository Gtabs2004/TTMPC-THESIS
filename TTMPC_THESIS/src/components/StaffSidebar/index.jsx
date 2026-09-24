import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { UserAuth } from "../../contex/AuthContext";
import { usePortalRole } from "../../utils/usePortalRole";
import { PortalSidebarIdentity } from "../PortalIdentity";
import { useStaffLayout } from "../../contex/StaffLayoutContext";

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
  const { sidebarOpen, setSidebarOpen } = useStaffLayout();

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/Login", { replace: true });
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
                <NavLink
                  key={subItem.name}
                  to={subItem.path}
                  className={subNavLinkClass}
                  onClick={() => setSidebarOpen(false)}
                >
                  {subItem.name}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <NavLink key={item.name} to={item.path} className={navLinkClass} onClick={() => setSidebarOpen(false)}>
        <Icon size={20} />
        <span>{item.name}</span>
      </NavLink>
    );
  };

  return (
    <>
      {/* Backdrop — mobile/tablet only, dismisses the drawer on tap. The
          sidebar itself is lg:static (normal, always-visible flex child) at
          the lg breakpoint and up, so neither of these render/matter there. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0 fixed inset-y-0 left-0 z-40 overflow-y-auto transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:transition-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-row items-start justify-between gap-2 mb-6">
          <div className="flex flex-row items-start gap-2">
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
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="lg:hidden p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
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
    </>
  );
}
