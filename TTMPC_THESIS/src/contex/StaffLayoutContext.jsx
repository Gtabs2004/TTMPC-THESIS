import React, { createContext, useContext, useEffect, useState } from "react";

/**
 * Shared open/closed state for the staff-portal mobile sidebar drawer, plus
 * the desktop collapsed/expanded (icons-only vs. icons+labels) state.
 *
 * <StaffSidebar/> and <StaffTopbar/> are rendered as plain siblings on every
 * one of the ~59 staff pages (BOD/Bookkeeper/Cashier/Manager/Treasurer/
 * Secretary) — there's no shared per-page layout wrapper the way the Member
 * portal has MemberLayout. Rather than thread this state through every one
 * of those pages as props, this context is provided once at the app root
 * (see main.jsx) so StaffTopbar's hamburger button and StaffSidebar's drawer
 * (and its own collapse toggle) can talk to each other without any page
 * needing to know this exists.
 *
 * `collapsed` only affects the desktop (lg+) static sidebar — the mobile
 * drawer (`sidebarOpen`) always renders full-width when open, per the
 * existing drawer/overlay behavior. It's persisted to localStorage (a
 * harmless UI preference, unlike auth state) so it survives navigation and
 * reloads instead of resetting on every page.
 *
 * Safe to have mounted for non-staff routes (Member portal, public site) —
 * useStaffLayout() falls back to inert no-op state if the provider isn't an
 * ancestor, so nothing breaks if a future page happens not to be wrapped.
 */
const StaffLayoutContext = createContext(null);
const COLLAPSED_STORAGE_KEY = "ttmpc_staff_sidebar_collapsed";

function readStoredCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function StaffLayoutProvider({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // Storage unavailable (private mode, etc.) — collapse state just
      // won't persist across reloads, which is harmless.
    }
  }, [collapsed]);

  const toggleCollapsed = () => setCollapsed((prev) => !prev);

  return (
    <StaffLayoutContext.Provider
      value={{ sidebarOpen, setSidebarOpen, collapsed, setCollapsed, toggleCollapsed }}
    >
      {children}
    </StaffLayoutContext.Provider>
  );
}

export function useStaffLayout() {
  const ctx = useContext(StaffLayoutContext);
  return (
    ctx || {
      sidebarOpen: false,
      setSidebarOpen: () => {},
      collapsed: false,
      setCollapsed: () => {},
      toggleCollapsed: () => {},
    }
  );
}
