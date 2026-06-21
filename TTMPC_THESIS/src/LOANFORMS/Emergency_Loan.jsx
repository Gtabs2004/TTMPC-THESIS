import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchLoanPrefill, submitUnifiedLoan } from './loanSubmission';
import { buildEmergencyPayload, computeLoan } from './loanComputeApi';
import { formatTinNumber, TIN_FORMATTED_MAX_LENGTH } from './tinFormat';
import { supabase } from '../supabaseClient';
import { resolveAccountFromSessionUser } from '../utils/sessionIdentity';

const generateControlNumber = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = String(Math.floor(1000 + Math.random() * 9000));
  return `EL-${year}${month}${day}-${random}`;
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


function Emergency_Loan() {
  const navigate = useNavigate();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
  const PDF_PREVIEW_WINDOW_NAME = 'emergency-loan-preview';
  const inputStyles = 'border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-[#66B538] outline-none w-full bg-white text-sm transition-all';
  const readOnlyInputStyles = 'border border-gray-300 rounded-md px-3 py-2 outline-none w-full bg-gray-100 text-sm text-gray-700 cursor-not-allowed';
  const labelStyles = 'block text-xs font-bold text-gray-700 mb-1';
  const sectionHeader = 'bg-[#66B538] text-white px-4 py-2 rounded-t-lg flex items-center gap-2 font-bold uppercase tracking-wide';

  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
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
    payment_start_date: '',
    user_email: '',
    member_class: 'NON-MIGS',
    borrower_id_type: '',
    borrower_id_number: '',
  });

  const [calcResult, setCalcResult] = useState(null);
  const [existingLoan, setExistingLoan] = useState(null);
  const [amortizationSchedule, setAmortizationSchedule] = useState([]);
  const [renewalError, setRenewalError] = useState('');
  const [sixMonthOverride, setSixMonthOverride] = useState(false);

  const isRenewal = String(formData.application_type || '').toLowerCase() === 'renewal';
  const MIN_PAID_MONTHS_FOR_RENEWAL = 6;
  const TERM_OPTIONS = [6, 12];
  const STRESS_INDEX_CEILING = 40;
  const EMERGENCY_LOAN_AMOUNT_OPTIONS = ['10000', '20000'];
  const MONTHLY_INTEREST_FACTOR = 0.02;

  const RISK_COLORS = {
    safe: 'text-[#2E7D32] bg-[#E9F7DE]',
    low_risk: 'text-yellow-700 bg-yellow-100',
    moderate_risk: 'text-orange-600 bg-orange-100',
    high_risk: 'text-red-600 bg-red-100',
  };

  const generateAmortizationSchedule = (loanAmount, term) => {
    const loanAmountNum = parseFloat(loanAmount);
    const termNum = parseInt(term, 10);

    if (!loanAmountNum || !termNum || loanAmountNum <= 0 || termNum <= 0) {
        return [];
    }

    const interestRate = 0.02; // 2% monthly
    const schedule = [];

    let balanceInCents = Math.round(loanAmountNum * 100);
    const totalPrincipalInCents = balanceInCents;
    
    // Per prompt: principal is rounded to 2 decimal places for months 1 to N-1
    const monthlyPrincipalInCents = Math.round(totalPrincipalInCents / termNum);
    let accumulatedPrincipalInCents = 0;

    for (let month = 1; month <= termNum; month++) {
        const startingBalanceInCents = balanceInCents;

        let principalPaidInCents;
        if (month < termNum) {
            principalPaidInCents = monthlyPrincipalInCents;
        } else {
            // Final month's principal is a "cleanup" to ensure the balance is exactly zero
            principalPaidInCents = totalPrincipalInCents - accumulatedPrincipalInCents;
        }
        
        const endingBalanceInCents = startingBalanceInCents - principalPaidInCents;
        
        // Per policy: Interest is calculated on the balance AFTER the principal payment for the month.
        const interestPaidInCents = Math.round(endingBalanceInCents * interestRate);
        const totalPaymentInCents = principalPaidInCents + interestPaidInCents;
        
        balanceInCents = endingBalanceInCents; // Update balance for next iteration
        accumulatedPrincipalInCents += principalPaidInCents;

        schedule.push({ month, startingBalance: startingBalanceInCents / 100, principalPaid: principalPaidInCents / 100, interestPaid: interestPaidInCents / 100, totalPayment: totalPaymentInCents / 100, remainingBalance: balanceInCents / 100 });
    }
    return schedule;
  };

  useEffect(() => {
    const principal = Number(formData.loan_amount_numeric || 0);
    const term = Number(formData.loan_term_months || 0);

    if (!principal || !term || principal > 20000 || (term !== 6 && term !== 12)) {
      setFormData((prev) => ({ ...prev, monthly_amortization: '', total_interest: '' }));
      setAmortizationSchedule([]);
      return;
    }

    let cancelled = false;

    const applyBackendBreakdown = (rows, monthlyAmortization, totalInterest) => {
      if (cancelled) return;
      let balance = Number(principal);
      const schedule = rows.map((row, index) => {
        const principalPaid = Number(row.principal_component || 0);
        const interestPaid = Number(row.interest_component || 0);
        const totalPayment = Number(row.expected_amount || principalPaid + interestPaid);
        const startingBalance = balance;
        balance = Math.max(0, balance - principalPaid);
        if (index === rows.length - 1 && Math.abs(balance) < 0.01) balance = 0;
        return {
          month: row.installment_no ?? index + 1,
          startingBalance,
          principalPaid,
          interestPaid,
          totalPayment,
          remainingBalance: balance,
        };
      });
      setAmortizationSchedule(schedule);
      setFormData((prev) => ({
        ...prev,
        monthly_amortization: String(Number(monthlyAmortization || 0)),
        total_interest: Number(totalInterest || 0).toFixed(2),
      }));
    };

    (async () => {
      try {
        const payload = buildEmergencyPayload({
          loan_amount_numeric: principal,
          loan_term_months: term,
          payment_start_date: formData.payment_start_date || null,
        });
        const result = await computeLoan(payload);
        if (cancelled) return;
        const rows = result?.monthly_breakdown || result?.data?.monthly_breakdown || [];
        if (Array.isArray(rows) && rows.length === term) {
          applyBackendBreakdown(
            rows,
            result.monthly_amortization ?? result.data?.monthly_amortization,
            result.total_interest ?? result.data?.total_interest,
          );
          return;
        }
        throw new Error('Empty or mismatched breakdown from compute service.');
      } catch (_err) {
        if (cancelled) return;
        const schedule = generateAmortizationSchedule(principal, term);
        setAmortizationSchedule(schedule);
        if (schedule.length > 0) {
          const firstMonthPayment = schedule[0].totalPayment;
          const totalInterest = schedule.reduce((acc, row) => acc + row.interestPaid, 0);
          setFormData((prev) => ({
            ...prev,
            monthly_amortization: String(firstMonthPayment),
            total_interest: String(totalInterest.toFixed(2)),
          }));
        } else {
          setFormData((prev) => ({ ...prev, monthly_amortization: '', total_interest: '' }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [formData.loan_amount_numeric, formData.loan_term_months, formData.payment_start_date]);

  const classifyRisk = (rawStressPct) => {
    const safeNumber = Number.isFinite(rawStressPct) ? rawStressPct : 0;
    let code = 'safe';
    if (safeNumber > 40) code = 'high_risk';
    else if (safeNumber >= 36) code = 'moderate_risk';
    else if (safeNumber > 20) code = 'low_risk';
    else if (safeNumber >= 20) code = 'low_risk';

    const fallbackLabels = {
      safe: 'Safe',
      low_risk: 'Low Risk',
      moderate_risk: 'Moderate Risk',
      high_risk: 'High Risk',
    };

    return {
      code,
      label: fallbackLabels[code].toUpperCase(),
      color: RISK_COLORS[code],
      rawStressPct: safeNumber,
      cappedStressPct: Math.min(safeNumber, STRESS_INDEX_CEILING),
      overCap: safeNumber > STRESS_INDEX_CEILING,
    };
  };

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
        if (!user) {
          if (isMounted) setRenewalError('Please sign in to apply for renewal.');
          return;
        }

        const account = await resolveAccountFromSessionUser(user);
        const memberId = account?.user_id || account?.auth_user_id || user.id;

        const { data: loanRows, error } = await supabase
          .from('loans')
          .select('control_number, principal_amount, loan_amount, monthly_amortization, term, application_date, loan_status, member_id')
          .eq('member_id', memberId)
          .order('application_date', { ascending: false });

        if (!isMounted) return;
        if (error) {
          setRenewalError(error.message);
          return;
        }

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

          if (payErr) {
            setRenewalError(payErr.message);
            return;
          }

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
        const monthsPaidByPayments = monthly > 0 ? Math.floor(Number(active.paid || 0) / monthly) : 0;
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

  const sixMonthsPaid = sixMonthOverride || (existingLoan?.paidMonths ?? 0) >= MIN_PAID_MONTHS_FOR_RENEWAL;
  const simulatedRemainingBalance = (() => {
    const balance = Number(existingLoan?.remainingBalance || 0);
    const monthly = Number(existingLoan?.monthlyAmortization || 0);
    if (!sixMonthOverride || monthly <= 0) return balance;
    return Math.max(balance - (monthly * MIN_PAID_MONTHS_FOR_RENEWAL), 0);
  })();

  const evaluateLoan = () => {
    const principal = Number(formData.loan_amount_numeric || 0);
    const netPay = Number(formData.latest_net_pay || 0);
    const shareCapital = Number(formData.share_capital || 0);
    const memberClass = String(formData.member_class || 'NON-MIGS').toUpperCase();
    const term = Number(formData.loan_term_months || 0);

    if (!principal || !netPay || !shareCapital || !term) {
      setCalcResult({ error: 'Please complete Loan Amount, Term, Share Capital, and Latest Net Pay.' });
      return;
    }

    if (isRenewal && !existingLoan) {
      setCalcResult({ error: 'Renewal requires an existing active loan and verification.' });
      return;
    }

    const multiplier = memberClass === 'MIGS' ? 5 : 3;
    const existingBalance = isRenewal ? Number(simulatedRemainingBalance || 0) : 0;
    const maxAllowed = (shareCapital * multiplier) - existingBalance;
    const eligible = principal <= maxAllowed;
    const loanCapacity = isRenewal
      ? Math.max(((shareCapital * multiplier) + existingBalance) / 2, 0)
      : Math.max(shareCapital * multiplier, 0);

    const monthlyPayment = Number(formData.monthly_amortization || 0); // Rely on backend for amortization
    const stress = netPay > 0 ? (monthlyPayment / netPay) * 100 : 0;
    const eligibilityPass = monthlyPayment < netPay * 0.40;

    setCalcResult({
      eligible,
      maxAllowed,
      multiplier,
      memberClass,
      monthlyPayment,
      stressIndex: stress,
      stressIndexOverCap: stress > STRESS_INDEX_CEILING,
      risk: classifyRisk(stress),
      netProceeds: 0,
      existingBalance,
      isRenewal,
      loanCapacity,
      takeHomePay: netPay,
      takeHomeThreshold: netPay * 0.40,
      eligibilityPass,
    });
  };

  useEffect(() => {
    const principal = Number(formData.loan_amount_numeric || 0);
    const netPay = Number(formData.latest_net_pay || 0);
    const shareCapital = Number(formData.share_capital || 0);
    const term = Number(formData.loan_term_months || 0);
    if (!principal || !netPay || !shareCapital || !term) {
      setCalcResult(null);
      return;
    }

    evaluateLoan();
  }, [formData.loan_amount_numeric, formData.latest_net_pay, formData.share_capital, formData.member_class, formData.loan_term_months, isRenewal, existingLoan]);

  const exceedsCeiling = calcResult && !calcResult.error && !calcResult.eligible;
  const renewalBlocked = isRenewal && (!existingLoan || !sixMonthsPaid);
  const eligibilityFailed = calcResult && !calcResult.error && calcResult.eligibilityPass === false;
  const actualMonthlyAmortization = Number(formData.monthly_amortization || 0) || 0;
  const hasComputedAmortization = actualMonthlyAmortization > 0;
  const actualNetPay = Number(formData.latest_net_pay || 0);
  const actualStressIndex = actualNetPay > 0 ? (actualMonthlyAmortization / actualNetPay) * 100 : 0;
  const stressIndexExceeded = actualNetPay > 0 && actualMonthlyAmortization > 0 && actualStressIndex > STRESS_INDEX_CEILING;
  const submissionBlockMessage =
    stressIndexExceeded ? 'Monthly amortization exceeds latest net pay.' :
    exceedsCeiling ? 'Loan amount exceeds the allowed debt ceiling.' :
    renewalBlocked ? 'Renewal requires an existing active loan with at least 6 paid months.' :
    eligibilityFailed ? 'Monthly amortization must be below 40% of take-home pay.' : '';

  const formatCurrency = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';
    return numeric.toLocaleString('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

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

  const isMarriedCivilStatus = String(formData.civil_status || '').trim().toLowerCase() === 'married';

  const handlePrintPdf = async () => {
    setPrinting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/loans/emergency/print-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/pdf',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.detail || errorBody?.message || 'Unable to generate the emergency loan PDF.');
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

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const principal = Number(formData.loan_amount_numeric || 0);
    if (principal > 20000) {
      alert('Emergency loan maximum amount is 20,000.');
      return;
    }

    if (submissionBlockMessage) {
      alert(submissionBlockMessage);
      return;
    }

    if (submissionBlockMessage) {
      alert(submissionBlockMessage);
      return;
    }

    if (formData.loan_amount_numeric && formData.loan_term_months) {
      const schedule = generateAmortizationSchedule(formData.loan_amount_numeric, formData.loan_term_months);
      setAmortizationSchedule(schedule);
    }

    setShowSummary(true);
  };

  const handleConfirmSubmit = async () => {
    setLoading(true);
    try {
      await submitUnifiedLoan({
        loanTypeCode: 'EMERGENCY',
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
          latest_net_pay: formData.latest_net_pay || null,
          share_capital: formData.share_capital || null,
          payment_start_date: formData.payment_start_date || null,
          emergency_reason: formData.loan_purpose || null,
          emergency_notes: null,
        },
      });

      alert('Emergency Loan Application Submitted Successfully!');
      window.location.reload();
    } catch (err) {
      console.error('Emergency Loan Submission Error:', err);
      alert('Submission Error: ' + (err.message || JSON.stringify(err)));
    } finally {
      setLoading(false);
      setShowSummary(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 pb-20">
      <header className="w-full bg-[#E9F7DE] h-20 shadow-lg flex text-col px-6">
        <div className="flex flex-row items-center justify-between w-full gap-4">
          <div className="flex flex-row items-center gap-4">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi-Purpose Cooperative</h1>
            <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
          </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/member-apply-loans')}
            className="rounded-lg bg-white px-4 py-2 text-xs font-bold text-[#1D6021] shadow-sm border border-[#D5EDB9] hover:bg-[#F4FBF0]"
          >
            Back to Member Portal
          </button>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <section className="grid gap-8 px-4">
          <h1 className="text-center text-2xl font-bold mt-12 text-[#66B538]">EMERGENCY LOAN APPLICATION</h1>
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

        <div className="mt-10 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}><span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span> BORROWER'S INFORMATION</div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div><label className={labelStyles}>Surname *</label><input name="surname" value={formData.surname} readOnly className={readOnlyInputStyles} required /></div>
            <div><label className={labelStyles}>First Name *</label><input name="first_name" value={formData.first_name} readOnly className={readOnlyInputStyles} required /></div>
            <div><label className={labelStyles}>Middle Name</label><input name="middle_name" value={formData.middle_name} readOnly className={readOnlyInputStyles} /></div>
            <div><label className={labelStyles}>Contact No. *</label><input name="contact_no" value={formData.contact_no} readOnly className={readOnlyInputStyles} required /></div>
            <div><label className={labelStyles}>Latest Net Pay *</label><input type="number" name="latest_net_pay" value={formData.latest_net_pay} readOnly className={readOnlyInputStyles} required /></div>
            <div><label className={labelStyles}>Share Capital *</label><input type="number" name="share_capital" value={formData.share_capital} readOnly className={readOnlyInputStyles} required /></div>
            <div className="md:col-span-3"><label className={labelStyles}>Residence Address *</label><input name="residence_address" value={formData.residence_address} readOnly className={readOnlyInputStyles} required /></div>
            <div><label className={labelStyles}>Date of Birth *</label><input type="date" name="date_of_birth" value={formData.date_of_birth} readOnly className={readOnlyInputStyles} required /></div>
            <div><label className={labelStyles}>Age *</label><input type="number" name="age" value={formData.age} readOnly className={readOnlyInputStyles} required /></div>
            <div><label className={labelStyles}>Civil Status *</label><input name="civil_status" value={formData.civil_status} readOnly className={readOnlyInputStyles} required /></div>
            <div><label className={labelStyles}>Gender *</label><input name="gender" value={formData.gender} readOnly className={readOnlyInputStyles} required /></div>
            <div><label className={labelStyles}>TIN No. *</label><input name="tin_no" value={formData.tin_no} readOnly inputMode="numeric" maxLength={TIN_FORMATTED_MAX_LENGTH} placeholder="123-456-789-000" className={readOnlyInputStyles} required /></div>
            <div><label className={labelStyles}>GSIS/SSS No. *</label><input name="gsis_sss_no" value={formData.gsis_sss_no} readOnly className={readOnlyInputStyles} required /></div>
            <div><label className={labelStyles}>Employer Name *</label><input name="employer_name" value={formData.employer_name} readOnly className={readOnlyInputStyles} required /></div>
            <div><label className={labelStyles}>Office Address *</label><input name="office_address" value={formData.office_address} onChange={handleChange} className={inputStyles} required /></div>
            {isMarriedCivilStatus ? (
              <>
                <div><label className={labelStyles}>Spouse Name *</label><input name="spouse_name" value={formData.spouse_name} readOnly className={readOnlyInputStyles} required /></div>
                <div><label className={labelStyles}>Spouse Occupation *</label><input name="spouse_occupation" value={formData.spouse_occupation} readOnly className={readOnlyInputStyles} required /></div>
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
                readOnly 
                className="border border-gray-300 rounded-md px-3 py-1.5 outline-none bg-gray-100 text-sm transition-all mx-2 w-[22rem] inline-block align-middle" 
              />
              <div className="inline-flex items-center relative mr-2 align-middle">
                <span className="absolute left-3 text-gray-400 text-xs font-medium">Php</span>
                <select
                  name="loan_amount_numeric"
                  value={formData.loan_amount_numeric}
                  onChange={handleChange}
                  className="border border-gray-300 rounded-md pl-10 pr-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all w-40"
                >
                  <option value="">Select</option>
                  {EMERGENCY_LOAN_AMOUNT_OPTIONS.map((amount) => (
                    <option key={amount} value={amount}>
                      {Number(amount).toLocaleString('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
                {TERM_OPTIONS.map(term => <option key={term} value={term}>{term} months</option>)}
              </select> months
              , which I promise to pay the amount to <strong>Tubungan Teachers' Multi Purpose Cooperative</strong>
              
              <br />
              
              <span className="block mt-2 leading-normal">
                <strong>(TTMPC)</strong> in accordance with the terms and conditions as stipulated in the Promissory Note of which I certify to have read and understood clearly. I bind myself to pay out my monthly salary and/or other benefits the required monthly amortization here on or surrender my ATM to TTMPC.
              </span>
            </div>

          </div>
        </div>

        {/* --- AMORTIZATION SCHEDULE & SUMMARY (MOVED FROM MODAL) --- */}
        {amortizationSchedule.length > 0 && (
          <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full animate-in fade-in duration-500">
            <div className="bg-green-50 px-6 py-4 border-b border-green-200">
              <h2 className="text-lg font-bold text-green-800">Loan Breakdown & Amortization Schedule</h2>
            </div>
            <div className="p-6 text-sm text-gray-700">
              {(() => {
                const loanAmount = parseFloat(formData.loan_amount_numeric) || 0;
                const serviceFee = 100;
                const cbu = loanAmount * 0.02;
                const netProceeds = loanAmount - serviceFee - cbu;

                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-center">
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">Loan Amount</p>
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(loanAmount)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">Service Fee</p>
                        <p className="text-lg font-bold text-red-600">- {formatCurrency(serviceFee)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">Capital Build-Up</p>
                        <p className="text-lg font-bold text-red-600">- {formatCurrency(cbu)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">Net Proceeds</p>
                        <p className="text-lg font-bold text-green-700">{formatCurrency(netProceeds)}</p>
                      </div>
                    </div>

                    <h3 className="text-md font-bold text-gray-800 mb-3 text-center">{formData.loan_term_months}-Month Amortization Schedule</h3>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200 text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Month</th>
                            <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Starting Balance</th>
                            <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Principal</th>
                            <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Interest</th>
                            <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Total Payment</th>
                            <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Remaining Balance</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {amortizationSchedule.map((row) => (
                            <tr key={row.month}>
                              <td className="px-4 py-2 whitespace-nowrap font-medium text-gray-900">{row.month}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-right text-gray-600">{formatCurrency(row.startingBalance)}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-right text-gray-600">{formatCurrency(row.principalPaid)}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-right text-red-600">{formatCurrency(row.interestPaid)}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-right font-bold text-gray-900">{formatCurrency(row.totalPayment)}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-right font-semibold text-blue-600">{formatCurrency(row.remainingBalance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

         <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full mb-8">
          <div className={sectionHeader}>
            <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
            DEED OF ASSIGNMENT
          </div>
          <div className="p-8 text-sm text-gray-800">
            
            <p className="font-bold mb-6 text-gray-900 uppercase tracking-wide">
              KNOW ALL MEN OF THESE PRESENTS:
            </p>
            
            <div className="leading-[3.5rem]">
              I,
              <input 
                type="text" 
                name="borrower_name" 
                value={`${formData.first_name} ${formData.middle_name} ${formData.surname}`.trim()} 
                readOnly 
                className="border border-gray-300 rounded-md px-3 py-1.5 outline-none bg-gray-50 text-sm transition-all mx-2 w-[22rem] inline-block align-middle" 
              />
              of legal age, and an employee of
              <input 
                type="text" 
                name="employer_name" 
                value={formData.employer_name} 
                readOnly 
                className="border border-gray-300 rounded-md px-3 py-1.5 outline-none bg-gray-100 text-sm text-gray-700 transition-all mx-2 w-96 inline-block align-middle" 
              />
              Tubungan, Iloilo.
              
              <br className="hidden xl:block" />
              <div className="h-4"></div> {/* Spacer for vertical rhythm */}
              
              <span className="leading-loose block mt-2 text-justify">
                For and in consideration of my loan with <strong>Tubungan Teachers' Multi Purpose Cooperative (TTMPC)</strong> in the amount of
                
                <input 
                  type="text" 
                  name="loan_amount_words" 
                  value={formData.loan_amount_words} 
                  onChange={handleChange} 
                  className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all mx-2 w-64 inline-block align-middle" 
                />
                
                <div className="inline-flex items-center relative mr-2 align-middle">
                  <span className="absolute left-3 text-gray-400 text-xs font-medium">Php</span>
                  <input 
                    type="text" 
                    name="loan_amount_numeric" 
                    value={formData.loan_amount_numeric ? Number(formData.loan_amount_numeric).toLocaleString('en-PH', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 }) : ''} 
                    readOnly 
                    className="border border-gray-300 rounded-md pl-10 pr-3 py-1.5 outline-none bg-gray-100 text-sm transition-all w-40" 
                  />
                </div>
                
                with interest thereon at the rate of 2% per month, do hereby by these present, ASSIGN, TRANSFER and CONVEY into TTMPC, its successors and assign my salary/benefits corresponding to the amount of my loan inclusive of interest and surcharges.
              </span>
            </div>

          </div>
           <div className="p-8 pt-0 flex flex-wrap gap-3 justify-end">
            <button type="button" onClick={handlePrintPdf} disabled={printing || loading} className="bg-white border border-[#66B538] text-[#66B538] px-5 py-2 rounded hover:bg-[#EEF6F1] transition-colors text-sm font-semibold disabled:opacity-50 float-right mb-12">
              {printing ? 'Printing...' : 'Print PDF'}
            </button>
            <button type="submit" disabled={loading || printing} className="bg-[#66B538] text-white px-5 py-2 rounded hover:bg-[#5aa12b] transition-colors text-sm font-semibold disabled:opacity-50 float-right mb-12">
              {loading ? 'Processing...' : 'Submit Application'}
            </button>
          </div>
        </div>
       
        {showSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg rounded-lg bg-white shadow-xl border border-gray-200">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="text-lg font-bold text-gray-800">Loan Application Summary</h2>
                <button
                  type="button"
                  onClick={() => setShowSummary(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                  aria-label="Close summary"
                >
                  ×
                </button>
              </div>
              <div className="px-6 py-5 text-sm text-gray-700">
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Loan Amount</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(formData.loan_amount_numeric)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Term</span>
                    <span className="font-semibold text-gray-900">{formData.loan_term_months ? `${formData.loan_term_months} months` : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Interest Rate</span>
                    <span className="font-semibold text-gray-900">2% per month</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowSummary(false)}
                  className="border border-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-50 font-semibold"
                >
                  Edit Details
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={loading}
                  className="bg-[#66B538] text-white px-5 py-2 rounded hover:bg-[#5aa12b] transition-colors font-bold disabled:opacity-50"
                >
                  {loading ? 'Submitting...' : 'Confirm Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

export default Emergency_Loan;
