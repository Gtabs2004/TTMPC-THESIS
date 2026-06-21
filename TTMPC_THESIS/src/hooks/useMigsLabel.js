import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

/**
 * Fetches the latest MIGS classification snapshot for one member.
 *
 * Returns:
 *   - data:    { label, score, as_of, loan_multiplier, can_vote, breakdown }
 *              or null while loading / on error
 *   - status:  "idle" | "loading" | "ready" | "error" | "unscored"
 *   - error:   message string when status === "error"
 *   - refresh: refetch helper
 *
 * Pass either a member UUID or a membership_id (e.g., TTMPC-123).
 */
export const useMigsLabel = (memberKey) => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const fetchLabel = useCallback(async () => {
    if (!memberKey) {
      setData(null);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/migs/label/${encodeURIComponent(memberKey)}`
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || "Failed to load MIGS label.");
      }
      setData(result.data || null);
      setStatus(result.data?.label === "Unscored" ? "unscored" : "ready");
    } catch (err) {
      setError(err?.message || "Unable to fetch MIGS label.");
      setData(null);
      setStatus("error");
    }
  }, [memberKey]);

  useEffect(() => {
    fetchLabel();
  }, [fetchLabel]);

  return { data, status, error, refresh: fetchLabel };
};

/**
 * Tailwind class helper for a MIGS pill/chip.
 */
export const getMigsBadgeClasses = (label) => {
  const key = String(label || "").toLowerCase();
  if (key.startsWith("migs")) {
    return "bg-green-100 text-green-800 border border-green-300";
  }
  if (key === "non-migs" || key === "non_migs") {
    return "bg-red-100 text-red-800 border border-red-300";
  }
  return "bg-gray-100 text-gray-600 border border-gray-300";
};
