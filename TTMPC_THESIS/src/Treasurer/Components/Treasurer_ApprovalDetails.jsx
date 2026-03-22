import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { 
  ArrowLeft, 
  User, 
  Calculator, 
  BarChart2, 
  Paperclip, 
  FileImage, 
  X, 
  Check, 
  FileEdit,
  AlertCircle
} from 'lucide-react';

const CustomCheckbox = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-2 w-fit">
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 rounded border-gray-300 text-[#1D6021] focus:ring-[#1D6021] cursor-pointer"
    />
    <span>{label}</span>
  </label>
);

const Treasurer_ApprovalDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const sourceParam = new URLSearchParams(location.search).get('source');
  const isKoicaSource = sourceParam === 'koica';
  const isBookkeeperFlow = location.pathname.startsWith('/bookkeeper-loan-approval');
  const backRoute = isBookkeeperFlow ? '/bookkeeper-loan-approval' : '/treasurer-approval';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');   
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [activeModal, setActiveModal] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [sendSms, setSendSms] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [loanDetails, setLoanDetails] = useState(null);

  const formatCurrency = (value) => {
    const amount = Number(value || 0);
    return `\u20B1${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatStatus = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return 'Pending Review';
    return raw
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const inferInterestRate = (loanTypeLabel, loanTypeCode) => {
    const label = String(loanTypeLabel || '').trim().toLowerCase();
    const code = String(loanTypeCode || '').trim().toUpperCase();

    if (label.includes('bonus') || code === 'BONUS' || code === 'NONMEMBER_BONUS') return 2;
    if (label.includes('emergency') || code === 'EMERGENCY') return 2;
    if (label.includes('consolidated') || code === 'CONSOLIDATED') return 0.083;
    return null;
  };

  useEffect(() => {
    let isMounted = true;

    const fetchMemberById = async (memberId) => {
      if (!memberId) return null;

      const { data, error } = await supabase
        .from('member')
        .select('first_name, last_name, is_bona_fide, membership_id')
        .eq('id', memberId)
        .maybeSingle();

      if (error) return null;
      return data || null;
    };

    const fetchLoanDetails = async () => {
      if (!id) {
        if (isMounted) {
          setLoadError('Loan ID is missing.');
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setLoadError('');

        let data = null;
        let tableName = 'loans';

        if (isKoicaSource) {
          const { data: koicaData, error: koicaError } = await supabase
            .from('koica_loans')
            .select(`
              control_number,
              full_name,
              loan_amount,
              principal_amount,
              interest_rate,
              term,
              loan_status,
              application_status,
              bookkeeper_internal_remarks,
              bookkeeper_reviewed_at,
              manager_review_requested_at,
              loan_type_code,
              raw_payload
            `)
            .eq('control_number', id)
            .maybeSingle();
          if (koicaError) throw koicaError;
          data = koicaData;
          tableName = 'koica_loans';
        } else {
          const { data: loanData, error: loanError } = await supabase
            .from('loans')
            .select(`
              control_number,
              member_id,
              loan_amount,
              principal_amount,
              interest_rate,
              total_interest,
              monthly_amortization,
              term,
              loan_status,
              application_status,
              bookkeeper_internal_remarks,
              bookkeeper_reviewed_at,
              manager_review_requested_at,
              raw_payload,
              loan_purpose,
              source_of_income,
              member:member_id (
                first_name,
                last_name,
                is_bona_fide,
                membership_id
              ),
              loan_type:loan_type_id (
                name
              )
            `)
            .eq('control_number', id)
            .maybeSingle();
          if (loanError) throw loanError;
          data = loanData;
        }

        if (!data) throw new Error('Loan record not found.');

        let resolvedMember = data.member;
        if (!isKoicaSource && (!resolvedMember?.first_name && !resolvedMember?.last_name) && data.member_id) {
          const fallbackMember = await fetchMemberById(data.member_id);
          if (fallbackMember) {
            resolvedMember = fallbackMember;
          }
        }

        const firstName = resolvedMember?.first_name || '';
        const lastName = resolvedMember?.last_name || '';
        const memberName = isKoicaSource
          ? (data.full_name || 'Unknown Applicant')
          : (`${firstName} ${lastName}`.trim() || 'Unknown Member');

        const normalizeText = (value) => {
          const normalized = String(value || '').trim();
          if (!normalized) return '';
          if (normalized.toLowerCase() === 'n/a') return '';
          return normalized;
        };

        let resolvedEmployerPosition = normalizeText(data.source_of_income)
          || normalizeText(data.raw_payload?.optionalFields?.source_of_income);

        if (!resolvedEmployerPosition && !isKoicaSource) {
          const membershipNumberId = String(resolvedMember?.membership_id || '').trim();
          if (membershipNumberId) {
            const { data: pdsRow, error: pdsError } = await supabase
              .from('personal_data_sheet')
              .select('employer_name, position, occupation, created_at')
              .eq('membership_number_id', membershipNumberId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!pdsError && pdsRow) {
              resolvedEmployerPosition = normalizeText(pdsRow.employer_name)
                || normalizeText(pdsRow.position)
                || normalizeText(pdsRow.occupation);
            }
          }
        }

        if (!resolvedEmployerPosition) {
          resolvedEmployerPosition = 'N/A';
        }

        const principalAmount = Number(data.principal_amount ?? data.loan_amount ?? 0);
        const monthlyAmortization = Number(
          data.monthly_amortization
          ?? data.raw_payload?.optionalFields?.monthly_amortization
          ?? 0
        );
        const termMonths = Number(data.term || 0);
        const resolvedLoanType = isKoicaSource
          ? (data.loan_type_code === 'NONMEMBER_BONUS' ? 'Nonmember Bonus Loan' : 'ABFF Loan')
          : (data.loan_type?.name || 'N/A');
        const effectiveInterestRate = data.interest_rate ?? inferInterestRate(resolvedLoanType, data.loan_type_code);

        const hasStoredTotalInterest = data.total_interest !== null && data.total_interest !== undefined;
        let resolvedTotalInterest = hasStoredTotalInterest
          ? Number(data.total_interest)
          : Number(data.raw_payload?.optionalFields?.total_interest ?? NaN);

        if (!Number.isFinite(resolvedTotalInterest)) {
          if (monthlyAmortization > 0 && termMonths > 0) {
            resolvedTotalInterest = Math.max(0, (monthlyAmortization * termMonths) - principalAmount);
          } else if (effectiveInterestRate !== null && principalAmount > 0 && termMonths > 0) {
            resolvedTotalInterest = Math.max(0, principalAmount * (Number(effectiveInterestRate) / 100) * termMonths);
          } else {
            resolvedTotalInterest = 0;
          }
        }

        const totalPayable = monthlyAmortization > 0 && termMonths > 0
          ? monthlyAmortization * termMonths
          : principalAmount + resolvedTotalInterest;

        const rawCoMakers = data.raw_payload?.optionalFields?.bookkeeper_loan_details?.coMakers
          ?? data.raw_payload?.coMakers
          ?? [];
        const normalizedCoMakers = [0, 1].map((index) => {
          const row = rawCoMakers[index] || {};
          return {
            membership_number_id: row.membership_number_id || '',
            name: row.name || '',
            id_no: row.id_no || '',
            address: row.address || '',
            mobile: row.mobile || row.contact_no || '',
            email: row.email || '',
          };
        });

        const mapped = {
          id: data.control_number,
          sourceTable: tableName,
          memberName,
          loanType: resolvedLoanType,
          loanAmount: Number(data.loan_amount ?? principalAmount ?? 0),
          term: `${termMonths} Months`,
          status: formatStatus(data.loan_status || data.application_status),
          summary: {
            loanType: resolvedLoanType,
            recommendedAmount: formatCurrency(data.loan_amount),
            term: `${data.term || 0} Months`,
            migsStatus: isKoicaSource ? 'N/A' : (resolvedMember?.is_bona_fide ? 'MIGS' : 'NON-MIGS'),
            loanPurpose: data.loan_purpose || data.raw_payload?.optionalFields?.loan_purpose || 'N/A',
            employerPosition: resolvedEmployerPosition,
            bookkeeperInternalRemarks: data.bookkeeper_internal_remarks || 'No internal remarks submitted.',
            bookkeeperCoMakers: normalizedCoMakers,
            managerApprovalStatus: String(data.loan_status || data.application_status || '').trim().toLowerCase() === 'to be disbursed'
              ? 'Approved by Manager'
              : 'Pending Manager Review',
            bookkeeperReviewedAt: data.bookkeeper_reviewed_at || null,
            managerReviewRequestedAt: data.manager_review_requested_at || null,
          },
          computation: {
            principal: formatCurrency(principalAmount),
            interestRate: effectiveInterestRate !== null ? `${Number(effectiveInterestRate)}% Monthly` : 'N/A',
            totalInterest: formatCurrency(resolvedTotalInterest),
            totalPayable: formatCurrency(totalPayable),
            monthlyAmortization: formatCurrency(monthlyAmortization),
          },
          risk: {
            prevLoans: { value: 'N/A', label: 'NOT YET COMPUTED', color: 'text-gray-500' },
            delinquency: { value: 'N/A', label: 'NOT YET COMPUTED', color: 'text-gray-500' },
            consistency: { value: 'N/A', label: 'NOT YET COMPUTED', color: 'text-gray-500' },
          },
        };

        if (isMounted) {
          setLoanDetails(mapped);
        }
      } catch (err) {
        if (isMounted) {
          setLoadError(err.message || 'Failed to load loan details.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchLoanDetails();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const closeModal = () => {
    setActiveModal(null);
    setActionError('');
    setRemarks('');
    setSendSms(true);
    setSendEmail(true);
  };

  const applyLoanStatusUpdate = async (modalType) => {
        // Helper: fetch loan details for disbursement
        const fetchLoanDisbursementDetails = async (loanId) => {
          const { data, error } = await supabase
            .from('loans')
            .select(`loan_type:loan_type_id(name), loan_amount, term, monthly_amortization`)
            .eq('control_number', loanId)
            .maybeSingle();
          if (error) throw error;
          return {
            loanType: data.loan_type?.name || '',
            loanAmount: data.loan_amount,
            term: data.term,
            monthlyAmortization: data.monthly_amortization
          };
        };

        // Helper: insert disbursement record
        const insertDisbursementRecord = async (loanId, loanType, loanAmount, term, monthlyAmortization) => {
          const { data, error } = await supabase
            .from('disbursement')
            .insert([
              {
                loan_id: loanId,
                loan_type: loanType,
                loan_amount: loanAmount,
                term: term,
                monthly_amortization: monthlyAmortization,
                status: 'Ready for Disbursement'
              }
            ]);
          if (error) throw error;
          return data;
        };
    if (!loanDetails?.id) return;

    if ((modalType === 'reject' || modalType === 'revise' || modalType === 'reschedule') && !remarks.trim()) {
      setActionError('Please provide remarks before confirming this action.');
      return;
    }

    let nextStatus = 'pending';
    if (isBookkeeperFlow && modalType === 'recommend') nextStatus = 'recommended for approval';
    if (!isBookkeeperFlow && modalType === 'proceed') nextStatus = 'to be disbursed';
    if (!isBookkeeperFlow && modalType === 'reschedule') nextStatus = 'pending rescheduling';
    if (!isBookkeeperFlow && modalType === 'reject') nextStatus = 'rejected';

    const updatePayload = { loan_status: nextStatus, application_status: nextStatus };
    if (!isBookkeeperFlow && modalType === 'disburse') {
      nextStatus = 'ready for disbursement';
      updatePayload.loan_status = nextStatus;
      updatePayload.application_status = nextStatus;
      updatePayload.disbursement_confirmation = new Date().toISOString();
    }

    try {
      setSaving(true);
      setActionError('');

      const { data: updatedRows, error } = await supabase
        .from(loanDetails.sourceTable || 'loans')
        .update(updatePayload)
        .eq('control_number', loanDetails.id)
        .select('control_number, loan_status, disbursement_confirmation')
        .limit(1);

      if (error) {
        throw new Error(error.message || 'Failed to update loan status.');
      }

      const updatedRow = updatedRows?.[0] || null;

      if (!updatedRow) {
        throw new Error('Loan record was not updated. Please verify Treasurer update permissions and try again.');
      }

      setLoanDetails((prev) => prev ? { ...prev, status: formatStatus(nextStatus), disbursement_confirmation: updatedRow.disbursement_confirmation } : prev);
      closeModal();
      navigate(backRoute);
    } catch (err) {
      setActionError(err.message || 'Unable to update loan application status.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <button 
          onClick={() => navigate(backRoute)}
          className="flex items-center text-sm text-[#1D6021] font-semibold mb-6 hover:underline"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Loan Queue
        </button>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-gray-600">Loading loan details...</div>
      </div>
    );
  }

  if (loadError || !loanDetails) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <button 
          onClick={() => navigate(backRoute)}
          className="flex items-center text-sm text-[#1D6021] font-semibold mb-6 hover:underline"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Loan Queue
        </button>
        <div className="bg-white rounded-xl border border-red-200 p-8 text-red-600">{loadError || 'Unable to display loan details.'}</div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen relative">
      {/* Back Button */}
      <button 
        onClick={() => navigate(backRoute)}
        className="flex items-center text-sm text-[#1D6021] font-semibold mb-6 hover:underline"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Loan Queue
      </button>

      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#1a4a2f] mb-2">Loan Approval Details</h1>
          <p className="text-sm text-gray-500">
            Application ID: <span className="font-bold text-[#1D6021] mr-2">{loanDetails.id}</span> | 
            Member: <span className="font-bold text-gray-800 ml-2">{loanDetails.memberName}</span>
          </p>
          {actionError ? (
            <p className="text-sm text-red-600 mt-2">{actionError}</p>
          ) : null}
        </div>
        <span className="bg-[#FEF08A] text-[#854D0E] px-4 py-1.5 rounded-full text-sm font-bold flex items-center">
          <span className="w-2 h-2 rounded-full bg-[#EAB308] mr-2"></span>
          {loanDetails.status}
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 p-8 gap-8">
          
          {/* Left Column */}
          <div className="flex flex-col gap-8">
            {/* Member & Loan Summary */}
            <div>
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <User className="w-5 h-5 mr-2 text-[#1D6021]" /> Member & Loan Summary
              </h2>
              <div className="bg-[#FAF9FB] rounded-xl p-6 grid grid-cols-2 gap-y-6">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Loan Type</p>
                  <p className="font-bold text-gray-800">{loanDetails.summary.loanType}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Recommended Amount</p>
                  <p className="font-bold text-[#1D6021] text-xl">{loanDetails.summary.recommendedAmount}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Term</p>
                  <p className="font-bold text-gray-800">{loanDetails.summary.term}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">MIGS Status</p>
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold">
                    {loanDetails.summary.migsStatus}
                  </span>
                </div>
                <div className="col-span-2 border-t border-gray-200 pt-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Loan Purpose</p>
                  <p className="font-bold text-gray-800">{loanDetails.summary.loanPurpose}</p>
                </div>
                <div className="col-span-2 border-t border-gray-200 pt-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Employer / Position</p>
                  <p className="font-bold text-gray-800">{loanDetails.summary.employerPosition}</p>
                </div>
              </div>
            </div>

            {/* Payment Risk Indicators */}
            <div>
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <BarChart2 className="w-5 h-5 mr-2 text-[#1D6021]" /> Payment Risk Indicators
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Prev Loans</p>
                  <p className="text-2xl font-black text-gray-800 mb-1">{loanDetails.risk.prevLoans.value}</p>
                  <p className={`text-[9px] font-bold uppercase ${loanDetails.risk.prevLoans.color}`}>{loanDetails.risk.prevLoans.label}</p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Delinquency</p>
                  <p className="text-xl font-black text-gray-800 mb-1">{loanDetails.risk.delinquency.value}</p>
                  <p className={`text-[9px] font-bold uppercase ${loanDetails.risk.delinquency.color}`}>{loanDetails.risk.delinquency.label}</p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Consistency</p>
                  <p className="text-2xl font-black text-gray-800 mb-1">{loanDetails.risk.consistency.value}</p>
                  <p className={`text-[9px] font-bold uppercase ${loanDetails.risk.consistency.color}`}>{loanDetails.risk.consistency.label}</p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <FileEdit className="w-5 h-5 mr-2 text-[#1D6021]" /> Bookkeeper Internal Review
              </h2>
              <div className="bg-[#F8F9FA] border border-gray-200 rounded-xl p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Internal Remarks</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{loanDetails.summary.bookkeeperInternalRemarks}</p>
                </div>
                <div className="border-t border-gray-200 pt-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Manager Approval</p>
                  <p className="text-sm font-semibold text-green-700">{loanDetails.summary.managerApprovalStatus}</p>
                </div>
                <div className="border-t border-gray-200 pt-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Co-Makers (Loan Details)</p>
                  <div className="space-y-3">
                    {(loanDetails.summary.bookkeeperCoMakers || []).map((row, index) => {
                      const hasValue = String(row.membership_number_id || '').trim()
                        || String(row.name || '').trim()
                        || String(row.id_no || '').trim()
                        || String(row.mobile || '').trim()
                        || String(row.email || '').trim()
                        || String(row.address || '').trim();

                      return (
                        <div key={`treasurer-co-maker-${index}`} className="border border-gray-200 rounded-lg p-3 bg-white">
                          <p className="text-xs font-bold text-gray-700 mb-2">Co-Maker {index + 1}</p>
                          {hasValue ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700">
                              <p><span className="font-semibold">Membership No:</span> {row.membership_number_id || 'N/A'}</p>
                              <p><span className="font-semibold">Name:</span> {row.name || 'N/A'}</p>
                              <p><span className="font-semibold">ID No:</span> {row.id_no || 'N/A'}</p>
                              <p><span className="font-semibold">Mobile:</span> {row.mobile || 'N/A'}</p>
                              <p><span className="font-semibold">Email:</span> {row.email || 'N/A'}</p>
                              <p className="md:col-span-2"><span className="font-semibold">Address:</span> {row.address || 'N/A'}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500">No co-maker details provided.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {loanDetails.summary.bookkeeperReviewedAt ? (
                  <div className="border-t border-gray-200 pt-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Reviewed At</p>
                    <p className="text-sm text-gray-700">{new Date(loanDetails.summary.bookkeeperReviewedAt).toLocaleString()}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-8">
            {/* Loan Computation Summary */}
            <div>
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <Calculator className="w-5 h-5 mr-2 text-[#1D6021]" /> Loan Computation Summary
              </h2>
              <div className="bg-[#EAF1EB] rounded-xl p-6">
                <div className="space-y-4 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Principal Amount</span>
                    <span className="font-bold text-gray-800">{loanDetails.computation.principal}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Interest Rate</span>
                    <span className="font-bold text-gray-800">{loanDetails.computation.interestRate}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Total Interest</span>
                    <span className="font-bold text-gray-800">{loanDetails.computation.totalInterest}</span>
                  </div>
                </div>
                <div className="border-t border-gray-300 pt-4 mb-4 flex justify-between items-center">
                  <span className="font-bold text-gray-900">Total Payable (All Months)</span>
                  <span className="font-bold text-gray-900">{loanDetails.computation.totalPayable}</span>
                </div>
                <div className="border-t border-gray-300 pt-4 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-[#1D6021] uppercase tracking-wider">Payable Per Month</p>
                    <p className="text-[9px] text-gray-500">Monthly amortization amount</p>
                  </div>
                  <span className="text-2xl font-black text-[#1D6021]">{loanDetails.computation.monthlyAmortization}</span>
                </div>
              </div>
            </div>

            {/* Treasurer's Disbursement Assessment */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <BarChart2 className="w-5 h-5 mr-2 text-[#1D6021]" /> Treasurer's Disbursement Assessment
              </h2>
              <div className="space-y-6">
                {/* Fund Availability */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Cooperative Fund Availability</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-3 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-3 bg-[#1D6021] rounded-full" style={{ width: '80%' }}></div>
                    </div>
                    <span className="text-xs font-bold text-green-700">Sufficient</span>
                  </div>
                </div>
                {/* Financial Impact Assessment */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Financial Impact Assessment</span>
                  <span className="text-xs font-bold text-gray-800">Projected Interest Revenue: {"\u20B1"}100,000.00</span>
                </div>
                {/* Recommendation Status */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Recommendation Status</span>
                  <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold border border-green-200">Highly Recommended</span>
                </div>
              </div>
            </div>

            {/* Supporting Documents */}
            <div>
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <Paperclip className="w-5 h-5 mr-2 text-[#1D6021]" /> Supporting Documents
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#F8F9FA] border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
                  <FileImage className="w-6 h-6 text-gray-400 mb-2" />
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Kiosk Submission</p>
                </div>
                <div className="bg-[#F8F9FA] border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
                  <FileImage className="w-6 h-6 text-gray-400 mb-2" />
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Payslip 1</p>
                </div>
                <div className="bg-[#F8F9FA] border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
                  <FileImage className="w-6 h-6 text-gray-400 mb-2" />
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Payslip 2</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="bg-[#F8F9FA] border-t border-gray-200 p-6 flex justify-end gap-4">
          {isBookkeeperFlow ? (
            <button 
              onClick={() => setActiveModal('recommend')}
              className="flex items-center px-6 py-2.5 rounded-lg bg-[#1D6021] text-white hover:bg-[#154718] font-bold text-sm transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4 mr-2" /> Recommend for Approval
            </button>
          ) : (
            <>
              
              <button 
                onClick={() => setActiveModal('reschedule')}
                className="flex items-center px-6 py-2.5 rounded-lg border border-yellow-200 text-yellow-700 bg-[#FEF9C3] hover:bg-yellow-200 font-bold text-sm transition-colors cursor-pointer"
              >
                <FileEdit className="w-4 h-4 mr-2" /> Reschedule
              </button>
              <button 
                onClick={() => setActiveModal('disburse')}
                className="flex items-center px-6 py-2.5 rounded-lg bg-[#1D6021] text-white hover:bg-[#154718] font-bold text-sm transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4 mr-2" /> Approve for Disbursement
              </button>
            </>
          )}
        </div>
      </div>

      {/* --- Modals Overlay --- */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Close Button */}
            <button 
              onClick={closeModal} 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Reject Modal */}
            {activeModal === 'reject' && (
              <>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Reject Loan Application</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Are you sure you want to reject the loan application of <span className="font-bold text-gray-900">{loanDetails.memberName}</span>? This action is permanent and cannot be undone.
                </p>
                
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Reason for Rejection <span className="text-red-500">*</span>
                  </label>
                  <textarea 
                    rows="4"
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#1D6021] focus:border-[#1D6021] outline-none"
                    placeholder="Provide a detailed reason for board's decision..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  ></textarea>
                </div>
              </>
            )}

            {/* Revise Modal */}
            {activeModal === 'revise' && (
              <>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Return for Revision</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Please specify the corrections or additional information required from <span className="font-bold text-gray-900">{loanDetails.memberName}</span>.
                </p>
                
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Revision instructions <span className="text-red-500">*</span>
                  </label>
                  <textarea 
                    rows="4"
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#1D6021] focus:border-[#1D6021] outline-none"
                    placeholder="Enter the detailed reason for revision or specific instructions for the user..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  ></textarea>
                </div>
              </>
            )}

            {/* Reschedule Modal */}
            {activeModal === 'reschedule' && (
              <>
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                  <AlertCircle className="w-5 h-5 mr-2 text-yellow-600" /> Reschedule Disbursement
                </h3>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-yellow-800 font-semibold">
                    ⚠️ Insufficient Funds
                  </p>
                  <p className="text-sm text-yellow-700 mt-2">
                    The disbursement for <span className="font-bold">{loanDetails.memberName}</span> cannot proceed at this time due to insufficient funds in the treasury.
                  </p>
                </div>
                
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Loan Amount:</span>
                      <span className="font-bold text-gray-900">{formatCurrency(loanDetails.loanAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Current Available Funds:</span>
                      <span className="font-bold text-red-600">Pending Review</span>
                    </div>
                    <div className="border-t border-gray-300 pt-3 flex justify-between text-sm">
                      <span className="text-gray-600 font-semibold">Status:</span>
                      <span className="font-bold text-yellow-700">Pending Rescheduling</span>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Rescheduling Notes (Optional)
                  </label>
                  <textarea 
                    rows="3"
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none"
                    placeholder="Add any notes about when funds will be available or other relevant information..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  ></textarea>
                </div>
              </>
            )}

            {/* Disbursement Approval Modal */}
            {activeModal === 'disburse' && (
              <>
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                  <Check className="w-5 h-5 mr-2 text-[#1D6021]" /> Approve for Disbursement
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                  Review and confirm the disbursement details for <span className="font-bold text-gray-900">{loanDetails.memberName}</span>:
                </p>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Loan Type:</span>
                      <span className="font-bold text-gray-900">{loanDetails.loanType}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Loan Amount:</span>
                      <span className="font-bold text-green-700 text-lg">{formatCurrency(loanDetails.loanAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Term:</span>
                      <span className="font-bold text-gray-900">{loanDetails.term}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Monthly Amortization:</span>
                      <span className="font-bold text-gray-900">{loanDetails.computation?.monthlyAmortization || 'N/A'}</span>
                    </div>
                    <div className="border-t border-green-300 pt-3 flex justify-between text-sm">
                      <span className="text-gray-700 font-semibold">Status:</span>
                      <span className="font-bold text-green-700">Ready for Disbursement</span>
                    </div>
                    {loanDetails.disbursement_confirmation && (
                      <div className="border-t border-green-300 pt-3 flex justify-between text-sm">
                        <span className="text-gray-700 font-semibold">Disbursement Confirmed</span>
                        <span className="font-bold text-green-700">{new Date(loanDetails.disbursement_confirmation).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
                  <p className="text-xs text-blue-800">
                    ℹ️ By approving this disbursement, the funds will be transferred to the member's account and the loan status will be updated to "Active".
                  </p>
                </div>
              </>
            )}

            {/* Proceed Modal */}
            {activeModal === 'proceed' && (
              <>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Approve Loan Application</h3>
                <p className="text-sm text-gray-600 mb-8">
                  You are about to approve the loan application for <span className="font-bold text-gray-900">{loanDetails.memberName}</span>. Proceed?
                </p>
              </>
            )}

            {/* Recommend Modal */}
            {activeModal === 'recommend' && (
              <>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Recommend for Manager Approval</h3>
                <p className="text-sm text-gray-600 mb-8">
                  You are about to forward this loan of <span className="font-bold text-gray-900">{loanDetails.memberName}</span> to the Manager queue.
                </p>
              </>
            )}

            {/* Shared Notification Options */}
            <div className="mb-8">
              <h4 className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-3">Notification Options</h4>
              <p className="text-xs text-gray-500">Email/SMS sending is disabled for this flow.</p>
            </div>

            {actionError ? (
              <div className="mb-4 text-sm text-red-600">{actionError}</div>
            ) : null}

            {/* Shared Footer Actions */}
            <div className="flex justify-center gap-3 mt-4">
              <button 
                onClick={closeModal}
                disabled={saving}
                className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors w-1/2"
              >
                Cancel
              </button>
              
              {activeModal === 'reject' && (
                <button
                  onClick={() => applyLoanStatusUpdate('reject')}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg bg-[#DC2626] hover:bg-red-700 text-white font-medium text-sm transition-colors w-1/2 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Confirm Rejection'}
                </button>
              )}
              {activeModal === 'revise' && (
                <button
                  onClick={() => applyLoanStatusUpdate('revise')}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg bg-[#F59E0B] hover:bg-amber-600 text-white font-medium text-sm transition-colors w-1/2 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Send for Revision'}
                </button>
              )}
              {activeModal === 'reschedule' && (
                <button
                  onClick={() => applyLoanStatusUpdate('reschedule')}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg bg-[#F59E0B] hover:bg-amber-600 text-white font-medium text-sm transition-colors w-1/2 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Confirm Reschedule'}
                </button>
              )}
              {activeModal === 'disburse' && (
                <button
                  onClick={() => applyLoanStatusUpdate('disburse')}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg bg-[#1D6021] hover:bg-[#154718] text-white font-medium text-sm transition-colors w-1/2 disabled:opacity-50"
                >
                  {saving ? 'Processing...' : 'Confirm Disbursement'}
                </button>
              )}
              {activeModal === 'proceed' && (
                <button
                  onClick={() => applyLoanStatusUpdate('proceed')}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg bg-[#1D6021] hover:bg-[#154718] text-white font-medium text-sm transition-colors w-1/2 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Confirm Approval'}
                </button>
              )}
              {activeModal === 'recommend' && (
                <button
                  onClick={() => applyLoanStatusUpdate('recommend')}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg bg-[#1D6021] hover:bg-[#154718] text-white font-medium text-sm transition-colors w-1/2 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Send to Manager'}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default Treasurer_ApprovalDetails;