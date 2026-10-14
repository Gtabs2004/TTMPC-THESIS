import { useQuery } from "@tanstack/react-query";
import { authHeaders } from "../utils/authHeaders";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Tables whose changes can move a pending count. The shared realtime bus
// refetches this query whenever one of them changes anywhere in the system
// (see queryMatchesEntities in lib/realtimeSync.js), so a badge updates as
// work arrives or gets cleared, without polling.
const PENDING_COUNT_ENTITIES = [
  "loans",
  "non_member_loans",
  "loan_payments",
  "savings_transaction_queue",
  "loan_renewal_override_requests",
];

/**
 * Pending-work counts for the Bookkeeper sidebar badges:
 * { loan_approval, loan_payments, savings_withdrawals, override_requests }.
 * Returns {} until loaded, and stays {} if the request fails, so a hiccup just
 * means no badges, never a broken sidebar.
 */
export function useBookkeeperPendingCounts(enabled) {
  const { data } = useQuery({
    queryKey: ["sidebar-badges", "bookkeeper"],
    enabled: Boolean(enabled),
    // Every staff page mounts its own sidebar; don't refetch on each navigation.
    // Realtime changes and window focus still refresh it.
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/pending-counts`, {
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
