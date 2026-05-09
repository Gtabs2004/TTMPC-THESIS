import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, UserPlus, Inbox } from "lucide-react";
import { supabase } from "../../supabaseClient";

const STORAGE_KEY = "bod_notifications_last_seen";
const POLL_MS = 30_000;

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

const buildName = (row) => {
  const full = [row.first_name, row.middle_name, row.surname]
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .join(" ");
  return full || row.email || "New applicant";
};

const NotificationBell = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [lastSeen, setLastSeen] = useState(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });
  const wrapperRef = useRef(null);

  const fetchPending = async () => {
    const { data, error } = await supabase
      .from("member_applications")
      .select("application_id, first_name, middle_name, surname, email, application_status, created_at")
      .or("application_status.eq.pending,application_status.eq.Pending,application_status.eq.PENDING")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      console.error("NotificationBell fetch error:", error);
      return;
    }
    setItems(data || []);
  };

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, POLL_MS);

    const channel = supabase
      .channel("member_applications_notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "member_applications" },
        () => fetchPending()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "member_applications" },
        () => fetchPending()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unreadCount = useMemo(() => {
    if (!lastSeen) return items.length;
    const seenTime = new Date(lastSeen).getTime();
    return items.filter((it) => new Date(it.created_at).getTime() > seenTime).length;
  }, [items, lastSeen]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && items.length > 0) {
      const newest = items[0]?.created_at || new Date().toISOString();
      window.localStorage.setItem(STORAGE_KEY, newest);
      setLastSeen(newest);
    }
  };

  const handleSelect = (app) => {
    setOpen(false);
    navigate("/member-approvals");
  };

  const handleViewAll = () => {
    setOpen(false);
    navigate("/member-approvals");
  };

  return (
    <div ref={wrapperRef} className="relative ml-6">
      <button
        onClick={handleToggle}
        aria-label="Notifications"
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
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-gray-800">Notifications</h4>
              <p className="text-xs text-gray-500">Pending membership applications</p>
            </div>
            <span className="text-[10px] font-bold text-white bg-[#2C7A3F] px-2 py-0.5 rounded-full">
              {items.length}
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
                <Inbox className="w-6 h-6" />
                You're all caught up.
              </div>
            ) : (
              items.map((app) => {
                const isUnread = !lastSeen || new Date(app.created_at).getTime() > new Date(lastSeen).getTime();
                return (
                  <button
                    key={app.application_id}
                    onClick={() => handleSelect(app)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex gap-3 items-start ${isUnread ? "bg-green-50/40" : ""}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-[#EAF5EC] flex items-center justify-center flex-shrink-0">
                      <UserPlus className="w-4 h-4 text-[#2C7A3F]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {buildName(app)}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        Submitted a new membership application
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{formatRelative(app.created_at)}</p>
                    </div>
                    {isUnread && <span className="mt-1 w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <button
            onClick={handleViewAll}
            className="w-full px-4 py-3 text-center text-sm font-semibold text-[#2C7A3F] hover:bg-gray-50 border-t border-gray-100"
          >
            View all applications
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
