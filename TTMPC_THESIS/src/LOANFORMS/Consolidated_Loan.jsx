import React, { useEffect, useMemo, useState } from 'react';
import { fetchLoanPrefill, submitUnifiedLoan } from './loanSubmission';
import { buildConsolidatedPayload, computeLoan } from './loanComputeApi';
// DEPLOYMENT_TOGGLE: RENEWAL_SIMULATION_IMPORT_START (remove for production rollout if simulation is disabled)
import { runRenewalSimulation } from './renewalSimulation';
// DEPLOYMENT_TOGGLE: RENEWAL_SIMULATION_IMPORT_END
import { formatTinNumber, TIN_FORMATTED_MAX_LENGTH } from './tinFormat';
import SmartDateInput from '../components/SmartDateInput';

// Function to generate control number: CL-YYYYMMDD-XXXX
const generateControlNumber = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = String(Math.floor(1000 + Math.random() * 9000)); 
  return `CL-${year}${month}${day}-${random}`;
};
// Function to convert number to words
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

const CONSOLIDATED_LOAN_AMOUNT_OPTIONS = Array.from(
  { length: ((470000 - 10000) / 5000) + 1 },
  (_, index) => String(10000 + (index * 5000))
);

const formatLoanAmountOption = (amount) => Number(amount).toLocaleString('en-PH');

const computeAgeFromDob = (dobValue) => {
  if (!dobValue) return '';
  const dob = new Date(dobValue);
  if (Number.isNaN(dob.getTime())) return '';

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  const hasNotHadBirthday = monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate());
  if (hasNotHadBirthday) age -= 1;

  if (!Number.isFinite(age) || age < 0) return '';
  return String(age);
};

