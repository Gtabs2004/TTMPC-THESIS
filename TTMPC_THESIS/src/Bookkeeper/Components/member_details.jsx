import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRealtimeVersion } from "../../hooks/useRealtimeRefetch";
import { RT } from "../../lib/realtimeSync";
import { getLoanTypeDotClass as loanTypeAccent } from "../../utils/loanTypeColors";
import { formatStatus } from "../../utils/formatStatus";
import {
  ArrowLeft,
  Phone,
  Calendar,
  ShieldCheck,
  UserX,
  AlertTriangle,
  FileText,
  ShieldAlert,
  Brain,
} from "lucide-react";
import { formatTinNumber } from '../../LOANFORMS/tinFormat';
import { authHeaders } from '../../utils/authHeaders';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const formatPeso = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDay = (value) => {
  if (!value) return '—';
  const raw = String(value);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  return Number.isNaN(d.getTime())
    ? raw
    : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'loans', label: 'Loans' },
  { key: 'capital', label: 'Share Capital' },
  { key: 'savings', label: 'Savings & Deposits' },
  { key: 'grocery', label: 'Grocery' },
  { key: 'income', label: 'Income & Classification' },
];

// One labelled value. Blank values read as "—" so a missing record is visible
// instead of looking like an empty cell.
const Field = ({ label, children }) => (
  <div>
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
    <p className="font-medium text-gray-800">{children === '' || children == null ? '—' : children}</p>
  </div>
);

const Panel = ({ title, children, aside }) => (
  <div className="mb-8 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
    <div className="flex items-center justify-between mb-5">
      <h2 className="text-lg font-bold text-gray-800">{title}</h2>
      {aside ? <span className="text-xs text-gray-500">{aside}</span> : null}
    </div>
    {children}
  </div>
);

const SummaryCard = ({ label, value, hint }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
    <p className="text-xl font-bold text-[#1a4a2f] mt-1">{value}</p>
    {hint ? <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p> : null}
  </div>
);

