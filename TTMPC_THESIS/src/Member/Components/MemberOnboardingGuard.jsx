import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Routes the guard is allowed to redirect *to* (so we don't infinite-loop
// when the user is already on one of them).
const ONBOARDING_ROUTES = new Set([
  "/members-profile",
  "/members-profile/change-email",
]);

// Routes the guard should never act on (login, public pages, etc.).
const SKIP_PREFIXES = ["/login", "/signup", "/forgot", "/reset"];

/**
 * Wraps the app and forces members with is_email_dummy=true to the
 * change-email page, and members with is_temporary=true to the change-password
 * flow, before letting them navigate elsewhere.
 *
 * Polls the backend /account/security-status on every route change.
 */
export default function MemberOnboardingGuard({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const path = location.pathname;

    if (SKIP_PREFIXES.some((p) => path.startsWith(p))) {
      setChecked(true);
      return;
    }

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) setChecked(true);
          return;
        }

        const res = await fetch(`${API_BASE}/api/account/security-status`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          if (!cancelled) setChecked(true);
          return;
        }
        const body = await res.json();

        if (cancelled) return;

        // Email is the highest-priority gate.
        if (body.is_email_dummy && path !== "/members-profile/change-email") {
          navigate("/members-profile/change-email", { replace: true });
          return;
        }

        // Then forced password change (only meaningful if email is real).
        if (!body.is_email_dummy && body.is_temporary) {
          const alreadyOnProfile = path === "/members-profile";
          const alreadyForcing = location.search.includes("forcePassword=1");
          if (!alreadyOnProfile || !alreadyForcing) {
            if (!ONBOARDING_ROUTES.has(path)) {
              navigate("/members-profile?forcePassword=1", { replace: true });
              return;
            }
          }
        }

        setChecked(true);
      } catch {
        if (!cancelled) setChecked(true);
      }
    })();

    return () => { cancelled = true; };
  }, [location.pathname, location.search, navigate]);

  if (!checked) return null;
  return children;
}