function Consolidated_Loan() {

  const inputStyles = "border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-[#66B538] outline-none w-full bg-white text-sm transition-all";
  const labelStyles = "block text-xs font-bold text-gray-700 mb-1";
  const sectionHeader = "bg-[#66B538] text-white px-4 py-2 rounded-t-lg flex items-center gap-2 font-bold uppercase tracking-wide";
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
  const PDF_PREVIEW_WINDOW_NAME = 'consolidated-loan-preview';

  // 1. STATE LOGIC: Form Data State
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [computedLoan, setComputedLoan] = useState(null);
  const [memberMeta, setMemberMeta] = useState({ memberId: null, isBonaFide: null });
  // DEPLOYMENT_TOGGLE: RENEWAL_SIMULATION_STATE_START
  const [renewalSimDate, setRenewalSimDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [renewalSimLoading, setRenewalSimLoading] = useState(false);
  const [renewalSimResult, setRenewalSimResult] = useState(null);
  const [simulateSixMonthPaid, setSimulateSixMonthPaid] = useState(false);
  // DEPLOYMENT_TOGGLE: RENEWAL_SIMULATION_STATE_END
  const [formData, setFormData] = useState({
    application_type: 'New',
    control_no: generateControlNumber(),
    date_applied: new Date().toISOString().split('T')[0],
    surname: '',
    first_name: '',
    middle_name: '',
    contact_no: '',
    latest_net_pay: '',
    share_capital: '',
    residence_address: '',
    date_of_birth: '',
    age: '',
    civil_status: '',
    gender: '',
    tin_no: '',
    gsis_sss_no: '',
    employer_name: '',
    office_address: '',
    spouse_name: '',
    spouse_occupation: '',
    loan_amount_words: '',
    loan_amount_numeric: '',
    loan_purpose: '',
    loan_purpose_other: '',
    loan_term_months: '',
    monthly_amortization: '',
    total_interest: '',
    source_of_income: '',
    user_email: '',
    borrower_id_type: '',
    borrower_id_number: '',
  });

  // 2. HANDLER: Update State
  const handleChange = (e) => {
    const { name, value } = e.target;
    const normalizedValue = name === 'tin_no' ? formatTinNumber(value) : value;
    setFormData((prev) => {
      if (name === 'civil_status' && String(value || '').trim().toLowerCase() !== 'married') {
        return {
          ...prev,
          civil_status: value,
          spouse_name: '',
          spouse_occupation: '',
        };
      }

      return { ...prev, [name]: normalizedValue };
    });
  };

  const handlePrintPdf = async () => {
    setPrinting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/loans/consolidated/print-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/pdf',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.detail || errorBody?.message || 'Unable to generate the consolidated loan PDF.');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const previewWindow = window.open(objectUrl, PDF_PREVIEW_WINDOW_NAME);

      if (previewWindow) {
        previewWindow.focus();
      }

      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    } catch (error) {
      alert(`Print Error: ${error.message}`);
    } finally {
      setPrinting(false);
    }
  };

  const isMarriedCivilStatus = String(formData.civil_status || '').trim().toLowerCase() === 'married';
  const hasComputedAmortization = Number(formData.monthly_amortization || 0) > 0;
  const isRenewalApplication = formData.application_type === 'Renewal';

  useEffect(() => {
    let isMounted = true;

    const loadPrefill = async () => {
      try {
        const { userEmail, profile } = await fetchLoanPrefill();
        if (!isMounted) return;

        if (!profile) {
          setFormData((prev) => ({ ...prev, user_email: userEmail || prev.user_email }));
          return;
        }

        setMemberMeta({
          memberId: profile.member_id ?? null,
          isBonaFide: profile.is_bona_fide ?? null,
        });

        setFormData((prev) => {
          const tinValue = profile.tin_number ?? profile.tin_no ?? prev.tin_no;
          const tinFormatted = formatTinNumber(tinValue);

          return {
          ...prev,
          user_email: userEmail || prev.user_email,
          surname: profile.surname ?? profile.last_name ?? prev.surname,
          first_name: profile.first_name ?? prev.first_name,
          middle_name: profile.middle_name ?? profile.middle_initial ?? prev.middle_name,
          contact_no: profile.contact_number ?? profile.contact_no ?? prev.contact_no,
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
          latest_net_pay: (profile.latest_net_pay ?? profile.annual_income)?.toString() ?? prev.latest_net_pay,
          share_capital: profile.share_capital?.toString() ?? prev.share_capital,
          };
        });
      } catch (_err) {
        // Prefill is optional; form remains manually fillable on failure.
      }
    };

    loadPrefill();
    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-fill loan_amount_words when loan_amount_numeric changes
  useEffect(() => {
    if (formData.loan_amount_numeric) {
      const words = numberToWords(formData.loan_amount_numeric);
      setFormData((prev) => ({
        ...prev,
        loan_amount_words: words.charAt(0).toUpperCase() + words.slice(1),
      }));
    } else {
      setFormData((prev) => ({ ...prev, loan_amount_words: '' }));
    }
  }, [formData.loan_amount_numeric]);

  useEffect(() => {
    const computedAge = computeAgeFromDob(formData.date_of_birth);
    setFormData((prev) => {
      if (prev.age === computedAge) return prev;
      return { ...prev, age: computedAge };
    });
  }, [formData.date_of_birth]);

  useEffect(() => {
    const principal = Number(formData.loan_amount_numeric || 0);
    const term = Number(formData.loan_term_months || 0);

    if (!principal || !term) {
      setFormData((prev) => ({ ...prev, monthly_amortization: '' }));
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const data = await computeLoan(buildConsolidatedPayload(formData));
        setComputedLoan(data || null);
        setFormData((prev) => ({
          ...prev,
          monthly_amortization: data?.monthly_amortization ? String(data.monthly_amortization) : prev.monthly_amortization,
          total_interest: data?.total_interest ? String(data.total_interest) : prev.total_interest,
        }));
      } catch (_err) {
        // Keep form usable even if compute API is temporarily unavailable.
        setComputedLoan(null);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [formData.loan_amount_numeric, formData.loan_term_months]);

  // DEPLOYMENT_TOGGLE: RENEWAL_SIMULATION_EFFECT_START
  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!isRenewalApplication || !memberMeta.memberId || !renewalSimDate) {
        setRenewalSimResult(null);
        setRenewalSimLoading(false);
        return;
      }

      setRenewalSimLoading(true);
      try {
        const result = await runRenewalSimulation({
          memberId: memberMeta.memberId,
          asOfDate: renewalSimDate,
          loanTypeCode: 'CONSOLIDATED',
          monthsRequired: 6,
        });

        if (alive) setRenewalSimResult(result);
      } catch (_err) {
        if (alive) setRenewalSimResult(null);
      } finally {
        if (alive) setRenewalSimLoading(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [isRenewalApplication, memberMeta.memberId, renewalSimDate]);
  // DEPLOYMENT_TOGGLE: RENEWAL_SIMULATION_EFFECT_END

  // 3. LOGIC: Database Insertion
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await submitUnifiedLoan({
        loanTypeCode: 'CONSOLIDATED',
        controlNumber: formData.control_no,
        applicationStatus: 'pending',
        applicationType: formData.application_type,
        loanStatus: 'pending',
        applicationDate: formData.date_applied,
        loanAmount: formData.loan_amount_numeric,
        principalAmount: formData.loan_amount_numeric,
        term: formData.loan_term_months,
        optionalFields: {
          total_interest: formData.total_interest || null,
          loan_amount_words: formData.loan_amount_words || null,
          loan_purpose: formData.loan_purpose || null,
          monthly_amortization: formData.monthly_amortization || null,
          source_of_income: formData.source_of_income || null,
          net_proceeds: isRenewalApplication ? (computedLoan?.net_proceeds ?? null) : null,
          service_fee: isRenewalApplication ? (computedLoan?.deductions?.service_fee ?? null) : null,
          insurance_fee: isRenewalApplication ? (computedLoan?.deductions?.insurance_fee ?? null) : null,
          notarial_fee: isRenewalApplication ? (computedLoan?.deductions?.notarial_fee ?? null) : null,
          cbu_deduction: isRenewalApplication ? (computedLoan?.deductions?.cbu_deduction ?? null) : null,
          consolidated_notes: null,
        },
      });

      alert("Loan Application Submitted Successfully!");
      window.location.reload();
    } catch (err) {
      alert("Submission Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fmtMoney = (value) => {
    const number = Number(value || 0);
    return `₱${Number.isFinite(number) ? number.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}`;
  };

  const policyMultiplier = useMemo(() => {
    if (memberMeta.isBonaFide === true) return 5;
    if (memberMeta.isBonaFide === false) return 3;
    return 3;
  }, [memberMeta.isBonaFide]);

  const loanAmountNumber = Number(formData.loan_amount_numeric || 0);
  const shareCapitalNumber = Number(formData.share_capital || 0);
  const takeHomePayNumber = Number(formData.latest_net_pay || 0);
  const monthlyAmortNumber = Number(formData.monthly_amortization || 0);

  const takeHomeEligibilityPass = useMemo(() => {
    if (!loanAmountNumber) return true;
    if (!Number.isFinite(monthlyAmortNumber) || monthlyAmortNumber <= 0) return true;
    if (!Number.isFinite(takeHomePayNumber) || takeHomePayNumber <= 0) return false;
    return monthlyAmortNumber <= takeHomePayNumber * 0.4;
  }, [loanAmountNumber, monthlyAmortNumber, takeHomePayNumber]);

  const debtCeilingExceeded = useMemo(() => {
    if (!loanAmountNumber || !shareCapitalNumber) return false;
    return loanAmountNumber > shareCapitalNumber * policyMultiplier;
  }, [loanAmountNumber, shareCapitalNumber, policyMultiplier]);

  // DEPLOYMENT_TOGGLE: RENEWAL_SIMULATION_DERIVED_VALUES_START
  const renewalDeductions = useMemo(() => {
    const existingBalance = Number(renewalSimResult?.existingBalance || 0);
    const unpaidInterest = Number(renewalSimResult?.unpaidInterest || 0);
    const serviceFee = Number(computedLoan?.deductions?.service_fee || 0);
    const insuranceFee = Number(computedLoan?.deductions?.insurance_fee || 0);
    const notarialFee = Number(computedLoan?.deductions?.notarial_fee || 0);
    const cbuDeduction = Number(computedLoan?.deductions?.cbu_deduction || 0);
    const total = existingBalance + unpaidInterest + serviceFee + insuranceFee + notarialFee + cbuDeduction;
    const netProceeds = Math.max(0, loanAmountNumber - total);

    return {
      existingBalance,
      unpaidInterest,
      serviceFee,
      insuranceFee,
      notarialFee,
      cbuDeduction,
      total,
      netProceeds,
    };
  }, [renewalSimResult, computedLoan, loanAmountNumber]);

  const effectiveContributions = useMemo(() => {
    const paidMonths = simulateSixMonthPaid
      ? 6
      : Number(renewalSimResult?.contributions?.paidMonths ?? 0);
    const satisfied = simulateSixMonthPaid
      ? true
      : Boolean(renewalSimResult?.contributions?.satisfied);

    return { paidMonths, satisfied };
  }, [simulateSixMonthPaid, renewalSimResult]);

  const effectiveViableForRenewal = useMemo(() => {
    return Boolean(effectiveContributions.satisfied) && Boolean(renewalSimResult?.hasActiveLoan);
  }, [effectiveContributions, renewalSimResult]);
  // DEPLOYMENT_TOGGLE: RENEWAL_SIMULATION_DERIVED_VALUES_END

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 pb-20">
      {/* Header (Unchanged) */}
      <header className="w-full bg-[#E9F7DE] h-20 shadow-lg flex text-col px-6">
        <div className="flex flex-row items-center gap-4">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
            <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
          </div>
        </div>
      </header>

      {/* Main Form Wrapping everything */}
      <form onSubmit={handleSubmit}>
        <section className="grid gap-8 px-4">
          <h1 className="text-center text-2xl font-bold mt-12 text-[#66B538]">CONSOLIDATED LOAN APPLICATION</h1>
          <div className="max-w-6xl mx-auto w-full">
            <div className="bg-[#EEF6F1] rounded-xl p-6 border-2 border-[#66B538] flex flex-wrap items-center justify-between gap-6">
              <div className="flex gap-8">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="application_type" value="New" checked={formData.application_type === 'New'} onChange={handleChange} className="h-4 w-4 accent-[#66B538]" />
                  <span className="font-semibold text-gray-700">New</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="application_type" value="Renewal" checked={formData.application_type === 'Renewal'} onChange={handleChange} className="h-4 w-4 accent-[#66B538]" />
                  <span className="font-semibold text-gray-700">Renewal</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500">Control No.</label>
                  <input type="text" name="control_no" value={formData.control_no} readOnly className="border border-gray-300 rounded px-3 py-1.5 w-48 bg-gray-100 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500">Date Applied</label>
                  <input type="date" name="date_applied" value={formData.date_applied} onChange={handleChange} className="border border-gray-300 rounded px-3 py-1.5 w-48" />
                </div>
              </div>
            </div>

            {/* DEPLOYMENT_TOGGLE: RENEWAL_SIMULATION_UI_START */}
            {/* Renewal Simulation Tools (supplemental; no structural change to existing form sections) */}
            {isRenewalApplication ? (
            <div className="mt-4 bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div className="flex-1">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Renewal Simulation</p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Select a date to simulate 6-month contribution history and renewal refinancing deductions.
                  </p>
                  <label className="mt-2 inline-flex items-center gap-2 text-[11px] text-gray-700 font-semibold">
                    <input
                      type="checkbox"
                      checked={simulateSixMonthPaid}
                      onChange={(e) => setSimulateSixMonthPaid(e.target.checked)}
                      className="h-4 w-4 accent-[#66B538]"
                    />
                    Simulate paid 6 months already
                  </label>
                </div>
                <div className="w-full md:w-64">
                  <label className="block text-[10px] uppercase font-bold text-gray-500">Simulation Date</label>
                  <input
                    type="date"
                    value={renewalSimDate}
                    onChange={(e) => setRenewalSimDate(e.target.value)}
                    className="border border-gray-300 rounded px-3 py-1.5 w-full"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border border-gray-100 p-4 bg-gray-50">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">6-Month Contributions</p>
                  <p className="text-sm font-semibold text-gray-800 mt-1">
                    {renewalSimLoading
                      ? 'Checking...'
                      : (effectiveContributions.satisfied ? 'Satisfied' : 'Not yet')}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Paid months: {effectiveContributions.paidMonths}/6
                  </p>
                </div>

                <div className="rounded-lg border border-gray-100 p-4 bg-gray-50">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Current Loan</p>
                  <p className="text-sm font-semibold text-gray-800 mt-1">
                    {renewalSimLoading
                      ? 'Checking...'
                      : (renewalSimResult?.hasActiveLoan ? 'Found' : 'None')}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {renewalSimResult?.activeLoan?.control_number
                      ? `${renewalSimResult.activeLoan.control_number} (${renewalSimResult.activeLoan.loan_status || 'active'})`
                      : '—'}
                  </p>
                </div>

                <div className="rounded-lg border border-gray-100 p-4 bg-gray-50">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Renewal Status</p>
                  <p className={`text-sm font-extrabold mt-1 ${effectiveViableForRenewal ? 'text-green-700' : 'text-gray-700'}`}>
                    {effectiveViableForRenewal ? 'Viable for Renewal' : 'Not viable'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">Requires 6 paid months + an active loan.</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-gray-100 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Eligibility (Take Home Pay)</p>
                  <p className={`text-sm font-semibold mt-1 ${takeHomeEligibilityPass ? 'text-green-700' : 'text-red-600'}`}>
                    {takeHomeEligibilityPass ? 'Pass' : 'Fail'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Rule: Monthly Amortization ≤ Take Home Pay × 0.40
                  </p>
                  <div className="mt-2 text-[11px] text-gray-600">
                    <div>Monthly Amortization: <span className="font-semibold">{fmtMoney(monthlyAmortNumber)}</span></div>
                    <div>Take Home Pay: <span className="font-semibold">{fmtMoney(takeHomePayNumber)}</span></div>
                    <div>40% Threshold: <span className="font-semibold">{fmtMoney(takeHomePayNumber * 0.4)}</span></div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-100 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Debt Ceiling (Share Capital)</p>
                  <p className={`text-sm font-semibold mt-1 ${debtCeilingExceeded ? 'text-red-600' : 'text-green-700'}`}>
                    {debtCeilingExceeded ? 'Exceeded' : 'Within limit'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Policy: {policyMultiplier}× for {policyMultiplier === 5 ? 'MIGS' : 'Non-MIGS'} (based on member standing)
                  </p>
                  <div className="mt-2 text-[11px] text-gray-600">
                    <div>Requested Amount: <span className="font-semibold">{fmtMoney(loanAmountNumber)}</span></div>
                    <div>Share Capital: <span className="font-semibold">{fmtMoney(shareCapitalNumber)}</span></div>
                    <div>Max Allowed: <span className="font-semibold">{fmtMoney(shareCapitalNumber * policyMultiplier)}</span></div>
                    <div>Debt Capacity: <span className="font-semibold">{fmtMoney(Math.max(0, (shareCapitalNumber * policyMultiplier) - (renewalDeductions.netProceeds || 0)))}</span></div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-gray-100 p-4 bg-gray-50">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Renewal Net Proceeds (Refinance Simulation)</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  New Loan Amount − (Existing Balance + Unpaid Interest + Insurance + Service Fee + Notarial Fee + CBU Deduction)
                </p>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                  <div className="flex items-center justify-between"><span className="text-gray-600">New Loan Amount</span><span className="font-semibold text-gray-800">{fmtMoney(loanAmountNumber)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-gray-600">Existing Active Balance</span><span className="font-semibold text-gray-800">{fmtMoney(renewalDeductions.existingBalance)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-gray-600">Unpaid Interest</span><span className="font-semibold text-gray-800">{fmtMoney(renewalDeductions.unpaidInterest)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-gray-600">CLIMBS Insurance</span><span className="font-semibold text-gray-800">{fmtMoney(renewalDeductions.insuranceFee)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-gray-600">Service Fee</span><span className="font-semibold text-gray-800">{fmtMoney(renewalDeductions.serviceFee)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-gray-600">Notarial Fee</span><span className="font-semibold text-gray-800">{fmtMoney(renewalDeductions.notarialFee)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-gray-600">CBU Deduction</span><span className="font-semibold text-gray-800">{fmtMoney(renewalDeductions.cbuDeduction)}</span></div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Net Proceeds (Cash Released)</span>
                  <span className="text-sm font-extrabold text-[#2E7D32]">{fmtMoney(renewalDeductions.netProceeds)}</span>
                </div>
              </div>
            </div>
            ) : null}
            {/* DEPLOYMENT_TOGGLE: RENEWAL_SIMULATION_UI_END */}
          </div>
        </section>

        {/* Section 1: BORROWER'S INFORMATION */}
        <div className="mt-10 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}>
            <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
            BORROWER'S INFORMATION
          </div>

          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div><label className={labelStyles}>Surname <span className="text-red-500">*</span></label><input type="text" name="surname" value={formData.surname} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>First Name <span className="text-red-500">*</span></label><input type="text" name="first_name" value={formData.first_name} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Middle Name</label><input type="text" name="middle_name" value={formData.middle_name} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Contact No. <span className="text-red-500">*</span></label><input type="text" name="contact_no" value={formData.contact_no} onChange={handleChange} className={inputStyles} required /></div>
            <div>
              <label className={labelStyles}>Latest Net Pay <span className="text-red-500">*</span></label>
              <div className="relative"><span className="absolute left-3 top-2 text-gray-400 text-xs">₱</span><input type="number" name="latest_net_pay" value={formData.latest_net_pay} onChange={handleChange} className={`${inputStyles} pl-7`} required /></div>
            </div>
            <div>
              <label className={labelStyles}>Share Capital <span className="text-red-500">*</span></label>
              <div className="relative"><span className="absolute left-3 top-2 text-gray-400 text-xs">₱</span><input type="number" name="share_capital" value={formData.share_capital} onChange={handleChange} className={`${inputStyles} pl-7`} required /></div>
            </div>
            <div className="md:col-span-3"><label className={labelStyles}>Residence Address <span className="text-red-500">*</span></label><input type="text" name="residence_address" value={formData.residence_address} onChange={handleChange} className={inputStyles} required /></div>
            <div>
              <SmartDateInput
                mode="dob"
                name="date_of_birth"
                value={formData.date_of_birth}
                onChange={(isoDate) => setFormData((prev) => ({ ...prev, date_of_birth: isoDate || '' }))}
                label="Date of Birth"
                required
              />
            </div>
            <div><label className={labelStyles}>Age <span className="text-red-500">*</span></label><input type="number" name="age" value={formData.age} readOnly className={inputStyles} required /></div>
            <div>
              <label className={labelStyles}>Civil Status <span className="text-red-500">*</span></label>
              <select name="civil_status" value={formData.civil_status} onChange={handleChange} className={inputStyles} required><option value="">Select Status</option><option>Single</option><option>Married</option><option>Widowed</option></select>
            </div>
            <div>
              <label className={labelStyles}>Gender <span className="text-red-500">*</span></label>
              <select name="gender" value={formData.gender} onChange={handleChange} className={inputStyles} required><option value="">Select Gender</option><option>Male</option><option>Female</option></select>
            </div>
            <div><label className={labelStyles}>TIN No. <span className="text-red-500">*</span></label><input type="text" name="tin_no" value={formData.tin_no} onChange={handleChange} inputMode="numeric" maxLength={TIN_FORMATTED_MAX_LENGTH} placeholder="123-456-789-000" className={inputStyles} required /></div>
            <div><label className={labelStyles}>GSIS/SSS No. <span className="text-red-500">*</span></label><input type="text" name="gsis_sss_no" value={formData.gsis_sss_no} onChange={handleChange} className={inputStyles} required /></div>
            <div className="md:col-span-2"><label className={labelStyles}>Employer's Name <span className="text-red-500">*</span></label><input type="text" name="employer_name" value={formData.employer_name} onChange={handleChange} className={inputStyles} required /></div>
            <div className="md:col-span-1"><label className={labelStyles}>Office Address <span className="text-red-500">*</span></label><input type="text" name="office_address" value={formData.office_address} onChange={handleChange} className={inputStyles} required /></div>
            {isMarriedCivilStatus ? (
              <>
                <div className="md:col-span-2"><label className={labelStyles}>Name of Spouse <span className="text-red-500">*</span></label><input type="text" name="spouse_name" value={formData.spouse_name} onChange={handleChange} className={inputStyles} required /></div>
                <div className="md:col-span-1"><label className={labelStyles}>Spouse's Occupation <span className="text-red-500">*</span></label><input type="text" name="spouse_occupation" value={formData.spouse_occupation} onChange={handleChange} className={inputStyles} required /></div>
              </>
            ) : null}
          </div>
        </div>

       {/* Section 2: LOAN AGREEMENT */}
        <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}>
            <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
            LOAN AGREEMENT
          </div>
          <div className="p-8 text-sm text-gray-800">
            
            <div className="leading-[3.5rem]">
              I hereby apply for a loan in the amount of
              <input 
                type="text" 
                name="loan_amount_words" 
                value={formData.loan_amount_words} 
                onChange={handleChange} 
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all mx-2 w-[22rem] inline-block align-middle" 
              />
              <div className="inline-flex items-center relative mr-2 align-middle">
                <select
                  name="loan_amount_numeric"
                  value={formData.loan_amount_numeric}
                  onChange={handleChange}
                  className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all w-48"
                  required
                >
                  <option value="">Select Amount</option>
                  {CONSOLIDATED_LOAN_AMOUNT_OPTIONS.map((amount) => (
                    <option key={amount} value={amount}>
                      {formatLoanAmountOption(amount)}
                    </option>
                  ))}
                </select>
              </div>
              for the purpose of
              <select 
                name="loan_purpose" 
                value={formData.loan_purpose} 
                onChange={handleChange} 
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all mx-2 w-64 inline-block align-middle" 
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
                  className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all mx-2 w-56 inline-block align-middle" 
                />
              )}
              <br className="hidden md:block" />
              
              for a term of
              <select 
                name="loan_term_months" 
                value={formData.loan_term_months} 
                onChange={handleChange} 
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all mx-2 w-32 inline-block align-middle text-gray-600"
              >
                <option value="">Select Term</option>
                <option>12</option>
                <option>24</option>
                <option>36</option>
                <option>48</option>
                <option>60</option>
              </select>
              months with a monthly amortization of
              <input 
                type="number" 
                name="monthly_amortization" 
                value={formData.monthly_amortization} 
                readOnly 
                className={`border rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none text-sm transition-all mx-2 w-48 inline-block align-middle ${
                  hasComputedAmortization
                    ? 'border-[#66B538] bg-[#E9F7DE] text-[#2E7D32] font-semibold'
                    : 'border-gray-300 bg-gray-50 text-gray-700'
                }`}
              />
              , which I promise to pay the amount to <strong>Tubungan Teachers' Multi Purpose Cooperative</strong>
              
              <br />
              
              <span className="block mt-2 leading-normal">
                <strong>(TTMPC)</strong> in accordance with the terms and conditions as stipulated in the Promissory Note of which I certify to have read and understood clearly. I bind myself to pay out my monthly salary and/or other benefits the required monthly amortization here on or surrender my ATM to TTMPC.
              </span>
            </div>

          </div>
        </div>
        {/* Section 3: LOAN CONTRACT */}
        <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}>
            <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
            LOAN CONTRACT
          </div>
          <div className="p-8 text-sm text-gray-800">
            
            {/* Form paragraph with inline inputs */}
            <div className="leading-[3.5rem]">
              I, 
              <input 
                type="text" 
                name="borrower_name" 
                value={`${formData.first_name} ${formData.middle_name} ${formData.surname}`.trim()} 
                readOnly 
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-gray-50 text-sm transition-all mx-2 w-72 inline-block align-middle" 
              />
              bind myself to pay <strong>Tubungan Teachers' Multi Purpose Cooperative (TTMPC)</strong> the amount of 
              <input 
                type="text" 
                name="loan_amount_words" 
                value={formData.loan_amount_words} 
                onChange={handleChange} 
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all mx-2 w-56 inline-block align-middle" 
              />
              
              <br className="hidden md:block" />

              <div className="inline-flex items-center relative mr-2 align-middle">
                <select
                  name="loan_amount_numeric"
                  value={formData.loan_amount_numeric}
                  onChange={handleChange}
                  className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all w-48"
                  required
                >
                  <option value="">Select Amount</option>
                  {CONSOLIDATED_LOAN_AMOUNT_OPTIONS.map((amount) => (
                    <option key={amount} value={amount}>
                      {formatLoanAmountOption(amount)}
                    </option>
                  ))}
                </select>
              </div>
              from <span className="text-blue-600 font-medium">my monthly salary every month OR from my monthly income </span>
              and until the loan is fully paid.
              
              <br className="hidden md:block" />

              <span className="inline-block mt-4">
                I hereby agree that should I resign or be terminated from my employment with 
                <input 
                  type="text" 
                  name="employer_name" 
                  value={formData.employer_name} 
                  onChange={handleChange} 
                  className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all mx-2 w-[22rem] inline-block align-middle" 
                />
                the outstanding balance of my loan shall be paid
              </span>
              
              <br />
              
              <span className="block mt-2 leading-normal">
                through: (1) deduction from share capital; (2) by my co-makers; (3) value ofcollateral (if there is any); (4) deduction from any benefit from employment.
              </span>
            </div>

            {/* IDs section */}
            <div className="flex flex-wrap gap-6 mt-8">
              <div className="w-64">
                <label className={labelStyles}>Valid ID/Gov't. Issued ID <span className="text-red-500">*</span></label>
                <input type="text" name="borrower_id_type" value={formData.borrower_id_type} readOnly className={`${inputStyles} bg-gray-50 cursor-not-allowed`} />
              </div>
              <div className="w-64">
                <label className={labelStyles}>ID Number <span className="text-red-500">*</span></label>
                <input type="text" name="borrower_id_number" value={formData.borrower_id_number} readOnly className={`${inputStyles} bg-gray-50 cursor-not-allowed`} />
              </div>
            </div>

          </div>
        </div>
        {/* Section 4: ADDITIONAL INFORMATION */}
        <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}>
            <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
            BORROWER'S ADDITIONAL INFORMATION
          </div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><label className={labelStyles}>Email Address <span className="text-red-500">*</span></label><input type="email" name="user_email" value={formData.user_email} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Mobile / Tel No. <span className="text-red-500">*</span></label><input type="text" name="mobile_tel_no" value={formData.contact_no} onChange={handleChange} className={inputStyles} /></div>
          </div>
        </div>

        <div className="mt-8 max-w-6xl mx-auto w-full mb-8 flex justify-end">
          <button 
            type="button" 
            onClick={handlePrintPdf}
            disabled={printing || loading}
            className="mr-3 border border-[#66B538] text-[#66B538] px-6 py-2 rounded hover:bg-[#E9F7DE] transition-colors font-bold disabled:opacity-50 cursor-pointer"
          >
            {printing ? "Preparing PDF..." : "Print PDF"}
          </button>
          <button 
            type="submit" 
            disabled={loading || printing || (isRenewalApplication && debtCeilingExceeded)}
            className="bg-[#66B538] text-white px-6 py-2 rounded hover:bg-[#5aa12b] transition-colors font-bold disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Processing..." : "Submit Application"}
          </button>
        </div>

        {isRenewalApplication && debtCeilingExceeded ? (
          <div className="-mt-6 max-w-6xl mx-auto w-full px-4">
            <p className="text-xs text-red-600 font-semibold">
              Submit is disabled: requested loan exceeds the {policyMultiplier}× share capital ceiling.
            </p>
          </div>
        ) : null}
      </form>
    </div>
  );
}

export default Consolidated_Loan;