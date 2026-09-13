// Session-lifetime cache for GET /api/account/security-status, the onboarding
// gate that MemberOnboardingGuard consults on every member-portal navigation.
//
// Cached so tab-to-tab navigation doesn't blank the screen while re-fetching.
// Keyed by access token, so a re-login invalidates it on its own.
//
// This lives in its own module rather than inside the guard component because
// exporting non-component values from a component file breaks React Fast
// Refresh (react-refresh/only-export-components).

const STATUS_TTL_MS = 60_000;

let cached = null; // { token, body, fetchedAt }

/** Cached status for this token, or null when absent/stale. */
export function readCachedStatus(token) {
  if (!token || !cached || cached.token !== token) return null;
  if (Date.now() - cached.fetchedAt >= STATUS_TTL_MS) return null;
  return cached.body;
}

export function writeCachedStatus(token, body) {
  cached = { token, body, fetchedAt: Date.now() };
}

/** True when a status has been cached at least once this session. */
export function hasCachedStatus() {
  return cached !== null;
}

// Call after finishing an onboarding step (email / password / profile) so the
// next guard pass re-reads the real status instead of serving a cached one and
// leaving the member stuck on the step they just completed.
export function invalidateSecurityStatus() {
  cached = null;
}
