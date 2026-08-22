import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Calculator,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  TrendingUp,
  Wallet,
  Calendar,
  Info,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { resolveAccountFromSessionUser } from "../../utils/sessionIdentity";
import { fetchLoanPrefill } from "../../LOANFORMS/loanSubmission";
import { useMigsLabel } from "../../hooks/useMigsLabel";

/*
  LoanCalculatorModal
  -------------------
  Add-on interest formula (per TTMPC policy):
      monthly_amortization = (principal / term) + (principal * 0.0083)
      total_interest       = principal * 0.0083 * term
      total_repayment      = principal + total_interest

  Renewal mode:
      net_proceeds = new_loan_amount - remaining_balance
      Read-only — no DB writes, no draft application.
*/

const MONTHLY_INTEREST_FACTOR = 0.0083;
const TERM_MIN = 1;
const TERM_MAX = 60;
const TERM_QUICK_PICKS = [12, 24, 36, 48, 60];
const AMOUNT_MIN = 10000;
const AMOUNT_MAX = 470000;
const AMOUNT_STEP = 5000;

const LOAN_TYPES = [
  { code: "CONSOLIDATED", label: "Consolidated Loan", available: true, min: AMOUNT_MIN, max: AMOUNT_MAX },
  { code: "EMERGENCY", label: "Emergency Loan", available: false },
  { code: "BONUS", label: "Bonus Loan", available: false },
];

const CONFIRMED_PAYMENT_STATUSES = new Set([
  "validated", "confirmed", "bookkeeper_confirmed", "approved",
]);

const AMOUNT_QUICK_PICKS = [50000, 100000, 150000, 200000, 300000];

