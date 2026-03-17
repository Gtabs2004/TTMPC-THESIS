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
  FileEdit 
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

const LoanApprovalDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const sourceParam = new URLSearchParams(location.search).get('source');
  const isKoicaSource = sourceParam === 'koica';
  const isBookkeeperFlow = location.pathname.startsWith('/bookkeeper-loan-approval');
  const backRoute = isBookkeeperFlow ? '/bookkeeper-loan-approval' : '/loan-approval';

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
    return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    if (label.includes('consolidated') || code === 'CONSOLIDATED') return 0.83;
    return null;
  };

  useEffect(() => {
    let isMounted = true;

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
              loan_amount,
              principal_amount,
              interest_rate,
              total_interest,
              monthly_amortization,
              term,
              loan_status,
              application_status,
              loan_purpose,
              source_of_income,
              member:member_id (
                first_name,
                last_name,
                is_bona_fide
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

        const firstName = data.member?.first_name || '';
        const lastName = data.member?.last_name || '';
        const memberName = isKoicaSource
          ? (data.full_name || 'Unknown Applicant')
          : (`${firstName} ${lastName}`.trim() || 'Unknown Member');
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

        const mapped = {
          id: data.control_number,
          sourceTable: tableName,
          memberName,
          status: formatStatus(data.loan_status || data.application_status),
          summary: {
            loanType: resolvedLoanType,
            recommendedAmount: formatCurrency(data.loan_amount),
            term: `${data.term || 0} Months`,
            migsStatus: isKoicaSource ? 'N/A' : (data.member?.is_bona_fide ? 'MIGS' : 'NON-MIGS'),
            loanPurpose: data.loan_purpose || data.raw_payload?.optionalFields?.loan_purpose || 'N/A',
            employerPosition: data.source_of_income || data.raw_payload?.optionalFields?.source_of_income || 'N/A',
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
    if (!loanDetails?.id) return;

    if ((modalType === 'reject' || modalType === 'revise') && !remarks.trim()) {
      setActionError('Please provide remarks before confirming this action.');
      return;
    }

    let nextStatus = 'pending';
    if (isBookkeeperFlow && modalType === 'recommend') nextStatus = 'recommended for approval';
    if (!isBookkeeperFlow && modalType === 'proceed') nextStatus = 'to be disbursed';
    if (!isBookkeeperFlow && modalType === 'reject') nextStatus = 'rejected';

    try {
      setSaving(true);
      setActionError('');

      const { data, error } = await supabase
        .from(loanDetails.sourceTable || 'loans')
        .update({ loan_status: nextStatus, application_status: nextStatus })
        .eq('control_number', loanDetails.id)
        .select('control_number, loan_status')
        .maybeSingle();

      if (error) {
        throw new Error(error.message || 'Failed to update loan status.');
      }

      if (!data) {
        throw new Error('Loan record not found during status update.');
      }

      setLoanDetails((prev) => prev ? { ...prev, status: formatStatus(nextStatus) } : prev);
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
                onClick={() => setActiveModal('reject')}
                className="flex items-center px-6 py-2.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 font-bold text-sm transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 mr-2" /> Reject Loan
              </button>
              <button 
                onClick={() => setActiveModal('revise')}
                className="flex items-center px-6 py-2.5 rounded-lg border border-yellow-200 text-yellow-700 bg-[#FEF9C3] hover:bg-yellow-200 font-bold text-sm transition-colors cursor-pointer"
              >
                <FileEdit className="w-4 h-4 mr-2" /> Return for Revision
              </button>
              <button 
                onClick={() => setActiveModal('proceed')}
                className="flex items-center px-6 py-2.5 rounded-lg bg-[#1D6021] text-white hover:bg-[#154718] font-bold text-sm transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4 mr-2" /> Approve Loan
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

export default LoanApprovalDetails;