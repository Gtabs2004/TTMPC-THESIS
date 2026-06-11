import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { formatTinNumber } from '../../LOANFORMS/tinFormat';
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
  Upload,
  ExternalLink,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Info,
  ClipboardCheck,
  Briefcase,
  Banknote,
  Wallet,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

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

const EMPTY_CO_MAKERS = [
  { membership_number_id: '', name: '', id_no: '', address: '', mobile: '', email: '' },
  { membership_number_id: '', name: '', id_no: '', address: '', mobile: '', email: '' },
];

const SUPPORTING_DOCS_BUCKET = 'Supporting_Documents';

const sanitizeFilename = (name) => {
  return String(name || 'file')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
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
  const [bookkeeperInternalRemarks, setBookkeeperInternalRemarks] = useState('');
  const [coMakerDetails, setCoMakerDetails] = useState(EMPTY_CO_MAKERS);
  const [coMakerSearch, setCoMakerSearch] = useState(['', '']);
  const [coMakerMemberOptions, setCoMakerMemberOptions] = useState([]);
  const [coMakerMemberLoading, setCoMakerMemberLoading] = useState(false);
  const [sendSms, setSendSms] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [loanDetails, setLoanDetails] = useState(null);
  const [supportingDocs, setSupportingDocs] = useState([]);
  const [supportingDocUrls, setSupportingDocUrls] = useState({});
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState('');
  const [simulatedBalance, setSimulatedBalance] = useState(null);
  const [riskAssessment, setRiskAssessment] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState('');
  const [revisionResetDone, setRevisionResetDone] = useState(false);

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

  const loadCoMakerMembers = useCallback(async () => {
    try {
      setCoMakerMemberLoading(true);

      const dedupeByMembership = (rows) => {
        const seen = new Set();
        const normalized = [];
        for (const row of rows) {
          const membershipId = String(row.membership_number_id || '').trim();
          if (!membershipId || seen.has(membershipId)) continue;
          seen.add(membershipId);
          normalized.push({
            membership_number_id: membershipId,
            name: String(row.name || '').trim(),
          });
        }
        return normalized;
      };

      const { data, error } = await supabase
        .from('personal_data_sheet')
        .select('membership_number_id, surname, first_name, middle_name, permanent_address, contact_number, email, tin_number, created_at')
        .not('membership_number_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000);

      let options = [];
      if (!error) {
        options = dedupeByMembership(
          (data || []).map((row) => ({
            membership_number_id: row.membership_number_id,
            name: [row.first_name, row.middle_name, row.surname]
              .filter(Boolean)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim(),
          }))
        );
      }

      // Fallback: if personal_data_sheet is blocked by RLS or empty, use member table names.
      if (!options.length) {
        const { data: memberRows, error: memberError } = await supabase
          .from('member')
          .select('membership_id, first_name, middle_initial, last_name')
          .not('membership_id', 'is', null)
          .order('membership_id', { ascending: true })
          .limit(2000);

        if (!memberError) {
          options = dedupeByMembership(
            (memberRows || []).map((row) => ({
              membership_number_id: row.membership_id,
              name: [row.first_name, row.middle_initial, row.last_name]
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim(),
            }))
          );
        }
      }

      setCoMakerMemberOptions(options);
    } catch (_err) {
      setCoMakerMemberOptions([]);
    } finally {
      setCoMakerMemberLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (isMounted) {
      loadCoMakerMembers();
    }

    return () => {
      isMounted = false;
    };
  }, [loadCoMakerMembers]);

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
          const { data: koicaRows, error: koicaError } = await supabase
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
            .limit(1);
          if (koicaError) throw koicaError;
          data = koicaRows?.[0] || null;
          tableName = 'koica_loans';
        } else {
          const { data: loanRows, error: loanError } = await supabase
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
              user_email,
              bookkeeper_internal_remarks,
              bookkeeper_reviewed_at,
              manager_review_requested_at,
              raw_payload,
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
            .limit(1);
          if (loanError) throw loanError;
          data = loanRows?.[0] || null;
        }

        if (!data) throw new Error('Loan record not found.');

        const firstName = data.member?.first_name || '';
        const lastName = data.member?.last_name || '';
        const memberName = isKoicaSource
          ? (data.full_name || 'Unknown Applicant')
          : (`${firstName} ${lastName}`.trim() || 'Unknown Member');
        const principalAmount = Number(data.principal_amount ?? data.loan_amount ?? 0);
        const termMonths = Number(data.term || 0);
        const resolvedLoanType = isKoicaSource
          ? (data.loan_type_code === 'NONMEMBER_BONUS' ? 'Nonmember Bonus Loan' : 'ABFF Loan')
          : (data.loan_type?.name || 'N/A');
        // Always re-resolve from loan_types so stale per-loan snapshots from the
        // pre-rate-fix era cannot poison the display. Fall back to the snapshot
        // only if loan_types lookup yields nothing.
        let effectiveInterestRate = await resolveInterestRateFromLoanTypes(resolvedLoanType, data.loan_type_code);
        if (effectiveInterestRate === null || effectiveInterestRate === undefined) {
          effectiveInterestRate = data.interest_rate;
        }
        // Sanity guard: a TTMPC monthly rate above 5% is almost certainly a
        // corrupted snapshot (e.g., 8.3 stored when 0.83 was intended).
        if (Number(effectiveInterestRate) > 5) {
          const fallback = await resolveInterestRateFromLoanTypes(resolvedLoanType, data.loan_type_code);
          if (fallback !== null && fallback !== undefined && Number(fallback) <= 5) {
            effectiveInterestRate = fallback;
          }
        }

        // Always recompute totals from principal + rate + term.
        // For Emergency loans: use EMI (diminishing balance) formula
        // For other loans: use simple add-on interest
        // The stored monthly_amortization may be stale (loans created under buggy rate values),
        // so we treat the formula as the source of truth at display time.
        const monthlyRateDecimal = effectiveInterestRate !== null
          ? Number(effectiveInterestRate) / 100
          : 0;

        let monthlyAmortization, resolvedTotalInterest, totalPayable;
        let monthlyInterestAmount = 0;
        let monthlyPrincipalAmount = 0;

        if (resolvedLoanType.toLowerCase().includes('emergency')) {
          // Emergency: EMI formula (diminishing balance)
          if (principalAmount > 0 && termMonths > 0 && monthlyRateDecimal > 0) {
            const numerator = principalAmount * monthlyRateDecimal;
            const denominator = 1 - Math.pow(1 + monthlyRateDecimal, -termMonths);
            monthlyAmortization = numerator / denominator;
            
            let remaining = principalAmount;
            resolvedTotalInterest = 0;
            for (let i = 0; i < termMonths; i++) {
              const interest = remaining * monthlyRateDecimal;
              resolvedTotalInterest += interest;
              remaining -= (monthlyAmortization - interest);
            }
          } else {
            monthlyAmortization = 0;
            resolvedTotalInterest = 0;
          }
        } else {
          // Consolidated & others: simple add-on interest
          monthlyInterestAmount = principalAmount > 0
            ? principalAmount * monthlyRateDecimal
            : 0;
          monthlyPrincipalAmount = (principalAmount > 0 && termMonths > 0)
            ? principalAmount / termMonths
            : 0;
          monthlyAmortization = monthlyInterestAmount + monthlyPrincipalAmount;
          resolvedTotalInterest = monthlyInterestAmount * termMonths;
        }

        totalPayable = principalAmount + resolvedTotalInterest;

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
          status: formatStatus(data.loan_status || data.application_status),
          summary: {
            loanType: resolvedLoanType,
            recommendedAmount: formatCurrency(data.loan_amount),
            term: `${data.term || 0} Months`,
            migsStatus: isKoicaSource ? 'N/A' : (data.member?.is_bona_fide ? 'MIGS' : 'NON-MIGS'),
            memberEmail: (
              data.user_email
              || data.raw_payload?.optionalFields?.user_email
              || data.raw_payload?.user_email
              || data.raw_payload?.email
              || ''
            ),
            loanPurpose: data.loan_purpose || data.raw_payload?.optionalFields?.loan_purpose || 'N/A',
            employerPosition: data.source_of_income || data.raw_payload?.optionalFields?.source_of_income || 'N/A',
            bookkeeperInternalRemarks: data.bookkeeper_internal_remarks || 'No internal remarks submitted.',
            bookkeeperCoMakers: normalizedCoMakers,
            bookkeeperReviewedAt: data.bookkeeper_reviewed_at || null,
            managerReviewRequestedAt: data.manager_review_requested_at || null,
          },
          computation: {
            termMonths,
            term: termMonths > 0 ? `${termMonths} Months` : 'N/A',
            principal: formatCurrency(principalAmount),
            interestRate: effectiveInterestRate !== null
              ? `${Number(effectiveInterestRate).toFixed(2)}% Monthly`
              : 'N/A',
            totalInterest: formatCurrency(resolvedTotalInterest),
            totalPayable: formatCurrency(totalPayable),
            monthlyInterestAddOn: formatCurrency(monthlyInterestAmount),
            monthlyPrincipalPortion: formatCurrency(monthlyPrincipalAmount),
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
          setCoMakerDetails(normalizedCoMakers);
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

  // Load cached risk assessment for this loan (if any)
  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('risk_assessments')
          .select('*')
          .eq('loan_control_number', id)
          .maybeSingle();
        if (!isMounted) return;
        if (error) {
          setRiskError('');
          return;
        }
        if (data) setRiskAssessment(data);
      } catch (_err) {
        // silent — empty assessment state means "not yet scored"
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleRunRiskAssessment = async () => {
    if (!id) return;
    setRiskLoading(true);
    setRiskError('');
    try {
      const source = isKoicaSource ? 'koica_loans' : 'loans';
      const { data: { user } = {} } = (await supabase.auth.getUser()) || {};
      const response = await fetch(`${API_BASE_URL}/api/risk/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_control_number: id,
          source,
          scored_by: user?.id || null,
          force_refresh: !!riskAssessment, // re-run only when explicitly clicked again
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const detail = typeof payload?.detail === 'string'
          ? payload.detail
          : 'Risk assessment failed. Please try again.';
        throw new Error(detail);
      }
      setRiskAssessment(payload);
    } catch (err) {
      setRiskError(err.message || 'Failed to run risk assessment.');
    } finally {
      setRiskLoading(false);
    }
  };

  const sendStatusEmail = async ({ toEmail, memberName, status, remarks }) => {
    // Legacy helper kept for backward compatibility with the membership-style
    // notification. New loan workflow uses dispatchLoanEmail() below.
    const emailValue = String(toEmail || '').trim();
    if (!emailValue) return;
    try {
      await fetch(`${API_BASE_URL}/api/send-status-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_email: emailValue,
          member_name: memberName || 'Member',
          status,
          remarks: remarks || null,
        }),
      });
    } catch (_err) {
      // Notification failures should not block status updates.
    }
  };

  // Fire-and-forget loan-status email (Resend). Backend handles transition guards,
  // duplicate protection, recipient resolution, and audit logging. Must NOT throw.
  const dispatchLoanEmail = async ({ stage, action, remarks, overrideMemberEmail, nextApproverEmail }) => {
    if (!loanDetails?.id || !stage || !action) return;
    try {
      const { data: { user } = {} } = (await supabase.auth.getUser()) || {};
      await fetch(`${API_BASE_URL}/api/loans/email/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_id: loanDetails.id,
          stage,
          action,
          remarks: remarks || null,
          actor_user_id: user?.id || null,
          next_approver_email: nextApproverEmail || null,
          override_member_email: overrideMemberEmail || null,
        }),
      });
    } catch (_err) {
      // Email dispatch must never block the approval workflow.
    }
  };

  // Fire-and-forget in-app (bell) notification dispatch. Backend dedups by
  // (recipient_role, loan_id, notification_type). Failures are silent.
  const dispatchInAppNotification = async ({ recipientRole, notificationType }) => {
    if (!loanDetails?.id || !recipientRole || !notificationType) return;
    try {
      const { data: { user } = {} } = (await supabase.auth.getUser()) || {};
      await fetch(`${API_BASE_URL}/api/loans/notifications/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_id: loanDetails.id,
          recipient_role: recipientRole,
          notification_type: notificationType,
          actor_user_id: user?.id || null,
          member_name: loanDetails.memberName || null,
          loan_type: loanDetails.loanType || null,
        }),
      });
    } catch (_err) {
      // Notification dispatch must never block the approval workflow.
    }
  };

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

  const handleSupportingDocumentUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !loanDetails?.id) return;

    if (!isBookkeeperFlow) {
      setDocError('Only Bookkeeper can upload supporting documents in this view.');
      event.target.value = '';
      return;
    }

    try {
      setDocLoading(true);
      setDocError('');

      const safeName = sanitizeFilename(file.name);
      const storagePath = `loan_supporting_documents/${loanDetails.id}/${Date.now()}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(SUPPORTING_DOCS_BUCKET)
        .upload(storagePath, file, { upsert: false, contentType: file.type || 'application/octet-stream' });

      if (uploadError) {
        throw new Error(uploadError.message || 'Failed to upload supporting document.');
      }

      const existingRawPayload = loanDetails.rawPayload && typeof loanDetails.rawPayload === 'object'
        ? loanDetails.rawPayload
        : {};
      const existingOptionalFields = existingRawPayload.optionalFields && typeof existingRawPayload.optionalFields === 'object'
        ? existingRawPayload.optionalFields
        : {};
      const existingBookkeeperDetails = existingOptionalFields.bookkeeper_loan_details
        && typeof existingOptionalFields.bookkeeper_loan_details === 'object'
        ? existingOptionalFields.bookkeeper_loan_details
        : {};

      const nextDocuments = [
        {
          doc_type: 'photo',
          file_name: file.name,
          storage_path: storagePath,
          uploaded_at: new Date().toISOString(),
          uploaded_by_role: 'bookkeeper',
        },
        ...supportingDocs,
      ];

      const shouldReset = isBookkeeperFlow
        && !revisionResetDone
        && String(loanDetails?.status || '').toLowerCase().includes('revision');

      const updatePayload = {
        raw_payload: {
          ...existingRawPayload,
          optionalFields: {
            ...existingOptionalFields,
            bookkeeper_loan_details: {
              ...existingBookkeeperDetails,
              supporting_documents: nextDocuments,
            },
          },
        },
      };

      if (shouldReset) {
        updatePayload.loan_status = 'pending';
        updatePayload.application_status = 'pending';
      }

      const { data: updatedRows, error: updateError } = await supabase
        .from(loanDetails.sourceTable || 'loans')
        .update(updatePayload)
        .eq('control_number', loanDetails.id)
        .select('raw_payload')
        .limit(1);

      if (updateError) {
        throw new Error(updateError.message || 'Failed to save supporting document metadata.');
      }

      const updatedRawPayload = updatedRows?.[0]?.raw_payload || updatePayload.raw_payload;
      const normalized = normalizeSupportingDocuments(updatedRawPayload);

      setLoanDetails((prev) => prev ? {
        ...prev,
        rawPayload: updatedRawPayload,
        status: shouldReset ? formatStatus('pending') : prev.status,
      } : prev);
      if (shouldReset) {
        setRevisionResetDone(true);
      }
      setSupportingDocs(normalized);
    } catch (err) {
      setDocError(err.message || 'Unable to upload supporting document.');
    } finally {
      setDocLoading(false);
      event.target.value = '';
    }
  };

  const closeModal = () => {
    setActiveModal(null);
    setActionError('');
    setRemarks('');
    setBookkeeperInternalRemarks('');
    setSendSms(true);
    setSendEmail(true);
  };

  const updateCoMakerField = (index, field, value) => {
    setCoMakerDetails((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
    if (isBookkeeperFlow && !revisionResetDone && String(loanDetails?.status || '').toLowerCase().includes('revision')) {
      setRevisionResetDone(true);
      supabase
        .from(loanDetails.sourceTable || 'loans')
        .update({ loan_status: 'pending', application_status: 'pending' })
        .eq('control_number', loanDetails.id)
        .select('loan_status')
        .limit(1)
        .then(() => {
          setLoanDetails((prev) => prev ? { ...prev, status: formatStatus('pending') } : prev);
        })
        .catch(() => {
          // Ignore failures; status will reset on recommend if needed.
        });
    }
  };

  const updateCoMakerSearch = (index, value) => {
    setCoMakerSearch((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const filteredCoMakerOptions = (index) => {
    const query = String(coMakerSearch[index] || '').trim().toLowerCase();
    if (!query) return coMakerMemberOptions;
    return coMakerMemberOptions.filter((option) => {
      const name = String(option.name || '').toLowerCase();
      const membership = String(option.membership_number_id || '').toLowerCase();
      return name.includes(query) || membership.includes(query);
    });
  };

  const handleCoMakerMemberSelect = async (index, membershipNumberId) => {
    const selected = coMakerMemberOptions.find((item) => item.membership_number_id === membershipNumberId);

    setCoMakerDetails((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      if (!selected) return { ...item, membership_number_id: '' };

      return {
        ...item,
        membership_number_id: selected.membership_number_id,
        name: selected.name || '',
        id_no: '',
        address: '',
        mobile: '',
        email: '',
      };
    }));

    if (!membershipNumberId) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('personal_data_sheet')
        .select('surname, first_name, middle_name, tin_number, contact_number, email, permanent_address, created_at')
        .eq('membership_number_id', membershipNumberId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return;
      }

      const fullName = [data.first_name, data.middle_name, data.surname]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const tinValue = String(data.tin_number || '').trim();
      const tinFormatted = formatTinNumber(tinValue);

      setCoMakerDetails((prev) => prev.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          membership_number_id: membershipNumberId,
          name: fullName || item.name,
          id_no: tinFormatted ? `TIN-${tinFormatted}` : item.id_no,
          address: String(data.permanent_address || '').trim() || item.address,
          mobile: data.contact_number ? String(data.contact_number).trim() : item.mobile,
          email: String(data.email || '').trim() || item.email,
        };
      }));
    } catch (_err) {
      // Keep the selected option values when deep fetch fails.
    }
  };

  const applyLoanStatusUpdate = async (modalType) => {
    if (!loanDetails?.id) return;

    if ((modalType === 'reject' || modalType === 'revise') && !remarks.trim()) {
      setActionError('Please provide remarks before confirming this action.');
      return;
    }

    if (isBookkeeperFlow && modalType === 'recommend') {
      if (!bookkeeperInternalRemarks.trim()) {
        setActionError('Please enter internal remarks before sending to Manager.');
        return;
      }

      const hasAtLeastOneCoMaker = coMakerDetails.some((row) => (
        String(row.membership_number_id || '').trim().length > 0
        || String(row.name || '').trim().length > 0
      ));
      if (!hasAtLeastOneCoMaker) {
        setActionError('Please enter at least one co-maker under Bookkeeper Internal Review.');
        return;
      }
    }

    let nextStatus = 'pending';
    if (isBookkeeperFlow && modalType === 'recommend') nextStatus = 'recommended for approval';
    if (!isBookkeeperFlow && modalType === 'proceed') nextStatus = 'to be disbursed';
    if (!isBookkeeperFlow && modalType === 'reject') nextStatus = 'rejected';
    if (!isBookkeeperFlow && modalType === 'revise') nextStatus = 'revision_requested';

    try {
      setSaving(true);
      setActionError('');

      const updatePayload = { loan_status: nextStatus, application_status: nextStatus };
      if (isBookkeeperFlow && modalType === 'recommend') {
        const normalizedCoMakers = coMakerDetails
          .map((row) => ({
            membership_number_id: String(row.membership_number_id || '').trim() || null,
            name: String(row.name || '').trim() || null,
            id_no: String(row.id_no || '').trim() || null,
            address: String(row.address || '').trim() || null,
            mobile: String(row.mobile || '').trim() || null,
            email: String(row.email || '').trim().toLowerCase() || null,
            liability_status: 'active',
          }))
          .filter((row) => row.membership_number_id || row.name || row.id_no || row.address || row.mobile || row.email);

        const existingRawPayload = loanDetails.rawPayload && typeof loanDetails.rawPayload === 'object'
          ? loanDetails.rawPayload
          : {};
        const existingOptionalFields = existingRawPayload.optionalFields && typeof existingRawPayload.optionalFields === 'object'
          ? existingRawPayload.optionalFields
          : {};

        updatePayload.bookkeeper_internal_remarks = bookkeeperInternalRemarks.trim();
        updatePayload.bookkeeper_reviewed_at = new Date().toISOString();
        updatePayload.manager_review_requested_at = new Date().toISOString();
        updatePayload.raw_payload = {
          ...existingRawPayload,
          optionalFields: {
            ...existingOptionalFields,
            bookkeeper_loan_details: {
              ...(existingOptionalFields.bookkeeper_loan_details || {}),
              coMakers: normalizedCoMakers,
            },
          },
        };
      }

      if (!isBookkeeperFlow && (modalType === 'reject' || modalType === 'revise' || modalType === 'proceed')) {
        const { data: { user } = {} } = await supabase.auth.getUser();
        const existingRawPayload = loanDetails.rawPayload && typeof loanDetails.rawPayload === 'object'
          ? loanDetails.rawPayload
          : {};
        const existingOptionalFields = existingRawPayload.optionalFields && typeof existingRawPayload.optionalFields === 'object'
          ? existingRawPayload.optionalFields
          : {};

        updatePayload.raw_payload = {
          ...existingRawPayload,
          optionalFields: {
            ...existingOptionalFields,
            manager_review_details: {
              status: nextStatus,
              remarks: remarks.trim() || null,
              reviewed_at: new Date().toISOString(),
              reviewed_by: user?.id || null,
            },
          },
        };
      }

      const { data: updatedRows, error } = await supabase
        .from(loanDetails.sourceTable || 'loans')
        .update(updatePayload)
        .eq('control_number', loanDetails.id)
        .select('control_number, loan_status, bookkeeper_internal_remarks, bookkeeper_reviewed_at, manager_review_requested_at, raw_payload')
        .limit(1);

      if (error) {
        throw new Error(error.message || 'Failed to update loan status.');
      }

      const updatedRow = updatedRows?.[0] || null;

      if (!updatedRow) {
        throw new Error('Loan record not found during status update.');
      }

      setLoanDetails((prev) => prev ? {
        ...prev,
        status: formatStatus(nextStatus),
        rawPayload: updatedRow.raw_payload || prev.rawPayload,
        summary: {
          ...prev.summary,
          bookkeeperInternalRemarks: updatedRow.bookkeeper_internal_remarks || prev.summary.bookkeeperInternalRemarks,
          bookkeeperCoMakers: coMakerDetails,
          bookkeeperReviewedAt: updatedRow.bookkeeper_reviewed_at || prev.summary.bookkeeperReviewedAt,
          managerReviewRequestedAt: updatedRow.manager_review_requested_at || prev.summary.managerReviewRequestedAt,
        },
      } : prev);
      closeModal();
      navigate(backRoute);

      // ---- Loan workflow notification dispatch (non-blocking, idempotent on the backend) ----
      // Rules:
      //   Bookkeeper recommend -> in-app notification to Manager.   No member email.
      //   Bookkeeper reject    -> in-app notification to Manager.   No member email.
      //   Manager proceed      -> in-app notification to Treasurer + member email.
      //   Manager reject/revise-> in-app notification only (Bookkeeper side, future). No member email.
      // The treasurer 'released/disbursed' member email is fired server-side from
      // the /api/cashier/disbursements/{loan_id}/disburse endpoint.
      if (isBookkeeperFlow && modalType === 'recommend') {
        dispatchInAppNotification({ recipientRole: 'manager', notificationType: 'recommend' });
      } else if (isBookkeeperFlow && modalType === 'reject') {
        dispatchInAppNotification({ recipientRole: 'manager', notificationType: 'decline' });
      } else if (!isBookkeeperFlow && modalType === 'proceed') {
        dispatchInAppNotification({ recipientRole: 'treasurer', notificationType: 'approve' });
        if (sendEmail !== false) {
          dispatchLoanEmail({
            stage: 'manager',
            action: 'approve',
            remarks: remarks?.trim() || null,
            overrideMemberEmail: loanDetails?.summary?.memberEmail || null,
          });
        }
      } else if (!isBookkeeperFlow && modalType === 'reject') {
        dispatchInAppNotification({ recipientRole: 'bookkeeper', notificationType: 'reject' });
      } else if (!isBookkeeperFlow && modalType === 'revise') {
        dispatchInAppNotification({ recipientRole: 'bookkeeper', notificationType: 'revise' });
      }
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
  } else if (statusLower.includes('treasurer') || statusLower.includes('approved by manager')) {
    currentStepIdx = 2;
  } else if (statusLower.includes('manager') || statusLower.includes('approved by bookkeeper')) {
    currentStepIdx = 1;
  } else if (isBookkeeperFlow || statusLower.includes('bookkeeper') || statusLower.includes('pending')) {
    currentStepIdx = 0;
  } else {
    currentStepIdx = 1;
  }

  // ---- Section anchors ----
  const sectionTabs = [
    { id: 'section-summary',     label: 'Summary',       icon: User },
    { id: 'section-risk',        label: 'Risk',          icon: BarChart2 },
    { id: 'section-computation', label: 'Computation',   icon: Calculator },
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
                <span className="text-gray-300">·</span>
                <span>{loanDetails.summary.loanType}</span>
                <span className="text-gray-300">·</span>
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
            <QuickStat label="Term" value={loanDetails.computation.term} />
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

            {/* Payment Risk Indicators (TTMPC Credit Risk Model) */}
            <div id="section-risk" className="scroll-mt-44">
              <div className="flex items-center justify-between mb-4">
                <h2 className="flex items-center text-lg font-bold text-gray-800">
                  <BarChart2 className="w-5 h-5 mr-2 text-[#1D6021]" /> Payment Risk Indicators
                </h2>
                <button
                  type="button"
                  onClick={handleRunRiskAssessment}
                  disabled={riskLoading}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md border border-[#1D6021] text-[#1D6021] hover:bg-[#1D6021] hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {riskLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {riskAssessment ? 'Re-run' : 'Run Risk Assessment'}
                </button>
              </div>

              {riskError && (
                <div className="mb-3 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
                  {riskError}
                </div>
              )}

              {!riskAssessment && !riskLoading && !riskError && (
                <div className="p-5 border border-dashed border-gray-300 rounded-xl text-center text-sm text-gray-500">
                  No risk assessment yet. Click <span className="font-semibold text-[#1D6021]">Run Risk Assessment</span> to score this application.
                </div>
              )}

              {riskAssessment && (() => {
                const isHighRisk = Number(riskAssessment.risk_class) === 1;
                const features = riskAssessment.features_used || {};
                const stabilityScore = Number(features.Stability_Score ?? 0);
                const stabilityLabel = stabilityScore >= 4
                  ? 'Public Sector / Institutional'
                  : stabilityScore >= 3
                  ? 'Private Professional / Skilled'
                  : stabilityScore >= 2
                  ? 'Service / Support or Unclassified'
                  : 'Entrepreneurial / Informal';
                const incomeMissing = Number(features.Income_Is_Missing) === 1;
                // Policy: show the exact computed Repayment Stress Index — no
                // display cap. The 40% ceiling still drives the risk band:
                // anything above 40 is labelled High Risk regardless of how
                // large the actual percentage gets (e.g. 120%).
                const STRESS_INDEX_CEILING = 40;
                const rawStressIndex = Number(features.Repayment_Stress_Index);
                const stressIndex = Number.isFinite(rawStressIndex) && rawStressIndex >= 0
                  ? rawStressIndex
                  : 0;
                const stressIndexOverCap = Number.isFinite(rawStressIndex) && rawStressIndex > STRESS_INDEX_CEILING;
                const stressIndexBand = !Number.isFinite(rawStressIndex)
                  ? 'Unknown'
                  : rawStressIndex < 20 ? 'Safe'
                  : rawStressIndex <= 35 ? 'Low Risk'
                  : rawStressIndex <= 40 ? 'Moderate Risk'
                  : 'High Risk';

                return (
                  <div className="space-y-4">
                    {/* Top row: class badge */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className={`border rounded-xl p-4 flex flex-col items-center justify-center text-center ${isHighRisk ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}>
                        {isHighRisk ? (
                          <ShieldAlert className="w-8 h-8 text-red-600 mb-2" />
                        ) : (
                          <ShieldCheck className="w-8 h-8 text-green-700 mb-2" />
                        )}
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Risk Class</p>
                        <p className={`text-lg font-black ${isHighRisk ? 'text-red-700' : 'text-green-800'}`}>
                          {isHighRisk ? 'High Risk' : 'Performing'}
                        </p>
                      </div>
                      <div className="border border-gray-200 rounded-xl p-4">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Risk Summary</p>
                        <p className="text-sm text-gray-700">
                          {isHighRisk
                            ? 'High risk based on current model features. Review borrower context before final decision.'
                            : 'Performing risk profile based on current model features.'}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-3 italic">
                          Model output is a screening tool, not a final decision.
                        </p>
                      </div>
                    </div>

                    {/* Features used row */}
                    <div className="border border-gray-200 rounded-xl p-4">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                        <Info className="w-3.5 h-3.5" /> Features Used by the Model
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Loan Amount</p>
                          <p className="font-bold text-gray-800">{formatCurrency(features.LoanAmount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Occupation Group</p>
                          <p className="font-bold text-gray-800">{stabilityLabel}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Stability Score</p>
                          <p className="font-bold text-gray-800">{stabilityScore}</p>
                        </div>
                         {  
                        <div>
                        <p className="text-[10px] text-gray-400 uppercase">Repayment Stress</p>
                          {incomeMissing ? (
                            <p className="font-bold text-gray-800">— (income missing)</p>
                          ) : (
                            <>
                              <p className={`font-bold ${stressIndexOverCap ? 'text-red-700' : 'text-gray-800'}`}>
                                {stressIndex.toFixed(1)}%
                              </p>
                              <p className={`mt-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                stressIndexBand === 'High Risk' ? 'text-red-700'
                                : stressIndexBand === 'Moderate Risk' ? 'text-orange-600'
                                : stressIndexBand === 'Low Risk' ? 'text-yellow-700'
                                : 'text-[#2E7D32]'
                              }`}>
                                {stressIndexBand}
                              </p>
                              {stressIndexOverCap ? (
                                <p className="mt-0.5 text-[9px] text-red-600 italic">Exceeds 40% policy ceiling.</p>
                              ) : null}
                            </>
                          )}
                        </div>
                       }
                      </div>
                    </div>

                    {/* Footer: model version + scored_at */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-400 uppercase tracking-wider">
                      {riskAssessment.scored_at && (
                        <span>Scored: {new Date(riskAssessment.scored_at).toLocaleString()}</span>
                      )}
                      {riskAssessment.model_version && (
                        <span>Model: {riskAssessment.model_version}</span>
                      )}
                      {riskAssessment.cached && (
                        <span className="text-gray-500">(cached)</span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-8">

            <div id="section-computation" className="scroll-mt-44">
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <Calculator className="w-5 h-5 mr-2 text-[#1D6021]" /> Loan Computation Summary
              </h2>
              <div className="bg-[#EAF1EB] rounded-xl p-6">
                {/* Loan-level rows */}
                <div className="space-y-2.5 mb-4">
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-gray-600 font-medium">Term</span>
                    <span className="font-bold text-gray-800">{loanDetails.computation.term}</span>
                  </div>
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-gray-600 font-medium">Principal</span>
                    <span className="font-bold text-gray-800">{loanDetails.computation.principal}</span>
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

                {/* Monthly breakdown */}
                <div className="bg-white/60 rounded-lg p-3 mb-4 space-y-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Monthly Breakdown</p>
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-gray-600">Interest (Add-on)</span>
                    <span className="font-semibold text-gray-800">{loanDetails.computation.monthlyInterestAddOn}</span>
                  </div>
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-gray-600">Principal Portion</span>
                    <span className="font-semibold text-gray-800">{loanDetails.computation.monthlyPrincipalPortion}</span>
                  </div>
                </div>

                {/* Headline monthly amortization */}
                <div className="border-t border-gray-300 pt-4 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-[#1D6021] uppercase tracking-wider">Monthly Amortization</p>
                    <p className="text-[9px] text-gray-500">Payable per month</p>
                  </div>
                  <span className="text-2xl font-black text-[#1D6021]">{loanDetails.computation.monthlyAmortization}</span>
                </div>
              </div>
            </div>
          

            {/* Supporting Documents */}
            <div id="section-documents" className="scroll-mt-44">
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <Paperclip className="w-5 h-5 mr-2 text-[#1D6021]" /> Supporting Documents
              </h2>
              {isBookkeeperFlow && (
                <label className="mb-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-[#1D6021] hover:bg-green-100 transition-colors">
                  {docLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {docLoading ? 'Uploading...' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={docLoading}
                    onChange={handleSupportingDocumentUpload}
                  />
                </label>
              )}

              {docError ? (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {docError}
                </div>
              ) : null}

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

      </div>

      <br></br>

      {/* Bookkeeper Internal Review (full-width row) */}
      <div id="section-notes" className="scroll-mt-44 px-8 pb-8">
        <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
          <FileEdit className="w-5 h-5 mr-2 text-[#1D6021]" /> Bookkeeper Internal Review
        </h2>
        <div className="bg-[#F8F9FA] border border-gray-200 rounded-xl p-5 space-y-4">
          {isBookkeeperFlow && loanDetails?.rawPayload?.optionalFields?.manager_review_details && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">Manager Remarks</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">
                {loanDetails.rawPayload.optionalFields.manager_review_details.remarks || 'No remarks provided.'}
              </p>
              {loanDetails.rawPayload.optionalFields.manager_review_details.reviewed_at && (
                <p className="text-[10px] text-amber-700 mt-2">
                  Reviewed: {new Date(loanDetails.rawPayload.optionalFields.manager_review_details.reviewed_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Internal Remarks</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{loanDetails.summary.bookkeeperInternalRemarks}</p>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Co-Makers (Loan Details)</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[0, 1].map((index) => {
                const row = coMakerDetails[index] || EMPTY_CO_MAKERS[index];
                return (
                  <div key={`co-maker-${index}`} className="border border-gray-200 rounded-lg p-3 bg-white">
                    <p className="text-xs font-bold text-gray-700 mb-2">Co-Maker {index + 1}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2 flex gap-2">
                        <input
                          type="text"
                          value={coMakerSearch[index] || ''}
                          onChange={(e) => updateCoMakerSearch(index, e.target.value)}
                          placeholder="Search by name, surname, or membership number"
                          disabled={coMakerMemberLoading}
                          className="border border-gray-300 rounded px-3 py-2 text-sm flex-1 disabled:bg-gray-100"
                        />
                        <button
                          type="button"
                          onClick={loadCoMakerMembers}
                          disabled={coMakerMemberLoading}
                          className="px-3 py-2 text-xs font-semibold border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-60"
                        >
                          Refresh
                        </button>
                      </div>
                      <select
                        value={row.membership_number_id || ''}
                        onChange={(e) => handleCoMakerMemberSelect(index, e.target.value)}
                        disabled={!isBookkeeperFlow || coMakerMemberLoading}
                        className="border border-gray-300 rounded px-3 py-2 text-sm md:col-span-2 disabled:bg-gray-100"
                      >
                        <option value="">
                          {coMakerMemberLoading ? 'Loading members...' : 'Select Member (from Personal Data Sheet)'}
                        </option>
                        {!coMakerMemberLoading && coMakerMemberOptions.length === 0 ? (
                          <option value="" disabled>No members available</option>
                        ) : null}
                        {filteredCoMakerOptions(index).map((option) => (
                          <option key={option.membership_number_id} value={option.membership_number_id}>
                            {(option.name || 'Unnamed Member')} ({option.membership_number_id})
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => updateCoMakerField(index, 'name', e.target.value)}
                        placeholder="Full name"
                        disabled={!isBookkeeperFlow}
                        className="border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-100"
                      />
                      <input
                        type="text"
                        value={row.id_no}
                        onChange={(e) => updateCoMakerField(index, 'id_no', e.target.value)}
                        placeholder="ID number"
                        disabled={!isBookkeeperFlow}
                        className="border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-100"
                      />
                      <input
                        type="text"
                        value={row.mobile}
                        onChange={(e) => updateCoMakerField(index, 'mobile', e.target.value)}
                        placeholder="Mobile number"
                        disabled={!isBookkeeperFlow}
                        className="border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-100"
                      />
                      <input
                        type="email"
                        value={row.email}
                        onChange={(e) => updateCoMakerField(index, 'email', e.target.value)}
                        placeholder="Email"
                        disabled={!isBookkeeperFlow}
                        className="border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-100"
                      />
                      <input
                        type="text"
                        value={row.address}
                        onChange={(e) => updateCoMakerField(index, 'address', e.target.value)}
                        placeholder="Address"
                        disabled={!isBookkeeperFlow}
                        className="border border-gray-300 rounded px-3 py-2 text-sm md:col-span-2 disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* STICKY ACTION FOOTER */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 shadow-lg">
        <div className="px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-gray-500 hidden md:block">
            <span className="font-semibold text-gray-700">{loanDetails.memberName}</span> ·
            <span className="ml-1 font-mono">{loanDetails.id}</span> ·
            <span className="ml-1 font-bold text-[#1D6021]">{loanDetails.computation.monthlyAmortization}/mo</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {isBookkeeperFlow ? (
              <button
                onClick={() => {
                  setBookkeeperInternalRemarks(loanDetails?.summary?.bookkeeperInternalRemarks === 'No internal remarks submitted.' ? '' : (loanDetails?.summary?.bookkeeperInternalRemarks || ''));
                  setActiveModal('recommend');
                }}
                className="flex items-center px-5 py-2 rounded-lg bg-[#1D6021] text-white hover:bg-[#154718] font-bold text-sm transition-colors"
              >
                <Check className="w-4 h-4 mr-2" /> {String(loanDetails?.status || '').toLowerCase().includes('revision') ? 'Resubmit to Manager' : 'Recommend for Approval'}
              </button>
            ) : (
              <>
                <button
                  onClick={() => setActiveModal('reject')}
                  className="flex items-center px-4 py-2 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 font-bold text-sm transition-colors"
                >
                  <X className="w-4 h-4 mr-2" /> Reject
                </button>
                <button
                  onClick={() => setActiveModal('revise')}
                  className="flex items-center px-4 py-2 rounded-lg border border-yellow-200 text-yellow-700 bg-[#FEF9C3] hover:bg-yellow-200 font-bold text-sm transition-colors"
                >
                  <FileEdit className="w-4 h-4 mr-2" /> Revise
                </button>
                <button
                  onClick={() => setActiveModal('proceed')}
                  className="flex items-center px-5 py-2 rounded-lg bg-[#1D6021] text-white hover:bg-[#154718] font-bold text-sm transition-colors"
                >
                  <Check className="w-4 h-4 mr-2" /> Approve
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
                <h3 className="text-xl font-bold text-gray-900 mb-4">
                  {String(loanDetails?.status || '').toLowerCase().includes('revision')
                    ? 'Resubmit to Manager'
                    : 'Recommend for Manager Approval'}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  You are about to forward this loan of <span className="font-bold text-gray-900">{loanDetails.memberName}</span> to the Manager queue.
                </p>

                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Internal Remarks (Bookkeeper) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows="4"
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#1D6021] focus:border-[#1D6021] outline-none"
                    placeholder="Enter internal notes for the Manager..."
                    value={bookkeeperInternalRemarks}
                    onChange={(e) => setBookkeeperInternalRemarks(e.target.value)}
                  ></textarea>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Co-maker details are encoded under Bookkeeper Internal Review and will be forwarded to Manager with this recommendation.
                </p>
              </>
            )}

            {/* Shared Notification Options */}
            <div className="mb-8">
              <h4 className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-3">Notification Options</h4>
              <div className="flex flex-col gap-2">
                <CustomCheckbox
                  checked={sendEmail}
                  onChange={() => setSendEmail((prev) => !prev)}
                  label="Send email update"
                />
                <CustomCheckbox
                  checked={false}
                  onChange={() => {}}
                  label="Send SMS update (unavailable)"
                />
              </div>
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

  const parseCurrency = (value) => {
    if (value === null || value === undefined) return 0;
    const cleaned = String(value).replace(/[^0-9.-]+/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

export default LoanApprovalDetails;