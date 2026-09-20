import { authHeaders } from "./authHeaders";
import { apiErrorMessage } from "./apiError";

// Client for the 6-Month Loan Rule Override endpoints (see the "6-Month
// Renewal Rule Override" section of src/server/main.py). Every call carries
// the session's bearer token: the backend takes the caller's identity from the
// verified JWT, never from the request body.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export const OVERRIDE_REASON_MIN = 20;
export const OVERRIDE_REASON_MAX = 1000;

const errorMessage = (payload, response) =>
  apiErrorMessage(payload, `Request failed (${response.status}).`);

async function request(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json", ...(await authHeaders()) };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) {
    throw new Error(errorMessage(payload, response));
  }
  return payload;
}

// ---- Member ---------------------------------------------------------------

export const fetchMyOverrideRequests = async () =>
  (await request("/api/member/renewal-override-requests")).data || [];

export const createOverrideRequest = async (loanType, reason) =>
  (await request("/api/member/renewal-override-requests", {
    method: "POST",
    body: { loan_type: loanType, reason },
  })).data;

export const cancelOverrideRequest = async (requestId) =>
  request(`/api/member/renewal-override-requests/${encodeURIComponent(requestId)}/cancel`, {
    method: "POST",
  });

// Approved, unexpired, unused overrides that still apply to the member's
// current active loan. Callers treat a failure as "no override".
export const fetchActiveOverrides = async () =>
  (await request("/api/member/renewal-overrides/active")).data || [];

// Marks the member's approved override as spent on a submitted renewal.
export const consumeOverride = async (loanType, applicationControlNumber) =>
  request("/api/member/renewal-overrides/consume", {
    method: "POST",
    body: {
      loan_type: String(loanType || "").toLowerCase(),
      application_control_number: applicationControlNumber,
    },
  });

// ---- Bookkeeper -----------------------------------------------------------

export const fetchBookkeeperOverrideRequests = async (status = "pending") =>
  request(`/api/bookkeeper/renewal-override-requests?status=${encodeURIComponent(status)}`);

export const reviewOverrideRequest = async (requestId, action, note) =>
  (await request(`/api/bookkeeper/renewal-override-requests/${encodeURIComponent(requestId)}/review`, {
    method: "POST",
    body: { action, note: note || null },
  })).data;
