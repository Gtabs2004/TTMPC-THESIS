import { authHeaders } from "./authHeaders";
import { apiErrorMessage } from "./apiError";

// Client for the profile change request endpoints (see the "Profile Change
// Requests" section of src/server/main.py). Every call carries the session's
// bearer token: the backend takes the caller's identity from the verified JWT,
// never from the request body.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Net take-home pay is the one field that needs a payslip. Keep in step with
// PROFILE_CHANGE_NET_PAY_FIELD / PROFILE_CHANGE_MAX_PAYSLIP_BYTES in main.py.
export const NET_PAY_FIELD = "salary";
export const PAYSLIP_MAX_BYTES = 5 * 1024 * 1024;
export const PAYSLIP_ACCEPT = "image/png,image/jpeg,application/pdf";

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
    throw new Error(apiErrorMessage(payload, `Request failed (${response.status}).`));
  }
  return payload;
}

export const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(file);
  });

// ---- Member ---------------------------------------------------------------

export const fetchMyProfileChangeRequests = async () =>
  (await request("/api/member/profile-change-requests")).data || [];

// changes: [{ field_key, new_value }]. payslip: a File (net pay only);
// payPeriod: "YYYY-MM". Resolves to { requests, applied_directly }.
export const submitProfileChanges = async ({ changes, payslip, payPeriod }) => {
  const body = { changes };
  if (payslip) {
    body.payslip = {
      filename: payslip.name || "payslip",
      content_type: payslip.type || "",
      data_base64: await readFileAsBase64(payslip),
    };
    body.pay_period = payPeriod || null;
  }
  return (await request("/api/member/profile-change-requests", { method: "POST", body })).data;
};

export const cancelProfileChangeRequest = async (requestId) =>
  request(`/api/member/profile-change-requests/${encodeURIComponent(requestId)}/cancel`, {
    method: "POST",
  });

// ---- Member + Bookkeeper --------------------------------------------------

// Short-lived signed link to a request's payslip: { url, content_type, expires_in }.
export const fetchPayslipUrl = async (requestId) =>
  (await request(`/api/profile-change-requests/${encodeURIComponent(requestId)}/payslip-url`)).data;

// ---- Bookkeeper -----------------------------------------------------------

export const fetchBookkeeperProfileChanges = async (status = "pending") =>
  request(`/api/bookkeeper/profile-change-requests?status=${encodeURIComponent(status)}`);

export const reviewProfileChange = async (requestId, action, note, acknowledgeOpenLoan = false) =>
  (await request(`/api/bookkeeper/profile-change-requests/${encodeURIComponent(requestId)}/review`, {
    method: "POST",
    body: { action, note: note || null, acknowledge_open_loan: acknowledgeOpenLoan },
  })).data;
