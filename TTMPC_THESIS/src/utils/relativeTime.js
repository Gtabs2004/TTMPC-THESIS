// Shared "time ago" formatting for notification feeds (LoanNotificationBell,
// NotificationBell, and any dashboard activity list) — the single place this
// logic lives, instead of three near-identical copies that had already begun
// to drift (different wording: "5m ago" vs "5 mins ago").
//
// Why a newly-submitted item used to read "8 hours ago": a DB timestamp
// column stored as `timestamp without time zone` loses its "Z"/offset on the
// way back through PostgREST, even though the app always writes a proper UTC
// value (`new Date().toISOString()`). `new Date("2026-09-19T10:00:00")` (no
// timezone marker) is parsed by the JS spec as LOCAL time, not UTC — for a
// Philippines browser (UTC+8) that silently shifts the timestamp 8 hours into
// the past. toDateSafe() restores the correct UTC interpretation regardless
// of whether the value comes back with or without an explicit timezone.

const HAS_TIMEZONE_RE = /Z$|[+-]\d{2}:?\d{2}$/i;

/** Parses a DB timestamp (string, Date, or null) into a correct UTC Date. */
export function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = HAS_TIMEZONE_RE.test(raw) ? raw : `${raw.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * "Just now" / "5 minutes ago" / "1 hour ago" / "3 days ago", falling back to
 * a calendar date once it's a week or older.
 */
export function formatRelativeTime(value) {
  const date = toDateSafe(value);
  if (!date) return "";

  // Clamped to 0: a few seconds of clock skew between the server and this
  // browser can otherwise put a just-submitted row a moment in the "future".
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "Just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
