import React, { useEffect, useState } from "react";

// StandaloneMemberOnlyGuard
//
// When the app is running as an INSTALLED PWA (display-mode: standalone),
// force any non-member URL back to /memberlogin. This turns the installed
// APK/PWA into a genuinely member-only app even if a link, cached URL, or
// stale bookmark points somewhere staff-only.
//
// Zero effect in a normal browser tab. The `display-mode: standalone` media
// query is only true when the app was launched from its home-screen icon
// (Android) or added to the home screen (iOS). If a user opens the app in
// a regular browser tab, the guard does nothing — the full app is still
// reachable for staff who need it.
//
// Also enforces on client-side navigation, not just first load, so a member
// can't reach a staff page via any router.push call in the code.
//
// Mounted once at the app root (main.jsx), same tier as PwaInstallGate.

// Allowed paths when running as installed member PWA. Anything not matching
// gets redirected to /memberlogin. Kept broad on purpose: member routes,
// login/onboarding, password-reset, verify, marketing "role_selection" is
// intentionally excluded so the installed app never accidentally shows the
// staff role picker.
const ALLOWED_PREFIXES = [
  "/memberlogin",
  "/member-",
  "/members-",
  "/members_",
  "/member_",
  "/forgot",
  "/reset",
  "/verify",
  // Loan application forms — reached from Member_ApplyLoans loan-type buttons.
  // Their route names don't start with /member- so must be listed explicitly.
  "/conso_choice",
  "/consolidated_loan",
  "/consolidated_up",
  "/emergency_loan",
  "/bonus_loan",
  "/koica_loan",
];

const isAllowed = (pathname) => {
  const p = String(pathname || "").toLowerCase();
  if (p === "/") return false; // root marketing landing is not part of the app
  return ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix));
};

const isStandalone = () => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari uses a non-standard `navigator.standalone` flag.
    window.navigator?.standalone === true
  );
};

const currentPath = () =>
  typeof window !== "undefined" ? window.location.pathname : "/";

const redirectToLogin = () => {
  if (typeof window === "undefined") return;
  // Use replace so the disallowed URL doesn't sit in history — user's back
  // button shouldn't land them back on the blocked route.
  window.location.replace("/memberlogin");
};

const StandaloneMemberOnlyGuard = () => {
  // Track whether we're in standalone mode. This can change mid-session in
  // theory (rare) but we compute once at mount.
  const [standalone] = useState(isStandalone);

  useEffect(() => {
    if (!standalone) return;

    // Initial check — if user launched the installed app on a stale
    // disallowed URL, redirect immediately.
    if (!isAllowed(currentPath())) {
      redirectToLogin();
      return;
    }

    // Re-check on every client-side navigation. React Router uses
    // history.pushState/replaceState; we listen on the shared custom event
    // that PwaInstallGate already sets up (see PwaInstallGate.jsx comments).
    // If PwaInstallGate is not mounted, we still fire on popstate at minimum.
    const check = () => {
      if (!isAllowed(currentPath())) {
        redirectToLogin();
      }
    };

    window.addEventListener("popstate", check);
    window.addEventListener("ttmpc:navigation", check);

    return () => {
      window.removeEventListener("popstate", check);
      window.removeEventListener("ttmpc:navigation", check);
    };
  }, [standalone]);

  return null;
};

export default StandaloneMemberOnlyGuard;
