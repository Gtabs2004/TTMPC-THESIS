import React, { useEffect, useMemo, useState } from "react";
import { X, Calculator, RefreshCw, AlertTriangle, Sparkles } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { resolveAccountFromSessionUser } from "../../utils/sessionIdentity";

/*
  LoanCalculatorModal
  -------------------
  Real-time loan simulator for the Member portal. Mirrors the math used by
  Consolidated_Loan.jsx so simulated numbers match what the form will produce.

  Add-on interest formula (per TTMPC policy):
      monthly_amortization = (principal / term) + (principal * 0.0083)
      total_interest       = principal * 0.0083 * term
      total_repayment      = principal + total_interest

  Renewal mode:
      Reads the member's most recent loan from `loans`, subtracts confirmed
      `loan_payments` to get the remaining principal, then displays:
          net_proceeds = new_loan_amount - remaining_balance
      Read-only — no DB writes, no draft application.
*/

const MONTHLY_INTEREST_FACTOR = 0.0083; // 1% add-on / ~12% annual, matches Consolidated_Loan.jsx
const TERM_OPTIONS = [12, 24, 36, 48, 60];
const AMOUNT_MIN = 10000;
const AMOUNT_MAX = 470000;
const AMOUNT_STEP = 5000;

const LOAN_TYPES = [
  { code: "CONSOLIDATED", label: "Consolidated Loan", available: true, min: AMOUNT_MIN, max: AMOUNT_MAX },
  { code: "EMERGENCY", label: "Emergency Loan", available: false },
  { code: "BONUS", label: "Bonus Loan", available: false },
];

const CONFIRMED_PAYMENT_STATUSES = new Set([
  "validated",
  "confirmed",
  "bookkeeper_confirmed",
  "approved",
]);

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

const buildAmountOptions = (min, max, step) => {
  const out = [];
  for (let v = min; v <= max; v += step) out.push(v);
  return out;
};

