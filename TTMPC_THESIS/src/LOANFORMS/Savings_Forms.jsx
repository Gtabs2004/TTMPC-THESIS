import React, { useState } from 'react';

function Savings_Forms() {
  const inputStyles = "border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-[#66B538] outline-none w-full bg-white text-sm transition-all";
  const labelStyles = "block text-xs font-bold text-gray-700 mb-1";
  const sectionHeader = "bg-[#66B538] text-white px-4 py-2 flex items-center gap-2 font-bold uppercase tracking-wide";

  // Form State
  const [formData, setFormData] = useState({
    account_number: '',
    date: new Date().toISOString().split('T')[0],
    account_name: '',
    
    surname: '',
    first_name: '',
    middle_name: '',
    date_of_birth: '',
    age: '',
    civil_status: '',
    gender: '',
    contact_no: '',
    residence_address: '',
    
    educational_qualification: '',
    marital_status: '',
    adult_dependents: '0',
    child_dependents: '0',
    
    annual_income: '',
    
    occupation_type: '',
    employer_name: '',
    job_position: '',
    
    nominate: false,
    do_not_nominate: false,
    nominee_name: '',
    nominee_relationship: '',
    nominee_dob: '',
    nominee_age: '',
    nominee_address: '',
  });

  // Handle standard input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle the exclusive checkboxes for nomination
  const handleNominationChange = (type) => {
    if (type === 'yes') {
      setFormData(prev => ({ ...prev, nominate: true, do_not_nominate: false }));
    } else {
      setFormData(prev => ({ ...prev, nominate: false, do_not_nominate: true, nominee_name: '', nominee_relationship: '', nominee_dob: '', nominee_age: '', nominee_address: '' }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Submitting Savings Account Data:", formData);
    alert("Savings Account Application Submitted!");
    // Add your API submission logic here
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-20">
      
      <header className="w-full bg-[#E9F7DE] h-20 shadow-sm flex items-center px-6">
        <div className="flex flex-row items-center gap-4">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" onError={(e) => e.target.style.display='none'} />
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
            <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="px-4">
        <h2 className="text-center text-2xl font-bold mt-10 mb-2 text-[#1c5035]">SAVINGS DEPOSIT OPENING ACCOUNT</h2>

        {/* Section 1: ACCOUNT INFORMATION */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}>
            <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
            ACCOUNT INFORMATION
          </div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className={labelStyles}>Account Number</label>
              <input type="text" name="account_number" value={formData.account_number} onChange={handleChange} className={inputStyles} />
            </div>
            <div>
              <label className={labelStyles}>Date</label>
              <input type="date" name="date" value={formData.date} onChange={handleChange} className={inputStyles} />
            </div>
            <div>
              <label className={labelStyles}>Account Name</label>
              <input type="text" name="account_name" value={formData.account_name} onChange={handleChange} className={inputStyles} />
            </div>
          </div>
        </div>

        {/* Section 2: PERSONAL INFORMATION */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}>
            <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
            PERSONAL INFORMATION
          </div>
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div><label className={labelStyles}>Surname <span className="text-red-500">*</span></label><input type="text" name="surname" value={formData.surname} onChange={handleChange} className={inputStyles} required /></div>
              <div><label className={labelStyles}>First Name <span className="text-red-500">*</span></label><input type="text" name="first_name" value={formData.first_name} onChange={handleChange} className={inputStyles} required /></div>
              <div><label className={labelStyles}>Middle Name</label><input type="text" name="middle_name" value={formData.middle_name} onChange={handleChange} className={inputStyles} /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div><label className={labelStyles}>Date of Birth <span className="text-red-500">*</span></label><input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} className={inputStyles} required /></div>
              <div><label className={labelStyles}>Age <span className="text-red-500">*</span></label><input type="number" name="age" value={formData.age} onChange={handleChange} className={inputStyles} required /></div>
              <div>
                <label className={labelStyles}>Civil Status <span className="text-red-500">*</span></label>
                <select name="civil_status" value={formData.civil_status} onChange={handleChange} className={inputStyles} required>
                  <option value="">Select Civil Status</option><option>Single</option><option>Married</option><option>Widowed</option><option>Legally Separated</option>
                </select>
              </div>
              <div>
                <label className={labelStyles}>Gender <span className="text-red-500">*</span></label>
                <select name="gender" value={formData.gender} onChange={handleChange} className={inputStyles} required>
                  <option value="">Select Gender</option><option>Male</option><option>Female</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="col-span-1"><label className={labelStyles}>Contact No. <span className="text-red-500">*</span></label><input type="text" name="contact_no" value={formData.contact_no} onChange={handleChange} className={inputStyles} required /></div>
              <div className="col-span-1 md:col-span-2"><label className={labelStyles}>Residence Address <span className="text-red-500">*</span></label><input type="text" name="residence_address" value={formData.residence_address} onChange={handleChange} className={inputStyles} required /></div>
            </div>
          </div>
        </div>

        
        <div className="mt-8 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className={sectionHeader}>
              <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
              EDUCATION & DEPENDENTS
            </div>
            <div className="p-8 grid grid-cols-1 sm:grid-cols-2 gap-6 flex-grow">
              <div>
                <label className={labelStyles}>Educational Qualification <span className="text-red-500">*</span></label>
                <select name="educational_qualification" value={formData.educational_qualification} onChange={handleChange} className={inputStyles} required>
                  
                  <option>Senior High School</option>
                  <option>College Undergraduate</option>
                  <option>College Graduate</option>
                </select>
              </div>
              <div>
                <label className={labelStyles}>Marital Status <span className="text-red-500">*</span></label>
                <select name="marital_status" value={formData.marital_status} onChange={handleChange} className={inputStyles} required>
                  
                  <option>Single</option>
                  <option>Married</option>
                </select>
              </div>
              <div><label className={labelStyles}>Adult dependents</label><input type="number" name="adult_dependents" value={formData.adult_dependents} onChange={handleChange} className={inputStyles} min="0" /></div>
              <div><label className={labelStyles}>Child dependents</label><input type="number" name="child_dependents" value={formData.child_dependents} onChange={handleChange} className={inputStyles} min="0" /></div>
            </div>
          </div>

          {/* Section 4: FINANCIAL INFORMATION */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className={sectionHeader}>
              <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
              FINANCIAL INFORMATION
            </div>
            <div className="p-8 flex-grow flex flex-col justify-center">
              <label className={labelStyles}>Annual Income (Gross)</label>
              <div className="relative mt-2 h-20">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-bold text-gray-800">₱</span>
                <input 
                  type="number" 
                  name="annual_income" 
                  value={formData.annual_income} 
                  onChange={handleChange} 
                  className="w-full h-full border border-gray-300 rounded-md pl-14 pr-4 text-2xl font-semibold focus:ring-2 focus:ring-[#66B538] outline-none bg-white transition-all" 
                />
              </div>
            </div>
          </div>
          
        </div>

        {/* Section 5: OCCUPATION DETAILS */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}>
            <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">5</span>
            OCCUPATION DETAILS
          </div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className={labelStyles}>Occupation Type</label>
              <select name="occupation_type" value={formData.occupation_type} onChange={handleChange} className={inputStyles}>
                <option value="">Select Occupation Type</option>
                <option>Employed - Public</option>
                <option>Employed - Private</option>
                <option>Self-Employed / Business</option>
                <option>Retired</option>
                <option>Others</option>
              </select>
            </div>
            <div>
              <label className={labelStyles}>Employer / Business Name</label>
              <input type="text" name="employer_name" value={formData.employer_name} onChange={handleChange} className={inputStyles} />
            </div>
            <div>
              <label className={labelStyles}>Job Position / Rank</label>
              <input type="text" name="job_position" value={formData.job_position} onChange={handleChange} className={inputStyles} />
            </div>
          </div>
        </div>

        {/* Section 6: NOMINATION DETAILS */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden max-w-6xl mx-auto w-full mb-12">
          <div className={sectionHeader}>
            <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">6</span>
            NOMINATION DETAILS
          </div>
          <div className="p-8 text-sm text-gray-800 space-y-6">
            
            <div className="space-y-3">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={formData.nominate} onChange={() => handleNominationChange('yes')} className="h-4 w-4 accent-[#66B538] rounded" />
                <span>Yes, I want to nominate the following person.</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={formData.do_not_nominate} onChange={() => handleNominationChange('no')} className="h-4 w-4 accent-[#66B538] rounded" />
                <span>No, I do not want to nominate anyone on my/our behalf.</span>
              </label>
            </div>

            <p className="pt-2 text-gray-700">
              I nominate the following person to whom in the event of my death the amount of the deposit/s in the account may be returned by TTMPC.
            </p>

            <div className={`space-y-6 transition-opacity duration-300 ${formData.do_not_nominate ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label className={labelStyles}>Nominee Full Name</label><input type="text" name="nominee_name" value={formData.nominee_name} onChange={handleChange} className={inputStyles} disabled={formData.do_not_nominate} /></div>
                <div><label className={labelStyles}>Relationship</label><input type="text" name="nominee_relationship" value={formData.nominee_relationship} onChange={handleChange} placeholder="e.g. Spouse, Child" className={inputStyles} disabled={formData.do_not_nominate} /></div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="col-span-1"><label className={labelStyles}>Nominee Date of Birth</label><input type="date" name="nominee_dob" value={formData.nominee_dob} onChange={handleChange} className={inputStyles} disabled={formData.do_not_nominate} /></div>
                <div className="col-span-1"><label className={labelStyles}>Age</label><input type="number" name="nominee_age" value={formData.nominee_age} onChange={handleChange} className={inputStyles} disabled={formData.do_not_nominate} /></div>
                <div className="col-span-1 md:col-span-2"><label className={labelStyles}>Nominee Address</label><input type="text" name="nominee_address" value={formData.nominee_address} onChange={handleChange} className={inputStyles} disabled={formData.do_not_nominate} /></div>
              </div>
            </div>

            <div className="flex justify-end pt-6 border-t border-gray-100 mt-8">
              <button type="submit" className="bg-[#66B538] text-white px-8 py-2.5 rounded-md hover:bg-[#5aa12b] transition-colors font-bold shadow-sm cursor-pointer">
                Submit Application
              </button>
            </div>

          </div>
        </div>

      </form>
    </div>
  );
}

export default Savings_Forms;