const formatPHP = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "₱0.00";
  return numeric.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatPHPCompact = (value) => {
  const n = Number(value || 0);
  if (n >= 1000000) return `₱${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `₱${(n / 1000).toFixed(0)}K`;
  return formatPHP(n);
};

export default function LoanCalculatorModal({ open, onClose }) {
  const [loanType, setLoanType] = useState("CONSOLIDATED");
  const [loanAmount, setLoanAmount] = useState(100000);
  const [isCustomAmount, setIsCustomAmount] = useState(false);
  const [term, setTerm] = useState(24);
  const [showFormula, setShowFormula] = useState(false);

  const [activeLoan, setActiveLoan] = useState(null);
  const [activeLoanLoading, setActiveLoanLoading] = useState(false);
  const [activeLoanError, setActiveLoanError] = useState("");
  const [renewalEnabled, setRenewalEnabled] = useState(false);

  // Personalized eligibility ceiling — same source data and formula the real
  // application forms use (share capital × MIGS multiplier), so the
  // calculator's max stops silently disagreeing with what a member could
  // actually apply for. Falls back to the flat product range if this can't
  // be resolved (e.g. not signed in) rather than breaking the simulation.
  const [memberId, setMemberId] = useState(null);
  const [shareCapital, setShareCapital] = useState(0);
  const { data: migsLabel } = useMigsLabel(memberId);

  useEffect(() => {
    if (!open) {
      setLoanAmount(100000);
      setIsCustomAmount(false);
      setTerm(24);
      setRenewalEnabled(false);
      setActiveLoanError("");
      setShowFormula(false);
      setMemberId(null);
      setShareCapital(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const { profile } = await fetchLoanPrefill();
        if (cancelled || !profile) return;
        setMemberId(profile.member_id || null);
        setShareCapital(Number(profile.share_capital || 0));
      } catch {
        // Not signed in, or the lookup failed — leave the calculator on the
        // flat product-wide range rather than surfacing an error for what's
        // a read-only simulation tool.
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setActiveLoanLoading(true);
      setActiveLoanError("");
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setActiveLoanError("Please sign in to check renewal eligibility.");
          return;
        }

        const account = await resolveAccountFromSessionUser(user);
        const memberId = account?.user_id || account?.auth_user_id || user.id;

        const { data: loanRows, error } = await supabase
          .from("loans")
          .select("control_number, principal_amount, loan_amount, monthly_amortization, term, application_date, loan_status")
          .eq("member_id", memberId)
          .order("application_date", { ascending: false });

        if (cancelled) return;
        if (error) { setActiveLoanError(error.message); return; }
        if (!loanRows || loanRows.length === 0) { setActiveLoan(null); return; }

        const controlNumbers = loanRows.map((l) => l.control_number).filter(Boolean);
        const paymentsByLoan = {};
        if (controlNumbers.length) {
          const { data: payments, error: payErr } = await supabase
            .from("loan_payments")
            .select("loan_id, amount_paid, confirmation_status")
            .in("loan_id", controlNumbers);
          if (payErr) { setActiveLoanError(payErr.message); return; }
          (payments || []).forEach((p) => {
            const status = String(p.confirmation_status || "confirmed").toLowerCase();
            if (!CONFIRMED_PAYMENT_STATUSES.has(status)) return;
            const key = String(p.loan_id);
            paymentsByLoan[key] = (paymentsByLoan[key] || 0) + Number(p.amount_paid || 0);
          });
        }

        const enriched = loanRows.map((l) => {
          const principal = Number(l.principal_amount || l.loan_amount || 0);
          const paid = Number(paymentsByLoan[String(l.control_number)] || 0);
          return {
            controlNumber: l.control_number,
            principal,
            paid,
            remaining: Math.max(principal - paid, 0),
            monthly: Number(l.monthly_amortization || 0),
            term: Number(l.term || 0),
            applicationDate: l.application_date,
            status: l.loan_status,
          };
        });

        const active = enriched.find((l) => l.remaining > 0);
        if (cancelled) return;
        setActiveLoan(active || null);
      } catch (err) {
        if (!cancelled) setActiveLoanError(err.message || "Unable to check active loans.");
      } finally {
        if (!cancelled) setActiveLoanLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!activeLoan) setRenewalEnabled(false);
  }, [activeLoan]);

  const selectedType = LOAN_TYPES.find((t) => t.code === loanType) || LOAN_TYPES[0];

  // Same formula the real application forms use to gray out amounts a member
  // can't actually take: share capital × MIGS multiplier (5× MIGS, 3×
  // otherwise). Only applied once fetchLoanPrefill has actually resolved —
  // memberId stays null before that (or if the lookup failed), so the
  // calculator doesn't flash a wrong ₱0 ceiling before real data arrives.
  const migsMultiplier = Number(migsLabel?.loan_multiplier) || 3;
  const eligibleCapacity = shareCapital * migsMultiplier;
  const hasEligibilityData = memberId != null;
  const effectiveMax = hasEligibilityData
    ? Math.max(selectedType.min, Math.min(selectedType.max, eligibleCapacity))
    : selectedType.max;
  const isCappedByEligibility = hasEligibilityData && effectiveMax < selectedType.max;

  // If eligibility data arrives (or the member switches loan type) and the
  // currently selected amount is now above what they actually qualify for,
  // pull it back down instead of silently simulating an amount they can't
  // borrow.
  useEffect(() => {
    if (loanAmount === "") return;
    if (Number(loanAmount) > effectiveMax) setLoanAmount(effectiveMax);
  }, [effectiveMax, loanAmount]);

  const result = useMemo(() => {
    const principal = Number(loanAmount || 0);
    const t = Number(term || 0);
    if (!principal || !t) return null;

    const monthly = principal / t + principal * MONTHLY_INTEREST_FACTOR;
    const totalInterest = principal * MONTHLY_INTEREST_FACTOR * t;
    const totalRepayment = principal + totalInterest;

    const renewalActive = renewalEnabled && !!activeLoan;
    const remainingBalance = renewalActive ? Number(activeLoan.remaining || 0) : 0;
    const netProceeds = renewalActive ? principal - remainingBalance : principal;

    return { principal, term: t, monthly, totalInterest, totalRepayment, renewalActive, remainingBalance, netProceeds };
  }, [loanAmount, term, renewalEnabled, activeLoan]);

  if (!open) return null;

  const amountNum = Number(loanAmount || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:px-4 sm:py-6 overflow-y-auto">
      <div className="w-full sm:max-w-xl bg-white dark:bg-gray-900 sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 sm:my-auto flex flex-col max-h-screen sm:max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-[#F3F9F1] to-white dark:from-green-950/40 dark:to-gray-900 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-member-green flex items-center justify-center shadow-sm">
              <Calculator className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-gray-900 dark:text-white">Loan Calculator</h2>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">Simulation only — no application submitted</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close calculator"
            className="rounded-lg p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Loan Type */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Loan Type
            </label>
            <div className="relative">
              <select
                value={loanType}
                onChange={(e) => setLoanType(e.target.value)}
                className="w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm font-semibold bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-[#66B538] outline-none pr-9"
              >
                {LOAN_TYPES.map((t) => (
                  <option key={t.code} value={t.code} disabled={!t.available}>
                    {t.label}{!t.available ? " — coming soon" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
            </div>
          </div>

          {/* Loan Amount */}
          {selectedType.available ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Loan Amount</label>
                <span className="text-lg font-extrabold text-member-green dark:text-green-400">{formatPHP(amountNum)}</span>
              </div>

              {/* Amount: preset dropdown, or a direct number entry for a custom amount */}
              <div className="mb-3">
                <div className="relative">
                  <select
                    value={isCustomAmount ? "custom" : String(amountNum)}
                    onChange={(e) => {
                      if (e.target.value === "custom") {
                        setIsCustomAmount(true);
                        return;
                      }
                      setIsCustomAmount(false);
                      setLoanAmount(Number(e.target.value));
                    }}
                    className="w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm font-semibold bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-primary outline-none pr-9"
                  >
                    {AMOUNT_QUICK_PICKS.filter((v) => v >= selectedType.min && v <= effectiveMax).map((v) => (
                      <option key={v} value={v}>{formatPHP(v)}</option>
                    ))}
                    <option value="custom">Custom amount…</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                </div>

                {isCustomAmount && (
                  <div className="relative mt-2">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400 dark:text-gray-500">₱</span>
                    <input
                      type="number"
                      min={selectedType.min}
                      max={effectiveMax}
                      step={AMOUNT_STEP}
                      value={loanAmount === "" ? "" : loanAmount}
                      onChange={(e) => {
                        const raw = e.target.value;
                        // Let the field go genuinely empty while typing instead of
                        // snapping to 0 — Number("") is 0, and re-rendering the
                        // input with value=0 leaves a "0" the user can never
                        // actually clear (every backspace just recreates it).
                        setLoanAmount(raw === "" ? "" : Number(raw));
                      }}
                      onBlur={(e) => {
                        // min/max on a number input only affect the spinner
                        // arrows and :invalid styling — they never actually stop
                        // someone from typing an out-of-range value. Snap it back
                        // into range once they're done editing, not mid-keystroke
                        // (that would fight every digit typed while building up
                        // a larger number, e.g. typing "1" of "150000").
                        const raw = e.target.value;
                        if (raw === "") return;
                        const clamped = Math.min(Math.max(Number(raw), selectedType.min), effectiveMax);
                        if (clamped !== Number(raw)) setLoanAmount(clamped);
                      }}
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-xl pl-8 pr-4 py-2.5 text-sm font-semibold bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-primary outline-none invalid:border-red-300 invalid:text-red-700 dark:invalid:border-red-500 dark:invalid:text-red-400 invalid:focus:ring-red-400"
                      placeholder={`Between ${formatPHPCompact(selectedType.min)} and ${formatPHPCompact(effectiveMax)}`}
                    />
                  </div>
                )}

                <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 font-medium mt-1.5">
                  <span>Min {formatPHPCompact(selectedType.min)}</span>
                  <span>Max {formatPHPCompact(effectiveMax)}</span>
                </div>

                {isCappedByEligibility && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 rounded-lg px-2.5 py-1.5 mt-2 leading-snug">
                    Your maximum here is based on your share capital and MIGS multiplier, not the product-wide {formatPHPCompact(selectedType.max)} ceiling.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 italic px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              This loan type is not yet available for simulation.
            </p>
          )}

          {/* Term */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Term</label>
              <span className="text-sm font-extrabold text-gray-800 dark:text-gray-100">{term} months</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {TERM_QUICK_PICKS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTerm(t)}
                  className={`text-xs font-bold py-2 rounded-xl border transition-colors ${
                    Number(term) === t
                      ? "bg-member-green text-white border-member-green shadow-sm"
                      : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-[#66B538] dark:hover:border-green-500 hover:text-member-green dark:hover:text-green-400"
                  }`}
                >
                  {t} mo
                </button>
              ))}
            </div>
            {/* Custom term input */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">Custom:</span>
              <input
                type="number"
                min={TERM_MIN}
                max={TERM_MAX}
                step={1}
                value={term}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") { setTerm(""); return; }
                  const n = Math.floor(Number(raw));
                  if (Number.isFinite(n)) setTerm(n);
                }}
                onBlur={() => {
                  if (term === "" || term == null) { setTerm(TERM_MIN); return; }
                  setTerm(Math.min(Math.max(Number(term), TERM_MIN), TERM_MAX));
                }}
                className={`w-20 border rounded-lg px-2.5 py-1.5 text-sm font-semibold text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#66B538] outline-none ${
                  term !== "" && (Number(term) < TERM_MIN || Number(term) > TERM_MAX)
                    ? "border-red-300 dark:border-red-700 text-red-600 dark:text-red-400"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              />
              <span className="text-[11px] text-gray-400 dark:text-gray-500">months ({TERM_MIN}–{TERM_MAX})</span>
            </div>
          </div>

          {/* Results panel */}
          {result ? (
            <div className="rounded-2xl border border-[#D8EBD3] dark:border-green-900 bg-[#F3F9F1] dark:bg-green-950/30 overflow-hidden">
              {/* Primary stat — monthly amortization */}
              <div className="px-5 py-4 bg-member-green text-white text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-green-200 mb-1">Monthly Amortization</p>
                <p className="text-3xl font-extrabold tracking-tight">{formatPHP(result.monthly)}</p>
                <p className="text-[11px] text-green-200 mt-1">per month for {result.term} months</p>
              </div>

              {/* Secondary stats */}
              <div className="grid grid-cols-2 divide-x divide-[#D8EBD3] dark:divide-green-900 border-b border-[#D8EBD3] dark:border-green-900">
                <div className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <TrendingUp className="w-3 h-3 text-member-green dark:text-green-400" />
                    <p className="text-[10px] font-bold text-[#2d6a38] dark:text-green-400 uppercase tracking-wider">Total Interest</p>
                  </div>
                  <p className="text-base font-extrabold text-gray-900 dark:text-white">{formatPHP(result.totalInterest)}</p>
                </div>
                <div className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Wallet className="w-3 h-3 text-member-green dark:text-green-400" />
                    <p className="text-[10px] font-bold text-[#2d6a38] dark:text-green-400 uppercase tracking-wider">Total Repayment</p>
                  </div>
                  <p className="text-base font-extrabold text-gray-900 dark:text-white">{formatPHP(result.totalRepayment)}</p>
                </div>
              </div>

              {/* Interest formula breakdown (collapsible) */}
              <div className="border-b border-[#D8EBD3] dark:border-green-900">
                <button
                  type="button"
                  onClick={() => setShowFormula((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[#eaf5e4] dark:hover:bg-green-900/30 transition-colors"
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-member-green dark:text-green-400">
                    <Info className="w-3.5 h-3.5" /> How is this computed?
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-member-green dark:text-green-400 transition-transform ${showFormula ? "rotate-180" : ""}`} />
                </button>
                {showFormula && (
                  <div className="px-4 pb-3 space-y-1.5 text-xs">
                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Interest Computation (Add-on, 0.83%/mo)</p>
                    <FormulaRow label="Principal" value={formatPHP(result.principal)} />
                    <FormulaRow label="× Interest rate" value="0.83% / month" />
                    <FormulaRow label={`× Term (${result.term} months)`} value={`= ${formatPHP(result.totalInterest)}`} highlight />
                    <div className="border-t border-dashed border-[#D8EBD3] dark:border-green-900 pt-1.5 mt-1.5 space-y-1">
                      <FormulaRow label="Principal ÷ Term" value={formatPHP(result.principal / result.term)} />
                      <FormulaRow label="+ Monthly interest" value={formatPHP(result.principal * MONTHLY_INTEREST_FACTOR)} />
                      <FormulaRow label="= Monthly amortization" value={formatPHP(result.monthly)} highlight />
                    </div>
                  </div>
                )}
              </div>

              {/* Loan summary row */}
              <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Loan amount: <span className="font-bold text-gray-700 dark:text-gray-200">{formatPHP(result.principal)}</span></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Rate: <span className="font-bold text-gray-700 dark:text-gray-200">0.83%/mo add-on</span></span>
                </div>
              </div>

              {/* Renewal breakdown */}
              {result.renewalActive && (
                <div className="border-t border-[#D8EBD3] dark:border-green-900 bg-white dark:bg-gray-900 mx-0 p-4 space-y-2">
                  <p className="text-[10px] font-extrabold text-member-green dark:text-green-400 uppercase tracking-wider mb-2">Renewal Breakdown</p>
                  <FormulaRow label="New gross loan" value={formatPHP(result.principal)} />
                  <FormulaRow label="Less: remaining balance" value={`− ${formatPHP(result.remainingBalance)}`} />
                  <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-2">
                    <FormulaRow label="Net proceeds to you" value={formatPHP(result.netProceeds)} highlight />
                  </div>
                  {result.netProceeds <= 0 && (
                    <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5 mt-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>Net proceeds are zero or negative. Policy requires positive net proceeds for renewal to proceed.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-[#EAF1EB] dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
                <Calculator className="w-5 h-5 text-member-green dark:text-green-400" />
              </div>
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400">Adjust the amount and term</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Your monthly amortization will appear here.</p>
            </div>
          )}

          {/* Renewal toggle */}
          <div className={`rounded-xl border p-3.5 transition-colors ${
            renewalEnabled ? "border-member-green/30 dark:border-green-800 bg-[#F3F9F1] dark:bg-green-950/30" : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
          }`}>
            <div className="flex items-start gap-3">
              <RefreshCw className={`w-4 h-4 mt-0.5 shrink-0 ${renewalEnabled ? "text-member-green dark:text-green-400" : "text-gray-400 dark:text-gray-500"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-gray-800 dark:text-gray-100">Simulate Loan Renewal</p>
                  <label className={`relative inline-flex items-center ${activeLoan ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}>
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={renewalEnabled}
                      onChange={(e) => setRenewalEnabled(e.target.checked)}
                      disabled={!activeLoan}
                    />
                    <span className="w-9 h-5 bg-gray-300 dark:bg-gray-600 rounded-full peer-checked:bg-member-green transition-colors relative">
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${renewalEnabled ? "translate-x-4" : ""}`} />
                    </span>
                  </label>
                </div>
                {activeLoanLoading ? (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Checking your active loans…</p>
                ) : activeLoanError ? (
                  <p className="text-[11px] text-red-500 dark:text-red-400 mt-1">{activeLoanError}</p>
                ) : activeLoan ? (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    Active loan <span className="font-semibold text-gray-700 dark:text-gray-200">{activeLoan.controlNumber}</span> — remaining{" "}
                    <span className="font-semibold text-member-green dark:text-green-400">{formatPHP(activeLoan.remaining)}</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">No active loan found — renewal simulation unavailable.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-b-2xl shrink-0">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">
            Read-only · Figures are indicative
          </p>
          <button
            type="button"
            onClick={onClose}
            className="bg-member-green hover:bg-[#154718] text-white text-sm font-bold px-5 py-2 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function FormulaRow({ label, value, highlight = false }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-500 dark:text-gray-400 text-xs">{label}</span>
      <span className={`font-bold text-xs ${highlight ? "text-member-green dark:text-green-400" : "text-gray-800 dark:text-gray-100"}`}>{value}</span>
    </div>
  );
}
