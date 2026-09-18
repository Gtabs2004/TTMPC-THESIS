import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import {
  hasCachedStatus,
  readCachedStatus,
  writeCachedStatus,
} from "../securityStatusCache";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// The ONLY route a member with an unfinished account may open: the dashboard,
// which hosts the blocking AccountSetupGate overlay. Every step is completed
// inside that overlay, so no other page needs to be reachable -- and the
// profile page in particular must not be, since it renders the portal sidebar
// and would hand out the navigation this lock exists to withhold.
const SETUP_ALLOWED_ROUTES = new Set(["/member-dashboard"]);

// Paths where we should NOT check onboarding status. Anything not member-facing
// (auth flows, marketing landing, staff portals) doesn't need this check —
// skipping avoids a spurious 401 when a staff auth token or no token is present.
const SKIP_PREFIXES = ["/login", "/signup", "/forgot", "/reset", "/memberlogin"];

async function fetchStatus(session) {
  const token = session?.access_token;
  if (!token) return null;

  const fromCache = readCachedStatus(token);
  if (fromCache) return fromCache;

  const res = await fetch(`${API_BASE}/api/account/security-status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // 503 means the backend couldn't reach the auth service, not that this
  // member is set up. Retry once rather than caching a non-answer -- caching
  // it would let an unfinished account past the gate for the whole TTL.
  if (res.status === 503) {
    const retry = await fetch(`${API_BASE}/api/account/security-status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!retry.ok) return null;
    const retryBody = await retry.json();
    writeCachedStatus(token, retryBody);
    return retryBody;
  }
  if (!res.ok) return null;
  const body = await res.json();
  writeCachedStatus(token, body);
  return body;
}

export default function MemberOnboardingGuard({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  // Start "checked" if we have a fresh cached status — avoids the blank flash
  // on every sidebar navigation.
  const [checked, setChecked] = useState(() => hasCachedStatus());
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

        // An account is "set up" once it has a real email and a password the
        // member chose. Profile completion is no longer required to unlock
        // the portal -- members fill those fields in later from their
        // profile page.
        const setupIncomplete = body.is_email_dummy || body.is_temporary;

        // The dashboard and the three setup destinations stay reachable: the
        // dashboard renders AccountSetupGate, a blocking overlay that walks the
        // member through the outstanding steps, and they obviously need to
        // reach the pages those steps link to.
        //
        // Everything else in the portal (loans, savings, statements) is sent
        // back to the dashboard, so the member always meets the same overlay
        // rather than being bounced between pages.
        if (setupIncomplete && !SETUP_ALLOWED_ROUTES.has(path)) {
          navigate("/member-dashboard", { replace: true });
          return;
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
