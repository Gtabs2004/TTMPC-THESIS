import React, { createContext, useContext, useState } from "react";

/**
 * Shared open/closed state for the staff-portal mobile sidebar drawer.
 *
 * <StaffSidebar/> and <StaffTopbar/> are rendered as plain siblings on every
 * one of the ~59 staff pages (BOD/Bookkeeper/Cashier/Manager/Treasurer/
 * Secretary) — there's no shared per-page layout wrapper the way the Member
 * portal has MemberLayout. Rather than thread sidebarOpen/setSidebarOpen
 * through every one of those pages as props, this context is provided once
 * at the app root (see main.jsx) so StaffTopbar's hamburger button and
 * StaffSidebar's drawer can talk to each other without any page needing to
 * know this exists.
 *
 * Safe to have mounted for non-staff routes (Member portal, public site) —
 * useStaffLayout() falls back to inert no-op state if the provider isn't an
 * ancestor, so nothing breaks if a future page happens not to be wrapped.
 */
const StaffLayoutContext = createContext(null);

export function StaffLayoutProvider({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <StaffLayoutContext.Provider value={{ sidebarOpen, setSidebarOpen }}>
      {children}
    </StaffLayoutContext.Provider>
  );
}

export function useStaffLayout() {
  const ctx = useContext(StaffLayoutContext);
  return ctx || { sidebarOpen: false, setSidebarOpen: () => {} };
}
