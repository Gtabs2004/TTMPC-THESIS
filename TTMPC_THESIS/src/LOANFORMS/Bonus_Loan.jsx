import React, { useEffect, useState } from 'react';
import { fetchLoanPrefill, submitUnifiedLoan } from './loanSubmission';
import { buildBonusPayload, computeLoan } from './loanComputeApi';

const generateControlNumber = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = String(Math.floor(1000 + Math.random() * 9000));
  return `BL-${year}${month}${day}-${random}`;
};

function Bonus_Loan() {
  const inputStyles = 'border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-[#66B538] outline-none w-full bg-white text-sm';
  const labelStyles = 'block text-xs font-bold text-gray-700 mb-1';
  const sectionHeader = 'bg-[#66B538] text-white px-4 py-2 rounded-t-lg flex items-center gap-2 font-bold uppercase tracking-wide';

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    application_type: 'New',
    control_no: generateControlNumber(),
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
    loan_term_months: '',
    monthly_amortization: '',
    total_interest: '',
    source_of_income: '',
    payment_start_date: '',
    cm1_name: '',
    cm1_id_no: '',
    cm1_address: '',
    cm1_email: '',
    cm1_mobile: '',
    cm2_name: '',
    cm2_id_no: '',
    cm2_address: '',
    cm2_email: '',
    cm2_mobile: '',
    bonus_amount_words: '',
    bonus_amount_numeric: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name === 'bonus_amount_numeric') {
        return {
          ...prev,
          bonus_amount_numeric: value,
          loan_amount_numeric: value,
        };
      }

      return { ...prev, [name]: value };
    });
  };

  useEffect(() => {
    let isMounted = true;

    const loadPrefill = async () => {
      try {
        const { userEmail, profile } = await fetchLoanPrefill();
        if (!isMounted) return;

        if (!profile) {
          return;
        }

        setFormData((prev) => ({
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
          tin_no: profile.tin_number ?? profile.tin_no ?? prev.tin_no,
          gsis_sss_no: profile.gsis_sss_no ?? prev.gsis_sss_no,
          employer_name: profile.employer_name ?? profile.occupation ?? prev.employer_name,
          office_address: profile.office_address ?? prev.office_address,
          spouse_name: profile.spouse_name ?? prev.spouse_name,
          spouse_occupation: profile.spouse_occupation ?? prev.spouse_occupation,
          latest_net_pay: (profile.latest_net_pay ?? profile.annual_income)?.toString() ?? prev.latest_net_pay,
          share_capital: profile.share_capital?.toString() ?? prev.share_capital,
        }));

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
  }, []);

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
        loanTypeCode: 'BONUS',
        controlNumber: formData.control_no,
        applicationStatus: 'pending',
        applicationType: formData.application_type,
        loanStatus: 'pending',
        applicationDate: formData.date_applied,
        loanAmount: formData.loan_amount_numeric,
        principalAmount: formData.loan_amount_numeric,
        interestRate: 2,
        term: formData.loan_term_months,
        optionalFields: {
          total_interest: formData.total_interest || null,
          loan_amount_words: formData.loan_amount_words || null,
          loan_purpose: formData.loan_purpose || null,
          monthly_amortization: formData.monthly_amortization || null,
          source_of_income: formData.source_of_income || null,
          payment_start_date: formData.payment_start_date || null,
          bonus_amount_words: formData.bonus_amount_words || null,
          bonus_amount_numeric: formData.bonus_amount_numeric || null,
        },
        coMakers: [
          {
            email: formData.cm1_email,
            name: formData.cm1_name,
            id_no: formData.cm1_id_no,
            address: formData.cm1_address,
            mobile: formData.cm1_mobile,
            liability_status: 'active',
          },
          {
            email: formData.cm2_email,
            name: formData.cm2_name,
            id_no: formData.cm2_id_no,
            address: formData.cm2_address,
            mobile: formData.cm2_mobile,
            liability_status: 'active',
          },
        ],
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
            <div><label className={labelStyles}>Latest Net Pay *</label><input type="number" name="latest_net_pay" value={formData.latest_net_pay} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Share Capital *</label><input type="number" name="share_capital" value={formData.share_capital} onChange={handleChange} className={inputStyles} required /></div>
            <div className="md:col-span-3"><label className={labelStyles}>Residence Address *</label><input name="residence_address" value={formData.residence_address} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Date of Birth *</label><input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Age *</label><input type="number" name="age" value={formData.age} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Civil Status *</label><input name="civil_status" value={formData.civil_status} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Gender *</label><input name="gender" value={formData.gender} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>TIN No. *</label><input name="tin_no" value={formData.tin_no} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>GSIS/SSS No. *</label><input name="gsis_sss_no" value={formData.gsis_sss_no} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Employer Name *</label><input name="employer_name" value={formData.employer_name} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Office Address *</label><input name="office_address" value={formData.office_address} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>Spouse Name</label><input name="spouse_name" value={formData.spouse_name} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Spouse Occupation</label><input name="spouse_occupation" value={formData.spouse_occupation} onChange={handleChange} className={inputStyles} /></div>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}><span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span> LOAN DETAILS</div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div><label className={labelStyles}>Loan Amount (Words)</label><input name="loan_amount_words" value={formData.loan_amount_words} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Loan Amount (Numeric)</label><input type="number" name="loan_amount_numeric" value={formData.loan_amount_numeric} readOnly className={`${inputStyles} bg-gray-100 cursor-not-allowed`} /></div>
            <div><label className={labelStyles}>Loan Purpose</label><input name="loan_purpose" value={formData.loan_purpose} onChange={handleChange} className={inputStyles} /></div>
            <div>
              <label className={labelStyles}>Term (Months)</label>
              <select name="loan_term_months" value={formData.loan_term_months} onChange={handleChange} className={inputStyles}>
                <option value="">Select Bonus Cycle</option>
                <option value="5">May Midyear Bonus (5 months)</option>
                <option value="11">Yearend Bonus November (11 months)</option>
              </select>
            </div>
            <div><label className={labelStyles}>Monthly Amortization</label><input type="number" name="monthly_amortization" value={formData.monthly_amortization} readOnly className={`${inputStyles} bg-gray-100 cursor-not-allowed`} /></div>
            <div><label className={labelStyles}>Source of Income</label><input name="source_of_income" value={formData.source_of_income} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Payment Start Date</label><input type="date" name="payment_start_date" value={formData.payment_start_date} onChange={handleChange} className={inputStyles} /></div>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}><span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span> BONUS AUTHORIZATION</div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><label className={labelStyles}>Bonus Amount (Words)</label><input name="bonus_amount_words" value={formData.bonus_amount_words} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Bonus Amount (Numeric)</label><input type="number" name="bonus_amount_numeric" value={formData.bonus_amount_numeric} onChange={handleChange} className={inputStyles} /></div>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}><span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span> CO-MAKERS</div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><label className={labelStyles}>Co-Maker 1 Name</label><input name="cm1_name" value={formData.cm1_name} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Co-Maker 1 ID No.</label><input name="cm1_id_no" value={formData.cm1_id_no} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Co-Maker 1 Address</label><input name="cm1_address" value={formData.cm1_address} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Co-Maker 1 Email</label><input type="email" name="cm1_email" value={formData.cm1_email} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Co-Maker 1 Mobile</label><input name="cm1_mobile" value={formData.cm1_mobile} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Co-Maker 2 Name</label><input name="cm2_name" value={formData.cm2_name} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Co-Maker 2 ID No.</label><input name="cm2_id_no" value={formData.cm2_id_no} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Co-Maker 2 Address</label><input name="cm2_address" value={formData.cm2_address} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Co-Maker 2 Email</label><input type="email" name="cm2_email" value={formData.cm2_email} onChange={handleChange} className={inputStyles} /></div>
            <div><label className={labelStyles}>Co-Maker 2 Mobile</label><input name="cm2_mobile" value={formData.cm2_mobile} onChange={handleChange} className={inputStyles} /></div>
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
