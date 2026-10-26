// Universal in-memory cache for fast tab navigation across the SPA.
// Lives in browser memory during the session; automatically wiped on sign-out.

const memoryStore = new Map();

/**
 * Get current cached data if it exists and has not expired.
 * Synchronous check for instant initial state.
 */
export function getCached(key) {
  const cached = memoryStore.get(key);
  if (cached && cached.expiresAt > Date.now() && cached.data !== undefined) {
    return cached.data;
  }
  return null;
}

/**
 * Fetch with in-memory caching and inflight request deduplication.
 * @param {string} key - Unique key for the query (e.g., 'bookkeeper_reports_summary').
 * @param {Function} fetcher - Async function returning data.
 * @param {number} ttlMs - Time to live in ms (default 2 minutes).
 */
export async function cachedFetch(key, fetcher, ttlMs = 120_000) {
  const now = Date.now();
  const cached = memoryStore.get(key);

  // Return cached result immediately if valid
  if (cached && cached.expiresAt > now && cached.data !== undefined) {
    return cached.data;
  }

  // Deduplicate inflight promises
  if (cached && cached.inflight) {
    return cached.inflight;
  }

  const inflight = (async () => {
    try {
      const data = await fetcher();
      memoryStore.set(key, { data, expiresAt: Date.now() + ttlMs, inflight: null });
      return data;
    } catch (err) {
      memoryStore.delete(key);
      throw err;
    }
  })();

  memoryStore.set(key, { ...(cached || {}), inflight });
  return inflight;
}

/**
 * Invalidate a specific cache key or keys starting with a prefix.
 */
export function invalidateCache(keyOrPrefix) {
  if (!keyOrPrefix) return;
  for (const k of memoryStore.keys()) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) {
      memoryStore.delete(k);
    }
  }
}

/**
 * Completely wipe all in-memory caches on sign-out.
 */
export function clearPageCache() {
  memoryStore.clear();
}
