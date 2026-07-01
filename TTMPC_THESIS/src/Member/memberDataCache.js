// In-memory cache for Member portal data.
// Survives navigation between sidebar tabs (module lives for the lifetime of the SPA)
// but clears on full page reload or sign-out — matching Supabase session lifetime.

const store = new Map();

// Fires a fetcher exactly once per key while a request is inflight; concurrent
// callers await the same promise. On success, result is cached with a TTL.
export function getOrFetch(key, fetcher, ttlMs = 60_000) {
  const entry = store.get(key);
  const now = Date.now();

  if (entry && entry.expiresAt > now && entry.value !== undefined) {
    return Promise.resolve(entry.value);
  }

  if (entry && entry.inflight) {
    return entry.inflight;
  }

  const inflight = (async () => {
    const value = await fetcher();
    store.set(key, { value, expiresAt: Date.now() + ttlMs, inflight: null });
    return value;
  })().catch((err) => {
    store.delete(key);
    throw err;
  });

  store.set(key, { ...(entry || {}), inflight });
  return inflight;
}

// Read a cached value synchronously; returns undefined if missing or expired.
export function peek(key) {
  const entry = store.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return undefined;
  return entry.value;
}

// Invalidate a single key or clear everything (used after mutations / sign-out).
export function invalidate(key) {
  store.delete(key);
}

export function clearAll() {
  store.clear();
}
