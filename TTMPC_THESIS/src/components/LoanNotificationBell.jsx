import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Inbox, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { supabase } from "../supabaseClient";
import { UserAuth } from "../contex/AuthContext";
import { resolveMemberContextFromSessionUser } from "../utils/sessionIdentity";

// Generalized loan-workflow notification bell.
//
// Reads from the `loan_notifications` table (created by
// loan_notifications_schema.sql), filtered by `role`. Polls every 30s and
// subscribes to realtime INSERTs for instant updates. Clicking an item marks
// it read and navigates to `redirect_url`.
//
// The bell never crashes the page if Supabase or the table is unavailable —
// it falls back to an empty inbox.

const POLL_MS = 30_000;
const FETCH_LIMIT = 25;

const SEVERITY_STYLES = {
  success: { ring: "bg-emerald-50", icon: CheckCircle2, iconClass: "text-emerald-600", dot: "bg-emerald-500" },
  warning: { ring: "bg-amber-50", icon: AlertTriangle, iconClass: "text-amber-600", dot: "bg-amber-500" },
  danger:  { ring: "bg-rose-50", icon: XCircle, iconClass: "text-rose-600", dot: "bg-rose-500" },
  info:    { ring: "bg-sky-50", icon: Info, iconClass: "text-sky-600", dot: "bg-sky-500" },
};

