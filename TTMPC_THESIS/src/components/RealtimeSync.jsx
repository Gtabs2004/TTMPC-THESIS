import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabaseClient";
import { UserAuth } from "../contex/AuthContext";
import {
  ALL_ENTITIES,
  REALTIME_EVENT,
  REALTIME_TOPIC,
  emitEntitiesChanged,
  queryMatchesEntities,
} from "../lib/realtimeSync";

// One cashier action writes several tables in quick succession (payment row,
// schedule, audit_log, loan_notifications, ...). Wait for the burst to settle
// so the screen refetches once, but never hold a batch longer than MAX_WAIT_MS.
const QUIET_MS = 300;
const MAX_WAIT_MS = 1500;

/**
 * Global realtime listener — renders nothing. Mounted once in main.jsx inside
 * the auth + query providers. While someone is signed in it keeps a single
 * private channel open on "db-changes" and, for every coalesced batch of
 * changed tables, invalidates the matching React Query caches and notifies
 * useRealtimeRefetch() subscribers. See src/lib/realtimeSync.js.
 */
const RealtimeSync = () => {
  const { session } = UserAuth();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return undefined;

    let cancelled = false;
    let channel = null;
    let hasConnected = false;
    let pending = new Set();
    let quietTimer = null;
    let maxWaitTimer = null;

    const dispatch = (changed) => {
      queryClient.invalidateQueries({ predicate: (q) => queryMatchesEntities(q, changed) });
      emitEntitiesChanged(changed);
    };

    const flush = () => {
      clearTimeout(quietTimer);
      clearTimeout(maxWaitTimer);
      quietTimer = null;
      maxWaitTimer = null;
      if (cancelled || pending.size === 0) return;
      const changed = pending;
      pending = new Set();
      dispatch(changed);
    };

    const onMutation = ({ payload }) => {
      const entity = payload?.entity;
      if (!entity) return;
      pending.add(entity);
      clearTimeout(quietTimer);
      quietTimer = setTimeout(flush, QUIET_MS);
      if (!maxWaitTimer) maxWaitTimer = setTimeout(flush, MAX_WAIT_MS);
    };

    const start = async () => {
      try {
        // Private channels are authorised with the user's JWT.
        await supabase.realtime.setAuth();
        // StrictMode / fast re-login can leave the previous mount's channel
        // mid-teardown; supabase.channel() would hand that one back.
        const stale = supabase
          .getChannels()
          .filter((c) => c.topic === `realtime:${REALTIME_TOPIC}`);
        await Promise.all(stale.map((c) => supabase.removeChannel(c)));
        if (cancelled) return;

        channel = supabase
          .channel(REALTIME_TOPIC, { config: { private: true } })
          .on("broadcast", { event: REALTIME_EVENT }, onMutation)
          .subscribe((status) => {
            if (status !== "SUBSCRIBED" || cancelled) return;
            // After a reconnect, events sent while we were offline are gone —
            // refresh everything that's bound to realtime once.
            if (hasConnected) dispatch(ALL_ENTITIES);
            hasConnected = true;
          });
      } catch {
        // Realtime is best-effort: pages still load and refetch on focus.
      }
    };

    start();

    return () => {
      cancelled = true;
      clearTimeout(quietTimer);
      clearTimeout(maxWaitTimer);
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
      }
    };
  }, [userId, queryClient]);

  return null;
};

export default RealtimeSync;
