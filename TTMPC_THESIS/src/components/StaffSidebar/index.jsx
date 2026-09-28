import React, { useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, ChevronLeft, X, LogOut } from "lucide-react";
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

// Flyout/tooltip subitem link — same active styling as subNavLinkClass, just
// without the indent (the flyout isn't nested under anything visually).
const flyoutSubNavLinkClass = ({ isActive }) =>
  `block px-3 py-2 rounded-md transition-colors text-[13px] whitespace-nowrap ${
    isActive
      ? "text-green-700 font-semibold bg-green-50"
      : "text-gray-600 hover:text-green-700 hover:bg-green-50"
  }`;

/**
 * Single-source-of-truth sidebar for all staff portals (BOD, Bookkeeper,
 * Cashier, Manager, Secretary, Treasurer). Every staff page renders
 * `<StaffSidebar />` instead of hand-rolling its own <aside> block. Menu
 * contents come from a per-portal config file under ./configs/.
 *
 * Desktop (lg+) can be collapsed to an icons-only rail via the toggle button
 * on the sidebar edge; state lives in StaffLayoutContext so it's shared with
 * nothing else on the page (main content is a `flex-1` sibling, so it
 * reflows automatically as the sidebar's own width changes — no page-level
 * changes needed). Mobile keeps its existing full-width drawer/overlay
 * behavior regardless of the collapsed preference.
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
  const { sidebarOpen, setSidebarOpen, collapsed, setCollapsed, toggleCollapsed } =
    useStaffLayout();

  // Collapsed-rail hover flyout (module-name tooltip, or the subitem list for
  // a dropdown group). Portaled straight to document.body — see the render
  // below for why: the sidebar needs `overflow-y-auto` for long menus, and
  // per the CSS overflow spec, once one axis is non-`visible` the other is
  // forced to behave like `auto` too, so anything positioned to spill out of
  // the 80px collapsed rail (like this) would get silently clipped by the
  // sidebar's own scroll box no matter what overflow-x is set to. A portal
  // sidesteps that entirely by never being a descendant of it.
  const [flyout, setFlyout] = useState({
    visible: false,
    label: "",
    top: 0,
    left: 0,
    subItems: null,
  });

  const showFlyout = (e, label, subItems = null) => {
    if (!collapsed) return;
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) {
      return; // mobile/tablet drawer is always full-width — no flyout there
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setFlyout({
      visible: true,
      label,
      subItems,
      top: subItems ? rect.top : rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  };

  const hideFlyout = () => setFlyout((prev) => ({ ...prev, visible: false }));

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

  const handleDropdownClick = (name) => {
    if (collapsed) {
      // Collapsed rail can't usefully show an inline sublist at icon width —
      // expand the sidebar and open the group instead of toggling in place.
      setCollapsed(false);
      setOpenDropdowns((prev) => ({ ...prev, [name]: true }));
    } else {
      toggleDropdown(name);
    }
  };

  // Shared label wrapper: fades/slides out (rather than disappearing
  // instantly) when collapsed, and never collapses on mobile since the
  // drawer there always renders full-width.
  const renderLabel = (text) => (
    <span
      className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out ${
        collapsed ? "lg:max-w-0 lg:opacity-0" : "max-w-[11rem] opacity-100"
      }`}
    >
      {text}
    </span>
  );

  const renderItem = (item) => {
    const Icon = item.icon;

    if (item.isDropdown) {
      const isOpen = !!openDropdowns[item.name];
      return (
        <div key={item.name} className="flex flex-col">
          <button
            type="button"
            onClick={() => handleDropdownClick(item.name)}
            onMouseEnter={(e) => showFlyout(e, item.name, item.subItems)}
            onMouseLeave={hideFlyout}
            onFocus={(e) => showFlyout(e, item.name, item.subItems)}
            onBlur={hideFlyout}
            className={`flex items-center justify-between p-2 rounded-md text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors w-full ${
              collapsed ? "lg:justify-center" : ""
            }`}
          >
            <div className={`flex items-center gap-3 ${collapsed ? "lg:gap-0" : ""}`}>
              <Icon size={20} className="shrink-0" />
              {renderLabel(item.name)}
            </div>
            <span className={collapsed ? "lg:hidden" : ""}>
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          </button>

          {!collapsed && isOpen && (
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
      <NavLink
        key={item.name}
        to={item.path}
        className={({ isActive }) =>
          `${navLinkClass({ isActive })} ${collapsed ? "lg:justify-center lg:gap-0" : ""}`
        }
        onClick={() => setSidebarOpen(false)}
        onMouseEnter={(e) => showFlyout(e, item.name)}
        onMouseLeave={hideFlyout}
        onFocus={(e) => showFlyout(e, item.name)}
        onBlur={hideFlyout}
      >
        <Icon size={20} className="shrink-0" />
        {renderLabel(item.name)}
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
        className={`bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0 fixed inset-y-0 left-0 z-40 overflow-y-auto transition-[width,transform] duration-300 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:w-20" : "lg:w-64"}`}
      >
        <div
          className={`flex mb-6 ${
            collapsed
              ? "lg:flex-col lg:items-center lg:gap-1.5"
              : "flex-row items-start justify-between gap-2"
          }`}
        >
          <div
            className={`flex ${
              collapsed ? "lg:flex-col lg:items-center lg:gap-0" : "flex-row items-start gap-2"
            }`}
          >
            <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto shrink-0" />
            <div
              className={`flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${
                collapsed
                  ? "lg:max-w-0 lg:max-h-0 lg:opacity-0"
                  : "max-w-[10rem] opacity-100"
              }`}
            >
              <h1 className="text-xl font-bold text-primary whitespace-nowrap">TTMPC</h1>
              <PortalSidebarIdentity
                className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold whitespace-nowrap"
                fallbackPortal={`${portal} Portal`}
                fallbackRole={portal}
              />
            </div>
          </div>

          {/* Collapse/expand toggle — desktop only, sits right in the header
              next to the logo (right side when expanded, stacked below the
              logo when collapsed) so it's always in the same easy-to-find
              spot at the top of the sidebar. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-white shadow-sm transition-colors hover:bg-green-700"
          >
            <ChevronLeft
              size={16}
              strokeWidth={2.5}
              className={`transition-transform duration-300 ease-in-out ${collapsed ? "rotate-180" : ""}`}
            />
          </button>

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
                <p
                  className={`overflow-hidden whitespace-nowrap text-xs font-bold text-gray-400 px-2 uppercase tracking-wider transition-all duration-300 ease-in-out ${
                    collapsed ? "lg:max-h-0 lg:opacity-0 lg:mb-0" : "max-h-6 opacity-100"
                  }`}
                >
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
                        className={`flex items-center gap-3 p-2 rounded-md text-gray-400 cursor-not-allowed select-none opacity-60 ${
                          collapsed ? "lg:justify-center lg:gap-0" : ""
                        }`}
                      >
                        <Icon size={20} className="shrink-0" />
                        {renderLabel(item.name)}
                      </div>
                    );
                  }
                  return renderItem(item);
                })}
              </div>
            ))
          : items.map((item) => renderItem(item))}
      </nav>

        <div className="mt-auto">
          <button
            onClick={handleSignOut}
            onMouseEnter={(e) => showFlyout(e, "Sign out")}
            onMouseLeave={hideFlyout}
            onFocus={(e) => showFlyout(e, "Sign out")}
            onBlur={hideFlyout}
            className={`w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors flex items-center justify-center gap-2 ${
              collapsed ? "lg:gap-0" : ""
            }`}
          >
            <LogOut size={14} className={`shrink-0 hidden ${collapsed ? "lg:inline" : ""}`} />
            <span
              className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out ${
                collapsed ? "lg:max-w-0 lg:opacity-0" : "max-w-[8rem] opacity-100"
              }`}
            >
              Sign out
            </span>
          </button>
        </div>
      </aside>

      {/* Collapsed-rail hover flyout — portaled to document.body so it's
          never clipped by the sidebar's own overflow-y-auto scroll box (see
          the `flyout` state comment above). Stays mounted once collapsed so
          it can fade + slide in/out smoothly instead of popping in/out. */}
      {collapsed &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              top: flyout.top,
              left: flyout.left,
              transformOrigin: "left center",
              transform: `${flyout.subItems ? "" : "translateY(-50%) "}translateX(${
                flyout.visible ? 0 : -6
              }px) scale(${flyout.visible ? 1 : 0.96})`,
            }}
            className={`fixed z-[100] transition-all duration-200 ease-out ${
              flyout.visible ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            onMouseLeave={hideFlyout}
          >
            {flyout.subItems ? (
              <div className="min-w-[190px] rounded-lg border border-gray-100 bg-white py-2 shadow-lg">
                <p className="px-3 pb-1 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {flyout.label}
                </p>
                {flyout.subItems.map((subItem) => (
                  <NavLink
                    key={subItem.name}
                    to={subItem.path}
                    className={flyoutSubNavLinkClass}
                    onClick={() => {
                      setSidebarOpen(false);
                      hideFlyout();
                    }}
                  >
                    {subItem.name}
                  </NavLink>
                ))}
              </div>
            ) : (
              <span className="whitespace-nowrap rounded-md bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
                {flyout.label}
              </span>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
