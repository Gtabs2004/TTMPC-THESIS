import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatTinNumber, TIN_FORMATTED_MAX_LENGTH, TIN_MIN_DIGITS, TIN_MAX_DIGITS, getTinDigitCount } from './tinFormat';
import { formatWithCommas, stripCommas } from '../utils/numberFormat';

const GSIS_DIGIT_LENGTH = 10;
const formatGsisNumber = (value) => String(value ?? '').replace(/\D/g, '').slice(0, GSIS_DIGIT_LENGTH);
import SmartDateInput from '../components/SmartDateInput';
import { useNotification } from '../contex/NotificationContext';
import { AlertCircle } from 'lucide-react';

// Cooperative membership requires the applicant to be of legal age.
const MINIMUM_AGE = 18;

// Standardized Income Source categories. "Other" reveals a free-text field so
// the applicant specifies what it actually is, instead of the DB column
// collecting whatever word each applicant happens to type.
const INCOME_SOURCE_OPTIONS = ['Salary', 'Dividends', 'Profit', 'Other'];

// Standardized "does the applicant have another income source" answer.
// Replaces the old free-text field that collected "None" / "N/A" / "No" /
// "none" / etc. as functionally-identical but inconsistent values.
const OTHER_INCOME_OPTIONS = [
  { value: 'N/A', label: 'N/A — no other source of income' },
  { value: 'Other', label: 'Other — specify' },
];

// Correct (day-accurate) age as of today, not a bare calendar-year
// subtraction — that overcounts by a year for anyone whose birthday hasn't
// happened yet this year.
const calculateAge = (isoDob) => {
  if (!isoDob) return null;
  const dob = new Date(isoDob);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
};

// Postgres unique-violation, surfaced however postgrest happens to report it
// (a `code` of 23505 when present, otherwise the message text).
const isDuplicateKeyError = (error) =>
  error?.code === '23505' || /duplicate key|unique constraint/i.test(String(error?.message || ''));

// Shared by the applicant's own Date of Birth and Spouse Date of Birth —
// neither may be in the future, and both must be at least MINIMUM_AGE
// (the Family Code, as amended by RA 11596, sets 18 as the minimum
// marriageable age, so this applies to a spouse too, not just the applicant).
const validateBirthdate = (isoDate, subject) => {
  if (!isoDate) return undefined;
  const today = new Date().toISOString().slice(0, 10);
  if (isoDate > today) {
    return `${subject}'s date of birth cannot be in the future.`;
  }
  const age = calculateAge(isoDate);
  if (age === null) {
    return 'Invalid date. Age could not be computed.';
  }
  if (age < MINIMUM_AGE) {
    return `${subject} must be at least ${MINIMUM_AGE} years old.`;
  }
  return undefined;
};

