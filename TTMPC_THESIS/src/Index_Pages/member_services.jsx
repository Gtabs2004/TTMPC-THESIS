import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { PiggyBank, Landmark, Receipt, LogOut } from 'lucide-react';

const Member_Services = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

  

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC]">
      
      {/* Standardized Header */}
      <header className="w-full bg-[#E9F7DE] h-20 shadow-sm border-b border-[#D5EDB9] flex justify-between items-center px-6">
        <div className="flex flex-row items-center gap-3">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
            <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
          </div>
        </div>
        
      
      </header>

      <main className="flex justify-center items-center flex-col flex-grow py-10 px-4 text-center">
        <img src="src/assets/img/ttmpc logo.png" className="w-auto h-32 mb-4" alt="Kiosk Logo" />
        <h1 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Loan Application Kiosk</h1>
        
        <p className="mt-2 text-2xl font-bold text-slate-800">Available Member Services</p>
        <p className="mt-2 text-slate-500 text-sm font-medium mb-10">Select a transaction type to proceed.</p>
        
        <div className="flex flex-col sm:flex-row gap-6 mt-4">
          
          {/* Savings Card */}
          <Link 
            to="/savings_services" 
            className="bg-white h-56 w-56 rounded-2xl flex flex-col items-center justify-center cursor-pointer shadow-sm border border-slate-100 hover:shadow-lg hover:border-[#A0D284] transition-all group"
          >
            <div className="bg-[#F0FDF4] p-5 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
              <PiggyBank size={40} className="text-[#66B538]" strokeWidth={2} />
            </div>
            <h1 className="font-bold text-slate-800 text-lg">Savings</h1>
          </Link>
          
          {/* Loans Card */}
          <Link 
            to="/loan_services" 
            className="bg-white h-56 w-56 rounded-2xl flex flex-col items-center justify-center cursor-pointer shadow-sm border border-slate-100 hover:shadow-lg hover:border-[#A0D284] transition-all group"
          >
            <div className="bg-[#F0FDF4] p-5 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
              <Landmark size={40} className="text-[#66B538]" strokeWidth={2} />
            </div>
            <h1 className="font-bold text-slate-800 text-lg">Loans</h1>
          </Link>
          
          {/* Payments Card */}
          <Link 
            to="/Bonus_Loan" 
            className="bg-white h-56 w-56 rounded-2xl flex flex-col items-center justify-center cursor-pointer shadow-sm border border-slate-100 hover:shadow-lg hover:border-[#A0D284] transition-all group"
          >
            <div className="bg-[#F0FDF4] p-5 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
              <Receipt size={40} className="text-[#66B538]" strokeWidth={2} />
            </div>
            <h1 className="font-bold text-slate-800 text-lg">Payments</h1>
          </Link>

        </div>
      </main>
    </div>
  );
}

export default Member_Services;