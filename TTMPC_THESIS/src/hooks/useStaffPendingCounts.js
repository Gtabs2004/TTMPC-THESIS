import { useQuery } from "@tanstack/react-query";
import { authHeaders } from "../utils/authHeaders";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Tables whose changes can move a Manager / Treasurer / Cashier / BOD pending
// count; the shared realtime bus refetches this query when one changes.
const PENDING_COUNT_ENTITIES = [
  "loans",
  "non_member_loans",
  "member_applications",
  "member",
  "capital_build_up",
  "cbu_payouts",
];

/**
 * Pending-work counts for the Manager, Treasurer, Cashier and BOD sidebar
 * badges (the Bookkeeper has useBookkeeperPendingCounts). The keys depend on
 * the role, e.g. { loan_approval } or { loan_disbursement, cbu_payouts }.
 * Returns {} until loaded and on failure, so a hiccup just means no badges.
 */
export function useStaffPendingCounts(enabled) {
  const { data } = useQuery({
    queryKey: ["sidebar-badges", "staff"],
    enabled: Boolean(enabled),
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/staff/pending-counts`, {
        headers: { Accept: "application/json", ...(await authHeaders()) },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.detail || "Could not load pending counts.");
      return payload?.data || {};
    },
    meta: { realtimeEntities: PENDING_COUNT_ENTITIES },
  });
  return data || {};
}
