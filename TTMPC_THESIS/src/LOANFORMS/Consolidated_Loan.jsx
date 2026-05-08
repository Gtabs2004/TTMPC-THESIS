import React, { useEffect, useState } from 'react';
import { fetchLoanPrefill, submitUnifiedLoan } from './loanSubmission';
import { buildConsolidatedPayload, computeLoan } from './loanComputeApi';
import { formatTinNumber, TIN_FORMATTED_MAX_LENGTH } from './tinFormat';
import { supabase } from '../supabaseClient';
import { resolveAccountFromSessionUser } from '../utils/sessionIdentity';

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

function Consolidated_Loan() {

  const inputStyles = "border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-[#66B538] outline-none w-full bg-white text-sm transition-all";
  const labelStyles = "block text-xs font-bold text-gray-700 mb-1";
  const sectionHeader = "bg-[#66B538] text-white px-4 py-2 rounded-t-lg flex items-center gap-2 font-bold uppercase tracking-wide";
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
  const PDF_PREVIEW_WINDOW_NAME = 'consolidated-loan-preview';

  // 1. STATE LOGIC: Form Data State
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
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
    member_class: 'NON-MIGS',
  });

  /*
    ============================================================
    LOAN CALCULATOR — Constants & State
    ------------------------------------------------------------
    Policy values (debt ceiling multiplier, 6-month rule, term
    options, monthly interest factor) live here as named constants
    so the UI developer never needs to hunt through the JSX.
    Update them in one place if cooperative policy changes.
    ============================================================
  */
  // Loan Calculator state
  const NEW_LOAN_NET_PROCEEDS = 0; // HARD CODED per policy for NEW
  const RENEWAL_DEDUCTIONS = 0;    // placeholder until deduction sources are wired
  const MIN_PAID_MONTHS_FOR_RENEWAL = 6;
  const MONTHLY_INTEREST_FACTOR = 0.0083;
  const TERM_OPTIONS = [12, 24, 36, 48, 60];
  const [calcResult, setCalcResult] = useState(null);
  const [existingLoan, setExistingLoan] = useState(null);
  const [renewalError, setRenewalError] = useState('');
  const [sixMonthOverride, setSixMonthOverride] = useState(false);

  const isRenewal = String(formData.application_type || '').toLowerCase() === 'renewal';

  useEffect(() => {
    if (!isRenewal) {
      setExistingLoan(null);
      setRenewalError('');
      return;
    }
    let isMounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setRenewalError('Please sign in to apply for renewal.'); return; }

        const account = await resolveAccountFromSessionUser(user);
        const memberId = account?.user_id || account?.auth_user_id || user.id;

        const { data: loanRows, error } = await supabase
          .from('loans')
          .select('control_number, principal_amount, loan_amount, monthly_amortization, term, application_date, loan_status, member_id')
          .eq('member_id', memberId)
          .order('application_date', { ascending: false });

        if (!isMounted) return;
        if (error) { setRenewalError(error.message); return; }
        if (!loanRows || loanRows.length === 0) {
          setExistingLoan(null);
          setRenewalError('No existing loan found. Renewal is not available.');
          return;
        }

        const controlNumbers = loanRows.map((l) => l.control_number).filter(Boolean);
        let paymentsByLoan = {};
        if (controlNumbers.length) {
          const { data: payments, error: payErr } = await supabase
            .from('loan_payments')
            .select('loan_id, amount_paid, confirmation_status')
            .in('loan_id', controlNumbers);
          if (payErr) { setRenewalError(payErr.message); return; }
          const confirmedStatuses = new Set(['validated', 'confirmed', 'bookkeeper_confirmed', 'approved']);
          (payments || []).forEach((p) => {
            const status = String(p.confirmation_status || 'confirmed').toLowerCase();
            if (!confirmedStatuses.has(status)) return;
            const key = String(p.loan_id);
            paymentsByLoan[key] = (paymentsByLoan[key] || 0) + Number(p.amount_paid || 0);
          });
        }

        const enriched = loanRows.map((l) => {
          const principal = Number(l.principal_amount || l.loan_amount || 0);
          const paid = Number(paymentsByLoan[String(l.control_number)] || 0);
          const remaining = Math.max(principal - paid, 0);
          return { ...l, principal, paid, remaining };
        });

        const active = enriched.find((l) => l.remaining > 0);
        if (!active) {
          setExistingLoan(null);
          setRenewalError('No existing active loan found. Renewal is not available.');
          return;
        }

        const start = new Date(active.application_date);
        const now = new Date();
        const monthsElapsed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
        const monthly = Number(active.monthly_amortization || 0);
        const monthsPaidByPayments = monthly > 0 ? Math.floor(active.paid / monthly) : 0;
        const paidMonths = Math.max(monthsElapsed, monthsPaidByPayments);

        setExistingLoan({
          controlNumber: active.control_number,
          loanAmount: active.principal,
          remainingBalance: active.remaining,
          monthlyAmortization: monthly,
          term: Number(active.term || 0),
          applicationDate: active.application_date,
          paidMonths,
        });
        setRenewalError('');
      } catch (err) {
        if (isMounted) setRenewalError(err.message || 'Unable to verify existing loan.');
      }
    })();
    return () => { isMounted = false; };
  }, [isRenewal]);

  // DEV/SIMULATION: forces the 6-month payment requirement to pass
  const overrideSixMonthsPaid = () => setSixMonthOverride(true);

  const sixMonthsPaid = sixMonthOverride || (existingLoan?.paidMonths ?? 0) >= MIN_PAID_MONTHS_FOR_RENEWAL;
  const [riskCategories, setRiskCategories] = useState({});

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('stress_index_category')
        .select('stress_index_category_id, code, label');
      if (!isMounted || error || !data) return;
      const map = {};
      data.forEach((row) => { map[row.code] = row; });
      setRiskCategories(map);
    })();
    return () => { isMounted = false; };
  }, []);

  const computeMonthlyAmortization = (principal, term) => {
    if (!principal || !term) return 0;
    return (principal / term) + (principal * MONTHLY_INTEREST_FACTOR);
  };

  const RISK_COLORS = {
    safe: 'text-[#2E7D32] bg-[#E9F7DE]',
    low_risk: 'text-yellow-700 bg-yellow-100',
    moderate_risk: 'text-orange-600 bg-orange-100',
    high_risk: 'text-red-600 bg-red-100',
    extreme_risk: 'text-red-700 bg-red-100',
  };

  const classifyRisk = (stressPct) => {
    let code = 'safe';
    if (stressPct > 50) code = 'extreme_risk';
    else if (stressPct > 40) code = 'high_risk';
    else if (stressPct >= 36) code = 'moderate_risk';
    else if (stressPct >= 20) code = 'low_risk';

    const dbRow = riskCategories[code];
    const fallbackLabels = {
      safe: 'Safe',
      low_risk: 'Low Risk',
      moderate_risk: 'Moderate Risk',
      high_risk: 'High Risk',
      extreme_risk: 'Extreme Risk',
    };
    return {
      code,
      id: dbRow?.stress_index_category_id || null,
      label: (dbRow?.label || fallbackLabels[code]).toUpperCase(),
      color: RISK_COLORS[code],
    };
  };

  const evaluateLoan = () => {
    const principal = Number(formData.loan_amount_numeric || 0);
    const netPay = Number(formData.latest_net_pay || 0);
    const shareCapital = Number(formData.share_capital || 0);
    const memberClass = String(formData.member_class || 'NON-MIGS').toUpperCase();

    if (!principal || !netPay || !shareCapital) {
      setCalcResult({ error: 'Please ensure Net Pay, Share Capital, and Loan Amount are filled.' });
      return;
    }

    const multiplier = memberClass === 'MIGS' ? 5 : 3;
    const existingBalance = isRenewal ? Number(existingLoan?.remainingBalance || 0) : 0;
    // Net Proceeds: NEW = hardcoded 0 ; RENEWAL = New Loan Amount − Existing Active Balance − Deductions
    const netProceeds = isRenewal
      ? (principal - existingBalance - RENEWAL_DEDUCTIONS)
      : NEW_LOAN_NET_PROCEEDS;
    const maxAllowed = (shareCapital * multiplier) - netProceeds;
    const eligible = principal <= maxAllowed;

    // Loan Capacity (max new loan the member can avail)
    // NEW: principal ≤ SC × M  → capacity = SC × M
    // RENEWAL: principal ≤ SC × M − (principal − existingBalance − deductions)
    //          → 2·principal ≤ SC × M + existingBalance + deductions
    //          → capacity = (SC × M + existingBalance + deductions) / 2
    const loanCapacity = isRenewal
      ? Math.max(((shareCapital * multiplier) + existingBalance + RENEWAL_DEDUCTIONS) / 2, 0)
      : Math.max(shareCapital * multiplier, 0);

    // Prescribed loan amount (snapped down to the nearest 5,000 step within range)
    const STEP = 5000;
    const prescribedLoanAmount = Math.max(Math.floor(loanCapacity / STEP) * STEP, 0);

    let suggestedTerm = null;
    let suggestedAmortization = 0;
    let suggestedStress = 0;
    for (const t of TERM_OPTIONS) {
      const ma = computeMonthlyAmortization(principal, t);
      const stress = (ma / netPay) * 100;
      if (stress <= 35) {
        suggestedTerm = t;
        suggestedAmortization = ma;
        suggestedStress = stress;
        break;
      }
    }

    if (!suggestedTerm) {
      const t = TERM_OPTIONS[TERM_OPTIONS.length - 1];
      suggestedTerm = t;
      suggestedAmortization = computeMonthlyAmortization(principal, t);
      suggestedStress = (suggestedAmortization / netPay) * 100;
    }

    // Loan Eligibility Status: Monthly Amortization < Take Home Pay * 0.40
    const takeHomeThreshold = netPay * 0.40;
    const eligibilityPass = suggestedAmortization < takeHomeThreshold;

    setCalcResult({
      eligible,
      maxAllowed,
      multiplier,
      memberClass,
      monthlyPayment: suggestedAmortization,
      suggestedTerm,
      stressIndex: suggestedStress,
      risk: classifyRisk(suggestedStress),
      netProceeds,
      existingBalance,
      isRenewal,
      loanCapacity,
      prescribedLoanAmount,
      takeHomePay: netPay,
      takeHomeThreshold,
      eligibilityPass,
    });
  };

  const exceedsCeiling = calcResult && !calcResult.error && !calcResult.eligible;
  const renewalBlocked = isRenewal && (!existingLoan || !sixMonthsPaid);
  const eligibilityFailed = calcResult && !calcResult.error && calcResult.eligibilityPass === false;

  /*
    Eligibility preview values
    --------------------------
    The Loan Eligibility Status card needs to show as soon as
    Share Capital + Latest Net Pay are present (before a loan amount
    is even picked). When calcResult exists we trust its numbers;
    otherwise we render the 40% threshold using the form fields and
    treat Monthly Amortization as 0 → PASS (no obligation yet).
  */
  const previewNetPay = Number(formData.latest_net_pay || 0);
  const previewShareCapital = Number(formData.share_capital || 0);
  const showEligibilityCard = !!calcResult && !calcResult.error
    ? true
    : (previewNetPay > 0 && previewShareCapital > 0);
  const eligibilityCardData = calcResult && !calcResult.error
    ? {
        monthlyPayment: calcResult.monthlyPayment,
        takeHomeThreshold: calcResult.takeHomeThreshold,
        takeHomePay: calcResult.takeHomePay,
        eligibilityPass: calcResult.eligibilityPass,
      }
    : {
        monthlyPayment: 0,
        takeHomeThreshold: previewNetPay * 0.40,
        takeHomePay: previewNetPay,
        eligibilityPass: true,
      };

  /*
    Loan amount dropdown restriction
    --------------------------------
    Computes the live capacity ceiling (without needing an evaluation
    pass) so the <select> below can hide options the member cannot
    qualify for. Mirrors the formula used inside evaluateLoan().
  */
  const dropdownLoanCapacity = (() => {
    const shareCapital = Number(formData.share_capital || 0);
    if (!shareCapital) return Infinity; // no restriction until share capital is known
    const memberClass = String(formData.member_class || 'NON-MIGS').toUpperCase();
    const multiplier = memberClass === 'MIGS' ? 5 : 3;
    if (isRenewal) {
      const balance = Number(existingLoan?.remainingBalance || 0);
      return ((shareCapital * multiplier) + balance + RENEWAL_DEDUCTIONS) / 2;
    }
    return shareCapital * multiplier;
  })();

  const isAmountAllowed = (amount) => Number(amount) <= dropdownLoanCapacity;

  useEffect(() => {
    const current = Number(formData.loan_amount_numeric || 0);
    if (current && current > dropdownLoanCapacity) {
      setFormData((prev) => ({ ...prev, loan_amount_numeric: '' }));
    }
  }, [dropdownLoanCapacity]);

  useEffect(() => {
    const principal = Number(formData.loan_amount_numeric || 0);
    const netPay = Number(formData.latest_net_pay || 0);
    const shareCapital = Number(formData.share_capital || 0);
    if (!principal || !netPay || !shareCapital) {
      setCalcResult(null);
      return;
    }
    if (isRenewal && !existingLoan) {
      setCalcResult(null);
      return;
    }
    evaluateLoan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.loan_amount_numeric, formData.latest_net_pay, formData.share_capital, formData.member_class, isRenewal, existingLoan]);

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
          member_class: profile.member_class ?? profile.class ?? prev.member_class,
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
    const principal = Number(formData.loan_amount_numeric || 0);
    const term = Number(formData.loan_term_months || 0);

    if (!principal || !term) {
      setFormData((prev) => ({ ...prev, monthly_amortization: '' }));
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const data = await computeLoan(buildConsolidatedPayload(formData));
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
  }, [formData.loan_amount_numeric, formData.loan_term_months]);

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
          </div>
        </section>

        {/*
          The Loan Eligibility Status card surfaces as soon as
          Share Capital and Latest Net Pay are filled — even before a
          loan amount is selected — so the member sees the 40% take-home
          threshold up front.
        */}
        {/*
          ============================================================
          PRE-FORM EVALUATION PANELS
          ------------------------------------------------------------
          These two cards sit between the New/Renewal toggle and Section 1
          (Borrower's Information). They are *result* surfaces only —
          all source values come from formData + Supabase fetches.

          UI clean-up tips:
          - Keep the outer wrapper width aligned with the form sections
            (max-w-6xl). Do not let these blocks exceed the form column.
          - Treat both cards as *status banners*: short, scannable, 1-screen.
            Use icons for PASS/FAIL/NOT MET instead of ✓/✕ glyphs if
            switching to lucide-react for visual consistency.
          - Color tokens: success uses the brand green (#66B538 / #E9F7DE),
            danger uses red-50/red-200/red-600. Avoid orange/yellow here so
            the Risk badge in the Evaluation Result remains the sole place
            for graded status colors.
          - When isRenewal is false the Renewal Eligibility card hides; the
            outer wrapper also hides if there is no calcResult, so the
            spacing under the New/Renewal bar collapses cleanly.
          ============================================================
        */}
        {(isRenewal || showEligibilityCard) && (
          <div className="mt-6 max-w-6xl mx-auto w-full px-4 grid gap-6">
            {/*
              Renewal Eligibility card
              - Visible only when application_type === 'Renewal'.
              - Shows the existing loan summary fetched from Supabase
                (loans + loan_payments) and whether the 6-month payment
                rule has been satisfied (or simulated via the override).
              - UI tip: the override button is a DEV/SIMULATION affordance.
                Hide it behind an env flag (import.meta.env.DEV) before
                shipping to production so members can't bypass the rule.
            */}
            {isRenewal && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h4 className="font-bold text-gray-800 mb-3">Renewal Eligibility</h4>
                {renewalError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-md px-4 py-3">
                    {renewalError}
                  </div>
                )}
                {existingLoan && (
                  <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-xs text-gray-700 grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-gray-500">Existing Loan</div>
                      <div className="font-semibold">{existingLoan.controlNumber}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-gray-500">Loan Amount</div>
                      <div className="font-semibold">₱{Number(existingLoan.loanAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-gray-500">Remaining Balance</div>
                      <div className="font-semibold">₱{Number(existingLoan.remainingBalance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-gray-500">Paid Months</div>
                      <div className="font-semibold">
                        {sixMonthOverride ? `${MIN_PAID_MONTHS_FOR_RENEWAL}+ (override)` : existingLoan.paidMonths}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-gray-500">6-Month Rule</div>
                      <div className={`font-bold ${sixMonthsPaid ? 'text-[#2E7D32]' : 'text-red-600'}`}>
                        {sixMonthsPaid ? 'PASSED' : 'NOT MET'}
                      </div>
                    </div>
                  </div>
                )}
                {existingLoan && !sixMonthsPaid && (
                  <button
                    type="button"
                    onClick={overrideSixMonthsPaid}
                    className="mt-3 text-xs border border-[#66B538] text-[#66B538] hover:bg-[#E9F7DE] font-bold px-4 py-1.5 rounded-md"
                  >
                    Simulate: Mark 6 months as paid
                  </button>
                )}
              </div>
            )}

            {/*
              Loan Eligibility Status card
              - Always rendered (for both New and Renewal) once a calc
                result exists. Purely informational — the gate logic
                lives in the `eligibilityFailed` flag that disables the
                Submit button at the bottom of the form.
              - Rule: Monthly Amortization < Take Home Pay × 0.40
              - UI tip: this card swaps tint based on PASS/FAIL. Keep the
                two states visually distinct but avoid heavy red — it
                shouldn't feel like an error page, just a guardrail.
              - Consider replacing the 3-stat grid with a single progress
                bar (amortization vs. 40% threshold) for a more intuitive
                read; the numeric stats can move into a tooltip.
            */}
            {showEligibilityCard && (
              <div className={`rounded-lg shadow-md border p-6 ${eligibilityCardData.eligibilityPass ? 'border-[#66B538] bg-[#E9F7DE]' : 'border-red-300 bg-red-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-gray-800">Loan Eligibility Status</h4>
                  <span className={`text-xs font-bold ${eligibilityCardData.eligibilityPass ? 'text-[#2E7D32]' : 'text-red-600'}`}>
                    {eligibilityCardData.eligibilityPass ? '✓ PASS' : '✕ FAIL'}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-gray-500">Monthly Amortization</div>
                    <div className="text-sm font-bold text-gray-800">
                      {eligibilityCardData.monthlyPayment > 0
                        ? `₱${Number(eligibilityCardData.monthlyPayment).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '— select a loan amount'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-gray-500">Take Home Pay × 40%</div>
                    <div className="text-sm font-bold text-gray-800">
                      ₱{Number(eligibilityCardData.takeHomeThreshold || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-gray-500">Take Home Pay</div>
                    <div className="text-sm font-bold text-gray-800">
                      ₱{Number(eligibilityCardData.takeHomePay || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-gray-600">
                  Rule: Monthly Amortization &lt; Take Home Pay × 0.40.
                  {!eligibilityCardData.eligibilityPass && (
                    <span className="block mt-1 text-red-600 font-semibold">
                      Eligibility failed — monthly amortization is at or above 40% of take-home pay. Submit Application is disabled.
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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
            <div><label className={labelStyles}>Date of Birth <span className="text-red-500">*</span></label><input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Age <span className="text-red-500">*</span></label><input type="number" name="age" value={formData.age} onChange={handleChange} className={inputStyles} required /></div>
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
                  {CONSOLIDATED_LOAN_AMOUNT_OPTIONS.map((amount) => {
                    const allowed = isAmountAllowed(amount);
                    return (
                      <option
                        key={amount}
                        value={amount}
                        disabled={!allowed}
                        style={!allowed ? { color: '#9ca3af' } : undefined}
                      >
                        {formatLoanAmountOption(amount)}{!allowed ? ' — exceeds capacity' : ''}
                      </option>
                    );
                  })}
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

            {/*
              ==========================================================
              LOAN CALCULATOR — Evaluation Result
              ----------------------------------------------------------
              Auto-runs whenever loan_amount_numeric, latest_net_pay,
              share_capital, member_class, application_type, or the
              fetched existingLoan changes. The Loan Input panel was
              removed by design — values flow in from the form fields
              that already exist above (loan amount selector, prefilled
              net pay & share capital, member class).

              Fields displayed:
              - Risk Level    → from stress_index_category (Supabase) +
                               threshold logic (safe / low / moderate /
                               high / extreme).
              - Suggested Term → shortest term in [12,24,36,48,60] whose
                                 stress index ≤ 35%.
              - Monthly Payment → P/term + P × 0.0083 (flat-add formula).
              - Stress Index   → (MA / Net Pay) × 100.
              - Loan Capacity  → ceiling-based max new loan a member can
                                avail.
              - Prescribed Loan Amount → Loan Capacity snapped down to
                                the nearest ₱5,000 step (matches the
                                amount selector grid).

              UI clean-up tips:
              - The dashed-green divider above the card visually anchors
                this as a "computed" block. If the surrounding section
                gets a card-style wrapper, drop the divider so it doesn't
                read as a nested separator.
              - Each metric currently uses a 10px label + 16px value. For
                accessibility, raise the label to 11–12px and ensure
                contrast ratio ≥ 4.5:1 on gray-500 text.
              - Group the bottom footnote (Debt Ceiling / Net Proceeds /
                Loan Capacity Formula) inside a collapsible "Show
                breakdown" disclosure to keep the card scannable.
              - Risk Level chip pulls its color from RISK_COLORS. Keep
                that mapping centralized — don't redefine colors inline
                inside this JSX.
              ==========================================================
            */}
            {calcResult && !calcResult.error && (
              <div className="mt-8 border-t-2 border-dashed border-[#66B538] pt-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-3xl">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-gray-800">Evaluation Result</h4>
                    <span className={`text-xs font-bold flex items-center gap-1 ${calcResult.eligible ? 'text-[#2E7D32]' : 'text-red-600'}`}>
                      {calcResult.eligible ? '✓ ELIGIBLE' : '✕ NOT ELIGIBLE'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-gray-500">Risk Level</div>
                      <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-bold ${calcResult.risk.color}`}>
                        {calcResult.risk.label}
                      </span>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-gray-500">Suggested Term</div>
                      <div className="text-base font-bold text-gray-800">{calcResult.suggestedTerm} months</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-gray-500">Monthly Payment</div>
                      <div className="text-base font-bold text-gray-800">
                        ₱{Number(calcResult.monthlyPayment || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-gray-500">Stress Index</div>
                      <div className="text-base font-bold text-gray-800">{calcResult.stressIndex.toFixed(2)}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-gray-500">Loan Capacity</div>
                      <div className="text-base font-bold text-[#2E7D32]">
                        ₱{Number(calcResult.loanCapacity || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-gray-500">Prescribed Loan Amount</div>
                      <div className="text-base font-bold text-[#2E7D32]">
                        ₱{Number(calcResult.prescribedLoanAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-600">
                    <div>
                      <strong>Debt Ceiling:</strong> ₱{Number(calcResult.maxAllowed || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {' '}({calcResult.memberClass} · {calcResult.multiplier}x Share Capital − Net Proceeds)
                    </div>
                    {calcResult.isRenewal && (
                      <div>
                        <strong>Loan Capacity Formula:</strong> (Share Capital × {calcResult.multiplier} + Existing Balance + Deductions) ÷ 2
                      </div>
                    )}
                    <div>
                      <strong>Net Proceeds:</strong> ₱{calcResult.netProceeds.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {calcResult.isRenewal && (
                        <span> (New Loan − Existing Active Balance ₱{calcResult.existingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} − Deductions)</span>
                      )}
                    </div>
                    {!calcResult.eligible && (
                      <div className="mt-2 text-red-600 font-semibold">
                        Loan amount exceeds the allowed debt ceiling. Submit Application is disabled.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

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
                  {CONSOLIDATED_LOAN_AMOUNT_OPTIONS.map((amount) => {
                    const allowed = isAmountAllowed(amount);
                    return (
                      <option
                        key={amount}
                        value={amount}
                        disabled={!allowed}
                        style={!allowed ? { color: '#9ca3af' } : undefined}
                      >
                        {formatLoanAmountOption(amount)}{!allowed ? ' — exceeds capacity' : ''}
                      </option>
                    );
                  })}
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
            disabled={loading || printing || exceedsCeiling || renewalBlocked || eligibilityFailed}
            title={
              exceedsCeiling ? 'Loan amount exceeds the allowed debt ceiling.' :
              renewalBlocked ? 'Renewal requires an existing active loan with at least 6 paid months.' :
              eligibilityFailed ? 'Monthly amortization must be below 40% of take-home pay.' : ''
            }
            className="bg-[#66B538] text-white px-6 py-2 rounded hover:bg-[#5aa12b] transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? "Processing..." : "Submit Application"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default Consolidated_Loan;