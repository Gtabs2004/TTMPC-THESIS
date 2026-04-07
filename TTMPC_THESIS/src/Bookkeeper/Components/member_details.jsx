import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Calendar } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

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
            <p className="font-medium text-gray-800">{asText(record?.tin_number)}</p>
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