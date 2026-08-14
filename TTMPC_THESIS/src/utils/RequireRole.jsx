import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { resolveAccountFromSessionUser } from "./sessionIdentity";

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

        const role = await resolveRole(session);
        if (cancelled) return;

        const allowed = (Array.isArray(allow) ? allow : [allow])
          .map((r) => String(r || "").trim().toLowerCase())
          .filter(Boolean);

        if (!role || !allowed.includes(role)) {
          navigate("/", { replace: true });
          return;
        }

        setChecked(true);
        didInitialCheck.current = true;
      } catch {
        if (!cancelled) navigate("/", { replace: true });
      }
    })();

    return () => { cancelled = true; };
  }, [location.pathname, allow, navigate]);

  if (!checked) return null;
  return children;
}
