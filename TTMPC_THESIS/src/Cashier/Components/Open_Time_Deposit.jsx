import React, { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, LoaderCircle, Search, UserRound, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import { useNotification } from "../../contex/NotificationContext";
import { authHeaders } from "../../utils/authHeaders";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const formatCurrency = (value) => `₱${Number(value || 0).toLocaleString("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const Open_Time_Deposit = () => {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState([]);
  const [member, setMember] = useState(null);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberLoading, setMemberLoading] = useState(false);
  const [principal, setPrincipal] = useState("");
  const [termDays, setTermDays] = useState(180);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [overrideMinimum, setOverrideMinimum] = useState(false);

  const MIN_PLACEMENT = 50000;
  const belowMinimum = Number(principal) > 0 && Number(principal) < MIN_PLACEMENT;

  const openMemberPicker = async () => {
    setMemberModalOpen(true);
    if (members.length > 0) return;
    setMemberLoading(true);
    try {
      const headers = await authHeaders();
      const response = await fetch(`${API_BASE_URL}/api/time-deposits/members`, { headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.detail || "Unable to load members.");
      setMembers(payload.data || []);
    } catch (err) {
      setError(err.message || "Unable to load members.");
    } finally {
      setMemberLoading(false);
    }
  };

  const visibleMembers = members.filter((candidate) => {
    const term = search.trim().toLowerCase();
    return !term
      || String(candidate.name || "").toLowerCase().includes(term)
      || String(candidate.membership_id || "").toLowerCase().includes(term);
  });

  useEffect(() => {
    const amount = Number(principal);
    if (!(amount > 0)) {
      setPreview(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setStatus("previewing");
      try {
        const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
        const response = await fetch(`${API_BASE_URL}/api/time-deposits/preview`, {
          method: "POST",
          headers,
          body: JSON.stringify({ principal: amount, term_days: termDays }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.detail || "No applicable rate policy.");
        if (!cancelled) {
          setPreview(payload.data);
          setError("");
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setError(err.message || "Unable to calculate the placement.");
          setStatus("error");
        }
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [principal, termDays]);

  const openPlacement = async (event) => {
    event.preventDefault();
    if (!member) {
      setError("Select a member before opening the certificate.");
      return;
    }
    if (!preview && !(belowMinimum && overrideMinimum)) {
      setError("Enter a principal with an applicable rate bracket, or check the minimum override.");
      return;
    }
    setStatus("submitting");
    setError("");
    try {
      const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
      const response = await fetch(`${API_BASE_URL}/api/time-deposits/open`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          member_id: member.id,
          principal: Number(principal),
          term_days: termDays,
          opening_key: crypto.randomUUID(),
          override_minimum: belowMinimum && overrideMinimum,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.detail || "Unable to open the Time Deposit.");
      setResult(payload.data);
      setStatus("success");
      addNotification("Time Deposit opened successfully.", "success");
    } catch (err) {
      setError(err.message || "Unable to open the Time Deposit.");
      setStatus("error");
    }
  };

  if (result) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <StaffSidebar portal="Cashier" items={cashierNav} />
        <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
          <StaffTopbar portal="Cashier" notifications={<LoanNotificationBell role="cashier" />} />
          <main className="p-8">
            <div className="mx-auto max-w-2xl rounded-xl border border-emerald-200 bg-white p-8 shadow-sm">
              <CheckCircle2 className="mb-4 text-emerald-600" size={42} />
              <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">Time Deposit Opened</p>
              <h1 className="mt-2 text-3xl font-bold text-gray-900">{result.certificate_number}</h1>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 text-sm">
                <div><span className="text-gray-500">Member</span><p className="font-semibold">{member.name}</p></div>
                <div><span className="text-gray-500">Principal</span><p className="font-semibold">{formatCurrency(result.principal)}</p></div>
                <div><span className="text-gray-500">Term and rate</span><p className="font-semibold">{result.term_days} days · {(Number(result.annual_rate) * 100).toFixed(2)}%</p></div>
                <div><span className="text-gray-500">Maturity date</span><p className="font-semibold">{result.maturity_date}</p></div>
                <div><span className="text-gray-500">Expected interest earned</span><p className="font-semibold text-emerald-700">{formatCurrency(result.expected_interest)}</p></div>
                <div><span className="text-gray-500">Maturity value</span><p className="font-semibold">{formatCurrency(result.expected_maturity_value)}</p></div>
              </div>
              <button type="button" onClick={() => navigate("/Cashier_Savings")} className="mt-8 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700">Back to Time Deposits</button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Cashier" items={cashierNav} />
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Cashier" notifications={<LoanNotificationBell role="cashier" />} />
        <main className="p-8">
          <button type="button" onClick={() => navigate("/Cashier_Savings")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-green-700"><ArrowLeft size={16} /> Back to Savings</button>
          <h1 className="text-3xl font-bold text-gray-900">Open Time Deposit</h1>
          <p className="mt-1 text-sm text-gray-500">Create a member-linked certificate using the current cooperative rate policy.</p>

          {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <form onSubmit={openPlacement} className="mt-6 grid max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">Member and placement</h2>
              <label className="mt-5 block text-sm font-semibold text-gray-700">Member</label>
              <button type="button" onClick={openMemberPicker} className="mt-2 flex h-11 w-full items-center justify-between rounded-lg border border-gray-300 px-3 text-left text-sm hover:border-green-600">
                <span className="flex items-center gap-2"><UserRound size={17} className="text-green-700" />{member ? member.name : "Select a member"}</span>
                <Search size={16} className="text-gray-400" />
              </button>
              {member && <div className="mt-3 flex items-center gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><UserRound size={18} /><span><strong className="block">{member.name}</strong>{member.membership_id}</span></div>}

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-gray-700">Principal (₱)<input type="number" min="0.01" step="0.01" value={principal} onChange={(event) => { setPrincipal(event.target.value); setOverrideMinimum(false); }} className="mt-2 h-10 w-full rounded-lg border border-gray-300 px-3 font-normal outline-none focus:border-green-600" /></label>
                <label className="text-sm font-semibold text-gray-700">Term<select value={termDays} onChange={(event) => setTermDays(Number(event.target.value))} className="mt-2 h-10 w-full rounded-lg border border-gray-300 px-3 font-normal outline-none focus:border-green-600"><option value={180}>180 days (6 months)</option><option value={365}>365 days (1 year)</option></select></label>
              </div>

              {belowMinimum && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-800">This principal is below the ₱50,000 minimum for a Time Deposit.</p>
                  <label className="mt-2 flex items-center gap-2 text-xs text-amber-800">
                    <input type="checkbox" checked={overrideMinimum} onChange={(event) => setOverrideMinimum(event.target.checked)} />
                    Override and place it anyway (uses the ₱50,000–199,999.99 rate tier)
                  </label>
                </div>
              )}
            </section>

            <aside className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">Placement preview</h2>
              {status === "previewing" && <div className="mt-6 flex items-center gap-2 text-sm text-gray-500"><LoaderCircle className="animate-spin" size={16} /> Calculating...</div>}
              {!preview && status !== "previewing" && !(belowMinimum && overrideMinimum) && <p className="mt-6 text-sm text-gray-500">Enter a principal to see the applicable rate and expected maturity value.</p>}
              {!preview && belowMinimum && overrideMinimum && (
                <div className="mt-5 space-y-3 text-sm">
                  <div className="rounded-lg bg-amber-50 p-3">
                    <p className="font-semibold text-amber-800">Below-minimum placement (override)</p>
                    <p className="mt-1 text-amber-700">No standard rate bracket applies; the ₱50,000–199,999.99 tier's rate will be used.</p>
                  </div>
                  <button type="submit" disabled={!member || status === "submitting"} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {status === "submitting" ? <><LoaderCircle className="animate-spin" size={16} /> Opening...</> : <><Clock3 size={16} /> Open Below-Minimum Time Deposit</>}
                  </button>
                </div>
              )}
              {preview && <div className="mt-5 space-y-3 text-sm"><div className="rounded-lg bg-gray-50 p-3"><p className="font-semibold text-gray-800">{preview.rate_bracket_label}</p><p className="mt-1 text-gray-500">{preview.term_days} days · {(Number(preview.annual_rate) * 100).toFixed(2)}% annual rate</p></div><div className="flex justify-between"><span className="text-gray-600">Expected interest earned</span><strong>{formatCurrency(preview.expected_interest)}</strong></div><div className="flex justify-between border-t pt-3"><span className="font-semibold">Maturity value</span><strong className="text-emerald-700">{formatCurrency(preview.expected_maturity_value)}</strong></div><p className="text-xs text-gray-500">Formula: {preview.formula}</p><button type="submit" disabled={!member || status === "submitting"} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">{status === "submitting" ? <><LoaderCircle className="animate-spin" size={16} /> Opening...</> : <><Clock3 size={16} /> Open Time Deposit</>}</button></div>}
            </aside>
          </form>

          {memberModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="member-picker-title">
              <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-gray-200 p-5">
                  <div><h2 id="member-picker-title" className="text-xl font-bold text-gray-900">Select Member</h2><p className="mt-1 text-xs text-gray-500">Choose an existing member record.</p></div>
                  <button type="button" onClick={() => setMemberModalOpen(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close member picker"><X size={18} /></button>
                </div>
                <div className="border-b border-gray-200 p-4">
                  <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter by name or membership ID" className="h-10 w-full rounded-lg border border-gray-300 pl-10 pr-3 text-sm outline-none focus:border-green-600" /></div>
                </div>
                <div className="overflow-y-auto p-3">
                  {memberLoading ? <div className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500"><LoaderCircle className="animate-spin" size={16} /> Loading members...</div> : visibleMembers.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">No members found.</p> : <div className="divide-y divide-gray-100">{visibleMembers.map((candidate) => <button type="button" key={candidate.id} onClick={() => { setMember(candidate); setSearch(""); setMemberModalOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-emerald-50"><UserRound size={18} className="text-green-700" /><span><strong className="block text-sm text-gray-900">{candidate.name}</strong><span className="text-xs text-gray-500">{candidate.membership_id}</span></span></button>)}</div>}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Open_Time_Deposit;
