import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { resolveAccountFromSessionUser } from "./sessionIdentity";
import AccountSetupGate from "../Member/Components/AccountSetupGate";

// Cache the resolved role per access token so tab-to-tab navigation between
// staff pages doesn't re-hit the account table on every render. Invalidated
// automatically when a new session (different token) is used.
let cachedRole = null; // { token, role, fetchedAt }
const ROLE_TTL_MS = 60_000;

async function resolveRole(session) {
  const token = session?.access_token;
  if (!token || !session?.user) return null;

  const now = Date.now();
  if (
    cachedRole &&
    cachedRole.token === token &&
    now - cachedRole.fetchedAt < ROLE_TTL_MS
  ) {
    return cachedRole.role;
  }

  const account = await resolveAccountFromSessionUser(session.user);
  const role = String(account?.role || "").trim().toLowerCase();
  cachedRole = { token, role, fetchedAt: now };
  return role;
}

// Route-level RBAC guard. `allow` is a role or list of roles (case-insensitive)
// that may render `children`. Anyone else is bounced:
//   • no session         → /Login
//   • wrong role         → /  (landing)
export default function RequireRole({ allow, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const didInitialCheck = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
          if (!cancelled) navigate("/Login", { replace: true });
          return;
        }

        let role = await resolveRole(session);

        // A momentary lookup failure (e.g. the account row isn't readable yet
        // right after a token refresh) must not be treated as "wrong role" —
        // that was bouncing users to "/" mid-navigation, which looked like
        // being kicked out of their session. Retry once before giving up.
        if (!role) {
          await new Promise((r) => setTimeout(r, 400));
          if (cancelled) return;
          cachedRole = null; // force a fresh lookup, bypassing the stale TTL cache
          role = await resolveRole(session);
        }

        if (cancelled) return;

        const allowed = (Array.isArray(allow) ? allow : [allow])
          .map((r) => String(r || "").trim().toLowerCase())
          .filter(Boolean);

        if (!role) {
          // Still couldn't resolve an account after retrying — this is an
          // infrastructure/lookup problem, not proof the user lacks access.
          // Don't bounce; let them retry the navigation instead of silently
          // landing on "/".
          console.error("[RequireRole] Could not resolve account role after retry.");
          return;
        }

        if (!allowed.includes(role)) {
          navigate("/", { replace: true });
          return;
        }

        setChecked(true);
        didInitialCheck.current = true;
      } catch (err) {
        // An unexpected error here (network blip, etc.) is not proof the
        // session is invalid — don't bounce to "/" and make it look like the
        // user got logged out. Only an explicit missing-session case above
        // redirects to Login; everything else just stays put.
        console.error("[RequireRole] Unexpected error during role check:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [location.pathname, allow, navigate]);

  if (!checked) return null;
  // A member given a staff role while still on a temporary email/password
  // must finish account setup before using the staff portal (the gate renders
  // nothing once both are real).
  return (
    <>
      {children}
      <AccountSetupGate signOutTo="/Login" portalLabel="staff portal" />
    </>
  );
}
