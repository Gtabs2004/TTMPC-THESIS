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

// Returns the monthly interest rate in PERCENT (e.g., 0.83 for 0.83%/month).
// The caller is responsible for dividing by 100 to get a decimal.
const normalizeRatePercent = (rate) => {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return rate;
};

const extractInterestRate = (row) => {
  const rate = Number(row?.interest_rate ?? row?.InterestRate ?? row?.interestrate ?? row?.interestRate);
  const normalized = normalizeRatePercent(rate);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
};

// Fee policy fallbacks. Used only if loan_fee_policies has no row for the
// loan type (e.g., the migration has not been run yet). Mirrors the values
// the policy table is seeded with.
const FEE_POLICY_FALLBACKS = {
  CONSOLIDATED: {
    service_fee_mode: 'bracket',
    service_fee_per_bracket: 100,
    service_fee_bracket_size: 50000,
    cbu_rate: 0.02,
    insurance_per_thousand: 1.35,
    notarial_fee: 100,
  },
  EMERGENCY: {
    service_fee_mode: 'flat',
    service_fee_per_bracket: 100,
    service_fee_bracket_size: 999999999,
    cbu_rate: 0.02,
    insurance_per_thousand: 0,
    notarial_fee: 0,
  },
  BONUS: {
    service_fee_mode: 'flat',
    service_fee_per_bracket: 100,
    service_fee_bracket_size: 999999999,
    cbu_rate: 0,
    insurance_per_thousand: 0,
    notarial_fee: 0,
  },
  NONMEMBER_BONUS: {
    service_fee_mode: 'flat',
    service_fee_per_bracket: 100,
    service_fee_bracket_size: 999999999,
    cbu_rate: 0,
    insurance_per_thousand: 0,
    notarial_fee: 0,
  },
};

// Default interest rates (percent per month) to use when `loan_types` row
// is missing or not readable by the client. Emergency historically uses 2%.
const DEFAULT_INTEREST_RATES = {
  EMERGENCY: 2,
};

const resolveFeePolicy = async (loanTypeCode) => {
  const code = String(loanTypeCode || '').trim().toUpperCase();
  if (!code) return null;
  try {
    const { data } = await supabase
      .from('loan_fee_policies')
      .select('service_fee_mode,service_fee_per_bracket,service_fee_bracket_size,cbu_rate,insurance_per_thousand,notarial_fee')
      .eq('loan_type_code', code)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  } catch (_err) {
    // Table may not exist yet — fall through to the hard-coded defaults.
  }
  return FEE_POLICY_FALLBACKS[code] || null;
};

const computeServiceFee = (policy, principal) => {
  if (!policy || policy.service_fee_mode === 'none') return 0;
  const per = Number(policy.service_fee_per_bracket || 0);
  if (policy.service_fee_mode === 'flat') return per;
  const size = Number(policy.service_fee_bracket_size || 0);
  if (size <= 0 || per <= 0 || principal <= 0) return 0;
  // Ceiling brackets: 1..size → 1×per, size+1..2×size → 2×per, etc.
  return money((Math.floor((Math.trunc(principal) - 1) / size) + 1) * per);
};

const resolveLoanTypeInterestRate = async (loanTypeCode, loanTypeName) => {
  const code = String(loanTypeCode || '').trim().toUpperCase();
  const name = String(loanTypeName || '').trim();

  const tryQuery = async (builder) => {
    const { data, error } = await builder;
    if (error) return null;
    return extractInterestRate(data);
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

  // Final fallback: use hard-coded defaults if available (avoids breaking
  // local computation when DB rows are missing or RLS blocks read access).
  if (code && Object.prototype.hasOwnProperty.call(DEFAULT_INTEREST_RATES, code)) {
    return DEFAULT_INTEREST_RATES[code];
  }

  return null;
};

const buildMonthlyBreakdown = (loanType, principal, termMonths, monthlyRate, firstDueDate) => {
  const breakdown = [];
  const dueDate = firstDueDate || new Date();
  const monthlyPrincipal = money(principal / termMonths);

  if (loanType === 'emergency') {
    const monthlyPayment = money(principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths)));
    let remainingBalance = principal;

    for (let installmentNo = 1; installmentNo <= termMonths; installmentNo += 1) {
      const interestComponent = money(remainingBalance * monthlyRate);
      let principalComponent = money(monthlyPayment - interestComponent);
      let expectedAmount = monthlyPayment;

      if (installmentNo === termMonths) {
        principalComponent = money(remainingBalance);
        expectedAmount = money(principalComponent + interestComponent);
      }

      remainingBalance = money(remainingBalance - principalComponent);
      if (installmentNo === termMonths && Math.abs(remainingBalance) < 0.01) {
        remainingBalance = 0;
      }

      breakdown.push({
        installment_no: installmentNo,
        due_date: addMonths(dueDate, installmentNo - 1).toISOString().split('T')[0],
        expected_amount: expectedAmount,
        principal_component: principalComponent,
        interest_component: interestComponent,
        remaining_balance: remainingBalance,
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

  // All four fees come from loan_fee_policies (single source of truth, editable
  // by BOD). Falls back to the seeded defaults if the row is missing.
  const feePolicy = await resolveFeePolicy(loanTypeCode);
  const serviceFee = computeServiceFee(feePolicy, principal);
  const cbuDeduction = money(principal * Number(feePolicy?.cbu_rate || 0));
  const insuranceFee = money(principal * (Number(feePolicy?.insurance_per_thousand || 0) / 1000));
  const notarialFee = money(Number(feePolicy?.notarial_fee || 0));

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