// Plain read-only table. columns: [{ label, render(row), align }]
const DataTable = ({ columns, rows, empty }) => {
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500 text-center">
        {empty}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
            {columns.map((c) => (
              <th key={c.label} className={`p-4 font-bold ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
              {columns.map((c) => (
                <td key={c.label} className={`p-4 text-gray-700 ${c.align === 'right' ? 'text-right' : ''}`}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ActiveLoansPanel = ({ membershipId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const rtVersionLoans = useRealtimeVersion([...RT.LOANS, ...RT.CBU]);
  const rtSeenLoans = useRef(rtVersionLoans);
  useEffect(() => {
    const silent = rtSeenLoans.current !== rtVersionLoans;
    rtSeenLoans.current = rtVersionLoans;
    if (!membershipId) return;
    let cancelled = false;
    (async () => {
      if (!silent) setLoading(true);
      if (!silent) setError('');
      try {
        const res = await fetch(`${API_BASE_URL}/api/member/${encodeURIComponent(membershipId)}/debt-capacity`);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.detail || 'Failed to load loans.');
        }
        if (!cancelled) setData(payload.data);
      } catch (err) {
        if (silent) return;
        if (!cancelled) setError(err?.message || 'Unable to load loans.');
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [membershipId, rtVersionLoans]);

  const activeLoans = Array.isArray(data?.active_loans) ? data.active_loans : [];

  const statusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (s.includes('paid') && !s.includes('partial')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (s.includes('partial')) return 'bg-sky-100 text-sky-800 border-sky-200';
    if (s.includes('released')) return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    if (s.includes('unpaid')) return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  return (
    <>
    <div className="mb-8 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#1a4a2f]" />
          <h2 className="text-lg font-bold text-gray-800">Loan History</h2>
        </div>
        {!loading && !error ? (
          <span className="text-xs text-gray-500">
            {activeLoans.length === 0 ? 'No loans on record' : `${activeLoans.length} loan${activeLoans.length === 1 ? '' : 's'}`}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-sm text-gray-500">
          Loading loans…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : activeLoans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500 text-center">
          This member has no loans on record.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                <th className="p-5 font-bold">Type</th>
                <th className="p-5 font-bold">Control No.</th>
                <th className="p-5 font-bold">Status</th>
                <th className="p-5 font-bold text-right">Principal</th>
                <th className="p-5 font-bold text-right">Paid</th>
                <th className="p-5 font-bold text-right">Remaining</th>
                <th className="p-5 font-bold text-right">Accrued Penalty</th>
                <th className="p-5 font-bold text-right">Total Owed</th>
                <th className="p-5 font-bold text-right">Monthly</th>
                <th className="p-5 font-bold">Disbursed</th>
              </tr>
            </thead>
            <tbody>
              {activeLoans.map((loan) => {
                const penalty = Number(loan.accrued_penalty || 0);
                const totalOwed = Number(loan.total_with_penalty ?? loan.remaining_balance ?? 0);
                return (
                <tr key={loan.control_number} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                  <td className="p-5">
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
                  <td className="p-5 font-mono text-xs text-gray-700">{loan.control_number}</td>
                  <td className="p-5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${statusBadge(loan.loan_status)}`}>
                      {formatStatus(loan.loan_status) || 'Unknown'}
                    </span>
                  </td>
                  <td className="p-5 text-right text-gray-700">{formatPeso(loan.principal)}</td>
                  <td className="p-5 text-right text-gray-700">{formatPeso(loan.paid)}</td>
                  <td className="p-5 text-right text-gray-800">{formatPeso(loan.remaining_balance)}</td>
                  <td className={`p-5 text-right ${penalty > 0 ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>
                    {loan.is_legacy ? '—' : formatPeso(penalty)}
                  </td>
                  <td className="p-5 text-right font-bold text-[#1a4a2f]">{formatPeso(totalOwed)}</td>
                  <td className="p-5 text-right text-gray-700">{formatPeso(loan.monthly_amortization)}</td>
                  <td className="p-5 text-xs text-gray-600">{loan.disbursal_date || loan.application_date || '—'}</td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                <td colSpan={5} className="p-5 text-right text-gray-700 uppercase text-xs tracking-wider">Totals</td>
                <td className="p-5 text-right text-gray-800">
                  {formatPeso(activeLoans.reduce((sum, l) => sum + Number(l.remaining_balance || 0), 0))}
                </td>
                <td className="p-5 text-right text-red-700">
                  {formatPeso(activeLoans.reduce((sum, l) => sum + Number(l.accrued_penalty || 0), 0))}
                </td>
                <td className="p-5 text-right text-[#1a4a2f] text-base">
                  {formatPeso(activeLoans.reduce((sum, l) => sum + Number(l.total_with_penalty ?? l.remaining_balance ?? 0), 0))}
                </td>
                <td className="p-5 text-right text-gray-700">
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
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const membershipId = useMemo(() => {
    const fromState = location.state?.member?.member_id;
    if (fromState) return String(fromState);

    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('member_id');
    return fromQuery ? String(fromQuery) : '';
  }, [location]);

  // Which portal the member was opened from, used only for the back link.
  // ?portal= comes from the URL and must never decide what a user is allowed
  // to do. (Roles and termination live in BOD Account Management.)
  const returnPath = useMemo(() => {
    const statePortal = String(location.state?.portal || '').toLowerCase();
    const params = new URLSearchParams(location.search);
    const queryPortal = String(params.get('portal') || '').toLowerCase();
    const portal = statePortal || queryPortal;

    if (portal === 'bod') return '/bod-manage-member';
    if (portal === 'manager') return '/manager-manage-member';
    return '/manage-member';
  }, [location]);

  const rtVersionRecord = useRealtimeVersion(RT.MEMBERS);
  const rtSeenRecord = useRef(rtVersionRecord);
  useEffect(() => {
    const silent = rtSeenRecord.current !== rtVersionRecord;
    rtSeenRecord.current = rtVersionRecord;
    async function loadRecord() {
      if (!membershipId) {
        setError('No member selected. Please open details from Manage Member.');
        return;
      }

      if (!silent) setLoading(true);
      if (!silent) setError('');
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
        if (silent) return;
        setError(err?.message || 'Unable to load member details.');
        setRecord(null);
      } finally {
        if (!silent) setLoading(false);
      }
    }

    loadRecord();
  }, [membershipId, rtVersionRecord]);

  // Savings, deposits, share capital, grocery, income: one read-only call to
  // the backend, which checks the caller is Manager, Bookkeeper or BOD.
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    if (!membershipId) return undefined;
    let cancelled = false;
    (async () => {
      setSummaryLoading(true);
      setSummaryError('');
      try {
        const res = await fetch(`${API_BASE_URL}/api/members/${encodeURIComponent(membershipId)}/financial-summary`, {
          headers: { Accept: 'application/json', ...(await authHeaders()) },
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.detail || 'Failed to load the financial records.');
        }
        if (!cancelled) setSummary(payload.data);
      } catch (err) {
        if (!cancelled) {
          setSummary(null);
          setSummaryError(err?.message || 'Unable to load the financial records.');
        }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [membershipId, rtVersionRecord]);

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

  const sectionFailed = (name) => Array.isArray(summary?.errors) && summary.errors.includes(name);
  const savingsAccounts = summary?.savings?.accounts || [];
  const savingsTotal = savingsAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const activeDeposits = (summary?.time_deposits || []).filter((t) => String(t.status || '').toLowerCase() !== 'settled');
  const depositTotal = activeDeposits.reduce((sum, t) => sum + Number(t.principal || 0), 0);
  const profile = summary?.income?.profile;
  const pds = summary?.income?.pds;
  const cls = summary?.classification;

  // Shown in place of a tab's content while loading or when the call failed.
  const summaryNotice = summaryLoading
    ? <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-sm text-gray-500">Loading records…</div>
    : summaryError
      ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{summaryError}</span>
        </div>
      )
      : null;

  const failedNotice = () => (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      This section could not be loaded. Try again in a moment.
    </div>
  );

  return (
    <div className="animate-page-in p-8 bg-gray-50 min-h-screen">
      <button
        onClick={() => navigate(returnPath)}
        className="flex items-center text-sm text-[#1a4a2f] font-semibold mb-4 hover:underline"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to members
      </button>

      <h1 className="text-3xl font-bold text-[#1a4a2f] mb-2">{fullName}</h1>
      <p className="text-sm text-gray-500 mb-6">
        Membership ID: {asText(record?.membership_number_id || membershipId)}
        {summary?.member?.member_status ? ` · Status: ${summary.member.member_status}` : ''}
      </p>

      {loading ? <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">Loading member profile...</div> : null}
      {error ? <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Share Capital" value={formatPeso(summary.member?.share_capital_amount)} hint={`${asText(summary.member?.number_of_shares) || '0'} shares`} />
          <SummaryCard label="Savings Balance" value={formatPeso(savingsTotal)} hint={`${savingsAccounts.length} account${savingsAccounts.length === 1 ? '' : 's'}`} />
          <SummaryCard label="Time Deposits" value={formatPeso(depositTotal)} hint={`${activeDeposits.length} active`} />
          <SummaryCard label="Latest Net Pay" value={profile?.latest_net_pay == null ? '—' : formatPeso(profile.latest_net_pay)} hint="from the member profile" />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-6" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? 'border-[#1a4a2f] text-[#1a4a2f]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' ? (
      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Personal Data Sheet</h2>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 grid grid-cols-2 gap-y-6 gap-x-12">
          <Field label="Surname">{asText(record?.surname)}</Field>
          <Field label="First Name">{asText(record?.first_name)}</Field>
          <Field label="Middle Name">{asText(record?.middle_name)}</Field>
          <Field label="Maiden Name">{asText(record?.maiden_name)}</Field>
          <Field label="Email">{asText(record?.email)}</Field>
          <Field label="Contact Number">{asText(record?.contact_number)}</Field>
          <Field label="Permanent Address">{asText(record?.permanent_address)}</Field>
          <Field label="Place of Birth">{asText(record?.place_of_birth)}</Field>
          <Field label="Date of Birth">{asText(record?.date_of_birth)}</Field>
          <Field label="Gender">{asText(record?.gender)}</Field>
          <Field label="Civil Status">{asText(record?.civil_status)}</Field>
          <Field label="Citizenship">{asText(record?.citizenship)}</Field>
          <Field label="Religion">{asText(record?.religion)}</Field>
          <Field label="Height">{asText(record?.height)}</Field>
          <Field label="Blood Type">{asText(record?.blood_type)}</Field>
          <Field label="Number of Dependents">{asText(record?.number_of_dependents ?? record?.DependentCount)}</Field>
          <Field label="Spouse">{asText(record?.spouse_name)}</Field>
          <Field label="Spouse Occupation">{asText(record?.spouse_occupation)}</Field>
          <Field label="Spouse Date of Birth">{asText(record?.spouse_date_of_birth)}</Field>
          <Field label="Father">{asText(record?.father_name)}</Field>
          <Field label="Mother">{asText(record?.mother_name)}</Field>
          <Field label="Occupation">{asText(record?.occupation)}</Field>
          <Field label="Position">{asText(record?.position)}</Field>
          <Field label="Employer">{asText(record?.employer_name)}</Field>
          <Field label="Educational Attainment">{asText(record?.educational_attainment)}</Field>
          <Field label="TIN Number">{formatTinNumber(record?.tin_number) || 'N/A'}</Field>
          <Field label="GSIS Number">{asText(record?.gsis_number)}</Field>
          <Field label="Date of Membership">{asText(record?.date_of_membership)}</Field>
          <Field label="BOD Resolution No.">{asText(record?.BOD_resolution_number)}</Field>
          <Field label="Initial Paid-Up Capital">{record?.initial_paid_up_capital == null ? '' : formatPeso(record.initial_paid_up_capital)}</Field>
        </div>
      </div>
      ) : null}

      {activeTab === 'loans' ? <ActiveLoansPanel membershipId={membershipId} /> : null}

      {activeTab === 'capital' ? (
        <Panel title="Share Capital (CBU)" aside={summary ? `Current balance ${formatPeso(summary.member?.share_capital_amount)}` : null}>
          {summaryNotice || (sectionFailed('capital') ? failedNotice() : (
            <DataTable
              empty="No share capital entries on record."
              rows={summary?.capital || []}
              columns={[
                { label: 'Date', render: (r) => formatDay(r.transaction_date) },
                { label: 'Deposit Account', render: (r) => r.deposit_account || '—' },
                { label: 'Added', align: 'right', render: (r) => formatPeso(r.capital_added) },
                { label: 'Balance After', align: 'right', render: (r) => formatPeso(r.ending_share_capital) },
              ]}
            />
          ))}
          <p className="text-[11px] text-gray-400 mt-3">Showing the 25 most recent entries.</p>
        </Panel>
      ) : null}

      {activeTab === 'savings' ? (
        <>
          <Panel title="Savings Accounts" aside={summary ? `Total ${formatPeso(savingsTotal)}` : null}>
            {summaryNotice || (sectionFailed('savings') ? failedNotice() : (
              <DataTable
                empty="This member has no savings account."
                rows={savingsAccounts}
                columns={[
                  { label: 'Account No.', render: (r) => <span className="font-mono text-xs">{r.account_number}</span> },
                  { label: 'Name', render: (r) => r.account_name || '—' },
                  { label: 'Kind', render: (r) => r.account_kind || '—' },
                  { label: 'Status', render: (r) => r.status || '—' },
                  { label: 'Balance', align: 'right', render: (r) => formatPeso(r.balance) },
                ]}
              />
            ))}
          </Panel>
          <Panel title="Recent Savings Entries">
            {summaryNotice || (sectionFailed('savings') ? failedNotice() : (
              <DataTable
                empty="No savings entries on record."
                rows={summary?.savings?.ledger || []}
                columns={[
                  { label: 'Date', render: (r) => formatDay(r.posted_at) },
                  { label: 'Account', render: (r) => <span className="font-mono text-xs">{r.account_number}</span> },
                  { label: 'Type', render: (r) => r.entry_type || '—' },
                  { label: 'Amount', align: 'right', render: (r) => formatPeso(r.amount) },
                  { label: 'Running Balance', align: 'right', render: (r) => formatPeso(r.running_balance) },
                  { label: 'Remarks', render: (r) => r.remarks || '—' },
                ]}
              />
            ))}
          </Panel>
          <Panel title="Time Deposits" aside={summary ? `${activeDeposits.length} active · ${formatPeso(depositTotal)}` : null}>
            {summaryNotice || (sectionFailed('time_deposits') ? failedNotice() : (
              <DataTable
                empty="This member has no time deposits."
                rows={summary?.time_deposits || []}
                columns={[
                  { label: 'Certificate', render: (r) => <span className="font-mono text-xs">{r.certificate_number}</span> },
                  { label: 'Placed', render: (r) => formatDay(r.placement_date) },
                  { label: 'Matures', render: (r) => formatDay(r.maturity_date) },
                  { label: 'Principal', align: 'right', render: (r) => formatPeso(r.principal) },
                  { label: 'Rate', align: 'right', render: (r) => (r.annual_rate == null ? '—' : `${Number(r.annual_rate)}%`) },
                  { label: 'Value at Maturity', align: 'right', render: (r) => formatPeso(r.expected_maturity_value) },
                  { label: 'Status', render: (r) => r.status || '—' },
                ]}
              />
            ))}
          </Panel>
        </>
      ) : null}

      {activeTab === 'grocery' ? (
        <Panel
          title="Grocery Purchases"
          aside={summary?.grocery?.totals ? `${summary.grocery.totals.transaction_count} purchases · ${formatPeso(summary.grocery.totals.total_grocery_amount)}` : null}
        >
          {summaryNotice || (sectionFailed('grocery') ? failedNotice() : (
            <DataTable
              empty="No grocery purchases on record."
              rows={summary?.grocery?.recent || []}
              columns={[
                { label: 'Date', render: (r) => formatDay(r.TransactionDate) },
                { label: 'Amount', align: 'right', render: (r) => formatPeso(r.GroceryAmount) },
                { label: 'Balance Due', align: 'right', render: (r) => formatPeso(r.balance_due) },
                { label: 'Status', render: (r) => r.Status || '—' },
              ]}
            />
          ))}
          <p className="text-[11px] text-gray-400 mt-3">Showing the 25 most recent purchases.</p>
        </Panel>
      ) : null}

      {activeTab === 'income' ? (
        <>
          <Panel title="Income and Employment">
            {summaryNotice || (sectionFailed('income') ? failedNotice() : (
              <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                <Field label="Latest Net Take-Home Pay">{profile?.latest_net_pay == null ? '' : formatPeso(profile.latest_net_pay)}</Field>
                <Field label="Net Income (profile)">{profile?.net_income == null ? '' : formatPeso(profile.net_income)}</Field>
                <Field label="Employer">{asText(pds?.employer_name)}</Field>
                <Field label="Employment Status">{asText(profile?.employment_status)}</Field>
                <Field label="Years in Service">{asText(profile?.years_in_service)}</Field>
                <Field label="Housing Status">{asText(profile?.housing_status)}</Field>
                <Field label="Salary (data sheet)">{pds?.salary == null ? '' : formatPeso(pds.salary)}</Field>
                <Field label="Annual Income">{pds?.annual_income == null ? '' : formatPeso(pds.annual_income)}</Field>
                <Field label="Other Income">{pds?.other_income == null ? '' : formatPeso(pds.other_income)}</Field>
                <Field label="Income Source">{asText(pds?.income_source)}</Field>
              </div>
            ))}
            <p className="text-[11px] text-gray-400 mt-4">
              Payslip files are submitted with a loan application or a profile change and are not stored on the member record.
            </p>
          </Panel>
          <Panel title="Classification Points" aside={cls?.accrual_date ? `As of ${formatDay(cls.accrual_date)}` : null}>
            {summaryNotice || (sectionFailed('classification') ? failedNotice() : (
              cls ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-12">
                  <Field label="Share Capital Points">{asText(cls.cbu_points)}</Field>
                  <Field label="Loan Points">{asText(cls.loan_points)}</Field>
                  <Field label="Savings Points">{asText(cls.savings_points)}</Field>
                  <Field label="Payment Points">{asText(cls.payment_points)}</Field>
                  <Field label="Grocery Points">{asText(cls.grocery_points)}</Field>
                  <Field label="Insurance (PLI) Points">{asText(cls.pli_points)}</Field>
                  <Field label="Attendance Points">{asText(cls.attendance_points)}</Field>
                  <Field label="Total Score">{asText(cls.total_score)}</Field>
                  <Field label="Classification">{asText(cls.final_status)}</Field>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500 text-center">
                  No classification has been computed for this member yet.
                </div>
              )
            ))}
          </Panel>
        </>
      ) : null}

    </div>
  );
};

export default Member_Details;
