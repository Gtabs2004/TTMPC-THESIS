import { useEffect } from "react";
import { usePortalIdentity } from "./PortalIdentity";

const ROLE_TITLES = {
  bookkeeper: "TTMPC Bookkeeper Portal",
  treasurer: "TTMPC Treasurer Portal",
  manager: "TTMPC Manager Portal",
  cashier: "TTMPC Cashier Portal",
  secretary: "TTMPC Secretary Portal",
  bod: "TTMPC BOD Portal",
};

const DEFAULT_TITLE = "TTMPC Member Portal";

/**
 * Keeps the browser tab title in sync with whichever role is signed in —
 * renders nothing, mounted once at the app root (main.jsx). Without this,
 * the <title> in index.html is static, so every portal (Bookkeeper, Cashier,
 * Manager, Treasurer, BOD, secretary) showed "TTMPC Member Portal" in the
 * tab regardless of which staff account was logged in.
 *
 * Reuses usePortalIdentity — the same role-resolution hook StaffTopbar/
 * StaffSidebar already call via PortalTopbarIdentity/PortalSidebarIdentity —
 * so this doesn't add a second Supabase round trip on top of theirs.
 */
export default function DocumentTitleSync() {
  const { role } = usePortalIdentity();

  useEffect(() => {
    document.title = ROLE_TITLES[role] || DEFAULT_TITLE;
  }, [role]);

  return null;
}
