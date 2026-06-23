import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Calendar, ShieldCheck, UserX } from 'lucide-react';
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

  const handleToggleActive = async () => {
    const next = !(account?.is_active ?? true);
    const result = await callApi('/api/admin/staff/deactivate', {
      member_id: membershipId,
      is_active: next,
    });
    if (result) {
      setMessage(next ? 'Account reactivated.' : 'Account deactivated.');
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
            <p className="font-bold text-gray-800 capitalize">{account?.role || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Account Status</p>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isActive ? 'ACTIVE' : 'DEACTIVATED'}
            </span>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Account Email</p>
            <p className="font-medium text-gray-800 break-all">{account?.email || '—'}</p>
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
                <option value="">— Select role —</option>
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

              <button
                onClick={handleToggleActive}
                disabled={busy}
                className={`text-sm font-bold rounded-md px-4 py-2 transition-colors ${isActive ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-green-600 text-white hover:bg-green-700'}`}
              >
                <UserX className="w-4 h-4 inline mr-1" />
                {isActive ? 'Deactivate Account' : 'Reactivate Account'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Termination is handled by the Secretary via Membership Records. The BOD then approves it from the termination inbox.
            </p>
        </div>
      </div>
    </div>
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

      <StaffAccountPanel membershipId={membershipId} viewerRole={viewerRole} />

      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Capital Subscription</h2>
        <div className="grid grid-cols-3 gap-6">
          <div className="bg-[#e8f7ed] rounded-xl p-6 shadow-sm border border-green-100">
            <p className="text-xs font-semibold text-[#1e9e4a] uppercase tracking-wider mb-2">Amount</p>
            <p className="text-2xl font-bold text-[#1a4a2f]">{Number(record?.amount || 0).toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Number of Shares</p>
            <p className="text-2xl font-bold text-[#1a4a2f]">{Number(record?.number_of_shares || 0).toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Initial Paid-up Capital</p>
            <p className="text-2xl font-bold text-[#1a4a2f]">{Number(record?.initial_paid_up_capital || 0).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}; 

export default Member_Details;