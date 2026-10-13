// Repayment Stress Index = monthly amortization / latest net pay x 100.
// Cut-offs mirror loan_calculator_schema.sql and the manuscript.
// Debt Capacity Framework: anything above the ceiling is blocked.
export const STRESS_INDEX_CEILING = 40;

const BANDS = [
  { max: 20, code: 'safe', label: 'Safe' },
  { max: 30, code: 'low_risk', label: 'Low Risk' },
  { max: 35, code: 'moderate_risk', label: 'Moderate Risk' },
  { max: 40, code: 'high_risk', label: 'High Risk' },
  { max: Infinity, code: 'extreme_risk', label: 'Extreme Risk' },
];

const RISK_COLORS = {
  safe: 'text-[#2E7D32] bg-[#E9F7DE]',
  low_risk: 'text-yellow-700 bg-yellow-100',
  moderate_risk: 'text-orange-600 bg-orange-100',
  high_risk: 'text-red-600 bg-red-100',
  extreme_risk: 'text-red-800 bg-red-200',
};

// Comfort level for recommendations: top of the Low Risk band.
export const RECOMMENDED_STRESS_PCT = 30;

const amortization = (principal, term, interestFactor) =>
  (principal / term) + (principal * interestFactor);

// Largest amount (snapped to the form's step and range) whose payment stays within
// maxPct of net pay at some allowed term, paired with the shortest such term.
const fitAmount = (maxPct, { netPay, capacity, minAmount, maxAmount, step, terms, interestFactor }) => {
  const maxMonthly = netPay * (maxPct / 100);
  const longest = terms[terms.length - 1];
  const affordable = maxMonthly / ((1 / longest) + interestFactor);
  const amount = Math.floor(Math.min(capacity, maxAmount, affordable) / step) * step;
  if (amount < minAmount) return null;
  const term = terms.find((t) => amortization(amount, t, interestFactor) <= maxMonthly) ?? longest;
  const monthly = amortization(amount, term, interestFactor);
  return { amount, term, monthly, stressPct: (monthly / netPay) * 100 };
};

// Suggestion only: the member may still choose any amount up to `maximum`.
export const recommendLoan = (opts) => {
  if (!(opts.netPay > 0) || !Number.isFinite(opts.capacity) || opts.capacity <= 0) return null;
  return {
    recommended: fitAmount(RECOMMENDED_STRESS_PCT, opts),
    maximum: fitAmount(STRESS_INDEX_CEILING, opts),
  };
};

// Same idea for forms with fixed choices: candidates = [{ amount, term, monthly }].
export const recommendFromOptions = ({ candidates, netPay, capacity }) => {
  if (!(netPay > 0) || !candidates?.length) return null;
  const pick = (maxPct) => {
    const fits = candidates.filter((c) => c.amount <= capacity && c.monthly <= netPay * (maxPct / 100));
    if (!fits.length) return null;
    const best = fits.reduce((a, b) => (
      b.amount > a.amount || (b.amount === a.amount && b.term < a.term) ? b : a
    ));
    return { ...best, stressPct: (best.monthly / netPay) * 100 };
  };
  return { recommended: pick(RECOMMENDED_STRESS_PCT), maximum: pick(STRESS_INDEX_CEILING) };
};

// categories: optional map of stress_index_category rows keyed by code.
export const classifyStress = (rawStressPct, categories = {}) => {
  const pct = Number.isFinite(rawStressPct) ? rawStressPct : 0;
  const band = BANDS.find((b) => pct <= b.max);
  const dbRow = categories[band.code];
  return {
    code: band.code,
    id: dbRow?.stress_index_category_id || null,
    label: (dbRow?.label || band.label).toUpperCase(),
    color: RISK_COLORS[band.code],
    overCap: pct > STRESS_INDEX_CEILING,
    rawStressPct: pct,
    cappedStressPct: Math.min(Math.max(pct, 0), STRESS_INDEX_CEILING),
  };
};
