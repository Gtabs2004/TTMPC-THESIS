import React from "react";
import { Search, User } from "lucide-react";
import { PortalTopbarIdentity } from "../PortalIdentity";

/**
 * Single-source-of-truth topbar for all staff portals (Bookkeeper, Cashier,
 * Manager, Treasurer, BOD, secretary) — the header-side counterpart to
 * <StaffSidebar/>. Every staff page should render this instead of
 * hand-rolling its own <header>, which is how the previous ~40 hand-rolled
 * headers drifted into four different border/shadow treatments and, worse,
 * a broken avatar image (`/img/*-profile.png` doesn't exist in public/img/
 * for any role) on nearly every page.
 *
 * (The Member portal keeps its own header — it's already consistent across
 * every Member page and has dark-mode/mobile-drawer behavior staff portals
 * don't need, same reasoning as StaffSidebar.)
 *
 * Props:
 *   portal        — display label ("Bookkeeper" / "Cashier" / "Manager" /
 *                    "Treasurer" / "BOD" / "Secretary"). Passed straight
 *                    through to PortalTopbarIdentity's fallbackRole.
 *   notifications — the notification bell node to render, e.g.
 *                    <LoanNotificationBell role="bookkeeper" />. Required.
 *                    StaffTopbar stays agnostic about which bell a portal
 *                    needs — Bookkeeper/Cashier/Manager/Treasurer use the
 *                    loan-workflow queue (LoanNotificationBell), BOD/
 *                    secretary use the membership-application queue
 *                    (NotificationBell) — that's a real functional choice,
 *                    not styling, so it isn't hardcoded here. Pass a
 *                    fragment with both if a page genuinely needs both.
 *   search        — optional { value, onChange, placeholder }. Omit entirely
 *                    to render no search box — most existing search boxes
 *                    were decorative (no value/onChange, did nothing when
 *                    typed into); this makes "no search" an explicit choice
 *                    instead of a dead input that looks functional.
 *   avatarUrl     — optional signed image URL. No staff photo-upload
 *                    feature exists today, so this defaults to a generic
 *                    icon-in-a-circle placeholder (matching the one portal,
 *                    Treasurer, that was already avoiding the broken image
 *                    path) rather than referencing a file that isn't there.
 *   sticky        — optional. A couple of long-scrolling pages (grocery
 *                    ledgers) kept their header pinned via `sticky top-0
 *                    z-10`; that's a real behavior worth preserving, not
 *                    drift, so it's opt-in here rather than dropped.
 */
export default function StaffTopbar({ portal, notifications, search, avatarUrl, sticky = false }) {
  return (
    <header
      className={`bg-white h-16 shadow-sm border-b border-gray-100 flex items-center justify-end px-8 shrink-0 ${
        sticky ? "sticky top-0 z-10" : ""
      }`}
    >
      

      {notifications}

      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt="Profile"
          className="ml-4 w-8 h-8 rounded-full object-cover bg-gray-100"
        />
      ) : (
        <div className="ml-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
          <User className="w-4.5 h-4.5" />
        </div>
      )}

      <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole={portal} />
    </header>
  );
}
