import React from 'react';

function Consolidated_Loan() {
  // Shared Styles (Same as your Bonus Loan)
  const inputStyles = "border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-[#66B538] outline-none w-full bg-white text-sm transition-all";
  const labelStyles = "block text-xs font-bold text-gray-700 mb-1";
  const sectionHeader = "bg-[#66B538] text-white px-4 py-2 rounded-t-lg flex items-center gap-2 font-bold uppercase tracking-wide";

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 pb-20">
       {/* Header */}
       <header className="w-full bg-[#E9F7DE] h-20 shadow-lg flex text-col px-6">
        <div className="flex flex-row items-center gap-4">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
            <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
          </div>
        </div>
      </header>

      {/* Title & Status Bar */}
      <section className="grid gap-8 px-4">
        <h1 className="text-center text-2xl font-bold mt-12 text-[#66B538]">CONSOLIDATED LOAN APPLICATION</h1>
        <div className="max-w-6xl mx-auto w-full">
          <div className="bg-[#EEF6F1] rounded-xl p-6 border-2 border-[#66B538] flex flex-wrap items-center justify-between gap-6">
            <div className="flex gap-8">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" name="status" className="h-4 w-4 accent-[#66B538]" />
                <span className="font-semibold text-gray-700">New</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" name="status" className="h-4 w-4 accent-[#66B538]" />
                <span className="font-semibold text-gray-700">Renewal</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500">Control No.</label>
                <input type="text" className="border border-gray-300 rounded px-3 py-1.5 w-48" />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500">Date Applied</label>
                <input type="date" className="border border-gray-300 rounded px-3 py-1.5 w-48" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==========================================
          SECTION 1: BORROWER'S INFORMATION
      ========================================== */}
      <div className="mt-10 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
        <div className={sectionHeader}>
          <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
          BORROWER'S INFORMATION
        </div>

        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Row 1 */}
          <div><label className={labelStyles}>Surname <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>
          <div><label className={labelStyles}>First Name <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>
          <div><label className={labelStyles}>Middle Name</label><input type="text" className={inputStyles} /></div>

          {/* Row 2 */}
          <div><label className={labelStyles}>Contact No. <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>
          <div>
            <label className={labelStyles}>Latest Net Pay <span className="text-red-500">*</span></label>
            <div className="relative"><span className="absolute left-3 top-2 text-gray-400 text-xs">₱</span><input type="number" className={`${inputStyles} pl-7`} /></div>
          </div>
          <div>
            <label className={labelStyles}>Share Capital <span className="text-red-500">*</span></label>
            <div className="relative"><span className="absolute left-3 top-2 text-gray-400 text-xs">₱</span><input type="number" className={`${inputStyles} pl-7`} /></div>
          </div>

          {/* Row 3 */}
          <div className="md:col-span-3"><label className={labelStyles}>Residence Address <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>

          {/* Row 4 */}
          <div><label className={labelStyles}>Date of Birth <span className="text-red-500">*</span></label><input type="date" className={inputStyles} /></div>
          <div><label className={labelStyles}>Age <span className="text-red-500">*</span></label><input type="number" className={inputStyles} /></div>
          <div>
            <label className={labelStyles}>Civil Status <span className="text-red-500">*</span></label>
            <select className={inputStyles}><option>Select Status</option><option>Single</option><option>Married</option><option>Widowed</option></select>
          </div>

          {/* Row 5 */}
          <div>
            <label className={labelStyles}>Gender <span className="text-red-500">*</span></label>
            <select className={inputStyles}><option>Select Gender</option><option>Male</option><option>Female</option></select>
          </div>
          <div><label className={labelStyles}>TIN No. <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>
          <div><label className={labelStyles}>GSIS/SSS No. <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>

          {/* Row 6 */}
          <div className="md:col-span-2"><label className={labelStyles}>Employer's Name <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>
          <div className="md:col-span-1"><label className={labelStyles}>Office Address <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>

          {/* Row 7 */}
          <div className="md:col-span-2"><label className={labelStyles}>Name of Spouse <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>
          <div className="md:col-span-1"><label className={labelStyles}>Spouse's Occupation <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>
        </div>
      </div>

      {/* ==========================================
          SECTION 2: LOAN AGREEMENT
      ========================================== */}
      <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
        <div className={sectionHeader}>
          <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
          LOAN AGREEMENT
        </div>
        <div className="p-8 text-sm text-gray-800 leading-relaxed">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span>I hereby apply for a loan in the amount of</span>
            <input type="text" className={`${inputStyles} flex-grow md:w-64`} placeholder="Amount in words" />
            <div className="relative w-40"><span className="absolute left-3 top-2 text-gray-400 text-xs">Php</span><input type="number" className={`${inputStyles} pl-10`} /></div>
            <span>for the purpose of</span>
            <input type="text" className={`${inputStyles} flex-grow md:w-64`} />
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <span>for a term of</span>
            <select className={`${inputStyles} w-32`}><option>Select</option><option>12</option><option>24</option><option>36</option></select>
            <span>months with a monthly amortization of</span>
            <input type="number" className={`${inputStyles} w-48`} />
            <span>, which I promise to pay to <strong>Tubungan Teachers' MPC</strong>.</span>
          </div>
        </div>
      </div>

      {/* ==========================================
          SECTION 3: LOAN CONTRACT
      ========================================== */}
      <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
        <div className={sectionHeader}>
          <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
          LOAN CONTRACT
        </div>
        <div className="p-8 text-sm text-gray-800">
          <div className="flex flex-wrap items-center gap-3 mb-6 leading-loose">
            <span>I,</span>
            <input type="text" className={`${inputStyles} flex-grow md:max-w-xs`} placeholder="Name of Borrower" />
            <span>promise to pay <strong>Tubungan Teachers' Multi-Purpose Cooperative (TTMPC)</strong> the amount of</span>
            <input type="text" className={`${inputStyles} flex-grow md:max-w-xs`} placeholder="Amount in words" />
            <div className="relative w-40"><span className="absolute left-3 top-2 text-gray-400 text-xs">Php</span><input type="number" className={`${inputStyles} pl-10`} /></div>
            <span>from my</span>
            <input type="text" className={`${inputStyles} w-48`} placeholder="Source of Income" />
            <span>to begin on</span>
            <input type="date" className={`${inputStyles} w-40`} />
            <span>until the loan is fully paid.</span>
          </div>

          <p className="text-gray-700 italic text-xs mb-6 text-justify">
            I hereby agree that should I resign or be terminated from my employment with the DepEd/LGU/Private Agencies/Office, the outstanding balance of my loan shall be paid through (1) deduction from share capital (2) by my co-makers (3) retirement/separation pay/benefits.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div><label className={labelStyles}>Public Officer's Name/ID <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>
            <div><label className={labelStyles}>ID Number <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>
          </div>
        </div>
      </div>

      {/* ==========================================
          SECTION 4: BORROWER'S ADDITIONAL INFO
      ========================================== */}
      <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
        <div className={sectionHeader}>
          <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
          BORROWER'S ADDITIONAL INFORMATION
        </div>
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div><label className={labelStyles}>Email Address <span className="text-red-500">*</span></label><input type="email" className={inputStyles} /></div>
          <div><label className={labelStyles}>Mobile / Tel No. <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>
          <div className="md:col-span-2"><label className={labelStyles}>Residence Address <span className="text-red-500">*</span></label><input type="text" className={inputStyles} /></div>
        </div>
      </div>

      {/* ==========================================
          SECTION 5: CO-MAKER'S OATH
      ========================================== */}
      <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden max-w-6xl mx-auto w-full">
        <div className={sectionHeader}>
          <span className="bg-white text-[#66B538] rounded-full w-6 h-6 flex items-center justify-center text-sm">5</span>
          CO-MAKER'S OATH
        </div>
        <div className="p-8 text-sm text-gray-800">
           {/* Intro Sentence */}
           <div className="flex flex-wrap items-center gap-3 mb-6">
            <span>We</span>
            <input type="text" className={`${inputStyles} w-48`} placeholder="Co-Maker 1 Name" />
            <span>and</span>
            <input type="text" className={`${inputStyles} w-48`} placeholder="Co-Maker 2 Name" />
            <span>the co-makers of</span>
            <input type="text" className={`${inputStyles} flex-grow md:max-w-xs`} placeholder="Borrower Name" />
          </div>
          <p className="text-gray-700 italic text-xs mb-8 text-justify">
            hereby voluntarily and willingly bind ourselves as joint and severally liable to the Tubungan Teachers' Multi-Purpose Cooperative (TTMPC) for the loan amount mentioned in this loan application. We undertake to pay to the cooperative the amount of the loan + interest + damages should the borrower fail to pay.
          </p>

          {/* Co-Maker 1 Details */}
          <h3 className="font-bold text-[#66B538] mb-4 uppercase tracking-wide border-b border-gray-200 pb-2">Co-Maker 1</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div><label className={labelStyles}>Name / Govt. Issued ID</label><input type="text" className={inputStyles} /></div>
            <div><label className={labelStyles}>ID Number</label><input type="text" className={inputStyles} /></div>
            <div><label className={labelStyles}>Residence Address</label><input type="text" className={inputStyles} /></div>
            <div><label className={labelStyles}>Email Address</label><input type="text" className={inputStyles} /></div>
            <div><label className={labelStyles}>Mobile No.</label><input type="text" className={inputStyles} /></div>
          </div>

          {/* Co-Maker 2 Details */}
          <h3 className="font-bold text-[#66B538] mb-4 uppercase tracking-wide border-b border-gray-200 pb-2">Co-Maker 2</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div><label className={labelStyles}>Name / Govt. Issued ID</label><input type="text" className={inputStyles} /></div>
            <div><label className={labelStyles}>ID Number</label><input type="text" className={inputStyles} /></div>
            <div><label className={labelStyles}>Residence Address</label><input type="text" className={inputStyles} /></div>
            <div><label className={labelStyles}>Email Address</label><input type="text" className={inputStyles} /></div>
            <div><label className={labelStyles}>Mobile No.</label><input type="text" className={inputStyles} /></div>
          </div>
        </div>
      </div>

    </div>
  );
}

export default Consolidated_Loan;