const formatRelative = (iso) => {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const LoanNotificationBell = ({
  role,
  memberId,
  // When true on a staff bell (role = manager/treasurer/bookkeeper), also
  // include the signed-in user's personal member-side loan notifications.
  // Staff are themselves cooperative members, so they should still see updates
  // on their own loan applications from within the staff portal.
  includeMemberFeed = true,
  accentClass = "bg-[#2C7A3F]",
}) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [resolvedMemberId, setResolvedMemberId] = useState("");
  const wrapperRef = useRef(null);
  const { session } = UserAuth() || {};
  const normalizedRole = useMemo(() => String(role || "").trim().toLowerCase(), [role]);
  const explicitMemberId = useMemo(() => String(memberId || "").trim(), [memberId]);
  const normalizedMemberId = explicitMemberId || resolvedMemberId;
  const isMemberMode = normalizedRole === "member" && !!normalizedMemberId;
  // Staff bells optionally merge the user's own member feed (when memberId is known).
  const mergeMemberFeed = !isMemberMode
    && includeMemberFeed
    && normalizedRole !== ""
    && !!normalizedMemberId;

  // Always try to resolve the current session's memberId. For staff portals
  // this enables the merged-feed mode; for the member portal it's the primary
  // filter. Resolution mirrors the pattern in Member_*.jsx pages.
  useEffect(() => {
    let active = true;
    if (explicitMemberId) {
      setResolvedMemberId("");
      return undefined;
    }
    const run = async () => {
      try {
        const sessionUser = session?.user;
        if (!sessionUser) return;
        const { account } = await resolveMemberContextFromSessionUser(sessionUser);
        const mid = String(account?.user_id || sessionUser.id || "").trim();
        if (active) setResolvedMemberId(mid);
      } catch (_err) {
        // Silent — bell will just show empty inbox if member can't be resolved.
      }
    };
    run();
    return () => { active = false; };
  }, [explicitMemberId, session?.user?.id]);

  const fetchNotifications = useCallback(async () => {
    if (!normalizedRole) return;
    if (normalizedRole === "member" && !normalizedMemberId) return;
    try {
      let query = supabase
        .from("loan_notifications")
        .select("id, title, message, notification_type, severity, loan_id, redirect_url, recipient_role, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);
      if (isMemberMode) {
        query = query.eq("recipient_role", "member").eq("recipient_member_id", normalizedMemberId);
      } else if (mergeMemberFeed) {
        // Staff role queue PLUS this user's personal member feed.
        // PostgREST OR syntax: comma-separated filters inside or().
        query = query.or(
          `recipient_role.eq.${normalizedRole},and(recipient_role.eq.member,recipient_member_id.eq.${normalizedMemberId})`
        );
      } else {
        query = query.eq("recipient_role", normalizedRole);
      }
      const { data, error } = await query;
      if (error) {
        // Table may not be migrated yet — fail silently.
        return;
      }
      setItems(data || []);
    } catch (_err) {
      // Network errors should not break the topbar.
    }
  }, [normalizedRole, normalizedMemberId, isMemberMode, mergeMemberFeed]);

  useEffect(() => {
    fetchNotifications();
    if (!normalizedRole) return undefined;
    if (normalizedRole === "member" && !normalizedMemberId) return undefined;
    const interval = setInterval(fetchNotifications, POLL_MS);
    // Realtime: subscribe to two channels in merged mode (role feed + own member feed).
    const channels = [];
    try {
      const subscribe = (channelName, filter) => {
        const ch = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "loan_notifications", filter },
            () => fetchNotifications()
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "loan_notifications", filter },
            () => fetchNotifications()
          )
          .subscribe();
        channels.push(ch);
      };

      if (isMemberMode) {
        subscribe(
          `loan_notifications_member_${normalizedMemberId}`,
          `recipient_member_id=eq.${normalizedMemberId}`
        );
      } else {
        subscribe(`loan_notifications_${normalizedRole}`, `recipient_role=eq.${normalizedRole}`);
        if (mergeMemberFeed) {
          subscribe(
            `loan_notifications_self_${normalizedMemberId}`,
            `recipient_member_id=eq.${normalizedMemberId}`
          );
        }
      }
    } catch (_err) {
      // Realtime is best-effort.
    }
    return () => {
      clearInterval(interval);
      for (const ch of channels) {
        try { supabase.removeChannel(ch); } catch (_err) { /* ignore */ }
      }
    };
  }, [normalizedRole, normalizedMemberId, isMemberMode, mergeMemberFeed, fetchNotifications]);

  useEffect(() => {
    const onClick = (e) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unreadCount = useMemo(() => items.filter((it) => !it.is_read).length, [items]);

  const markRead = useCallback(async (id) => {
    if (!id) return;
    try {
      await supabase
        .from("loan_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id);
    } catch (_err) {
      // Optimistic UI already updated; ignore.
    }
  }, []);

  const handleSelect = useCallback((item) => {
    setOpen(false);
    // Optimistic UI update.
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, is_read: true } : it)));
    if (!item.is_read) markRead(item.id);
    if (item.redirect_url) navigate(item.redirect_url);
  }, [markRead, navigate]);
  // Note: a member-row from a staff bell already has redirect_url='/member-loans'
  // (set server-side by _redirect_url), so it routes to the correct portal automatically.

  const handleMarkAllRead = useCallback(async () => {
    const unreadIds = items.filter((it) => !it.is_read).map((it) => it.id);
    if (!unreadIds.length) return;
    setItems((prev) => prev.map((it) => ({ ...it, is_read: true })));
    try {
      await supabase
        .from("loan_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in("id", unreadIds);
    } catch (_err) { /* ignore */ }
  }, [items]);

  return (
    <div ref={wrapperRef} className="relative ml-6">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Loan notifications"
        className="relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-gray-800">Loan Workflow</h4>
              <p className="text-xs text-gray-500 capitalize">
                {isMemberMode
                  ? "Your loan updates"
                  : mergeMemberFeed
                    ? `${normalizedRole} queue + your loans`
                    : `${normalizedRole || "Inbox"} notifications`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[11px] font-semibold text-gray-500 hover:text-gray-800"
                >
                  Mark all read
                </button>
              )}
              <span className={`text-[10px] font-bold text-white ${accentClass} px-2 py-0.5 rounded-full`}>
                {items.length}
              </span>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
                <Inbox className="w-6 h-6" />
                You're all caught up.
              </div>
            ) : (
              items.map((item) => {
                const style = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.info;
                const Icon = style.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex gap-3 items-start ${!item.is_read ? "bg-gray-50/60" : ""}`}
                  >
                    <div className={`w-8 h-8 rounded-full ${style.ring} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${style.iconClass}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800 truncate flex-1">{item.title}</p>
                        {mergeMemberFeed && item.recipient_role === "member" && (
                          <span className="text-[9px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">You</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 leading-snug mt-0.5 line-clamp-2">{item.message}</p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {item.loan_id ? <span className="font-mono mr-2">#{item.loan_id}</span> : null}
                        {formatRelative(item.created_at)}
                      </p>
                    </div>
                    {!item.is_read && <span className={`mt-1 w-2 h-2 rounded-full ${style.dot} flex-shrink-0`} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanNotificationBell;
