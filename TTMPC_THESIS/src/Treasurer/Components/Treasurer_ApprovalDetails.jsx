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
  AlertCircle,
  ExternalLink,
  ClipboardCheck,
  Briefcase,
  Wallet,
  Banknote,
} from 'lucide-react';

const SUPPORTING_DOCS_BUCKET = 'Supporting_Documents';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// Fire-and-forget loan-status email dispatcher. Backend (FastAPI) queues the
// Resend call in BackgroundTasks. Failures here MUST NEVER block the
// Treasurer approval workflow.
const dispatchLoanEmail = async ({ loanId, stage, action, remarks, actorUserId }) => {
  if (!loanId || !stage || !action) return;
  try {
    await fetch(`${API_BASE_URL}/api/loans/email/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loan_id: loanId,
        stage,
        action,
        remarks: remarks || null,
        actor_user_id: actorUserId || null,
      }),
    });
  } catch (_err) {
    // Silent: workflow must not be impacted by email failures.
  }
};

const normalizeSupportingDocuments = (rawPayload) => {
  const docs = rawPayload?.optionalFields?.bookkeeper_loan_details?.supporting_documents;
  if (!Array.isArray(docs)) return [];

  return docs
    .map((entry) => ({
      doc_type: String(entry?.doc_type || 'photo').trim() || 'photo',
      file_name: String(entry?.file_name || '').trim() || 'Uploaded file',
      storage_path: String(entry?.storage_path || '').trim(),
      uploaded_at: entry?.uploaded_at || null,
      uploaded_by_role: String(entry?.uploaded_by_role || '').trim() || 'bookkeeper',
    }))
    .filter((entry) => entry.storage_path);
};

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

const QuickStat = ({ label, value, accent = false }) => (
  <div
    className={`rounded-lg border px-3 py-2 ${
      accent ? 'border-[#1D6021]/30 bg-[#1D6021]/5' : 'border-gray-200 bg-white'
    }`}
  >
    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
    <p className={`text-sm font-bold ${accent ? 'text-[#1D6021]' : 'text-gray-800'} truncate`}>
      {value}
    </p>
  </div>
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
  const [supportingDocs, setSupportingDocs] = useState([]);
  const [supportingDocUrls, setSupportingDocUrls] = useState({});

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

  const resolveInterestRateFromLoanTypes = async (loanTypeLabel, loanTypeCode) => {
    const code = String(loanTypeCode || '').trim().toUpperCase();
    const label = String(loanTypeLabel || '').trim().toLowerCase();

    const pickRate = (row) => {
      const rate = Number(
        row?.interest_rate
        ?? row?.InterestRate
        ?? row?.interestrate
        ?? row?.interestRate
      );
      return Number.isFinite(rate) && rate > 0 ? rate : null;
    };

    if (code) {
      const { data, error } = await supabase
        .from('loan_types')
        .select('*')
        .eq('code', code)
        .limit(1)
        .maybeSingle();

      if (!error) {
        const rate = pickRate(data);
        if (rate !== null) return rate;
      }
    }

    if (label) {
      const { data, error } = await supabase
        .from('loan_types')
        .select('*')
        .ilike('name', `%${label}%`)
        .limit(1)
        .maybeSingle();

      if (!error) {
        const rate = pickRate(data);
        if (rate !== null) return rate;
      }
    }

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
        const termMonths = Number(data.term || 0);
        const resolvedLoanType = isKoicaSource
          ? (data.loan_type_code === 'NONMEMBER_BONUS' ? 'Nonmember Bonus Loan' : 'ABFF Loan')
          : (data.loan_type?.name || 'N/A');
        let effectiveInterestRate = data.interest_rate;
        if (effectiveInterestRate === null || effectiveInterestRate === undefined) {
          effectiveInterestRate = await resolveInterestRateFromLoanTypes(resolvedLoanType, data.loan_type_code);
        }

        const monthlyRateDecimal = effectiveInterestRate !== null
          ? Number(effectiveInterestRate) / 100
          : 0;

        let monthlyAmortization = Number(data.monthly_amortization ?? 0)
          || Number(data.raw_payload?.optionalFields?.monthly_amortization ?? 0);
        let monthlyInterestAmount = 0;
        let monthlyPrincipalAmount = 0;
        let emergencyTotalInterest = null;
        let emergencyScheduleRows = null;

        // Emergency: equal-principal, declining-interest in centavos. Mirrors
        // backend /api/loans/compute and Emergency_Loan.jsx UI.
        if (resolvedLoanType.toLowerCase().includes('emergency') && principalAmount > 0 && termMonths > 0 && monthlyRateDecimal > 0) {
          const totalPrincipalCents = Math.round(principalAmount * 100);
          const monthlyPrincipalCents = Math.round(totalPrincipalCents / termMonths);
          let accumulatedCents = 0;
          let balanceCents = totalPrincipalCents;
          let firstTotalCents = 0;
          let totalInterestCents = 0;
          const rows = [];

          for (let i = 1; i <= termMonths; i += 1) {
            const startingBalanceCents = balanceCents;
            const principalCents = i < termMonths
              ? monthlyPrincipalCents
              : totalPrincipalCents - accumulatedCents;
            const endingBalanceCents = startingBalanceCents - principalCents;
            const interestCents = Math.round(endingBalanceCents * monthlyRateDecimal);
            if (i === 1) firstTotalCents = principalCents + interestCents;
            totalInterestCents += interestCents;
            balanceCents = endingBalanceCents;
            accumulatedCents += principalCents;
            rows.push({
              month: i,
              startingBalance: startingBalanceCents / 100,
              principal: principalCents / 100,
              interest: interestCents / 100,
              totalPayment: (principalCents + interestCents) / 100,
              remainingBalance: endingBalanceCents / 100,
            });
          }
          monthlyAmortization = firstTotalCents / 100;
          emergencyTotalInterest = totalInterestCents / 100;
          emergencyScheduleRows = rows;
        } else {
          monthlyInterestAmount = principalAmount > 0 ? principalAmount * monthlyRateDecimal : 0;
          monthlyPrincipalAmount = (principalAmount > 0 && termMonths > 0) ? principalAmount / termMonths : 0;
        }

        const hasStoredTotalInterest = data.total_interest !== null && data.total_interest !== undefined;
        let resolvedTotalInterest = hasStoredTotalInterest
          ? Number(data.total_interest)
          : Number(data.raw_payload?.optionalFields?.total_interest ?? NaN);

        if (emergencyTotalInterest !== null) {
          resolvedTotalInterest = emergencyTotalInterest;
        } else if (!Number.isFinite(resolvedTotalInterest)) {
          if (monthlyAmortization > 0 && termMonths > 0) {
            resolvedTotalInterest = Math.max(0, (monthlyAmortization * termMonths) - principalAmount);
          } else if (effectiveInterestRate !== null && principalAmount > 0 && termMonths > 0) {
            resolvedTotalInterest = Math.max(0, principalAmount * (Number(effectiveInterestRate) / 100) * termMonths);
          } else {
            resolvedTotalInterest = 0;
          }
        }

        const totalPayable = principalAmount + resolvedTotalInterest;

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
          rawPayload: data.raw_payload || {},
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
            termMonths,
            principal: formatCurrency(principalAmount),
            interestRate: effectiveInterestRate !== null ? `${Number(effectiveInterestRate)}% Monthly` : 'N/A',
            totalInterest: formatCurrency(resolvedTotalInterest),
            totalPayable: formatCurrency(totalPayable),
            monthlyAmortization: formatCurrency(monthlyAmortization),
            emergencySchedule: emergencyScheduleRows,
          },
          risk: {
            prevLoans: { value: 'N/A', label: 'NOT YET COMPUTED', color: 'text-gray-500' },
            delinquency: { value: 'N/A', label: 'NOT YET COMPUTED', color: 'text-gray-500' },
            consistency: { value: 'N/A', label: 'NOT YET COMPUTED', color: 'text-gray-500' },
          },
        };

        if (isMounted) {
          setLoanDetails(mapped);
          setSupportingDocs(normalizeSupportingDocuments(mapped.rawPayload || {}));
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

  useEffect(() => {
    let active = true;

    const loadSignedUrls = async () => {
      if (!supportingDocs.length) {
        if (active) setSupportingDocUrls({});
        return;
      }

      const resolved = {};
      for (const doc of supportingDocs) {
        const path = String(doc.storage_path || '').trim();
        if (!path) continue;

        const { data, error } = await supabase.storage
          .from(SUPPORTING_DOCS_BUCKET)
          .createSignedUrl(path, 60 * 60);

        if (!error && data?.signedUrl) {
          resolved[path] = data.signedUrl;
        }
      }

      if (active) {
        setSupportingDocUrls(resolved);
      }
    };

    loadSignedUrls();
    return () => {
      active = false;
    };
  }, [supportingDocs]);

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

      // Member email policy (Treasurer stage):
      //   On 'disburse' (Treasurer confirms): email the member that the loan
      //   is ready to claim at the Cashier. Non-blocking — backend uses
      //   BackgroundTasks + Resend and dedups on the transition.
      //   'reject' / 'reschedule' do NOT email the member.
      if (modalType === 'disburse') {
        try {
          const { data: { user } = {} } = (await supabase.auth.getUser()) || {};
          dispatchLoanEmail({
            loanId: loanDetails.id,
            stage: 'treasurer',
            action: 'disburse',
            actorUserId: user?.id || null,
          });
        } catch (_err) {
          // Already swallowed inside dispatchLoanEmail.
        }
      }

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

  // ---- Workflow step derivation ----
  const statusLower = String(loanDetails.status || '').toLowerCase();
  const workflowSteps = [
    { key: 'bookkeeper', label: 'Bookkeeper Review', icon: ClipboardCheck },
    { key: 'manager',    label: 'Manager Approval',  icon: Briefcase },
    { key: 'treasurer',  label: 'Treasurer Review',  icon: Wallet },
    { key: 'disburse',   label: 'Disbursement',      icon: Banknote },
  ];
  let currentStepIdx;
  if (statusLower.includes('disburs') || statusLower.includes('released') || statusLower.includes('paid')) {
    currentStepIdx = 3;
  } else if (isBookkeeperFlow) {
    currentStepIdx = 0;
  } else {
    // Treasurer flow: active step is Treasurer Review
    currentStepIdx = 2;
  }

  // ---- Section anchors ----
  const sectionTabs = [
    { id: 'section-summary',     label: 'Summary',       icon: User },
    { id: 'section-computation', label: 'Computation',   icon: Calculator },
    { id: 'section-assessment',  label: 'Assessment',    icon: BarChart2 },
    { id: 'section-documents',   label: 'Documents',     icon: Paperclip },
    { id: 'section-notes',       label: 'Bookkeeper',    icon: FileEdit },
  ];
  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="bg-gray-50 min-h-screen relative pb-28" style={{ scrollPaddingTop: '11rem' }}>
      {/* STICKY HEADER */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm">
        <div className="px-8 pt-4 pb-3">
          <button
            onClick={() => navigate(backRoute)}
            className="flex items-center text-xs text-[#1D6021] font-semibold mb-2 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Loan Queue
          </button>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-[#1a4a2f] truncate">
                {loanDetails.memberName}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-0.5">
                <span>
                  Control # <span className="font-mono font-bold text-[#1D6021]">{loanDetails.id}</span>
                </span>
                <span className="text-gray-300">\u00B7</span>
                <span>{loanDetails.summary.loanType}</span>
                <span className="text-gray-300">\u00B7</span>
                <span className="font-bold text-gray-800">{loanDetails.summary.recommendedAmount}</span>
              </div>
            </div>
            <span className="bg-[#FEF08A] text-[#854D0E] px-3 py-1 rounded-full text-xs font-bold flex items-center shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EAB308] mr-1.5"></span>
              {loanDetails.status}
            </span>
          </div>

          {/* Workflow steps */}
          <div className="mt-3 flex items-center gap-1 overflow-x-auto">
            {workflowSteps.map((step, idx) => {
              const Icon = step.icon;
              const done = idx < currentStepIdx;
              const active = idx === currentStepIdx;
              return (
                <React.Fragment key={step.key}>
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                      active
                        ? 'bg-[#1D6021] text-white'
                        : done
                        ? 'bg-green-50 text-[#1D6021]'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {step.label}
                  </div>
                  {idx < workflowSteps.length - 1 && (
                    <span className={`w-4 h-px ${done ? 'bg-[#1D6021]' : 'bg-gray-200'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Quick stats strip */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <QuickStat label="Principal" value={loanDetails.computation.principal} />
            <QuickStat label="Term" value={`${loanDetails.computation.termMonths || 0} Months`} />
            <QuickStat label="Monthly Amort." value={loanDetails.computation.monthlyAmortization} accent />
            <QuickStat label="Total Payment" value={loanDetails.computation.totalPayable} />
          </div>

          {/* Section nav tabs */}
          <div className="mt-3 flex items-center gap-1 overflow-x-auto -mx-1 px-1">
            {sectionTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => scrollToSection(tab.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-gray-600 hover:bg-[#1D6021]/10 hover:text-[#1D6021] transition-colors whitespace-nowrap"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-8">
      {actionError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 p-8 gap-8">

          {/* Left Column */}
          <div className="flex flex-col gap-8">
            {/* Member & Loan Summary */}
            <div id="section-summary" className="scroll-mt-44">
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

            {/* Treasurer's Disbursement Assessment */}
            <div id="section-assessment" className="scroll-mt-44">
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <BarChart2 className="w-5 h-5 mr-2 text-[#1D6021]" /> Treasurer's Disbursement Assessment
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
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
            </div>
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-8">
            <div id="section-computation" className="scroll-mt-44">
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <Calculator className="w-5 h-5 mr-2 text-[#1D6021]" /> Loan Computation Summary
              </h2>
              {Array.isArray(loanDetails.computation.emergencySchedule)
                && loanDetails.computation.emergencySchedule.length > 0 ? null : (
                <div className="bg-[#EAF1EB] rounded-xl p-6">
                  <div className="space-y-2.5 mb-4">
                    <div className="flex justify-between items-baseline text-sm">
                      <span className="text-gray-600 font-medium">Principal Amount</span>
                      <span className="font-bold text-gray-800">{loanDetails.computation.principal}</span>
                    </div>
                    <div className="flex justify-between items-baseline text-sm">
                      <span className="text-gray-600 font-medium">Interest Rate</span>
                      <span className="font-bold text-gray-800">{loanDetails.computation.interestRate}</span>
                    </div>
                    <div className="flex justify-between items-baseline text-sm">
                      <span className="text-gray-600 font-medium">Total Interest</span>
                      <span className="font-bold text-gray-800">{loanDetails.computation.totalInterest}</span>
                    </div>
                    <div className="flex justify-between items-baseline text-sm border-t border-gray-300/70 pt-2.5">
                      <span className="text-gray-700 font-semibold">Total Payment</span>
                      <span className="font-extrabold text-gray-900">{loanDetails.computation.totalPayable}</span>
                    </div>
                  </div>
                  <div className="border-t border-gray-300 pt-4 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-bold text-[#1D6021] uppercase tracking-wider">Monthly Amortization</p>
                      <p className="text-[9px] text-gray-500">Payable per month</p>
                    </div>
                    <span className="text-2xl font-black text-[#1D6021]">{loanDetails.computation.monthlyAmortization}</span>
                  </div>
                </div>
              )}

              {Array.isArray(loanDetails.computation.emergencySchedule)
                && loanDetails.computation.emergencySchedule.length > 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-[#1D6021] text-center mb-3">
                    {loanDetails.computation.termMonths}-Month Amortization Schedule
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 uppercase tracking-wider text-[10px] border-b border-gray-200">
                          <th className="py-2 px-2 text-left font-semibold">Month</th>
                          <th className="py-2 px-2 text-right font-semibold">Starting Balance</th>
                          <th className="py-2 px-2 text-right font-semibold">Principal</th>
                          <th className="py-2 px-2 text-right font-semibold">Interest</th>
                          <th className="py-2 px-2 text-right font-semibold">Total Payment</th>
                          <th className="py-2 px-2 text-right font-semibold">Remaining Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loanDetails.computation.emergencySchedule.map((row) => (
                          <tr key={row.month} className="border-b border-gray-100 last:border-b-0">
                            <td className="py-2 px-2 font-semibold text-gray-700">{row.month}</td>
                            <td className="py-2 px-2 text-right text-[#1D6021]">{formatCurrency(row.startingBalance)}</td>
                            <td className="py-2 px-2 text-right text-gray-800">{formatCurrency(row.principal)}</td>
                            <td className="py-2 px-2 text-right text-red-600">{formatCurrency(row.interest)}</td>
                            <td className="py-2 px-2 text-right font-bold text-gray-900">{formatCurrency(row.totalPayment)}</td>
                            <td className="py-2 px-2 text-right text-[#1D6021]">{formatCurrency(row.remainingBalance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Supporting Documents */}
            <div id="section-documents" className="scroll-mt-44">
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <Paperclip className="w-5 h-5 mr-2 text-[#1D6021]" /> Supporting Documents
              </h2>
              {supportingDocs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-[#F8F9FA] p-6 text-sm text-gray-500">
                  No supporting photos uploaded yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {supportingDocs.map((doc, index) => {
                    const previewUrl = supportingDocUrls[doc.storage_path] || '';
                    const isImage = /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(String(doc.file_name || ''));

                    return (
                      <div key={`${doc.storage_path}-${index}`} className="rounded-xl border border-gray-200 bg-white p-3">
                        <div className="mb-2 h-40 overflow-hidden rounded-lg bg-gray-100 flex items-center justify-center">
                          {previewUrl && isImage ? (
                            <img src={previewUrl} alt={doc.file_name} className="h-full w-full object-cover" />
                          ) : (
                            <FileImage className="w-8 h-8 text-gray-400" />
                          )}
                        </div>
                        <p className="truncate text-xs font-semibold text-gray-700">{doc.file_name}</p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : 'Upload date unavailable'}
                        </p>
                        {previewUrl ? (
                          <a
                            href={previewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#1D6021] hover:underline"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Open
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bookkeeper Internal Review (full-width row) */}
        <div id="section-notes" className="scroll-mt-44 px-8 pb-8">
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
      </div>

      {/* STICKY ACTION FOOTER */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 shadow-lg">
        <div className="px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-gray-500 hidden md:block">
            <span className="font-semibold text-gray-700">{loanDetails.memberName}</span> \u00B7
            <span className="ml-1 font-mono">{loanDetails.id}</span> \u00B7
            <span className="ml-1 font-bold text-[#1D6021]">{loanDetails.computation.monthlyAmortization}/mo</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {isBookkeeperFlow ? (
              <button
                onClick={() => setActiveModal('recommend')}
                className="flex items-center px-5 py-2 rounded-lg bg-[#1D6021] text-white hover:bg-[#154718] font-bold text-sm transition-colors"
              >
                <Check className="w-4 h-4 mr-2" /> Recommend for Approval
              </button>
            ) : (
              <>
                <button
                  onClick={() => setActiveModal('reschedule')}
                  className="flex items-center px-4 py-2 rounded-lg border border-yellow-200 text-yellow-700 bg-[#FEF9C3] hover:bg-yellow-200 font-bold text-sm transition-colors"
                >
                  <FileEdit className="w-4 h-4 mr-2" /> Reschedule
                </button>
                <button
                  onClick={() => setActiveModal('disburse')}
                  className="flex items-center px-5 py-2 rounded-lg bg-[#1D6021] text-white hover:bg-[#154718] font-bold text-sm transition-colors"
                >
                  <Check className="w-4 h-4 mr-2" /> Approve for Disbursement
                </button>
              </>
            )}
          </div>
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