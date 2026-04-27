import { supabase } from '../supabaseClient';

// DEPLOYMENT_TOGGLE: RENEWAL_SIMULATION_HELPER_START
// This file is dedicated to renewal simulation behavior in the Consolidated loan form.
// To remove simulation for production, remove the import/effect/UI blocks marked in Consolidated_Loan.jsx,
// then remove this helper module.
// DEPLOYMENT_TOGGLE: RENEWAL_SIMULATION_HELPER_END

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const toIsoDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
};

const monthKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const addMonths = (date, months) => {
  const base = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(base.getTime())) return null;
  const y = base.getFullYear();
  const m = base.getMonth() + months;
  const target = new Date(y, m, 1);
  const day = Math.min(base.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate());
  return new Date(target.getFullYear(), target.getMonth(), day);
};

const isActiveLoanStatus = (status) => {
  const s = String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!s) return false;
  return [
    'released',
    'partially paid',
    'to be disbursed',
    'ready for disbursement',
    'approved',
    'active',
    'ongoing',
  ].includes(s);
};

const isScheduleUnpaid = (status) => {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return true;
  return !['paid', 'fully paid', 'completed'].includes(s);
};

async function getLoanTypeIdByCode(loanTypeCode) {
  const code = String(loanTypeCode || '').trim().toUpperCase();
  if (!code) return null;

  const { data, error } = await supabase
    .from('loan_types')
    .select('id, code')
    .eq('code', code)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data?.id || null;
}

export async function fetchContributionMonthsSnapshot({ memberId, asOfDate, monthsRequired = 6 }) {
  const asOfIso = toIsoDate(asOfDate) || new Date().toISOString().split('T')[0];
  const anchor = new Date(`${asOfIso}T00:00:00`);

  if (!memberId) {
    return {
      asOfDate: asOfIso,
      monthsRequired,
      paidMonths: 0,
      satisfied: false,
      missingMonths: monthsRequired,
      monthsWindow: [],
    };
  }

  const windowMonths = Array.from({ length: monthsRequired }, (_, index) => {
    const d = addMonths(anchor, -(monthsRequired - 1 - index));
    return monthKey(d);
  }).filter(Boolean);

  const earliest = addMonths(anchor, -(monthsRequired - 1));
  const earliestIso = earliest ? earliest.toISOString().split('T')[0] : asOfIso;

  const { data, error } = await supabase
    .from('capital_build_up')
    .select('transaction_date, capital_added, amount')
    .eq('member_id', memberId)
    .gte('transaction_date', earliestIso)
    .lte('transaction_date', `${asOfIso}T23:59:59`)
    .limit(500);

  if (error) {
    return {
      asOfDate: asOfIso,
      monthsRequired,
      paidMonths: 0,
      satisfied: false,
      missingMonths: monthsRequired,
      monthsWindow: windowMonths,
      error,
    };
  }

  const monthsWithPayments = new Set();
  (data || []).forEach((row) => {
    const added = toNumber(row?.capital_added ?? row?.amount);
    if (added <= 0) return;

    const mk = monthKey(row?.transaction_date);
    if (mk) monthsWithPayments.add(mk);
  });

  const paidMonths = windowMonths.reduce((count, mk) => count + (monthsWithPayments.has(mk) ? 1 : 0), 0);
  const satisfied = paidMonths >= monthsRequired;

  return {
    asOfDate: asOfIso,
    monthsRequired,
    paidMonths,
    satisfied,
    missingMonths: Math.max(0, monthsRequired - paidMonths),
    monthsWindow: windowMonths,
  };
}

export async function fetchActiveLoanSnapshot({ memberId, loanTypeCode = 'CONSOLIDATED' }) {
  if (!memberId) return { activeLoan: null };

  const loanTypeId = await getLoanTypeIdByCode(loanTypeCode);

  let query = supabase
    .from('loans')
    .select('control_number, loan_amount, principal_amount, loan_status, application_date, disbursal_date, service_fee, insurance_fee, notarial_fee, cbu_deduction, net_proceeds, loan_type_id')
    .eq('member_id', memberId)
    .order('application_date', { ascending: false })
    .limit(25);

  if (loanTypeId) {
    query = query.eq('loan_type_id', loanTypeId);
  }

  const { data, error } = await query;
  if (error) return { activeLoan: null, error };

  const activeLoan = (data || []).find((row) => isActiveLoanStatus(row?.loan_status)) || null;
  return { activeLoan };
}

