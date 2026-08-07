import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * Fetches the latest MIGS classification snapshot for one member.
 *
 * Queries Supabase directly (no Railway/FastAPI dependency) so it works
 * even when the backend is cold/sleeping on the free tier. The score is
 * read from member_classification_temporal — the same snapshot table the
 * old /api/migs/label endpoint used.
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
      const key = String(memberKey).trim();
      const isUuid = key.length === 36 && (key.match(/-/g) || []).length === 4;
      const lookupField = isUuid ? "id" : "membership_id";

      const { data: memberRows, error: memberErr } = await supabase
        .from("member")
        .select("id,membership_id")
        .eq(lookupField, key)
        .limit(1);
      if (memberErr) throw memberErr;
      const member = memberRows?.[0];
      if (!member) throw new Error("Member not found.");

      const { data: snapRows, error: snapErr } = await supabase
        .from("member_classification_temporal")
        .select(
          "accrual_date,total_score,final_status,classification_level_id,cbu_points,loan_points,savings_points,payment_points,grocery_points,pli_points,attendance_points"
        )
        .eq("membership_number_id", member.id)
        .order("accrual_date", { ascending: false })
        .limit(1);
      if (snapErr) throw snapErr;
      const snapshot = snapRows?.[0];

      if (!snapshot) {
        setData({
          member_id: member.id,
          membership_id: member.membership_id,
          label: "Unscored",
          score: null,
          as_of: null,
          loan_multiplier: 3.0,
          can_vote: false,
        });
        setStatus("unscored");
        return;
      }

      // final_status is only set on first-week snapshots. Fall back to the
      // classification_level table for mid-month snapshots.
      let label = snapshot.final_status;
      if (!label && snapshot.classification_level_id) {
        const { data: lvlRows } = await supabase
          .from("classification_level")
          .select("label")
          .eq("classification_level_id", snapshot.classification_level_id)
          .limit(1);
        label = lvlRows?.[0]?.label || null;
      }

      const isMigs = String(label || "").toLowerCase().startsWith("migs");
      const payload = {
        member_id: member.id,
        membership_id: member.membership_id,
        label,
        score: snapshot.total_score,
        as_of: snapshot.accrual_date,
        loan_multiplier: isMigs ? 5.0 : 3.0,
        can_vote: isMigs,
        breakdown: {
          cbu: snapshot.cbu_points,
          loan: snapshot.loan_points,
          savings: snapshot.savings_points,
          payment: snapshot.payment_points,
          grocery: snapshot.grocery_points,
          pli: snapshot.pli_points,
          attendance: snapshot.attendance_points,
        },
      };
      setData(payload);
      setStatus(label === "Unscored" || !label ? "unscored" : "ready");
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
