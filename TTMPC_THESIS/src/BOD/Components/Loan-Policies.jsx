import React, { useEffect, useMemo, useState } from "react";
import StaffSidebar from "../../components/StaffSidebar";
import { bodNav } from "../../components/StaffSidebar/configs/bod";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { supabase } from "../../supabaseClient";
import { formatWithCommas, stripCommas } from "../../utils/numberFormat";
import {
  LayoutDashboard, Users, Archive, CalendarCheck, CreditCard,
  Save, RefreshCw, AlertCircle, CheckCircle2, Percent, Banknote, Shield, FileText,ShieldCheck,
  AlertTriangle,
  CalendarDays,
  History,
  Pencil,
  X,
  Lock,
} from "lucide-react";
import StaffTopbar from "../../components/StaffTopbar";
import NotificationBell from "../../components/NotificationBell";

// Loan-type labels for the tab strip. Order is intentional: CONSOLIDATED first
// because it carries every fee, BONUS types last because they carry only a
// service fee. Codes must match loan_fee_policies.loan_type_code /
// loan_types.code exactly (NONMEMBER_BONUS, no space/underscore mismatch) or
// the lookup silently misses and the tab always shows empty defaults.
const LOAN_TYPE_TABS = [
  { code: "CONSOLIDATED", label: "Consolidated" },
  { code: "EMERGENCY", label: "Emergency" },
  { code: "BONUS", label: "Bonus" },
  { code: "NONMEMBER_BONUS", label: "Non-member Bonus" },
];

// Which fields each loan type actually uses, per BOD's 2026-09-18 direction:
//   - Consolidated & Emergency: bracket-style service fee (Mode hidden,
//     always "per loan" bracket math), interest, CBU deposit, insurance,
//     notarial. Emergency additionally gets a Maximum Loan Amount cap.
//   - Bonus & Non-member Bonus: flat service fee only, interest (single
//     rate — the 2%/3% MIGS-vs-non-coop split isn't representable by the
//     current one-rate-per-type schema), Penalty Rate. No insurance/notarial
//     — policy doesn't charge either for these types.
const FIELD_VISIBILITY = {
  CONSOLIDATED: { serviceFeeStyle: "bracket", interest: true, cbu: true, insurance: true, notarial: true, maxAmount: false, penalty: false },
  EMERGENCY: { serviceFeeStyle: "bracket", interest: true, cbu: true, insurance: false, notarial: false, maxAmount: true, penalty: false },
  BONUS: { serviceFeeStyle: "flat", interest: true, cbu: true, insurance: false, notarial: false, maxAmount: false, penalty: true },
  NONMEMBER_BONUS: { serviceFeeStyle: "flat", interest: true, cbu: true, insurance: false, notarial: false, maxAmount: false, penalty: true },
};

const formatNumber = (value, opts = {}) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-PH", {
    minimumFractionDigits: opts.minDecimals ?? 2,
    maximumFractionDigits: opts.maxDecimals ?? 4,
  });
};

