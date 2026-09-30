/**
 * Workspace-wide realtime sync — shared pieces.
 *
 * Every write to a public table broadcasts { type, entity, action, timestamp }
 * on the private Supabase Realtime topic "db-changes"
 * (src/server/realtime_sync_broadcast.sql). <RealtimeSync /> (mounted once in
 * main.jsx) holds the socket, coalesces bursts, and fans each batch of changed
 * table names out two ways:
 *
 *  1. React Query — invalidates the queries bound to those tables (see
 *     queryMatchesEntities). Only mounted queries actually refetch.
 *  2. This module's in-app bus — for the useEffect/useState pages, which hook
 *     in with useRealtimeRefetch(entities, refetch).
 *
 * Entity names are the Postgres table names (e.g. "loan_payments").
 */

export const REALTIME_TOPIC = "db-changes";
export const REALTIME_EVENT = "mutation";

// Tables grouped by domain, so pages subscribe by what they show rather than
// re-listing tables. Spread and combine: [...RT.LOANS, ...RT.MEMBERS].
// A page that lists a table it doesn't actually read just refetches a little
// more often; one that misses a table goes stale — so err toward the group.
export const RT = {
  LOANS: [
    "loans",
    "koica_loans",
    "loan_schedules",
    "loan_schedule_payments",
    "loan_payments",
    "loan_payments_legacy",
    "loan_payment_ledger",
    "loan_penalties",
    "loan_restructure_requests",
    "loan_renewal_override_requests",
    "loan_collateral",
    "co_makers",
    "disbursement",
    "disbursement_confirmations",
    "risk_assessments",
  ],
  SAVINGS: [
    "savings_accounts",
    "savings_ledger",
    "savings_transaction_queue",
    "Savings_Transactions",
    "ledger_transactions",
  ],
  CBU: ["capital_build_up", "cbu_payouts", "isc_postings", "isc_transactions"],
  MEMBERS: [
    "member",
    "member_account",
    "personal_data_sheet",
    "member_applications",
    "member_closures",
    "staff_termination_requests",
    "member_classification",
    "member_classification_temporal",
    "member_profile",
    "membership_payments",
    "secretary_membership_records",
  ],
  VAULT: ["vault_entries"],
  ATTENDANCE: ["attendance_logs", "general_assembly_attendance"],
  AUDIT: ["audit_log"],
};

// Sentinel batch meaning "we may have missed events, treat everything as
// changed" — sent after the socket reconnects.
export const ALL_ENTITIES = "*";

/**
 * Should a React Query cache entry refetch for this batch of changed tables?
 *
 * - `meta: { realtimeEntities: ["loan_payments", ...] }` binds a query to
 *   specific tables.
 * - `meta: { realtime: false }` opts a query out entirely.
 * - With no meta, every ["dashboard", ...] query refetches on any change:
 *   the role dashboards aggregate across most tables, and only the one
 *   dashboard on screen is mounted, so this costs one request per batch.
 *   Anything else (e.g. the ["demand-forecast", ...] model output) is left alone.
 */
export function queryMatchesEntities(query, changed) {
  const meta = query.meta || {};
  if (meta.realtime === false) return false;
  if (Array.isArray(meta.realtimeEntities)) {
    if (changed === ALL_ENTITIES) return true;
    return meta.realtimeEntities.some((e) => changed.has(e));
  }
  return query.queryKey?.[0] === "dashboard";
}

const listeners = new Set();

/** Subscribe to changed-table batches. Returns an unsubscribe function. */
export function onEntitiesChanged(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** @param {Set<string> | typeof ALL_ENTITIES} changed */
export function emitEntitiesChanged(changed) {
  for (const listener of listeners) {
    try {
      listener(changed);
    } catch {
      // One page's refetch error must not stop the others.
    }
  }
}
