import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';




function Membership_Form() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
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

    maiden_name: '',
    spouse_name: '',
    spouse_occupation: '',

    number_of_dependents: '',

    permanent_address: '',
    contact_number: '',
    email: '',

    educational_attainment: '',
    occupation: '',
    position: '',

    annual_income: '',
    other_income: '',

  });

  const handleChange = (e) =>{
    const { name, value } = e.target;
    setFormdata (prev =>({...prev, [name]: value }));
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const computedAge = formdata.date_of_birth
      ? Math.max(0, new Date().getFullYear() - new Date(formdata.date_of_birth).getFullYear())
      : null;

    if (computedAge === null) {
      alert('Please select Date of Birth so age can be computed.');
      setLoading(false);
      return;
    }

    const payload = {
      ...formdata,
      created_at: new Date().toISOString(),
      date_of_birth: formdata.date_of_birth || null,
      age: computedAge,
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

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-20">
      <header className="w-full bg-[#E9F7DE] h-20 shadow-sm flex items-center px-8">
        <div className="flex flex-row items-center gap-4">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
            <p className="text-[#A0D284] text-xs">Membership Application</p>
          </div>
        </div>
      </header>

      <main className="flex-grow flex justify-center mt-10 px-4">
        <div className="bg-white w-full max-w-5xl rounded-xl shadow-md p-10 border border-gray-100">
          <h2 className="text-2xl font-bold text-center text-[#1a4a2f] mb-10 tracking-wide">
            MEMBER REGISTRATION
          </h2>

          <form className="space-y-8" onSubmit={handleSubmit}>
          
            
            <section>
              <h3 className="text-sm font-bold text-slate-700 uppercase mb-4">Personal Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Surname <span className="text-red-500">*</span></label>
                  <input type="text" name="surname" value={formdata.surname} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">First Name <span className="text-red-500">*</span></label>
                  <input type="text" name="first_name" value={formdata.first_name} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Middle Name</label>
                  <input type="text" name="middle_name" value={formdata.middle_name} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Gender <span className="text-red-500">*</span></label>
                  <div className="flex items-center gap-4 mt-1">
                    <label className="flex items-center text-sm text-gray-700 cursor-pointer">
                      <input type="radio" name="gender" value="Male" checked={formdata.gender === 'Male'} onChange={handleChange} className="mr-2 text-green-500 focus:ring-green-500" /> Male
                    </label>
                    <label className="flex items-center text-sm text-gray-700 cursor-pointer">
                      <input type="radio" name="gender" value="Female" checked={formdata.gender === 'Female'} onChange={handleChange} className="mr-2 text-green-500 focus:ring-green-500" /> Female
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Civil Status <span className="text-red-500">*</span></label>
                  <select name="civil_status" value={formdata.civil_status} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm text-gray-500 focus:ring-1 focus:ring-green-500 outline-none">
                    <option value="">-- Select Civil Status --</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Legally Separated">Legally Separated</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Date of Birth <span className="text-red-500">*</span></label>
                  <input type="date" name="date_of_birth" value={formdata.date_of_birth} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm text-gray-500 focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Age <span className="text-red-500">*</span></label>
                  <input type="number" readOnly value={formdata.date_of_birth ? Math.max(0, new Date().getFullYear() - new Date(formdata.date_of_birth).getFullYear()) : ''} className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-gray-50 focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Place of Birth <span className="text-red-500">*</span></label>
                  <input type="text" name="place_of_birth" value={formdata.place_of_birth} onChange={handleChange} placeholder="Place of Birth" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Citizenship <span className="text-red-500">*</span></label>
                  <input type="text" name="citizenship" value={formdata.citizenship} onChange={handleChange} placeholder="Citizenship" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Religion <span className="text-red-500">*</span></label>
                  <select name="religion" value={formdata.religion} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm text-gray-500 focus:ring-1 focus:ring-green-500 outline-none">
                    <option value="">-- Select Religion --</option>
                    <option value="Roman Catholic">Roman Catholic</option>
                    <option value="Christian">Christian</option>
                    <option value="Iglesia ni Cristo">Iglesia ni Cristo</option>
                    <option value="Islam">Islam</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Height <span className="text-red-500">*</span></label>
                  <input type="text" name="height" value={formdata.height} onChange={handleChange} placeholder="Height (cm)" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Weight <span className="text-red-500">*</span></label>
                  <input type="text" name="weight" value={formdata.weight} onChange={handleChange} placeholder="Weight (kg)" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Blood Type <span className="text-red-500">*</span></label>
                  <select name="blood_type" value={formdata.blood_type} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm text-gray-500 focus:ring-1 focus:ring-green-500 outline-none">
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
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Taxpayer's Identification Number (TIN) <span className="text-red-500">*</span></label>
                  <input type="text" name="tin_number" value={formdata.tin_number} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>
            </section>

            
            <section>
              <h3 className="text-sm font-bold text-slate-700 uppercase mb-4">Family Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Maiden Name (if married)</label>
                  <input type="text" name="maiden_name" value={formdata.maiden_name} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Name of Spouse</label>
                  <input type="text" name="spouse_name" value={formdata.spouse_name} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Spouse's Occupation</label>
                  <input type="text" name="spouse_occupation" value={formdata.spouse_occupation} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Number of Dependents</label>
                  <input type="number" name="number_of_dependents" value={formdata.number_of_dependents} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>
            </section>

            
            <section>
              <h3 className="text-sm font-bold text-slate-700 uppercase mb-4">Contact & Address Details</h3>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Permanent Address <span className="text-red-500">*</span></label>
                <input type="text" name="permanent_address" value={formdata.permanent_address} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Contact Number <span className="text-red-500">*</span></label>
                  <input type="tel" name="contact_number" value={formdata.contact_number} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email Address</label>
                  <input type="email" name="email" value={formdata.email} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>
            </section>

            
            <section>
              <h3 className="text-sm font-bold text-slate-700 uppercase mb-4">Educational & Employment Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Educational Attainment <span className="text-red-500">*</span></label>
                  <select name="educational_attainment" value={formdata.educational_attainment} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm text-gray-500 focus:ring-1 focus:ring-green-500 outline-none">
                    <option value="">-- Select Educational Attainment --</option>
                    <option value="High School">High School</option>
                    <option value="Vocational">Vocational</option>
                    <option value="College Undergraduate">College Undergraduate</option>
                    <option value="College Graduate">College Graduate</option>
                    <option value="Post Graduate">Post Graduate</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Occupation / Income Source <span className="text-red-500">*</span></label>
                  <input type="text" name="occupation" value={formdata.occupation} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Position</label>
                  <input type="text" name="position" value={formdata.position} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Annual Income <span className="text-red-500">*</span></label>
                  <input type="text" name="annual_income" value={formdata.annual_income} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Other Source of Income</label>
                  <input type="text" name="other_income" value={formdata.other_income} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>
            </section>

            <hr className="border-gray-200 mt-8 mb-4" />

            
            <div className="flex flex-col gap-6">
              <label className="flex items-center text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" required className="w-4 h-4 mr-3 text-green-600 border-gray-300 rounded focus:ring-green-500" />
                I hereby declare that the answers given are true and correct.
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