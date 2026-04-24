import { supabase } from '../supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
let backendComputeAvailable = true;

const TWOPLACES = 2;

const money = (value) => {
  const amount = Number(value || 0);
  return Math.round(amount * 100) / 100;
};

const addMonths = (baseDate, monthsToAdd) => {
  const source = baseDate ? new Date(baseDate) : new Date();
  const date = Number.isNaN(source.getTime()) ? new Date() : source;
  const year = date.getFullYear();
  const monthIndex = date.getMonth() + monthsToAdd;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const day = Math.min(date.getDate(), new Date(targetYear, targetMonth + 1, 0).getDate());
  return new Date(targetYear, targetMonth, day);
};

const toIsoDate = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
  return date.toISOString().split('T')[0];
};

const normalizeRatePercent = (rate, row, fallbackCode = '') => {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const rowCode = String(row?.code || '').trim().toUpperCase();
  const effectiveCode = rowCode || String(fallbackCode || '').trim().toUpperCase();

  // Backward compatibility for consolidated decimal monthly format (e.g., 0.083).
  if (effectiveCode === 'CONSOLIDATED' && rate > 0 && rate < 1) {
    return rate * 100;
  }

  return rate;
};

const extractInterestRate = (row, fallbackCode = '') => {
  const rate = Number(row?.interest_rate ?? row?.InterestRate ?? row?.interestrate ?? row?.interestRate);
  const normalized = normalizeRatePercent(rate, row, fallbackCode);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
};

const resolveLoanTypeInterestRate = async (loanTypeCode, loanTypeName) => {
  const code = String(loanTypeCode || '').trim().toUpperCase();
  const name = String(loanTypeName || '').trim();

  const tryQuery = async (builder) => {
    const { data, error } = await builder;
    if (error) return null;
    return extractInterestRate(data, code);
  };

  if (code) {
    const byCode = await tryQuery(
      supabase
        .from('loan_types')
        .select('*')
        .eq('code', code)
        .limit(1)
        .maybeSingle()
    );
    if (byCode !== null) return byCode;
  }

  if (name) {
    const byName = await tryQuery(
      supabase
        .from('loan_types')
        .select('*')
        .ilike('name', `%${name}%`)
        .limit(1)
        .maybeSingle()
    );
    if (byName !== null) return byName;
  }

  return null;
};

const buildMonthlyBreakdown = (loanType, principal, termMonths, monthlyRate, firstDueDate) => {
  const breakdown = [];
  const dueDate = firstDueDate || new Date();
  const monthlyPrincipal = money(principal / termMonths);

  if (loanType === 'emergency') {
    for (let installmentNo = 1; installmentNo <= termMonths; installmentNo += 1) {
      const interestComponent = money((principal / termMonths) * monthlyRate * (termMonths - installmentNo));
      breakdown.push({
        installment_no: installmentNo,
        due_date: addMonths(dueDate, installmentNo - 1).toISOString().split('T')[0],
        expected_amount: money(monthlyPrincipal + interestComponent),
        principal_component: monthlyPrincipal,
        interest_component: interestComponent,
        schedule_status: 'Pending',
      });
    }
    return breakdown;
  }

  const monthlyInterest = money(principal * monthlyRate);
  const monthlyAmortization = money(monthlyPrincipal + monthlyInterest);

  for (let installmentNo = 1; installmentNo <= termMonths; installmentNo += 1) {
    breakdown.push({
      installment_no: installmentNo,
      due_date: addMonths(dueDate, installmentNo - 1).toISOString().split('T')[0],
      expected_amount: monthlyAmortization,
      principal_component: monthlyPrincipal,
      interest_component: monthlyInterest,
      schedule_status: 'Pending',
    });
  }

  return breakdown;
};

