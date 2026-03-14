import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { Banknote, PiggyBank, LogOut } from 'lucide-react'; // Swapped icons to match the actions

const RegularSavings_Services = () => {
  const { session, signOut } = UserAuth();
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
    <div className="flex flex-col min-h-screen bg-gray-100">
        {/* Header */}
        <header className="w-full bg-[#E9F7DE] h-20 shadow-sm border-b border-[#D5EDB9] flex justify-between items-center px-6">
            <div className="flex flex-row items-center gap-3">
              <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
              <div className="flex flex-col">
                <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
                <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
              </div>
            </div>
            
            {/* Kept the Sign Out functionality available here just in case */}
            <button 
              onClick={handleSignOut} 
              className="flex items-center gap-2 text-slate-600 hover:text-red-600 font-bold transition-colors"
            >
              <span className="text-sm">Sign Out</span>
              <LogOut size={20} strokeWidth={2.5} />
            </button>
        </header>

      <main className="flex justify-center items-center flex-col flex-grow py-10">
        <img src="src/assets/img/ttmpc logo.png" className="w-auto h-32 mb-4" alt="Kiosk Logo"/>
        <h1 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Loan Application Kiosk</h1>
        
        <p className="mt-2 text-2xl font-bold text-slate-800">Regular Savings Services</p>
        
        <div className="flex flex-col sm:flex-row gap-6 mt-10">
            
            {/* Withdrawal Card */}
            <Link 
              to="/withdrawal" 
              className="bg-white h-56 w-56 rounded-2xl flex flex-col items-center justify-center cursor-pointer shadow-sm border border-slate-100 hover:shadow-lg hover:border-[#A0D284] transition-all group"
            >
                <div className="bg-[#F0FDF4] p-5 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Banknote size={40} className="text-[#66B538]" strokeWidth={2} />
                </div>
                <h1 className="font-bold text-slate-800 text-lg">Withdrawal</h1>
            </Link>
            
            {/* Deposit Card */}
            <Link 
              to="/deposit" 
              className="bg-white h-56 w-56 rounded-2xl flex flex-col items-center justify-center cursor-pointer shadow-sm border border-slate-100 hover:shadow-lg hover:border-[#A0D284] transition-all group"
            >
                <div className="bg-[#F0FDF4] p-5 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
                  <PiggyBank size={40} className="text-[#66B538]" strokeWidth={2} />
                </div>
                <h1 className="font-bold text-slate-800 text-lg">Deposit</h1>
            </Link>

        </div>
      </main>
    </div>
  )
} 

export default RegularSavings_Services;