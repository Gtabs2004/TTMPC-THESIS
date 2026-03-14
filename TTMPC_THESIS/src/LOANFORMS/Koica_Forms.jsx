import React from 'react';

const Koica_Forms = () => {
  
  const inputStyles = "border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-[#66B538] outline-none w-full bg-white text-sm transition-all";
  const inlineInputStyles = "border border-gray-300 rounded-md px-3 py-1 focus:ring-2 focus:ring-[#66B538] outline-none bg-white text-sm transition-all inline-block mx-2";
  const labelStyles = "block text-xs font-bold text-gray-700 mb-1";
  
  
  const Label = ({ children }) => (
    <label className={labelStyles}>
      {children} <span className="text-red-500">*</span>
    </label>
  );

  return (
    <div className="flex flex-col min-h-screen bg-[#F8F9FA] pb-20">
      
      {/* Header */}
      <header className="w-full bg-[#f1fbe8] h-20 shadow-sm flex items-center px-6 border-b border-[#e5f4d8]">
        <div className="flex flex-row items-center gap-4">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-sm font-extrabold text-[#66B538] uppercase tracking-wide">Tubungan Teacher's Multi-Purpose Cooperative</h1>
            <p className="text-[#8bc766] text-xs font-medium">Loan Application Kiosk</p>
          </div>
        </div>
      </header>

      {/* Form Container */}
      <main className="max-w-5xl mx-auto w-full px-4 mt-12 space-y-8">
        
        {/* Title */}
        <h1 className="text-center text-2xl font-black text-[#235347] tracking-wider mb-8 uppercase">
          Agri-Bussiness Financial Facility Loan
        </h1>

        {/* Top Control Section */}
        <div className="bg-[#f8fcf5] rounded-xl p-6 border border-[#d2e8c4] flex flex-wrap items-center justify-between gap-6 shadow-sm">
          <div className="flex gap-8">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="radio" name="application_type" className="h-4 w-4 text-[#66B538] focus:ring-[#66B538]" />
              <span className="font-bold text-gray-700 text-sm">New</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="radio" name="application_type" className="h-4 w-4 text-[#66B538] focus:ring-[#66B538]" />
              <span className="font-bold text-gray-700 text-sm">Renewal</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-6">
            <div>
              <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Control No.</label>
              <input type="text" className="border border-gray-300 rounded-md px-3 py-1.5 w-48 focus:ring-2 focus:ring-[#66B538] outline-none" />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Date Applied</label>
              <input type="date" className="border border-gray-300 rounded-md px-3 py-1.5 w-48 focus:ring-2 focus:ring-[#66B538] outline-none" />
            </div>
          </div>
        </div>

        {/* SECTION 1: Borrower's Information */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-[#66B538] text-white px-5 py-3 flex items-center gap-3 font-bold uppercase tracking-wider text-sm">
            <span className="bg-white/30 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-black">1</span> 
            Borrower's Information
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Row 1 */}
            <div><Label>Surname</Label><input type="text" className={inputStyles} /></div>
            <div><Label>First Name</Label><input type="text" className={inputStyles} /></div>
            <div><Label>Middle Name</Label><input type="text" className={inputStyles} /></div>
            
            {/* Row 2 */}
            <div><Label>Contact No.</Label><input type="text" className={inputStyles} /></div>
            <div><Label>Monthly Income</Label><input type="text" className={inputStyles} placeholder="₱" /></div>
            <div><Label>Source of Income</Label><input type="text" className={inputStyles} /></div>

            {/* Row 3 - Full Width */}
            <div className="md:col-span-3">
              <Label>Residence Address</Label>
              <input type="text" className={inputStyles} />
            </div>

            {/* Row 4 */}
            <div><Label>Date of Birth</Label><input type="date" className={inputStyles} /></div>
            <div><Label>Age</Label><input type="number" className={inputStyles} /></div>
            <div>
              <Label>Civil Status</Label>
              <select className={inputStyles}>
                <option value="">Select Civil Status</option>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="widowed">Widowed</option>
                <option value="separated">Separated</option>
              </select>
            </div>

            {/* Row 5 */}
            <div>
              <Label>Gender</Label>
              <select className={inputStyles}>
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div><Label>TIN No.</Label><input type="text" className={inputStyles} /></div>
            <div><Label>GSIS/SSS No.</Label><input type="text" className={inputStyles} /></div>

            {/* Row 6 */}
            <div className="md:col-span-2">
              <Label>Name of Spouse</Label>
              <input type="text" className={inputStyles} />
            </div>
            <div>
              <Label>Spouse's Occupation</Label>
              <input type="text" className={inputStyles} />
            </div>
          </div>
        </section>

        {/* SECTION 2: Loan Agreement */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-[#66B538] text-white px-5 py-3 flex items-center gap-3 font-bold uppercase tracking-wider text-sm">
            <span className="bg-white/30 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-black">2</span> 
            Loan Agreement
          </div>
          
          <div className="p-6 text-sm text-gray-800 leading-loose">
            I hereby apply for a loan in the amount of 
            <input type="text" className={`${inlineInputStyles} w-48`} /> 
            Php 
            <input type="text" className={`${inlineInputStyles} w-48`} /> 
            for the purpose of 
            <input type="text" className={`${inlineInputStyles} w-64`} /> 
            for a term of 
            <select className={`${inlineInputStyles} w-32`}>
              <option value="">Select term</option>
              <option value="12">12</option>
              <option value="24">24</option>
              <option value="36">36</option>
            </select> 
            months with a monthly amortization of 
            <input type="text" className={`${inlineInputStyles} w-40`} /> 
            , which I promise to pay the amount to <span className="font-bold">Tubungan Teachers' Multi Purpose Cooperative (TTMPC)</span> in accordance with the terms and conditions as stipulated in the Promissory Note of which I certify to have read and understood clearly.
          </div>
        </section>

        {/* SECTION 3: Promissory Note */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-[#66B538] text-white px-5 py-3 flex items-center gap-3 font-bold uppercase tracking-wider text-sm">
            <span className="bg-white/30 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-black">3</span> 
            Promissory Note
          </div>
          
          <div className="p-6 text-sm text-gray-800 space-y-6">
            
          
            <div className="leading-loose">
              I <input type="text" className={`${inlineInputStyles} w-64`} /> 
              of legal age, single/married, with residence at: 
              <input type="text" className={`${inlineInputStyles} w-96`} /> 
              hereby acknowledge that I am indebted to the Tubungan Teachers' Multi-Purpose Cooperative (TTMPC), located at Teniente Benito, Tubungan, Iloilo, in the sum of 
              <input type="text" className={`${inlineInputStyles} w-48`} /> 
              Php 
              <input type="text" className={`${inlineInputStyles} w-48`} /> 
              representing my outstanding balance under the KOICA ABFF Loan Program, payable as follows:
            </div>

            
            <div className="leading-loose">
              1. Payment Terms: 
              <input type="text" className={`${inlineInputStyles} w-48`} /> 
              due on or before 
              <input type="text" className={`${inlineInputStyles} w-48`} />.
            </div>

            
            <p className="leading-relaxed">
              2. Mode of Payment. Payments shall be made through Ms. Minerva Barera, the official collector of the Tubungan Teachers' Multi-Purpose Cooperative, or directly at the Tubungan Teachers' Multi-Purpose Cooperative (TTMPC) office.
            </p>

            
            <div className="leading-relaxed">
              <p className="mb-2">
                3. Default and Remedies. In the event of my failure to pay any installment on the due dates stated above, the entire outstanding balance shall become immediately due and demandable. In case of default, I understand and agree that the Tubungan Teachers' Multi-Purpose Cooperative may pursue the following remedies:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li>Impose a penalty of 2% for every month of delay in payment.</li>
                <li>Initiate legal proceedings for the collection of the outstanding balance, including all legal fees, attorney's fees, and court costs, which I shall bear.</li>
              </ul>
            </div>

          
            <p className="leading-relaxed mt-6">
              I acknowledge and agree to the terms set forth in this promissory note. This document may be presented to the proper authorities or legal entities for processing and enforcement.
            </p>

        <button className="mt-6 bg-[#66B538] text-white px-4 py-2 rounded hover:bg-[#5aa12b] transition-colors text-sm float-right mb-4 mr-4 cursor-pointer ">
            Submit Application</button>
          </div>
        </section>
        
      </main>
    </div>
  );
};

export default Koica_Forms;