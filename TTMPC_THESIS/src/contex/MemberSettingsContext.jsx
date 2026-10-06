import { createContext, useContext, useState } from "react";

/**
 * Open/closed state for the Member portal's Settings slide-out drawer.
 *
 * Member pages have no shared layout wrapper (each page renders its own
 * header inline — same situation as StaffLayoutContext's sidebar drawer), so
 * rather than give every page its own local Settings-drawer state (and its
 * own copy of the drawer JSX), this context is provided once at the app root
 * and a single <SettingsDrawer/> is mounted there too. Every page's header
 * gear icon just calls openSettings() — no navigation, no route, so there's
 * no back-button question: closing the drawer just restores whatever page
 * was already showing underneath it.
 */
const MemberSettingsContext = createContext(null);

export function MemberSettingsProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);

  const openSettings = () => setIsOpen(true);
  const closeSettings = () => setIsOpen(false);

  return (
    <MemberSettingsContext.Provider value={{ isOpen, openSettings, closeSettings }}>
      {children}
    </MemberSettingsContext.Provider>
  );
}

export function useMemberSettings() {
  const ctx = useContext(MemberSettingsContext);
  return ctx || { isOpen: false, openSettings: () => {}, closeSettings: () => {} };
}
