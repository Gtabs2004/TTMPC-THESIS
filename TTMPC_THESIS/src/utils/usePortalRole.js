import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { resolveAccountFromSessionUser } from "./sessionIdentity";

/**
 * Returns the current logged-in user's portal role (lowercase), e.g. "bod" or "secretary".
 * Used by shared BOD/Secretary sidebars to grey-out sections outside the user's role.
 */
export function usePortalRole() {
  const [role, setRole] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const account = await resolveAccountFromSessionUser(session.user);
      if (cancelled) return;
      setRole(String(account?.role || "").trim().toLowerCase());
    })();
    return () => { cancelled = true; };
  }, []);

  return role;
}
