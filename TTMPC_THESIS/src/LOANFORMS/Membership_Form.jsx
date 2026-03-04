import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

function Membership_Form() {
  const navigate = useNavigate();

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

          <form className="space-y-8">
          
            
            <section>
              <h3 className="text-sm font-bold text-slate-700 uppercase mb-4">Personal Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Surname <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">First Name <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Middle Name</label>
                  <input type="text" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Gender <span className="text-red-500">*</span></label>
                  <div className="flex items-center gap-4 mt-1">
                    <label className="flex items-center text-sm text-gray-700 cursor-pointer">
                      <input type="radio" name="gender" className="mr-2 text-green-500 focus:ring-green-500" /> Male
                    </label>
                    <label className="flex items-center text-sm text-gray-700 cursor-pointer">
                      <input type="radio" name="gender" className="mr-2 text-green-500 focus:ring-green-500" /> Female
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Civil Status <span className="text-red-500">*</span></label>
                  <select className="w-full border border-gray-300 rounded-md p-2.5 text-sm text-gray-500 focus:ring-1 focus:ring-green-500 outline-none">
                    <option>-- Select Civil Status --</option>
                    <option>Single</option>
                    <option>Married</option>
                    <option>Widowed</option>
                    <option>Legally Separated</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Date of Birth <span className="text-red-500">*</span></label>
                  <input type="date" className="w-full border border-gray-300 rounded-md p-2.5 text-sm text-gray-500 focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Age <span className="text-red-500">*</span></label>
                  <input type="number" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Place of Birth <span className="text-red-500">*</span></label>
                  <input type="text" placeholder="Place of Birth" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Citizenship <span className="text-red-500">*</span></label>
                  <input type="text" placeholder="Citizenship" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Religion <span className="text-red-500">*</span></label>
                  <select className="w-full border border-gray-300 rounded-md p-2.5 text-sm text-gray-500 focus:ring-1 focus:ring-green-500 outline-none">
                    <option>-- Select Religion --</option>
                    <option>Roman Catholic</option>
                    <option>Christian</option>
                    <option>Iglesia ni Cristo</option>
                    <option>Islam</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Height <span className="text-red-500">*</span></label>
                  <input type="text" placeholder="Height (cm)" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Weight <span className="text-red-500">*</span></label>
                  <input type="text" placeholder="Weight (kg)" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Blood Type <span className="text-red-500">*</span></label>
                  <select className="w-full border border-gray-300 rounded-md p-2.5 text-sm text-gray-500 focus:ring-1 focus:ring-green-500 outline-none">
                    <option>-- Select Blood Type --</option>
                    <option>A+</option>
                    <option>A-</option>
                    <option>B+</option>
                    <option>B-</option>
                    <option>AB+</option>
                    <option>AB-</option>
                    <option>O+</option>
                    <option>O-</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Taxpayer's Identification Number (TIN) <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>
            </section>

            
            <section>
              <h3 className="text-sm font-bold text-slate-700 uppercase mb-4">Family Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Maiden Name (if married)</label>
                  <input type="text" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Name of Spouse</label>
                  <input type="text" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Spouse's Occupation</label>
                  <input type="text" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Number of Dependents</label>
                  <input type="number" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>
            </section>

            
            <section>
              <h3 className="text-sm font-bold text-slate-700 uppercase mb-4">Contact & Address Details</h3>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Permanent Address <span className="text-red-500">*</span></label>
                <input type="text" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Contact Number <span className="text-red-500">*</span></label>
                  <input type="tel" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email Address</label>
                  <input type="email" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>
            </section>

            
            <section>
              <h3 className="text-sm font-bold text-slate-700 uppercase mb-4">Educational & Employment Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Educational Attainment <span className="text-red-500">*</span></label>
                  <select className="w-full border border-gray-300 rounded-md p-2.5 text-sm text-gray-500 focus:ring-1 focus:ring-green-500 outline-none">
                    <option>-- Select Educational Attainment --</option>
                    <option>High School</option>
                    <option>Vocational</option>
                    <option>College Undergraduate</option>
                    <option>College Graduate</option>
                    <option>Post Graduate</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Occupation / Income Source <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Position</label>
                  <input type="text" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Annual Income <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Other Source of Income</label>
                  <input type="text" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
              </div>
            </section>

            <hr className="border-gray-200 mt-8 mb-4" />

            
            <div className="flex flex-col gap-6">
              <label className="flex items-center text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 mr-3 text-green-600 border-gray-300 rounded focus:ring-green-500" />
                I hereby declare that the answers given are true and correct.
              </label>

              <div className="flex justify-end gap-4 mt-4">
                <Link to="/app.jsx" 
                  type="button" 
                  onClick={() => navigate(-1)}
                  className="bg-[#E9F7DE] text-[#5ca830] border border-[#A0D284] px-8 py-2.5 rounded-md font-bold text-sm hover:bg-[#d8f0c5] transition-colors"
                >
                  Back
                </Link>
                <Link to="/" 
                  type="submit" 
                  className="bg-[#66B538] text-white px-8 py-2.5 rounded-md font-bold text-sm hover:bg-[#5ca830] transition-colors shadow-sm"
                >
                  Register Now
                </Link>
              </div>
            </div>

          </form>
        </div>
      </main>
    </div>
  );
}

export default Membership_Form;