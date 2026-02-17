import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; // Ensure this path is correct

// Function to generate control number: CL-YYYYMMDD-XXXX
const generateControlNumber = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = String(Math.floor(1000 + Math.random() * 9000)); // 4-digit random number
  return `CL-${year}${month}${day}-${random}`;
};

function Consolidated_Loan() {
  // Shared Styles (Unchanged)
  const inputStyles = "border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-[#66B538] outline-none w-full bg-white text-sm transition-all";
  const labelStyles = "block text-xs font-bold text-gray-700 mb-1";
  const sectionHeader = "bg-[#66B538] text-white px-4 py-2 rounded-t-lg flex items-center gap-2 font-bold uppercase tracking-wide";

  // 1. STATE LOGIC: Form Data State
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    application_status: 'New',
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
    loan_term_months: '',
    monthly_amortization: '',
    source_of_income: '',
    payment_start_date: '',
    user_email: '', // Section 4
    cm1_name: '', // Section 5
    cm1_id_no: '',
    cm1_address: '',
    cm1_email: '',
    cm1_mobile: '',
    cm2_name: '',
    cm2_id_no: '',
    cm2_address: '',
    cm2_email: '',
    cm2_mobile: '',
  });

  // 2. HANDLER: Update State
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // 3. LOGIC: Database Insertion
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Get the current logged-in user's data from Supabase Auth
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        alert("Please log in to submit a loan application.");
        setLoading(false);
        return;
      }

      // 2. Prepare submission data with proper type conversions
      const submissionData = {
        user_email: user.email,
        control_no: formData.control_no,
        application_status: formData.application_status,
        date_applied: formData.date_applied || null,
        
        // Borrower Information
        surname: formData.surname,
        first_name: formData.first_name,
        middle_name: formData.middle_name || null,
        contact_no: formData.contact_no,
        residence_address: formData.residence_address,
        date_of_birth: formData.date_of_birth || null,
        age: formData.age ? parseInt(formData.age) : null,
        civil_status: formData.civil_status || null,
        gender: formData.gender || null,
        tin_no: formData.tin_no || null,
        gsis_sss_no: formData.gsis_sss_no || null,

        // Financial/Employment
        latest_net_pay: formData.latest_net_pay ? parseFloat(formData.latest_net_pay) : null,
        share_capital: formData.share_capital ? parseFloat(formData.share_capital) : null,
        employer_name: formData.employer_name || null,
        office_address: formData.office_address || null,
        spouse_name: formData.spouse_name || null,
        spouse_occupation: formData.spouse_occupation || null,

        // Loan Details
        loan_amount_numeric: formData.loan_amount_numeric ? parseFloat(formData.loan_amount_numeric) : null,
        loan_amount_words: formData.loan_amount_words || null,
        loan_purpose: formData.loan_purpose || null,
        loan_term_months: formData.loan_term_months ? parseInt(formData.loan_term_months) : null,
        monthly_amortization: formData.monthly_amortization ? parseFloat(formData.monthly_amortization) : null,
        source_of_income: formData.source_of_income || null,
        payment_start_date: formData.payment_start_date || null,

        // Co-Maker 1
        cm1_name: formData.cm1_name || null,
        cm1_id_no: formData.cm1_id_no || null,
        cm1_address: formData.cm1_address || null,
        cm1_email: formData.cm1_email || null,
        cm1_mobile: formData.cm1_mobile || null,

        // Co-Maker 2
        cm2_name: formData.cm2_name || null,
        cm2_id_no: formData.cm2_id_no || null,
        cm2_address: formData.cm2_address || null,
        cm2_email: formData.cm2_email || null,
        cm2_mobile: formData.cm2_mobile || null,
      };

      // 3. Perform the insertion
      const { error } = await supabase
        .from('consolidated_loans')
        .insert([submissionData]);

      if (error) throw error;

      alert("Loan Application Submitted Successfully!");
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
                  <input type="radio" name="application_status" value="New" checked={formData.application_status === 'New'} onChange={handleChange} className="h-4 w-4 accent-[#66B538]" />
                  <span className="font-semibold text-gray-700">New</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="application_status" value="Renewal" checked={formData.application_status === 'Renewal'} onChange={handleChange} className="h-4 w-4 accent-[#66B538]" />
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
            <div><label className={labelStyles}>TIN No. <span className="text-red-500">*</span></label><input type="text" name="tin_no" value={formData.tin_no} onChange={handleChange} className={inputStyles} required /></div>
            <div><label className={labelStyles}>GSIS/SSS No. <span className="text-red-500">*</span></label><input type="text" name="gsis_sss_no" value={formData.gsis_sss_no} onChange={handleChange} className={inputStyles} required /></div>
            <div className="md:col-span-2"><label className={labelStyles}>Employer's Name <span className="text-red-500">*</span></label><input type="text" name="employer_name" value={formData.employer_name} onChange={handleChange} className={inputStyles} required /></div>
            <div className="md:col-span-1"><label className={labelStyles}>Office Address <span className="text-red-500">*</span></label><input type="text" name="office_address" value={formData.office_address} onChange={handleChange} className={inputStyles} required /></div>
            <div className="md:col-span-2"><label className={labelStyles}>Name of Spouse <span className="text-red-500">*</span></label><input type="text" name="spouse_name" value={formData.spouse_name} onChange={handleChange} className={inputStyles} /></div>
            <div className="md:col-span-1"><label className={labelStyles}>Spouse's Occupation <span className="text-red-500">*</span></label><input type="text" name="spouse_occupation" value={formData.spouse_occupation} onChange={handleChange} className={inputStyles} /></div>
          </div>
        </div>

        {/* Section 2: LOAN AGREEMENT */}
        <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}>
            <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
            LOAN AGREEMENT
          </div>
          <div className="p-8 text-sm text-gray-800 leading-relaxed">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span>I hereby apply for a loan in the amount of</span>
              <input type="text" name="loan_amount_words" value={formData.loan_amount_words} onChange={handleChange} className={`${inputStyles} flex-grow md:w-64`} placeholder="Amount in words" />
              <div className="relative w-40"><span className="absolute left-3 top-2 text-gray-400 text-xs">Php</span><input type="number" name="loan_amount_numeric" value={formData.loan_amount_numeric} onChange={handleChange} className={`${inputStyles} pl-10`} /></div>
              <span>for the purpose of</span>
              <input type="text" name="loan_purpose" value={formData.loan_purpose} onChange={handleChange} className={`${inputStyles} flex-grow md:w-64`} />
            </div>
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <span>for a term of</span>
              <select name="loan_term_months" value={formData.loan_term_months} onChange={handleChange} className={`${inputStyles} w-32`}><option value="">Select</option><option>12</option><option>24</option><option>36</option><option>48</option><option>60</option></select>
              <span>months with a monthly amortization of</span>
              <input type="number" name="monthly_amortization" value={formData.monthly_amortization} onChange={handleChange} className={`${inputStyles} w-48`} />
              <span>, which I promise to pay to <strong>Tubungan Teachers' MPC</strong>.</span>
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
            <div className="flex flex-wrap items-center gap-3 mb-6 leading-loose">
              <span>I, (Name of Borrower), promise to pay <strong>TTMPC</strong> from my</span>
              <input type="text" name="source_of_income" value={formData.source_of_income} onChange={handleChange} className={`${inputStyles} w-48`} placeholder="Source of Income" />
              <span>to begin on</span>
              <input type="date" name="payment_start_date" value={formData.payment_start_date} onChange={handleChange} className={`${inputStyles} w-40`} />
              <span>until fully paid.</span>
            </div>
            <p className="text-gray-700 italic text-xs mb-6 text-justify">
              I agree that should I resign or be terminated, the balance shall be paid through deduction, co-makers, or benefits.
            </p>
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
            <div><label className={labelStyles}>Mobile / Tel No. <span className="text-red-500">*</span></label><input type="text" name="mobile_tel_no" className={inputStyles} /></div>
          </div>
        </div>

        {/* Section 5: CO-MAKER'S OATH */}
        <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}>
            <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">5</span>
            CO-MAKER'S OATH
          </div>
          <div className="p-8 text-sm text-gray-800">
            {/* Co-Maker 1 */}
            <h3 className="font-bold text-[#66B538] mb-4 uppercase tracking-wide border-b border-gray-200 pb-2">Co-Maker 1</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div><label className={labelStyles}>Name</label><input type="text" name="cm1_name" value={formData.cm1_name} onChange={handleChange} className={inputStyles} /></div>
              <div><label className={labelStyles}>ID Number</label><input type="text" name="cm1_id_no" value={formData.cm1_id_no} onChange={handleChange} className={inputStyles} /></div>
              <div><label className={labelStyles}>Address</label><input type="text" name="cm1_address" value={formData.cm1_address} onChange={handleChange} className={inputStyles} /></div>
              <div><label className={labelStyles}>Email Address</label><input type="email" name="cm1_email" value={formData.cm1_email} onChange={handleChange} className={inputStyles} /></div>
              <div><label className={labelStyles}>Mobile No.</label><input type="text" name="cm1_mobile" value={formData.cm1_mobile} onChange={handleChange} className={inputStyles} /></div>
            </div>

            {/* Co-Maker 2 */}
            <h3 className="font-bold text-[#66B538] mb-4 uppercase tracking-wide border-b border-gray-200 pb-2">Co-Maker 2</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div><label className={labelStyles}>Name</label><input type="text" name="cm2_name" value={formData.cm2_name} onChange={handleChange} className={inputStyles} /></div>
              <div><label className={labelStyles}>ID Number</label><input type="text" name="cm2_id_no" value={formData.cm2_id_no} onChange={handleChange} className={inputStyles} /></div>
              <div><label className={labelStyles}>Address</label><input type="text" name="cm2_address" value={formData.cm2_address} onChange={handleChange} className={inputStyles} /></div>
              <div><label className={labelStyles}>Email Address</label><input type="email" name="cm2_email" value={formData.cm2_email} onChange={handleChange} className={inputStyles} /></div>
              <div><label className={labelStyles}>Mobile No.</label><input type="text" name="cm2_mobile" value={formData.cm2_mobile} onChange={handleChange} className={inputStyles} /></div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="mt-6 bg-[#66B538] text-white px-4 py-2 rounded hover:bg-[#5aa12b] transition-colors text-sm float-right mb-4 disabled:opacity-50"
            >
              {loading ? "Processing..." : "Submit Application"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default Consolidated_Loan;