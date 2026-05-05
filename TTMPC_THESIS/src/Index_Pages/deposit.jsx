import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { CheckCircle2, XCircle } from 'lucide-react'; // Added icons for the buttons

const Withdrawal = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();      
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };                                      

  return(
    <div className="flex flex-col min-h-screen bg-[#F8FAFC]">
     
        <header className="w-full bg-[#E9F7DE] h-20 shadow-sm flex justify-between items-center px-6 border-b border-[#D5EDB9]">
            <div className="flex flex-row items-center gap-3">
              <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
              <div className="flex flex-col">
                <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
                <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
              </div>
            </div>
        </header>

      
        <main className='flex flex-col items-center flex-grow py-10 px-4'>
            
           
            <div className="w-full max-w-2xl">
              
              {/* Titles */}
              <div className='mb-6'>
                <h1 className="text-2xl font-bold text-slate-800 mb-1">Regular Savings Deposit</h1>
                <p className="text-xs text-slate-400 font-medium">Transaction Details</p>
              </div>

              {/* Form Card */}
              <div className='bg-white p-8 rounded-xl shadow-sm border border-slate-100'>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-5'>
                  
                  {/* Member ID (Read-only styling) */}
                  <div className='flex flex-col'>
                    <label className='text-[11px] font-semibold text-slate-500 mb-1.5'>Member ID</label>
                    <input 
                      type="text" 
                      
                      className='bg-slate-50 border-none text-slate-700 text-sm p-3 rounded-lg w-full focus:outline-none'
                    />
                  </div>

                 
                  <div className='flex flex-col'>
                    <label className='text-[11px] font-semibold text-slate-500 mb-1.5'>Name</label>
                    <input 
                      type="text" 
                      
                      className='bg-slate-50 border-none text-slate-700 text-sm p-3 rounded-lg w-full focus:outline-none'
                    />
                  </div>
               
                  <div className='flex flex-col'>
                    <label className='text-[11px] font-semibold text-slate-500 mb-1.5'>Savings Type</label>
                    <input 
                      type="text" 
                      
                      className='bg-slate-50 border-none text-slate-700 text-sm p-3 rounded-lg w-full focus:outline-none'
                    />
                  </div>

                  
                  <div className='flex flex-col'>
                    <label className='text-[11px] font-semibold text-slate-500 mb-1.5'>Date</label>
                    <input 
                      type="date" 
                      className='bg-slate-50 border-none text-[#236829] font-bold text-sm p-3 rounded-lg w-full focus:outline-none'
                    />
                  </div>

                  
                  <div className='flex flex-col sm:col-span-2 mt-2'>
                    <label className='text-[11px] font-semibold text-slate-800 mb-1.5'>Deposit Amount [₱]</label>
                    <input 
                      type="number" 
                      placeholder="0.00"
                      className='bg-white border border-slate-200 text-slate-800 text-sm p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-[#66B538] focus:border-transparent transition-all'
                    />
                  </div>

                  
                  <div className='flex flex-col sm:col-span-2'>
                    <label className='text-[11px] font-semibold text-slate-800 mb-1.5'>Reference Number[Optional]</label>
                    <input
            
                      rows="3"
                      className='bg-white border border-slate-200 text-slate-800 text-sm  rounded-lg p-4
                      w-full resize-none focus:outline-none focus:ring-2 focus:ring-[#66B538] focus:border-transparent transition-all'
                    ></input>
                  </div>
                </div>
              </div>

          
              <div className='flex flex-col sm:flex-row gap-4 mt-6'>
                <Link to="/deposit_success" className='flex-1 flex items-center justify-center gap-2 bg-[#66B538] hover:bg-[#5aa331] text-white font-medium text-sm py-3 px-4 rounded-lg transition-colors cursor-pointer shadow-sm'>
                  <CheckCircle2 className="w-4 h-4" /> Confirm Deposit
                </Link>
                <Link to="/" className='flex-1 flex items-center justify-center gap-2 bg-[#E2E8F0] hover:bg-[#cbd5e1] text-slate-600 font-medium text-sm py-3 px-4 rounded-lg transition-colors cursor-pointer shadow-sm'>
                  <XCircle className="w-4 h-4" /> Cancel
                </Link>
              </div>

            </div>
        </main>
    </div>
  );
};

export default Withdrawal;