const Loan_Policies = () => {
    const navigate = useNavigate();
  const [activeCode, setActiveCode] = useState("CONSOLIDATED");
  const [feePolicies, setFeePolicies] = useState({});      // keyed by loan_type_code
  const [loanTypes, setLoanTypes] = useState({});          // keyed by code → { id, interest_rate, name }
  const [draft, setDraft] = useState(null);               // editable copy of the active row
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // View-only by default — a BOD member must explicitly click Edit before any
  // field becomes interactive. Prevents an accidental keystroke/click from
  // changing a live fee or interest rate that every future loan computation
  // reads.
  const [editing, setEditing] = useState(false);




  const fetchAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [{ data: feeRows, error: feeErr }, { data: typeRows, error: typeErr }] = await Promise.all([
        supabase
          .from("loan_fee_policies")
          .select("*"),
        supabase
          .from("loan_types")
          .select("id,code,name,interest_rate"),
      ]);

      if (feeErr) throw new Error(`loan_fee_policies: ${feeErr.message}`);
      if (typeErr) throw new Error(`loan_types: ${typeErr.message}`);

      const feeMap = {};
      (feeRows || []).forEach((row) => {
        feeMap[String(row.loan_type_code).toUpperCase()] = row;
      });
      const typeMap = {};
      (typeRows || []).forEach((row) => {
        if (row.code) typeMap[String(row.code).toUpperCase()] = row;
      });

      setFeePolicies(feeMap);
      setLoanTypes(typeMap);
    } catch (err) {
      setError(err.message || "Failed to load policies.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // Whenever the active tab or the fetched data changes, reset the draft to
  // the last-saved values. Also used by Cancel to discard unsaved edits.
  const resetDraft = () => {
    const policy = feePolicies[activeCode] || null;
    const loanType = loanTypes[activeCode] || null;
    setDraft({
      // identity
      loan_type_code: activeCode,
      // fee fields (with safe defaults if no row yet)
      service_fee_mode: policy?.service_fee_mode || "bracket",
      service_fee_per_bracket: policy?.service_fee_per_bracket ?? 0,
      service_fee_bracket_size: policy?.service_fee_bracket_size ?? 50000,
      cbu_rate: policy?.cbu_rate ?? 0,
      insurance_per_thousand: policy?.insurance_per_thousand ?? 0,
      notarial_fee: policy?.notarial_fee ?? 0,
      // max_loan_amount / penalty_rate: added by
      // loan_fee_policies_add_max_and_penalty.sql. Both nullable — null
      // means "not set", shown as blank rather than 0.
      max_loan_amount: policy?.max_loan_amount ?? "",
      penalty_rate: policy?.penalty_rate ?? "",
      // interest rate lives in loan_types
      interest_rate: loanType?.interest_rate ?? 0,
      loan_type_id: loanType?.id || null,
    });
    setSuccess("");
  };

  useEffect(() => {
    resetDraft();
    // Switching tabs (or a fresh fetch landing) always drops back to
    // view-only — an in-progress edit on one loan type should never carry
    // over, silently armed, onto another.
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCode, feePolicies, loanTypes]);

  const handleCancelEdit = () => {
    resetDraft();
    setEditing(false);
    setError("");
  };

  const handleChange = (field, raw) => {
    setDraft((prev) => prev ? { ...prev, [field]: raw } : prev);
    setSuccess("");
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      // Coerce numeric fields. Keep service_fee_mode as-is.
      const numericFields = [
        "service_fee_per_bracket", "service_fee_bracket_size",
        "cbu_rate", "insurance_per_thousand", "notarial_fee", "interest_rate",
      ];
      const errors = [];
      numericFields.forEach((f) => {
        const n = Number(draft[f]);
        if (!Number.isFinite(n) || n < 0) errors.push(f);
      });
      if (Number(draft.cbu_rate) > 1) errors.push("cbu_rate (must be ≤ 1, i.e. expressed as a decimal — 0.02 for 2%)");

      // max_loan_amount / penalty_rate are nullable — an empty field means
      // "not set", so only validate when the BOD member actually typed
      // something in.
      const maxAmountEntered = String(draft.max_loan_amount ?? "").trim() !== "";
      if (maxAmountEntered) {
        const n = Number(draft.max_loan_amount);
        if (!Number.isFinite(n) || n < 0) errors.push("max_loan_amount");
      }
      const penaltyEntered = String(draft.penalty_rate ?? "").trim() !== "";
      if (penaltyEntered) {
        const n = Number(draft.penalty_rate);
        if (!Number.isFinite(n) || n < 0) errors.push("penalty_rate");
        else if (n > 1) errors.push("penalty_rate (must be ≤ 1, i.e. expressed as a decimal — 0.01 for 1%)");
      }

      if (errors.length) {
        throw new Error(`Invalid value(s): ${errors.join(", ")}`);
      }

      // Capture the acting BOD user so the audit trail records who edited
      // the policy. The DB trigger stamp_loan_fee_policy_actor also fills
      // this from auth.uid() as a fallback, but we send it explicitly so a
      // failed session lookup surfaces here instead of silently anonymizing
      // the change.
      const { data: { session } } = await supabase.auth.getSession();
      const actorId = session?.user?.id || null;
      if (!actorId) {
        throw new Error("Your session has expired. Please sign in again to save policy changes.");
      }

      const feePayload = {
        loan_type_code: draft.loan_type_code,
        // Write the mode the editor actually shows/edits for this tab, not
        // whatever was previously stored — /api/loans/compute's
        // compute_service_fee() branches on this exact value, so saving a
        // stale mode (e.g. Emergency's old 'flat' after this tab switched to
        // bracket math) would silently charge real loans differently from
        // what the preview and the saved fields imply.
        service_fee_mode: fieldsFor.serviceFeeStyle,
        service_fee_per_bracket: Number(draft.service_fee_per_bracket),
        service_fee_bracket_size: Number(draft.service_fee_bracket_size),
        cbu_rate: Number(draft.cbu_rate),
        insurance_per_thousand: Number(draft.insurance_per_thousand),
        notarial_fee: Number(draft.notarial_fee),
        max_loan_amount: maxAmountEntered ? Number(draft.max_loan_amount) : null,
        penalty_rate: penaltyEntered ? Number(draft.penalty_rate) : null,
        updated_by: actorId,
      };

      // Upsert into loan_fee_policies (loan_type_code is unique).
      const { error: feeErr } = await supabase
        .from("loan_fee_policies")
        .upsert(feePayload, { onConflict: "loan_type_code" });
      if (feeErr) throw new Error(`Failed to save fees: ${feeErr.message}`);

      // Update interest rate in loan_types if the type row exists.
      if (draft.loan_type_id) {
        const { error: typeErr } = await supabase
          .from("loan_types")
          .update({ interest_rate: Number(draft.interest_rate) })
          .eq("id", draft.loan_type_id);
        if (typeErr) throw new Error(`Failed to save interest rate: ${typeErr.message}`);
      }

      setSuccess("Policy updated. New values take effect on the next loan computation.");
      await fetchAll();
    } catch (err) {
      setError(err.message || "Failed to save policy.");
    } finally {
      setSaving(false);
    }
  };

  // Which fields the active tab shows — see FIELD_VISIBILITY above.
  const fieldsFor = FIELD_VISIBILITY[activeCode] || FIELD_VISIBILITY.CONSOLIDATED;

  // Live preview of what the fees would be for a sample principal so the BOD
  // editor can see the impact of their change before saving.
  const [previewPrincipal, setPreviewPrincipal] = useState(100000);
  const [previewTerm, setPreviewTerm] = useState(12);
  const preview = useMemo(() => {
    if (!draft) return null;
    const p = Number(previewPrincipal || 0);
    if (p <= 0) return null;

    // Driven by fieldsFor.serviceFeeStyle (what the UI actually shows/edits
    // for this tab), not the stored service_fee_mode — Emergency's DB row
    // still says mode='flat' (a leftover from before this tab used bracket
    // math), but the tab now edits bracket_size for real, so the preview
    // must follow the same rule the editor does or the two silently disagree.
    let serviceFee = 0;
    if (fieldsFor.serviceFeeStyle === "bracket") {
      const per = Number(draft.service_fee_per_bracket || 0);
      const size = Number(draft.service_fee_bracket_size || 0);
      if (size > 0 && per > 0) {
        serviceFee = (Math.floor((Math.trunc(p) - 1) / size) + 1) * per;
      }
    } else {
      serviceFee = Number(draft.service_fee_per_bracket || 0);
    }
    const cbu = fieldsFor.cbu ? p * Number(draft.cbu_rate || 0) : 0;
    const insurance = fieldsFor.insurance ? p * (Number(draft.insurance_per_thousand || 0) / 1000) : 0;
    const notarial = fieldsFor.notarial ? Number(draft.notarial_fee || 0) : 0;
    const total = serviceFee + cbu + insurance + notarial;

    // Interest & amortization — same formulas as /api/loans/compute
    // (main.py), so the preview matches what a real application would show.
    // Consolidated & Bonus/Non-member Bonus: add-on (flat interest every
    // month). Emergency: diminishing (equal principal, interest on the
    // declining balance).
    const term = Math.max(1, Number(previewTerm || 1));
    const monthlyRate = Number(draft.interest_rate || 0) / 100; // draft stores whole-percent, e.g. 0.83
    let amortizationRows = [];
    let totalInterest = 0;
    let firstMonthly = 0;

    if (activeCode === "EMERGENCY") {
      // Mirrors main.py's emergency branch exactly: equal principal per
      // month (last month absorbs the rounding remainder), interest computed
      // on the balance AFTER that month's principal is deducted — not on the
      // opening balance. Getting the order backwards overstates every
      // month's interest (and understates how fast the balance declines).
      const monthlyPrincipal = Math.floor((p / term) * 100) / 100;
      let accumulatedPrincipal = 0;
      let balance = p;
      for (let i = 1; i <= term; i++) {
        const principalPaid = i < term ? monthlyPrincipal : p - accumulatedPrincipal;
        const endingBalance = balance - principalPaid;
        const interestThisMonth = endingBalance * monthlyRate;
        const payment = principalPaid + interestThisMonth;
        if (i === 1) firstMonthly = payment;
        totalInterest += interestThisMonth;
        balance = endingBalance;
        accumulatedPrincipal += principalPaid;
        amortizationRows.push({ month: i, principal: principalPaid, interest: interestThisMonth, payment, balance: Math.max(balance, 0) });
      }
    } else {
      const principalComponent = p / term;
      const interestComponent = p * monthlyRate;
      firstMonthly = principalComponent + interestComponent;
      totalInterest = interestComponent * term;
      for (let i = 1; i <= term; i++) {
        amortizationRows.push({
          month: i,
          principal: principalComponent,
          interest: interestComponent,
          payment: firstMonthly,
          balance: Math.max(p - principalComponent * i, 0),
        });
      }
    }

    const netProceeds = p - total;
    return {
      serviceFee, cbu, insurance, notarial, total, net: netProceeds,
      term, monthlyRate, firstMonthly, totalInterest, totalRepayable: p + totalInterest,
      amortizationRows,
    };
  }, [draft, previewPrincipal, previewTerm, activeCode, fieldsFor]);

  return (
    <div className="flex min-h-screen bg-gray-50">
     <StaffSidebar portal="BOD" items={bodNav} />

      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <StaffTopbar portal="BOD" notifications={<NotificationBell />} />

        <main className="p-8 overflow-auto">
          <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Loan Fee & Interest Policies</h1>
              <p className="text-sm text-gray-500 mt-1">
                {editing
                  ? "Edit the deduction parameters and monthly interest rate for each loan type. Changes apply to all future loan computations and the CBU credit trigger."
                  : "View-only. Click Change Policy to edit the deduction parameters or interest rate for this loan type."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchAll}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                Reload
              </button>
              {!editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  disabled={loading || !draft}
                  className="flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Pencil size={16} />
                  Change Policy
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  <X size={16} />
                  Cancel
                </button>
              )}
            </div>
          </div>

          {!editing && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
              <Lock size={14} className="shrink-0" />
              <span>View-only mode. Click <strong>Change Policy</strong> above to make changes.</span>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Loan type tabs */}
          <div className="mb-6 flex flex-wrap gap-2">
            {LOAN_TYPE_TABS.map((tab) => {
              const hasRow = !!feePolicies[tab.code];
              const isActive = activeCode === tab.code;
              return (
                <button
                  key={tab.code}
                  type="button"
                  onClick={() => setActiveCode(tab.code)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition border ${
                    isActive
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-green-500"
                  }`}
                >
                  {tab.label}
                  {!hasRow && (
                    <span className="ml-2 text-[10px] uppercase opacity-70">(no row)</span>
                  )}
                </button>
              );
            })}
          </div>

          {draft && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Editor — wrapped in a native <fieldset disabled> so view-only
                  mode can't be bypassed by any input this panel contains,
                  including ones added later. Greyscale is a visual echo of
                  that disabled state, not the mechanism enforcing it. */}
              <fieldset
                disabled={!editing}
                className={`lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6 transition-all ${
                  !editing ? "grayscale opacity-75" : ""
                }`}
              >
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Banknote size={18} className="text-primary" />
                  {activeCode} — Policy Values
                </h2>

                {/* Interest rate */}
                <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                  <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                    <Percent size={12} /> Monthly Interest Rate
                  </legend>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={draft.interest_rate}
                      onChange={(e) => handleChange("interest_rate", e.target.value)}
                      disabled={!draft.loan_type_id}
                      className="w-40 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none disabled:bg-gray-100"
                    />
                    <span className="text-sm text-gray-500">% per month</span>
                    {!draft.loan_type_id && (
                      <span className="text-xs text-amber-600">
                        No loan_types row for {activeCode}. Add one before editing the rate.
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Written to <code className="bg-gray-100 px-1 rounded">public.loan_types.interest_rate</code>.
                    Used by the compute endpoint for amortization.
                  </p>
                </fieldset>

                {/* Maximum loan amount — Emergency only */}
                {fieldsFor.maxAmount && (
                  <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                    <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                      <AlertCircle size={12} /> Maximum Loan Amount
                    </legend>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500">₱</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="No cap set"
                        value={formatWithCommas(draft.max_loan_amount)}
                        onChange={(e) => handleChange("max_loan_amount", stripCommas(e.target.value))}
                        className="w-40 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none"
                      />
                      <span className="text-sm text-gray-500">ceiling per application</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Leave blank for no cap. Not yet enforced by the application form — display/reference only until wired into loan submission validation.
                    </p>
                  </fieldset>
                )}

                {/* Service fee — Consolidated/Emergency: bracket math, Mode
                    fixed (never user-switchable, so it's not shown). Bonus/
                    Non-member Bonus: flat only. */}
                <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                  <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                    <Banknote size={12} /> Service Fee
                  </legend>
                  {fieldsFor.serviceFeeStyle === "bracket" ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">
                            Amount (₱)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={formatWithCommas(draft.service_fee_per_bracket)}
                            onChange={(e) => handleChange("service_fee_per_bracket", stripCommas(e.target.value))}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">
                            Per this many pesos of loan (₱)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={formatWithCommas(draft.service_fee_bracket_size)}
                            onChange={(e) => handleChange("service_fee_bracket_size", stripCommas(e.target.value))}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none"
                          />
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        Charge <em>amount</em> for every <em>size</em> pesos (or fraction) of loan principal.
                        Example: ₱100 per ₱50,000 means a ₱60,000 loan pays ₱200.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">₱</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formatWithCommas(draft.service_fee_per_bracket)}
                          onChange={(e) => handleChange("service_fee_per_bracket", stripCommas(e.target.value))}
                          className="w-40 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none"
                        />
                        <span className="text-sm text-gray-500">flat, per loan</span>
                      </div>
                      {/* service_fee_mode/bracket_size are still written on save
                          (kept as "flat" / a large placeholder) so the compute
                          endpoint's existing bracket-vs-flat branch keeps
                          working unchanged for these types. */}
                    </>
                  )}
                </fieldset>

                {/* CBU rate */}
                {fieldsFor.cbu && (
                  <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                    <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                      <Shield size={12} /> Capital Build-Up Deposit
                    </legend>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        max="1"
                        value={draft.cbu_rate}
                        onChange={(e) => handleChange("cbu_rate", e.target.value)}
                        className="w-40 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none"
                      />
                      <span className="text-sm text-gray-500">
                        (decimal — enter <code className="bg-gray-100 px-1 rounded">0.02</code> for 2%, currently{" "}
                        <strong>{(Number(draft.cbu_rate || 0) * 100).toFixed(2)}%</strong>)
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      This is the rate the disbursement trigger uses to credit the member's CBU ledger.
                    </p>
                  </fieldset>
                )}

                {/* Insurance — Consolidated/Emergency only */}
                {fieldsFor.insurance && (
                  <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                    <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                      Insurance Fee
                    </legend>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500">₱</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatWithCommas(draft.insurance_per_thousand)}
                        onChange={(e) => handleChange("insurance_per_thousand", stripCommas(e.target.value))}
                        className="w-40 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none"
                      />
                      <span className="text-sm text-gray-500">per ₱1,000 of principal</span>
                    </div>
                  </fieldset>
                )}

                {/* Notarial — Consolidated/Emergency only */}
                {fieldsFor.notarial && (
                  <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                    <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                      Notarial Fee
                    </legend>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500">₱</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatWithCommas(draft.notarial_fee)}
                        onChange={(e) => handleChange("notarial_fee", stripCommas(e.target.value))}
                        className="w-40 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none"
                      />
                      <span className="text-sm text-gray-500">flat per release</span>
                    </div>
                  </fieldset>
                )}

                {/* Penalty rate — Bonus/Non-member Bonus only */}
                {fieldsFor.penalty && (
                  <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                    <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                      <AlertTriangle size={12} /> Penalty Rate
                    </legend>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        max="1"
                        placeholder="Not set"
                        value={draft.penalty_rate}
                        onChange={(e) => handleChange("penalty_rate", e.target.value)}
                        className="w-40 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none"
                      />
                      <span className="text-sm text-gray-500">
                        % per month on overdue/unrenewed balance
                        {draft.penalty_rate !== "" && (
                          <> (currently <strong>{(Number(draft.penalty_rate || 0) * 100).toFixed(2)}%</strong>)</>
                        )}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Leave blank for no penalty configured. Not yet enforced by payment/renewal processing — display/reference only until that workflow is finalized.
                    </p>
                  </fieldset>
                )}

                {editing && (
                  <div className="flex justify-end pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || loading}
                      className="flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save size={16} />
                      {saving ? "Saving..." : "Save Policy"}
                    </button>
                  </div>
                )}
              </fieldset>

              {/* Preview */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 self-start">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Live Preview</h2>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Sample Principal (₱)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatWithCommas(previewPrincipal)}
                      onChange={(e) => setPreviewPrincipal(stripCommas(e.target.value))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Term (months)</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={previewTerm}
                      onChange={(e) => setPreviewTerm(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none"
                    />
                  </div>
                </div>

                {preview ? (
                  <>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-gray-600">Service Fee</span><span className="font-mono">₱{formatNumber(preview.serviceFee, { maxDecimals: 2 })}</span></div>
                      {fieldsFor.cbu && (
                        <div className="flex justify-between"><span className="text-gray-600">CBU ({(Number(draft.cbu_rate || 0) * 100).toFixed(2)}%)</span><span className="font-mono text-primary">₱{formatNumber(preview.cbu, { maxDecimals: 2 })}</span></div>
                      )}
                      {fieldsFor.insurance && (
                        <div className="flex justify-between"><span className="text-gray-600">Insurance</span><span className="font-mono">₱{formatNumber(preview.insurance, { maxDecimals: 2 })}</span></div>
                      )}
                      {fieldsFor.notarial && (
                        <div className="flex justify-between"><span className="text-gray-600">Notarial</span><span className="font-mono">₱{formatNumber(preview.notarial, { maxDecimals: 2 })}</span></div>
                      )}
                      <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1.5 font-semibold"><span>Total Deductions</span><span className="font-mono">₱{formatNumber(preview.total, { maxDecimals: 2 })}</span></div>
                      <div className="flex justify-between font-bold"><span>Net Proceeds</span><span className="font-mono text-primary">₱{formatNumber(preview.net, { maxDecimals: 2 })}</span></div>
                    </div>

                    {/* Interest & amortization — same formulas as
                        /api/loans/compute: add-on for Consolidated/Bonus/
                        Non-member Bonus, diminishing for Emergency. */}
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Monthly Rate</span>
                        <span className="font-mono">{(preview.monthlyRate * 100).toFixed(4)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">{activeCode === "EMERGENCY" ? "1st Month Payment" : "Monthly Amortization"}</span>
                        <span className="font-mono">₱{formatNumber(preview.firstMonthly, { maxDecimals: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Interest ({preview.term}mo)</span>
                        <span className="font-mono">₱{formatNumber(preview.totalInterest, { maxDecimals: 2 })}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Total Repayable</span>
                        <span className="font-mono">₱{formatNumber(preview.totalRepayable, { maxDecimals: 2 })}</span>
                      </div>
                    </div>

                    {/* Amortization schedule — collapsed to a scrollable table
                        so a 60-month Consolidated preview doesn't blow out the
                        page height. */}
                    <details className="mt-4">
                      <summary className="text-xs font-semibold text-gray-600 cursor-pointer hover:text-gray-900">
                        Show amortization schedule ({preview.amortizationRows.length} months)
                      </summary>
                      <div className="mt-2 max-h-64 overflow-y-auto border border-gray-100 rounded-md">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-gray-50">
                            <tr className="text-gray-500">
                              <th className="text-left px-2 py-1 font-semibold">#</th>
                              <th className="text-right px-2 py-1 font-semibold">Principal</th>
                              <th className="text-right px-2 py-1 font-semibold">Interest</th>
                              <th className="text-right px-2 py-1 font-semibold">Payment</th>
                              <th className="text-right px-2 py-1 font-semibold">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.amortizationRows.map((row) => (
                              <tr key={row.month} className="border-t border-gray-100">
                                <td className="px-2 py-1 text-gray-500">{row.month}</td>
                                <td className="px-2 py-1 text-right font-mono">₱{formatNumber(row.principal, { maxDecimals: 2 })}</td>
                                <td className="px-2 py-1 text-right font-mono">₱{formatNumber(row.interest, { maxDecimals: 2 })}</td>
                                <td className="px-2 py-1 text-right font-mono">₱{formatNumber(row.payment, { maxDecimals: 2 })}</td>
                                <td className="px-2 py-1 text-right font-mono">₱{formatNumber(row.balance, { maxDecimals: 2 })}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </>
                ) : (
                  <p className="text-xs text-gray-500">Enter a principal to see the preview.</p>
                )}

                <p className="mt-4 text-[10px] text-gray-400 leading-snug">
                  Preview uses your unsaved values. Click Save Policy to commit the change.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Loan_Policies;