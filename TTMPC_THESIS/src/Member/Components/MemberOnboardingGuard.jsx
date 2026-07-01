import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const ONBOARDING_ROUTES = new Set([
  "/members-profile",
  "/members-profile/change-email",
]);

const SKIP_PREFIXES = ["/login", "/signup", "/forgot", "/reset"];

// Cache the security-status result for the lifetime of the SPA session so
// tab-to-tab navigation doesn't blank the screen while re-fetching. The cache
// is keyed by access token so a re-login invalidates it.
let cachedStatus = null; // { token, body, fetchedAt }
const STATUS_TTL_MS = 60_000;

async function fetchStatus(session) {
  const token = session?.access_token;
  if (!token) return null;

  const now = Date.now();
  if (
    cachedStatus &&
    cachedStatus.token === token &&
    now - cachedStatus.fetchedAt < STATUS_TTL_MS
  ) {
    return cachedStatus.body;
  }

  const res = await fetch(`${API_BASE}/api/account/security-status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const body = await res.json();
  cachedStatus = { token, body, fetchedAt: now };
  return body;
}

export default function MemberOnboardingGuard({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  // Start "checked" if we have a fresh cached status — avoids the blank flash
  // on every sidebar navigation.
  const [checked, setChecked] = useState(() => cachedStatus !== null);
  const didInitialCheck = useRef(false);

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

        const body = await fetchStatus(session);
        if (cancelled) return;
        if (!body) {
          setChecked(true);
          return;
        }

        if (body.is_email_dummy && path !== "/members-profile/change-email") {
          navigate("/members-profile/change-email", { replace: true });
          return;
        }

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
        didInitialCheck.current = true;
      } catch {
        if (!cancelled) setChecked(true);
      }
    })();

    return () => { cancelled = true; };
  }, [location.pathname, location.search, navigate]);

  if (!checked) return null;
  return children;
}
