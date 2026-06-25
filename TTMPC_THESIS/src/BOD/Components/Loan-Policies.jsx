import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity } from "../../components/PortalIdentity";
import { supabase } from "../../supabaseClient";
import {
  LayoutDashboard, Users, Archive, CalendarCheck, CreditCard,
  Save, RefreshCw, AlertCircle, CheckCircle2, Percent, Banknote, Shield, FileText,ShieldCheck,
  AlertTriangle,
  CalendarDays,
  History
} from "lucide-react";
import NotificationBell from "./NotificationBell";

const SERVICE_FEE_MODES = [
  { value: "bracket", label: "Per bracket" },
  { value: "flat", label: "Flat amount" },
  { value: "none", label: "Not charged" },
];

// Loan-type labels for the tab strip. Order is intentional: CONSOLIDATED first
// because it carries every fee, BONUS types last because they carry only a
// service fee.
const LOAN_TYPE_TABS = [
  { code: "CONSOLIDATED", label: "Consolidated" },
  { code: "EMERGENCY", label: "Emergency" },
  { code: "BONUS", label: "Bonus" },
  { code: "NONMEMBER_BONUS", label: "Non-member Bonus" },
];

const formatNumber = (value, opts = {}) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-PH", {
    minimumFractionDigits: opts.minDecimals ?? 2,
    maximumFractionDigits: opts.maxDecimals ?? 4,
  });
};

