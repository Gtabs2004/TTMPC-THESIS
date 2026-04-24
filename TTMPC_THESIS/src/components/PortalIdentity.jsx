import React, { useEffect, useMemo, useState } from "react";
import { UserAuth } from "../contex/AuthContext";
import { resolveAccountFromSessionUser } from "../utils/sessionIdentity";

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
      const sessionUser = session?.user;

      if (!sessionUser?.id && !userEmail) {
        if (isMounted) setResolvedRole("");
        return;
      }

      try {
        const account = await resolveAccountFromSessionUser(sessionUser);

        if (account?.role) {
          if (isMounted) setResolvedRole(normalizeRole(account.role));
          return;
        }

        const fallbackMetaRole =
          sessionUser?.user_metadata?.role || sessionUser?.app_metadata?.role || "";

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