export async function fetchExistingBalanceSnapshot({ loanId, asOfDate }) {
  const asOfIso = toIsoDate(asOfDate) || new Date().toISOString().split('T')[0];
  if (!loanId) return { existingBalance: 0, asOfDate: asOfIso };

  const { data: loanRow, error: loanError } = await supabase
    .from('loans')
    .select('principal_amount, loan_amount')
    .eq('control_number', loanId)
    .limit(1)
    .maybeSingle();

  if (loanError) return { existingBalance: 0, asOfDate: asOfIso, error: loanError };

  const principal = toNumber(loanRow?.principal_amount ?? loanRow?.loan_amount);

  const { data: paymentRows, error: paymentError } = await supabase
    .from('loan_payments')
    .select('amount_paid, confirmation_status, payment_date')
    .eq('loan_id', loanId)
    .lte('payment_date', `${asOfIso}T23:59:59`)
    .limit(500);

  if (paymentError) {
    return { existingBalance: principal, asOfDate: asOfIso, error: paymentError };
  }

  const validatedPaid = (paymentRows || []).reduce((sum, row) => {
    const status = String(row?.confirmation_status || '').trim().toLowerCase();
    if (status !== 'validated') return sum;
    return sum + toNumber(row?.amount_paid);
  }, 0);

  const existingBalance = Math.max(0, principal - validatedPaid);
  return { existingBalance, asOfDate: asOfIso };
}

export async function fetchUnpaidInterestSnapshot({ loanId, asOfDate }) {
  const asOfIso = toIsoDate(asOfDate) || new Date().toISOString().split('T')[0];
  if (!loanId) return { unpaidInterest: 0, asOfDate: asOfIso };

  const { data: scheduleRows, error } = await supabase
    .from('loan_schedules')
    .select('expected_interest, interest_component, schedule_status, due_date')
    .eq('loan_id', loanId)
    .lte('due_date', asOfIso)
    .limit(500);

  if (error) {
    return { unpaidInterest: 0, asOfDate: asOfIso, error };
  }

  const unpaidInterest = (scheduleRows || []).reduce((sum, row) => {
    if (!isScheduleUnpaid(row?.schedule_status)) return sum;
    return sum + toNumber(row?.expected_interest ?? row?.interest_component);
  }, 0);

  return { unpaidInterest, asOfDate: asOfIso };
}

export async function runRenewalSimulation({ memberId, asOfDate, loanTypeCode = 'CONSOLIDATED', monthsRequired = 6 }) {
  const asOfIso = toIsoDate(asOfDate) || new Date().toISOString().split('T')[0];

  const contributions = await fetchContributionMonthsSnapshot({ memberId, asOfDate: asOfIso, monthsRequired });
  const activeLoanResp = await fetchActiveLoanSnapshot({ memberId, loanTypeCode });
  const activeLoan = activeLoanResp.activeLoan;

  const existingBalanceResp = await fetchExistingBalanceSnapshot({ loanId: activeLoan?.control_number, asOfDate: asOfIso });
  const unpaidInterestResp = await fetchUnpaidInterestSnapshot({ loanId: activeLoan?.control_number, asOfDate: asOfIso });

  const hasActiveLoan = Boolean(activeLoan?.control_number);
  const viableForRenewal = Boolean(contributions?.satisfied) && hasActiveLoan;

  return {
    asOfDate: asOfIso,
    contributions,
    activeLoan,
    hasActiveLoan,
    existingBalance: toNumber(existingBalanceResp?.existingBalance),
    unpaidInterest: toNumber(unpaidInterestResp?.unpaidInterest),
    viableForRenewal,
    errors: {
      contributions: contributions?.error || null,
      activeLoan: activeLoanResp?.error || null,
      existingBalance: existingBalanceResp?.error || null,
      unpaidInterest: unpaidInterestResp?.error || null,
    },
  };
}
