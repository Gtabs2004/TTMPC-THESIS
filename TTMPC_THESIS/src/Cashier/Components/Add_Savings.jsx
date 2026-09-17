import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useConfirm } from '../../contex/ConfirmContext';
import { formatWithCommas, stripCommas } from '../../utils/numberFormat';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Add_Savings() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const inputStyles = "border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-green-600 outline-none w-full bg-white text-sm transition-all";
  const labelStyles = "block text-xs font-bold text-gray-700 mb-1";
  const sectionHeader = "bg-green-600 text-white px-4 py-2 flex items-center gap-2 font-bold uppercase tracking-wide";

  // Form State
  const [formData, setFormData] = useState({
    membership_number_id: '',
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
    initial_deposit: '',
    
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

  const [memberSearch, setMemberSearch] = useState('');
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [memberSearchError, setMemberSearchError] = useState('');
  const [memberOptions, setMemberOptions] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedMemberLabel, setSelectedMemberLabel] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

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

  const calculateAge = (dob) => {
    if (!dob) return '';
    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime())) return '';

    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      years -= 1;
    }
    return years >= 0 ? String(years) : '';
  };

  const selectMember = (record) => {
    const raw = record?.raw || {};
    const surname = String(raw.surname || raw.last_name || '').trim();
    const firstName = String(raw.first_name || '').trim();
    const middleName = String(raw.middle_name || raw.middle_initial || '').trim();
    const fullName = String(record?.full_name || [firstName, middleName, surname].filter(Boolean).join(' ')).trim();
    const dob = String(raw.date_of_birth || '').trim();
    const age = String(raw.age || '').trim() || calculateAge(dob);
    const adultDependents = raw.adult_dependents ?? raw.number_of_dependents ?? '0';
    const childDependents = raw.child_dependents ?? '0';

    setSelectedMemberLabel(fullName || 'Selected Member');
    setSelectedMemberId(String(record?.member_id || raw.membership_number_id || '').trim());
    setMemberSearch('');
    setPickerOpen(false);

    setFormData((prev) => ({
      ...prev,
      membership_number_id: String(record?.member_id || raw.membership_number_id || '').trim(),
      account_name: fullName || prev.account_name,
      surname: surname || prev.surname,
      first_name: firstName || prev.first_name,
      middle_name: middleName || prev.middle_name,
      date_of_birth: dob || prev.date_of_birth,
      age: age || prev.age,
      civil_status: String(raw.civil_status || '').trim() || prev.civil_status,
      marital_status: String(raw.marital_status || raw.civil_status || '').trim() || prev.marital_status,
      gender: String(raw.gender || '').trim() || prev.gender,
      contact_no: String(raw.contact_number || raw.mobile_number || record?.contact_number || '').trim() || prev.contact_no,
      residence_address: String(raw.permanent_address || raw.address || record?.address || '').trim() || prev.residence_address,
      educational_qualification: String(raw.educational_attainment || '').trim() || prev.educational_qualification,
      adult_dependents: String(adultDependents),
      child_dependents: String(childDependents),
      annual_income: String(raw.annual_income || '').trim() || prev.annual_income,
      employer_name: String(raw.employer_name || '').trim() || prev.employer_name,
      job_position: String(raw.position || raw.occupation || '').trim() || prev.job_position,
      nominee_name: String(raw.nominee_full_name || '').trim() || prev.nominee_name,
      nominee_relationship: String(raw.nominee_relationship || '').trim() || prev.nominee_relationship,
      nominee_dob: String(raw.nominee_date_of_birth || '').trim() || prev.nominee_dob,
      nominee_age: String(raw.nominee_age || '').trim() || prev.nominee_age,
      nominee_address: String(raw.nominee_address || '').trim() || prev.nominee_address,
    }));
  };

  // Load the member list once (on first open of the picker), then filter locally so
  // typing stays instant and can match any available name/ID field.
  useEffect(() => {
    if (!pickerOpen || membersLoaded) return undefined;

    const controller = new AbortController();
    (async () => {
      try {
        setSearchingMembers(true);
        setMemberSearchError('');

        const response = await fetch(`${API_BASE_URL}/api/personal_data_sheet`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result?.success) {
          throw new Error(result?.detail || 'Failed to load members.');
        }

        setAllMembers(result.data || []);
        setMembersLoaded(true);
      } catch (error) {
        if (error.name !== 'AbortError') {
          setMemberSearchError(error?.message || 'Unable to load members.');
          setAllMembers([]);
        }
      } finally {
        setSearchingMembers(false);
      }
    })();

    return () => controller.abort();
  }, [pickerOpen, membersLoaded]);

  // Match on first name, middle name, last name, full name (either order),
  // member code and the personal data sheet id.
  useEffect(() => {
    const tokens = String(memberSearch || '').trim().toLowerCase().split(/\s+/).filter(Boolean);

    const haystackFor = (record) => {
      const raw = record?.raw || {};
      const firstName = String(raw.first_name || '');
      const middleName = String(raw.middle_name || raw.middle_initial || '');
      const lastName = String(raw.surname || raw.last_name || '');
      return [
        String(record?.full_name || ''),
        firstName,
        middleName,
        lastName,
        `${firstName} ${lastName}`,
        `${lastName} ${firstName}`,
        String(record?.member_id || raw.membership_number_id || ''),
        String(record?.id || raw.personal_data_sheet_id || ''),
      ]
        .join(' ')
        .toLowerCase();
    };

    const sorted = [...allMembers].sort((a, b) =>
      String(a?.full_name || '').localeCompare(String(b?.full_name || ''))
    );

    if (!tokens.length) {
      setMemberOptions(sorted);
      return;
    }

    setMemberOptions(
      sorted.filter((record) => {
        const haystack = haystackFor(record);
        return tokens.every((token) => haystack.includes(token));
      })
    );
  }, [memberSearch, allMembers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!String(formData.membership_number_id || '').trim()) {
      setSubmitError('Please search and select a member first.');
      return;
    }

    const openingBalance = Number(formData.initial_deposit || 0) || 0;
    const memberLabel = [formData.first_name, formData.surname].filter(Boolean).join(' ').trim()
      || formData.account_name
      || formData.membership_number_id;
    const ok = await confirm({
      title: 'Create Savings Account',
      message: `Create a new savings account for ${memberLabel} with an opening balance of ${formatCurrency(openingBalance)}? This will register the member's account on the ledger and cannot be undone without a reversing entry.`,
      confirmLabel: 'Create Account',
      tone: 'default',
    });
    if (!ok) return;

    try {
      setSubmitting(true);

      const payload = {
        membership_number_id: String(formData.membership_number_id || '').trim(),
        savings_amount: openingBalance,
        amount: openingBalance,
        balance: openingBalance,
        account_name: String(formData.account_name || '').trim() || null,
        adult_dependents: Number(formData.adult_dependents || 0) || 0,
        child_dependents: Number(formData.child_dependents || 0) || 0,
        nominee_full_name: String(formData.nominee_name || '').trim() || null,
        nominee_relationship: String(formData.nominee_relationship || '').trim() || null,
        nominee_date_of_birth: String(formData.nominee_dob || '').trim() || null,
        nominee_age: formData.nominee_age ? Number(formData.nominee_age) : null,
        nominee_address: String(formData.nominee_address || '').trim() || null,
      };

      const response = await fetch(`${API_BASE_URL}/api/savings/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || 'Failed to create savings account.');
      }

      const generatedAccountNumber = result?.data?.Account_Number || '';
      const generatedSavingsId = result?.data?.Savings_ID || generatedAccountNumber;

      setFormData((prev) => ({
        ...prev,
        account_number: generatedAccountNumber,
      }));

      setSubmitSuccess(`Savings account created successfully. Account Number: ${generatedAccountNumber || generatedSavingsId}`);
    } catch (error) {
      setSubmitError(error?.message || 'Unable to submit savings application.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-20">
      
      
      <form onSubmit={handleSubmit} className="px-4">
        <div className="max-w-6xl mx-auto w-full pt-8">
          <button
            type="button"
            onClick={() => navigate('/Cashier_Savings')}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-green-700 transition cursor-pointer"
          >
            <ArrowLeft size={16} />
            Back to Savings Accounts
          </button>
        </div>

        <h2 className="text-center text-2xl font-bold mt-4 mb-2 text-[#1c5035]">SAVINGS DEPOSIT OPENING ACCOUNT</h2>

        {submitError ? (
          <div className="max-w-6xl mx-auto w-full mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        ) : null}

        {submitSuccess ? (
          <div className="max-w-6xl mx-auto w-full mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {submitSuccess}
          </div>
        ) : null}

        {/* Section 1: ACCOUNT INFORMATION */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}>
            <span className="bg-white text-green-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
            ACCOUNT INFORMATION
          </div>
          <div className="px-8 pt-6 pb-0">
            <label className={labelStyles}>Member</label>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className={`${inputStyles} flex items-center gap-2 text-left cursor-pointer hover:border-green-600`}
            >
              <span className="text-gray-400">&#128269;</span>
              {selectedMemberLabel ? (
                <span className="flex-1 min-w-0 truncate">
                  <span className="font-semibold text-gray-800">{selectedMemberLabel}</span>
                  {selectedMemberId ? (
                    <span className="text-gray-500"> &middot; {selectedMemberId}</span>
                  ) : null}
                </span>
              ) : (
                <span className="flex-1 text-gray-400">Search member by name or member ID...</span>
              )}
              <span className="text-xs font-semibold text-green-700 shrink-0">
                {selectedMemberLabel ? 'Change' : 'Select'}
              </span>
            </button>

            {memberSearchError && !pickerOpen ? (
              <p className="text-xs text-red-600 mt-2">{memberSearchError}</p>
            ) : null}
          </div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className={labelStyles}>Account Number</label>
              <input type="text" name="account_number" value={formData.account_number} onChange={handleChange} className={inputStyles} placeholder="Auto-generated on submit" readOnly />
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
            <span className="bg-white text-green-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
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
              <span className="bg-white text-green-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
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
              <span className="bg-white text-green-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
              FINANCIAL INFORMATION
            </div>
            <div className="p-8 flex-grow flex flex-col justify-center gap-6">
              <div>
                <label className={labelStyles}>Initial Deposit <span className="text-red-500">*</span></label>
                <p className="text-xs text-gray-500 mb-2">Cash received now — becomes the account's opening balance.</p>
                <div className="relative h-20">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-bold text-gray-800">₱</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="initial_deposit"
                    value={formatWithCommas(formData.initial_deposit)}
                    onChange={(e) => handleChange({ target: { name: e.target.name, value: stripCommas(e.target.value) } })}
                    placeholder="0.00"
                    required
                    className="w-full h-full border border-gray-300 rounded-md pl-14 pr-4 text-2xl font-semibold focus:ring-2 focus:ring-green-600 outline-none bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className={labelStyles}>Annual Income (Gross)</label>
                <p className="text-xs text-gray-500 mb-2">Member profile information only — not deposited.</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-bold text-gray-500">₱</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="annual_income"
                    value={formatWithCommas(formData.annual_income)}
                    onChange={(e) => handleChange({ target: { name: e.target.name, value: stripCommas(e.target.value) } })}
                    className={`${inputStyles} pl-8`}
                  />
                </div>
              </div>
            </div>
          </div>
          
        </div>

        {/* Section 5: OCCUPATION DETAILS */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden max-w-6xl mx-auto w-full">
          <div className={sectionHeader}>
            <span className="bg-white text-green-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">5</span>
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
            <span className="bg-white text-green-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">6</span>
            NOMINATION DETAILS
          </div>
          <div className="p-8 text-sm text-gray-800 space-y-6">
            
            <div className="space-y-3">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={formData.nominate} onChange={() => handleNominationChange('yes')} className="h-4 w-4 accent-green-600 rounded" />
                <span>Yes, I want to nominate the following person.</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={formData.do_not_nominate} onChange={() => handleNominationChange('no')} className="h-4 w-4 accent-green-600 rounded" />
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
              <button type="submit" disabled={submitting} className="bg-green-600 disabled:opacity-60 text-white px-8 py-2.5 rounded-md hover:bg-green-700 transition-colors font-bold shadow-sm cursor-pointer">
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>

          </div>
        </div>

      </form>

      {pickerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPickerOpen(false);
          }}
        >
          <div className="w-full max-w-xl bg-white rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="font-bold text-[#1c5035]">Select Member</h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer"
                aria-label="Close member picker"
              >
                &times;
              </button>
            </div>

            <div className="px-5 py-3 border-b border-gray-100">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">&#128269;</span>
                <input
                  type="text"
                  autoFocus
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setPickerOpen(false);
                  }}
                  placeholder="Search member by name or member ID..."
                  className={`${inputStyles} pl-9`}
                />
              </div>
              {!searchingMembers && !memberSearchError ? (
                <p className="text-xs text-gray-500 mt-2">
                  {memberOptions.length} {memberOptions.length === 1 ? 'member' : 'members'}
                  {memberSearch.trim() ? ' matched' : ' total'}
                </p>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto">
              {searchingMembers ? (
                <p className="px-5 py-4 text-sm text-gray-500">Loading members...</p>
              ) : memberSearchError ? (
                <p className="px-5 py-4 text-sm text-red-600">{memberSearchError}</p>
              ) : memberOptions.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-500">
                  {memberSearch.trim() ? 'No members match your search.' : 'No members available.'}
                </p>
              ) : (
                memberOptions.map((record) => (
                  <button
                    key={`${record.member_id || record.id}-${record.created_at || ''}`}
                    type="button"
                    onClick={() => selectMember(record)}
                    className="w-full px-5 py-3 text-left hover:bg-green-50 border-b border-gray-100 last:border-b-0 cursor-pointer"
                  >
                    <p className="font-semibold text-gray-800 text-sm">{record.full_name || 'Unknown Member'}</p>
                    <p className="text-xs text-gray-500">Member ID: {record.member_id || 'N/A'}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Add_Savings;