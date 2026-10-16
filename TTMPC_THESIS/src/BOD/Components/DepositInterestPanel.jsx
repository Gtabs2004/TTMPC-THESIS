import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { formatWithCommas, stripCommas } from "../../utils/numberFormat";
import {
  Save, RefreshCw, AlertCircle, CheckCircle2, Percent, PiggyBank, Clock, Pencil, X, Lock,
} from "lucide-react";

// Deposit-side interest (what the coop PAYS members), stored in
// public.deposit_interest_policies (deposit_interest_policies_schema.sql).
// annual_rate is whole percent per year, e.g. 3 = 3% p.a.
// TD rates are edited per principal bracket in deposit_interest_policy_tiers.
const PRODUCT_CODES = {
  SAVINGS: ["SAVINGS"],
  TIME_DEPOSIT: ["TD_6M", "TD_12M"],
};

const FREQUENCIES = [
  { value: "monthly", label: "Monthly", periodsPerYear: 12 },
  { value: "quarterly", label: "Quarterly", periodsPerYear: 4 },
  { value: "semi_annual", label: "Semi-annual", periodsPerYear: 2 },
  { value: "annual", label: "Annual", periodsPerYear: 1 },
];

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DepositInterestPanel = ({ product }) => {
  const codes = PRODUCT_CODES[product];
  const [rows, setRows] = useState({});     // keyed by product_code, last saved
  const [draft, setDraft] = useState({});   // keyed by product_code, editable copy
  const [tierRows, setTierRows] = useState({});
  const [tierDraft, setTierDraft] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sample, setSample] = useState(50000);

  const toDraft = (map) => {
    const d = {};
    codes.forEach((c) => {
      const r = map[c] || {};
      d[c] = {
        annual_rate: r.annual_rate ?? "",
        crediting_frequency: r.crediting_frequency || "monthly",
        minimum_balance: r.minimum_balance ?? "",
      };
    });
    return d;
  };

  const toTierDraft = (map) => Object.fromEntries(
    Object.entries(map).map(([code, tiers]) => [
      code,
      tiers.map((tier) => ({ ...tier, annual_rate_percent: tier.annual_rate_percent ?? "" })),
    ])
  );

  const fetchRows = async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: err } = await supabase
        .from("deposit_interest_policies")
        .select("*")
        .in("product_code", codes);
      if (err) throw new Error(`deposit_interest_policies: ${err.message}`);
      const map = {};
      (data || []).forEach((r) => { map[r.product_code] = r; });
      setRows(map);
      setDraft(toDraft(map));

      if (product === "TIME_DEPOSIT") {
        const { data: tierData, error: tierError } = await supabase
          .from("deposit_interest_policy_tiers")
          .select("*")
          .in("product_code", codes)
          .order("product_code")
          .order("term_days")
          .order("bracket_min");
        if (tierError) throw new Error(`deposit_interest_policy_tiers: ${tierError.message}`);
        const tierMap = {};
        (tierData || []).forEach((tier) => {
          tierMap[tier.product_code] = [...(tierMap[tier.product_code] || []), tier];
        });
        setTierRows(tierMap);
        setTierDraft(toTierDraft(tierMap));
      } else {
        setTierRows({});
        setTierDraft({});
      }
    } catch (e) {
      setError(e.message || "Failed to load interest policies.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setEditing(false);
    setSuccess("");
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const setField = (code, field, value) => {
    setDraft((prev) => ({ ...prev, [code]: { ...prev[code], [field]: value } }));
    setSuccess("");
  };

  const handleCancel = () => {
    setDraft(toDraft(rows));
    setTierDraft(toTierDraft(tierRows));
    setEditing(false);
    setError("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        throw new Error("Your session has expired. Please sign in again to save policy changes.");
      }
      if (product === "TIME_DEPOSIT") {
        for (const code of codes) {
          for (const tier of tierDraft[code] || []) {
            const rate = Number(tier.annual_rate_percent);
            if (!Number.isFinite(rate) || rate < 0 || rate >= 100) {
              throw new Error(`${tier.bracket_label}: enter an annual rate from 0 to 99.99 (%).`);
            }
            const { data, error: err } = await supabase
              .from("deposit_interest_policy_tiers")
              .update({ annual_rate_percent: rate, updated_by: session.user.id })
              .eq("id", tier.id)
              .select("id");
            if (err) throw new Error(`Failed to save ${tier.bracket_label}: ${err.message}`);
            if (!data?.length) throw new Error(`${tier.bracket_label} was not saved.`);
          }
        }
      } else for (const code of codes) {
        const d = draft[code];
        const rate = Number(d.annual_rate);
        if (String(d.annual_rate).trim() === "" || !Number.isFinite(rate) || rate < 0 || rate >= 100) {
          throw new Error(`${rows[code]?.product_name || code}: enter an annual rate from 0 to 99.99 (%).`);
        }
        const minEntered = String(d.minimum_balance ?? "").trim() !== "";
        const min = Number(d.minimum_balance);
        if (minEntered && (!Number.isFinite(min) || min < 0)) {
          throw new Error(`${rows[code]?.product_name || code}: minimum amount must be 0 or more.`);
        }
        const payload = {
          annual_rate: rate,
          minimum_balance: minEntered ? min : null,
          updated_by: session.user.id,
        };
        if (code === "SAVINGS") payload.crediting_frequency = d.crediting_frequency;

        const { data, error: err } = await supabase
          .from("deposit_interest_policies")
          .update(payload)
          .eq("product_code", code)
          .select("product_code");
        if (err) throw new Error(`Failed to save ${code}: ${err.message}`);
        // RLS blocks by matching 0 rows, not by erroring.
        if (!data?.length) {
          throw new Error(`${code} was not saved: the row is missing or your account isn't allowed to edit interest policies.`);
        }
      }
      setSuccess("Interest policy updated. New values apply to the next interest computation.");
      setEditing(false);
      await fetchRows();
    } catch (e) {
      setError(e.message || "Failed to save interest policy.");
    } finally {
      setSaving(false);
    }
  };

  // Live preview using the unsaved values.
  const preview = useMemo(() => {
    const p = Number(sample || 0);
    if (!(p > 0)) return null;
    if (product === "SAVINGS") {
      const d = draft.SAVINGS;
      if (!d) return null;
      const rate = Number(d.annual_rate || 0) / 100;
      const freq = FREQUENCIES.find((f) => f.value === d.crediting_frequency) || FREQUENCIES[0];
      const min = Number(d.minimum_balance || 0);
      const earns = p >= min;
      const perPeriod = earns ? (p * rate) / freq.periodsPerYear : 0;
      return { kind: "savings", freq, earns, min, perPeriod, perYear: perPeriod * freq.periodsPerYear };
    }
    return {
      kind: "td",
      terms: codes.map((code) => {
        const days = code === "TD_6M" ? 180 : 365;
        const tiers = tierDraft[code] || [];
        const tier = tiers.find((candidate) => (
          p >= Number(candidate.bracket_min)
          && (candidate.bracket_max == null || p <= Number(candidate.bracket_max))
        ));
        if (!tier) {
          return { code, name: rows[code]?.product_name || code, days, belowMin: true, min: 50000 };
        }
        const rate = Number(tier.annual_rate_percent || 0) / 100;
        const interest = days === 180 ? (p * rate * 180) / 365 : p * rate;
        return {
          code,
          name: rows[code]?.product_name || code,
          days,
          rate: Number(tier.annual_rate_percent),
          bracket: tier.bracket_label,
          interest,
          total: p + interest,
          belowMin: false,
        };
      }),
    };
  }, [draft, sample, product, rows, codes, tierDraft]);

  const missing = codes.filter((c) => !rows[c]);
  const inputCls = "w-40 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none";

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={fetchRows}
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
            disabled={loading || missing.length > 0}
            className="flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Pencil size={16} />
            Change Policy
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
          >
            <X size={16} />
            Cancel
          </button>
        )}
      </div>

      {!editing && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
          <Lock size={14} className="shrink-0" />
          <span>View-only mode. Click <strong>Change Policy</strong> above to make changes.</span>
        </div>
      )}
      {missing.length > 0 && !loading && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>
            No policy row for {missing.join(", ")}. Run <code className="bg-amber-100 px-1 rounded">deposit_interest_policies_schema.sql</code> in Supabase first.
          </span>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <fieldset
          disabled={!editing}
          className={`lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6 transition-all ${!editing ? "grayscale opacity-75" : ""}`}
        >
          <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
            {product === "SAVINGS" ? <PiggyBank size={18} className="text-primary" /> : <Clock size={18} className="text-primary" />}
            {product === "SAVINGS" ? "Regular Savings — Interest" : "Time Deposit — Interest"}
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            The cooperative hasn't fixed these rates yet. They are saved in{" "}
            <code className="bg-gray-100 px-1 rounded">deposit_interest_policies</code> and read by interest computations.
          </p>

          {product === "SAVINGS" && draft.SAVINGS && (
            <>
              <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                  <Percent size={12} /> Annual Interest Rate
                </legend>
                <div className="flex items-center gap-3">
                  <input
                    type="number" step="0.0001" min="0"
                    value={draft.SAVINGS.annual_rate}
                    onChange={(e) => setField("SAVINGS", "annual_rate", e.target.value)}
                    className={inputCls}
                  />
                  <span className="text-sm text-gray-500">% per year</span>
                </div>
              </fieldset>
              <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                  Interest Credited
                </legend>
                <select
                  value={draft.SAVINGS.crediting_frequency}
                  onChange={(e) => setField("SAVINGS", "crediting_frequency", e.target.value)}
                  className={inputCls}
                >
                  {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <p className="mt-2 text-xs text-gray-500">How often interest is added to the member's savings. Monthly for now.</p>
              </fieldset>
              <fieldset className="mb-6 border border-gray-200 rounded-lg p-4">
                <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                  Minimum Balance to Earn Interest
                </legend>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">₱</span>
                  <input
                    type="text" inputMode="decimal" placeholder="No minimum"
                    value={formatWithCommas(draft.SAVINGS.minimum_balance)}
                    onChange={(e) => setField("SAVINGS", "minimum_balance", stripCommas(e.target.value))}
                    className={inputCls}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">Leave blank if every balance earns interest.</p>
              </fieldset>
            </>
          )}

          {product === "TIME_DEPOSIT" && codes.map((code) => tierDraft[code] && (
            <fieldset key={code} className="mb-6 border border-gray-200 rounded-lg p-4">
              <legend className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                <Clock size={12} /> {rows[code]?.product_name || code}
              </legend>
              <div className="space-y-3">
                {tierDraft[code].map((tier) => (
                  <div key={tier.id} className="grid grid-cols-1 md:grid-cols-[1fr_auto] items-end gap-3 rounded-lg bg-gray-50 p-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-700">{tier.bracket_label}</p>
                      <p className="text-[11px] text-gray-500">{tier.term_days} days</p>
                    </div>
                    <label className="text-xs font-semibold text-gray-600">
                      Annual rate
                      <span className="ml-2 inline-flex items-center gap-2 font-normal">
                        <input
                          type="number" step="0.0001" min="0" max="99.99"
                          value={tier.annual_rate_percent}
                          onChange={(e) => setTierDraft((prev) => ({
                            ...prev,
                            [code]: prev[code].map((candidate) => candidate.id === tier.id
                              ? { ...candidate, annual_rate_percent: e.target.value }
                              : candidate),
                          }))}
                          className={`${inputCls} w-28`}
                        />
                        <span className="text-sm text-gray-500">%</span>
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          {product === "TIME_DEPOSIT" && (
            <p className="text-xs text-gray-500">
              Rates are selected per placement principal and term. A placement stores the applied rate and bracket at
              opening, so later policy changes do not rewrite existing certificates.
            </p>
          )}

          {editing && (
            <div className="flex justify-end pt-4 mt-2 border-t border-gray-100">
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

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 self-start">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Live Preview</h2>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            {product === "SAVINGS" ? "Sample Balance (₱)" : "Sample Placement (₱)"}
          </label>
          <input
            type="text" inputMode="decimal"
            value={formatWithCommas(sample)}
            onChange={(e) => setSample(stripCommas(e.target.value))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none mb-4"
          />

          {preview?.kind === "savings" && (
            <div className="space-y-1.5 text-sm">
              {!preview.earns ? (
                <p className="text-amber-700 text-xs">Below the {peso(preview.min)} minimum — earns no interest.</p>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Interest per {preview.freq.label.toLowerCase()} credit</span>
                    <span className="font-mono">{peso(preview.perPeriod)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Interest per year</span>
                    <span className="font-mono text-primary">{peso(preview.perYear)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {preview?.kind === "td" && (
            <div className="space-y-4 text-sm">
              {preview.terms.map((t) => (
                <div key={t.code} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                  <p className="font-semibold text-gray-800 mb-1">{t.name}</p>
                  {t.belowMin ? (
                    <p className="text-amber-700 text-xs">No applicable bracket below ₱50,000.00.</p>
                  ) : (
                    <>
                      <p className="text-gray-500 text-xs mb-1">{t.days} days · {t.rate}% · {t.bracket}</p>
                      <div className="flex justify-between"><span className="text-gray-600">Interest at maturity</span><span className="font-mono">{peso(t.interest)}</span></div>
                      <div className="flex justify-between font-semibold"><span>Total at maturity</span><span className="font-mono text-primary">{peso(t.total)}</span></div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-[10px] text-gray-400 leading-snug">
            Simple interest, before any tax. Preview uses your unsaved values.
          </p>
        </div>
      </div>
    </>
  );
};

export default DepositInterestPanel;
