import React, { useEffect, useState } from "react";
import PwaInstallPrompt from "./PwaInstallPrompt";

// PwaInstallGate
//
// Wraps PwaInstallPrompt with a path check so the install banner only shows
// on the member login screen (/memberlogin). Once a member is inside the
// portal, the prompt does not appear — they are not nagged mid-session.
// The next time they land on /memberlogin, the prompt shows again.
//
// Why window.location instead of useLocation:
//   This component is mounted in main.jsx *outside* RouterProvider (next to
//   NotificationContainer), so React Router hooks are unavailable. We use
//   window.location.pathname and listen to history events for client-side
//   navigation. If a linter re-adds `useLocation`, the app will crash at
//   render — do not switch back without also moving this component inside
//   the router.
//
// Mounted once at the app root (main.jsx) — same tier as NotificationContainer.

// Prompt scope: only on the member login screen.
const isMemberRoute = (pathname) => {
  const p = String(pathname || "").toLowerCase();
  return p === "/memberlogin" || p.startsWith("/memberlogin/");
};

const currentPath = () =>
  typeof window !== "undefined" ? window.location.pathname : "";

const PwaInstallGate = () => {
  const [pathname, setPathname] = useState(currentPath);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const update = () => setPathname(currentPath());

    // Back/forward navigation.
    window.addEventListener("popstate", update);

    // React Router uses history.pushState/replaceState for client-side nav.
    // Monkey-patch to emit a custom event so this component re-checks
    // without needing to be inside the router provider.
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;
    window.history.pushState = function (...args) {
      const ret = origPush.apply(this, args);
      window.dispatchEvent(new Event("ttmpc:navigation"));
      return ret;
    };
    window.history.replaceState = function (...args) {
      const ret = origReplace.apply(this, args);
      window.dispatchEvent(new Event("ttmpc:navigation"));
      return ret;
    };
    window.addEventListener("ttmpc:navigation", update);

    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("ttmpc:navigation", update);
      // Restore only if still ours. If another patcher stacked on top,
      // leaving ours in place is safer than reverting to something older.
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
    };
  }, []);

  if (!isMemberRoute(pathname)) return null;
  return <PwaInstallPrompt />;
};

export default PwaInstallGate;