export default function LoanCalculatorModal({ open, onClose }) {
  const [loanType, setLoanType] = useState("CONSOLIDATED");
  const [loanAmount, setLoanAmount] = useState("");
  const [term, setTerm] = useState(24);

  const [activeLoan, setActiveLoan] = useState(null);
  const [activeLoanLoading, setActiveLoanLoading] = useState(false);
  const [activeLoanError, setActiveLoanError] = useState("");
  const [renewalEnabled, setRenewalEnabled] = useState(false);

  // Reset on close so reopening doesn't show stale state.
  useEffect(() => {
    if (!open) {
      setLoanAmount("");
      setTerm(24);
      setRenewalEnabled(false);
      setActiveLoanError("");
    }
  }, [open]);

  // Look up the member's existing active loan when the modal opens.
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
          .select(
            "control_number, principal_amount, loan_amount, monthly_amortization, term, application_date, loan_status"
          )
          .eq("member_id", memberId)
          .order("application_date", { ascending: false });

        if (cancelled) return;
        if (error) {
          setActiveLoanError(error.message);
          return;
        }
        if (!loanRows || loanRows.length === 0) {
          setActiveLoan(null);
          return;
        }

        const controlNumbers = loanRows.map((l) => l.control_number).filter(Boolean);
        const paymentsByLoan = {};
        if (controlNumbers.length) {
          const { data: payments, error: payErr } = await supabase
            .from("loan_payments")
            .select("loan_id, amount_paid, confirmation_status")
            .in("loan_id", controlNumbers);
          if (payErr) {
            setActiveLoanError(payErr.message);
            return;
          }
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

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Auto-disable renewal toggle if no active loan exists.
  useEffect(() => {
    if (!activeLoan) setRenewalEnabled(false);
  }, [activeLoan]);

  const selectedType = LOAN_TYPES.find((t) => t.code === loanType) || LOAN_TYPES[0];

  const amountOptions = useMemo(
    () => (selectedType.available ? buildAmountOptions(selectedType.min, selectedType.max, AMOUNT_STEP) : []),
    [selectedType]
  );

  // Real-time computation. Pure function of (principal, term, renewal state).
  const result = useMemo(() => {
    const principal = Number(loanAmount || 0);
    const t = Number(term || 0);
    if (!principal || !t) return null;

    // (principal / term) + (principal * monthly_factor)
    const monthly = principal / t + principal * MONTHLY_INTEREST_FACTOR;
    const totalInterest = principal * MONTHLY_INTEREST_FACTOR * t;
    const totalRepayment = principal + totalInterest;

    const renewalActive = renewalEnabled && !!activeLoan;
    const remainingBalance = renewalActive ? Number(activeLoan.remaining || 0) : 0;
    const netProceeds = renewalActive ? principal - remainingBalance : principal;

    return {
      principal,
      term: t,
      monthly,
      totalInterest,
      totalRepayment,
      renewalActive,
      remainingBalance,
      netProceeds,
    };
  }, [loanAmount, term, renewalEnabled, activeLoan]);

  const amountInvalid =
    loanAmount !== "" &&
    (Number(loanAmount) < (selectedType.min || 0) || Number(loanAmount) > (selectedType.max || Infinity));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#F3F9F1] rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#1D6021] flex items-center justify-center">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Loan Calculator</h2>
              <p className="text-xs text-gray-500">Simulation only — no application will be submitted.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close calculator"
            className="rounded-md p-1.5 text-gray-500 hover:bg-white hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Inputs */}
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                Loan Type
              </label>
              <select
                value={loanType}
                onChange={(e) => setLoanType(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#66B538] outline-none"
              >
                {LOAN_TYPES.map((t) => (
                  <option key={t.code} value={t.code} disabled={!t.available}>
                    {t.label}
                    {!t.available ? " — coming soon" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                Loan Amount
                {selectedType.available && (
                  <span className="ml-2 font-medium text-gray-400 normal-case tracking-normal">
                    ({formatPHP(selectedType.min)} – {formatPHP(selectedType.max)}, step {AMOUNT_STEP.toLocaleString()})
                  </span>
                )}
              </label>
              {selectedType.available ? (
                <select
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  className={`w-full border rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#66B538] outline-none ${
                    amountInvalid ? "border-red-300" : "border-gray-300"
                  }`}
                >
                  <option value="">Select Amount</option>
                  {amountOptions.map((v) => (
                    <option key={v} value={v}>
                      {Number(v).toLocaleString("en-PH")}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-gray-500 italic px-3 py-2 bg-gray-50 rounded-md border border-gray-200">
                  This loan type is not yet available for simulation.
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                Term (months)
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {TERM_OPTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTerm(t)}
                    className={`text-xs font-bold py-2 rounded-md border transition-colors ${
                      Number(term) === t
                        ? "bg-[#1D6021] text-white border-[#1D6021]"
                        : "bg-white text-gray-700 border-gray-200 hover:border-[#66B538] hover:text-[#1D6021]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Renewal toggle */}
            <div className="rounded-lg border border-gray-200 bg-[#FAFAFA] p-3">
              <div className="flex items-start gap-3">
                <RefreshCw className="w-4 h-4 text-[#1D6021] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-gray-800">Loan Renewal</p>
                    <label
                      className={`relative inline-flex items-center ${
                        activeLoan ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={renewalEnabled}
                        onChange={(e) => setRenewalEnabled(e.target.checked)}
                        disabled={!activeLoan}
                      />
                      <span className="w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-[#1D6021] transition-colors relative">
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                            renewalEnabled ? "translate-x-4" : ""
                          }`}
                        />
                      </span>
                    </label>
                  </div>
                  {activeLoanLoading ? (
                    <p className="text-[11px] text-gray-500 mt-1">Checking your active loans…</p>
                  ) : activeLoanError ? (
                    <p className="text-[11px] text-red-600 mt-1">{activeLoanError}</p>
                  ) : activeLoan ? (
                    <p className="text-[11px] text-gray-600 mt-1">
                      Active loan <span className="font-semibold">{activeLoan.controlNumber}</span> — remaining{" "}
                      <span className="font-semibold text-[#1D6021]">{formatPHP(activeLoan.remaining)}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-500 mt-1">
                      No active loan on file — renewal is unavailable.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="bg-[#F3F9F1] border border-[#D8EBD3] rounded-xl p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-[#1D6021]" />
              <h3 className="text-sm font-bold text-gray-900">Live Simulation</h3>
            </div>

            {!result ? (
              <div className="flex-1 flex items-center justify-center text-center text-xs text-gray-500 italic">
                Select a loan amount and term to see your monthly amortization, total interest, and total repayment.
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <Row label="Principal" value={formatPHP(result.principal)} />
                <Row label="Term" value={`${result.term} months`} />
                <Row label="Interest rate" value="0.83% / month (add-on)" />
                <Divider />
                <Row
                  label="Monthly amortization"
                  value={formatPHP(result.monthly)}
                  emphasis
                />
                <Row label="Total interest" value={formatPHP(result.totalInterest)} />
                <Row label="Total repayment" value={formatPHP(result.totalRepayment)} />

                {result.renewalActive && (
                  <>
                    <Divider />
                    <div className="rounded-md bg-white border border-[#D8EBD3] p-3 space-y-2">
                      <p className="text-[10px] font-extrabold text-[#1D6021] uppercase tracking-wider">
                        Renewal Breakdown
                      </p>
                      <Row label="New gross loan" value={formatPHP(result.principal)} small />
                      <Row
                        label="Less: remaining balance"
                        value={`- ${formatPHP(result.remainingBalance)}`}
                        small
                      />
                      <Divider />
                      <Row
                        label="Net proceeds to member"
                        value={formatPHP(result.netProceeds)}
                        emphasis
                      />
                      {result.netProceeds <= 0 && (
                        <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            Net proceeds are zero or negative. Policy requires positive net proceeds for renewal.
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50 rounded-b-2xl">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
            Read-only · Figures are indicative
          </p>
          <button
            type="button"
            onClick={onClose}
            className="bg-[#1D6021] hover:bg-[#154718] text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, emphasis = false, small = false }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-gray-600 ${small ? "text-xs" : "text-sm"}`}>{label}</span>
      <span
        className={`font-bold ${emphasis ? "text-[#1D6021] text-base" : "text-gray-900"} ${
          small ? "text-xs" : "text-sm"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-dashed border-gray-200 my-1" />;
}
