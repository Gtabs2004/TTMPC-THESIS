import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatTinNumber, TIN_FORMATTED_MAX_LENGTH } from './tinFormat';
import SmartDateInput from '../components/SmartDateInput';
import { AlertCircle } from 'lucide-react';

function Membership_Form() {
  const navigate = useNavigate();

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
    citizenship: '',
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
    income_source: '',
    employer_name: '',
    position: '',

    annual_income: '',
    salary: '',
    other_income: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    const normalizedValue = name === 'tin_number' ? formatTinNumber(value) : value;
    
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
    } else {
      setFormdata(prev => ({ ...prev, [name]: normalizedValue }));
    }
  };

  const handleDateChange = (name, isoDate) => {
    setErrors(prev => ({ ...prev, [name]: undefined }));
    setGlobalError('');
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
      'employer_name', 'position', 'annual_income', 'salary', 'other_income'
    ];

    requiredFields.forEach(field => {
      if (!formdata[field] || String(formdata[field]).trim() === '') {
        newErrors[field] = 'This information is required to complete your application.';
      }
    });

    // Conditional Fields based on Civil Status and Gender
    if (formdata.civil_status && formdata.civil_status !== 'Single') {
      const marriageFields = ['spouse_name', 'spouse_date_of_birth', 'spouse_occupation', 'number_of_dependents'];
      marriageFields.forEach(field => {
        if (!formdata[field] || String(formdata[field]).trim() === '') {
          newErrors[field] = 'Please complete this field.';
        }
      });

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return; // Stop submission if validation fails
    }

    setLoading(true);

    const toIntOrNull = (value) => {
      const text = String(value ?? '').trim();
      if (!text) return null;
      const parsed = Number(text);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    };

    const computedAge = formdata.date_of_birth
      ? Math.max(0, new Date().getFullYear() - new Date(formdata.date_of_birth).getFullYear())
      : null;

    if (computedAge === null) {
      setErrors(prev => ({ ...prev, date_of_birth: 'Invalid date. Age could not be computed.' }));
      setLoading(false);
      return;
    }

    const payload = {
      ...formdata,
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

    try {
      const { error } = await supabase
        .from('member_applications')
        .insert([payload]);

      if (error) {
        console.error(error);
        alert(`Application error: ${error.message}`);
        return;
      }

      alert('Application submitted successfully.');
      navigate('/');
    } catch (error) {
      console.error(error);
      alert('Unexpected error. Please try again.');
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
                    required
                  />
                  {renderError('date_of_birth')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Age</label>
                  <input type="number" readOnly value={formdata.date_of_birth ? Math.max(0, new Date().getFullYear() - new Date(formdata.date_of_birth).getFullYear()) : ''} className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-gray-100 outline-none text-gray-500 cursor-not-allowed" />
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
                  <input type="text" name="citizenship" value={formdata.citizenship} onChange={handleChange} placeholder="Citizenship" className={getInputClass('citizenship')} />
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
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Height <span className="text-red-500">*</span></label>
                  <input type="text" name="height" value={formdata.height} onChange={handleChange} placeholder="Height (cm)" className={getInputClass('height')} />
                  {renderError('height')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Weight <span className="text-red-500">*</span></label>
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
                  <input type="text" name="tin_number" value={formdata.tin_number} onChange={handleChange} inputMode="numeric" maxLength={TIN_FORMATTED_MAX_LENGTH} placeholder="123-456-789-000" className={getInputClass('tin_number')} />
                  {renderError('tin_number')}
                </div>

                 <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">GSIS Number <span className="text-red-500">*</span></label>
                  <input type="text" name="gsis_number" value={formdata.gsis_number} onChange={handleChange} className={getInputClass('gsis_number')} />
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
                  <input type="text" name="income_source" value={formdata.income_source} onChange={handleChange} className={getInputClass('income_source')} />
                  {renderError('income_source')}
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
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Annual Income <span className="text-red-500">*</span></label>
                  <input type="text" name="annual_income" value={formdata.annual_income} onChange={handleChange} className={getInputClass('annual_income')} />
                  {renderError('annual_income')}
                </div>

                  <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Salary <span className="text-red-500">*</span></label>
                  <input type="text" name="salary" value={formdata.salary} onChange={handleChange} className={getInputClass('salary')} />
                  {renderError('salary')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Other Source of Income <span className="text-red-500">*</span></label>
                  <input type="text" name="other_income" value={formdata.other_income} onChange={handleChange} className={getInputClass('other_income')} />
                  {renderError('other_income')}
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