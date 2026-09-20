import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { fetchActiveOverrides } from "../utils/renewalOverrides";

const VALID_SIM_STATES = new Set(["clean", "active_recent", "active_renewable"]);
const VALID_LOAN_TYPES = new Set(["consolidated", "bonus", "emergency"]);
const RENEWAL_MIN_PAYMENTS = 6;
const BONUS_APPLICATION_MONTHS = new Set([5, 11]);

const readSimulationState = (allowSimulation) => {
  if (typeof window === "undefined") return null;
  const isProd = import.meta.env.MODE === "production";
  if (isProd && !allowSimulation) return null;
  const params = new URLSearchParams(window.location.search);
  const raw = String(params.get("sim") || "").trim().toLowerCase();
  return VALID_SIM_STATES.has(raw) ? raw : null;
};

const buildCleanBucket = (loanType, simulated = false) => ({
  loan_type: loanType,
  can_apply_new: true,
  can_renew: false,
  reason: (simulated ? "SIMULATION: " : "") + `No active ${loanType} loan on record.`,
  active_loan_id: null,
  payments_made: 0,
  simulation_active: simulated,
});

const buildBlockedBucket = (loanType, paymentsMade, activeId, simulated = false) => {
  const canRenew = paymentsMade >= RENEWAL_MIN_PAYMENTS;
  return {
    loan_type: loanType,
    can_apply_new: false,
    can_renew: canRenew,
    reason: (simulated ? "SIMULATION: " : "") +
      `Active ${loanType} loan ${activeId || ""} in repayment. ` +
      (canRenew
        ? "Eligible for renewal."
        : `Needs ${RENEWAL_MIN_PAYMENTS - paymentsMade} more monthly payment(s) before renewal.`),
    active_loan_id: activeId,
    payments_made: paymentsMade,
    simulation_active: simulated,
  };
};

const fabricateEligibility = (simState, loanType) => {
  const build = (lt) => {
    if (simState === "clean") return buildCleanBucket(lt, true);
    if (simState === "active_recent") return buildBlockedBucket(lt, 2, `SIM-${lt.toUpperCase()}-RECENT`, true);
    if (simState === "active_renewable") return buildBlockedBucket(lt, 6, `SIM-${lt.toUpperCase()}-RENEWABLE`, true);
    return null;
  };
  if (loanType) return build(loanType);
  const per_type = {};
  for (const lt of ["consolidated", "bonus", "emergency"]) {
    const b = build(lt);
    if (!b) return null;
    per_type[lt] = b;
  }
  return { per_type, simulation_active: true };
};

const formatOverrideDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
};

/**
 * Unlocks Renewal on any bucket the Bookkeeper has approved a 6-month-rule
 * override for. The RPC only knows about payment counts, so this layers the
 * override on top. The backend only returns overrides that are approved,
 * unexpired, unused and still tied to the member's current active loan.
 * Any failure leaves the RPC result untouched (i.e. the normal rule applies).
 */
const applyRenewalOverrides = async (result) => {
  const perType = result?.per_type;
  if (!perType) return result;

  // Skip the extra round-trip unless something is actually blocked by the rule.
  const blocked = Object.values(perType).some((b) => b && b.active_loan_id && !b.can_renew);
  if (!blocked) return result;

  let overrides = [];
  try {
    overrides = await fetchActiveOverrides();
  } catch {
    return result;
  }
  if (!overrides.length) return result;

  const next = { ...perType };
  for (const o of overrides) {
    const bucket = next[o.loan_type];
    if (!bucket || bucket.can_renew || bucket.active_loan_id !== o.loan_id) continue;
    const until = formatOverrideDate(o.expires_at);
    next[o.loan_type] = {
      ...bucket,
      can_renew: true,
      override_applied: true,
      override_request_id: o.id,
      override_expires_at: o.expires_at,
      reason:
        `Active ${o.loan_type} loan ${o.loan_id} in repayment. ` +
        `Early renewal approved by the Bookkeeper${until ? ` until ${until}` : ""}.`,
    };
  }
  return { ...result, per_type: next };
};

/**
 * Loan eligibility hook — calls Supabase RPC directly (no FastAPI round-trip).
 *
 * Two modes:
 *   useLoanEligibility(memberId)
 *     → data.per_type = { consolidated:{...}, bonus:{...}, emergency:{...} }
 *
 *   useLoanEligibility(memberId, { loanType: 'consolidated' })
 *     → data = single bucket { can_apply_new, can_renew, reason, ... }
 */
export const useLoanEligibility = (memberId, { allowSimulation = false, loanType = null } = {}) => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const normalizedType = loanType && VALID_LOAN_TYPES.has(String(loanType).toLowerCase())
    ? String(loanType).toLowerCase()
    : null;

  const fetchEligibility = useCallback(async () => {
    if (!memberId) {
      setData(null);
      setStatus("idle");
      return;
    }

    // Simulation shortcut (dev/QA only)
    const sim = readSimulationState(allowSimulation);
    if (sim) {
      const fabricated = fabricateEligibility(sim, normalizedType);
      if (fabricated) {
        setData(fabricated);
        setStatus("ready");
        return;
      }
    }

    setStatus("loading");
    setError(null);

    try {
      // Call the Postgres RPC directly — no FastAPI hop needed.
      // The function runs 2 queries inside Postgres and returns the same
      // JSON shape as the old FastAPI endpoint.
      const { data: result, error: rpcError } = await supabase.rpc(
        "get_loan_eligibility",
        { p_member_id: memberId }
      );

      if (rpcError) throw new Error(rpcError.message || "Failed to load loan eligibility.");

      const withOverrides = await applyRenewalOverrides(result);

      // If caller asked for a single loan type, extract just that bucket
      if (normalizedType) {
        const bucket = withOverrides?.per_type?.[normalizedType] ?? null;
        setData(bucket);
      } else {
        setData(withOverrides);
      }
      setStatus("ready");
    } catch (err) {
      setError(err.message || String(err));
      setStatus("error");
      setData(null);
    }
  }, [memberId, allowSimulation, normalizedType]);

  useEffect(() => {
    fetchEligibility();
  }, [fetchEligibility]);

  return { data, status, error, refresh: fetchEligibility };
};
