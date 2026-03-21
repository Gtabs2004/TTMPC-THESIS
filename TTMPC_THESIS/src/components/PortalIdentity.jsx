import React, { useEffect, useMemo, useState } from "react";
import { UserAuth } from "../contex/AuthContext";
import { supabase } from "../supabaseClient";

const ROLE_LABELS = {
  bookkeeper: "Bookkeeper",
  treasurer: "Treasurer",
  manager: "Manager",
  cashier: "Cashier",
  secretary: "Secretary",
  bod: "BOD",
  member: "Member",
};

const normalizeRole = (value) => String(value || "").trim().toLowerCase();

const formatRole = (role, fallbackRole = "User") => {
  const key = normalizeRole(role);
  return ROLE_LABELS[key] || fallbackRole;
};

function usePortalIdentity(fallbackPortal = "Portal", fallbackRole = "User") {
  const { session } = UserAuth();
  const [resolvedRole, setResolvedRole] = useState("");

  const userEmail = useMemo(
    () => String(session?.user?.email || "").trim().toLowerCase(),
    [session?.user?.email]
  );

  useEffect(() => {
    let isMounted = true;

    const resolveRole = async () => {
      const uid = session?.user?.id;
      const email = userEmail;

      if (!uid && !email) {
        if (isMounted) setResolvedRole("");
        return;
      }

      try {
        const byUserId = uid
          ? await supabase
              .from("member_account")
              .select("role")
              .eq("user_id", uid)
              .limit(1)
              .maybeSingle()
          : { data: null, error: null };

        if (!byUserId?.error && byUserId?.data?.role) {
          if (isMounted) setResolvedRole(normalizeRole(byUserId.data.role));
          return;
        }

        const byEmail = email
          ? await supabase
              .from("member_account")
              .select("role")
              .ilike("email", email)
              .limit(1)
              .maybeSingle()
          : { data: null, error: null };

        if (!byEmail?.error && byEmail?.data?.role) {
          if (isMounted) setResolvedRole(normalizeRole(byEmail.data.role));
          return;
        }

        const fallbackMetaRole =
          session?.user?.user_metadata?.role || session?.user?.app_metadata?.role || "";

        if (isMounted) setResolvedRole(normalizeRole(fallbackMetaRole));
      } catch (_err) {
        if (isMounted) setResolvedRole("");
      }
    };

    resolveRole();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, session?.user?.user_metadata?.role, session?.user?.app_metadata?.role, userEmail]);

  const roleLabel = formatRole(resolvedRole, fallbackRole);
  const portalLabel = `${roleLabel} Portal`;

  return {
    roleLabel,
    portalLabel: portalLabel || fallbackPortal,
    userEmail: userEmail || "-",
  };
}

export function PortalSidebarIdentity({ className = "", fallbackPortal = "Portal", fallbackRole = "User" }) {
  const { portalLabel, userEmail } = usePortalIdentity(fallbackPortal, fallbackRole);

  return (
    <div className="flex flex-col">
      <p className={className}>{portalLabel || fallbackPortal}</p>
      <p className="text-[10px] text-gray-400 normal-case tracking-normal">{userEmail}</p>
    </div>
  );
}

export function PortalTopbarIdentity({ className = "", fallbackRole = "User" }) {
  const { roleLabel, userEmail } = usePortalIdentity(`${fallbackRole} Portal`, fallbackRole);

  return (
    <div className="ml-2 flex flex-col leading-tight">
      <p className={className}>{roleLabel}</p>
      <p className="text-[10px] text-gray-400">{userEmail}</p>
    </div>
  );
}
