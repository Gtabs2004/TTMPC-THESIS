import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { createUniqueControlNumber, fetchLoanPrefill, submitUnifiedLoan } from './loanSubmission';
import { buildBonusPayload, computeLoan } from './loanComputeApi';
import { formatTinNumber, TIN_FORMATTED_MAX_LENGTH } from './tinFormat';

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

function Bonus_Loan() {
  const location = useLocation();
  const isNonMemberBonus = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('loanType')?.toUpperCase() === 'NONMEMBER_BONUS';
  }, [location.search]);

  const resolvedLoanTypeCode = isNonMemberBonus ? 'NONMEMBER_BONUS' : 'BONUS';

  const inputStyles = 'border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-[#66B538] outline-none w-full bg-white text-sm';
  const labelStyles = 'block text-xs font-bold text-gray-700 mb-1';
  const sectionHeader = 'bg-[#66B538] text-white px-4 py-2 rounded-t-lg flex items-center gap-2 font-bold uppercase tracking-wide';

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    application_type: 'New',
    control_no: createUniqueControlNumber(isNonMemberBonus ? 'NMBL' : 'BL'),
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

        setFormData((prev) => {
          const tinValue = profile.tin_number ?? profile.tin_no ?? prev.tin_no;
          const tinFormatted = formatTinNumber(tinValue);

          return {
          ...prev,
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

  useEffect(() => {
    const principal = Number(formData.loan_amount_numeric || 0);
    const term = Number(formData.loan_term_months || 0);

    if (!principal || !term) {
      setFormData((prev) => ({ ...prev, monthly_amortization: '' }));
      return;
    }

    const timer = setTimeout(async () => {
      try {
        // Bonus form in this flow is for members; use regular category.
        const data = await computeLoan(buildBonusPayload(formData, true));
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await submitUnifiedLoan({
        loanTypeCode: resolvedLoanTypeCode,
        targetTable: isNonMemberBonus ? 'koica_loans' : 'loans',
        controlNumber: formData.control_no,
        applicationStatus: 'pending',
        applicationType: formData.application_type,
        loanStatus: 'pending',
        applicationDate: formData.date_applied,
        loanAmount: formData.loan_amount_numeric,
        principalAmount: formData.loan_amount_numeric,
        interestRate: 2,
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
                civil_status: formData.civil_status || null,
                gender: formData.gender || null,
                tin_no: formData.tin_no || null,
                gsis_sss_no: formData.gsis_sss_no || null,
                employer_name: formData.employer_name || null,
                office_address: formData.office_address || null,
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

      alert('Bonus Loan Application Submitted Successfully!');
      window.location.reload();
    } catch (err) {
      alert('Submission Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 pb-20">
      <header className="w-full bg-[#E9F7DE] h-20 shadow-lg flex text-col px-6">
        <div className="flex flex-row items-center gap-4">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi-Purpose Cooperative</h1>
            <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <section className="grid gap-8 px-4">
          <h1 className="text-center text-xl font-bold mt-12 text-[#66B538]">BONUS LOAN APPLICATION</h1>
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
            <div><label className={labelStyles}>Surname *</label><input name="surname" value={formData.surname} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>First Name *</label><input name="first_name" value={formData.first_name} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Middle Name</label><input name="middle_name" value={formData.middle_name} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Contact No. *</label><input name="contact_no" value={formData.contact_no} onChange={handleChange} className={inputStyles} required /></div>
            {isNonMemberBonus ? (
              <div><label className={labelStyles}>Email Address</label><input type="email" name="user_email" value={formData.user_email} onChange={handleChange} className={inputStyles} /></div>
            ) : null}
            <div><label className={labelStyles}>Latest Net Pay *</label><input type="number" name="latest_net_pay" value={formData.latest_net_pay} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Share Capital *</label><input type="number" name="share_capital" value={formData.share_capital} onChange={handleChange} className={inputStyles} required /></div>
            <div className="md:col-span-3"><label className={labelStyles}>Residence Address *</label><input name="residence_address" value={formData.residence_address} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Date of Birth *</label><input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Age *</label><input type="number" name="age" value={formData.age} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Civil Status *</label><input name="civil_status" value={formData.civil_status} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Gender *</label><input name="gender" value={formData.gender} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>TIN No. *</label><input name="tin_no" value={formData.tin_no} onChange={handleChange} inputMode="numeric" maxLength={TIN_FORMATTED_MAX_LENGTH} placeholder="123-456-789-000" className={inputStyles} required /></div>
            <div><label className={labelStyles}>GSIS/SSS No. *</label><input name="gsis_sss_no" value={formData.gsis_sss_no} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Employer Name *</label><input name="employer_name" value={formData.employer_name} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Office Address *</label><input name="office_address" value={formData.office_address} onChange={handleChange} className={inputStyles} required /></div>
            {isMarriedCivilStatus ? (
              <>
                <div><label className={labelStyles}>Spouse Name *</label><input name="spouse_name" value={formData.spouse_name} onChange={handleChange} className={inputStyles} required /></div>
                <div><label className={labelStyles}>Spouse Occupation *</label><input name="spouse_occupation" value={formData.spouse_occupation} onChange={handleChange} className={inputStyles} required /></div>
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
                <span className="absolute left-3 text-gray-400 text-xs font-medium">Php</span>
                <input 
                  type="number" 
                  name="loan_amount_numeric" 
                  value={formData.loan_amount_numeric} 
                  onChange={handleChange}
                  className="border border-gray-300 rounded-md pl-10 pr-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all w-40" 
                />
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
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all mx-2 w-72 inline-block align-middle text-gray-600 truncate"
              >
                <option value="">Select Bonus Cycle</option>
                <option value="5">May Midyear Bonus (5 months)</option>
                <option value="11">Yearend Bonus November (11 months)</option>
              </select>
              months with a monthly amortization of
              <input 
                type="number" 
                name="monthly_amortization" 
                value={formData.monthly_amortization} 
                readOnly 
                className="border border-gray-300 rounded-md px-3 py-1.5 outline-none bg-gray-50 text-sm transition-all mx-2 w-48 inline-block align-middle cursor-not-allowed" 
              />
              , which I promise to pay the amount to <strong>Tubungan Teachers' Multi Purpose Cooperative</strong>
              
              <br />
              
              <span className="block mt-2 leading-normal">
                <strong>(TTMPC)</strong> in accordance with the terms and conditions as stipulated in the Promissory Note of which I certify to have read and understood clearly. I bind myself to pay out my monthly salary and/or other benefits the required monthly amortization here on or surrender my ATM to TTMPC.
              </span>
            </div>

          </div>
        </div>
       {/* Section 3: APPLICANTS AUTHORIZATION FOR SALARY DEDUCTION */}
        <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full mb-8">
          <div className={sectionHeader}>
            <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
            APPLICANTS AUTHORIZATION FOR SALARY DEDUCTION
          </div>
          <div className="p-8 text-sm text-gray-800">
            
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
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all mx-2 w-80 inline-block align-middle" 
              />
              
              <div className="inline-flex items-center relative mr-2 align-middle">
                <span className="absolute left-3 text-gray-400 text-xs font-medium">Php</span>
                <input 
                  type="number" 
                  name="bonus_amount_numeric" 
                  value={formData.bonus_amount_numeric} 
                  onChange={handleChange} 
                  className="border border-gray-300 rounded-md pl-10 pr-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all w-48" 
                />
              </div>
            </div>

            <p className="mt-6 text-gray-800">
              This authorization is irrevocable until my obligations as indicated above has been paid infull.
            </p>

          </div>
        </div>
       {/* Section 4: DEED OF ASSIGNMENT */}
        <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full mb-8">
          <div className={sectionHeader}>
            <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
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
                value={`${formData.first_name || ''} ${formData.middle_name || ''} ${formData.surname || ''}`.trim()} 
                readOnly 
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-gray-50 text-sm transition-all mx-2 w-[22rem] inline-block align-middle" 
              />
              of legal age, and an employee of
              <input 
                type="text" 
                name="employer_name" 
                value={formData.employer_name} 
                onChange={handleChange} 
                className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all mx-2 w-96 inline-block align-middle" 
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
                  className="border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all mx-2 w-64 inline-block align-middle" 
                />
                
                <div className="inline-flex items-center relative mr-2 align-middle">
                  <span className="absolute left-3 text-gray-400 text-xs font-medium">Php</span>
                  <input 
                    type="number" 
                    name="loan_amount_numeric" 
                    value={formData.loan_amount_numeric} 
                    onChange={handleChange} 
                    className="border border-gray-300 rounded-md pl-10 pr-3 py-1.5 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all w-40" 
                  />
                </div>
                
                with interest thereon at the rate of 2% per month, do hereby by these present, ASSIGN, TRANSFER and CONVEY into TTMPC, its successors and assign my salary/benefits corresponding to the amount of my loan inclusive of interest and surcharges.
              </span>
            </div>

          </div>
          <div className="p-8 pt-0">
            <button type="submit" disabled={loading} className="bg-[#66B538] text-white px-5 py-2 rounded hover:bg-[#5aa12b] transition-colors text-sm font-semibold disabled:opacity-50">
              {loading ? 'Processing...' : 'Submit Application'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default Bonus_Loan;
