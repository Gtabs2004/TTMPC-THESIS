import { QueryClient } from "@tanstack/react-query";

/**
 * App-wide TanStack Query client. Pages that fetch through useQuery keep
 * their last result cached by query key, so navigating back to a page renders
 * the last-known data instantly and refreshes it in the background
 * (stale-while-revalidate) instead of blank -> wait -> render on every mount.
 *
 * - staleTime 0: every mount still revalidates, so a figure never lags behind
 *   a transaction just recorded on another page — the cache only removes the
 *   blank flash, it doesn't skip the fetch. Same request count as before.
 * - gcTime 10min: an unused page's data is dropped after 10 minutes.
 * - retry 1: one retry on failure, then surface the error.
 *
 * The cache is cleared on sign-out (see AuthContext) so a different user or
 * role in the same tab never sees the previous session's data.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh in memory for 2 minutes. Navigating back to a page
      // renders instantly without showing any loading spinner.
      staleTime: 2 * 60_000,
      gcTime: 15 * 60_000,
      retry: 1,
      // Avoid jarring screen refetches when switching browser tabs during the defense.
      refetchOnWindowFocus: false,
    },
  },
});
