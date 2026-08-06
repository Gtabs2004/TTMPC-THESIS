import React, { useEffect, useState } from "react";
import { Download, X, Share, Plus } from "lucide-react";

// beforeinstallprompt fires ONCE, very early — often before any React
// component has mounted. We stash it at module-load time so the component
// can read it later. Without this, refreshing /memberlogin would miss the
// event entirely and the banner would never appear.
let cachedInstallEvent = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    cachedInstallEvent = e;
    // Notify any mounted PwaInstallPrompt so it can render immediately.
    window.dispatchEvent(new Event("ttmpc:pwa-installable"));
  });
  window.addEventListener("appinstalled", () => {
    cachedInstallEvent = null;
  });
}

// PwaInstallPrompt
//
// Small floating banner that offers app install to eligible users. Mounted
// only on member-facing pages (Member portal + memberlogin) — staff pages
// don't render it.
//
// Behavior differs by platform:
//   - Chrome / Edge / Android: browser fires `beforeinstallprompt` when
//     install criteria are met. We stash that event and show a native prompt
//     when the user taps "Install".
//   - iOS Safari: no `beforeinstallprompt` event exists. Detect iOS and
//     show manual instructions ("Share → Add to Home Screen") instead.
//   - Already installed (display-mode: standalone): render nothing.
//
// Dismissal: persisted in localStorage for 7 days so users aren't nagged
// every visit. Cleared on explicit re-open of the site after a full uninstall.

// Dismiss is intentionally NOT persisted across sessions.
// The gate (PwaInstallGate) only mounts this component on /memberlogin, so
// dismissing hides it for the current visit only — the next login will re-show
// the prompt. Trade-off chosen by the user: banner is a nudge on entry, not
// a nag while inside the portal.
const isStandalone = () => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari uses a non-standard `navigator.standalone` flag.
    window.navigator?.standalone === true
  );
};

const isIos = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
};

const PwaInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    // If the browser already fired beforeinstallprompt before we mounted,
    // pick it up from the module-level cache and show immediately.
    if (cachedInstallEvent) {
      setDeferredPrompt(cachedInstallEvent);
      setVisible(true);
    }

    // If the browser fires it AFTER we mount (rare but possible on first
    // visit where engagement criteria are met mid-session), catch it here.
    const onInstallable = () => {
      if (cachedInstallEvent) {
        setDeferredPrompt(cachedInstallEvent);
        setVisible(true);
      }
    };
    window.addEventListener("ttmpc:pwa-installable", onInstallable);

    // Hide when the user completes install from anywhere.
    const onInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari fallback: no beforeinstallprompt exists on iOS at all.
    // Show manual "Share → Add to Home Screen" instructions after a delay.
    if (isIos()) {
      const t = setTimeout(() => setVisible(true), 1500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("ttmpc:pwa-installable", onInstallable);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    return () => {
      window.removeEventListener("ttmpc:pwa-installable", onInstallable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        // We don't need to read the outcome — the `appinstalled` listener
        // handles the success path, and dismissal handles the reject path.
      } catch {
        /* user cancelled — treat as dismiss */
      }
      setDeferredPrompt(null);
      setVisible(false);
      return;
    }
    // iOS path — expand instructions inline.
    if (isIos()) {
      setShowIosInstructions(true);
    }
  };

  const handleDismiss = () => {
    // No persistence — dismissal is scoped to the current visit only.
    // The gate only mounts us on /memberlogin, so the next login shows
    // the prompt again automatically.
    setVisible(false);
    setShowIosInstructions(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Install TTMPC app"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 rounded-2xl border border-gray-200 bg-white shadow-2xl p-4 dark:bg-gray-900 dark:border-gray-700"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#EAF1EB] flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-[#1D6021]" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-gray-900 dark:text-white text-sm">Install TTMPC</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            Add the Member Portal to your home screen for faster access.
          </p>

          {showIosInstructions ? (
            <div className="mt-3 text-xs text-gray-600 dark:text-gray-300 space-y-1.5 leading-relaxed">
              <p className="flex items-center gap-1.5">
                <span className="font-bold">1.</span>
                Tap <Share className="w-3.5 h-3.5 inline" /> Share in Safari
              </p>
              <p className="flex items-center gap-1.5">
                <span className="font-bold">2.</span>
                Choose <Plus className="w-3.5 h-3.5 inline" /> Add to Home Screen
              </p>
              <p className="flex items-center gap-1.5">
                <span className="font-bold">3.</span>
                Tap Add
              </p>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleInstall}
                className="flex-1 rounded-lg bg-[#1D6021] px-3 py-2 text-xs font-bold text-white hover:bg-[#154718] transition-colors"
              >
                {deferredPrompt ? "Install" : "How to install"}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                Not now
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default PwaInstallPrompt;
