import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { CheckCircle2 } from 'lucide-react'; 

const Withdrawal_Success = () => {
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

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC]">
        {/* Header - Kept exactly as you had it */}
        <header className="w-full bg-[#E9F7DE] h-20 shadow-sm flex justify-between items-center px-6 border-b border-[#D5EDB9]">
            <div className="flex flex-row items-center gap-3">
              <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
              <div className="flex flex-col">
                <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
                <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
              </div>
            </div>
        </header>

        {/* Main Content - Success Card */}
        <main className='flex flex-col items-center justify-center flex-grow py-10 px-4'>
            
            <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center">
              
              {/* Success Icon */}
              <div className="w-20 h-20 bg-[#F0FDF4] rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-10 h-10 text-[#66B538]" strokeWidth={2.5} />
              </div>

              {/* Headings */}
              <h1 className="text-2xl font-extrabold text-[#1e293b] mb-2 tracking-tight">Transaction Successful</h1>
              <p className="text-[13px] text-slate-500 mb-8 font-medium">Your request has been processed securely.</p>

              {/* Details Box */}
              <div className="w-full bg-slate-50/80 rounded-xl px-5 py-2 mb-8 flex flex-col divide-y divide-slate-100/80">
                
                <div className="flex justify-between items-center py-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Transaction ID</span>
                  <span className="text-[13px] font-bold text-[#1e293b]">TTMPC-TID-123</span>
                </div>
                
                <div className="flex justify-between items-center py-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Member Name</span>
                  <span className="text-[13px] font-bold text-[#1e293b]">Romelyn Delos Reyes</span>
                </div>
                
                <div className="flex justify-between items-center py-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Transaction Type</span>
                  <span className="text-[13px] font-bold text-[#1e293b]">Cash Withdrawal</span>
                </div>
                
                <div className="flex justify-between items-center py-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount</span>
                  <span className="text-sm font-bold text-[#66B538]">₱ 1,500.00</span>
                </div>
                
                <div className="flex justify-between items-center py-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</span>
                  <span className="text-[13px] font-bold text-[#1e293b]">February 15, 2026</span>
                </div>

              </div>

             
              <div className="w-full flex flex-col gap-3">
                <Link 
                  to="/withdrawal" 
                  className="w-full flex items-center justify-center bg-[#66B538] hover:bg-[#5aa331] text-white font-bold text-sm py-3.5 px-4 rounded-xl transition-colors shadow-sm"
                >
                  Done
                </Link>
                <Link 
                  to="/Loan_Kiosk" 
                  className="w-full flex items-center justify-center bg-[#F1F5F9] hover:bg-[#e2e8f0] text-[#1e293b] font-bold text-sm py-3.5 px-4 rounded-xl transition-colors"
                >
                  Return to Home
                </Link>
              </div>

            </div>
        </main>
    </div>
  );
};

export default Withdrawal_Success;