function Membership_Form() {
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const generateApplicationId = () => {
    const randomPart = Math.floor(100000 + Math.random() * 9000); // generate a 4 random
    return `TTMPCAP-${randomPart}`;
  };

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState('');
  const formRef = useRef(null);

  const [formdata, setFormdata] = useState({
    application_status: 'pending',

    surname: '',
    first_name: '',
    middle_name: '',

    gender: '',
    civil_status: '',
    date_of_birth: '',
    place_of_birth: '',
    citizenship: 'Filipino',
    religion: '',

    height: '',
    weight: '',

    blood_type: '',
    tin_number: '',
    gsis_number: '',

    father_name: '',
    mother_name: '',
    maiden_name: '',
    spouse_name: '',
    spouse_date_of_birth: '',
    spouse_occupation: '',

    number_of_dependents: '',

    permanent_address: '',
    contact_number: '',
    email: '',

    educational_attainment: '',
    occupation: '',
    // Category selected from INCOME_SOURCE_OPTIONS; the free-text detail
    // (only used when 'Other' is picked) is kept separately so switching
    // categories doesn't clobber what the applicant typed.
    income_source: '',
    income_source_other: '',
    employer_name: '',
    position: '',

    // Monthly Salary — what the applicant actually types. Annual Income is
    // derived from this (× 12) and is no longer independently editable.
    salary: '',
    other_income_type: '',
    other_income_other: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    const normalizedValue = name === 'tin_number'
      ? formatTinNumber(value)
      : name === 'gsis_number'
        ? formatGsisNumber(value)
        : name === 'salary'
          ? stripCommas(value)
          : value;

    // Clear specific field error when user starts typing
    setErrors(prev => ({ ...prev, [name]: undefined }));
    setGlobalError('');

    // Clear family information fields when "Single" is selected
    if (name === 'civil_status' && value === 'Single') {
      setFormdata(prev => ({
        ...prev,
        [name]: value,
        maiden_name: '',
        spouse_name: '',
        spouse_date_of_birth: '',
        spouse_occupation: '',
        number_of_dependents: '',
      }));
      return;
    }

    // Switching Income Source away from "Other" drops the now-irrelevant
    // free-text detail instead of silently submitting stale text.
    if (name === 'income_source' && value !== 'Other') {
      setFormdata(prev => ({ ...prev, income_source: value, income_source_other: '' }));
      return;
    }

    // Same idea for "does the applicant have another income source".
    if (name === 'other_income_type' && value !== 'Other') {
      setErrors(prev => ({ ...prev, other_income_other: undefined }));
      setFormdata(prev => ({ ...prev, other_income_type: value, other_income_other: '' }));
      return;
    }

    setFormdata(prev => ({ ...prev, [name]: normalizedValue }));
  };

  const handleDateChange = (name, isoDate) => {
    setGlobalError('');

    let fieldError;
    if (name === 'date_of_birth') {
      fieldError = validateBirthdate(isoDate, 'The applicant');
    } else if (name === 'spouse_date_of_birth') {
      fieldError = validateBirthdate(isoDate, 'The spouse');
    }

    setErrors(prev => ({ ...prev, [name]: fieldError }));
    setFormdata(prev => ({ ...prev, [name]: isoDate || '' }));
  };

  const validateForm = () => {
    const newErrors = {};

    // Base fields that are ALWAYS required for everyone
    const requiredFields = [
      'surname', 'first_name', 'middle_name', 'gender', 'civil_status',
      'date_of_birth', 'place_of_birth', 'citizenship', 'religion',
      'height', 'weight', 'blood_type', 'tin_number', 'gsis_number',
      'father_name', 'mother_name', 'permanent_address', 'contact_number',
      'email', 'educational_attainment', 'occupation', 'income_source',
      'employer_name', 'position', 'salary', 'other_income_type'
    ];

    requiredFields.forEach(field => {
      if (!formdata[field] || String(formdata[field]).trim() === '') {
        newErrors[field] = 'This information is required to complete your application.';
      }
    });

    // Income Source: "Other" requires the applicant to specify what it is.
    if (formdata.income_source === 'Other' && !formdata.income_source_other.trim()) {
      newErrors.income_source_other = 'Please specify the source of income.';
    }

    // Other Source of Income: "Other" requires specifying what it is.
    if (formdata.other_income_type === 'Other' && !formdata.other_income_other.trim()) {
      newErrors.other_income_other = 'Please specify the other source of income.';
    }

    // Monthly Salary must be a positive number — it's the sole basis for the
    // stored Annual Income (× 12).
    if (formdata.salary) {
      const monthlySalary = Number(stripCommas(formdata.salary));
      if (!Number.isFinite(monthlySalary) || monthlySalary <= 0) {
        newErrors.salary = 'Enter a valid monthly salary greater than 0.';
      }
    }

    // TIN must be between 9 and 12 digits
    if (formdata.tin_number) {
      const tinDigitCount = getTinDigitCount(formdata.tin_number);
      if (tinDigitCount < TIN_MIN_DIGITS || tinDigitCount > TIN_MAX_DIGITS) {
        newErrors.tin_number = `TIN must be between ${TIN_MIN_DIGITS} and ${TIN_MAX_DIGITS} digits.`;
      }
    }

    // GSIS Number must be exactly 10 digits
    if (formdata.gsis_number && formdata.gsis_number.length !== GSIS_DIGIT_LENGTH) {
      newErrors.gsis_number = `GSIS Number must be exactly ${GSIS_DIGIT_LENGTH} digits.`;
    }

    // Birthday: no future dates, and at least MINIMUM_AGE. Re-checked here
    // (not just in handleDateChange) so a stale or programmatically-set
    // value can't slip through to submission.
    if (formdata.date_of_birth) {
      const birthdateError = validateBirthdate(formdata.date_of_birth, 'The applicant');
      if (birthdateError) newErrors.date_of_birth = birthdateError;
    }

    // Conditional Fields based on Civil Status and Gender
    if (formdata.civil_status && formdata.civil_status !== 'Single') {
      const marriageFields = ['spouse_name', 'spouse_date_of_birth', 'spouse_occupation', 'number_of_dependents'];
      marriageFields.forEach(field => {
        if (!formdata[field] || String(formdata[field]).trim() === '') {
          newErrors[field] = 'Please complete this field.';
        }
      });

      // Same birthday rules as the applicant — no future dates, at least 18.
      if (formdata.spouse_date_of_birth) {
        const spouseBirthdateError = validateBirthdate(formdata.spouse_date_of_birth, 'The spouse');
        if (spouseBirthdateError) newErrors.spouse_date_of_birth = spouseBirthdateError;
      }

      if (formdata.gender === 'Female') {
        if (!formdata.maiden_name || String(formdata.maiden_name).trim() === '') {
          newErrors.maiden_name = 'Please complete this field.';
        }
      }
    }

    setErrors(newErrors);
    
    // If errors exist, setup notification and scroll to the first one
    if (Object.keys(newErrors).length > 0) {
      setGlobalError('Please complete all fields before submitting your application.');
      
      // Auto-scroll and focus to the first field with an error
      setTimeout(() => {
        const firstErrorKey = Object.keys(newErrors)[0];
        const errorElement = document.querySelector(`[name="${firstErrorKey}"]`);
        
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          errorElement.focus();
        } else {
          // Fallback scroll to the top of the form if it's a custom component
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);
      
      return false;
    }
    
    return true;
  };

  // Best-effort early warning: checks member_applications (any non-rejected/
  // denied row) and member_account (already a member) for this email.
  // member_applications has no public SELECT policy (it's a PII table), so
  // this can come back empty even when a duplicate exists — the real
  // guarantee is the partial unique index on member_applications
  // (member_applications_email_uniqueness.sql), enforced on insert below
  // regardless of what this check saw.
  const checkDuplicateEmail = async (email) => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) return false;
    try {
      const [appResult, accountResult] = await Promise.all([
        supabase.from('member_applications').select('application_status').ilike('email', cleanEmail).limit(10),
        supabase.from('member_account').select('user_id').ilike('email', cleanEmail).limit(1),
      ]);
      const hasLiveApplication = (appResult.data || []).some((row) => {
        const status = String(row.application_status || '').trim().toLowerCase();
        return status !== 'rejected' && status !== 'denied';
      });
      const hasExistingAccount = (accountResult.data || []).length > 0;
      return hasLiveApplication || hasExistingAccount;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return; // Stop submission if validation fails
    }

    setLoading(true);

    const duplicateEmailMessage = 'This email address is already associated with a pending application or an existing member. Please use a different email, or contact the cooperative if this is a mistake.';

    const isDuplicate = await checkDuplicateEmail(formdata.email);
    if (isDuplicate) {
      setErrors(prev => ({ ...prev, email: 'An application with this email already exists.' }));
      setGlobalError(duplicateEmailMessage);
      setLoading(false);
      return;
    }

    const toIntOrNull = (value) => {
      const text = String(value ?? '').trim();
      if (!text) return null;
      const parsed = Number(text);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    };

    const computedAge = calculateAge(formdata.date_of_birth);

    if (computedAge === null) {
      setErrors(prev => ({ ...prev, date_of_birth: 'Invalid date. Age could not be computed.' }));
      setLoading(false);
      return;
    }

    // Monthly Salary is what the applicant typed; Annual Income is always
    // derived from it (× 12), never typed independently. Both are stored
    // as plain numeric text — commas are a display-only concern (see
    // formatWithCommas in the JSX below) and never reach the payload.
    const monthlySalary = Number(stripCommas(formdata.salary)) || 0;
    const annualIncome = monthlySalary > 0 ? Number((monthlySalary * 12).toFixed(2)) : null;

    // Standardized category values, not whatever free text an applicant
    // would have typed — "Other" carries its own specified detail forward.
    const resolvedIncomeSource = formdata.income_source === 'Other'
      ? formdata.income_source_other.trim()
      : formdata.income_source;
    const resolvedOtherIncome = formdata.other_income_type === 'Other'
      ? formdata.other_income_other.trim()
      : 'N/A';

    const payload = {
      ...formdata,
      income_source: resolvedIncomeSource,
      other_income: resolvedOtherIncome,
      salary: String(monthlySalary),
      annual_income: annualIncome !== null ? String(annualIncome) : null,
      application_id: generateApplicationId(),
      created_at: new Date().toISOString(),
      date_of_birth: formdata.date_of_birth || null,
      spouse_date_of_birth: formdata.spouse_date_of_birth || null,
      age: computedAge,
      number_of_dependents: toIntOrNull(formdata.number_of_dependents),
      height: toIntOrNull(formdata.height),
      weight: toIntOrNull(formdata.weight),
      contact_number: toIntOrNull(formdata.contact_number),
    };
    // Form-only helper fields — member_applications has no matching columns.
    delete payload.income_source_other;
    delete payload.other_income_type;
    delete payload.other_income_other;

    try {
      const { error } = await supabase
        .from('member_applications')
        .insert([payload]);

      if (error) {
        if (isDuplicateKeyError(error)) {
          setErrors(prev => ({ ...prev, email: 'An application with this email already exists.' }));
          setGlobalError(duplicateEmailMessage);
          addNotification('An application with this email address has already been submitted.', 'error');
        } else {
          console.error(error);
          addNotification(`Application error: ${error.message}`, 'error');
        }
        return;
      }

      addNotification('Application submitted successfully.', 'success');
      navigate('/');
    } catch (error) {
      console.error(error);
      addNotification('Unexpected error. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const isSingleCivilStatus = formdata.civil_status === 'Single';

  // Helper for dynamic input classes
  const getInputClass = (fieldName) => `w-full border rounded-md p-2.5 text-sm outline-none transition-colors ${
    errors[fieldName] 
      ? 'border-red-500 bg-red-50 focus:ring-1 focus:ring-red-500' 
      : 'border-gray-300 focus:ring-1 focus:ring-green-500'
  }`;

  const renderError = (fieldName) => (
    errors[fieldName] ? <p className="text-red-500 text-[10px] mt-1 font-semibold animate-fade-in">{errors[fieldName]}</p> : null
  );

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-20">
      <header className="w-full bg-[#E9F7DE] h-20 shadow-sm flex items-center px-8">
        <div className="flex flex-row items-center gap-4">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
            <p className="text-[#A0D284] text-xs">Membership Application</p>
          </div>
        </div>
      </header>

      <main className="flex-grow flex justify-center mt-10 px-4">
        <div className="bg-white w-full max-w-5xl rounded-xl shadow-md p-10 border border-gray-100">
          <h2 className="text-2xl font-bold text-center text-[#1a4a2f] mb-8 tracking-wide">
            MEMBER REGISTRATION
          </h2>

          {/* Global Error Banner */}
          {globalError && (
            <div className="mb-8 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-red-800">Incomplete Application</h3>
                <p className="text-sm text-red-700 mt-0.5">{globalError}</p>
              </div>
            </div>
          )}

          <form ref={formRef} className="space-y-8" onSubmit={handleSubmit} noValidate>
          
            {/* PERSONAL INFORMATION */}
            <section>
              <h3 className="text-sm font-bold text-slate-700 uppercase mb-4">Personal Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Surname <span className="text-red-500">*</span></label>
                  <input type="text" name="surname" value={formdata.surname} onChange={handleChange} className={getInputClass('surname')} />
                  {renderError('surname')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">First Name <span className="text-red-500">*</span></label>
                  <input type="text" name="first_name" value={formdata.first_name} onChange={handleChange} className={getInputClass('first_name')} />
                  {renderError('first_name')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Middle Name <span className="text-red-500">*</span></label>
                  <input type="text" name="middle_name" value={formdata.middle_name} onChange={handleChange} className={getInputClass('middle_name')} />
                  {renderError('middle_name')}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
                <div className={`p-2 -m-2 rounded-md ${errors.gender ? 'bg-red-50 border border-red-200' : ''}`}>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Gender <span className="text-red-500">*</span></label>
                  <div className="flex items-center gap-4 mt-1">
                    <label className="flex items-center text-sm text-gray-700 cursor-pointer">
                      <input type="radio" name="gender" value="Male" checked={formdata.gender === 'Male'} onChange={handleChange} className="mr-2 text-green-500 focus:ring-green-500" /> Male
                    </label>
                    <label className="flex items-center text-sm text-gray-700 cursor-pointer">
                      <input type="radio" name="gender" value="Female" checked={formdata.gender === 'Female'} onChange={handleChange} className="mr-2 text-green-500 focus:ring-green-500" /> Female
                    </label>
                  </div>
                  {renderError('gender')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Civil Status <span className="text-red-500">*</span></label>
                  <select name="civil_status" value={formdata.civil_status} onChange={handleChange} className={getInputClass('civil_status')}>
                    <option value="">-- Select Civil Status --</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Legally Separated">Legally Separated</option>
                  </select>
                  {renderError('civil_status')}
                </div>
                <div className={errors.date_of_birth ? 'p-1 -m-1 bg-red-50 rounded-md border border-red-200' : ''}>
                  <SmartDateInput
                    mode="dob"
                    name="date_of_birth"
                    value={formdata.date_of_birth}
                    onChange={(isoDate) => handleDateChange('date_of_birth', isoDate)}
                    label="Date of Birth"
                    minAge={MINIMUM_AGE}
                    required
                  />
                  {renderError('date_of_birth')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Age</label>
                  <input type="number" readOnly value={calculateAge(formdata.date_of_birth) ?? ''} className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-gray-100 outline-none text-gray-500 cursor-not-allowed" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Place of Birth <span className="text-red-500">*</span></label>
                  <input type="text" name="place_of_birth" value={formdata.place_of_birth} onChange={handleChange} placeholder="Place of Birth" className={getInputClass('place_of_birth')} />
                  {renderError('place_of_birth')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Citizenship <span className="text-red-500">*</span></label>
                  <input type="text" name="citizenship" value={formdata.citizenship} readOnly className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-gray-100 outline-none text-gray-500 cursor-not-allowed" />
                  {renderError('citizenship')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Religion <span className="text-red-500">*</span></label>
                  <select name="religion" value={formdata.religion} onChange={handleChange} className={getInputClass('religion')}>
                    <option value="">-- Select Religion --</option>
                    <option value="Roman Catholic">Roman Catholic</option>
                    <option value="Christian">Christian</option>
                    <option value="Iglesia ni Cristo">Iglesia ni Cristo</option>
                    <option value="Islam">Islam</option>
                    <option value="Other">Other</option>
                  </select>
                  {renderError('religion')}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Height(cm) <span className="text-red-500">*</span></label>
                  <input type="text" name="height" value={formdata.height} onChange={handleChange} placeholder="Height (cm)" className={getInputClass('height')} />
                  {renderError('height')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Weight(kg) <span className="text-red-500">*</span></label>
                  <input type="text" name="weight" value={formdata.weight} onChange={handleChange} placeholder="Weight (kg)" className={getInputClass('weight')} />
                  {renderError('weight')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Blood Type <span className="text-red-500">*</span></label>
                  <select name="blood_type" value={formdata.blood_type} onChange={handleChange} className={getInputClass('blood_type')}>
                    <option value="">-- Select Blood Type --</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                  {renderError('blood_type')}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Taxpayer's Identification Number (TIN) <span className="text-red-500">*</span></label>
                  <input type="text" name="tin_number" value={formdata.tin_number} onChange={handleChange} inputMode="numeric" maxLength={TIN_FORMATTED_MAX_LENGTH} placeholder="123-456-789 (9-12 digits)" className={getInputClass('tin_number')} />
                  {renderError('tin_number')}
                </div>

                 <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">GSIS Number <span className="text-red-500">*</span></label>
                  <input type="text" name="gsis_number" value={formdata.gsis_number} onChange={handleChange} inputMode="numeric" placeholder="10-digit GSIS Number" className={getInputClass('gsis_number')} />
                  {renderError('gsis_number')}
                </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Father's Name <span className="text-red-500">*</span></label>
                    <input type="text" name="father_name" value={formdata.father_name} onChange={handleChange} className={getInputClass('father_name')} />
                    {renderError('father_name')}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Mother's Name <span className="text-red-500">*</span></label>
                    <input type="text" name="mother_name" value={formdata.mother_name} onChange={handleChange} className={getInputClass('mother_name')} />
                    {renderError('mother_name')}
                  </div>
              </div>
            </section>

            {/* FAMILY INFORMATION (CONDITIONAL) */}
            {!isSingleCivilStatus && (
              <section>
                <h3 className="text-sm font-bold text-slate-700 uppercase mb-4 border-t pt-6">Family Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">

                  {formdata.gender === 'Female' && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Maiden Name <span className="text-red-500">*</span></label>
                      <input type="text" name="maiden_name" value={formdata.maiden_name} onChange={handleChange} className={getInputClass('maiden_name')} />
                      {renderError('maiden_name')}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Name of Spouse <span className="text-red-500">*</span></label>
                    <input type="text" name="spouse_name" value={formdata.spouse_name} onChange={handleChange} className={getInputClass('spouse_name')} />
                    {renderError('spouse_name')}
                  </div>

                  <div className={errors.spouse_date_of_birth ? 'p-1 -m-1 bg-red-50 rounded-md border border-red-200' : ''}>
                    <SmartDateInput
                      mode="dob"
                      name="spouse_date_of_birth"
                      value={formdata.spouse_date_of_birth}
                      onChange={(isoDate) => handleDateChange('spouse_date_of_birth', isoDate)}
                      label="Spouse Date of Birth"
                      minAge={MINIMUM_AGE}
                      required
                    />
                    {renderError('spouse_date_of_birth')}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Spouse's Occupation <span className="text-red-500">*</span></label>
                    <input type="text" name="spouse_occupation" value={formdata.spouse_occupation} onChange={handleChange} className={getInputClass('spouse_occupation')} />
                    {renderError('spouse_occupation')}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Number of Dependents <span className="text-red-500">*</span></label>
                    <input type="number" name="number_of_dependents" value={formdata.number_of_dependents} onChange={handleChange} className={getInputClass('number_of_dependents')} />
                    {renderError('number_of_dependents')}
                  </div>
                </div>
              </section>
            )}

            {/* CONTACT & ADDRESS */}
            <section>
              <h3 className="text-sm font-bold text-slate-700 uppercase mb-4 border-t pt-6">Contact & Address Details</h3>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Permanent Address <span className="text-red-500">*</span></label>
                <input type="text" name="permanent_address" value={formdata.permanent_address} onChange={handleChange} className={getInputClass('permanent_address')} />
                {renderError('permanent_address')}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Contact Number <span className="text-red-500">*</span></label>
                  <input type="tel" name="contact_number" value={formdata.contact_number} onChange={handleChange} className={getInputClass('contact_number')} />
                  {renderError('contact_number')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email Address <span className="text-red-500">*</span></label>
                  <input type="email" name="email" value={formdata.email} onChange={handleChange} className={getInputClass('email')} />
                  {renderError('email')}
                </div>
              </div>
            </section>

            {/* EDUCATIONAL & EMPLOYMENT */}
            <section>
              <h3 className="text-sm font-bold text-slate-700 uppercase mb-4 border-t pt-6">Educational & Employment Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Educational Attainment <span className="text-red-500">*</span></label>
                  <select name="educational_attainment" value={formdata.educational_attainment} onChange={handleChange} className={getInputClass('educational_attainment')}>
                    <option value="">-- Select Educational Attainment --</option>
                    <option value="High School">High School</option>
                    <option value="Vocational">Vocational</option>
                    <option value="College Undergraduate">Undergraduate</option>
                    <option value="College Graduate">College Graduate</option>
                    <option value="Post Graduate">Post Graduate</option>
                  </select>
                  {renderError('educational_attainment')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Occupation <span className="text-red-500">*</span></label>
                  <input type="text" name="occupation" value={formdata.occupation} onChange={handleChange} className={getInputClass('occupation')} />
                  {renderError('occupation')}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Income Source <span className="text-red-500">*</span></label>
                  <select name="income_source" value={formdata.income_source} onChange={handleChange} className={getInputClass('income_source')}>
                    <option value="">-- Select Income Source --</option>
                    {INCOME_SOURCE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {renderError('income_source')}
                  {formdata.income_source === 'Other' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        name="income_source_other"
                        value={formdata.income_source_other}
                        onChange={handleChange}
                        placeholder="Please specify"
                        className={getInputClass('income_source_other')}
                      />
                      {renderError('income_source_other')}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Employer <span className="text-red-500">*</span></label>
                  <input type="text" name="employer_name" value={formdata.employer_name} onChange={handleChange} className={getInputClass('employer_name')} />
                  {renderError('employer_name')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Position <span className="text-red-500">*</span></label>
                  <input type="text" name="position" value={formdata.position} onChange={handleChange} className={getInputClass('position')} />
                  {renderError('position')}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Monthly Salary <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    name="salary"
                    value={formatWithCommas(formdata.salary)}
                    onChange={handleChange}
                    placeholder="e.g. 25,000.00"
                    inputMode="decimal"
                    className={getInputClass('salary')}
                  />
                  {renderError('salary')}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Annual Income</label>
                  <input
                    type="text"
                    readOnly
                    value={
                      formdata.salary
                        ? ((Number(stripCommas(formdata.salary)) || 0) * 12).toLocaleString('en-PH', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : ''
                    }
                    placeholder="Computed from Monthly Salary × 12"
                    className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-gray-100 outline-none text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Automatically computed: Monthly Salary × 12</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Other Source of Income <span className="text-red-500">*</span></label>
                  <select name="other_income_type" value={formdata.other_income_type} onChange={handleChange} className={getInputClass('other_income_type')}>
                    <option value="">-- Select --</option>
                    {OTHER_INCOME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {renderError('other_income_type')}
                  {formdata.other_income_type === 'Other' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        name="other_income_other"
                        value={formdata.other_income_other}
                        onChange={handleChange}
                        placeholder="Please specify"
                        className={getInputClass('other_income_other')}
                      />
                      {renderError('other_income_other')}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <hr className="border-gray-200 mt-8 mb-4" />

            {/* AGREEMENT & SUBMIT */}
            <div className="flex flex-col gap-6">
              <label className="flex items-center text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" required className="w-4 h-4 mr-3 text-green-600 border-gray-300 rounded focus:ring-green-500" />
                I hereby declare that the informations given are true and correct.
              </label>

              <div className="flex justify-end gap-4 mt-4">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="bg-[#E9F7DE] text-[#5ca830] border border-[#A0D284] px-8 py-2.5 rounded-md font-bold text-sm hover:bg-[#d8f0c5] transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit" 
                  disabled={loading}
                  className="bg-[#66B538] text-white px-8 py-2.5 rounded-md font-bold text-sm hover:bg-[#5ca830] transition-colors shadow-sm"
                >
                  {loading ? "Processing..." : "Submit Application"}
                </button>
              </div>
            </div>

          </form>
        </div>
      </main>
    </div>
  );
}

export default Membership_Form;