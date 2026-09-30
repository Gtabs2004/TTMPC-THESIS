import { useCallback, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { UserAuth } from "../contex/AuthContext";
import { supabase } from "../supabaseClient";

/*
  IdleSessionWarning
  ------------------
  Shows a modal once a signed-in user has had no mouse, keyboard, scroll or
  touch activity for IDLE_LIMIT_MS. The session is NOT ended -- the user
  clicks "Continue session" to dismiss it and the idle clock restarts.

  While the modal is open, stray activity (e.g. moving the mouse) does not
  dismiss it; only the button does, so the user actually sees the warning.
*/

const IDLE_LIMIT_MS = 10 * 60 * 1000;
const CHECK_EVERY_MS = 5 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];

export default function IdleSessionWarning() {
  const { session } = UserAuth();
  const [idle, setIdle] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const idleRef = useRef(false);

  const markActive = useCallback(() => {
    if (idleRef.current) return;
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!session) {
      idleRef.current = false;
      setIdle(false);
      return undefined;
    }

    lastActivityRef.current = Date.now();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActive, { passive: true }));

    // Compare timestamps instead of one long setTimeout: background tabs
    // throttle timers, and this still fires correctly when the tab returns.
    const timer = window.setInterval(() => {
      if (!idleRef.current && Date.now() - lastActivityRef.current >= IDLE_LIMIT_MS) {
        idleRef.current = true;
        setIdle(true);
      }
    }, CHECK_EVERY_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive));
      window.clearInterval(timer);
    };
  }, [session, markActive]);

  const handleContinue = async () => {
    idleRef.current = false;
    lastActivityRef.current = Date.now();
    setIdle(false);
    // Make sure the access token is fresh after sitting idle.
    try {
      await supabase.auth.refreshSession();
    } catch {
      // Non-fatal: AuthContext's own revalidation handles a dead session.
    }
  };

  if (!session || !idle) return null;

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/50 px-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-warning-title"
        aria-describedby="idle-warning-body"
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-gray-900"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Clock className="h-6 w-6 text-amber-600 dark:text-amber-300" />
        </div>
        <h2 id="idle-warning-title" className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
          Are you still there?
        </h2>
        <p id="idle-warning-body" className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          This session has been left inactive for {IDLE_LIMIT_MS / 60000} minutes.
        </p>
        <button
          type="button"
          autoFocus
          onClick={handleContinue}
          className="mt-5 w-full rounded-lg bg-member-green px-4 py-2.5 text-sm font-bold text-white hover:bg-[#154718]"
        >
          Continue session
        </button>
      </div>
    </div>
  );
}
