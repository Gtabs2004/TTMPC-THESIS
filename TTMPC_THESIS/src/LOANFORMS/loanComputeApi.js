const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export async function computeLoan(payload) {
  const response = await fetch(`${API_BASE_URL}/api/loans/compute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.detail || result?.message || "Loan computation failed.");
  }

  return result?.data || result;
}

export function buildConsolidatedPayload(formData) {
  return {
    loan_type: "consolidated",
    principal: Number(formData.loan_amount_numeric || 0),
    term_months: Number(formData.loan_term_months || 0),
    first_due_date: formData.payment_start_date || undefined,
  };
}

export function buildEmergencyPayload(formData) {
  return {
    loan_type: "emergency",
    principal: Number(formData.loan_amount_numeric || 0),
    term_months: Number(formData.loan_term_months || 0),
    first_due_date: formData.payment_start_date || undefined,
  };
}

export function buildBonusPayload(formData, isRegularMember) {
  return {
    loan_type: "bonus",
    principal: Number(formData.loan_amount_numeric || 0),
    term_months: Number(formData.loan_term_months || 0),
    member_category: isRegularMember ? "regular" : "non_member",
    first_due_date: formData.payment_start_date || undefined,
  };
}
