import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// One lookup per access token, shared by the BOD sidebar and the Account
// Management page guard, so moving between BOD pages doesn't re-ask.
let cached = null; // { token, value }
let inflight = null; // { token, promise }

async function fetchIsAccountAdmin(token) {
  if (cached?.token === token) return cached.value;
  if (inflight?.token === token) return inflight.promise;

  const promise = fetch(`${API_BASE}/api/admin/accounts/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => Boolean(body?.can_manage_accounts))
    .catch(() => false)
    .then((value) => {
      cached = { token, value };
      inflight = null;
      return value;
    });
  inflight = { token, promise };
  return promise;
}

/**
 * Whether the signed-in user is the BOD account administrator
 * (member_account.can_manage_accounts). `null` while unknown.
 *
 * Only the backend decides this; the flag is not read from the account row
 * directly so a database without the column simply reads as "no".
 */
export function useAccountAdmin({ enabled = true } = {}) {
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (!cancelled) setIsAdmin(false);
        return;
      }
      const value = await fetchIsAccountAdmin(session.access_token);
      if (!cancelled) setIsAdmin(value);
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  return isAdmin;
}

/** Drop the cached answer (e.g. after the admin flag changes). */
export function invalidateAccountAdmin() {
  cached = null;
}
