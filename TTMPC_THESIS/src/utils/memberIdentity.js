import { supabase } from "../supabaseClient";
import { resolveMemberContextFromSessionUser } from "./sessionIdentity";
import { loadMemberAvatarSignedUrl } from "./memberAvatar";

const CACHE_KEY = "_member_login_bundle_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Reads member identity from sessionStorage cache (populated by AuthContext at login).
 * Falls back to DB queries only on cache miss or expiry.
 *
 * Returns: { memberId, fullName, avatarUrl, memberRow, account }
 */
export async function resolveMemberIdentity() {
  // Fast path: sessionStorage cache written by AuthContext on login
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { bundle, timestamp } = JSON.parse(cached);
      const isFresh = Date.now() - timestamp < CACHE_TTL;
      if (isFresh && bundle?.account?.user_id) {
        const m = bundle.member || {};
        const fullName = [m.first_name, m.middle_name, m.surname]
          .filter(Boolean).join(" ").trim();
        return {
          memberId: bundle.account.user_id,
          fullName: fullName || "Member",
          avatarUrl: bundle.avatar_url || "",
          memberRow: bundle.member || null,
          account: bundle.account || null,
        };
      }
    }
  } catch (_) {
    // corrupt cache — fall through to slow path
  }

  // Slow path: cache miss
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const sessionUser = authData?.user;
  if (!sessionUser?.id) throw new Error("Not authenticated");

  const { account, member: memberRow } = await resolveMemberContextFromSessionUser(sessionUser);
  const memberId = account?.user_id || sessionUser.id;
  const fullName = [memberRow?.first_name, memberRow?.middle_name, memberRow?.surname]
    .filter(Boolean).join(" ").trim();
  const avatarUrl = await loadMemberAvatarSignedUrl(supabase, sessionUser.id);

  return {
    memberId,
    fullName: fullName || "Member",
    avatarUrl: avatarUrl || "",
    memberRow: memberRow || null,
    account: account || null,
  };
}
