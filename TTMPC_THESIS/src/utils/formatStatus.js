// Shared raw-status-to-display-text formatter (Simulation findings #29b).
// Several screens were printing stored status values as-is (snake_case,
// lowercase, "validated" instead of "Confirmed") instead of word-casing
// them for a reader. This replaces those ad-hoc copies.
export function formatStatus(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  if (lower === "validated") return "Confirmed";
  return lower
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