const computeLoanLocally = async (payload) => {
  const loanType = String(payload?.loan_type || '').trim().toLowerCase();
  const principal = Number(payload?.principal || 0);
  const termMonths = Number(payload?.term_months || 0);
  const firstDueDate = payload?.first_due_date ? new Date(payload.first_due_date) : new Date();

  if (!loanType) {
    throw new Error('loan_type is required.');
  }
  if (!Number.isFinite(principal) || principal <= 0) {
    throw new Error('principal must be greater than zero.');
  }
  if (!Number.isFinite(termMonths) || termMonths <= 0) {
    throw new Error('term_months must be greater than zero.');
  }

  if (loanType === 'emergency') {
    if (principal > 20000) {
      throw new Error('Emergency loan amount cannot exceed 20,000.');
    }
    if (termMonths !== 6 && termMonths !== 12) {
      throw new Error('Emergency loan term must be 6 or 12 months only.');
    }
  }

  let loanTypeCode = loanType.toUpperCase();
  if (loanType === 'bonus') {
    loanTypeCode = String(payload?.member_category || '').trim().toLowerCase() === 'regular'
      ? 'BONUS'
      : 'NONMEMBER_BONUS';
  } else if (loanType === 'consolidated') {
    loanTypeCode = 'CONSOLIDATED';
  } else if (loanType === 'emergency') {
    loanTypeCode = 'EMERGENCY';
  }

  const interestRatePercent = await resolveLoanTypeInterestRate(loanTypeCode, loanType);
  if (interestRatePercent === null) {
    throw new Error(`Interest rate for ${loanTypeCode} is not configured in loan_types.`);
  }

  const monthlyRate = interestRatePercent / 100;
  let serviceFee = 0;
  let cbuDeduction = 0;
  let insuranceFee = 0;
  let notarialFee = 0;

  if (loanType === 'consolidated') {
    serviceFee = money((Math.floor((Math.trunc(principal) - 1) / 50000) + 1) * 100);
    insuranceFee = money((principal / 1000) * 1.35);
    cbuDeduction = money(principal * 0.02);
    notarialFee = 100;
  } else if (loanType === 'emergency') {
    serviceFee = 100;
    cbuDeduction = money(principal * 0.02);
  } else if (loanType === 'bonus') {
    serviceFee = 100;
  }

  const monthlyBreakdown = buildMonthlyBreakdown(loanType, principal, termMonths, monthlyRate, firstDueDate);
  const monthlyAmortization = monthlyBreakdown.length ? Number(monthlyBreakdown[0].expected_amount || 0) : 0;
  const totalInterest = money(monthlyBreakdown.reduce((sum, row) => sum + Number(row.interest_component || 0), 0));
  const totalDeductions = money(serviceFee + cbuDeduction + insuranceFee + notarialFee);
  const netProceeds = money(principal - totalDeductions);

  return {
    loan_type: loanType,
    principal: money(principal),
    term_months: termMonths,
    monthly_amortization: money(monthlyAmortization),
    total_interest: totalInterest,
    total_deductions: totalDeductions,
    net_proceeds: netProceeds,
    deductions: {
      service_fee: money(serviceFee),
      cbu_deduction: money(cbuDeduction),
      insurance_fee: money(insuranceFee),
      notarial_fee: money(notarialFee),
    },
    monthly_breakdown: monthlyBreakdown,
  };
};

export async function computeLoan(payload) {
  if (!backendComputeAvailable) {
    return await computeLoanLocally(payload);
  }

  try {
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
      backendComputeAvailable = false;
      try {
        return await computeLoanLocally(payload);
      } catch (_localErr) {
        // Preserve backend validation details when local fallback also fails.
        throw new Error(result?.detail || result?.message || 'Loan computation failed.');
      }
    }

    return result?.data || result;
  } catch (error) {
    backendComputeAvailable = false;
    if (String(error?.message || '').toLowerCase().includes('failed to fetch')) {
      return await computeLoanLocally(payload);
    }
    throw error;
  }
}

export function buildConsolidatedPayload(formData) {
  return {
    loan_type: "consolidated",
    principal: String(Number(formData.loan_amount_numeric || 0)),
    term_months: Number(formData.loan_term_months || 0),
    first_due_date: formData.payment_start_date || null,
  };
}

export function buildEmergencyPayload(formData) {
  return {
    loan_type: "emergency",
    principal: String(Number(formData.loan_amount_numeric || 0)),
    term_months: Number(formData.loan_term_months || 0),
    first_due_date: formData.payment_start_date || null,
  };
}

export function buildBonusPayload(formData, isRegularMember) {
  return {
    loan_type: "bonus",
    principal: String(Number(formData.loan_amount_numeric || 0)),
    term_months: Number(formData.loan_term_months || 0),
    member_category: isRegularMember ? "regular" : "non_member",
    first_due_date: formData.payment_start_date || null,
  };
}
