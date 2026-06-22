import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { Wallet, Landmark } from 'lucide-react';

const Conso_Choice = () => {
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

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC]">

      {/* Header (Reverted to original colors and sizes) */}
      <header className="w-full bg-[#E9F7DE] h-16 md:h-20 shadow-sm border-b border-[#D5EDB9] flex justify-between items-center px-4 md:px-6">
        <div className="flex flex-row items-center gap-3">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-10 md:h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xs md:text-sm font-bold text-[#66B538] leading-tight">
              Tubungan Teacher's Multi‑Purpose Cooperative
            </h1>
            <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
          </div>
        </div>
      </header>

    
      <main className="flex flex-col justify-center items-center flex-grow py-10 px-4 text-center">
        
        
        <div className="mb-8 flex flex-col items-center">
          <img src="/img/ttmpc logo.png" className="w-auto h-20 md:h-24 mb-4 drop-shadow-sm" alt="Kiosk Logo" />
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
            Consolidated Loan Application
          </h2>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">
            Preferred Loan Amount
          </h1>
          <p className="mt-3 text-gray-500 text-sm md:text-base font-medium max-w-md">
            Choose the loan range that fits your needs to get started with the right application.
          </p>
        </div>

      
        <div className="flex flex-col sm:flex-row gap-6 mt-2 w-full max-w-2xl justify-center items-stretch px-4">
          
          
          <Link
            to="/Consolidated_Loan"
            className="bg-white p-8 w-full sm:w-64 rounded-3xl flex flex-col items-center justify-center cursor-pointer shadow-sm border border-gray-200 "
          >
            <div className="bg-blue-50 p-5 rounded-2xl mb-6 ">
              <Wallet size={40} className="text-blue-600" strokeWidth={2} />
            </div>
            <h3 className="font-extrabold text-gray-900 text-2xl md:text-3xl mb-1">≤ 500k</h3>
            <p className="text-xs text-gray-500 font-medium mt-1">Up to ₱500,000</p>
          </Link>

          
          <Link
            to="/Consolidated_Up"
            className="bg-white p-8 w-full sm:w-64 rounded-3xl flex flex-col items-center justify-center cursor-pointer shadow-sm border border-gray-200 "
          >
            <div className="bg-indigo-50 p-5 rounded-2xl mb-6 ">
              <Landmark size={40} className="text-indigo-600" strokeWidth={2} />
            </div>
            <h3 className="font-extrabold text-gray-900 text-2xl md:text-3xl mb-1">&gt; 500k</h3>
            <p className="text-xs text-gray-500 font-medium mt-1">Above ₱500,000</p>
          </Link>

        </div>
      </main>
    </div>
  );
};

export default Conso_Choice;