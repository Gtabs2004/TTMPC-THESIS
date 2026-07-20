import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const VALID_SIM_STATES = new Set(["clean", "active_recent", "active_renewable"]);
const VALID_LOAN_TYPES = new Set(["consolidated", "bonus", "emergency"]);

const readSimulationState = (allowSimulation) => {
  if (typeof window === "undefined") return null;
  const isProd = import.meta.env.MODE === "production";
  if (isProd && !allowSimulation) return null;

  const params = new URLSearchParams(window.location.search);
  const raw = String(params.get("sim") || "").trim().toLowerCase();
  return VALID_SIM_STATES.has(raw) ? raw : null;
};

/**
 * Loan eligibility hook.
 *
 * Two modes:
 *   - useLoanEligibility(memberId)                     → returns per-type map
 *       data.per_type = { consolidated:{...}, bonus:{...}, emergency:{...} }
 *   - useLoanEligibility(memberId, { loanType: 'consolidated' })  → returns single bucket
 *       data = { can_apply_new, can_renew, reason, active_loan_id, payments_made, simulation_active }
 *
 * Each bucket answers the question for that specific loan type. An active
 * Consolidated loan does NOT block Emergency or Bonus.
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
    setStatus("loading");
    setError(null);
    try {
      const sim = readSimulationState(allowSimulation);
      const url = new URL(`${API_BASE_URL}/api/loans/eligibility/${encodeURIComponent(memberId)}`);
      if (sim) url.searchParams.set("sim", sim);
      if (normalizedType) url.searchParams.set("loan_type", normalizedType);

      const response = await fetch(url.toString());
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.detail || "Failed to load loan eligibility.");
      }
      setData(result);
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
