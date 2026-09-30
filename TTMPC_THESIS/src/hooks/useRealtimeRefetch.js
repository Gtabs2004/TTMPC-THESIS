import { useEffect, useRef, useState } from "react";
import { ALL_ENTITIES, onEntitiesChanged } from "../lib/realtimeSync";

/**
 * Re-run `refetch` whenever any of `entities` (Postgres table names, see RT
 * in lib/realtimeSync.js) changes anywhere in the system — for pages that
 * load with useEffect/useState rather than React Query. Bursts are already
 * coalesced by <RealtimeSync />.
 *
 *   useRealtimeRefetch(RT.VAULT, () => fetchData({ silent: true }));
 *
 * Pass a *silent* refetch: it fires while the user is looking at the page, so
 * it shouldn't flash skeletons, reset pagination, or wipe data on an error.
 */
export const useRealtimeRefetch = (entities, refetch) => {
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  });

  const entitiesKey = [...new Set(entities)].sort().join(",");

  useEffect(() => {
    const wanted = new Set(entitiesKey.split(",").filter(Boolean));
    if (wanted.size === 0) return undefined;
    return onEntitiesChanged((changed) => {
      const hit =
        changed === ALL_ENTITIES || [...wanted].some((e) => changed.has(e));
      if (hit) refetchRef.current?.();
    });
  }, [entitiesKey]);
};

/**
 * For pages whose loader lives *inside* a useEffect: returns a counter that
 * bumps on every relevant change. Add it to that effect's deps and tell the
 * loader it's a background run so it skips the spinner:
 *
 *   const rtVersion = useRealtimeVersion(RT.LOANS);
 *   const rtSeen = useRef(rtVersion);
 *   useEffect(() => {
 *     const silent = rtSeen.current !== rtVersion;
 *     rtSeen.current = rtVersion;
 *     ...
 *   }, [..., rtVersion]);
 */
export const useRealtimeVersion = (entities) => {
  const [version, setVersion] = useState(0);
  useRealtimeRefetch(entities, () => setVersion((v) => v + 1));
  return version;
};
