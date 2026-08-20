import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  Calendar,
  ShieldCheck,
  UserX,
  Wallet,
  AlertTriangle,
  TrendingUp,
  FileText,
  ShieldAlert,
  Brain,
} from "lucide-react";
import { formatTinNumber } from '../../LOANFORMS/tinFormat';
import { UserAuth } from '../../contex/AuthContext';
import { resolveAccountFromSessionUser } from '../../utils/sessionIdentity';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'bookkeeper', label: 'Bookkeeper' },
  { value: 'manager', label: 'Manager' },
  { value: 'treasurer', label: 'Treasurer' },
  { value: 'secretary', label: 'Secretary' },
  { value: 'bod', label: 'BOD' },
];

const StaffAccountPanel = ({ membershipId, viewerRole }) => {
  const [account, setAccount] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [termReason, setTermReason] = useState('');
  const [termEffectiveDate, setTermEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [termNotes, setTermNotes] = useState('');

  const isBod = viewerRole === 'bod';

  const loadAccount = async () => {
    if (!membershipId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/staff/account/${encodeURIComponent(membershipId)}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.detail || 'Failed to load account.');
      }
      setAccount(payload.data);
      setSelectedRole(String(payload.data?.role || '').toLowerCase());
    } catch (err) {
      setError(err?.message || 'Unable to load account.');
    }
  };

  useEffect(() => {
    loadAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membershipId]);

  const callApi = async (path, body) => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.detail || 'Request failed.');
      }
      return payload;
    } catch (err) {
      setError(err?.message || 'Request failed.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRole = async () => {
    if (!selectedRole) return;
    const result = await callApi('/api/admin/staff/role', {
      member_id: membershipId,
      new_role: selectedRole,
    });
    if (result) {
      setMessage(`Role updated to ${selectedRole}.`);
      loadAccount();
    }
  };

  const handleReactivate = async () => {
    const result = await callApi('/api/admin/staff/deactivate', {
      member_id: membershipId,
      is_active: true,
    });
    if (result) {
      setMessage('Account reactivated.');
      loadAccount();
    }
  };

  const handleConfirmTerminate = async () => {
    if (!termReason.trim()) {
      setError('Please enter a reason for termination.');
      return;
    }
    const result = await callApi('/api/admin/member/terminate', {
      member_id: membershipId,
      reason: termReason.trim(),
      notes: termNotes.trim() || null,
      effective_date: termEffectiveDate || null,
    });
    if (result) {
      setMessage(
        `Member terminated. Resolution ${result.resolution_no || ''} generated. Effective ${result.effective_date || ''}.`
      );
      setShowTerminateModal(false);
      setTermReason('');
      setTermNotes('');
      loadAccount();
    }
  };

  if (!isBod) return null;

  const isActive = account?.is_active ?? true;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-[#1a4a2f]" />
        Account & Role Management
      </h2>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        {error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        {message ? (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Current Role</p>
            <p className="font-bold text-gray-800 capitalize">{account?.role || 'â€”'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Account Status</p>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isActive ? 'ACTIVE' : 'DEACTIVATED'}
            </span>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Account Email</p>
            <p className="font-medium text-gray-800 break-all">{account?.email || 'â€”'}</p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Assign or Change Role</p>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                disabled={busy}
              >
                <option value="">â€” Select role â€”</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button
                onClick={handleSaveRole}
                disabled={busy || !selectedRole || selectedRole === String(account?.role || '').toLowerCase()}
                className="bg-[#1a4a2f] text-white text-sm font-bold rounded-md px-4 py-2 disabled:opacity-50 hover:bg-[#143a25] transition-colors"
              >
                Save Role
              </button>

              {isActive ? (
                <button
                  onClick={() => { setError(''); setMessage(''); setShowTerminateModal(true); }}
                  disabled={busy}
                  className="text-sm font-bold rounded-md px-4 py-2 transition-colors bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <UserX className="w-4 h-4 inline mr-1" />
                  Terminate Member
                </button>
              ) : (
                <button
                  onClick={handleReactivate}
                  disabled={busy}
                  className="text-sm font-bold rounded-md px-4 py-2 transition-colors bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <UserX className="w-4 h-4 inline mr-1" />
                  Reactivate Account
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Terminating a member stamps the member record with an auto-generated resolution number, deactivates all their portal accounts, and files the termination for the Secretary to record in Membership Records.
            </p>
        </div>
      </div>

      {showTerminateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-red-600 text-white">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <UserX className="w-5 h-5" /> Terminate Member
              </h3>
              <p className="text-xs opacity-90 mt-0.5">
                Resolution number and date are generated automatically. This action deactivates the member's account.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={termReason}
                  onChange={(e) => setTermReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Voluntary withdrawal, deceased, delinquency after due process, etc."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                  Effective Date
                </label>
                <input
                  type="date"
                  value={termEffectiveDate}
                  onChange={(e) => setTermEffectiveDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                  Additional Notes (optional)
                </label>
                <textarea
                  value={termNotes}
                  onChange={(e) => setTermNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-200">
              <button
                onClick={() => setShowTerminateModal(false)}
                disabled={busy}
                className="text-sm font-semibold rounded-md px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTerminate}
                disabled={busy || !termReason.trim()}
                className="text-sm font-bold rounded-md px-4 py-2 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? 'Terminatingâ€¦' : 'Confirm Termination'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const formatPeso = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 'â€”';
  return `â‚±${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const DebtCapacityPanel = ({ membershipId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!membershipId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE_URL}/api/member/${encodeURIComponent(membershipId)}/debt-capacity`);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.detail || 'Failed to load debt capacity.');
        }
        if (!cancelled) setData(payload.data);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Unable to load debt capacity.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [membershipId]);

  const isMigs = String(data?.migs_status || '').toUpperCase() === 'MIGS';
  const multiplier = Number(data?.multiplier || 3);
  const shareCapital = Number(data?.share_capital || 0);
  const consolidated = data?.consolidated || {};
  const emergency = data?.emergency || {};

  const prescribe = (max, ceiling) => {
    if (max === null || max === undefined || ceiling === null || ceiling === undefined || ceiling <= 0) {
      return { tone: 'neutral', label: 'Insufficient data', text: 'Cannot compute a recommendation for this loan type.' };
    }
    const utilization = 1 - Number(max) / Number(ceiling);
    if (max <= 0) {
      return { tone: 'danger', label: 'At capacity', text: 'Member has exhausted this loan bucket. Do not approve new applications until existing balances are reduced.' };
    }
    if (utilization >= 0.7) {
      return { tone: 'warn', label: 'Approaching limit', text: `Only ${formatPeso(max)} of headroom remaining (${Math.round(utilization * 100)}% utilized). Approve smaller amounts only, and monitor repayment closely.` };
    }
    if (utilization >= 0.3) {
      return { tone: 'ok', label: 'Moderate capacity', text: `Member has ${formatPeso(max)} available. Safe to approve within this ceiling.` };
    }
    return { tone: 'good', label: 'Ample capacity', text: `Member has ${formatPeso(max)} available with low prior debt. Fully eligible up to the ceiling.` };
  };

  const cards = [
    {
      key: 'consolidated',
      title: 'Consolidated Loan',
      max: consolidated.max_available,
      ceiling: consolidated.ceiling,
      outstanding: consolidated.outstanding,
      accent: 'from-emerald-50 to-green-50 border-emerald-200',
      dot: 'bg-emerald-500',
      prescription: prescribe(consolidated.max_available, consolidated.ceiling),
    },
    {
      key: 'emergency',
      title: 'Emergency Loan',
      max: emergency.max_available,
      ceiling: emergency.ceiling,
      outstanding: emergency.outstanding,
      accent: 'from-amber-50 to-orange-50 border-amber-200',
      dot: 'bg-amber-500',
      prescription: prescribe(emergency.max_available, emergency.ceiling),
    },
    {
      key: 'bonus',
      title: 'Bonus Loan',
      max: null,
      note: 'Bonus salary not yet on file',
      accent: 'from-slate-50 to-gray-50 border-slate-200',
      dot: 'bg-slate-400',
      prescription: prescribe(null, null),
    },
  ];

  const prescriptionStyle = {
    good:    'bg-emerald-100 text-emerald-900 border-emerald-300',
    ok:      'bg-sky-100 text-sky-900 border-sky-300',
    warn:    'bg-amber-100 text-amber-900 border-amber-300',
    danger:  'bg-red-100 text-red-900 border-red-300',
    neutral: 'bg-slate-100 text-slate-800 border-slate-300',
  };

  const overallPrescription = (() => {
    if (!data) return null;
    if (shareCapital <= 0) {
      return { tone: 'danger', text: 'Member has â‚±0 share capital on file. Consolidated loans cannot be approved until Capital Build-Up is established.' };
    }
    if (!isMigs) {
      const upliftGain = shareCapital * (5 - multiplier);
      return { tone: 'ok', text: `Member is currently Non-MIGS (3Ã— multiplier). Achieving MIGS status would raise the Consolidated ceiling by ${formatPeso(upliftGain)} without any additional capital.` };
    }
    return { tone: 'good', text: 'Member holds MIGS status with the full 5Ã— multiplier applied. No policy uplift available beyond this tier.' };
  })();

  const activeLoans = Array.isArray(data?.active_loans) ? data.active_loans : [];

  const statusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (s.includes('paid') && !s.includes('partial')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (s.includes('partial')) return 'bg-sky-100 text-sky-800 border-sky-200';
    if (s.includes('released')) return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    if (s.includes('unpaid')) return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  const loanTypeAccent = (type) => {
    const t = String(type || '').toLowerCase();
    if (t.includes('consolidated')) return 'bg-emerald-500';
    if (t.includes('emergency')) return 'bg-amber-500';
    if (t.includes('bonus')) return 'bg-sky-500';
    return 'bg-slate-400';
  };

  return (
    <>
    <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-[#1a4a2f]" />
          <h2 className="text-lg font-bold text-gray-800">Debt Capacity</h2>
          {data ? (
            <span className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              isMigs ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-800 border-slate-200'
            }`}>
              <ShieldCheck className="w-3 h-3" />
              {isMigs ? `MIGS Â· ${multiplier.toFixed(0)}Ã— multiplier` : `Non-MIGS Â· ${multiplier.toFixed(0)}Ã— multiplier`}
            </span>
          ) : null}
        </div>
        {data ? (
          <span className="text-xs text-gray-500">
            Share Capital: <span className="font-semibold text-gray-800">{formatPeso(shareCapital)}</span>
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-sm text-gray-500">
          Computing capacityâ€¦
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map((c) => {
            const utilization = (c.ceiling && c.ceiling > 0 && c.max !== null && c.max !== undefined)
              ? Math.min(1, Math.max(0, 1 - Number(c.max) / Number(c.ceiling)))
              : null;
            const barColor = utilization === null ? 'bg-gray-300'
              : utilization >= 0.7 ? 'bg-red-500'
              : utilization >= 0.3 ? 'bg-amber-500'
              : 'bg-emerald-500';
            return (
            <div
              key={c.key}
              className={`bg-gradient-to-br ${c.accent} rounded-xl p-5 shadow-sm border flex flex-col`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                <p className="text-xs font-bold uppercase tracking-wider text-gray-700">{c.title}</p>
              </div>
              <p className="text-xs text-gray-700 mb-1">Maximum Approvable Loan Amount</p>
              <p className="text-2xl font-extrabold text-[#1a4a2f]">
                {c.max === null || c.max === undefined ? 'â€”' : formatPeso(c.max)}
              </p>
              <p className="text-xs text-gray-700 mb-3">Headroom remaining after existing obligations</p>

              {utilization !== null ? (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-gray-800 mb-1">
                    <span>Utilization</span>
                    <span className="font-semibold">{Math.round(utilization * 100)}% of ceiling used</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/70 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor}`} style={{ width: `${utilization * 100}%` }} />
                  </div>
                </div>
              ) : null}

              <div className="text-xs text-gray-800 border-t border-white/60 pt-2 space-y-1">
                {c.ceiling !== undefined && c.ceiling !== null ? (
                  <p className="flex items-center justify-between text-gray-800">
                    <span className="text-gray-700">Absolute Maximum Allowed</span>
                    <span className="font-semibold">{formatPeso(c.ceiling)}</span>
                  </p>
                ) : null}
                {c.outstanding !== undefined && c.outstanding !== null ? (
                  <p className="flex items-center justify-between text-gray-800">
                    <span className="text-gray-700">Already Borrowed</span>
                    <span className="font-semibold">{formatPeso(c.outstanding)}</span>
                  </p>
                ) : null}
                {c.note ? (
                  <p className="text-amber-900 italic mt-1">{c.note}</p>
                ) : null}
              </div>

              <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${prescriptionStyle[c.prescription.tone]}`}>
                <p className="font-bold uppercase tracking-wider text-xs mb-0.5">Prescription Â· {c.prescription.label}</p>
                <p className="leading-snug">{c.prescription.text}</p>
              </div>
            </div>
            );
          })}
        </div>
        {overallPrescription ? (
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm flex items-start gap-3 ${prescriptionStyle[overallPrescription.tone]}`}>
            <TrendingUp className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold uppercase tracking-wider text-xs mb-1">Overall Prescription</p>
              <p className="leading-snug">{overallPrescription.text}</p>
            </div>
          </div>
        ) : null}
        </>
      )}
    </div>

    <div className="mb-8 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#1a4a2f]" />
          <h2 className="text-lg font-bold text-gray-800">Existing Active Loans</h2>
        </div>
        {!loading && !error ? (
          <span className="text-xs text-gray-500">
            {activeLoans.length === 0 ? 'No active loans' : `${activeLoans.length} loan${activeLoans.length === 1 ? '' : 's'}`}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-sm text-gray-500">
          Loading loansâ€¦
        </div>
      ) : error ? null : activeLoans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500 text-center">
          This member has no active loans on record.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-member-green text-xs uppercase tracking-wider text-white font-extrabold">
                <th className="p-3 font-bold">Type</th>
                <th className="p-3 font-bold">Control No.</th>
                <th className="p-3 font-bold">Status</th>
                <th className="p-3 font-bold text-right">Principal</th>
                <th className="p-3 font-bold text-right">Paid</th>
                <th className="p-3 font-bold text-right">Remaining</th>
                <th className="p-3 font-bold text-right">Accrued Penalty</th>
                <th className="p-3 font-bold text-right">Total Owed</th>
                <th className="p-3 font-bold text-right">Monthly</th>
                <th className="p-3 font-bold">Disbursed</th>
              </tr>
            </thead>
            <tbody>
              {activeLoans.map((loan) => {
                const penalty = Number(loan.accrued_penalty || 0);
                const totalOwed = Number(loan.total_with_penalty ?? loan.remaining_balance ?? 0);
                return (
                <tr key={loan.control_number} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    <span className="inline-flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${loanTypeAccent(loan.loan_type)}`} />
                      <span className="font-semibold text-gray-800">{loan.loan_type}</span>
                      {loan.is_legacy ? (
                        <span className="text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-slate-100 text-slate-800 border-slate-200">
                          Legacy
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs text-gray-700">{loan.control_number}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${statusBadge(loan.loan_status)}`}>
                      {loan.loan_status || 'Unknown'}
                    </span>
                  </td>
                  <td className="p-3 text-right text-gray-700">{formatPeso(loan.principal)}</td>
                  <td className="p-3 text-right text-gray-700">{formatPeso(loan.paid)}</td>
                  <td className="p-3 text-right text-gray-800">{formatPeso(loan.remaining_balance)}</td>
                  <td className={`p-3 text-right ${penalty > 0 ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>
                    {loan.is_legacy ? 'â€”' : formatPeso(penalty)}
                  </td>
                  <td className="p-3 text-right font-bold text-[#1a4a2f]">{formatPeso(totalOwed)}</td>
                  <td className="p-3 text-right text-gray-700">{formatPeso(loan.monthly_amortization)}</td>
                  <td className="p-3 text-xs text-gray-600">{loan.disbursal_date || loan.application_date || 'â€”'}</td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                <td colSpan={5} className="p-3 text-right text-gray-700 uppercase text-xs tracking-wider">Totals</td>
                <td className="p-3 text-right text-gray-800">
                  {formatPeso(activeLoans.reduce((sum, l) => sum + Number(l.remaining_balance || 0), 0))}
                </td>
                <td className="p-3 text-right text-red-700">
                  {formatPeso(activeLoans.reduce((sum, l) => sum + Number(l.accrued_penalty || 0), 0))}
                </td>
                <td className="p-3 text-right text-[#1a4a2f] text-base">
                  {formatPeso(activeLoans.reduce((sum, l) => sum + Number(l.total_with_penalty ?? l.remaining_balance ?? 0), 0))}
                </td>
                <td className="p-3 text-right text-gray-700">
                  {formatPeso(activeLoans.reduce((sum, l) => sum + Number(l.monthly_amortization || 0), 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
    </>
  );
};

const Member_Details = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = UserAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewerRole, setViewerRole] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = session?.user;
      if (!user) return;
      try {
        const account = await resolveAccountFromSessionUser(user);
        if (!cancelled) setViewerRole(String(account?.role || '').trim().toLowerCase());
      } catch {
        if (!cancelled) setViewerRole('');
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const membershipId = useMemo(() => {
    const fromState = location.state?.member?.member_id;
    if (fromState) return String(fromState);

    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('member_id');
    return fromQuery ? String(fromQuery) : '';
  }, [location]);

  const returnPath = useMemo(() => {
    const statePortal = String(location.state?.portal || '').toLowerCase();
    const params = new URLSearchParams(location.search);
    const queryPortal = String(params.get('portal') || '').toLowerCase();
    const portal = statePortal || queryPortal;

    if (portal === 'bod') return '/bod-manage-member';
    if (portal === 'manager') return '/manager-manage-member';
    return '/manage-member';
  }, [location]);

  useEffect(() => {
    async function loadRecord() {
      if (!membershipId) {
        setError('No member selected. Please open details from Manage Member.');
        return;
      }

      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/personal_data_sheet/${encodeURIComponent(membershipId)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.detail || payload?.message || 'Failed to load member details.');
        }

        setRecord(payload.data || null);
      } catch (err) {
        setError(err?.message || 'Unable to load member details.');
        setRecord(null);
      } finally {
        setLoading(false);
      }
    }

    loadRecord();
  }, [membershipId]);

  const fullName = useMemo(() => {
    const first = String(record?.first_name || '').trim();
    const middle = String(record?.middle_name || '').trim();
    const last = String(record?.surname || record?.last_name || '').trim();
    return [first, middle, last].filter(Boolean).join(' ') || 'Member Details';
  }, [record]);

  const asText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value);
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <button 
        onClick={() => navigate(returnPath)}
        className="flex items-center text-sm text-[#1a4a2f] font-semibold mb-4 hover:underline"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to members
      </button>

      <h1 className="text-3xl font-bold text-[#1a4a2f] mb-2">{fullName}</h1>
      <p className="text-sm text-gray-500 mb-8">Membership ID: {asText(record?.membership_number_id || membershipId)}</p>

      {loading ? <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">Loading member profile...</div> : null}
      {error ? <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Personal Data Sheet</h2>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 grid grid-cols-2 gap-y-6 gap-x-12">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Surname</p>
            <p className="font-medium text-gray-800">{asText(record?.surname)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">First Name</p>
            <p className="font-medium text-gray-800">{asText(record?.first_name)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Middle Name</p>
            <p className="font-medium text-gray-800">{asText(record?.middle_name)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Email</p>
            <p className="font-medium text-gray-800">{asText(record?.email)}</p>
          </div>
          <div>
            <p className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"><Phone className="w-3 h-3 mr-1" /> Contact Number</p>
            <p className="font-medium text-gray-800">{asText(record?.contact_number)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Permanent Address</p>
            <p className="font-medium text-gray-800">{asText(record?.permanent_address)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Gender</p>
            <p className="font-medium text-gray-800">{asText(record?.gender)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Civil Status</p>
            <p className="font-medium text-gray-800">{asText(record?.civil_status)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Citizenship</p>
            <p className="font-medium text-gray-800">{asText(record?.citizenship)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Religion</p>
            <p className="font-medium text-gray-800">{asText(record?.religion)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">TIN Number</p>
            <p className="font-medium text-gray-800">{formatTinNumber(record?.tin_number) || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Occupation</p>
            <p className="font-medium text-gray-800">{asText(record?.occupation)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Educational Attainment</p>
            <p className="font-medium text-gray-800">{asText(record?.educational_attainment)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Position</p>
            <p className="font-medium text-gray-800">{asText(record?.position)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Date of Birth</p>
            <p className="font-medium text-gray-800">{asText(record?.date_of_birth)}</p>
          </div>
          <div>
            <p className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"><Calendar className="w-3 h-3 mr-1" /> Date of Membership</p>
            <p className="font-medium text-gray-800">{asText(record?.date_of_membership)}</p>
          </div>
        </div>
      </div>

      <DebtCapacityPanel membershipId={membershipId} />

      <StaffAccountPanel membershipId={membershipId} viewerRole={viewerRole} />
    </div>
  );
}; 

export default Member_Details;