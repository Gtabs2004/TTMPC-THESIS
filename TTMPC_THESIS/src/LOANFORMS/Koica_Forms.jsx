import React, { useState } from 'react';
import { createUniqueControlNumber, submitUnifiedLoan } from './loanSubmission';

const Koica_Forms = () => {
  const inputStyles = 'border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-[#66B538] outline-none w-full bg-white text-sm transition-all';
  const labelStyles = 'block text-xs font-bold text-gray-700 mb-1';

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    application_type: 'new',
    control_no: createUniqueControlNumber('KO'),
    date_applied: new Date().toISOString().split('T')[0],
    surname: '',
    first_name: '',
    middle_name: '',
    contact_no: '',
    monthly_income: '',
    source_of_income: '',
    user_email: '',
    residence_address: '',
    loan_amount_words: '',
    loan_amount_numeric: '',
    loan_purpose: '',
    loan_term_months: '',
    monthly_amortization: '',
    payment_start_date: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await submitUnifiedLoan({
        loanTypeCode: 'KOICA',
        targetTable: 'koica_loans',
        controlNumber: formData.control_no,
        applicationStatus: 'pending',
        applicationType: formData.application_type,
        applicationDate: formData.date_applied,
        loanAmount: formData.loan_amount_numeric,
        principalAmount: formData.loan_amount_numeric,
        term: formData.loan_term_months,
        loanStatus: 'pending',
        requireMemberProfile: false,
        applicantProfile: {
          full_name: `${formData.first_name || ''} ${formData.middle_name || ''} ${formData.surname || ''}`.trim(),
          credentials: {
            surname: formData.surname || null,
            first_name: formData.first_name || null,
            middle_name: formData.middle_name || null,
            contact_no: formData.contact_no || null,
            source_of_income: formData.source_of_income || null,
            monthly_income: formData.monthly_income || null,
            residence_address: formData.residence_address || null,
          },
        },
        optionalFields: {
          loan_amount_words: formData.loan_amount_words || null,
          loan_purpose: formData.loan_purpose || null,
          monthly_amortization: formData.monthly_amortization || null,
          source_of_income: formData.source_of_income || null,
          user_email: formData.user_email || null,
          payment_start_date: formData.payment_start_date || null,
          residence_address: formData.residence_address || null,
          contact_number: formData.contact_no || null,
          borrower_surname: formData.surname || null,
          borrower_first_name: formData.first_name || null,
          borrower_middle_name: formData.middle_name || null,
          monthly_income: formData.monthly_income || null,
        },
      });

      alert('ABFF loan application submitted successfully.');
      setFormData((prev) => ({
        ...prev,
        control_no: createUniqueControlNumber('KO'),
      }));
    } catch (err) {
      alert(`Submission Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#F8F9FA] pb-20">
      <header className="w-full bg-[#f1fbe8] h-20 shadow-sm flex items-center px-6 border-b border-[#e5f4d8]">
        <div className="flex flex-row items-center gap-4">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-sm font-extrabold text-[#66B538] uppercase tracking-wide">Tubungan Teacher's Multi-Purpose Cooperative</h1>
            <p className="text-[#8bc766] text-xs font-medium">Loan Application Kiosk</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto w-full px-4 mt-12 space-y-8">
        <h1 className="text-center text-2xl font-black text-[#235347] tracking-wider mb-8 uppercase">ABFF Loan Application</h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className={labelStyles}>Application Type</label>
                <select name="application_type" value={formData.application_type} onChange={handleChange} className={inputStyles} required>
                  <option value="new">New</option>
                  <option value="renewal">Renewal</option>
                </select>
              </div>
              <div>
                <label className={labelStyles}>Control No.</label>
                <input type="text" name="control_no" value={formData.control_no} readOnly className={`${inputStyles} bg-gray-100 cursor-not-allowed`} />
              </div>
              <div>
                <label className={labelStyles}>Date Applied</label>
                <input type="date" name="date_applied" value={formData.date_applied} onChange={handleChange} className={inputStyles} required />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="font-bold text-[#235347] mb-4">Borrower Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div><label className={labelStyles}>Surname</label><input name="surname" value={formData.surname} onChange={handleChange} className={inputStyles} required /></div>
              <div><label className={labelStyles}>First Name</label><input name="first_name" value={formData.first_name} onChange={handleChange} className={inputStyles} required /></div>
              <div><label className={labelStyles}>Middle Name</label><input name="middle_name" value={formData.middle_name} onChange={handleChange} className={inputStyles} /></div>
              <div><label className={labelStyles}>Contact No.</label><input name="contact_no" value={formData.contact_no} onChange={handleChange} className={inputStyles} required /></div>
              <div><label className={labelStyles}>Monthly Income</label><input type="number" name="monthly_income" value={formData.monthly_income} onChange={handleChange} className={inputStyles} required /></div>
              <div><label className={labelStyles}>Source of Income</label><input name="source_of_income" value={formData.source_of_income} onChange={handleChange} className={inputStyles} required /></div>
              <div><label className={labelStyles}>Email Address</label><input type="email" name="user_email" value={formData.user_email} onChange={handleChange} className={inputStyles} /></div>
              <div className="md:col-span-3"><label className={labelStyles}>Residence Address</label><input name="residence_address" value={formData.residence_address} onChange={handleChange} className={inputStyles} required /></div>
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="font-bold text-[#235347] mb-4">Loan Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="md:col-span-2"><label className={labelStyles}>Loan Amount (Words)</label><input name="loan_amount_words" value={formData.loan_amount_words} onChange={handleChange} className={inputStyles} /></div>
              <div><label className={labelStyles}>Loan Amount (Numeric)</label><input type="number" name="loan_amount_numeric" value={formData.loan_amount_numeric} onChange={handleChange} className={inputStyles} required /></div>
              <div><label className={labelStyles}>Loan Purpose</label><input name="loan_purpose" value={formData.loan_purpose} onChange={handleChange} className={inputStyles} required /></div>
              <div><label className={labelStyles}>Term (Months)</label><input type="number" name="loan_term_months" value={formData.loan_term_months} onChange={handleChange} className={inputStyles} required /></div>
              <div><label className={labelStyles}>Monthly Amortization</label><input type="number" name="monthly_amortization" value={formData.monthly_amortization} onChange={handleChange} className={inputStyles} /></div>
              <div><label className={labelStyles}>Payment Start Date</label><input type="date" name="payment_start_date" value={formData.payment_start_date} onChange={handleChange} className={inputStyles} /></div>
            </div>
          </section>

          <div className="flex justify-end">
            <button type="submit" disabled={loading} className="bg-[#66B538] text-white px-6 py-2 rounded hover:bg-[#5aa12b] transition-colors font-bold disabled:opacity-50">
              {loading ? 'Processing...' : 'Submit Application'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default Koica_Forms;