const Loan_Policies = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();

  const [activeCode, setActiveCode] = useState("CONSOLIDATED");
  const [feePolicies, setFeePolicies] = useState({});      // keyed by loan_type_code
  const [loanTypes, setLoanTypes] = useState({});          // keyed by code → { id, interest_rate, name }
  const [draft, setDraft] = useState(null);               // editable copy of the active row
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

    const menuItems = [
      {
        section: "BOD",
        items: [
          { name: "Dashboard", icon: LayoutDashboard },
          { name: "Member Approvals", icon: Users },
          { name: "Loan Approvals", icon: ShieldCheck },
          { name: "Manage Loans", icon: CreditCard },
          { name: "Manage Member", icon: Users },
          { name: "Termination Inbox", icon: AlertTriangle },
          { name: "Audit Log", icon: History },
          { name: "Loan Policies", icon: FileText },
        ],
      },
      {
        section: "SECRETARY",
        items: [
          { name: "Training Attendance", icon: CalendarCheck },
          { name: "General Assembly", icon: CalendarDays },
          { name: "Membership Records", icon: Archive },
        ],
      },
    ];

  const handleSignOut = async (e) => {
    e.preventDefault();
    try { await signOut(); navigate("/"); }
    catch (err) { console.error("Failed to sign out:", err); }
  };

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

  // Whenever the active tab or the fetched data changes, reset the draft.
  useEffect(() => {
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
      // interest rate lives in loan_types
      interest_rate: loanType?.interest_rate ?? 0,
      loan_type_id: loanType?.id || null,
    });
    setSuccess("");
  }, [activeCode, feePolicies, loanTypes]);

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
      if (errors.length) {
        throw new Error(`Invalid value(s): ${errors.join(", ")}`);
      }

      const feePayload = {
        loan_type_code: draft.loan_type_code,
        service_fee_mode: draft.service_fee_mode,
        service_fee_per_bracket: Number(draft.service_fee_per_bracket),
        service_fee_bracket_size: Number(draft.service_fee_bracket_size),
        cbu_rate: Number(draft.cbu_rate),
        insurance_per_thousand: Number(draft.insurance_per_thousand),
        notarial_fee: Number(draft.notarial_fee),
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

  // Live preview of what the fees would be for a sample principal so the BOD
  // editor can see the impact of their change before saving.
  const [previewPrincipal, setPreviewPrincipal] = useState(100000);
  const preview = useMemo(() => {
    if (!draft) return null;
    const p = Number(previewPrincipal || 0);
    if (p <= 0) return null;

    let serviceFee = 0;
    if (draft.service_fee_mode === "flat") {
      serviceFee = Number(draft.service_fee_per_bracket || 0);
    } else if (draft.service_fee_mode === "bracket") {
      const per = Number(draft.service_fee_per_bracket || 0);
      const size = Number(draft.service_fee_bracket_size || 0);
      if (size > 0 && per > 0) {
        serviceFee = (Math.floor((Math.trunc(p) - 1) / size) + 1) * per;
      }
    }
    const cbu = p * Number(draft.cbu_rate || 0);
    const insurance = p * (Number(draft.insurance_per_thousand || 0) / 1000);
    const notarial = Number(draft.notarial_fee || 0);
    const total = serviceFee + cbu + insurance + notarial;
    return { serviceFee, cbu, insurance, notarial, total, net: p - total };
  }, [draft, previewPrincipal]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200 shrink-0">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="BOD Portal" fallbackRole="BOD" />
          </div>
        </div>
        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((group) => (
            <div key={group.section} className="mb-4 flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">{group.section}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const routeMap = {
                  "Dashboard": "/BOD-dashboard",
                  "Member Approvals": "/member-approvals",
                  "Loan Approvals": "/bod-loan-approvals",
                  "Manage Loans": "/bod-manage-loans",
                  "Manage Member": "/bod-manage-member",
                  "Termination Inbox": "/bod-termination-inbox",
                  "Audit Log": "/bod-audit-log",
                  "Loan Policies": "/bod-loan-policies",
                  "Training Attendance": "/Secretary_Attendance",
                  "General Assembly": "/Secretary_Assembly", // Added this fallback
                  "Membership Records": "/Secretary_Records",
                };
                const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;
                
                return (
                  <NavLink
                    key={item.name}
                    to={to} // FIX: Changed from item.to to to
                    className={({ isActive }) =>
                      `flex items-center gap-3 p-2 rounded-md transition-colors ${
                        isActive
                          ? "bg-green-50 text-green-700 font-semibold"
                          : "text-gray-700 hover:bg-green-50 hover:text-green-700"
                      }`
                    }
                  >
                    <Icon size={20} /><span>{item.name}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100 shrink-0 gap-4">
          <NotificationBell />
          <p className="font-medium text-gray-700">BOD</p>
        </header>

        <main className="p-8 overflow-auto">
          <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Loan Fee & Interest Policies</h1>
              <p className="text-sm text-gray-500 mt-1">
                Edit the deduction parameters and monthly interest rate for each loan type. Changes apply to all future loan computations and the CBU credit trigger.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchAll}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Reload
            </button>
          </div>

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
              {/* Editor */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Banknote size={18} className="text-[#389734]" />
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

                {/* Service fee */}
                <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                  <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                    <Banknote size={12} /> Service Fee
                  </legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Mode</label>
                      <select
                        value={draft.service_fee_mode}
                        onChange={(e) => handleChange("service_fee_mode", e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#66B538] outline-none"
                      >
                        {SERVICE_FEE_MODES.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        {draft.service_fee_mode === "flat" ? "Flat amount (₱)" : "Amount per bracket (₱)"}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={draft.service_fee_per_bracket}
                        onChange={(e) => handleChange("service_fee_per_bracket", e.target.value)}
                        disabled={draft.service_fee_mode === "none"}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        Bracket size (₱)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        value={draft.service_fee_bracket_size}
                        onChange={(e) => handleChange("service_fee_bracket_size", e.target.value)}
                        disabled={draft.service_fee_mode !== "bracket"}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Bracket mode: charge <em>amount</em> for every <em>size</em> pesos (or fraction) of principal.
                    Example: ₱100 per ₱50,000 means a ₱60,000 loan pays ₱200.
                  </p>
                </fieldset>

                {/* CBU rate */}
                <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                  <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                    <Shield size={12} /> Capital Build-Up Retention
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

                {/* Insurance */}
                <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                  <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                    Insurance Fee
                  </legend>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">₱</span>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={draft.insurance_per_thousand}
                      onChange={(e) => handleChange("insurance_per_thousand", e.target.value)}
                      className="w-40 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none"
                    />
                    <span className="text-sm text-gray-500">per ₱1,000 of principal</span>
                  </div>
                </fieldset>

                {/* Notarial */}
                <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                  <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                    Notarial Fee
                  </legend>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={draft.notarial_fee}
                      onChange={(e) => handleChange("notarial_fee", e.target.value)}
                      className="w-40 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none"
                    />
                    <span className="text-sm text-gray-500">flat per release</span>
                  </div>
                </fieldset>

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
              </div>

              {/* Preview */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 self-start">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Live Preview</h2>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Sample Principal (₱)</label>
                <input
                  type="number"
                  step="1000"
                  min="0"
                  value={previewPrincipal}
                  onChange={(e) => setPreviewPrincipal(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none mb-4"
                />

                {preview ? (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-gray-600">Service Fee</span><span className="font-mono">₱{formatNumber(preview.serviceFee, { maxDecimals: 2 })}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">CBU ({(Number(draft.cbu_rate || 0) * 100).toFixed(2)}%)</span><span className="font-mono text-[#389734]">₱{formatNumber(preview.cbu, { maxDecimals: 2 })}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Insurance</span><span className="font-mono">₱{formatNumber(preview.insurance, { maxDecimals: 2 })}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Notarial</span><span className="font-mono">₱{formatNumber(preview.notarial, { maxDecimals: 2 })}</span></div>
                    <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1.5 font-semibold"><span>Total Deductions</span><span className="font-mono">₱{formatNumber(preview.total, { maxDecimals: 2 })}</span></div>
                    <div className="flex justify-between font-bold"><span>Net Proceeds</span><span className="font-mono text-[#389734]">₱{formatNumber(preview.net, { maxDecimals: 2 })}</span></div>
                  </div>
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