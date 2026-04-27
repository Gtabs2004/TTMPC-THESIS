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
  const [deductionInputs, setDeductionInputs] = useState({
    serviceFee: '',
    insuranceFee: '',
    notarialFee: '',
    cbuDeduction: '',
  });

  const toMoneyNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const roundToCents = (value) => Math.round(toMoneyNumber(value) * 100) / 100;

  const computeDefaultDeductions = (principalAmount) => {
    const principal = Math.max(0, toMoneyNumber(principalAmount));
    return {
      serviceFee: roundToCents((principal / 50000) * 100),
      insuranceFee: roundToCents((principal / 1000) * 1.35),
      notarialFee: 100,
      cbuDeduction: roundToCents(principal * 0.02),
    };
  };

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

    const normalizeRatePercent = (rate, fallbackCode = '') => {
      const numericRate = Number(rate);
      if (!Number.isFinite(numericRate) || numericRate <= 0) return null;

      const effectiveCode = String(fallbackCode || code).trim().toUpperCase();
      if (effectiveCode === 'CONSOLIDATED' && numericRate > 0 && numericRate < 1) {
        return numericRate * 100;
      }

      return numericRate;
    };

    const pickRate = (row) => {
      const rawRate = Number(
        row?.interest_rate
        ?? row?.InterestRate
        ?? row?.interestrate
        ?? row?.interestRate
      );
      return normalizeRatePercent(rawRate, row?.code || code);
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
              net_proceeds,
              service_fee,
              insurance_fee,
              notarial_fee,
              cbu_deduction,
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
                is_bona_fide
              ),
              loan_type:loan_type_id (
                name,
                code
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
        const serviceFee = Number(data.service_fee ?? data.raw_payload?.optionalFields?.service_fee ?? 0);
        const insuranceFee = Number(data.insurance_fee ?? data.raw_payload?.optionalFields?.insurance_fee ?? 0);
        const notarialFee = Number(data.notarial_fee ?? data.raw_payload?.optionalFields?.notarial_fee ?? 0);
        const cbuDeduction = Number(data.cbu_deduction ?? data.raw_payload?.optionalFields?.cbu_deduction ?? 0);
        const computedTotalDeductions = [serviceFee, insuranceFee, notarialFee, cbuDeduction]
          .map((n) => (Number.isFinite(n) ? n : 0))
          .reduce((sum, n) => sum + n, 0);

        const storedNetProceeds = Number(data.net_proceeds ?? data.raw_payload?.optionalFields?.net_proceeds ?? NaN);
        const resolvedNetProceeds = Number.isFinite(storedNetProceeds)
          ? storedNetProceeds
          : Math.max(0, principalAmount - computedTotalDeductions);

        const monthlyAmortization = Number(
          data.monthly_amortization
          ?? data.raw_payload?.optionalFields?.monthly_amortization
          ?? 0
        );
        const termMonths = Number(data.term || 0);
        const resolvedLoanType = isKoicaSource
          ? (data.loan_type_code === 'NONMEMBER_BONUS' ? 'Nonmember Bonus Loan' : 'ABFF Loan')
          : (data.loan_type?.name || 'N/A');
        const normalizeInterestRatePercent = (rate, fallbackCode = '') => {
          const numericRate = Number(rate);
          if (!Number.isFinite(numericRate) || numericRate <= 0) return null;

          const effectiveCode = String(fallbackCode || '').trim().toUpperCase();
          if (effectiveCode === 'CONSOLIDATED' && numericRate > 0 && numericRate < 1) {
            return numericRate * 100;
          }

          return numericRate;
        };

        const effectiveLoanTypeCode = String(data.loan_type_code || data.loan_type?.code || '').trim().toUpperCase();
        let effectiveInterestRate = normalizeInterestRatePercent(data.interest_rate, effectiveLoanTypeCode);
        if (effectiveInterestRate === null || effectiveInterestRate === undefined) {
          effectiveInterestRate = await resolveInterestRateFromLoanTypes(resolvedLoanType, effectiveLoanTypeCode);
        }

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
          rawPayload: data.raw_payload || {},
          memberName,
          status: formatStatus(data.loan_status || data.application_status),
          summary: {
            loanType: resolvedLoanType,
            recommendedAmount: formatCurrency(data.loan_amount),
            term: `${data.term || 0} Months`,
            migsStatus: isKoicaSource ? 'N/A' : (data.member?.is_bona_fide ? 'MIGS' : 'NON-MIGS'),
            loanPurpose: data.loan_purpose || data.raw_payload?.optionalFields?.loan_purpose || 'N/A',
            employerPosition: data.source_of_income || data.raw_payload?.optionalFields?.source_of_income || 'N/A',
            bookkeeperInternalRemarks: data.bookkeeper_internal_remarks || 'No internal remarks submitted.',
            bookkeeperCoMakers: normalizedCoMakers,
            bookkeeperReviewedAt: data.bookkeeper_reviewed_at || null,
            managerReviewRequestedAt: data.manager_review_requested_at || null,
          },
          computation: {
            principalRaw: principalAmount,
            principal: formatCurrency(principalAmount),
            interestRate: Number.isFinite(Number(effectiveInterestRate)) ? `${Number(effectiveInterestRate).toFixed(2)}% Monthly` : 'N/A',
            totalInterest: formatCurrency(resolvedTotalInterest),
            totalPayable: formatCurrency(totalPayable),
            monthlyAmortization: formatCurrency(monthlyAmortization),
            serviceFeeRaw: serviceFee,
            serviceFee: formatCurrency(serviceFee),
            insuranceFeeRaw: insuranceFee,
            insuranceFee: formatCurrency(insuranceFee),
            notarialFeeRaw: notarialFee,
            notarialFee: formatCurrency(notarialFee),
            cbuDeductionRaw: cbuDeduction,
            cbuDeduction: formatCurrency(cbuDeduction),
            totalDeductionsRaw: computedTotalDeductions,
            totalDeductions: formatCurrency(computedTotalDeductions),
            netProceedsRaw: resolvedNetProceeds,
            netProceeds: formatCurrency(resolvedNetProceeds),
          },
          risk: {
            prevLoans: { value: 'N/A', label: 'NOT YET COMPUTED', color: 'text-gray-500' },
            delinquency: { value: 'N/A', label: 'NOT YET COMPUTED', color: 'text-gray-500' },
            consistency: { value: 'N/A', label: 'NOT YET COMPUTED', color: 'text-gray-500' },
          },
        };

        if (isMounted) {
          const hasStoredDeduction = [serviceFee, insuranceFee, notarialFee, cbuDeduction]
            .some((value) => toMoneyNumber(value) > 0);
          const defaultDeductions = computeDefaultDeductions(principalAmount);
          const initialDeductions = hasStoredDeduction
            ? { serviceFee, insuranceFee, notarialFee, cbuDeduction }
            : defaultDeductions;

          setLoanDetails(mapped);
          setDeductionInputs({
            serviceFee: String(roundToCents(initialDeductions.serviceFee)),
            insuranceFee: String(roundToCents(initialDeductions.insuranceFee)),
            notarialFee: String(roundToCents(initialDeductions.notarialFee)),
            cbuDeduction: String(roundToCents(initialDeductions.cbuDeduction)),
          });
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

      setLoanDetails((prev) => prev ? { ...prev, rawPayload: updatedRawPayload } : prev);
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

  const updateDeductionField = (field, value) => {
    const normalized = String(value || '').replace(/[^0-9.]/g, '');
    setDeductionInputs((prev) => ({ ...prev, [field]: normalized }));
  };

  const applyDefaultDeductionValues = () => {
    const principal = toMoneyNumber(loanDetails?.computation?.principalRaw);
    const defaults = computeDefaultDeductions(principal);
    setDeductionInputs({
      serviceFee: String(roundToCents(defaults.serviceFee)),
      insuranceFee: String(roundToCents(defaults.insuranceFee)),
      notarialFee: String(roundToCents(defaults.notarialFee)),
      cbuDeduction: String(roundToCents(defaults.cbuDeduction)),
    });
  };

  const updateCoMakerField = (index, field, value) => {
    setCoMakerDetails((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
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

    try {
      setSaving(true);
      setActionError('');

      const updatePayload = { loan_status: nextStatus, application_status: nextStatus };
      if (isBookkeeperFlow && modalType === 'recommend') {
        const serviceFeeValue = roundToCents(Math.max(0, toMoneyNumber(deductionInputs.serviceFee)));
        const insuranceFeeValue = roundToCents(Math.max(0, toMoneyNumber(deductionInputs.insuranceFee)));
        const notarialFeeValue = roundToCents(Math.max(0, toMoneyNumber(deductionInputs.notarialFee)));
        const cbuDeductionValue = roundToCents(Math.max(0, toMoneyNumber(deductionInputs.cbuDeduction)));
        const totalDeductionValue = roundToCents(serviceFeeValue + insuranceFeeValue + notarialFeeValue + cbuDeductionValue);
        const principalValue = roundToCents(Math.max(0, toMoneyNumber(loanDetails?.computation?.principalRaw)));
        const netProceedsValue = roundToCents(Math.max(0, principalValue - totalDeductionValue));

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
        if ((loanDetails.sourceTable || 'loans') === 'loans') {
          updatePayload.service_fee = serviceFeeValue;
          updatePayload.insurance_fee = insuranceFeeValue;
          updatePayload.notarial_fee = notarialFeeValue;
          updatePayload.cbu_deduction = cbuDeductionValue;
          updatePayload.net_proceeds = netProceedsValue;
        }
        updatePayload.raw_payload = {
          ...existingRawPayload,
          optionalFields: {
            ...existingOptionalFields,
            service_fee: serviceFeeValue,
            insurance_fee: insuranceFeeValue,
            notarial_fee: notarialFeeValue,
            cbu_deduction: cbuDeductionValue,
            net_proceeds: netProceedsValue,
            bookkeeper_loan_details: {
              ...(existingOptionalFields.bookkeeper_loan_details || {}),
              coMakers: normalizedCoMakers,
            },
          },
        };
      }

      const updateSelect = (loanDetails.sourceTable || 'loans') === 'loans'
        ? 'control_number, loan_status, bookkeeper_internal_remarks, bookkeeper_reviewed_at, manager_review_requested_at, raw_payload, net_proceeds, service_fee, insurance_fee, notarial_fee, cbu_deduction'
        : 'control_number, loan_status, bookkeeper_internal_remarks, bookkeeper_reviewed_at, manager_review_requested_at, raw_payload';

      const { data: updatedRows, error } = await supabase
        .from(loanDetails.sourceTable || 'loans')
        .update(updatePayload)
        .eq('control_number', loanDetails.id)
        .select(updateSelect)
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

  const principalForDeductions = roundToCents(Math.max(0, toMoneyNumber(loanDetails?.computation?.principalRaw)));
  const serviceFeeForDisplay = isBookkeeperFlow
    ? roundToCents(Math.max(0, toMoneyNumber(deductionInputs.serviceFee)))
    : roundToCents(Math.max(0, toMoneyNumber(loanDetails?.computation?.serviceFeeRaw)));
  const insuranceFeeForDisplay = isBookkeeperFlow
    ? roundToCents(Math.max(0, toMoneyNumber(deductionInputs.insuranceFee)))
    : roundToCents(Math.max(0, toMoneyNumber(loanDetails?.computation?.insuranceFeeRaw)));
  const notarialFeeForDisplay = isBookkeeperFlow
    ? roundToCents(Math.max(0, toMoneyNumber(deductionInputs.notarialFee)))
    : roundToCents(Math.max(0, toMoneyNumber(loanDetails?.computation?.notarialFeeRaw)));
  const cbuDeductionForDisplay = isBookkeeperFlow
    ? roundToCents(Math.max(0, toMoneyNumber(deductionInputs.cbuDeduction)))
    : roundToCents(Math.max(0, toMoneyNumber(loanDetails?.computation?.cbuDeductionRaw)));
  const totalDeductionForDisplay = roundToCents(
    serviceFeeForDisplay + insuranceFeeForDisplay + notarialFeeForDisplay + cbuDeductionForDisplay
  );
  const netProceedsForDisplay = roundToCents(Math.max(0, principalForDeductions - totalDeductionForDisplay));

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

            {/* Bookkeeper recommendation notes (manager view is read-only) */}
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
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Co-Makers (Loan Details)</p>
                  <div className="space-y-4">
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

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Service Fee</span>
                    {isBookkeeperFlow ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={deductionInputs.serviceFee}
                        onChange={(e) => updateDeductionField('serviceFee', e.target.value)}
                        className="w-36 rounded border border-gray-300 px-2 py-1 text-right text-xs font-bold text-gray-800 bg-white"
                      />
                    ) : (
                      <span className="font-bold text-gray-800">{loanDetails.computation.serviceFee}</span>
                    )}
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">CLIMBS Insurance</span>
                    {isBookkeeperFlow ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={deductionInputs.insuranceFee}
                        onChange={(e) => updateDeductionField('insuranceFee', e.target.value)}
                        className="w-36 rounded border border-gray-300 px-2 py-1 text-right text-xs font-bold text-gray-800 bg-white"
                      />
                    ) : (
                      <span className="font-bold text-gray-800">{loanDetails.computation.insuranceFee}</span>
                    )}
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Notarial Fee</span>
                    {isBookkeeperFlow ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={deductionInputs.notarialFee}
                        onChange={(e) => updateDeductionField('notarialFee', e.target.value)}
                        className="w-36 rounded border border-gray-300 px-2 py-1 text-right text-xs font-bold text-gray-800 bg-white"
                      />
                    ) : (
                      <span className="font-bold text-gray-800">{loanDetails.computation.notarialFee}</span>
                    )}
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">CBU Deduction</span>
                    {isBookkeeperFlow ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={deductionInputs.cbuDeduction}
                        onChange={(e) => updateDeductionField('cbuDeduction', e.target.value)}
                        className="w-36 rounded border border-gray-300 px-2 py-1 text-right text-xs font-bold text-gray-800 bg-white"
                      />
                    ) : (
                      <span className="font-bold text-gray-800">{loanDetails.computation.cbuDeduction}</span>
                    )}
                  </div>

                  {isBookkeeperFlow ? (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-[11px] text-gray-700">
                      <p className="font-bold text-[#1D6021] mb-2">Suggested Formula</p>
                      <p>Service Fee: 100.00 every 50,000 loan amount</p>
                      <p>CLIMBS Insurance: 1.35 per 1,000 loan amount</p>
                      <p>CBU Deduction: 2% of the applied amount</p>
                      <p>Notarial Fee: 100.00 fixed</p>
                      <button
                        type="button"
                        onClick={applyDefaultDeductionValues}
                        className="mt-2 inline-flex items-center rounded border border-[#1D6021] px-2 py-1 text-[10px] font-bold text-[#1D6021] hover:bg-green-100"
                      >
                        Apply Suggested Values
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-gray-300 pt-4 mb-4 flex justify-between items-center">
                  <span className="font-bold text-gray-900">Total Deductions</span>
                  <span className="font-bold text-gray-900">{formatCurrency(totalDeductionForDisplay)}</span>
                </div>

                <div className="border-t border-gray-300 pt-4 mb-4 flex justify-between items-center">
                  <span className="font-bold text-gray-900">Net Proceeds</span>
                  <span className="font-bold text-gray-900">{formatCurrency(netProceedsForDisplay)}</span>
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

        {/* Footer Actions */}
        <div className="bg-[#F8F9FA] border-t border-gray-200 p-6 flex justify-end gap-4">
          {isBookkeeperFlow ? (
            <button 
              onClick={() => {
                setBookkeeperInternalRemarks(loanDetails?.summary?.bookkeeperInternalRemarks === 'No internal remarks submitted.' ? '' : (loanDetails?.summary?.bookkeeperInternalRemarks || ''));
                setActiveModal('recommend');
              }}
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