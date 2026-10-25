import React, { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LoanSubmittedDialog from '../components/LoanSubmittedDialog';
import { createUniqueControlNumber, fetchLoanForRevisionEdit, fetchLoanPrefill, resubmitLoanRevision, submitUnifiedLoan } from './loanSubmission';
import { buildBonusPayload, computeLoan } from './loanComputeApi';
import { formatTinNumber, TIN_FORMATTED_MAX_LENGTH } from './tinFormat';
import { useLoanEligibility } from '../hooks/useLoanEligibility';
import { useNotification } from '../contex/NotificationContext';
import { formatWithCommas, stripCommas } from '../utils/numberFormat';
import MobileFormStepper from '../components/MobileFormStepper';
import LoanDeductionsCard from '../components/LoanDeductionsCard';

const peso = (value) =>
  `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Mirrors main.py's next_bonus_month_end / months_between_rounded_up
// (BONUS_LOAN_PLAN.md Step 2/6): the loan always targets the nearest
// upcoming bonus (Q13), term = whole months to it, partial month rounds up (Q5).
const monthEnd = (year, month) => new Date(year, month + 1, 0);

const nextBonusMonthEnd = (fromDate) => {
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  for (const yearOffset of [0, 1]) {
    for (const month of [4, 10]) { // May = index 4, November = index 10
      const candidate = monthEnd(from.getFullYear() + yearOffset, month);
      if (candidate >= from) return candidate;
    }
  }
  return monthEnd(from.getFullYear() + 1, 4);
};

const monthsBetweenRoundedUp = (start, end) => {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);
  const addMonths = (date, n) => {
    const d = new Date(date.getFullYear(), date.getMonth() + n, 1);
    d.setDate(Math.min(date.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return d;
  };
  if (end > addMonths(start, months)) months += 1;
  return Math.max(1, months);
};

const numberToWords = (num) => {
  if (num === '' || num === undefined || num === null) return '';
  
  num = parseInt(num, 10);
  if (isNaN(num)) return '';
  
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const scales = ['', 'thousand', 'million', 'billion', 'trillion'];

  const convertHundreds = (n) => {
    let result = '';
    if (n >= 100) {
      result += ones[Math.floor(n / 100)] + ' hundred ';
      n %= 100;
    }
    if (n >= 20) {
      result += tens[Math.floor(n / 10)];
      if (n % 10 > 0) result += ' ' + ones[n % 10];
    } else if (n >= 10) {
      result += teens[n - 10];
    } else if (n > 0) {
      result += ones[n];
    }
    return result.trim();
  };

  if (num === 0) return 'zero';

  let words = '';
  let scaleIndex = 0;

  while (num > 0) {
    if (num % 1000 !== 0) {
      words = convertHundreds(num % 1000) + ' ' + scales[scaleIndex] + ' ' + words;
    }
    num = Math.floor(num / 1000);
    scaleIndex++;
  }

  return words.trim().replace(/\s+/g, ' ');
};

// staffIntake: a Cashier keys in a walk-in non-member's application at the
// front desk. The applicant's details are typed in, never taken from the
// signed-in (Cashier) session, and the row goes to non_member_loans.
function Bonus_Loan({ staffIntake = false }) {
  const navigate = useNavigate();
  const [submittedOpen, setSubmittedOpen] = useState(false);
  const { addNotification } = useNotification();
  const isNonMemberBonus = staffIntake;
  const [searchParams] = useSearchParams();
  const editControlNumber = !isNonMemberBonus ? (searchParams.get('editControlNumber') || '') : '';
  const isRevisionEdit = Boolean(editControlNumber);
  const [revisionRemarks, setRevisionRemarks] = useState('');

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
  const PDF_PREVIEW_WINDOW_NAME = isNonMemberBonus ? 'nonmember-bonus-loan-preview' : 'bonus-loan-preview';

  const resolvedLoanTypeCode = isNonMemberBonus ? 'NONMEMBER_BONUS' : 'BONUS';

  const inputStyles = 'border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary outline-none w-full bg-white text-sm';
  const lockedInputStyles = 'border border-gray-200 rounded-md px-3 py-2 outline-none w-full bg-gray-100 text-gray-600 text-sm cursor-not-allowed select-text';
  const labelStyles = 'block text-xs font-bold text-gray-700 mb-1';
  const sectionHeader = 'bg-primary-deep text-white px-4 py-2 rounded-t-lg flex items-center gap-2 font-bold uppercase tracking-wide';

  const [lockedFields, setLockedFields] = useState(() => new Set());
  const isLockedField = (name) => lockedFields.has(name);
  const lockedInputProps = (name) => {
    if (!isLockedField(name)) return null;
    return {
      readOnly: true,
      tabIndex: -1,
      'aria-readonly': true,
      title: 'Auto-filled from your member profile and cannot be edited here.',
    };
  };
  const inputClassFor = (name) => (isLockedField(name) ? lockedInputStyles : inputStyles);

  const [loading, setLoading] = useState(false);
  const [borrowerMemberId, setBorrowerMemberId] = useState(null);
  const [mobileStep, setMobileStep] = useState(0);
  const formRef = useRef(null);
  const mobileSteps = [
    { id: 'borrower', label: "Borrower's Information" },
    { id: 'agreement', label: 'Loan Agreement' },
    { id: 'authorization', label: 'Authorization & Deed' },
    { id: 'review', label: 'Review & Submit' },
  ];
  const { data: eligibility, status: eligibilityStatus } = useLoanEligibility(borrowerMemberId, { loanType: 'bonus' });
  const canApplyNew = eligibility ? Boolean(eligibility.can_apply_new) : true;
  const eligibilityReady = eligibilityStatus === 'ready';
  // The PDF's New/Renewal tick comes from the form, which starts on "New" and
  // only flips to Renewal once eligibility has loaded. Hold Print/Download until
  // then so the default can't be stamped by mistake. "error" also releases it so
  // a failed lookup never leaves the buttons stuck.
  const pdfNotReady = !isNonMemberBonus && !(eligibilityStatus === 'ready' || eligibilityStatus === 'error');
  const [printing, setPrinting] = useState(false);
  const [formData, setFormData] = useState({
    application_type: 'New',
    control_no: editControlNumber || createUniqueControlNumber(isNonMemberBonus ? 'NMBL' : 'BL'),
    date_applied: new Date().toISOString().split('T')[0],
    surname: '',
    first_name: '',
    middle_name: '',
    contact_no: '',
    residence_address: '',
    date_of_birth: '',
    age: '',
    civil_status: '',
    gender: '',
    tin_no: '',
    gsis_sss_no: '',
    latest_net_pay: '',
    share_capital: '',
    employer_name: '',
    office_address: '',
    spouse_name: '',
    spouse_occupation: '',
    loan_amount_numeric: '',
    loan_amount_words: '',
    loan_purpose: '',
    loan_purpose_other: '',
    loan_term_months: '',
    monthly_amortization: '',
    total_interest: '',
    source_of_income: '',
    user_email: '',
    payment_start_date: '',
    borrower_id_type: '',
    borrower_id_number: '',
    bonus_amount_words: '',
    bonus_amount_numeric: '',
  });

  // Term is no longer picked by the applicant — it's derived from today's
  // date vs. the nearest upcoming bonus (Q13: always nearest upcoming;
  // Q5: partial first month counts as a full month). Computed once per
  // mount since "today" doesn't change mid-session.
  const targetBonus = React.useMemo(() => {
    const today = new Date();
    const dueDate = nextBonusMonthEnd(today);
    const term = monthsBetweenRoundedUp(today, dueDate);
    const cycle = dueDate.getMonth() === 4 ? 'Mid-Year (May)' : 'Year-End (November)';
    return { dueDate, term, cycle };
  }, []);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      loan_term_months: String(targetBonus.term),
      payment_start_date: targetBonus.dueDate.toISOString().split('T')[0],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return '';
    const [year, month, day] = dateOfBirth.split('-').map(Number);
    if (!year || !month || !day) return '';

    const today = new Date();
    let age = today.getFullYear() - year;
    if (
      today.getMonth() + 1 < month ||
      (today.getMonth() + 1 === month && today.getDate() < day)
    ) {
      age -= 1;
    }
    return age >= 0 ? String(age) : '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const normalizedValue = name === 'tin_no' ? formatTinNumber(value) : value;
    if (name === 'date_of_birth' && isNonMemberBonus) {
      setFormData((prev) => ({
        ...prev,
        date_of_birth: value,
        age: calculateAge(value),
      }));
      return;
    }
    setFormData((prev) => {
      if (name === 'civil_status' && String(value || '').trim().toLowerCase() !== 'married') {
        return {
          ...prev,
          civil_status: value,
          spouse_name: '',
          spouse_occupation: '',
        };
      }

      if (name === 'bonus_amount_numeric' || name === 'loan_amount_numeric') {
        return {
          ...prev,
          bonus_amount_numeric: value,
          loan_amount_numeric: value,
        };
      }

      return { ...prev, [name]: normalizedValue };
    });
  };

  const isMarriedCivilStatus = String(formData.civil_status || '').trim().toLowerCase() === 'married';

  const handlePrintPdf = async ({ download = false } = {}) => {
    setPrinting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/loans/bonus/print-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/pdf',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.detail || errorBody?.message || 'Unable to generate the bonus loan PDF.');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      if (download) {
        // Mobile "Download PDF": save the file instead of opening a preview tab.
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'BONUS_LOAN_FILLED.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const previewWindow = window.open(objectUrl, PDF_PREVIEW_WINDOW_NAME);

        if (previewWindow) {
          previewWindow.focus();
        }
      }

      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    } catch (error) {
      addNotification(`Print error: ${error.message}`, 'error');
    } finally {
      setPrinting(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadPrefill = async () => {
      if (isNonMemberBonus) return;

      try {
        const { userEmail, profile } = await fetchLoanPrefill();
        if (!isMounted) return;

        if (!profile) {
          return;
        }

        const newlyLocked = new Set();
        const recordLocked = (name, sourceValue) => {
          const stringified = sourceValue === null || sourceValue === undefined
            ? ''
            : String(sourceValue).trim();
          if (stringified !== '') newlyLocked.add(name);
        };

        recordLocked('surname', profile.surname ?? profile.last_name);
        recordLocked('first_name', profile.first_name);
        recordLocked('middle_name', profile.middle_name ?? profile.middle_initial);
        recordLocked('contact_no', profile.contact_number ?? profile.contact_no);
        recordLocked('residence_address', profile.permanent_address ?? profile.residence_address);
        recordLocked('date_of_birth', profile.date_of_birth);
        recordLocked('age', profile.age);
        recordLocked('civil_status', profile.civil_status);
        recordLocked('gender', profile.gender);
        recordLocked('tin_no', profile.tin_number ?? profile.tin_no);
        recordLocked('gsis_sss_no', profile.gsis_sss_no);
        recordLocked('employer_name', profile.employer_name ?? profile.occupation);
        recordLocked('office_address', profile.office_address);
        recordLocked('spouse_name', profile.spouse_name);
        recordLocked('spouse_occupation', profile.spouse_occupation);
        recordLocked('latest_net_pay', profile.latest_net_pay);
        recordLocked('share_capital', profile.share_capital);

        setLockedFields(newlyLocked);

        setFormData((prev) => {
          const tinValue = profile.tin_number ?? profile.tin_no ?? prev.tin_no;
          const tinFormatted = formatTinNumber(tinValue);

          return {
          ...prev,
          surname: profile.surname ?? profile.last_name ?? prev.surname,
          first_name: profile.first_name ?? prev.first_name,
          middle_name: profile.middle_name ?? profile.middle_initial ?? prev.middle_name,
          // contact_number is bigint in personal_data_sheet, so it arrives as a
          // JS number; the PDF endpoint's Pydantic model types it str | None and
          // 422s on an int. Coerce like age/share_capital below.
          contact_no: (profile.contact_number ?? profile.contact_no)?.toString() ?? prev.contact_no,
          residence_address: profile.permanent_address ?? profile.residence_address ?? prev.residence_address,
          date_of_birth: profile.date_of_birth ?? prev.date_of_birth,
          age: profile.age?.toString() ?? prev.age,
          civil_status: profile.civil_status ?? prev.civil_status,
          gender: profile.gender ?? prev.gender,
          tin_no: tinFormatted,
          borrower_id_type: tinValue ? 'TIN' : prev.borrower_id_type,
          borrower_id_number: tinFormatted || prev.borrower_id_number,
          gsis_sss_no: profile.gsis_sss_no ?? prev.gsis_sss_no,
          employer_name: profile.employer_name ?? profile.occupation ?? prev.employer_name,
          office_address: profile.office_address ?? prev.office_address,
          spouse_name: profile.spouse_name ?? prev.spouse_name,
          spouse_occupation: profile.spouse_occupation ?? prev.spouse_occupation,
          latest_net_pay: (profile.latest_net_pay)?.toString() ?? prev.latest_net_pay,
          share_capital: profile.share_capital?.toString() ?? prev.share_capital,
          };
        });

        if (profile.member_id) {
          setBorrowerMemberId(profile.member_id);
        }

        if (userEmail) {
          setFormData((prev) => ({ ...prev, user_email: userEmail }));
        }
      } catch (_err) {
        // Prefill is optional; form remains manually fillable on failure.
      }
    };

    loadPrefill();
    return () => {
      isMounted = false;
    };
  }, [isNonMemberBonus]);

  // Editing a loan the Manager sent back for revision: pull the loan's own
  // fields (amount/term/purpose/etc.) to prefill on top of the profile
  // prefill above, which only covers member-profile fields.
  useEffect(() => {
    if (!isRevisionEdit) return;
    let isMounted = true;
    (async () => {
      try {
        const loanRow = await fetchLoanForRevisionEdit(editControlNumber);
        if (!isMounted || !loanRow) return;
        setFormData((prev) => ({
          ...prev,
          control_no: loanRow.control_number || prev.control_no,
          application_type: loanRow.application_type || prev.application_type,
          loan_amount_numeric: loanRow.loan_amount != null ? String(loanRow.loan_amount) : prev.loan_amount_numeric,
          bonus_amount_numeric: loanRow.bonus_amount_numeric != null ? String(loanRow.bonus_amount_numeric) : prev.bonus_amount_numeric,
          loan_term_months: loanRow.term != null ? String(loanRow.term) : prev.loan_term_months,
          loan_purpose: loanRow.loan_purpose || prev.loan_purpose,
          monthly_amortization: loanRow.monthly_amortization != null ? String(loanRow.monthly_amortization) : prev.monthly_amortization,
          source_of_income: loanRow.source_of_income || prev.source_of_income,
          payment_start_date: loanRow.payment_start_date || prev.payment_start_date,
        }));
        setRevisionRemarks(
          loanRow.raw_payload?.optionalFields?.loan_revision_details?.remarks
            || loanRow.raw_payload?.optionalFields?.manager_review_details?.remarks
            || ''
        );
      } catch (err) {
        addNotification(err.message || 'Unable to load your loan application for editing.', 'error');
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [isRevisionEdit, editControlNumber]);

  // Keep amount words synced to whichever numeric amount source user edits.
  useEffect(() => {
    const numericAmount = formData.loan_amount_numeric || formData.bonus_amount_numeric;
    if (numericAmount) {
      const words = numberToWords(numericAmount);
      setFormData((prev) => ({
        ...prev,
        loan_amount_numeric: numericAmount,
        bonus_amount_numeric: numericAmount,
        loan_amount_words: words.charAt(0).toUpperCase() + words.slice(1),
        bonus_amount_words: words.charAt(0).toUpperCase() + words.slice(1),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        loan_amount_words: '',
        bonus_amount_words: '',
      }));
    }
  }, [formData.loan_amount_numeric, formData.bonus_amount_numeric]);

  const [feeBreakdown, setFeeBreakdown] = useState(null);
  const [computation, setComputation] = useState(null);

  useEffect(() => {
    const principal = Number(formData.loan_amount_numeric || 0);
    const term = Number(formData.loan_term_months || 0);

    if (!principal || !term) {
      setFormData((prev) => ({ ...prev, monthly_amortization: '' }));
      setFeeBreakdown(null);
      setComputation(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const data = await computeLoan(buildBonusPayload(formData, !isNonMemberBonus));
        setFeeBreakdown(data?.deductions ? { ...data.deductions, net_proceeds: data.net_proceeds } : null);
        const firstRow = data?.monthly_breakdown?.[0];
        setComputation(firstRow ? {
          principal,
          term,
          totalPayable: Number(data.monthly_amortization || 0),
          totalInterest: Number(data.total_interest || 0),
          ratePercent: term > 0 ? ((Number(firstRow.interest_component || 0) / term) / principal) * 100 : 0,
        } : null);
        setFormData((prev) => ({
          ...prev,
          monthly_amortization: data?.monthly_amortization ? String(data.monthly_amortization) : prev.monthly_amortization,
          total_interest: data?.total_interest ? String(data.total_interest) : prev.total_interest,
        }));
      } catch (_err) {
        // Keep form usable even if compute API is temporarily unavailable.
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [formData.loan_amount_numeric, formData.loan_term_months, formData.payment_start_date]);

  // Decision 3.3-1 (confirmed 2026-10-23): Bonus applications are open all
  // year -- the May/November restriction now applies only at the
  // Bookkeeper->Manager recommend step (enforced by the DB trigger,
  // bonus_loan_window_trigger.sql), not at application time.
  // Q1/Q11: block a new Bonus application while a prior one is still unpaid.
  const canSubmitBonus = isNonMemberBonus || canApplyNew;

  const validateMobileStep = (step) => {
    const fields = formRef.current?.querySelectorAll(`[data-mobile-step="${step}"] input, [data-mobile-step="${step}"] select, [data-mobile-step="${step}"] textarea`) || [];
    const invalidField = Array.from(fields).find((field) => !field.checkValidity());
    if (!invalidField) return true;
    invalidField.reportValidity();
    return false;
  };

  const validateAllMobileSteps = () => {
    for (let step = 0; step < mobileSteps.length - 1; step += 1) {
      if (!validateMobileStep(step)) {
        setMobileStep(step);
        return false;
      }
    }
    return true;
  };

  const goToNextMobileStep = () => {
    if (validateMobileStep(mobileStep)) setMobileStep((step) => Math.min(step + 1, mobileSteps.length - 1));
  };

  // Tapping a step circle jumps directly to that step — going back is always
  // fine, but jumping ahead has to pass through the same required-field
  // check as Next, one step at a time, so you can't skip a section with
  // missing answers. Lands on the first step that actually needs attention.
  const handleMobileStepChange = (targetStep) => {
    if (targetStep <= mobileStep) {
      setMobileStep(targetStep);
      return;
    }
    for (let step = mobileStep; step < targetStep; step += 1) {
      if (!validateMobileStep(step)) {
        setMobileStep(step);
        return;
      }
    }
    setMobileStep(targetStep);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (window.matchMedia('(max-width: 767px)').matches && mobileStep < mobileSteps.length - 1) {
      goToNextMobileStep();
      return;
    }
    if (window.matchMedia('(max-width: 767px)').matches && !validateAllMobileSteps()) return;

    // Q1/Q11: a prior Bonus loan must be fully paid before another is
    // submitted — there's no mid-cycle renewal, only payoff then a new
    // application. Checked here (not just the disabled submit button) so a
    // stale page can't slip a blocked submission through.
    if (!isNonMemberBonus && !canApplyNew) {
      addNotification(
        eligibility?.reason || 'You have an active Bonus loan that must be fully paid before applying again.',
        'error'
      );
      return;
    }

    setLoading(true);

    try {
      if (isRevisionEdit) {
        await resubmitLoanRevision(editControlNumber, {
          loan_amount: formData.loan_amount_numeric,
          principal_amount: formData.loan_amount_numeric,
          term: formData.loan_term_months,
          total_interest: formData.total_interest || null,
          loan_amount_words: formData.loan_amount_words || null,
          loan_purpose: formData.loan_purpose || null,
          monthly_amortization: formData.monthly_amortization || null,
          source_of_income: formData.source_of_income || null,
          payment_start_date: formData.payment_start_date || null,
          bonus_amount_words: formData.bonus_amount_words || null,
          bonus_amount_numeric: formData.bonus_amount_numeric || null,
        });
        setSubmittedOpen(true);
        setLoading(false);
        return;
      }

      await submitUnifiedLoan({
        loanTypeCode: resolvedLoanTypeCode,
        // Step 8: non-member Bonus now inserts into `loans` too (member_id
        // = NULL), not the old non_member_loans table — so it inherits
        // disbursement/payment/penalty from Steps 1-7.
        targetTable: 'loans',
        isNonMemberApplicant: isNonMemberBonus,
        controlNumber: formData.control_no,
        applicationStatus: 'pending',
        applicationType: formData.application_type,
        loanStatus: 'pending',
        applicationDate: formData.date_applied,
        loanAmount: formData.loan_amount_numeric,
        principalAmount: formData.loan_amount_numeric,
        term: formData.loan_term_months,
        requireMemberProfile: !isNonMemberBonus,
        applicantProfile: isNonMemberBonus
          ? {
              full_name: `${formData.first_name || ''} ${formData.middle_name || ''} ${formData.surname || ''}`.trim(),
              credentials: {
                surname: formData.surname || null,
                first_name: formData.first_name || null,
                middle_name: formData.middle_name || null,
                contact_no: formData.contact_no || null,
                residence_address: formData.residence_address || null,
                date_of_birth: formData.date_of_birth || null,
                age: formData.age || null,
                civil_status: formData.civil_status || null,
                gender: formData.gender || null,
                tin_no: formData.tin_no || null,
                gsis_sss_no: formData.gsis_sss_no || null,
                employer_name: formData.employer_name || null,
                office_address: formData.office_address || null,
                share_capital: 'N/A',
              },
            }
          : {},
        optionalFields: {
          total_interest: formData.total_interest || null,
          loan_amount_words: formData.loan_amount_words || null,
          loan_purpose: formData.loan_purpose || null,
          monthly_amortization: formData.monthly_amortization || null,
          source_of_income: formData.source_of_income || null,
          user_email: formData.user_email || null,
          payment_start_date: formData.payment_start_date || null,
          bonus_amount_words: formData.bonus_amount_words || null,
          bonus_amount_numeric: formData.bonus_amount_numeric || null,
        },
      });

      setSubmittedOpen(true);
    } catch (err) {
      addNotification('Submission error: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 pb-44">
      <header className="w-full bg-[#E9F7DE] min-h-20 shadow-lg flex px-4 py-3 sm:px-6">
        <div className="flex w-full flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex min-w-0 flex-row items-center gap-3 sm:gap-4">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="min-w-0 flex flex-col">
            <h1 className="break-words text-xs font-bold text-primary-deep sm:text-sm">Tubungan Teacher's Multi-Purpose Cooperative</h1>
            <p className="text-[#A0D284] text-xs">{staffIntake ? 'Cashier — Non-Member Bonus Loan Intake' : 'Loan Application'}</p>
          </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(staffIntake ? '/Cashier_Dashboard' : '/member-apply-loans')}
            className="w-full rounded-lg bg-white px-4 py-2 text-xs font-bold text-member-green shadow-sm border border-[#D5EDB9] hover:bg-[#F4FBF0] sm:w-auto"
          >
            {staffIntake ? 'Back to Cashier Portal' : 'Back to Member Portal'}
          </button>
        </div>
      </header>

      <LoanSubmittedDialog
        open={submittedOpen}
        message={staffIntake
          ? 'The non-member Bonus loan application was submitted.'
          : isRevisionEdit
            ? 'Your revised Bonus loan application was resubmitted. The Bookkeeper will review it again.'
            : 'Your Bonus loan application was submitted. You can follow its progress under My Loans.'}
        onContinue={() => navigate(staffIntake ? '/Cashier_Dashboard' : '/member-dashboard')}
      />

      {isRevisionEdit && (
        <div role="alert" className="mx-3 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-4">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Manager's requested changes</p>
          <p className="mt-1 whitespace-pre-wrap font-semibold">
            {revisionRemarks || 'Please review your application and resubmit after making the needed changes.'}
          </p>
        </div>
      )}

      <form ref={formRef} noValidate={window.matchMedia('(max-width: 767px)').matches} onSubmit={handleSubmit} className="px-3 sm:px-4">
        <section className="grid gap-6 px-3 sm:gap-8 sm:px-4">
          <h1 className="mt-8 text-center text-xl font-bold text-primary sm:mt-12">{staffIntake ? 'NON-MEMBER BONUS LOAN APPLICATION' : 'BONUS LOAN APPLICATION'}</h1>
          {/* Mobile-only: download the form as a PDF (includes what is entered so far). */}
          <button
            type="button"
            onClick={() => handlePrintPdf({ download: true })}
            disabled={printing || loading || pdfNotReady}
            className="md:hidden -mt-2 mx-auto flex w-full max-w-6xl items-center justify-center gap-2 rounded border border-primary bg-white px-4 py-2.5 text-sm font-bold text-primary-deep transition-colors hover:bg-[#E9F7DE] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} aria-hidden="true" />
            {printing ? 'Preparing PDF...' : 'Download PDF'}
          </button>
          <div className="max-w-6xl mx-auto w-full">
            <div className="bg-[#EEF6F1] rounded-xl p-3 border-2 border-primary flex flex-col items-start justify-between gap-4 sm:p-4 md:flex-row md:items-center md:gap-6">
              <div className="flex flex-wrap items-center gap-4 sm:gap-8">
                {/* Bonus has no New/Renewal choice (Q1/Q11): a prior Bonus
                    loan must be fully paid off before another is submitted —
                    there is no mid-cycle renewal row, only a full payoff then
                    a brand-new application. */}
                {!isNonMemberBonus && !canApplyNew && (
                  <p className="text-sm font-semibold text-red-700 max-w-md">
                    {eligibility?.reason || 'You have an active Bonus loan that must be fully paid before applying again.'}
                  </p>
                )}
                {eligibility?.simulation_active && (
                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-300">SIMULATION MODE</span>
                )}
              </div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500">Control No.</label>
                  <input type="text" name="control_no" value={formData.control_no} readOnly className="border border-gray-300 rounded px-2.5 py-1 text-xs w-full sm:w-40 bg-gray-100 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500">Date Applied</label>
                  <input type="date" name="date_applied" value={formData.date_applied} onChange={handleChange} className="border border-gray-300 rounded px-2.5 py-1 text-xs w-full sm:w-40" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <div data-mobile-step="0" className={`${mobileStep === 0 ? 'block' : 'hidden'} mobile-step-transition md:block mt-10 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full`}>
          <div className={sectionHeader}><span className="bg-white text-primary-deep rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span> BORROWER'S INFORMATION</div>
          <div className="p-4 sm:p-6 lg:p-8 grid grid-cols-1 md:grid-cols-3 gap-y-8 gap-x-6 md:gap-6">
            <div><label className={labelStyles}>Surname *</label><input name="surname" value={formData.surname} onChange={handleChange} className={inputClassFor('surname')} required {...lockedInputProps('surname')} /></div>
            <div><label className={labelStyles}>First Name *</label><input name="first_name" value={formData.first_name} onChange={handleChange} className={inputClassFor('first_name')} required {...lockedInputProps('first_name')} /></div>
            <div><label className={labelStyles}>Middle Name</label><input name="middle_name" value={formData.middle_name} onChange={handleChange} className={inputClassFor('middle_name')} {...lockedInputProps('middle_name')} /></div>
            <div><label className={labelStyles}>Contact No. *</label><input name="contact_no" value={formData.contact_no} onChange={handleChange} className={inputClassFor('contact_no')} required {...lockedInputProps('contact_no')} /></div>
            {isNonMemberBonus ? (
              <div><label className={labelStyles}>Email Address</label><input type="email" name="user_email" value={formData.user_email} onChange={handleChange} className={inputStyles} /></div>
            ) : null}
            <div><label className={labelStyles}>Latest Net Pay *</label><input type="text" inputMode="decimal" name="latest_net_pay" value={formatWithCommas(formData.latest_net_pay)} onChange={(e) => handleChange({ target: { name: e.target.name, value: stripCommas(e.target.value) } })} className={inputClassFor('latest_net_pay')} required {...lockedInputProps('latest_net_pay')} /></div>
            {isNonMemberBonus ? (
              <div>
                <label className={labelStyles}>Share Capital</label>
                <input type="text" value="N/A" readOnly className={`${inputStyles} bg-gray-100 text-gray-500`} />
              </div>
            ) : (
              <div><label className={labelStyles}>Share Capital *</label><input type="text" inputMode="decimal" name="share_capital" value={formatWithCommas(formData.share_capital)} onChange={(e) => handleChange({ target: { name: e.target.name, value: stripCommas(e.target.value) } })} className={inputClassFor('share_capital')} required {...lockedInputProps('share_capital')} /></div>
            )}
            <div className="md:col-span-3"><label className={labelStyles}>Residence Address *</label><input name="residence_address" value={formData.residence_address} onChange={handleChange} className={inputClassFor('residence_address')} required {...lockedInputProps('residence_address')} /></div>
            <div><label className={labelStyles}>Date of Birth *</label><input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} className={inputClassFor('date_of_birth')} required {...lockedInputProps('date_of_birth')} /></div>
            <div><label className={labelStyles}>Age *</label><input type="number" name="age" value={formData.age} onChange={handleChange} className={inputClassFor('age')} required={isNonMemberBonus} readOnly={isNonMemberBonus} {...(!isNonMemberBonus ? lockedInputProps('age') : {})} /></div>
            <div><label className={labelStyles}>Civil Status *</label><input name="civil_status" value={formData.civil_status} onChange={handleChange} className={inputClassFor('civil_status')} required {...lockedInputProps('civil_status')} /></div>
            <div><label className={labelStyles}>Gender *</label><input name="gender" value={formData.gender} onChange={handleChange} className={inputClassFor('gender')} required {...lockedInputProps('gender')} /></div>
            <div><label className={labelStyles}>TIN No. *</label><input name="tin_no" value={formData.tin_no} onChange={handleChange} inputMode="numeric" maxLength={TIN_FORMATTED_MAX_LENGTH} placeholder="123-456-789-000" className={inputClassFor('tin_no')} required {...lockedInputProps('tin_no')} /></div>
            <div><label className={labelStyles}>GSIS/SSS No. *</label><input name="gsis_sss_no" value={formData.gsis_sss_no} onChange={handleChange} className={inputClassFor('gsis_sss_no')} required {...lockedInputProps('gsis_sss_no')} /></div>
            <div><label className={labelStyles}>Employer Name *</label><input name="employer_name" value={formData.employer_name} onChange={handleChange} className={inputClassFor('employer_name')} required {...lockedInputProps('employer_name')} /></div>
            <div><label className={labelStyles}>Office Address *</label><input name="office_address" value={formData.office_address} onChange={handleChange} className={inputClassFor('office_address')} required {...lockedInputProps('office_address')} /></div>
            {isMarriedCivilStatus ? (
              <>
                <div><label className={labelStyles}>Spouse Name *</label><input name="spouse_name" value={formData.spouse_name} onChange={handleChange} className={inputClassFor('spouse_name')} required {...lockedInputProps('spouse_name')} /></div>
                <div><label className={labelStyles}>Spouse Occupation *</label><input name="spouse_occupation" value={formData.spouse_occupation} onChange={handleChange} className={inputClassFor('spouse_occupation')} required {...lockedInputProps('spouse_occupation')} /></div>
              </>
            ) : null}
          </div>
        </div>

        {/* Section 2: LOAN AGREEMENT */}
        <div data-mobile-step="1" className={`${mobileStep === 1 ? 'block' : 'hidden'} mobile-step-transition md:block mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full`}>
          <div className={sectionHeader}>
            <span className="bg-white text-primary-deep rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
            LOAN AGREEMENT
          </div>
          <div className="p-4 sm:p-6 lg:p-8 text-sm text-gray-800">
            
            <div className="leading-relaxed sm:leading-[3.5rem]">
              I hereby apply for a loan in the amount of
              <input 
                type="text" 
                name="loan_amount_words" 
                value={formData.loan_amount_words} 
                onChange={handleChange} 
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-primary outline-none bg-white text-sm transition-all mx-0 my-2 w-full sm:mx-2 sm:my-0 sm:w-[22rem] inline-block align-middle" 
              />
              <div className="inline-flex items-center relative mr-2 align-middle">
                <span className="absolute left-3 text-gray-400 text-xs font-medium">Php</span>
                <input
                  type="text"
                  inputMode="decimal"
                  name="loan_amount_numeric"
                  value={formatWithCommas(formData.loan_amount_numeric)}
                  onChange={(e) => handleChange({ target: { name: e.target.name, value: stripCommas(e.target.value) } })}
                  className="border border-gray-300 rounded-md pl-10 pr-3 py-1.5 focus:ring-2 focus:ring-primary outline-none bg-white text-sm transition-all w-full sm:w-40"
                />
              </div>
              for the purpose of
              <select 
                name="loan_purpose" 
                value={formData.loan_purpose} 
                onChange={handleChange} 
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-primary outline-none bg-white text-sm transition-all mx-0 my-2 w-full sm:mx-2 sm:my-0 sm:w-64 inline-block align-middle" 
              >
                <option value="">Select Purpose</option>
                <option value="Emergency Needs">Emergency Needs</option>
                <option value="Medical Expenses">Medical Expenses</option>
                <option value="Family & Household Needs">Family & Household Needs</option>
                <option value="Education">Education</option>
                <option value="Livelihood/Business">Livelihood/Business</option>
                <option value="Financial Obligations">Financial Obligations</option>
                <option value="Personal Needs">Personal Needs</option>
                <option value="Others">Others</option>
              </select>
              {formData.loan_purpose === 'Others' && (
                <input 
                  type="text" 
                  name="loan_purpose_other" 
                  value={formData.loan_purpose_other} 
                  onChange={handleChange} 
                  placeholder="Please specify..."
                  className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-primary outline-none bg-white text-sm transition-all mx-0 my-2 w-full sm:mx-2 sm:my-0 sm:w-56 inline-block align-middle" 
                />
              )}
              
              <br className="hidden md:block" />
              
              with interest for the full term deducted upfront upon release, maturing on the
              <input
                type="text"
                name="target_bonus_display"
                value={`${targetBonus.cycle} Bonus — ${targetBonus.dueDate.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })} (${targetBonus.term} month${targetBonus.term === 1 ? '' : 's'} from today)`}
                readOnly
                className="border border-gray-300 rounded-md px-3 py-1.5 outline-none bg-gray-50 text-sm transition-all mx-0 my-2 w-full sm:mx-2 sm:my-0 sm:w-96 inline-block align-middle cursor-not-allowed text-gray-600"
              />
              , where I will owe the principal amount of
              <input
                type="text"
                name="monthly_amortization"
                value={formatWithCommas(formData.monthly_amortization)}
                readOnly
                className="border border-gray-300 rounded-md px-3 py-1.5 outline-none bg-gray-50 text-sm transition-all mx-0 my-2 w-full sm:mx-2 sm:my-0 sm:w-48 inline-block align-middle cursor-not-allowed"
              />
              in full, which I promise to pay the amount to <strong>Tubungan Teachers' Multi Purpose Cooperative</strong>

              <br />

              <span className="block mt-2 leading-normal">
                <strong>(TTMPC)</strong> in accordance with the terms and conditions as stipulated in the Promissory Note of which I certify to have read and understood clearly. Interest for the full term has already been deducted from my proceeds at release; I bind myself to pay the principal above in full out of my bonus or surrender my ATM to TTMPC.
              </span>
            </div>

            {(computation || feeBreakdown) && (
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                {computation && (
                  <div className="rounded-xl border border-green-200 bg-[#F4FBF0] p-4">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-primary-deep">
                      Loan Computation
                    </p>
                    <div className="space-y-1.5 text-sm">
                      {[
                        ['Loan Amount', peso(computation.principal)],
                        ['Months to Bonus', `${computation.term} month${computation.term === 1 ? '' : 's'}`],
                        ['Interest Rate', `${computation.ratePercent.toFixed(2).replace(/\.?0+$/, '')}% per month`],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between">
                          <span className="text-gray-600">{label}</span>
                          <span className="font-semibold text-gray-800">{value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1.5 flex justify-between text-sm">
                      <span className="text-gray-600">Upfront Interest (deducted at release)</span>
                      <span className="font-semibold text-gray-800">{peso(computation.totalInterest)}</span>
                    </div>
                    <div className="mt-2 flex justify-between border-t border-green-200 pt-2">
                      <span className="font-bold text-gray-900">Principal Due at the Bonus ({targetBonus.cycle})</span>
                      <span className="font-black text-member-green">{peso(computation.principal)}</span>
                    </div>
                  </div>
                )}
                {feeBreakdown && (
                  <LoanDeductionsCard
                    loan={feeBreakdown}
                    isRenewal={String(formData.application_type || '').toLowerCase() === 'renewal'}
                  />
                )}
              </div>
            )}

          </div>
        </div>
       {/* Section 3: APPLICANTS AUTHORIZATION FOR SALARY DEDUCTION */}
        <div data-mobile-step="2" className={`${mobileStep === 2 ? 'block' : 'hidden'} mobile-step-transition md:block mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full mb-8`}>
          <div className={sectionHeader}>
            <span className="bg-white text-primary-deep rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
            APPLICANTS AUTHORIZATION FOR SALARY DEDUCTION
          </div>
          <div className="p-4 sm:p-6 lg:p-8 text-sm text-gray-800">
            
            <p className="font-bold text-gray-900 mb-6">
              To the TTMPC Treasurer or his representative:
            </p>
            
            <div className="leading-[3.5rem]">
              Sir, I hereby authorize you to get my mid-year/year end bonus and deduct from it the amount of
              
              <input 
                type="text" 
                name="bonus_amount_words" 
                value={formData.bonus_amount_words} 
                onChange={handleChange} 
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-primary outline-none bg-white text-sm transition-all mx-2 w-full sm:w-80 inline-block align-middle" 
              />
              
              <div className="inline-flex items-center relative mr-2 align-middle">
                <span className="absolute left-3 text-gray-400 text-xs font-medium">Php</span>
                <input
                  type="text"
                  inputMode="decimal"
                  name="bonus_amount_numeric"
                  value={formatWithCommas(formData.bonus_amount_numeric)}
                  onChange={(e) => handleChange({ target: { name: e.target.name, value: stripCommas(e.target.value) } })}
                  className="border border-gray-300 rounded-md pl-10 pr-3 py-1.5 focus:ring-2 focus:ring-primary outline-none bg-white text-sm transition-all w-full sm:w-48"
                />
              </div>
            </div>

            <p className="mt-6 text-gray-800">
              This authorization is irrevocable until my obligations as indicated above has been paid infull.
            </p>

          </div>
        </div>
       {/* Section 4: DEED OF ASSIGNMENT */}
        <div data-mobile-step="2" className={`${mobileStep === 2 ? 'block' : 'hidden'} mobile-step-transition md:block mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full mb-8`}>
          <div className={sectionHeader}>
            <span className="bg-white text-primary-deep rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
            DEED OF ASSIGNMENT
          </div>
          <div className="p-4 sm:p-6 lg:p-8 text-sm text-gray-800">
            
            <p className="font-bold mb-6 text-gray-900 uppercase tracking-wide">
              KNOW ALL MEN OF THESE PRESENTS:
            </p>
            
            <div className="leading-[3.5rem]">
              I,
              <input 
                type="text" 
                name="borrower_name" 
                value={`${formData.first_name || ''} ${formData.middle_name || ''} ${formData.surname || ''}`.trim()} 
                readOnly 
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-primary outline-none bg-gray-50 text-sm transition-all mx-2 w-full sm:w-[22rem] inline-block align-middle" 
              />
              of legal age, and an employee of
              <input 
                type="text" 
                name="employer_name" 
                value={formData.employer_name} 
                onChange={handleChange} 
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-primary outline-none bg-white text-sm transition-all mx-2 w-full sm:w-96 inline-block align-middle" 
              />
              Tubungan, Iloilo.
              
              <br className="hidden xl:block" />
              <div className="h-4"></div> {/* Spacer for vertical rhythm */}
              
              <span className="leading-loose block mt-2 text-justify">
                For and in coordination of my loan with <strong>Tubungan Teachers' Multi Purpose Cooperative (TTMPC)</strong> in the amount of
                
                <input 
                  type="text" 
                  name="loan_amount_words" 
                  value={formData.loan_amount_words} 
                  onChange={handleChange} 
                  className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-primary outline-none bg-white text-sm transition-all mx-2 w-full sm:w-64 inline-block align-middle" 
                />
                
                <div className="inline-flex items-center relative mr-2 align-middle">
                  <span className="absolute left-3 text-gray-400 text-xs font-medium">Php</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="loan_amount_numeric"
                    value={formatWithCommas(formData.loan_amount_numeric)}
                    onChange={(e) => handleChange({ target: { name: e.target.name, value: stripCommas(e.target.value) } })}
                    className="border border-gray-300 rounded-md pl-10 pr-3 py-1.5 focus:ring-2 focus:ring-primary outline-none bg-white text-sm transition-all w-full sm:w-40"
                  />
                </div>
                
                with interest thereon at the rate of 2% per month, do hereby by these present, ASSIGN, TRANSFER and CONVEY into TTMPC, its successors and assign my salary/benefits corresponding to the amount of my loan inclusive of interest and surcharges.
              </span>
            </div>

          </div>
          <div className="hidden md:flex p-3 sm:p-6 lg:p-8 pt-0 flex-col-reverse gap-3 justify-end sm:flex-row">
            <button type="button" onClick={handlePrintPdf} disabled={printing || loading || pdfNotReady} className="w-full bg-white border border-primary text-primary-deep px-5 py-2 rounded hover:bg-[#EEF6F1] transition-colors text-sm font-semibold disabled:opacity-50 sm:w-auto">
              {printing ? 'Printing...' : 'Print PDF'}
            </button>
            <button
              type="submit"
              disabled={loading || printing || !canSubmitBonus}
              title={!canSubmitBonus ? (eligibility?.reason || 'An active Bonus loan must be fully paid before applying again.') : ''}
              className="w-full bg-primary-deep text-white px-5 py-2 rounded hover:bg-member-green transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
            >
              {loading ? 'Processing...' : 'Submit Application'}
            </button>
          </div>
        </div>

        {mobileStep < mobileSteps.length - 1 && (
          <div className="mt-6 max-w-6xl mx-auto w-full md:hidden">
            <button
              type="button"
              onClick={goToNextMobileStep}
              className="w-full rounded bg-primary-deep px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-member-green"
            >
              Next: {mobileSteps[mobileStep + 1]?.label}
            </button>
          </div>
        )}

        <div data-mobile-step="3" className={`${mobileStep === 3 ? 'block' : 'hidden'} mobile-step-transition md:hidden mt-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm`}>
          <h2 className="text-base font-bold text-gray-900">Review your application</h2>
          <p className="mt-1 text-xs text-gray-500">Check each section below before submitting your bonus loan application. Tap Edit to go back and make changes.</p>

          {[
            {
              step: 0,
              title: "Borrower's Information",
              rows: [
                ['Name', `${formData.first_name} ${formData.middle_name} ${formData.surname}`.trim()],
                ['Contact No.', formData.contact_no],
                ['Employer', formData.employer_name],
                ['Email', formData.user_email],
              ],
            },
            {
              step: 1,
              title: 'Loan Agreement',
              rows: [
                ['Loan Amount', formData.loan_amount_numeric],
                ['Purpose', formData.loan_purpose === 'Others' ? formData.loan_purpose_other : formData.loan_purpose],
                ['Term', formData.loan_term_months ? `${formData.loan_term_months} months` : ''],
                ['Monthly Amortization', formData.monthly_amortization],
              ],
            },
            {
              step: 2,
              title: 'Authorization & Deed',
              rows: [
                ['Bonus Deduction Amount', formData.bonus_amount_numeric],
              ],
            },
          ].map((section) => {
            const missingCount = formRef.current?.querySelectorAll(`[data-mobile-step="${section.step}"] :invalid`).length || 0;
            return (
              <div key={section.step} className="mt-4 rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2 border-b border-gray-200">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{section.title}</span>
                  <div className="flex items-center gap-2">
                    {missingCount > 0 && (
                      <span className="text-xs font-bold text-red-600">{missingCount} to fix</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setMobileStep(section.step)}
                      className="-mr-1 rounded px-2 py-1 text-xs font-semibold text-member-green hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                </div>
                <dl className="px-3 py-3 space-y-2 text-sm">
                  {section.rows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="text-right font-semibold text-gray-900">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => handlePrintPdf({ download: true })}
            disabled={printing || loading || pdfNotReady}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded border border-primary bg-white px-5 py-2.5 text-sm font-bold text-primary-deep transition-colors hover:bg-[#E9F7DE] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} aria-hidden="true" />
            {printing ? 'Preparing PDF...' : 'Download PDF'}
          </button>
          <button type="submit" disabled={loading || printing || !canSubmitBonus} className="mt-5 w-full rounded bg-primary-deep px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-member-green disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? 'Processing...' : 'Submit Application'}
          </button>
        </div>

        <MobileFormStepper steps={mobileSteps} currentStep={mobileStep} onStepChange={handleMobileStepChange} onNext={goToNextMobileStep} onPrevious={() => setMobileStep((step) => Math.max(step - 1, 0))} />
      </form>
    </div>
  );
}

export default Bonus_Loan;
